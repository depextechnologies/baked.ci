"""Purchase Orders — Phase 3 backend routes.

Three router surfaces, each with its own RBAC dep:

  Partner (buyer)  /api/partner/purchase-orders/*
    - list, get, create (draft), add-line, update-line, remove-line, submit,
      cancel (only before acknowledged), receive (partial or full).
    - RBAC: owner + manager + supervisor + packer (list/receive), owner/manager
      (create/submit/cancel).
    - Store scoping: if the actor has a store_id, they can only see POs for that
      warehouse; owners see all their partner's POs.

  Supplier         /api/supplier/me/purchase-orders/*
    - list (own), get, acknowledge, mark-shipped, cancel-by-supplier.

  Super Admin      /api/admin/modules/mart/purchase-orders/*
    - list (cross-network), get, override-cancel, override-force-received.

Inventory-safe receipt: acquires `SELECT ... FOR UPDATE` on the target
`partner_inventory` row + on the `purchase_order_lines` rows to prevent
double-receiving. Writes a `receive` `PartnerStockMovement`. Rolls up qty
across all `purchase_order_receipt_lines` to auto-transition the header
between `partially_received` and `received`.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, MartProduct, Partner, PartnerInventory, PartnerProduct,
    PartnerStaff, PartnerStockMovement, PurchaseOrder, PurchaseOrderAudit,
    PurchaseOrderLine, PurchaseOrderReceipt, PurchaseOrderReceiptLine,
    Supplier, SupplierProduct, Warehouse,
)

from modules.mart_partner.staff_routes import (
    PartnerActor, get_partner_actor, require_role,
)
from shared.suppliers.portal_routes import get_current_supplier
from shared.purchase_orders.grn import (
    assemble_payload as _assemble_grn_payload,
    build_grn_pdf, build_grn_xlsx, build_grn_reference,
)
from shared.purchase_orders.notifications import dispatch_po_notification

log = logging.getLogger("baked.purchase_orders")

# ===========================================================================
# Helpers
# ===========================================================================

def _q(x) -> float:
    """Coerce Numeric → float for JSON."""
    return float(x) if x is not None else None


def _po_dict(po: PurchaseOrder, supplier: Optional[Supplier] = None,
             partner: Optional[Partner] = None, warehouse: Optional[Warehouse] = None) -> dict:
    d = {
        "id": po.id, "po_code": po.po_code, "status": po.status,
        "partner_id": po.partner_id, "warehouse_id": po.warehouse_id,
        "supplier_id": po.supplier_id, "currency": po.currency,
        "expected_delivery_date": po.expected_delivery_date.isoformat() if po.expected_delivery_date else None,
        "notes": po.notes,
        "subtotal": _q(po.subtotal), "tax_total": _q(po.tax_total), "grand_total": _q(po.grand_total),
        "submitted_at": po.submitted_at.isoformat() if po.submitted_at else None,
        "acknowledged_at": po.acknowledged_at.isoformat() if po.acknowledged_at else None,
        "shipped_at": po.shipped_at.isoformat() if po.shipped_at else None,
        "received_at": po.received_at.isoformat() if po.received_at else None,
        "cancelled_at": po.cancelled_at.isoformat() if po.cancelled_at else None,
        "cancellation_reason": po.cancellation_reason,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "updated_at": po.updated_at.isoformat() if po.updated_at else None,
    }
    if supplier:
        d["supplier"] = {"id": supplier.id, "business_name": supplier.business_name,
                          "code": supplier.code, "country": supplier.country}
    if partner:
        d["partner"] = {"id": partner.id, "code": getattr(partner, "code", None),
                         "business_name": partner.business_name}
    if warehouse:
        d["warehouse"] = {"id": warehouse.id, "code": warehouse.code, "name": warehouse.name}
    return d


def _line_dict(ln: PurchaseOrderLine) -> dict:
    return {
        "id": ln.id, "purchase_order_id": ln.purchase_order_id,
        "supplier_product_id": ln.supplier_product_id,
        "master_product_id": ln.master_product_id,
        "supplier_sku": ln.supplier_sku, "product_name": ln.product_name,
        "qty_ordered": ln.qty_ordered, "qty_received": ln.qty_received,
        "unit_cost": _q(ln.unit_cost), "tax_pct": _q(ln.tax_pct),
        "line_subtotal": _q(ln.line_subtotal), "line_tax": _q(ln.line_tax),
        "line_total": _q(ln.line_total),
        "notes": ln.notes,
    }


async def _recompute_totals(session: AsyncSession, po: PurchaseOrder) -> None:
    rows = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    subtotal = 0.0
    tax_total = 0.0
    for ln in rows:
        sub = float(ln.unit_cost) * ln.qty_ordered
        tax = sub * float(ln.tax_pct) / 100.0
        ln.line_subtotal = round(sub, 4)
        ln.line_tax = round(tax, 4)
        ln.line_total = round(sub + tax, 4)
        subtotal += sub
        tax_total += tax
    po.subtotal = round(subtotal, 4)
    po.tax_total = round(tax_total, 4)
    po.grand_total = round(subtotal + tax_total, 4)


async def _next_po_code(session: AsyncSession, country: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"PO-{country}-{year}-"
    n = (await session.scalar(
        select(func.count(PurchaseOrder.id)).where(PurchaseOrder.po_code.like(f"{prefix}%"))
    )) or 0
    return f"{prefix}{n + 1:05d}"


async def _load_po_or_404(session: AsyncSession, po_id: str) -> PurchaseOrder:
    po = await session.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    return po


def _actor_label(actor: PartnerActor) -> str:
    if actor.actor_kind == "owner":
        return f"Owner · {actor.partner.business_name}"
    return f"Staff · {actor.actor_email}"


async def _audit(session: AsyncSession, po: PurchaseOrder, *,
                 actor_kind: str, actor_id: Optional[str], actor_label: Optional[str],
                 action: str, from_status: Optional[str] = None,
                 to_status: Optional[str] = None, notes: Optional[str] = None) -> None:
    session.add(PurchaseOrderAudit(
        purchase_order_id=po.id, actor_kind=actor_kind, actor_id=actor_id,
        actor_label=actor_label, action=action,
        from_status=from_status, to_status=to_status, notes=notes,
    ))


# ===========================================================================
# GRN Helpers (Phase 4)
# ===========================================================================

async def _load_grn_bundle(
    session: AsyncSession, po: PurchaseOrder, *, target_receipt_id: Optional[str] = None,
) -> dict:
    """Fetches everything the GRN generators need and returns the payload dict.

    Access control is enforced by the *caller* — this only assembles data.
    """
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    receipts = (await session.execute(
        select(PurchaseOrderReceipt).where(PurchaseOrderReceipt.purchase_order_id == po.id)
        .order_by(PurchaseOrderReceipt.received_at.asc())
    )).scalars().all()
    receipt_lines = (await session.execute(
        select(PurchaseOrderReceiptLine).where(
            PurchaseOrderReceiptLine.receipt_id.in_([r.id for r in receipts]) if receipts else False  # type: ignore
        )
    )).scalars().all() if receipts else []
    by_receipt: dict[str, list[PurchaseOrderReceiptLine]] = {}
    for rl in receipt_lines:
        by_receipt.setdefault(rl.receipt_id, []).append(rl)

    target = None
    if target_receipt_id:
        target = next((r for r in receipts if r.id == target_receipt_id), None)
        if not target:
            raise HTTPException(404, "Receipt not found for this PO")

    partner = await session.get(Partner, po.partner_id)
    supplier = await session.get(Supplier, po.supplier_id)
    warehouse = await session.get(Warehouse, po.warehouse_id)

    def _party_addr(w: Optional[Warehouse]) -> str:
        if not w:
            return ""
        parts = [w.address_line, w.city, w.region, w.country]
        return ", ".join([p for p in parts if p])

    buyer = {
        "name": partner.business_name if partner else "—",
        "code": warehouse.code if warehouse else None,
        "address": _party_addr(warehouse),
        "country": partner.country if partner else None,
        "tax_id": None,
        "email": getattr(partner, "owner_email", None) if partner else None,
        "phone": getattr(partner, "owner_phone", None) if partner else None,
    }
    supplier_dict = {
        "name": supplier.trading_name or supplier.business_name if supplier else "—",
        "code": supplier.code if supplier else None,
        "country": supplier.country if supplier else None,
        "tax_id": supplier.tax_id if supplier else None,
        "registration_number": supplier.registration_number if supplier else None,
        "email": supplier.business_email if supplier else None,
        "phone": supplier.business_phone if supplier else None,
    }

    return _assemble_grn_payload(
        po=po, lines=lines, receipts=receipts,
        receipt_lines_by_receipt=by_receipt,
        buyer=buyer, supplier=supplier_dict,
        target_receipt=target,
    )


def _grn_list_response(po: PurchaseOrder, receipts_ordered: list) -> dict:
    """Compact metadata for the frontend GRN modal."""
    return {
        "po_code": po.po_code,
        "consolidated": {
            "reference": build_grn_reference(po.po_code, "consolidated"),
            "available": True,
        },
        "receipts": [
            {
                "id": r.id, "sequence": idx + 1,
                "reference": build_grn_reference(po.po_code, "receipt", idx + 1),
                "received_at": r.received_at.isoformat(),
                "notes": r.notes,
            }
            for idx, r in enumerate(receipts_ordered)
        ],
    }


async def _list_receipts(session: AsyncSession, po: PurchaseOrder) -> list:
    return (await session.execute(
        select(PurchaseOrderReceipt).where(PurchaseOrderReceipt.purchase_order_id == po.id)
        .order_by(PurchaseOrderReceipt.received_at.asc())
    )).scalars().all()


def _grn_response(payload: dict, fmt: str) -> Response:
    """Serialize payload to `fmt` ('pdf'|'xlsx') and wrap in FastAPI Response."""
    fname = f"{payload['grn_reference']}.{fmt}"
    if fmt == "pdf":
        body = build_grn_pdf(payload)
        media = "application/pdf"
    elif fmt == "xlsx":
        body = build_grn_xlsx(payload)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise HTTPException(400, "Unsupported GRN format")
    return Response(
        content=body, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ===========================================================================
# PARTNER (BUYER) ROUTER
# ===========================================================================

partner_router = APIRouter(prefix="/partner/purchase-orders", tags=["partner-purchase-orders"])


class POCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_id: str
    warehouse_id: str
    expected_delivery_date: Optional[str] = None
    notes: Optional[str] = None


class POLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    supplier_product_id: str
    qty_ordered: int = Field(..., ge=1)
    unit_cost: Optional[float] = Field(None, ge=0)  # if omitted use supplier catalogue cost
    tax_pct: Optional[float] = Field(None, ge=0, le=99)
    notes: Optional[str] = None


class POLinePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    qty_ordered: Optional[int] = Field(None, ge=1)
    unit_cost: Optional[float] = Field(None, ge=0)
    tax_pct: Optional[float] = Field(None, ge=0, le=99)
    notes: Optional[str] = None


class ReceiveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lines: List[dict] = Field(..., min_length=1)
    notes: Optional[str] = None


def _scoped_po_query(actor: PartnerActor):
    """Scopes the query to the actor's partner (+ store if staff)."""
    stmt = select(PurchaseOrder).where(PurchaseOrder.partner_id == actor.partner_id)
    if actor.actor_kind == "staff" and actor.store_id:
        stmt = stmt.where(PurchaseOrder.warehouse_id == actor.store_id)
    return stmt


@partner_router.get("/suppliers")
async def partner_list_suppliers(
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    """Partner-side lookup: approved suppliers in the partner's country."""
    partner = actor.partner
    rows = (await session.execute(
        select(Supplier).where(
            Supplier.status == "approved",
            Supplier.country == partner.country,
        ).order_by(Supplier.business_name)
    )).scalars().all()
    return {"items": [{
        "id": s.id, "code": s.code, "business_name": s.business_name,
        "trading_name": s.trading_name, "country": s.country,
        "default_currency": s.default_currency,
    } for s in rows]}


@partner_router.get("/supplier-catalogue")
async def partner_supplier_catalogue(
    supplier_id: str = Query(...),
    q: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    """Partner-side type-ahead over a supplier's approved catalogue."""
    supplier = await session.get(Supplier, supplier_id)
    if not supplier or supplier.status != "approved":
        raise HTTPException(404, "Supplier not found")
    if supplier.country != actor.partner.country:
        raise HTTPException(403, "Supplier not in your country")
    stmt = select(SupplierProduct, MartProduct).join(
        MartProduct, MartProduct.id == SupplierProduct.master_product_id
    ).where(SupplierProduct.supplier_id == supplier_id,
            SupplierProduct.is_active.is_(True)).limit(30)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (MartProduct.name.ilike(like))
            | (SupplierProduct.supplier_sku.ilike(like))
            | (MartProduct.sku_code.ilike(like))
        )
    rows = (await session.execute(stmt)).all()
    return {"items": [{
        "id": sp.id, "supplier_sku": sp.supplier_sku,
        "cost_price": _q(sp.cost_price), "currency": sp.currency,
        "moq": sp.moq, "lead_time_days": sp.lead_time_days,
        "master": {
            "id": mp.id, "name": mp.name, "sku": mp.sku_code,
            "brand": mp.brand, "image_url": mp.image,
        },
    } for sp, mp in rows]}


@partner_router.get("")
async def partner_list_pos(
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    stmt = _scoped_po_query(actor).order_by(PurchaseOrder.created_at.desc())
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if q:
        stmt = stmt.where(PurchaseOrder.po_code.ilike(f"%{q}%"))
    rows = (await session.execute(stmt)).scalars().all()
    # Bucket counts
    bstmt = select(PurchaseOrder.status, func.count(PurchaseOrder.id)).where(
        PurchaseOrder.partner_id == actor.partner_id
    ).group_by(PurchaseOrder.status)
    if actor.actor_kind == "staff" and actor.store_id:
        bstmt = bstmt.where(PurchaseOrder.warehouse_id == actor.store_id)
    brows = (await session.execute(bstmt)).all()
    buckets = {s: 0 for s in ("draft", "submitted", "acknowledged", "shipped",
                              "partially_received", "received", "cancelled")}
    for s, c in brows:
        buckets[s] = c
    # Enrich with supplier + warehouse names
    supplier_ids = list({p.supplier_id for p in rows})
    warehouse_ids = list({p.warehouse_id for p in rows})
    sup_map = {s.id: s for s in (await session.execute(
        select(Supplier).where(Supplier.id.in_(supplier_ids)))).scalars().all()} if supplier_ids else {}
    wh_map = {w.id: w for w in (await session.execute(
        select(Warehouse).where(Warehouse.id.in_(warehouse_ids)))).scalars().all()} if warehouse_ids else {}
    items = [_po_dict(p, supplier=sup_map.get(p.supplier_id), warehouse=wh_map.get(p.warehouse_id)) for p in rows]
    return {"items": items, "buckets": buckets}


@partner_router.get("/{po_id}")
async def partner_get_po(
    po_id: str, session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id:
        raise HTTPException(404, "PO not found")
    if actor.actor_kind == "staff" and actor.store_id and po.warehouse_id != actor.store_id:
        raise HTTPException(404, "PO not found")
    supplier = await session.get(Supplier, po.supplier_id)
    warehouse = await session.get(Warehouse, po.warehouse_id)
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    receipts = (await session.execute(
        select(PurchaseOrderReceipt).where(PurchaseOrderReceipt.purchase_order_id == po.id)
        .order_by(PurchaseOrderReceipt.received_at.desc())
    )).scalars().all()
    audits = (await session.execute(
        select(PurchaseOrderAudit).where(PurchaseOrderAudit.purchase_order_id == po.id)
        .order_by(PurchaseOrderAudit.created_at.desc())
    )).scalars().all()
    return {
        **_po_dict(po, supplier=supplier, warehouse=warehouse),
        "lines": [_line_dict(l) for l in lines],
        "receipts": [{
            "id": r.id, "received_at": r.received_at.isoformat(),
            "notes": r.notes,
        } for r in receipts],
        "audit_trail": [{
            "id": a.id, "action": a.action, "actor_kind": a.actor_kind,
            "actor_label": a.actor_label,
            "from_status": a.from_status, "to_status": a.to_status,
            "notes": a.notes,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in audits],
    }


async def _partner_po_or_404(session: AsyncSession, po_id: str, actor: PartnerActor) -> PurchaseOrder:
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id:
        raise HTTPException(404, "PO not found")
    if actor.actor_kind == "staff" and actor.store_id and po.warehouse_id != actor.store_id:
        raise HTTPException(404, "PO not found")
    return po


@partner_router.get("/{po_id}/grn")
async def partner_grn_list(
    po_id: str, session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _partner_po_or_404(session, po_id, actor)
    receipts = await _list_receipts(session, po)
    return _grn_list_response(po, receipts)


@partner_router.get("/{po_id}/grn.pdf")
async def partner_grn_pdf(
    po_id: str, session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _partner_po_or_404(session, po_id, actor)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "pdf")


@partner_router.get("/{po_id}/grn.xlsx")
async def partner_grn_xlsx(
    po_id: str, session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _partner_po_or_404(session, po_id, actor)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "xlsx")


@partner_router.get("/{po_id}/receipts/{receipt_id}/grn.pdf")
async def partner_receipt_grn_pdf(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _partner_po_or_404(session, po_id, actor)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "pdf")


@partner_router.get("/{po_id}/receipts/{receipt_id}/grn.xlsx")
async def partner_receipt_grn_xlsx(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(get_partner_actor),
):
    po = await _partner_po_or_404(session, po_id, actor)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "xlsx")


@partner_router.post("", status_code=201)
async def partner_create_po(
    payload: POCreate,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    warehouse = await session.get(Warehouse, payload.warehouse_id)
    if not warehouse or warehouse.partner_id != actor.partner_id:
        raise HTTPException(400, "warehouse not found for your partner")
    if actor.actor_kind == "staff" and actor.store_id and payload.warehouse_id != actor.store_id:
        raise HTTPException(403, "Cannot create PO for a different store")
    supplier = await session.get(Supplier, payload.supplier_id)
    if not supplier or supplier.status != "approved":
        raise HTTPException(400, "Supplier not found or not approved")
    if supplier.country != warehouse.country:
        raise HTTPException(400, "Supplier and warehouse must be in the same country")

    from datetime import date as _date
    code = await _next_po_code(session, supplier.country)
    po = PurchaseOrder(
        po_code=code, partner_id=actor.partner_id, warehouse_id=warehouse.id,
        supplier_id=supplier.id, currency=supplier.default_currency,
        expected_delivery_date=_date.fromisoformat(payload.expected_delivery_date) if payload.expected_delivery_date else None,
        notes=payload.notes,
        created_by_partner_id=actor.partner.id if actor.actor_kind == "owner" else None,
        created_by_staff_id=actor.staff.id if actor.staff else None,
    )
    session.add(po)
    await session.flush()
    await _audit(session, po, actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                 actor_id=actor.actor_id, actor_label=_actor_label(actor),
                 action="create", to_status="draft")
    await session.commit()
    await session.refresh(po)
    return _po_dict(po, supplier=supplier, warehouse=warehouse)


@partner_router.post("/{po_id}/lines", status_code=201)
async def partner_add_line(
    po_id: str, payload: POLineIn,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id or po.status != "draft":
        raise HTTPException(409, "Can only add lines to your own draft PO")
    sp = await session.get(SupplierProduct, payload.supplier_product_id)
    if not sp or sp.supplier_id != po.supplier_id or not sp.is_active:
        raise HTTPException(400, "Supplier product not linked to this supplier or inactive")
    mp = await session.get(MartProduct, sp.master_product_id)
    unit_cost = payload.unit_cost if payload.unit_cost is not None else float(sp.cost_price)
    tax_pct = payload.tax_pct if payload.tax_pct is not None else float(getattr(mp, "tax_pct", None) or 0)
    ln = PurchaseOrderLine(
        purchase_order_id=po.id, supplier_product_id=sp.id,
        master_product_id=sp.master_product_id, supplier_sku=sp.supplier_sku,
        product_name=mp.name if mp else "Unknown",
        qty_ordered=payload.qty_ordered, unit_cost=unit_cost, tax_pct=tax_pct,
        notes=payload.notes,
    )
    session.add(ln)
    await session.flush()
    await _recompute_totals(session, po)
    await session.commit()
    await session.refresh(ln)
    return _line_dict(ln)


@partner_router.patch("/{po_id}/lines/{line_id}")
async def partner_update_line(
    po_id: str, line_id: str, payload: POLinePatch,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id or po.status != "draft":
        raise HTTPException(409, "Only draft POs can be edited")
    ln = await session.get(PurchaseOrderLine, line_id)
    if not ln or ln.purchase_order_id != po.id:
        raise HTTPException(404, "Line not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ln, k, v)
    await _recompute_totals(session, po)
    await session.commit()
    return _line_dict(ln)


@partner_router.delete("/{po_id}/lines/{line_id}")
async def partner_delete_line(
    po_id: str, line_id: str,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id or po.status != "draft":
        raise HTTPException(409, "Only draft POs can be edited")
    ln = await session.get(PurchaseOrderLine, line_id)
    if not ln or ln.purchase_order_id != po.id:
        raise HTTPException(404, "Line not found")
    await session.delete(ln)
    await _recompute_totals(session, po)
    await session.commit()
    return {"ok": True}


@partner_router.post("/{po_id}/submit")
async def partner_submit_po(
    po_id: str,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id or po.status != "draft":
        raise HTTPException(409, f"Cannot submit a {po.status} PO")
    lines = (await session.execute(
        select(func.count(PurchaseOrderLine.id)).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalar_one()
    if lines == 0:
        raise HTTPException(400, "Cannot submit a PO with no lines")
    po.status = "submitted"
    po.submitted_at = datetime.now(timezone.utc)
    await _audit(session, po, actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                 actor_id=actor.actor_id, actor_label=_actor_label(actor),
                 action="submit", from_status="draft", to_status="submitted")
    await session.commit()
    dispatch_po_notification("submitted", po.id)
    return _po_dict(po)


class CancelIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(..., min_length=1, max_length=500)


@partner_router.post("/{po_id}/cancel")
async def partner_cancel_po(
    po_id: str, payload: CancelIn,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id:
        raise HTTPException(404, "PO not found")
    if po.status not in ("draft", "submitted"):
        raise HTTPException(409, "PO can only be cancelled before it is acknowledged")
    prev = po.status
    po.status = "cancelled"
    po.cancelled_at = datetime.now(timezone.utc)
    po.cancellation_reason = payload.reason
    await _audit(session, po, actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                 actor_id=actor.actor_id, actor_label=_actor_label(actor),
                 action="cancel", from_status=prev, to_status="cancelled",
                 notes=payload.reason)
    await session.commit()
    return _po_dict(po)


@partner_router.post("/{po_id}/receive")
async def partner_receive_po(
    po_id: str, payload: ReceiveIn,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager", "supervisor", "packer")),
):
    """Record a receipt of goods. Atomically:
      1) Locks target PO lines (SELECT FOR UPDATE) to prevent double-receive
      2) Locks the target PartnerInventory row per SKU
      3) Increments available_qty + writes a `receive` stock movement
      4) Rolls up header to partially_received / received
    """
    po = await _load_po_or_404(session, po_id)
    if po.partner_id != actor.partner_id:
        raise HTTPException(404, "PO not found")
    if po.status not in ("acknowledged", "shipped", "partially_received"):
        raise HTTPException(409, f"Cannot receive a {po.status} PO")

    # Lock all lines up-front for the atomic invariant.
    line_ids = [item.get("po_line_id") for item in payload.lines]
    if not line_ids or any(not lid for lid in line_ids):
        raise HTTPException(400, "Each line must include po_line_id")
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.id.in_(line_ids)).with_for_update()
    )).scalars().all()
    line_by_id = {l.id: l for l in lines}
    for item in payload.lines:
        ln = line_by_id.get(item["po_line_id"])
        if not ln or ln.purchase_order_id != po.id:
            raise HTTPException(400, f"Line {item['po_line_id']} not on this PO")
        try:
            qty = int(item.get("qty_received") or 0)
        except (TypeError, ValueError):
            raise HTTPException(400, "qty_received must be an integer")
        if qty < 1:
            raise HTTPException(400, "qty_received must be >= 1")
        remaining = ln.qty_ordered - ln.qty_received
        if qty > remaining:
            raise HTTPException(400, {
                "code": "over_receipt",
                "message": f"Line {ln.id}: only {remaining} remaining to receive",
            })

    receipt = PurchaseOrderReceipt(
        purchase_order_id=po.id, notes=payload.notes,
        received_by_partner_id=actor.partner.id if actor.actor_kind == "owner" else None,
        received_by_staff_id=actor.staff.id if actor.staff else None,
    )
    session.add(receipt)
    await session.flush()

    # Apply per-line: find PartnerInventory row (partner_product for this master
    # + warehouse), lock it, increment available_qty, write RECEIVE movement.
    for item in payload.lines:
        ln = line_by_id[item["po_line_id"]]
        qty = int(item["qty_received"])
        # Find PartnerProduct for master under this partner
        # Find PartnerProduct for master under this partner. Auto-create it
        # if missing — a PO receipt implies the partner is stocking this SKU,
        # so we materialise a `master`-source PartnerProduct in draft state
        # (is_active=False) so ops can price and enable it before storefront
        # exposure.
        pp = (await session.execute(
            select(PartnerProduct).where(
                PartnerProduct.partner_id == po.partner_id,
                PartnerProduct.master_product_id == ln.master_product_id,
            )
        )).scalar_one_or_none()
        if not pp:
            mp = await session.get(MartProduct, ln.master_product_id)
            pp = PartnerProduct(
                partner_id=po.partner_id, source="master",
                master_product_id=ln.master_product_id,
                sku_code=(mp.sku_code if mp else None),
                # Default partner_price to unit_cost so we never violate the
                # NOT NULL constraint; ops must set MRP before selling.
                partner_price=float(ln.unit_cost),
                currency=po.currency, stock_qty=0, is_active=False,
                approval_status="approved",
            )
            session.add(pp)
            await session.flush()
        inv = (await session.execute(
            select(PartnerInventory).where(
                PartnerInventory.partner_product_id == pp.id,
                PartnerInventory.warehouse_id == po.warehouse_id,
            ).with_for_update()
        )).scalar_one_or_none()
        if not inv:
            # Create a fresh inventory row locked-for-update if missing
            inv = PartnerInventory(
                partner_id=po.partner_id, partner_product_id=pp.id,
                warehouse_id=po.warehouse_id, available_qty=0, reserved_qty=0,
            )
            session.add(inv)
            await session.flush()
        before = inv.available_qty
        inv.available_qty += qty
        pp.stock_qty += qty
        mv = PartnerStockMovement(
            partner_id=po.partner_id, partner_product_id=pp.id,
            warehouse_id=po.warehouse_id, kind="receive",
            delta_qty=qty, before_qty=before, balance_after=inv.available_qty,
            reason=f"PO receipt {po.po_code}",
            reference=receipt.id,
            actor_id=actor.actor_id, actor_role=actor.role,
        )
        session.add(mv)
        await session.flush()
        session.add(PurchaseOrderReceiptLine(
            receipt_id=receipt.id, po_line_id=ln.id, qty_received=qty, movement_id=mv.id,
        ))
        ln.qty_received += qty

    # Roll up header status
    remaining_total = 0
    for ln in (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all():
        remaining_total += ln.qty_ordered - ln.qty_received
    prev = po.status
    if remaining_total == 0:
        po.status = "received"
        po.received_at = datetime.now(timezone.utc)
    else:
        po.status = "partially_received"
    await _audit(session, po,
                 actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                 actor_id=actor.actor_id, actor_label=_actor_label(actor),
                 action="receive", from_status=prev, to_status=po.status,
                 notes=payload.notes)
    await session.commit()
    await session.refresh(po)
    return _po_dict(po)


# ===========================================================================
# SUPPLIER ROUTER
# ===========================================================================

supplier_router = APIRouter(prefix="/supplier/me/purchase-orders", tags=["supplier-purchase-orders"])


@supplier_router.get("")
async def supplier_list_pos(
    status: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    stmt = select(PurchaseOrder).where(PurchaseOrder.supplier_id == supplier.id).order_by(PurchaseOrder.created_at.desc())
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    rows = (await session.execute(stmt)).scalars().all()
    # Bucket counts
    bstmt = select(PurchaseOrder.status, func.count(PurchaseOrder.id)).where(
        PurchaseOrder.supplier_id == supplier.id
    ).group_by(PurchaseOrder.status)
    brows = (await session.execute(bstmt)).all()
    buckets = {s: 0 for s in ("submitted", "acknowledged", "shipped",
                              "partially_received", "received", "cancelled")}
    for s, c in brows:
        buckets[s] = c
    # Enrich with partner + warehouse
    partner_ids = list({p.partner_id for p in rows})
    warehouse_ids = list({p.warehouse_id for p in rows})
    p_map = {p.id: p for p in (await session.execute(
        select(Partner).where(Partner.id.in_(partner_ids)))).scalars().all()} if partner_ids else {}
    w_map = {w.id: w for w in (await session.execute(
        select(Warehouse).where(Warehouse.id.in_(warehouse_ids)))).scalars().all()} if warehouse_ids else {}
    items = [_po_dict(p, partner=p_map.get(p.partner_id), warehouse=w_map.get(p.warehouse_id))
             for p in rows if p.status != "draft"]  # never expose drafts to supplier
    return {"items": items, "buckets": buckets}


@supplier_router.get("/{po_id}")
async def supplier_get_po(
    po_id: str, session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _load_po_or_404(session, po_id)
    if po.supplier_id != supplier.id or po.status == "draft":
        raise HTTPException(404, "PO not found")
    partner = await session.get(Partner, po.partner_id)
    warehouse = await session.get(Warehouse, po.warehouse_id)
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    return {
        **_po_dict(po, partner=partner, warehouse=warehouse),
        "lines": [_line_dict(l) for l in lines],
    }


class NotesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


@supplier_router.post("/{po_id}/acknowledge")
async def supplier_acknowledge_po(
    po_id: str, payload: NotesIn = NotesIn(),
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _load_po_or_404(session, po_id)
    if po.supplier_id != supplier.id:
        raise HTTPException(404, "PO not found")
    if po.status != "submitted":
        raise HTTPException(409, f"Cannot acknowledge a {po.status} PO")
    po.status = "acknowledged"
    po.acknowledged_at = datetime.now(timezone.utc)
    await _audit(session, po, actor_kind="supplier", actor_id=supplier.id,
                 actor_label=supplier.business_name, action="acknowledge",
                 from_status="submitted", to_status="acknowledged",
                 notes=payload.notes)
    await session.commit()
    dispatch_po_notification("acknowledged", po.id)
    return _po_dict(po)


@supplier_router.post("/{po_id}/ship")
async def supplier_ship_po(
    po_id: str, payload: NotesIn = NotesIn(),
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _load_po_or_404(session, po_id)
    if po.supplier_id != supplier.id:
        raise HTTPException(404, "PO not found")
    if po.status != "acknowledged":
        raise HTTPException(409, f"Cannot ship a {po.status} PO — must be acknowledged first")
    po.status = "shipped"
    po.shipped_at = datetime.now(timezone.utc)
    await _audit(session, po, actor_kind="supplier", actor_id=supplier.id,
                 actor_label=supplier.business_name, action="ship",
                 from_status="acknowledged", to_status="shipped",
                 notes=payload.notes)
    await session.commit()
    dispatch_po_notification("shipped", po.id)
    return _po_dict(po)


async def _supplier_po_or_404(session: AsyncSession, po_id: str, supplier: Supplier) -> PurchaseOrder:
    po = await _load_po_or_404(session, po_id)
    if po.supplier_id != supplier.id or po.status == "draft":
        raise HTTPException(404, "PO not found")
    return po


@supplier_router.get("/{po_id}/grn")
async def supplier_grn_list(
    po_id: str, session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _supplier_po_or_404(session, po_id, supplier)
    receipts = await _list_receipts(session, po)
    return _grn_list_response(po, receipts)


@supplier_router.get("/{po_id}/grn.pdf")
async def supplier_grn_pdf(
    po_id: str, session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _supplier_po_or_404(session, po_id, supplier)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "pdf")


@supplier_router.get("/{po_id}/grn.xlsx")
async def supplier_grn_xlsx(
    po_id: str, session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _supplier_po_or_404(session, po_id, supplier)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "xlsx")


@supplier_router.get("/{po_id}/receipts/{receipt_id}/grn.pdf")
async def supplier_receipt_grn_pdf(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _supplier_po_or_404(session, po_id, supplier)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "pdf")


@supplier_router.get("/{po_id}/receipts/{receipt_id}/grn.xlsx")
async def supplier_receipt_grn_xlsx(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    po = await _supplier_po_or_404(session, po_id, supplier)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "xlsx")


# ===========================================================================
# ADMIN ROUTER
# ===========================================================================

admin_router = APIRouter(prefix="/admin/modules/mart/purchase-orders", tags=["admin-purchase-orders"])


def _admin_dep():
    from shared.admin.routes import get_current_admin
    return get_current_admin


@admin_router.get("")
async def admin_list_pos(
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    stmt = select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if q:
        stmt = stmt.where(PurchaseOrder.po_code.ilike(f"%{q}%"))
    if country:
        # join through suppliers to filter by country
        stmt = stmt.join(Supplier, Supplier.id == PurchaseOrder.supplier_id).where(Supplier.country == country.upper())
    rows = (await session.execute(stmt)).scalars().all()
    # Enrichment
    supplier_ids = list({p.supplier_id for p in rows})
    partner_ids = list({p.partner_id for p in rows})
    wh_ids = list({p.warehouse_id for p in rows})
    sup_map = {s.id: s for s in (await session.execute(select(Supplier).where(Supplier.id.in_(supplier_ids)))).scalars().all()} if supplier_ids else {}
    p_map = {p.id: p for p in (await session.execute(select(Partner).where(Partner.id.in_(partner_ids)))).scalars().all()} if partner_ids else {}
    wh_map = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))).scalars().all()} if wh_ids else {}
    bstmt = select(PurchaseOrder.status, func.count(PurchaseOrder.id)).group_by(PurchaseOrder.status)
    brows = (await session.execute(bstmt)).all()
    buckets = {s: 0 for s in ("draft", "submitted", "acknowledged", "shipped",
                              "partially_received", "received", "cancelled")}
    for s, c in brows:
        buckets[s] = c
    items = [_po_dict(p, supplier=sup_map.get(p.supplier_id),
                      partner=p_map.get(p.partner_id),
                      warehouse=wh_map.get(p.warehouse_id)) for p in rows]
    return {"items": items, "buckets": buckets}


@admin_router.get("/{po_id}")
async def admin_get_po(
    po_id: str, session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    supplier = await session.get(Supplier, po.supplier_id)
    partner = await session.get(Partner, po.partner_id)
    warehouse = await session.get(Warehouse, po.warehouse_id)
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    audits = (await session.execute(
        select(PurchaseOrderAudit).where(PurchaseOrderAudit.purchase_order_id == po.id)
        .order_by(PurchaseOrderAudit.created_at.desc())
    )).scalars().all()
    return {
        **_po_dict(po, supplier=supplier, partner=partner, warehouse=warehouse),
        "lines": [_line_dict(l) for l in lines],
        "audit_trail": [{
            "id": a.id, "action": a.action, "actor_kind": a.actor_kind,
            "actor_label": a.actor_label,
            "from_status": a.from_status, "to_status": a.to_status,
            "notes": a.notes,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in audits],
    }


@admin_router.post("/{po_id}/override-cancel")
async def admin_override_cancel(
    po_id: str, payload: CancelIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """SA emergency override — force-cancel any PO that isn't already cancelled or received."""
    po = await _load_po_or_404(session, po_id)
    if po.status in ("cancelled", "received"):
        raise HTTPException(409, f"Cannot cancel a {po.status} PO")
    prev = po.status
    po.status = "cancelled"
    po.cancelled_at = datetime.now(timezone.utc)
    po.cancellation_reason = payload.reason
    await _audit(session, po, actor_kind="admin", actor_id=admin.id,
                 actor_label=f"Admin · {admin.email}",
                 action="override_cancel", from_status=prev, to_status="cancelled",
                 notes=payload.reason)
    await session.commit()
    return _po_dict(po)



@admin_router.get("/{po_id}/grn")
async def admin_grn_list(
    po_id: str, session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    receipts = await _list_receipts(session, po)
    return _grn_list_response(po, receipts)


@admin_router.get("/{po_id}/grn.pdf")
async def admin_grn_pdf(
    po_id: str, session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "pdf")


@admin_router.get("/{po_id}/grn.xlsx")
async def admin_grn_xlsx(
    po_id: str, session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    payload = await _load_grn_bundle(session, po)
    return _grn_response(payload, "xlsx")


@admin_router.get("/{po_id}/receipts/{receipt_id}/grn.pdf")
async def admin_receipt_grn_pdf(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "pdf")


@admin_router.get("/{po_id}/receipts/{receipt_id}/grn.xlsx")
async def admin_receipt_grn_xlsx(
    po_id: str, receipt_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    po = await _load_po_or_404(session, po_id)
    payload = await _load_grn_bundle(session, po, target_receipt_id=receipt_id)
    return _grn_response(payload, "xlsx")
