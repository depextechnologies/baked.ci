"""Super Admin — Replenishment Suggestions (Batch 3a).

Actionable restock queue built on top of the Low-Stock and Out-of-Stock
centres. Each suggestion targets a specific (partner, warehouse, SKU).

Lifecycle:
    suggested → approved → dispatched → received (or cancelled at any point)

`POST /admin/replenishments/auto-generate` scans PartnerInventory rows where
`available_qty <= low_stock_threshold` and creates one live suggestion per
SKU/warehouse (unique partial index prevents dupes).

`POST /admin/replenishments/{id}/mark-received` writes a `receive` movement,
increments PartnerInventory.available_qty, and (for MVP simplicity) also
keeps PartnerProduct.stock_qty in sync.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser,
    MartProduct,
    Partner,
    PartnerInventory,
    PartnerProduct,
    PartnerReplenishment,
    PartnerStockMovement,
    Warehouse,
)
from .routes import get_current_admin, _audit


router = APIRouter(prefix="/admin/replenishments", tags=["admin-replenishment"])


# ============================================================================
#                             Helpers / serialisers
# ============================================================================

def _replen_dict(r: PartnerReplenishment,
                 product: Optional[PartnerProduct],
                 warehouse: Optional[Warehouse],
                 partner: Optional[Partner],
                 master: Optional[MartProduct]) -> dict:
    display_name = None
    if product:
        display_name = product.name or (master.name if master else None)
    return {
        "id": r.id,
        "partner_id": r.partner_id,
        "warehouse_id": r.warehouse_id,
        "partner_product_id": r.partner_product_id,
        "current_qty": r.current_qty,
        "low_stock_threshold": r.low_stock_threshold,
        "suggested_qty": r.suggested_qty,
        "approved_qty":  r.approved_qty,
        "received_qty":  r.received_qty,
        "status": r.status,
        "source": r.source,
        "reason": r.reason,
        "notes":  r.notes,
        "created_by_admin_id": r.created_by_admin_id,
        "decided_by_admin_id": r.decided_by_admin_id,
        "movement_id": r.movement_id,
        "created_at":    r.created_at.isoformat()    if r.created_at    else None,
        "approved_at":   r.approved_at.isoformat()   if r.approved_at   else None,
        "dispatched_at": r.dispatched_at.isoformat() if r.dispatched_at else None,
        "received_at":   r.received_at.isoformat()   if r.received_at   else None,
        "product": {
            "name":  display_name or "Untitled",
            "brand": product.brand if product else None,
            "unit":  product.unit  if product else None,
            "sku_code": (product.sku_code if product else None) or (master.sku_code if master else None),
            "image": product.image if product else None,
        } if product else None,
        "warehouse": {
            "id": warehouse.id, "code": warehouse.code, "name": warehouse.name, "city": warehouse.city,
        } if warehouse else None,
        "partner": {
            "id": partner.id, "business_name": partner.business_name, "country": partner.country,
        } if partner else None,
    }


async def _hydrate(session: AsyncSession, rows: list[PartnerReplenishment]) -> list[dict]:
    if not rows:
        return []
    pp_ids = list({r.partner_product_id for r in rows})
    wh_ids = list({r.warehouse_id for r in rows})
    ptr_ids = list({r.partner_id for r in rows})
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(pp_ids)))).scalars().all()}
    whs   = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))).scalars().all()}
    ptns  = {p.id: p for p in (await session.execute(select(Partner).where(Partner.id.in_(ptr_ids)))).scalars().all()}
    master_ids = list({p.master_product_id for p in prods.values() if p.master_product_id})
    masters = {}
    if master_ids:
        masters = {m.id: m for m in (await session.execute(select(MartProduct).where(MartProduct.id.in_(master_ids)))).scalars().all()}
    out = []
    for r in rows:
        p = prods.get(r.partner_product_id)
        master = masters.get(p.master_product_id) if (p and p.master_product_id) else None
        out.append(_replen_dict(r, p, whs.get(r.warehouse_id), ptns.get(r.partner_id), master))
    return out


# ============================================================================
#                                LIST
# ============================================================================

@router.get("")
async def list_replenishments(
    status: Optional[str] = Query(None, description="suggested|approved|dispatched|received|cancelled"),
    country: Optional[str] = None,
    partner_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(PartnerReplenishment)
        .join(Partner, Partner.id == PartnerReplenishment.partner_id)
        .order_by(PartnerReplenishment.created_at.desc())
    )
    if status:       stmt = stmt.where(PartnerReplenishment.status == status)
    if country:      stmt = stmt.where(Partner.country == country.upper())
    if partner_id:   stmt = stmt.where(PartnerReplenishment.partner_id == partner_id)
    if warehouse_id: stmt = stmt.where(PartnerReplenishment.warehouse_id == warehouse_id)
    if q:
        pat = f"%{q}%"
        stmt = stmt.join(PartnerProduct, PartnerProduct.id == PartnerReplenishment.partner_product_id).where(or_(
            PartnerProduct.name.ilike(pat),
            PartnerProduct.brand.ilike(pat),
            PartnerProduct.sku_code.ilike(pat),
        ))
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    # Bucket counts (respect country filter if provided)
    buckets_stmt = (
        select(PartnerReplenishment.status, func.count(PartnerReplenishment.id))
        .join(Partner, Partner.id == PartnerReplenishment.partner_id)
        .group_by(PartnerReplenishment.status)
    )
    if country:
        buckets_stmt = buckets_stmt.where(Partner.country == country.upper())
    bucket_rows = (await session.execute(buckets_stmt)).all()
    buckets = {s: 0 for s in ("suggested", "approved", "dispatched", "received", "cancelled")}
    for s, c in bucket_rows:
        buckets[s] = c

    return {"items": await _hydrate(session, list(rows)), "buckets": buckets}


# ============================================================================
#                             AUTO-GENERATE
# ============================================================================

class AutoGenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    country: Optional[str] = None
    include_out_of_stock: bool = True
    multiplier: float = Field(3.0, ge=1.0, le=10.0,
                              description="Suggested qty = ceil(threshold × multiplier) − current_qty")


def _default_suggestion(current_qty: int, threshold: int, multiplier: float) -> int:
    """Simple heuristic: bring stock up to threshold × multiplier."""
    target = max(1, int(round(threshold * multiplier)))
    return max(1, target - current_qty)


@router.post("/auto-generate", status_code=201)
async def auto_generate(
    payload: AutoGenIn = AutoGenIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Scan every dark store for low/OOS SKUs and create one live suggestion each.

    Dedup rule: the unique partial index `uq_replen_live_per_sku` guarantees
    at most one active (`suggested/approved/dispatched`) row per SKU/warehouse.
    We short-circuit by pre-fetching existing live keys and skipping them.
    """
    # Fetch low-stock inventory
    stmt = (
        select(PartnerInventory, PartnerProduct, Warehouse, Partner)
        .join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
        .join(Warehouse, Warehouse.id == PartnerInventory.warehouse_id)
        .join(Partner, Partner.id == PartnerInventory.partner_id)
    )
    if payload.include_out_of_stock:
        stmt = stmt.where(PartnerInventory.available_qty <= PartnerInventory.low_stock_threshold)
    else:
        stmt = stmt.where(
            PartnerInventory.available_qty <= PartnerInventory.low_stock_threshold,
            PartnerInventory.available_qty > 0,
        )
    if payload.country:
        stmt = stmt.where(Partner.country == payload.country.upper())
    rows = (await session.execute(stmt)).all()

    # Pre-fetch existing live suggestions to avoid unique-constraint noise.
    live_rows = (await session.execute(
        select(PartnerReplenishment.partner_product_id, PartnerReplenishment.warehouse_id)
        .where(PartnerReplenishment.status.in_(["suggested", "approved", "dispatched"]))
    )).all()
    live_keys = {(pp, wh) for pp, wh in live_rows}

    created = 0
    skipped = 0
    for inv, pp, wh, partner in rows:
        key = (pp.id, wh.id)
        if key in live_keys:
            skipped += 1
            continue
        suggested = _default_suggestion(inv.available_qty, inv.low_stock_threshold, payload.multiplier)
        reason = "Out of stock" if inv.available_qty == 0 else "Below low-stock threshold"
        rec = PartnerReplenishment(
            partner_id=partner.id,
            warehouse_id=wh.id,
            partner_product_id=pp.id,
            current_qty=inv.available_qty,
            low_stock_threshold=inv.low_stock_threshold,
            suggested_qty=suggested,
            source="auto",
            reason=reason,
            created_by_admin_id=admin.id,
        )
        # SAVEPOINT so a unique-constraint clash only rolls back this row.
        sp = await session.begin_nested()
        try:
            session.add(rec)
            await session.flush()
            await sp.commit()
            live_keys.add(key)
            created += 1
        except Exception:
            await sp.rollback()
            skipped += 1
    await session.commit()
    await _audit(session, admin, "replenishment.auto_generate", None)
    return {"created": created, "skipped": skipped, "scanned": len(rows)}


# ============================================================================
#                          MANUAL CREATE / EDIT
# ============================================================================

class ReplenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    partner_product_id: str
    suggested_qty: int = Field(..., ge=1)
    reason: Optional[str] = None
    notes: Optional[str] = None


class ReplenUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggested_qty: Optional[int] = Field(None, ge=0)
    approved_qty: Optional[int]  = Field(None, ge=0)
    reason: Optional[str] = None
    notes: Optional[str] = None


@router.post("", status_code=201)
async def create_manual(
    payload: ReplenIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    pp = await session.get(PartnerProduct, payload.partner_product_id)
    if not pp:
        raise HTTPException(404, "Product not found")
    inv = (await session.execute(select(PartnerInventory).where(
        PartnerInventory.partner_product_id == pp.id
    ))).scalar_one_or_none()
    if not inv:
        raise HTTPException(400, "No inventory row exists for this product yet")
    row = PartnerReplenishment(
        partner_id=pp.partner_id,
        warehouse_id=inv.warehouse_id,
        partner_product_id=pp.id,
        current_qty=inv.available_qty,
        low_stock_threshold=inv.low_stock_threshold,
        suggested_qty=payload.suggested_qty,
        source="manual",
        reason=payload.reason,
        notes=payload.notes,
        created_by_admin_id=admin.id,
    )
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "There is already an active replenishment for this SKU/warehouse.")
    await session.refresh(row)
    await _audit(session, admin, "replenishment.create", row.id)
    hydrated = (await _hydrate(session, [row]))[0]
    return hydrated


@router.patch("/{rep_id}")
async def update_replen(
    rep_id: str, payload: ReplenUpdate,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerReplenishment, rep_id)
    if not row:
        raise HTTPException(404, "Replenishment not found")
    if row.status in ("received", "cancelled"):
        raise HTTPException(409, f"Cannot edit a {row.status} replenishment")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, "replenishment.update", rep_id)
    return (await _hydrate(session, [row]))[0]


# ============================================================================
#                            LIFECYCLE TRANSITIONS
# ============================================================================

class TransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approved_qty: Optional[int] = Field(None, ge=1, description="Optional override for approve")
    notes: Optional[str] = None


async def _transition(session: AsyncSession, admin: AdminUser, rep_id: str,
                      new_status: str, payload: TransitionIn) -> dict:
    row = await session.get(PartnerReplenishment, rep_id)
    if not row:
        raise HTTPException(404, "Replenishment not found")

    allowed = {
        "approved":  ("suggested",),
        "dispatched": ("approved",),
        "received":   ("approved", "dispatched"),
        "cancelled":  ("suggested", "approved", "dispatched"),
    }
    if row.status not in allowed.get(new_status, ()):
        raise HTTPException(409, f"Cannot go from {row.status} → {new_status}")

    now = datetime.now(timezone.utc)
    row.status = new_status
    if payload.notes:
        row.notes = (row.notes or "") + f"\n[{new_status}] {payload.notes}"

    if new_status == "approved":
        if payload.approved_qty is not None:
            row.approved_qty = payload.approved_qty
        elif row.approved_qty is None:
            row.approved_qty = row.suggested_qty
        row.approved_at = now
        row.decided_by_admin_id = admin.id

    elif new_status == "dispatched":
        row.dispatched_at = now

    elif new_status == "received":
        # Auto-write a `receive` movement and bump inventory.
        pp  = await session.get(PartnerProduct, row.partner_product_id)
        inv = (await session.execute(select(PartnerInventory).where(
            PartnerInventory.partner_product_id == pp.id,
            PartnerInventory.warehouse_id == row.warehouse_id,
        ))).scalar_one_or_none()
        if not inv:
            raise HTTPException(400, "No inventory row for this SKU/warehouse")
        delta = row.approved_qty or row.suggested_qty
        inv.available_qty  += delta
        inv.last_movement_at = now
        pp.stock_qty = inv.available_qty
        mv = PartnerStockMovement(
            partner_id=row.partner_id,
            partner_product_id=pp.id,
            warehouse_id=row.warehouse_id,
            kind="receive",
            delta_qty=delta,
            balance_after=inv.available_qty,
            reason=f"Replenishment received (auto)",
            reference=f"replenishment:{row.id}",
            actor_id=admin.id,
            actor_role="admin",
        )
        session.add(mv)
        await session.flush()
        row.received_qty = delta
        row.received_at  = now
        row.movement_id  = mv.id

    elif new_status == "cancelled":
        pass

    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, f"replenishment.{new_status}", rep_id)
    return (await _hydrate(session, [row]))[0]


@router.post("/{rep_id}/approve")
async def approve(rep_id: str, payload: TransitionIn = TransitionIn(),
                  admin: AdminUser = Depends(get_current_admin),
                  session: AsyncSession = Depends(get_session)):
    return await _transition(session, admin, rep_id, "approved", payload)


@router.post("/{rep_id}/dispatch")
async def dispatch(rep_id: str, payload: TransitionIn = TransitionIn(),
                   admin: AdminUser = Depends(get_current_admin),
                   session: AsyncSession = Depends(get_session)):
    return await _transition(session, admin, rep_id, "dispatched", payload)


@router.post("/{rep_id}/mark-received")
async def mark_received(rep_id: str, payload: TransitionIn = TransitionIn(),
                        admin: AdminUser = Depends(get_current_admin),
                        session: AsyncSession = Depends(get_session)):
    return await _transition(session, admin, rep_id, "received", payload)


@router.post("/{rep_id}/cancel")
async def cancel(rep_id: str, payload: TransitionIn = TransitionIn(),
                 admin: AdminUser = Depends(get_current_admin),
                 session: AsyncSession = Depends(get_session)):
    return await _transition(session, admin, rep_id, "cancelled", payload)


# ============================================================================
#                    Convenience: quick-add from Low/OOS centre
# ============================================================================

class QuickAddIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    partner_product_id: str
    warehouse_id: str
    suggested_qty: Optional[int] = None


@router.post("/quick-add", status_code=201)
async def quick_add(
    payload: QuickAddIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """One-click enqueue from a Low-Stock or Out-of-Stock centre row."""
    inv = (await session.execute(select(PartnerInventory).where(
        PartnerInventory.partner_product_id == payload.partner_product_id,
        PartnerInventory.warehouse_id == payload.warehouse_id,
    ))).scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Inventory row not found")

    pp = await session.get(PartnerProduct, payload.partner_product_id)
    suggested = payload.suggested_qty or _default_suggestion(inv.available_qty, inv.low_stock_threshold, 3.0)
    row = PartnerReplenishment(
        partner_id=pp.partner_id,
        warehouse_id=payload.warehouse_id,
        partner_product_id=pp.id,
        current_qty=inv.available_qty,
        low_stock_threshold=inv.low_stock_threshold,
        suggested_qty=suggested,
        source="manual",
        reason="Quick-added from stock centre",
        created_by_admin_id=admin.id,
    )
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "There is already an active replenishment for this SKU/warehouse.")
    await session.refresh(row)
    await _audit(session, admin, "replenishment.quick_add", row.id)
    return (await _hydrate(session, [row]))[0]
