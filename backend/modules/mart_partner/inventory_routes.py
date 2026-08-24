"""Partner Inventory routes — Phase 2 of the MASTER COMPLETION PROGRAM.

Provides:
  - Per-SKU inventory rows (available/reserved/damaged/expired + threshold)
  - Immutable stock movements ledger (never negative)
  - Product ↔ Bin location assignments
  - Stock-by-location report

All endpoints scoped to the authenticated partner + the primary warehouse.
Store isolation is enforced via `_assert_owns_warehouse` (already used by
warehouse hierarchy endpoints).
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    Partner,
    PartnerInventory,
    PartnerProduct,
    PartnerProductLocation,
    PartnerStockMovement,
    Warehouse,
    WarehouseAisle,
    WarehouseBin,
    WarehouseRack,
    WarehouseShelf,
    WarehouseZone,
    STOCK_MOVEMENT_KINDS,
)
from .routes import (
    get_current_partner,
    _assert_owns_warehouse,
    _primary_warehouse,
    require_role,
)


router = APIRouter(prefix="/partner/inventory", tags=["partner-inventory"])


# ============================================================================
#                              Serialisers
# ============================================================================

def _inv_dict(inv: PartnerInventory, product: Optional[PartnerProduct] = None, master_name: Optional[str] = None) -> dict:
    # Determine display name: for master-source products, prefer the passed-in master_name.
    display_name = "Unknown"
    display_brand = None
    display_unit = None
    display_image = None
    if product:
        if product.source == "master" and master_name:
            display_name = master_name
        elif product.name:
            display_name = product.name
        display_brand = product.brand
        display_unit  = product.unit
        display_image = product.image
    return {
        "id": inv.id,
        "partner_product_id": inv.partner_product_id,
        "warehouse_id": inv.warehouse_id,
        "available_qty": inv.available_qty,
        "reserved_qty": inv.reserved_qty,
        "damaged_qty": inv.damaged_qty,
        "expired_qty": inv.expired_qty,
        "low_stock_threshold": inv.low_stock_threshold,
        "last_movement_at": inv.last_movement_at.isoformat() if inv.last_movement_at else None,
        "product": {
            "name": display_name,
            "brand": display_brand,
            "unit": display_unit,
            "sku_code": product.sku_code if product else None,
            "image": display_image,
            "source": product.source if product else None,
        } if product else None,
        "low_stock": inv.available_qty <= inv.low_stock_threshold,
        "out_of_stock": inv.available_qty == 0,
    }


def _mv_dict(mv: PartnerStockMovement) -> dict:
    return {
        "id": mv.id,
        "partner_product_id": mv.partner_product_id,
        "warehouse_id": mv.warehouse_id,
        "bin_id": mv.bin_id,
        "kind": mv.kind,
        "delta_qty": mv.delta_qty,
        "balance_after": mv.balance_after,
        "reason": mv.reason,
        "reference": mv.reference,
        "actor_id": mv.actor_id,
        "actor_role": mv.actor_role,
        "order_id": mv.order_id,
        "created_at": mv.created_at.isoformat() if mv.created_at else None,
    }


def _ppl_dict(row: PartnerProductLocation, path: Optional[dict] = None) -> dict:
    return {
        "id": row.id,
        "partner_product_id": row.partner_product_id,
        "bin_id": row.bin_id,
        "quantity_at_location": row.quantity_at_location,
        "is_primary": row.is_primary,
        "path": path,  # {zone, aisle, rack, shelf, bin} human-readable
    }


async def _get_or_create_inventory(
    session: AsyncSession, partner: Partner, product: PartnerProduct, warehouse: Warehouse
) -> PartnerInventory:
    """Fetch inventory row for a SKU, creating it lazily with the current
    partner_product.stock_qty as opening balance."""
    inv = (await session.execute(
        select(PartnerInventory).where(
            PartnerInventory.partner_product_id == product.id,
            PartnerInventory.warehouse_id == warehouse.id,
        )
    )).scalar_one_or_none()
    if inv:
        return inv
    inv = PartnerInventory(
        partner_id=partner.id,
        partner_product_id=product.id,
        warehouse_id=warehouse.id,
        available_qty=int(product.stock_qty or 0),
        low_stock_threshold=int(product.low_stock_threshold or 5),
    )
    session.add(inv)
    if int(product.stock_qty or 0) > 0:
        opening = PartnerStockMovement(
            partner_id=partner.id,
            partner_product_id=product.id,
            warehouse_id=warehouse.id,
            kind="opening_stock",
            delta_qty=int(product.stock_qty or 0),
            balance_after=int(product.stock_qty or 0),
            reason="Auto-seeded from existing stock_qty",
        )
        session.add(opening)
    await session.commit()
    await session.refresh(inv)
    return inv


async def _build_bin_path(session: AsyncSession, bin_id: str) -> Optional[dict]:
    """Return the human-readable location path for a bin id."""
    b = await session.get(WarehouseBin, bin_id)
    if not b:
        return None
    s = await session.get(WarehouseShelf, b.shelf_id)
    r = await session.get(WarehouseRack, s.rack_id) if s else None
    a = await session.get(WarehouseAisle, r.aisle_id) if r else None
    z = await session.get(WarehouseZone, a.zone_id) if a else None
    return {
        "bin": {"id": b.id, "code": b.code, "name": b.name},
        "shelf": {"id": s.id, "code": s.code, "name": s.name} if s else None,
        "rack": {"id": r.id, "code": r.code, "name": r.name} if r else None,
        "aisle": {"id": a.id, "code": a.code, "name": a.name} if a else None,
        "zone": {"id": z.id, "code": z.code, "name": z.name} if z else None,
        "label": " · ".join(filter(None, [
            f"Zone {z.code}" if z else None,
            f"Aisle {a.code}" if a else None,
            f"Rack {r.code}" if r else None,
            f"Shelf {s.code}" if s else None,
            f"Bin {b.code}" if b else None,
        ])),
    }


# ============================================================================
#                           INVENTORY endpoints
# ============================================================================

@router.get("")
async def list_inventory(
    q: Optional[str] = None,
    low_only: bool = False,
    out_only: bool = False,
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """List inventory rows for the partner's primary warehouse. Lazily
    materialises rows from PartnerProduct.stock_qty on first read."""
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        return {"items": [], "summary": {"total": 0, "low": 0, "out_of_stock": 0, "total_available": 0, "total_reserved": 0}}

    # Ensure every active partner product has an inventory row.
    products = (await session.execute(
        select(PartnerProduct).where(PartnerProduct.partner_id == partner.id)
    )).scalars().all()
    prod_by_id = {p.id: p for p in products}
    existing = (await session.execute(
        select(PartnerInventory).where(
            PartnerInventory.partner_id == partner.id,
            PartnerInventory.warehouse_id == wh.id,
        )
    )).scalars().all()
    existing_ids = {i.partner_product_id for i in existing}
    for p in products:
        if p.id not in existing_ids:
            await _get_or_create_inventory(session, partner, p, wh)

    # Re-read after lazy inserts
    stmt = select(PartnerInventory).where(
        PartnerInventory.partner_id == partner.id,
        PartnerInventory.warehouse_id == wh.id,
    ).order_by(PartnerInventory.updated_at.desc())
    inv_rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    # Preload master names for source=master
    from core.models import MartProduct
    master_ids = list({p.master_product_id for p in products if p.master_product_id})
    master_names: dict[str, str] = {}
    if master_ids:
        mrows = (await session.execute(
            select(MartProduct).where(MartProduct.id.in_(master_ids))
        )).scalars().all()
        master_names = {m.id: m.name for m in mrows}

    items = []
    for inv in inv_rows:
        p = prod_by_id.get(inv.partner_product_id)
        mname = master_names.get(p.master_product_id) if (p and p.master_product_id) else None
        d = _inv_dict(inv, p, master_name=mname)
        # Optional filters
        if q and p:
            hay = " ".join([str(x or "") for x in (d["product"]["name"], p.brand, p.sku_code)]).lower()
            if q.lower() not in hay:
                continue
        if low_only and not d["low_stock"]:
            continue
        if out_only and not d["out_of_stock"]:
            continue
        items.append(d)

    # Summary
    total = await session.scalar(select(func.count(PartnerInventory.id)).where(
        PartnerInventory.partner_id == partner.id, PartnerInventory.warehouse_id == wh.id
    )) or 0
    all_rows = (await session.execute(
        select(PartnerInventory).where(
            PartnerInventory.partner_id == partner.id, PartnerInventory.warehouse_id == wh.id
        )
    )).scalars().all()
    low_count = sum(1 for i in all_rows if i.available_qty <= i.low_stock_threshold and i.available_qty > 0)
    out_count = sum(1 for i in all_rows if i.available_qty == 0)
    total_available = sum(i.available_qty for i in all_rows)
    total_reserved  = sum(i.reserved_qty  for i in all_rows)

    return {
        "items": items,
        "warehouse": {"id": wh.id, "code": wh.code, "name": wh.name},
        "summary": {
            "total": total,
            "low": low_count,
            "out_of_stock": out_count,
            "total_available": total_available,
            "total_reserved": total_reserved,
        },
    }


class AdjustIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(..., pattern=r"^(receive|adjustment_add|adjustment_remove|damage|expire|return_in)$")
    delta_qty: int = Field(..., gt=0, description="Absolute value; sign is set by kind")
    reason: Optional[str] = Field(None, max_length=1000)
    reference: Optional[str] = Field(None, max_length=200)
    bin_id: Optional[str] = None


_NEGATIVE_KINDS = {"adjustment_remove", "damage", "expire"}


@router.post("/{partner_product_id}/adjust", status_code=201,
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def adjust_inventory(
    partner_product_id: str, payload: AdjustIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Adjust stock and write a ledger entry. Never negative."""
    prod = await session.get(PartnerProduct, partner_product_id)
    if not prod or prod.partner_id != partner.id:
        raise HTTPException(404, "Product not found")
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        raise HTTPException(400, "Partner has no warehouse configured")
    inv = await _get_or_create_inventory(session, partner, prod, wh)

    signed = -payload.delta_qty if payload.kind in _NEGATIVE_KINDS else payload.delta_qty
    kind = payload.kind

    if kind in ("adjustment_remove", "damage", "expire") and inv.available_qty < payload.delta_qty:
        raise HTTPException(409, f"Cannot remove {payload.delta_qty} — only {inv.available_qty} available")

    # Apply
    if kind in ("receive", "adjustment_add", "return_in"):
        inv.available_qty += payload.delta_qty
    elif kind == "adjustment_remove":
        inv.available_qty -= payload.delta_qty
    elif kind == "damage":
        inv.available_qty -= payload.delta_qty
        inv.damaged_qty  += payload.delta_qty
    elif kind == "expire":
        inv.available_qty -= payload.delta_qty
        inv.expired_qty  += payload.delta_qty

    inv.last_movement_at = datetime.now(timezone.utc)

    # Keep partner_products.stock_qty in sync (legacy scalar consumed by
    # the customer-facing catalogue).
    prod.stock_qty = inv.available_qty

    mv = PartnerStockMovement(
        partner_id=partner.id,
        partner_product_id=prod.id,
        warehouse_id=wh.id,
        bin_id=payload.bin_id,
        kind=kind,
        delta_qty=signed,
        balance_after=inv.available_qty,
        reason=payload.reason,
        reference=payload.reference,
        actor_id=getattr(partner, "_staff_id", None) or partner.id,
        actor_role=getattr(partner, "_staff_role", "owner"),
    )
    session.add(mv)
    await session.commit()
    await session.refresh(inv)
    await session.refresh(mv)
    return {"inventory": _inv_dict(inv, prod), "movement": _mv_dict(mv)}


@router.get("/movements")
async def list_movements(
    partner_product_id: Optional[str] = None,
    kind: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PartnerStockMovement).where(PartnerStockMovement.partner_id == partner.id).order_by(PartnerStockMovement.created_at.desc())
    if partner_product_id:
        stmt = stmt.where(PartnerStockMovement.partner_product_id == partner_product_id)
    if kind:
        if kind not in STOCK_MOVEMENT_KINDS:
            raise HTTPException(400, "Invalid movement kind")
        stmt = stmt.where(PartnerStockMovement.kind == kind)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    total = await session.scalar(select(func.count(PartnerStockMovement.id)).where(PartnerStockMovement.partner_id == partner.id)) or 0
    return {"items": [_mv_dict(r) for r in rows], "total": total}


# ============================================================================
#                    PRODUCT ↔ BIN LOCATIONS
# ============================================================================

class LocationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bin_id: str
    quantity_at_location: int = Field(0, ge=0)
    is_primary: bool = False


class LocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity_at_location: Optional[int] = Field(None, ge=0)
    is_primary: Optional[bool] = None


@router.get("/locations/{partner_product_id}")
async def list_product_locations(
    partner_product_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    prod = await session.get(PartnerProduct, partner_product_id)
    if not prod or prod.partner_id != partner.id:
        raise HTTPException(404, "Product not found")
    rows = (await session.execute(
        select(PartnerProductLocation).where(PartnerProductLocation.partner_product_id == partner_product_id)
    )).scalars().all()
    out = []
    for r in rows:
        out.append(_ppl_dict(r, await _build_bin_path(session, r.bin_id)))
    return {"items": out}


@router.post("/locations/{partner_product_id}", status_code=201,
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def assign_location(
    partner_product_id: str, payload: LocationIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    prod = await session.get(PartnerProduct, partner_product_id)
    if not prod or prod.partner_id != partner.id:
        raise HTTPException(404, "Product not found")
    # Verify the bin belongs to the partner's warehouse tree
    b = await session.get(WarehouseBin, payload.bin_id)
    if not b:
        raise HTTPException(404, "Bin not found")
    shelf = await session.get(WarehouseShelf, b.shelf_id)
    rack  = await session.get(WarehouseRack,  shelf.rack_id) if shelf else None
    aisle = await session.get(WarehouseAisle, rack.aisle_id) if rack else None
    zone  = await session.get(WarehouseZone,  aisle.zone_id) if aisle else None
    if not (zone and (await _assert_owns_warehouse(session, partner, zone.warehouse_id))):
        raise HTTPException(403, "Bin does not belong to your warehouse")

    # If is_primary, clear existing primaries for this SKU
    if payload.is_primary:
        existing_primaries = (await session.execute(
            select(PartnerProductLocation).where(
                PartnerProductLocation.partner_product_id == partner_product_id,
                PartnerProductLocation.is_primary == True,  # noqa: E712
            )
        )).scalars().all()
        for ep in existing_primaries:
            ep.is_primary = False
        await session.flush()

    row = PartnerProductLocation(
        partner_product_id=partner_product_id,
        bin_id=payload.bin_id,
        quantity_at_location=payload.quantity_at_location,
        is_primary=payload.is_primary,
    )
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "This bin is already assigned to that product")
    await session.refresh(row)
    return _ppl_dict(row, await _build_bin_path(session, row.bin_id))


@router.patch("/locations/{location_id}",
              dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def update_location(
    location_id: str, payload: LocationUpdate,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerProductLocation, location_id)
    if not row:
        raise HTTPException(404, "Location assignment not found")
    prod = await session.get(PartnerProduct, row.partner_product_id)
    if not prod or prod.partner_id != partner.id:
        raise HTTPException(404, "Location assignment not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        # Demote other primaries
        others = (await session.execute(
            select(PartnerProductLocation).where(
                PartnerProductLocation.partner_product_id == row.partner_product_id,
                PartnerProductLocation.is_primary == True,  # noqa: E712
                PartnerProductLocation.id != row.id,
            )
        )).scalars().all()
        for o in others:
            o.is_primary = False
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return _ppl_dict(row, await _build_bin_path(session, row.bin_id))


@router.delete("/locations/{location_id}", status_code=204,
               dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def delete_location(
    location_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerProductLocation, location_id)
    if not row:
        raise HTTPException(404, "Location assignment not found")
    prod = await session.get(PartnerProduct, row.partner_product_id)
    if not prod or prod.partner_id != partner.id:
        raise HTTPException(404, "Location assignment not found")
    await session.delete(row)
    await session.commit()


# ============================================================================
#                    STOCK BY LOCATION REPORT
# ============================================================================

@router.get("/by-location")
async def stock_by_location(
    zone_id: Optional[str] = None,
    aisle_id: Optional[str] = None,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Return every SKU-location pairing, walking the whole warehouse tree.

    Result shape:
    {
      "warehouse": {...},
      "locations": [
        {"path": {...}, "products": [{partner_product_id, name, quantity, is_primary}, ...]},
        ...
      ]
    }
    """
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        return {"warehouse": None, "locations": []}

    zones = (await session.execute(
        select(WarehouseZone).where(WarehouseZone.warehouse_id == wh.id)
        .order_by(WarehouseZone.sort_order, WarehouseZone.code)
    )).scalars().all()
    if zone_id:
        zones = [z for z in zones if z.id == zone_id]
    z_ids = [z.id for z in zones]

    aisles = (await session.execute(
        select(WarehouseAisle).where(WarehouseAisle.zone_id.in_(z_ids))
    )).scalars().all() if z_ids else []
    if aisle_id:
        aisles = [a for a in aisles if a.id == aisle_id]
    a_ids = [a.id for a in aisles]

    racks = (await session.execute(
        select(WarehouseRack).where(WarehouseRack.aisle_id.in_(a_ids))
    )).scalars().all() if a_ids else []
    r_ids = [r.id for r in racks]

    shelves = (await session.execute(
        select(WarehouseShelf).where(WarehouseShelf.rack_id.in_(r_ids))
    )).scalars().all() if r_ids else []
    s_ids = [s.id for s in shelves]

    bins_ = (await session.execute(
        select(WarehouseBin).where(WarehouseBin.shelf_id.in_(s_ids))
    )).scalars().all() if s_ids else []
    b_ids = [b.id for b in bins_]

    ppl = (await session.execute(
        select(PartnerProductLocation).where(PartnerProductLocation.bin_id.in_(b_ids))
    )).scalars().all() if b_ids else []

    # Prefetch products for names
    prod_ids = list({p.partner_product_id for p in ppl})
    prods = (await session.execute(
        select(PartnerProduct).where(PartnerProduct.id.in_(prod_ids))
    )).scalars().all() if prod_ids else []
    prod_by_id = {p.id: p for p in prods}
    # Master names for source=master
    from core.models import MartProduct
    master_ids = list({p.master_product_id for p in prods if p.master_product_id})
    master_names: dict[str, str] = {}
    if master_ids:
        mrows = (await session.execute(select(MartProduct).where(MartProduct.id.in_(master_ids)))).scalars().all()
        master_names = {m.id: m.name for m in mrows}

    # Build maps
    zone_by_id = {z.id: z for z in zones}
    aisle_by_id = {a.id: a for a in aisles}
    rack_by_id = {r.id: r for r in racks}
    shelf_by_id = {s.id: s for s in shelves}
    bin_by_id = {b.id: b for b in bins_}

    location_index: dict[str, list[dict]] = {}
    for r in ppl:
        b = bin_by_id.get(r.bin_id)
        if not b:
            continue
        p = prod_by_id.get(r.partner_product_id)
        pname = "Unknown"
        if p:
            if p.source == "master" and p.master_product_id and p.master_product_id in master_names:
                pname = master_names[p.master_product_id]
            elif p.name:
                pname = p.name
        location_index.setdefault(r.bin_id, []).append({
            "partner_product_id": r.partner_product_id,
            "name": pname,
            "brand": p.brand if p else None,
            "unit": p.unit if p else None,
            "sku_code": p.sku_code if p else None,
            "image": p.image if p else None,
            "quantity_at_location": r.quantity_at_location,
            "is_primary": r.is_primary,
        })

    out = []
    for bin_id, prods_here in location_index.items():
        b = bin_by_id.get(bin_id)
        if not b:
            continue
        s = shelf_by_id.get(b.shelf_id)
        rk = rack_by_id.get(s.rack_id) if s else None
        a = aisle_by_id.get(rk.aisle_id) if rk else None
        z = zone_by_id.get(a.zone_id) if a else None
        out.append({
            "bin_id": bin_id,
            "path": {
                "zone":  {"id": z.id,  "code": z.code,  "name": z.name}  if z  else None,
                "aisle": {"id": a.id,  "code": a.code,  "name": a.name}  if a  else None,
                "rack":  {"id": rk.id, "code": rk.code, "name": rk.name} if rk else None,
                "shelf": {"id": s.id,  "code": s.code,  "name": s.name}  if s  else None,
                "bin":   {"id": b.id,  "code": b.code,  "name": b.name},
                "label": " · ".join(filter(None, [
                    f"Zone {z.code}"  if z  else None,
                    f"Aisle {a.code}" if a  else None,
                    f"Rack {rk.code}" if rk else None,
                    f"Shelf {s.code}" if s  else None,
                    f"Bin {b.code}"   if b  else None,
                ])),
            },
            "products": prods_here,
        })

    return {
        "warehouse": {"id": wh.id, "code": wh.code, "name": wh.name},
        "locations": out,
        "counts": {
            "zones":   len(zones),   "aisles":  len(aisles),
            "racks":   len(racks),   "shelves": len(shelves),
            "bins":    len(bins_),   "assignments": len(ppl),
        },
    }



# ============================================================================
#         Social.docx §4 — CATEGORY → default ZONE mapping per warehouse
# ============================================================================
from core.models import WarehouseCategoryDefault, MartCategory


class CategoryDefaultIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category_slug: str = Field(..., min_length=1, max_length=120)
    zone_id: Optional[str] = None       # null clears the mapping
    aisle_id: Optional[str] = None      # optional secondary hint


def _cat_default_dict(row: WarehouseCategoryDefault) -> dict:
    return {
        "id": row.id,
        "category_slug": row.category_slug,
        "zone_id": row.zone_id,
        "aisle_id": row.aisle_id,
    }


@router.get("/warehouse/{warehouse_id}/category-defaults")
async def list_category_defaults(
    warehouse_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Return every category in the partner's country alongside its currently
    mapped default zone/aisle (null when unmapped). Categories with no mapping
    row still appear so the UI can render one row per category."""
    wh = await _assert_owns_warehouse(session, partner, warehouse_id)
    cats = (await session.execute(
        select(MartCategory).where(
            MartCategory.country == wh.country,
            MartCategory.module == (partner.module or "mart"),
            MartCategory.deleted_at.is_(None),
        ).order_by(MartCategory.order)
    )).scalars().all()

    mappings = (await session.execute(
        select(WarehouseCategoryDefault).where(WarehouseCategoryDefault.warehouse_id == wh.id)
    )).scalars().all()
    by_slug = {m.category_slug: m for m in mappings}

    return {
        "warehouse_id": wh.id,
        "items": [
            {
                "category_slug": c.slug,
                "category_name": c.name or c.name_en or c.slug,
                "icon": c.icon,
                "mapping": _cat_default_dict(by_slug[c.slug]) if c.slug in by_slug else None,
            } for c in cats
        ],
    }


@router.put("/warehouse/{warehouse_id}/category-defaults",
            dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def upsert_category_default(
    warehouse_id: str, payload: CategoryDefaultIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Upsert a category → zone mapping. Pass zone_id=null to clear it.

    Validation: the zone (and optional aisle) must belong to this warehouse.
    """
    wh = await _assert_owns_warehouse(session, partner, warehouse_id)

    # Validate zone / aisle ownership if provided
    if payload.zone_id:
        z = await session.get(WarehouseZone, payload.zone_id)
        if not z or z.warehouse_id != wh.id:
            raise HTTPException(400, "Zone does not belong to this warehouse")
    if payload.aisle_id:
        a = await session.get(WarehouseAisle, payload.aisle_id)
        if not a:
            raise HTTPException(400, "Aisle not found")
        # Aisle must sit under the chosen zone (or under any zone in this wh if zone_id is None)
        if payload.zone_id and a.zone_id != payload.zone_id:
            raise HTTPException(400, "Aisle is not under the selected zone")
        parent_zone = await session.get(WarehouseZone, a.zone_id)
        if not parent_zone or parent_zone.warehouse_id != wh.id:
            raise HTTPException(400, "Aisle does not belong to this warehouse")

    existing = (await session.execute(
        select(WarehouseCategoryDefault).where(
            WarehouseCategoryDefault.warehouse_id == wh.id,
            WarehouseCategoryDefault.category_slug == payload.category_slug,
        )
    )).scalar_one_or_none()

    # Clearing: zone_id=None and aisle_id=None → delete the row if present
    if payload.zone_id is None and payload.aisle_id is None:
        if existing:
            await session.delete(existing)
            await session.commit()
        return {"mapping": None}

    if existing:
        existing.zone_id = payload.zone_id
        existing.aisle_id = payload.aisle_id
    else:
        existing = WarehouseCategoryDefault(
            warehouse_id=wh.id,
            category_slug=payload.category_slug,
            zone_id=payload.zone_id,
            aisle_id=payload.aisle_id,
        )
        session.add(existing)
    await session.commit()
    await session.refresh(existing)
    return {"mapping": _cat_default_dict(existing)}
