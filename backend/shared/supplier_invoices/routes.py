"""Supplier invoice HTTP routes — Phase 5.

Three surfaces, each with its own RBAC decorator:

    * partner_router  → /api/partner/invoices            (owner/manager approves/disputes)
    * supplier_router → /api/supplier/me/invoices        (edits + submit + PDF upload)
    * admin_router    → /api/admin/modules/mart/invoices (cross-network + override)

All state transitions run through the service module so 3-way match + audit
stay consistent regardless of which surface calls them.
"""
from __future__ import annotations
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, Partner, PurchaseOrder, PurchaseOrderLine, Supplier,
    SupplierInvoice, SupplierInvoiceAudit, SupplierInvoiceLine, Warehouse,
)
from core.providers import object_storage
from modules.mart_partner.staff_routes import (
    PartnerActor, get_partner_actor, require_role,
)
from shared.suppliers.portal_routes import get_current_supplier
from shared.supplier_invoices.service import (
    audit as inv_audit, invoice_dict, rerun_three_way_match,
)

log = logging.getLogger("baked.supplier_invoices")

partner_router  = APIRouter(prefix="/partner/invoices", tags=["partner-invoices"])
supplier_router = APIRouter(prefix="/supplier/me/invoices", tags=["supplier-invoices"])
admin_router    = APIRouter(prefix="/admin/modules/mart/invoices", tags=["admin-invoices"])


# ---------------------------------------------------------------------------
# Shared loaders
# ---------------------------------------------------------------------------

async def _load_invoice(session: AsyncSession, inv_id: str) -> SupplierInvoice:
    inv = await session.get(SupplierInvoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


async def _load_bundle(session: AsyncSession, inv: SupplierInvoice) -> dict:
    lines = (await session.execute(
        select(SupplierInvoiceLine).where(SupplierInvoiceLine.invoice_id == inv.id)
    )).scalars().all()
    audits = (await session.execute(
        select(SupplierInvoiceAudit).where(SupplierInvoiceAudit.invoice_id == inv.id)
        .order_by(SupplierInvoiceAudit.created_at.asc())
    )).scalars().all()
    partner = await session.get(Partner, inv.partner_id)
    supplier = await session.get(Supplier, inv.supplier_id)
    warehouse = await session.get(Warehouse, inv.warehouse_id)
    po = await session.get(PurchaseOrder, inv.po_id)
    return invoice_dict(inv, partner=partner, supplier=supplier, warehouse=warehouse,
                        po=po, lines=lines, audits=audits)


def _admin_dep():
    from shared.admin.routes import get_current_admin  # local import to avoid cycles
    return get_current_admin


# ---------------------------------------------------------------------------
# Supplier surface
# ---------------------------------------------------------------------------

class InvoiceLineEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: str
    qty_invoiced: Optional[int] = Field(None, ge=0)
    unit_cost_invoiced: Optional[float] = Field(None, ge=0)


class InvoiceEdit(BaseModel):
    supplier_invoice_number: Optional[str] = Field(None, max_length=80)
    invoice_date: Optional[date] = None
    lines: Optional[list[InvoiceLineEdit]] = None


class InvoiceSubmit(BaseModel):
    supplier_invoice_number: Optional[str] = Field(None, max_length=80)
    invoice_date: Optional[date] = None


def _serialize_list_row(inv: SupplierInvoice, partner: Optional[Partner], supplier: Optional[Supplier],
                       warehouse: Optional[Warehouse], po: Optional[PurchaseOrder]) -> dict:
    return {
        "id": inv.id, "code": inv.code, "status": inv.status, "match_status": inv.match_status,
        "supplier_invoice_number": inv.supplier_invoice_number,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "grand_total": float(inv.grand_total), "currency": inv.currency,
        "po_code": po.po_code if po else None,
        "partner": {"id": partner.id, "business_name": partner.business_name} if partner else None,
        "supplier": {"code": supplier.code, "business_name": supplier.business_name} if supplier else None,
        "warehouse": {"code": warehouse.code} if warehouse else None,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "submitted_at": inv.submitted_at.isoformat() if inv.submitted_at else None,
        "approved_at": inv.approved_at.isoformat() if inv.approved_at else None,
    }


async def _list_invoices(
    session: AsyncSession, *, partner_id: Optional[str] = None, supplier_id: Optional[str] = None,
    status: Optional[str] = None, q: Optional[str] = None, country: Optional[str] = None,
) -> dict:
    stmt = select(SupplierInvoice).order_by(SupplierInvoice.created_at.desc())
    if partner_id:  stmt = stmt.where(SupplierInvoice.partner_id == partner_id)
    if supplier_id: stmt = stmt.where(SupplierInvoice.supplier_id == supplier_id)
    if status:      stmt = stmt.where(SupplierInvoice.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(SupplierInvoice.code.ilike(like) | SupplierInvoice.supplier_invoice_number.ilike(like))
    if country:
        stmt = stmt.join(Supplier, Supplier.id == SupplierInvoice.supplier_id).where(Supplier.country == country.upper())

    rows = (await session.execute(stmt.limit(500))).scalars().all()

    # Buckets — always compute across the same partner/supplier scope
    bstmt = select(SupplierInvoice.status, func.count(SupplierInvoice.id))
    if partner_id:  bstmt = bstmt.where(SupplierInvoice.partner_id == partner_id)
    if supplier_id: bstmt = bstmt.where(SupplierInvoice.supplier_id == supplier_id)
    if country:
        bstmt = bstmt.join(Supplier, Supplier.id == SupplierInvoice.supplier_id).where(Supplier.country == country.upper())
    bstmt = bstmt.group_by(SupplierInvoice.status)
    buckets = {s: n for s, n in (await session.execute(bstmt)).all()}

    partner_ids = {r.partner_id for r in rows}
    supplier_ids = {r.supplier_id for r in rows}
    warehouse_ids = {r.warehouse_id for r in rows}
    po_ids = {r.po_id for r in rows}
    partners = {p.id: p for p in (await session.execute(select(Partner).where(Partner.id.in_(partner_ids)))).scalars().all()} if partner_ids else {}
    suppliers = {s.id: s for s in (await session.execute(select(Supplier).where(Supplier.id.in_(supplier_ids)))).scalars().all()} if supplier_ids else {}
    warehouses = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(warehouse_ids)))).scalars().all()} if warehouse_ids else {}
    pos = {p.id: p for p in (await session.execute(select(PurchaseOrder).where(PurchaseOrder.id.in_(po_ids)))).scalars().all()} if po_ids else {}

    return {
        "items": [_serialize_list_row(r, partners.get(r.partner_id), suppliers.get(r.supplier_id),
                                      warehouses.get(r.warehouse_id), pos.get(r.po_id)) for r in rows],
        "buckets": buckets,
    }


# ---- Supplier endpoints ---------------------------------------------------

@supplier_router.get("")
async def supplier_list(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    return await _list_invoices(session, supplier_id=supplier.id, status=status)


@supplier_router.get("/{inv_id}")
async def supplier_get(inv_id: str,
                       session: AsyncSession = Depends(get_session),
                       supplier: Supplier = Depends(get_current_supplier)):
    inv = await _load_invoice(session, inv_id)
    if inv.supplier_id != supplier.id:
        raise HTTPException(404, "Invoice not found")
    return await _load_bundle(session, inv)


@supplier_router.patch("/{inv_id}")
async def supplier_edit(
    inv_id: str, payload: InvoiceEdit,
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    inv = await _load_invoice(session, inv_id)
    if inv.supplier_id != supplier.id:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "draft":
        raise HTTPException(409, f"Cannot edit a {inv.status} invoice")

    if payload.supplier_invoice_number is not None:
        inv.supplier_invoice_number = payload.supplier_invoice_number.strip() or None
    if payload.invoice_date is not None:
        inv.invoice_date = payload.invoice_date
    if payload.lines:
        by_id = {ln.id: ln for ln in (await session.execute(
            select(SupplierInvoiceLine).where(SupplierInvoiceLine.invoice_id == inv.id)
        )).scalars().all()}
        for edit in payload.lines:
            ln = by_id.get(edit.line_id)
            if not ln:
                continue
            if edit.qty_invoiced is not None: ln.qty_invoiced = edit.qty_invoiced
            if edit.unit_cost_invoiced is not None: ln.unit_cost_invoiced = edit.unit_cost_invoiced  # type: ignore
        await rerun_three_way_match(session, inv)

    await inv_audit(session, inv, actor_kind="supplier", actor_id=supplier.id,
                    actor_label=supplier.business_name, action="edit",
                    notes="Supplier edited draft")
    await session.commit()
    return await _load_bundle(session, inv)


@supplier_router.post("/{inv_id}/upload")
async def supplier_upload_invoice_pdf(
    inv_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    inv = await _load_invoice(session, inv_id)
    if inv.supplier_id != supplier.id:
        raise HTTPException(404, "Invoice not found")
    if inv.status not in ("draft", "submitted", "variance"):
        raise HTTPException(409, f"Cannot upload document on {inv.status} invoice")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "Max file size is 15 MB")
    ct = (file.content_type or "application/pdf").lower()
    if not (ct.startswith("application/pdf") or ct.startswith("image/")):
        raise HTTPException(415, f"Unsupported content type: {ct}")
    ext = "pdf" if ct.startswith("application/pdf") else "bin"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()[:8]
    path = f"{object_storage.APP_NAME}/supplier_invoices/{inv.id}/{uuid.uuid4().hex}.{ext}"
    try:
        result = object_storage.put_object(path, data, ct)
    except Exception as exc:  # noqa: BLE001
        log.exception("supplier_invoice.upload_failed", extra={"invoice": inv.id})
        raise HTTPException(502, {"code": "storage_upload_failed", "message": str(exc)}) from exc

    inv.invoice_document_storage_path = result["path"]
    inv.invoice_document_uploaded_at = datetime.now(timezone.utc)
    await inv_audit(session, inv, actor_kind="supplier", actor_id=supplier.id,
                    actor_label=supplier.business_name, action="upload_document",
                    notes=file.filename)
    await session.commit()
    return {"storage_path": result["path"], "size_bytes": result.get("size", len(data)), "content_type": ct}


@supplier_router.post("/{inv_id}/submit")
async def supplier_submit(
    inv_id: str, payload: InvoiceSubmit = InvoiceSubmit(),
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(get_current_supplier),
):
    inv = await _load_invoice(session, inv_id)
    if inv.supplier_id != supplier.id:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "draft":
        raise HTTPException(409, f"Cannot submit a {inv.status} invoice")

    # Late-set required fields
    if payload.supplier_invoice_number:
        inv.supplier_invoice_number = payload.supplier_invoice_number.strip() or None
    if payload.invoice_date:
        inv.invoice_date = payload.invoice_date

    missing = []
    if not inv.supplier_invoice_number: missing.append("supplier_invoice_number")
    if not inv.invoice_date: missing.append("invoice_date")
    if not inv.invoice_document_storage_path: missing.append("invoice_document")
    if missing:
        raise HTTPException(400, {"code": "missing_fields", "fields": missing})

    await rerun_three_way_match(session, inv)
    prev = inv.status
    inv.status = "matched" if inv.match_status == "matched" else "variance"
    inv.submitted_at = datetime.now(timezone.utc)
    inv.matched_at = inv.submitted_at
    await inv_audit(session, inv, actor_kind="supplier", actor_id=supplier.id,
                    actor_label=supplier.business_name, action="submit",
                    from_status=prev, to_status=inv.status,
                    notes=f"Match: {inv.match_status}")
    await session.commit()
    return await _load_bundle(session, inv)


# ---- Partner endpoints ----------------------------------------------------

class ApproveIn(BaseModel):
    notes: Optional[str] = Field(None, max_length=1000)


class DisputeIn(BaseModel):
    reason: str = Field(..., min_length=6, max_length=1000)


@partner_router.get("")
async def partner_list(
    status: Optional[str] = None,
    actor: PartnerActor = Depends(get_partner_actor),
    session: AsyncSession = Depends(get_session),
):
    return await _list_invoices(session, partner_id=actor.partner_id, status=status)


@partner_router.get("/{inv_id}")
async def partner_get(inv_id: str,
                     actor: PartnerActor = Depends(get_partner_actor),
                     session: AsyncSession = Depends(get_session)):
    inv = await _load_invoice(session, inv_id)
    if inv.partner_id != actor.partner_id:
        raise HTTPException(404, "Invoice not found")
    return await _load_bundle(session, inv)


@partner_router.post("/{inv_id}/approve")
async def partner_approve(
    inv_id: str, payload: ApproveIn = ApproveIn(),
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    inv = await _load_invoice(session, inv_id)
    if inv.partner_id != actor.partner_id:
        raise HTTPException(404, "Invoice not found")
    if inv.status not in ("matched", "variance"):
        raise HTTPException(409, f"Cannot approve a {inv.status} invoice")
    if inv.status == "variance" and not (payload.notes and payload.notes.strip()):
        raise HTTPException(400, {"code": "variance_approval_notes_required",
                                  "message": "Approving a variance invoice requires a note explaining why."})
    prev = inv.status
    inv.status = "approved"
    inv.approved_at = datetime.now(timezone.utc)
    inv.approval_notes = (payload.notes or "").strip() or None
    await inv_audit(session, inv, actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                    actor_id=actor.actor_id, actor_label=getattr(actor, "actor_label", "partner"),
                    action="approve", from_status=prev, to_status="approved",
                    notes=inv.approval_notes)
    await session.commit()
    return await _load_bundle(session, inv)


@partner_router.post("/{inv_id}/dispute")
async def partner_dispute(
    inv_id: str, payload: DisputeIn,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    inv = await _load_invoice(session, inv_id)
    if inv.partner_id != actor.partner_id:
        raise HTTPException(404, "Invoice not found")
    if inv.status not in ("matched", "variance"):
        raise HTTPException(409, f"Cannot dispute a {inv.status} invoice")
    prev = inv.status
    inv.status = "disputed"
    inv.disputed_at = datetime.now(timezone.utc)
    inv.dispute_reason = payload.reason.strip()
    await inv_audit(session, inv, actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
                    actor_id=actor.actor_id, actor_label=getattr(actor, "actor_label", "partner"),
                    action="dispute", from_status=prev, to_status="disputed",
                    notes=inv.dispute_reason)
    await session.commit()
    return await _load_bundle(session, inv)


# ---- Admin endpoints ------------------------------------------------------

class OverrideIn(BaseModel):
    action: str = Field(..., pattern=r"^(approve|dispute|reset_to_draft)$")
    reason: str = Field(..., min_length=6, max_length=1000)


@admin_router.get("")
async def admin_list(
    status: Optional[str] = None, country: Optional[str] = None, q: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),  # noqa: B008
):
    return await _list_invoices(session, status=status, country=country, q=q)


@admin_router.get("/{inv_id}")
async def admin_get(inv_id: str,
                   session: AsyncSession = Depends(get_session),
                   admin: AdminUser = Depends(_admin_dep())):  # noqa: B008
    inv = await _load_invoice(session, inv_id)
    return await _load_bundle(session, inv)


@admin_router.post("/{inv_id}/override")
async def admin_override(
    inv_id: str, payload: OverrideIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),  # noqa: B008
):
    inv = await _load_invoice(session, inv_id)
    prev = inv.status
    now = datetime.now(timezone.utc)
    if payload.action == "approve":
        inv.status = "approved"; inv.approved_at = now
    elif payload.action == "dispute":
        inv.status = "disputed"; inv.disputed_at = now
        inv.dispute_reason = payload.reason
    elif payload.action == "reset_to_draft":
        inv.status = "draft"
        inv.submitted_at = None; inv.matched_at = None
        inv.approved_at = None; inv.disputed_at = None
        inv.match_status = None
    inv.override_notes = f"[{payload.action}] {payload.reason}"
    await inv_audit(session, inv, actor_kind="admin", actor_id=admin.id,
                    actor_label=admin.email, action=f"override_{payload.action}",
                    from_status=prev, to_status=inv.status,
                    notes=payload.reason)
    await session.commit()
    return await _load_bundle(session, inv)


# ---- Document proxy (all roles) ------------------------------------------

def _can_access_document(inv: SupplierInvoice, *, partner_id: Optional[str] = None,
                         supplier_id: Optional[str] = None, is_admin: bool = False) -> bool:
    if is_admin: return True
    if partner_id and inv.partner_id == partner_id: return True
    if supplier_id and inv.supplier_id == supplier_id: return True
    return False


@supplier_router.get("/{inv_id}/document")
async def supplier_download_document(inv_id: str,
                                     session: AsyncSession = Depends(get_session),
                                     supplier: Supplier = Depends(get_current_supplier)):
    inv = await _load_invoice(session, inv_id)
    if not _can_access_document(inv, supplier_id=supplier.id):
        raise HTTPException(404, "Invoice not found")
    if not inv.invoice_document_storage_path:
        raise HTTPException(404, "No document uploaded")
    body, ct = object_storage.get_object(inv.invoice_document_storage_path)
    return Response(content=body, media_type=ct)


@partner_router.get("/{inv_id}/document")
async def partner_download_document(inv_id: str,
                                    actor: PartnerActor = Depends(get_partner_actor),
                                    session: AsyncSession = Depends(get_session)):
    inv = await _load_invoice(session, inv_id)
    if not _can_access_document(inv, partner_id=actor.partner_id):
        raise HTTPException(404, "Invoice not found")
    if not inv.invoice_document_storage_path:
        raise HTTPException(404, "No document uploaded")
    body, ct = object_storage.get_object(inv.invoice_document_storage_path)
    return Response(content=body, media_type=ct)


@admin_router.get("/{inv_id}/document")
async def admin_download_document(inv_id: str,
                                 session: AsyncSession = Depends(get_session),
                                 admin: AdminUser = Depends(_admin_dep())):  # noqa: B008
    inv = await _load_invoice(session, inv_id)
    if not inv.invoice_document_storage_path:
        raise HTTPException(404, "No document uploaded")
    body, ct = object_storage.get_object(inv.invoice_document_storage_path)
    return Response(content=body, media_type=ct)
