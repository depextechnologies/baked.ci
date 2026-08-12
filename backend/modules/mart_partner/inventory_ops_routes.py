"""Partner — Receiving, Put-away & Stock Counts.

Batch 2 of the Inventory Control Tower rollout.

Workflows:
  Receiving
      draft → received → verified → put_away → completed
      Each item can be put-away to a specific bin. Put-away creates a
      `put_away` movement and increments PartnerInventory.available_qty.

  Stock counts (cycle counts)
      draft → counting → reconciling → completed
      Line-item variances create `stock_count` (or `correction`) movements
      to bring available_qty in line with reality — never-negative respected.
"""
from __future__ import annotations
from datetime import datetime, timezone
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
    PartnerReceipt,
    PartnerReceiptItem,
    PartnerStockCount,
    PartnerStockCountLine,
    PartnerStockMovement,
    Warehouse,
    WarehouseBin,
)
from .routes import (
    get_current_partner,
    _primary_warehouse,
    require_role,
)
from .inventory_routes import _get_or_create_inventory


router = APIRouter(prefix="/partner/inventory", tags=["partner-inventory-ops"])


# ============================================================================
#                              Helpers
# ============================================================================

async def _next_code(session: AsyncSession, partner_id: str, prefix: str, model) -> str:
    """Generate a per-partner monotonic code like RCPT-000042."""
    n = (await session.scalar(select(func.count(model.id)).where(model.partner_id == partner_id))) or 0
    return f"{prefix}-{n + 1:06d}"


def _receipt_dict(r: PartnerReceipt, items: list[PartnerReceiptItem] | None = None,
                  prods: dict[str, PartnerProduct] | None = None) -> dict:
    return {
        "id": r.id, "code": r.code, "partner_id": r.partner_id, "warehouse_id": r.warehouse_id,
        "source_type": r.source_type, "source_ref": r.source_ref, "status": r.status,
        "supplier_name": r.supplier_name, "supplier_ref": r.supplier_ref, "notes": r.notes,
        "created_by_id": r.created_by_id, "created_by_role": r.created_by_role,
        "created_at":   r.created_at.isoformat() if r.created_at else None,
        "verified_at":  r.verified_at.isoformat() if r.verified_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "items": [
            {
                "id": it.id, "partner_product_id": it.partner_product_id,
                "expected_qty": it.expected_qty, "received_qty": it.received_qty,
                "put_away_qty": it.put_away_qty, "damaged_qty": it.damaged_qty,
                "bin_id": it.bin_id, "notes": it.notes,
                "product": {
                    "name":  (prods.get(it.partner_product_id).name  if prods and prods.get(it.partner_product_id) else None),
                    "brand": (prods.get(it.partner_product_id).brand if prods and prods.get(it.partner_product_id) else None),
                    "unit":  (prods.get(it.partner_product_id).unit  if prods and prods.get(it.partner_product_id) else None),
                    "sku_code": (prods.get(it.partner_product_id).sku_code if prods and prods.get(it.partner_product_id) else None),
                } if prods else None,
            } for it in (items or [])
        ],
    }


def _count_dict(c: PartnerStockCount, lines: list[PartnerStockCountLine] | None = None,
                prods: dict[str, PartnerProduct] | None = None) -> dict:
    return {
        "id": c.id, "code": c.code, "partner_id": c.partner_id, "warehouse_id": c.warehouse_id,
        "scope": c.scope, "scope_ref_id": c.scope_ref_id, "status": c.status, "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        "created_by_id": c.created_by_id, "created_by_role": c.created_by_role,
        "lines": [
            {
                "id": l.id, "partner_product_id": l.partner_product_id, "bin_id": l.bin_id,
                "expected_qty": l.expected_qty, "counted_qty": l.counted_qty,
                "variance": l.variance, "adjustment_created": l.adjustment_created,
                "movement_id": l.movement_id, "notes": l.notes,
                "product": {
                    "name":  (prods.get(l.partner_product_id).name  if prods and prods.get(l.partner_product_id) else None),
                    "brand": (prods.get(l.partner_product_id).brand if prods and prods.get(l.partner_product_id) else None),
                    "sku_code": (prods.get(l.partner_product_id).sku_code if prods and prods.get(l.partner_product_id) else None),
                } if prods else None,
            } for l in (lines or [])
        ],
    }


# ============================================================================
#                              RECEIVING
# ============================================================================

class ReceiptItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    partner_product_id: str
    expected_qty: int = Field(0, ge=0)
    received_qty: int = Field(0, ge=0)
    bin_id: Optional[str] = None
    notes: Optional[str] = None


class ReceiptIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: str = Field("purchase", pattern="^(purchase|transfer|return|opening)$")
    source_ref: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_ref: Optional[str] = None
    notes: Optional[str] = None
    items: list[ReceiptItemIn] = Field(default_factory=list)


@router.get("/receipts")
async def list_receipts(
    status: Optional[str] = None,
    limit: int = Query(50, le=200), offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PartnerReceipt).where(PartnerReceipt.partner_id == partner.id).order_by(PartnerReceipt.created_at.desc())
    if status:
        stmt = stmt.where(PartnerReceipt.status == status)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    # bucket counts
    bucket_rows = (await session.execute(
        select(PartnerReceipt.status, func.count(PartnerReceipt.id))
        .where(PartnerReceipt.partner_id == partner.id).group_by(PartnerReceipt.status)
    )).all()
    buckets = {"draft": 0, "received": 0, "verified": 0, "put_away": 0, "completed": 0, "cancelled": 0}
    for s, c in bucket_rows:
        buckets[s] = c
    return {"items": [_receipt_dict(r) for r in rows], "buckets": buckets}


@router.post("/receipts", status_code=201,
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def create_receipt(
    payload: ReceiptIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        raise HTTPException(400, "No warehouse configured")
    code = await _next_code(session, partner.id, "RCPT", PartnerReceipt)
    receipt = PartnerReceipt(
        partner_id=partner.id, warehouse_id=wh.id, code=code,
        source_type=payload.source_type, source_ref=payload.source_ref,
        supplier_name=payload.supplier_name, supplier_ref=payload.supplier_ref,
        notes=payload.notes, status="draft",
        created_by_id=getattr(partner, "_staff_id", None) or partner.id,
        created_by_role=getattr(partner, "_staff_role", "owner"),
    )
    session.add(receipt)
    await session.flush()
    for it in payload.items:
        # Ownership check
        pp = await session.get(PartnerProduct, it.partner_product_id)
        if not pp or pp.partner_id != partner.id:
            raise HTTPException(404, f"Product {it.partner_product_id} not found in your store")
        session.add(PartnerReceiptItem(
            receipt_id=receipt.id, partner_product_id=it.partner_product_id,
            expected_qty=it.expected_qty, received_qty=it.received_qty,
            bin_id=it.bin_id, notes=it.notes,
        ))
    await session.commit()
    await session.refresh(receipt)
    items = (await session.execute(select(PartnerReceiptItem).where(PartnerReceiptItem.receipt_id == receipt.id))).scalars().all()
    prod_ids = [i.partner_product_id for i in items]
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(prod_ids)))).scalars().all()} if prod_ids else {}
    return _receipt_dict(receipt, items, prods)


@router.get("/receipts/{rcpt_id}")
async def get_receipt(
    rcpt_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    r = await session.get(PartnerReceipt, rcpt_id)
    if not r or r.partner_id != partner.id:
        raise HTTPException(404, "Receipt not found")
    items = (await session.execute(select(PartnerReceiptItem).where(PartnerReceiptItem.receipt_id == r.id))).scalars().all()
    prod_ids = [i.partner_product_id for i in items]
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(prod_ids)))).scalars().all()} if prod_ids else {}
    return _receipt_dict(r, items, prods)


class ReceiptTransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


class PutAwayLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str
    put_away_qty: int = Field(..., ge=0)
    bin_id: Optional[str] = None


class PutAwayIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[PutAwayLineIn]


@router.post("/receipts/{rcpt_id}/verify",
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def verify_receipt(
    rcpt_id: str, payload: ReceiptTransitionIn = ReceiptTransitionIn(),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    r = await session.get(PartnerReceipt, rcpt_id)
    if not r or r.partner_id != partner.id:
        raise HTTPException(404, "Receipt not found")
    if r.status not in ("draft", "received"):
        raise HTTPException(409, f"Cannot verify a receipt in status {r.status}")
    r.status = "verified"
    r.verified_at = datetime.now(timezone.utc)
    if payload.notes:
        r.notes = (r.notes or "") + f"\n[verify] {payload.notes}"
    await session.commit()
    await session.refresh(r)
    return _receipt_dict(r)


@router.post("/receipts/{rcpt_id}/put-away",
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def put_away_receipt(
    rcpt_id: str, payload: PutAwayIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Put received units on shelf → increments available_qty + creates put_away movements."""
    r = await session.get(PartnerReceipt, rcpt_id)
    if not r or r.partner_id != partner.id:
        raise HTTPException(404, "Receipt not found")
    if r.status not in ("verified", "put_away"):
        raise HTTPException(409, f"Receipt must be verified before put-away (status={r.status})")

    wh = await session.get(Warehouse, r.warehouse_id)

    for line in payload.lines:
        item = await session.get(PartnerReceiptItem, line.item_id)
        if not item or item.receipt_id != r.id:
            raise HTTPException(404, f"Receipt item {line.item_id} not found")
        remaining = item.received_qty - item.put_away_qty
        if line.put_away_qty > remaining:
            raise HTTPException(409, f"Cannot put-away {line.put_away_qty} — only {remaining} remaining for this line")
        if line.put_away_qty == 0:
            continue

        # Bin validation (if provided)
        if line.bin_id:
            b = await session.get(WarehouseBin, line.bin_id)
            if not b:
                raise HTTPException(404, "Bin not found")
            item.bin_id = line.bin_id

        pp = await session.get(PartnerProduct, item.partner_product_id)
        inv = await _get_or_create_inventory(session, partner, pp, wh)
        inv.available_qty += line.put_away_qty
        inv.last_movement_at = datetime.now(timezone.utc)
        pp.stock_qty = inv.available_qty

        item.put_away_qty += line.put_away_qty
        # Record ledger entry
        mv = PartnerStockMovement(
            partner_id=partner.id, partner_product_id=pp.id, warehouse_id=wh.id,
            bin_id=line.bin_id, kind="put_away",
            delta_qty=line.put_away_qty, balance_after=inv.available_qty,
            reason=f"Put-away from receipt {r.code}",
            reference=f"receipt:{r.id}",
            actor_id=getattr(partner, "_staff_id", None) or partner.id,
            actor_role=getattr(partner, "_staff_role", "owner"),
        )
        session.add(mv)

    # Determine new receipt status
    items = (await session.execute(select(PartnerReceiptItem).where(PartnerReceiptItem.receipt_id == r.id))).scalars().all()
    total_recv = sum(i.received_qty for i in items)
    total_put  = sum(i.put_away_qty for i in items)
    if total_put >= total_recv and total_recv > 0:
        r.status = "completed"
        r.completed_at = datetime.now(timezone.utc)
    else:
        r.status = "put_away"

    await session.commit()
    await session.refresh(r)
    fresh_items = (await session.execute(select(PartnerReceiptItem).where(PartnerReceiptItem.receipt_id == r.id))).scalars().all()
    return _receipt_dict(r, fresh_items)


@router.post("/receipts/{rcpt_id}/cancel",
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager"))])
async def cancel_receipt(
    rcpt_id: str, payload: ReceiptTransitionIn = ReceiptTransitionIn(),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    r = await session.get(PartnerReceipt, rcpt_id)
    if not r or r.partner_id != partner.id:
        raise HTTPException(404, "Receipt not found")
    if r.status in ("completed", "cancelled"):
        raise HTTPException(409, f"Cannot cancel a receipt in status {r.status}")
    # Safety: refuse cancel once put-away has happened
    items = (await session.execute(select(PartnerReceiptItem).where(PartnerReceiptItem.receipt_id == r.id))).scalars().all()
    if any(i.put_away_qty > 0 for i in items):
        raise HTTPException(409, "Cannot cancel — some units already put-away")
    r.status = "cancelled"
    if payload.notes:
        r.notes = (r.notes or "") + f"\n[cancel] {payload.notes}"
    await session.commit()
    return _receipt_dict(r)


# ============================================================================
#                              STOCK COUNTS
# ============================================================================

class StockCountIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: str = Field("full", pattern="^(full|zone|aisle|rack|shelf|bin|product)$")
    scope_ref_id: Optional[str] = None
    notes: Optional[str] = None


class CountLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: str
    counted_qty: int = Field(..., ge=0)
    notes: Optional[str] = None


class CountLinesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: list[CountLineIn]


@router.get("/counts")
async def list_counts(
    status: Optional[str] = None,
    limit: int = Query(50, le=200), offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PartnerStockCount).where(PartnerStockCount.partner_id == partner.id).order_by(PartnerStockCount.created_at.desc())
    if status:
        stmt = stmt.where(PartnerStockCount.status == status)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    bucket_rows = (await session.execute(
        select(PartnerStockCount.status, func.count(PartnerStockCount.id))
        .where(PartnerStockCount.partner_id == partner.id).group_by(PartnerStockCount.status)
    )).all()
    buckets = {"draft": 0, "counting": 0, "reconciling": 0, "completed": 0, "cancelled": 0}
    for s, c in bucket_rows:
        buckets[s] = c
    return {"items": [_count_dict(r) for r in rows], "buckets": buckets}


@router.post("/counts", status_code=201,
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager", "supervisor"))])
async def create_stock_count(
    payload: StockCountIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Create a stock-count with expected qtys snapshotted from PartnerInventory."""
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        raise HTTPException(400, "No warehouse configured")
    code = await _next_code(session, partner.id, "CNT", PartnerStockCount)
    count = PartnerStockCount(
        partner_id=partner.id, warehouse_id=wh.id, code=code,
        scope=payload.scope, scope_ref_id=payload.scope_ref_id, notes=payload.notes,
        status="counting",
        created_by_id=getattr(partner, "_staff_id", None) or partner.id,
        created_by_role=getattr(partner, "_staff_role", "owner"),
    )
    session.add(count)
    await session.flush()

    # Snapshot expected qty from PartnerInventory (scope=full for MVP)
    invs = (await session.execute(
        select(PartnerInventory, PartnerProduct)
        .join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
        .where(PartnerInventory.partner_id == partner.id, PartnerInventory.warehouse_id == wh.id)
    )).all()
    for inv, pp in invs:
        session.add(PartnerStockCountLine(
            count_id=count.id, partner_product_id=inv.partner_product_id,
            expected_qty=inv.available_qty, counted_qty=inv.available_qty,
            variance=0,
        ))
    await session.commit()
    await session.refresh(count)
    lines = (await session.execute(select(PartnerStockCountLine).where(PartnerStockCountLine.count_id == count.id))).scalars().all()
    prod_ids = [l.partner_product_id for l in lines]
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(prod_ids)))).scalars().all()} if prod_ids else {}
    return _count_dict(count, lines, prods)


@router.get("/counts/{count_id}")
async def get_count(
    count_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(PartnerStockCount, count_id)
    if not c or c.partner_id != partner.id:
        raise HTTPException(404, "Stock count not found")
    lines = (await session.execute(select(PartnerStockCountLine).where(PartnerStockCountLine.count_id == c.id))).scalars().all()
    prod_ids = [l.partner_product_id for l in lines]
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(prod_ids)))).scalars().all()} if prod_ids else {}
    return _count_dict(c, lines, prods)


@router.post("/counts/{count_id}/record",
             dependencies=[Depends(require_role("owner", "manager", "inventory_manager", "warehouse_manager", "supervisor"))])
async def record_count_lines(
    count_id: str, payload: CountLinesIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(PartnerStockCount, count_id)
    if not c or c.partner_id != partner.id:
        raise HTTPException(404, "Stock count not found")
    if c.status not in ("counting", "reconciling"):
        raise HTTPException(409, f"Cannot record while status={c.status}")

    for ln in payload.lines:
        row = await session.get(PartnerStockCountLine, ln.line_id)
        if not row or row.count_id != c.id:
            raise HTTPException(404, f"Line {ln.line_id} not found")
        row.counted_qty = ln.counted_qty
        row.variance    = ln.counted_qty - row.expected_qty
        if ln.notes: row.notes = ln.notes

    c.status = "reconciling"
    await session.commit()
    await session.refresh(c)
    lines = (await session.execute(select(PartnerStockCountLine).where(PartnerStockCountLine.count_id == c.id))).scalars().all()
    return _count_dict(c, lines)


@router.post("/counts/{count_id}/apply",
             dependencies=[Depends(require_role("owner", "manager", "supervisor"))])
async def apply_count(
    count_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Turn each variance into a stock_count movement, correcting available_qty
    to the counted number. Never-negative respected — available_qty is set to
    max(0, counted_qty)."""
    c = await session.get(PartnerStockCount, count_id)
    if not c or c.partner_id != partner.id:
        raise HTTPException(404, "Stock count not found")
    if c.status != "reconciling":
        raise HTTPException(409, "Only counts in status=reconciling can be applied")

    wh = await session.get(Warehouse, c.warehouse_id)
    lines = (await session.execute(select(PartnerStockCountLine).where(PartnerStockCountLine.count_id == c.id))).scalars().all()

    for ln in lines:
        if ln.variance == 0:
            continue
        pp = await session.get(PartnerProduct, ln.partner_product_id)
        if not pp:
            continue
        inv = (await session.execute(
            select(PartnerInventory).where(
                PartnerInventory.partner_product_id == pp.id,
                PartnerInventory.warehouse_id == wh.id,
            )
        )).scalar_one_or_none()
        if not inv:
            continue

        # Set available_qty to counted value (never negative)
        new_available = max(0, ln.counted_qty)
        delta = new_available - inv.available_qty
        inv.available_qty = new_available
        inv.last_movement_at = datetime.now(timezone.utc)
        pp.stock_qty = inv.available_qty

        mv = PartnerStockMovement(
            partner_id=partner.id, partner_product_id=pp.id, warehouse_id=wh.id,
            bin_id=ln.bin_id, kind="stock_count",
            delta_qty=delta, balance_after=inv.available_qty,
            reason=f"Stock count {c.code} variance",
            reference=f"count:{c.id}:{ln.id}",
            actor_id=getattr(partner, "_staff_id", None) or partner.id,
            actor_role=getattr(partner, "_staff_role", "owner"),
        )
        session.add(mv)
        await session.flush()
        ln.adjustment_created = True
        ln.movement_id = mv.id

    c.status = "completed"
    c.completed_at = datetime.now(timezone.utc)
    c.approved_by_id = getattr(partner, "_staff_id", None) or partner.id
    await session.commit()
    await session.refresh(c)
    lines = (await session.execute(select(PartnerStockCountLine).where(PartnerStockCountLine.count_id == c.id))).scalars().all()
    return _count_dict(c, lines)


@router.post("/counts/{count_id}/cancel",
             dependencies=[Depends(require_role("owner", "manager", "supervisor"))])
async def cancel_count(
    count_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    c = await session.get(PartnerStockCount, count_id)
    if not c or c.partner_id != partner.id:
        raise HTTPException(404, "Stock count not found")
    if c.status == "completed":
        raise HTTPException(409, "Cannot cancel a completed count")
    c.status = "cancelled"
    await session.commit()
    return _count_dict(c)


# ============================================================================
#                     Dashboard KPI extension
# ============================================================================

@router.get("/dashboard-kpis")
async def partner_inventory_kpis(
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Extended KPIs used by the partner Inventory landing / dashboard."""
    wh = await _primary_warehouse(session, partner.id)
    if not wh:
        return {"pending_receiving": 0, "pending_put_away": 0, "pending_counts": 0}
    pend_rcv = await session.scalar(select(func.count(PartnerReceipt.id)).where(
        PartnerReceipt.partner_id == partner.id, PartnerReceipt.status.in_(["draft", "received", "verified"])
    )) or 0
    pend_put = await session.scalar(select(func.count(PartnerReceipt.id)).where(
        PartnerReceipt.partner_id == partner.id, PartnerReceipt.status == "put_away"
    )) or 0
    pend_cnt = await session.scalar(select(func.count(PartnerStockCount.id)).where(
        PartnerStockCount.partner_id == partner.id, PartnerStockCount.status.in_(["counting", "reconciling"])
    )) or 0
    return {
        "pending_receiving": pend_rcv,
        "pending_put_away": pend_put,
        "pending_counts": pend_cnt,
    }
