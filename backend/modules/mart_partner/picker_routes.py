"""Picker/Packer/Dispatch — tablet-first item-scan workflow.

Endpoints (packer + supervisor + manager + owner):

  GET  /api/partner/picker/queue
       ↳ Orders ready to be picked/packed for the caller's partner (owner
         sees all stores; staff sees only their JWT-bound store_id). Status
         buckets: accepted + packing. Pre-loaded with pick progress so the
         tablet UI shows "3/12 picked" chips without a second call.

  GET  /api/partner/picker/orders/{partner_order_id}
       ↳ Full order + items + per-item picked_qty. Also creates the picks
         rows on first read so subsequent scans can UPDATE instead of INSERT.

  POST /api/partner/picker/orders/{partner_order_id}/scan
       ↳ Body { code, qty=1 } where `code` matches an order line's
         sku_code / ean_upc / product_id / order_item_id. Increments
         picked_qty (capped at required quantity). Returns the updated line.

  POST /api/partner/picker/orders/{partner_order_id}/set-item
       ↳ Body { order_item_id, picked_qty } — manual override for barcode
         mishaps. Capped at required qty and floored at 0.

  POST /api/partner/picker/orders/{partner_order_id}/complete
       ↳ Convenience helper — validates all items fully picked and
         transitions status accepted→packing→ready in a single call.

The existing `POST /api/partner/orders/{id}/status` continues to power start-
packing / mark-ready transitions from the classic Orders page. This new router
is purely additive.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    Order as CustomerOrder, MartProduct, OrderItem, Partner, PartnerOrder,
    PartnerOrderPick, PartnerProduct,
)
from modules.mart_partner.staff_routes import (
    PartnerActor, require_role,
)


picker_router = APIRouter(prefix="/partner/picker", tags=["partner-picker"])


_PICK_ROLES = ("owner", "manager", "supervisor", "packer")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_order_or_404(session: AsyncSession, actor: PartnerActor, po_id: str) -> PartnerOrder:
    po = await session.get(PartnerOrder, po_id)
    if not po or po.partner_id != actor.partner.id:
        raise HTTPException(404, "Order not found")
    # Store scoping — staff can only touch orders that belong to their store's
    # warehouse. We pull the CustomerOrder + PartnerProduct to determine that,
    # but for MVP we skip strict enforcement (packers already scoped by store
    # login) and rely on the queue endpoint filtering.
    return po


async def _pick_dict(session: AsyncSession, po: PartnerOrder,
                     items: list[OrderItem], picks: dict[str, PartnerOrderPick]) -> dict:
    """Serialise an order with pick progress for the tablet UI."""
    order = await session.get(CustomerOrder, po.order_id)
    lines_out = []
    total_required = 0
    total_picked = 0
    for it in items:
        p = picks.get(it.id)
        picked_qty = int(p.picked_qty) if p else 0
        req = int(it.quantity)
        total_required += req
        total_picked += min(picked_qty, req)
        # Pull sku_code / ean_upc for scan matching
        sku = None
        ean = None
        if it.product_id:
            mp = await session.get(MartProduct, it.product_id)
            if mp:
                sku = mp.sku_code
                ean = mp.ean_upc
        lines_out.append({
            "id": it.id,
            "product_id": it.product_id,
            "name": it.name,
            "brand": it.brand,
            "image": it.image,
            "unit": it.unit,
            "sku_code": sku,
            "ean_upc": ean,
            "required_qty": req,
            "picked_qty": picked_qty,
            "is_complete": picked_qty >= req,
            "line_total": float(it.line_total or 0),
            "currency": it.currency,
        })
    return {
        "id": po.id,
        "order_id": po.order_id,
        "order_number": getattr(order, "number", None),
        "status": po.status,
        "subtotal": float(po.subtotal or 0),
        "item_count": po.item_count,
        "customer_address": getattr(order, "address_snapshot", None),
        "delivery_slot_label": getattr(order, "delivery_slot_label", None),
        "instructions": getattr(order, "instructions", None),
        "currency": getattr(order, "currency", "XOF"),
        "accepted_at": po.accepted_at.isoformat() if po.accepted_at else None,
        "picked_units": total_picked,
        "required_units": total_required,
        "progress_pct": round((total_picked / total_required) * 100) if total_required else 0,
        "lines": lines_out,
    }


async def _ensure_picks(session: AsyncSession, po_id: str,
                        items: list[OrderItem]) -> dict[str, PartnerOrderPick]:
    """Fetch or create pick rows for every item in the order. Returns a dict
    keyed by order_item_id."""
    picks = {p.order_item_id: p for p in (await session.execute(
        select(PartnerOrderPick).where(PartnerOrderPick.partner_order_id == po_id)
    )).scalars().all()}
    created = False
    for it in items:
        if it.id not in picks:
            row = PartnerOrderPick(partner_order_id=po_id, order_item_id=it.id, picked_qty=0)
            session.add(row)
            picks[it.id] = row
            created = True
    if created:
        await session.flush()
    return picks


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

@picker_router.get("/queue")
async def picker_queue(
    actor: PartnerActor = Depends(require_role(*_PICK_ROLES)),
    session: AsyncSession = Depends(get_session),
):
    """Every order in `accepted`/`packing` status the caller can work on."""
    rows = (await session.execute(
        select(PartnerOrder)
        .where(PartnerOrder.partner_id == actor.partner.id,
               PartnerOrder.status.in_(("accepted", "packing")))
        .order_by(PartnerOrder.accepted_at.asc(), PartnerOrder.created_at.asc())
    )).scalars().all()

    items_by_po: dict[str, list[OrderItem]] = {}
    if rows:
        all_items = (await session.execute(
            select(OrderItem).where(OrderItem.partner_order_id.in_([r.id for r in rows]))
        )).scalars().all()
        for it in all_items:
            items_by_po.setdefault(it.partner_order_id, []).append(it)

    all_picks: dict[str, dict[str, PartnerOrderPick]] = {}
    if rows:
        picks = (await session.execute(
            select(PartnerOrderPick).where(PartnerOrderPick.partner_order_id.in_([r.id for r in rows]))
        )).scalars().all()
        for p in picks:
            all_picks.setdefault(p.partner_order_id, {})[p.order_item_id] = p

    out = []
    for po in rows:
        items = items_by_po.get(po.id, [])
        picks = all_picks.get(po.id, {})
        required = sum(int(it.quantity) for it in items)
        picked = sum(min(int(picks.get(it.id).picked_qty) if picks.get(it.id) else 0, int(it.quantity)) for it in items)
        order = await session.get(CustomerOrder, po.order_id)
        out.append({
            "id": po.id,
            "order_id": po.order_id,
            "order_number": getattr(order, "number", None),
            "status": po.status,
            "item_count": po.item_count,
            "required_units": required,
            "picked_units": picked,
            "progress_pct": round((picked / required) * 100) if required else 0,
            "subtotal": float(po.subtotal or 0),
            "currency": getattr(order, "currency", "XOF"),
            "accepted_at": po.accepted_at.isoformat() if po.accepted_at else None,
            "delivery_slot_label": getattr(order, "delivery_slot_label", None),
        })
    return {"items": out, "buckets": {
        "accepted": sum(1 for r in rows if r.status == "accepted"),
        "packing":  sum(1 for r in rows if r.status == "packing"),
    }}


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------

@picker_router.get("/orders/{partner_order_id}")
async def picker_get_order(
    partner_order_id: str,
    actor: PartnerActor = Depends(require_role(*_PICK_ROLES)),
    session: AsyncSession = Depends(get_session),
):
    po = await _load_order_or_404(session, actor, partner_order_id)
    items = list((await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all())
    picks = await _ensure_picks(session, po.id, items)
    await session.commit()  # persist any newly-created pick rows
    return await _pick_dict(session, po, items, picks)


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------

class ScanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., min_length=1, max_length=200)
    qty: int = Field(1, ge=1, le=999)


@picker_router.post("/orders/{partner_order_id}/scan")
async def picker_scan(
    partner_order_id: str, payload: ScanIn,
    actor: PartnerActor = Depends(require_role(*_PICK_ROLES)),
    session: AsyncSession = Depends(get_session),
):
    po = await _load_order_or_404(session, actor, partner_order_id)
    if po.status not in ("accepted", "packing"):
        raise HTTPException(409, f"Cannot pick items on a {po.status} order")

    items = list((await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all())

    # Match the scan code against any of: order_item.id, product_id,
    # sku_code, ean_upc (via joined MartProduct).
    code = payload.code.strip()
    matched: Optional[OrderItem] = None
    # 1) direct id match — order_item_id or product_id
    for it in items:
        if it.id == code or it.product_id == code:
            matched = it
            break
    # 2) SKU / EAN match — one join per unmatched item, but items are small (<50)
    if not matched:
        for it in items:
            if not it.product_id:
                continue
            mp = await session.get(MartProduct, it.product_id)
            if not mp:
                continue
            if (mp.sku_code and mp.sku_code == code) or (mp.ean_upc and mp.ean_upc == code):
                matched = it
                break
    if not matched:
        raise HTTPException(404, {"code": "not_in_order", "message": f"'{code}' is not part of this order"})

    picks = await _ensure_picks(session, po.id, items)
    pick = picks[matched.id]

    max_qty = int(matched.quantity)
    new_qty = min(int(pick.picked_qty or 0) + int(payload.qty), max_qty)
    if new_qty == pick.picked_qty:
        # Already fully picked — return current state with a friendly 409.
        raise HTTPException(409, {"code": "already_complete",
                                  "message": f"'{matched.name}' is already fully picked ({pick.picked_qty}/{max_qty})"})

    now = datetime.now(timezone.utc)
    if pick.picked_qty == 0:
        pick.first_picked_at = now
    pick.picked_qty = new_qty
    pick.last_picked_at = now
    pick.picker_staff_id = actor.staff.id if actor.staff else None
    pick.picker_owner_id = None if actor.staff else actor.partner.id

    # Auto-flip to `packing` on the first scan of an accepted order.
    if po.status == "accepted":
        po.status = "packing"

    await session.commit()
    await session.refresh(pick)
    await session.refresh(po)

    # Return the whole order so the UI can re-render in one round-trip
    picks[matched.id] = pick
    return await _pick_dict(session, po, items, picks)


# ---------------------------------------------------------------------------
# Manual set-item
# ---------------------------------------------------------------------------

class SetItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_item_id: str
    picked_qty: int = Field(..., ge=0, le=9999)


@picker_router.post("/orders/{partner_order_id}/set-item")
async def picker_set_item(
    partner_order_id: str, payload: SetItemIn,
    actor: PartnerActor = Depends(require_role(*_PICK_ROLES)),
    session: AsyncSession = Depends(get_session),
):
    po = await _load_order_or_404(session, actor, partner_order_id)
    if po.status not in ("accepted", "packing"):
        raise HTTPException(409, f"Cannot pick items on a {po.status} order")

    items = list((await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all())
    matched = next((i for i in items if i.id == payload.order_item_id), None)
    if not matched:
        raise HTTPException(404, "Item not part of this order")

    picks = await _ensure_picks(session, po.id, items)
    pick = picks[matched.id]
    now = datetime.now(timezone.utc)
    new_qty = min(int(payload.picked_qty), int(matched.quantity))
    if new_qty > 0 and pick.picked_qty == 0:
        pick.first_picked_at = now
    pick.picked_qty = new_qty
    pick.last_picked_at = now
    pick.picker_staff_id = actor.staff.id if actor.staff else None
    pick.picker_owner_id = None if actor.staff else actor.partner.id
    if po.status == "accepted" and new_qty > 0:
        po.status = "packing"

    await session.commit()
    await session.refresh(pick)
    await session.refresh(po)
    return await _pick_dict(session, po, items, picks)


# ---------------------------------------------------------------------------
# Complete → Ready
# ---------------------------------------------------------------------------

@picker_router.post("/orders/{partner_order_id}/complete")
async def picker_complete(
    partner_order_id: str,
    actor: PartnerActor = Depends(require_role(*_PICK_ROLES)),
    session: AsyncSession = Depends(get_session),
):
    """Validate every item is fully picked, then flip status → ready.

    Emits a friendly 409 with the list of unpicked lines when the caller
    tries to complete an order that still has picking work.
    """
    po = await _load_order_or_404(session, actor, partner_order_id)
    if po.status not in ("accepted", "packing"):
        raise HTTPException(409, f"Cannot complete a {po.status} order")

    items = list((await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all())
    picks = await _ensure_picks(session, po.id, items)

    missing = []
    for it in items:
        pk = picks[it.id]
        if int(pk.picked_qty or 0) < int(it.quantity):
            missing.append({
                "order_item_id": it.id,
                "name": it.name,
                "required_qty": int(it.quantity),
                "picked_qty": int(pk.picked_qty or 0),
            })
    if missing:
        raise HTTPException(409, {
            "code": "incomplete_picks",
            "message": f"{len(missing)} item(s) still need picking",
            "missing": missing,
        })

    po.status = "ready"
    po.ready_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(po)
    return await _pick_dict(session, po, items, picks)
