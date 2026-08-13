"""Super Admin — Store Transfers.

Move stock between two dark stores with a full approval trail:
    draft → requested → approved → in_transit → received  (or cancelled)

Dispatch (`in_transit`):
    • Decrements source PartnerInventory.available_qty by each line's `quantity`.
    • Writes `transfer_out` movements (delta_qty = -quantity).
    • Refuses (409) if any source SKU has insufficient stock — never-negative respected.

Receive (`received`):
    • Auto-resolves destination `partner_product_id` for each line via master
      product mapping. For master-sourced SKUs, if the destination store has no
      link yet a new `partner_products` row is auto-linked (source=master,
      approval_status=approved, is_active=false — the owner can activate).
      For custom SKUs the destination must already have a matching partner
      product (same brand + name, and same source='custom').
    • Increments destination PartnerInventory.available_qty by each line's
      `dispatched_qty` (partial receives supported).
    • Writes `transfer_in` movements (delta_qty = +dispatched_qty).

Cancel:
    • Allowed from any pre-in_transit state.
    • If cancelled from `in_transit`, in-flight stock is returned to source
      (writes a `transfer_in` back to source) — safety.
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
    PartnerStockMovement,
    PartnerTransfer,
    PartnerTransferItem,
    Warehouse,
)
from core.models.base import new_id
from .routes import get_current_admin, _audit


router = APIRouter(prefix="/admin/transfers", tags=["admin-store-transfers"])


# ============================================================================
#                             SERIALISERS
# ============================================================================

def _t_dict(
    t: PartnerTransfer,
    items: list[PartnerTransferItem],
    prods: dict[str, PartnerProduct],
    warehouses: dict[str, Warehouse],
    partners: dict[str, Partner],
    masters: dict[str, MartProduct],
) -> dict:
    def _p_display(pid: Optional[str]) -> dict | None:
        if not pid:
            return None
        p = prods.get(pid)
        if not p:
            return {"id": pid, "name": "Unknown"}
        master = masters.get(p.master_product_id) if p.master_product_id else None
        return {
            "id": p.id,
            "name":  p.name or (master.name if master else "Untitled"),
            "brand": p.brand or (master.brand if master else None),
            "sku_code": p.sku_code or (master.sku_code if master else None),
            "image": p.image or (master.image if master else None),
            "source": p.source,
        }

    from_wh = warehouses.get(t.from_warehouse_id)
    to_wh   = warehouses.get(t.to_warehouse_id)
    return {
        "id": t.id, "code": t.code, "status": t.status,
        "reason": t.reason, "notes": t.notes,
        "from": {
            "warehouse_id": t.from_warehouse_id,
            "warehouse_code": from_wh.code if from_wh else None,
            "warehouse_name": from_wh.name if from_wh else None,
            "partner_id": t.from_partner_id,
            "partner_name": partners.get(t.from_partner_id).business_name if partners.get(t.from_partner_id) else None,
        },
        "to": {
            "warehouse_id": t.to_warehouse_id,
            "warehouse_code": to_wh.code if to_wh else None,
            "warehouse_name": to_wh.name if to_wh else None,
            "partner_id": t.to_partner_id,
            "partner_name": partners.get(t.to_partner_id).business_name if partners.get(t.to_partner_id) else None,
        },
        "created_by_admin_id":    t.created_by_admin_id,
        "approved_by_admin_id":   t.approved_by_admin_id,
        "dispatched_by_admin_id": t.dispatched_by_admin_id,
        "received_by_admin_id":   t.received_by_admin_id,
        "created_at":    t.created_at.isoformat() if t.created_at else None,
        "requested_at":  t.requested_at.isoformat() if t.requested_at else None,
        "approved_at":   t.approved_at.isoformat() if t.approved_at else None,
        "dispatched_at": t.dispatched_at.isoformat() if t.dispatched_at else None,
        "received_at":   t.received_at.isoformat() if t.received_at else None,
        "cancelled_at":  t.cancelled_at.isoformat() if t.cancelled_at else None,
        "items": [
            {
                "id": it.id,
                "from_product": _p_display(it.from_partner_product_id),
                "to_product":   _p_display(it.to_partner_product_id),
                "quantity": it.quantity,
                "dispatched_qty": it.dispatched_qty,
                "received_qty":   it.received_qty,
                "notes": it.notes,
            } for it in items
        ],
    }


async def _hydrate(session: AsyncSession, rows: list[PartnerTransfer]) -> list[dict]:
    if not rows:
        return []
    ids = [r.id for r in rows]
    items = (await session.execute(
        select(PartnerTransferItem).where(PartnerTransferItem.transfer_id.in_(ids))
    )).scalars().all()
    items_by_transfer: dict[str, list[PartnerTransferItem]] = {}
    for it in items:
        items_by_transfer.setdefault(it.transfer_id, []).append(it)

    pp_ids = list({i.from_partner_product_id for i in items} | {i.to_partner_product_id for i in items if i.to_partner_product_id})
    wh_ids = list({r.from_warehouse_id for r in rows} | {r.to_warehouse_id for r in rows})
    ptr_ids = list({r.from_partner_id for r in rows} | {r.to_partner_id for r in rows})

    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(pp_ids)))).scalars().all()} if pp_ids else {}
    whs   = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))).scalars().all()}
    ptns  = {p.id: p for p in (await session.execute(select(Partner).where(Partner.id.in_(ptr_ids)))).scalars().all()}
    master_ids = list({p.master_product_id for p in prods.values() if p.master_product_id})
    masters: dict[str, MartProduct] = {}
    if master_ids:
        masters = {m.id: m for m in (await session.execute(select(MartProduct).where(MartProduct.id.in_(master_ids)))).scalars().all()}

    return [_t_dict(r, items_by_transfer.get(r.id, []), prods, whs, ptns, masters) for r in rows]


# ============================================================================
#                        NEXT CODE HELPER
# ============================================================================

async def _next_code(session: AsyncSession) -> str:
    """Generate TR-NNNNNN safely under concurrency by advancing past the max
    existing suffix (rather than COUNT+1, which races on delete/parallel-insert).
    The unique constraint on `code` remains the last line of defence."""
    row = await session.execute(
        select(func.max(PartnerTransfer.code))
    )
    last = row.scalar_one_or_none()
    n = 0
    if last and last.startswith("TR-"):
        try: n = int(last.split("-", 1)[1])
        except ValueError: n = 0
    return f"TR-{n + 1:06d}"


# ============================================================================
#                                LIST
# ============================================================================

@router.get("")
async def list_transfers(
    status: Optional[str] = None,
    country: Optional[str] = None,
    from_warehouse_id: Optional[str] = None,
    to_warehouse_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PartnerTransfer).order_by(PartnerTransfer.created_at.desc())
    if status: stmt = stmt.where(PartnerTransfer.status == status)
    if from_warehouse_id: stmt = stmt.where(PartnerTransfer.from_warehouse_id == from_warehouse_id)
    if to_warehouse_id:   stmt = stmt.where(PartnerTransfer.to_warehouse_id == to_warehouse_id)
    if q:                 stmt = stmt.where(PartnerTransfer.code.ilike(f"%{q}%"))
    if country:
        stmt = stmt.join(Partner, Partner.id == PartnerTransfer.from_partner_id).where(Partner.country == country.upper())
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    # Bucket counts (unfiltered by status but respect country)
    b_stmt = select(PartnerTransfer.status, func.count(PartnerTransfer.id)).group_by(PartnerTransfer.status)
    if country:
        b_stmt = b_stmt.join(Partner, Partner.id == PartnerTransfer.from_partner_id).where(Partner.country == country.upper())
    bucket_rows = (await session.execute(b_stmt)).all()
    buckets = {s: 0 for s in ("draft", "requested", "approved", "in_transit", "received", "cancelled")}
    for s, c in bucket_rows:
        buckets[s] = c

    return {"items": await _hydrate(session, list(rows)), "buckets": buckets}


@router.get("/{tr_id}")
async def get_transfer(
    tr_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await session.get(PartnerTransfer, tr_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    return (await _hydrate(session, [t]))[0]


# ============================================================================
#                                CREATE
# ============================================================================

class TransferItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_partner_product_id: str
    quantity: int = Field(..., gt=0)
    notes: Optional[str] = None


class TransferIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_warehouse_id: str
    to_warehouse_id: str
    reason: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None
    items: list[TransferItemIn]


@router.post("", status_code=201)
async def create_transfer(
    payload: TransferIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if payload.from_warehouse_id == payload.to_warehouse_id:
        raise HTTPException(400, "Source and destination warehouses must differ")
    if not payload.items:
        raise HTTPException(400, "At least one line item is required")

    from_wh = await session.get(Warehouse, payload.from_warehouse_id)
    to_wh   = await session.get(Warehouse, payload.to_warehouse_id)
    if not from_wh or not to_wh:
        raise HTTPException(404, "Warehouse not found")

    # Verify every source SKU belongs to the source warehouse's partner
    from_pp_ids = [i.from_partner_product_id for i in payload.items]
    from_pps = (await session.execute(
        select(PartnerProduct).where(PartnerProduct.id.in_(from_pp_ids))
    )).scalars().all()
    from_pp_by_id = {p.id: p for p in from_pps}
    for it in payload.items:
        p = from_pp_by_id.get(it.from_partner_product_id)
        if not p:
            raise HTTPException(404, f"Source product {it.from_partner_product_id} not found")
        if p.partner_id != from_wh.partner_id:
            raise HTTPException(400, f"Product {it.from_partner_product_id} does not belong to the source store")

    code = await _next_code(session)
    t = PartnerTransfer(
        code=code,
        from_partner_id=from_wh.partner_id,   from_warehouse_id=from_wh.id,
        to_partner_id=to_wh.partner_id,       to_warehouse_id=to_wh.id,
        status="requested",
        reason=payload.reason, notes=payload.notes,
        created_by_admin_id=admin.id,
        requested_at=datetime.now(timezone.utc),
    )
    session.add(t)
    await session.flush()
    for it in payload.items:
        session.add(PartnerTransferItem(
            transfer_id=t.id,
            from_partner_product_id=it.from_partner_product_id,
            quantity=it.quantity,
            notes=it.notes,
        ))
    await session.commit()
    await session.refresh(t)
    await _audit(session, admin, "transfer.create", t.id)
    return (await _hydrate(session, [t]))[0]


# ============================================================================
#                    DESTINATION PRODUCT AUTO-RESOLVER
# ============================================================================

async def _resolve_to_product(
    session: AsyncSession, from_pp: PartnerProduct, to_partner_id: str
) -> PartnerProduct:
    """Find or lazily-create the destination PartnerProduct row.

    Master-sourced SKUs auto-link via master_product_id. Custom SKUs must be
    matched by (source='custom', name, brand) — we refuse to invent a new
    custom product on someone else's store.
    """
    if from_pp.master_product_id:
        # Try to find an existing link at destination.
        existing = (await session.execute(
            select(PartnerProduct).where(
                PartnerProduct.partner_id == to_partner_id,
                PartnerProduct.master_product_id == from_pp.master_product_id,
            )
        )).scalar_one_or_none()
        if existing:
            return existing
        # Auto-link. Preserve pricing / metadata from the source; destination
        # owner can override later.
        master = await session.get(MartProduct, from_pp.master_product_id)
        row = PartnerProduct(
            partner_id=to_partner_id,
            source="master",
            master_product_id=from_pp.master_product_id,
            name=None, brand=(master.brand if master else from_pp.brand),
            unit=(master.unit if master else from_pp.unit),
            image=(master.image if master else from_pp.image),
            category_slug=(master.category_slug if master else from_pp.category_slug),
            subcategory_slug=(master.subcategory_slug if master else from_pp.subcategory_slug),
            partner_price=from_pp.partner_price,
            currency=from_pp.currency,
            stock_qty=0,
            low_stock_threshold=from_pp.low_stock_threshold,
            approval_status="approved",
            is_active=False,
        )
        session.add(row)
        await session.flush()
        return row

    # Custom SKU — require destination-side match.
    match = (await session.execute(
        select(PartnerProduct).where(
            PartnerProduct.partner_id == to_partner_id,
            PartnerProduct.source == "custom",
            PartnerProduct.name  == from_pp.name,
            PartnerProduct.brand == from_pp.brand,
        )
    )).scalar_one_or_none()
    if not match:
        raise HTTPException(409, (
            f"Destination store has no matching custom SKU for '{from_pp.name}' "
            f"({from_pp.brand}). The destination owner must create it first."
        ))
    return match


# ============================================================================
#                        LIFECYCLE TRANSITIONS
# ============================================================================

class TransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


@router.post("/{tr_id}/approve")
async def approve_transfer(
    tr_id: str, payload: TransitionIn = TransitionIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await session.get(PartnerTransfer, tr_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    if t.status != "requested":
        raise HTTPException(409, f"Cannot approve a {t.status} transfer")
    t.status = "approved"
    t.approved_at = datetime.now(timezone.utc)
    t.approved_by_admin_id = admin.id
    if payload.notes:
        t.notes = (t.notes or "") + f"\n[approve] {payload.notes}"
    await session.commit()
    await session.refresh(t)
    await _audit(session, admin, "transfer.approve", tr_id)
    return (await _hydrate(session, [t]))[0]


class DispatchLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str
    dispatch_qty: int = Field(..., ge=0)


class DispatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: Optional[list[DispatchLineIn]] = None
    notes: Optional[str] = None


@router.post("/{tr_id}/dispatch")
async def dispatch_transfer(
    tr_id: str, payload: DispatchIn = DispatchIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await session.get(PartnerTransfer, tr_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    if t.status != "approved":
        raise HTTPException(409, f"Cannot dispatch a {t.status} transfer")

    items = (await session.execute(select(PartnerTransferItem).where(PartnerTransferItem.transfer_id == t.id))).scalars().all()

    # If explicit lines were passed, validate ids belong; else full-qty dispatch.
    line_map: dict[str, int] = {}
    if payload.lines:
        line_map = {ln.item_id: ln.dispatch_qty for ln in payload.lines}
    for it in items:
        target_qty = line_map.get(it.id, it.quantity)
        remaining = it.quantity - it.dispatched_qty
        if target_qty > remaining:
            raise HTTPException(409, f"Line {it.id}: cannot dispatch {target_qty} — only {remaining} remaining")

    # Precheck source stock — never negative.
    src_pp_ids = [it.from_partner_product_id for it in items]
    src_invs = (await session.execute(
        select(PartnerInventory).where(
            PartnerInventory.partner_product_id.in_(src_pp_ids),
            PartnerInventory.warehouse_id == t.from_warehouse_id,
        )
    )).scalars().all()
    inv_by_pp = {i.partner_product_id: i for i in src_invs}
    for it in items:
        qty = line_map.get(it.id, it.quantity - it.dispatched_qty)
        if qty <= 0:
            continue
        inv = inv_by_pp.get(it.from_partner_product_id)
        if not inv or inv.available_qty < qty:
            have = inv.available_qty if inv else 0
            raise HTTPException(409, (
                f"Insufficient source stock for line {it.id}: have {have}, need {qty}"
            ))

    now = datetime.now(timezone.utc)
    for it in items:
        qty = line_map.get(it.id, it.quantity - it.dispatched_qty)
        if qty <= 0:
            continue
        inv = inv_by_pp[it.from_partner_product_id]
        inv.available_qty -= qty
        inv.last_movement_at = now
        # Keep partner_products.stock_qty in sync
        pp = await session.get(PartnerProduct, it.from_partner_product_id)
        pp.stock_qty = inv.available_qty

        mv = PartnerStockMovement(
            partner_id=t.from_partner_id,
            partner_product_id=it.from_partner_product_id,
            warehouse_id=t.from_warehouse_id,
            kind="transfer_out",
            delta_qty=-qty,
            balance_after=inv.available_qty,
            reason=f"Transfer {t.code} to {t.to_warehouse_id}",
            reference=f"transfer:{t.id}:{it.id}",
            actor_id=admin.id,
            actor_role="admin",
        )
        session.add(mv)
        await session.flush()
        it.dispatched_qty += qty
        it.dispatch_movement_id = mv.id

    t.status = "in_transit"
    t.dispatched_at = now
    t.dispatched_by_admin_id = admin.id
    if payload.notes:
        t.notes = (t.notes or "") + f"\n[dispatch] {payload.notes}"
    await session.commit()
    await session.refresh(t)
    await _audit(session, admin, "transfer.dispatch", tr_id)
    return (await _hydrate(session, [t]))[0]


class ReceiveLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str
    receive_qty: int = Field(..., ge=0)


class ReceiveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: Optional[list[ReceiveLineIn]] = None
    notes: Optional[str] = None


@router.post("/{tr_id}/receive")
async def receive_transfer(
    tr_id: str, payload: ReceiveIn = ReceiveIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await session.get(PartnerTransfer, tr_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    if t.status != "in_transit":
        raise HTTPException(409, f"Cannot receive a {t.status} transfer")

    items = (await session.execute(select(PartnerTransferItem).where(PartnerTransferItem.transfer_id == t.id))).scalars().all()
    line_map: dict[str, int] = {}
    if payload.lines:
        line_map = {ln.item_id: ln.receive_qty for ln in payload.lines}

    now = datetime.now(timezone.utc)
    for it in items:
        remaining_receivable = it.dispatched_qty - it.received_qty
        qty = line_map.get(it.id, remaining_receivable)
        if qty > remaining_receivable:
            raise HTTPException(409, f"Line {it.id}: cannot receive {qty} — only {remaining_receivable} in flight")
        if qty <= 0:
            continue

        from_pp = await session.get(PartnerProduct, it.from_partner_product_id)
        to_pp = it.to_partner_product_id and await session.get(PartnerProduct, it.to_partner_product_id)
        if not to_pp:
            to_pp = await _resolve_to_product(session, from_pp, t.to_partner_id)
            it.to_partner_product_id = to_pp.id

        # Ensure inventory row exists on destination.
        inv = (await session.execute(select(PartnerInventory).where(
            PartnerInventory.partner_product_id == to_pp.id,
            PartnerInventory.warehouse_id == t.to_warehouse_id,
        ))).scalar_one_or_none()
        if not inv:
            inv = PartnerInventory(
                partner_id=t.to_partner_id, partner_product_id=to_pp.id,
                warehouse_id=t.to_warehouse_id, available_qty=0,
                low_stock_threshold=to_pp.low_stock_threshold,
            )
            session.add(inv)
            await session.flush()

        inv.available_qty += qty
        inv.last_movement_at = now
        to_pp.stock_qty = inv.available_qty

        mv = PartnerStockMovement(
            partner_id=t.to_partner_id, partner_product_id=to_pp.id,
            warehouse_id=t.to_warehouse_id, kind="transfer_in",
            delta_qty=qty, balance_after=inv.available_qty,
            reason=f"Transfer {t.code} from {t.from_warehouse_id}",
            reference=f"transfer:{t.id}:{it.id}",
            actor_id=admin.id, actor_role="admin",
        )
        session.add(mv)
        await session.flush()
        it.received_qty += qty
        it.receive_movement_id = mv.id

    # Determine new status. Fully received once every line has received_qty >= dispatched_qty.
    fully = all(it.received_qty >= it.dispatched_qty for it in items)
    if fully:
        t.status = "received"
        t.received_at = now
        t.received_by_admin_id = admin.id
    if payload.notes:
        t.notes = (t.notes or "") + f"\n[receive] {payload.notes}"
    await session.commit()
    await session.refresh(t)
    await _audit(session, admin, "transfer.receive", tr_id)
    return (await _hydrate(session, [t]))[0]


@router.post("/{tr_id}/cancel")
async def cancel_transfer(
    tr_id: str, payload: TransitionIn = TransitionIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await session.get(PartnerTransfer, tr_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    if t.status in ("received", "cancelled"):
        raise HTTPException(409, f"Cannot cancel a {t.status} transfer")

    now = datetime.now(timezone.utc)
    # If cancelling mid-flight, return dispatched-but-not-received units to source.
    if t.status == "in_transit":
        items = (await session.execute(select(PartnerTransferItem).where(PartnerTransferItem.transfer_id == t.id))).scalars().all()
        for it in items:
            outstanding = it.dispatched_qty - it.received_qty
            if outstanding <= 0:
                continue
            inv = (await session.execute(select(PartnerInventory).where(
                PartnerInventory.partner_product_id == it.from_partner_product_id,
                PartnerInventory.warehouse_id == t.from_warehouse_id,
            ))).scalar_one_or_none()
            if not inv:
                continue
            inv.available_qty += outstanding
            inv.last_movement_at = now
            pp = await session.get(PartnerProduct, it.from_partner_product_id)
            pp.stock_qty = inv.available_qty
            mv = PartnerStockMovement(
                partner_id=t.from_partner_id,
                partner_product_id=it.from_partner_product_id,
                warehouse_id=t.from_warehouse_id,
                kind="transfer_in",
                delta_qty=outstanding, balance_after=inv.available_qty,
                reason=f"Transfer {t.code} cancelled — units returned",
                reference=f"transfer:{t.id}:{it.id}",
                actor_id=admin.id, actor_role="admin",
            )
            session.add(mv)

    t.status = "cancelled"
    t.cancelled_at = now
    if payload.notes:
        t.notes = (t.notes or "") + f"\n[cancel] {payload.notes}"
    await session.commit()
    await session.refresh(t)
    await _audit(session, admin, "transfer.cancel", tr_id)
    return (await _hydrate(session, [t]))[0]


# ============================================================================
#                    LOOKUPS FOR THE UI
# ============================================================================

@router.get("/lookups/warehouses")
async def warehouse_lookup(
    country: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Return warehouses with their partner + a hint of SKU count for the picker UI."""
    stmt = (
        select(Warehouse, Partner, func.count(PartnerInventory.id))
        .join(Partner, Partner.id == Warehouse.partner_id)
        .outerjoin(PartnerInventory, PartnerInventory.warehouse_id == Warehouse.id)
        .group_by(Warehouse.id, Partner.id)
        .order_by(Partner.country, Warehouse.code)
    )
    if country:
        stmt = stmt.where(Partner.country == country.upper())
    rows = (await session.execute(stmt)).all()
    return {"items": [{
        "warehouse_id": wh.id, "warehouse_code": wh.code, "warehouse_name": wh.name,
        "city": wh.city, "status": wh.status,
        "partner_id": partner.id, "partner_name": partner.business_name, "country": partner.country,
        "sku_count": sku_count,
    } for wh, partner, sku_count in rows]}


@router.get("/lookups/source-inventory/{warehouse_id}")
async def source_inventory_for_transfer(
    warehouse_id: str,
    q: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Products at a source warehouse with current available stock — used
    by the transfer creator's product picker."""
    stmt = (
        select(PartnerInventory, PartnerProduct, MartProduct)
        .join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
        .outerjoin(MartProduct, MartProduct.id == PartnerProduct.master_product_id)
        .where(PartnerInventory.warehouse_id == warehouse_id, PartnerInventory.available_qty > 0)
        .order_by(PartnerInventory.available_qty.desc())
    )
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(
            PartnerProduct.name.ilike(pat),
            PartnerProduct.brand.ilike(pat),
            PartnerProduct.sku_code.ilike(pat),
            MartProduct.name.ilike(pat),
        ))
    rows = (await session.execute(stmt.limit(200))).all()
    return {"items": [{
        "partner_product_id": pp.id,
        "name":  pp.name or (mp.name if mp else "Untitled"),
        "brand": pp.brand or (mp.brand if mp else None),
        "sku_code": pp.sku_code or (mp.sku_code if mp else None),
        "unit":  pp.unit or (mp.unit if mp else None),
        "image": pp.image or (mp.image if mp else None),
        "available_qty": inv.available_qty,
    } for inv, pp, mp in rows]}
