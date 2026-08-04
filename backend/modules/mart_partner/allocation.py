"""Inventory Allocation Engine (MARTbakēd Slice 8).

Given a customer cart + delivery address, decide which partner(s) will fulfil
each line so that:
  1. The customer sees ONE order, ONE invoice, ONE payment, ONE delivery.
  2. Internally, N `PartnerOrder` rows are created — one per allocated partner.
  3. Number of partners is minimised (consolidation-first heuristic).
  4. Distance to the delivery address is a tie-breaker.

MVP algorithm (greedy, deterministic, sub-millisecond for realistic carts):

    lines sorted by requested_qty DESC             ← rarest items first
    for line in lines:
        candidates = partners with:
            - matching country + module
            - is_active
            - a PartnerProduct for this master SKU
            - is_active on the SKU
            - stock_qty ≥ requested_qty
        if none:
            → mark unfulfillable, keep going so we can return the FULL
              list of gaps (not just the first).
            continue
        rank candidates by (already-in-plan DESC, distance_km ASC,
                            service_area_km DESC, stock_qty DESC)
        pick top → attach to plan, decrement stock in-memory.

Distance is haversine on lat/lng when available, else falls back to a
"same-city ⇒ 0km, different-city ⇒ 999km" step function. Everything runs
inside the checkout's implicit transaction — we `SELECT ... FOR UPDATE`
the partner_products rows so no two customers can double-book the last
unit on the shelf.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from math import radians, sin, cos, asin, sqrt
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import (
    MartProduct, Partner, PartnerProduct, Warehouse,
)


# ---------------------------------------------------------------------------
#                                Data classes
# ---------------------------------------------------------------------------

@dataclass
class AllocatedLine:
    master_product_id: str
    quantity: int
    partner_id: str
    partner_product_id: str
    unit_price: float            # partner's price (may differ from master)
    line_total: float
    currency: str
    # snapshot fields — carried through to OrderItem
    name: str
    brand: Optional[str]
    unit: Optional[str]
    image: Optional[str]


@dataclass
class UnfulfillableLine:
    master_product_id: str
    quantity_requested: int
    reason: str  # "out_of_stock" | "not_stocked_locally"
    stocked_by_count: int  # how many partners *would* stock but don't have enough qty


@dataclass
class PartnerSlice:
    partner_id: str
    partner_name: str
    warehouse_city: Optional[str]
    subtotal: float
    lines: list[AllocatedLine] = field(default_factory=list)


@dataclass
class AllocationPlan:
    fulfillable: bool
    slices: list[PartnerSlice] = field(default_factory=list)
    unfulfillable: list[UnfulfillableLine] = field(default_factory=list)
    subtotal: float = 0.0
    currency: str = "XOF"

    @property
    def partner_count(self) -> int:
        return len(self.slices)


# ---------------------------------------------------------------------------
#                                Distance
# ---------------------------------------------------------------------------

def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Great-circle distance in kilometres. Accurate to ~0.5% at CI latitudes."""
    lat1, lng1, lat2, lng2 = map(radians, (a_lat, a_lng, b_lat, b_lng))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def _distance_score(warehouse: Warehouse, delivery_lat: Optional[float],
                    delivery_lng: Optional[float], delivery_city: Optional[str]) -> float:
    """Lower is better. Returns km when both lat/lng pairs available; else a
    coarse same-city fallback."""
    if (warehouse.latitude and warehouse.longitude and delivery_lat and delivery_lng):
        return _haversine_km(
            float(warehouse.latitude), float(warehouse.longitude),
            float(delivery_lat), float(delivery_lng),
        )
    # Same-city step function — city match is virtually free (0 km), non-match penalised.
    if delivery_city and warehouse.city and warehouse.city.strip().lower() == delivery_city.strip().lower():
        return 0.0
    return 999.0


# ---------------------------------------------------------------------------
#                                 Engine
# ---------------------------------------------------------------------------

# One partner_product row per (master_product_id, partner_id) with stock, price, etc.
@dataclass
class _Candidate:
    partner: Partner
    warehouse: Optional[Warehouse]
    partner_product: PartnerProduct
    distance_km: float


async def allocate(
    session: AsyncSession,
    *,
    cart_lines: list[dict],   # [{"master_product_id": ..., "quantity": ...}]
    country: str,
    module: str = "mart",
    delivery_lat: Optional[float] = None,
    delivery_lng: Optional[float] = None,
    delivery_city: Optional[str] = None,
    lock_stock: bool = True,
) -> AllocationPlan:
    """Build the allocation plan. Set `lock_stock=True` when running inside a
    real checkout transaction so we `SELECT ... FOR UPDATE` on the picked rows."""
    if not cart_lines:
        return AllocationPlan(fulfillable=True)

    master_ids = list({ln["master_product_id"] for ln in cart_lines})
    master_rows = {
        m.id: m for m in (await session.execute(
            select(MartProduct).where(MartProduct.id.in_(master_ids))
        )).scalars().all()
    }
    if len(master_rows) != len(master_ids):
        missing = set(master_ids) - set(master_rows.keys())
        raise ValueError(f"Master products not found: {missing}")

    # Pull every PartnerProduct row that could serve ANY line, plus their partners
    # + primary warehouse for distance ranking. Single trip.
    stmt = (
        select(PartnerProduct, Partner, Warehouse)
        .join(Partner, Partner.id == PartnerProduct.partner_id)
        .join(Warehouse, Warehouse.partner_id == Partner.id, isouter=True)
        .where(
            PartnerProduct.master_product_id.in_(master_ids),
            PartnerProduct.is_active.is_(True),
            Partner.is_active.is_(True),
            Partner.country == country.upper(),
            Partner.module == module,
        )
    )
    if lock_stock:
        # Row-level lock ONLY on the PartnerProduct rows we might touch — Postgres
        # supports `FOR UPDATE OF <table>` scoped to a single join target.
        stmt = stmt.with_for_update(of=PartnerProduct)

    rows = (await session.execute(stmt)).all()

    # Index candidates by master_product_id → list of _Candidate
    by_master: dict[str, list[_Candidate]] = {}
    for pp, partner, warehouse in rows:
        dist = _distance_score(warehouse, delivery_lat, delivery_lng, delivery_city) if warehouse else 999.0
        by_master.setdefault(pp.master_product_id, []).append(
            _Candidate(partner=partner, warehouse=warehouse, partner_product=pp, distance_km=dist)
        )

    # Sort cart lines by rarest-first (fewest candidates → allocate first so we
    # don't paint ourselves into a corner with a rare item).
    lines_sorted = sorted(
        cart_lines,
        key=lambda ln: (
            len(by_master.get(ln["master_product_id"], [])),
            -int(ln["quantity"]),
        ),
    )

    plan_slices: dict[str, PartnerSlice] = {}   # partner_id → PartnerSlice
    unfulfillable: list[UnfulfillableLine] = []
    total_subtotal = 0.0
    currency = "XOF"

    for line in lines_sorted:
        master_id = line["master_product_id"]
        qty = int(line["quantity"])
        master = master_rows[master_id]
        currency = master.currency

        cands = by_master.get(master_id, [])
        # Filter to those with enough stock
        available = [c for c in cands if c.partner_product.stock_qty >= qty]
        if not available:
            unfulfillable.append(UnfulfillableLine(
                master_product_id=master_id,
                quantity_requested=qty,
                reason="out_of_stock" if cands else "not_stocked_locally",
                stocked_by_count=len(cands),
            ))
            continue

        # Rank: prefer partner already in plan (consolidation), then nearest,
        # then bigger service_area (more capable), then most stock.
        available.sort(key=lambda c: (
            0 if c.partner.id in plan_slices else 1,
            c.distance_km,
            -(c.warehouse.service_area_km if (c.warehouse and c.warehouse.service_area_km) else 0),
            -c.partner_product.stock_qty,
        ))
        pick = available[0]
        pp = pick.partner_product

        unit_price = float(pp.partner_price)
        line_total = unit_price * qty
        allocated = AllocatedLine(
            master_product_id=master_id,
            quantity=qty,
            partner_id=pick.partner.id,
            partner_product_id=pp.id,
            unit_price=unit_price,
            line_total=line_total,
            currency=pp.currency or currency,
            name=master.name,
            brand=master.brand,
            unit=master.unit,
            image=master.image,
        )

        # Attach to slice
        slice_ = plan_slices.get(pick.partner.id)
        if not slice_:
            slice_ = PartnerSlice(
                partner_id=pick.partner.id,
                partner_name=pick.partner.business_name,
                warehouse_city=pick.warehouse.city if pick.warehouse else None,
                subtotal=0.0,
            )
            plan_slices[pick.partner.id] = slice_
        slice_.lines.append(allocated)
        slice_.subtotal += line_total
        total_subtotal += line_total

        # In-memory stock decrement so subsequent picks in this same allocation
        # respect the newly-reduced quantity (matters when a partner has 2 units
        # of the same SKU and two cart lines both want 1).
        pp.stock_qty = pp.stock_qty - qty

    plan = AllocationPlan(
        fulfillable=len(unfulfillable) == 0,
        slices=list(plan_slices.values()),
        unfulfillable=unfulfillable,
        subtotal=round(total_subtotal, 2),
        currency=currency,
    )
    return plan


# ---------------------------------------------------------------------------
#                           Public helper for pricing
# ---------------------------------------------------------------------------

async def effective_partner_price(
    session: AsyncSession, master_product_ids: list[str], country: str, module: str = "mart",
) -> dict[str, dict]:
    """Return {master_product_id: {"partner_price": float, "partners_stocking": int}}
    for use by browse / cart endpoints. Uses the MIN partner_price across all
    active partners in the country with is_active SKU + stock > 0.

    Falls back to only-price-no-stock partners if none currently have stock, so
    the customer sees a realistic figure rather than reverting to the master
    RRP silently.
    """
    if not master_product_ids:
        return {}
    stmt = (
        select(
            PartnerProduct.master_product_id,
            PartnerProduct.partner_price,
            PartnerProduct.stock_qty,
        )
        .join(Partner, Partner.id == PartnerProduct.partner_id)
        .where(
            PartnerProduct.master_product_id.in_(master_product_ids),
            PartnerProduct.is_active.is_(True),
            Partner.is_active.is_(True),
            Partner.country == country.upper(),
            Partner.module == module,
        )
    )
    rows = (await session.execute(stmt)).all()

    grouped: dict[str, list[tuple[float, int]]] = {}
    for master_id, price, stock in rows:
        grouped.setdefault(master_id, []).append((float(price), int(stock)))

    out: dict[str, dict] = {}
    for master_id, offers in grouped.items():
        in_stock = [o for o in offers if o[1] > 0]
        chosen = in_stock if in_stock else offers
        min_price = min(o[0] for o in chosen)
        out[master_id] = {
            "partner_price": min_price,
            "partners_stocking": len(offers),
            "any_in_stock": bool(in_stock),
        }
    return out
