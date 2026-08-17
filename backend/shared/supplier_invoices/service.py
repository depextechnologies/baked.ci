"""Supplier invoicing — service layer (auto-draft, 3-way match)."""
from __future__ import annotations
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import (
    Partner, PurchaseOrder, PurchaseOrderLine, PurchaseOrderReceipt,
    PurchaseOrderReceiptLine, Supplier, SupplierInvoice, SupplierInvoiceAudit,
    SupplierInvoiceLine, Warehouse,
)


def get_unit_cost_tolerance_pct() -> Decimal:
    """Configurable ±% tolerance on unit_cost during 3-way match.

    MVP: read from env var so we can lift to a `platform_settings` row later
    without touching the match code.
    """
    raw = os.environ.get("PO_INVOICE_UNIT_COST_TOLERANCE_PCT", "2.0")
    try:
        return Decimal(raw)
    except Exception:  # noqa: BLE001
        return Decimal("2.0")


async def _next_invoice_code(session: AsyncSession, country: str) -> str:
    """`SINV-<CC>-<YYYY>-#####` deterministic per country."""
    year = datetime.now(timezone.utc).year
    prefix = f"SINV-{country.upper()}-{year}-"
    seq = (await session.execute(
        select(func.count(SupplierInvoice.id)).where(SupplierInvoice.code.like(f"{prefix}%"))
    )).scalar() or 0
    return f"{prefix}{seq + 1:05d}"


async def _line_data_from_po(session: AsyncSession, po: PurchaseOrder) -> list[dict]:
    """Assemble line-level PO + cumulative received qty snapshots."""
    lines = (await session.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
    )).scalars().all()
    receipts = (await session.execute(
        select(PurchaseOrderReceipt).where(PurchaseOrderReceipt.purchase_order_id == po.id)
    )).scalars().all()
    r_lines = (await session.execute(
        select(PurchaseOrderReceiptLine).where(
            PurchaseOrderReceiptLine.receipt_id.in_([r.id for r in receipts]) if receipts else False  # type: ignore
        )
    )).scalars().all() if receipts else []
    total_by_line: dict[str, int] = {ln.id: 0 for ln in lines}
    for rl in r_lines:
        total_by_line[rl.po_line_id] = total_by_line.get(rl.po_line_id, 0) + rl.qty_received
    return [{
        "po_line": ln,
        "qty_received": total_by_line.get(ln.id, 0),
    } for ln in lines]


def _run_line_match(
    qty_ordered: int, qty_received: int, qty_invoiced: int,
    unit_cost_po: Decimal, unit_cost_invoiced: Decimal, tolerance_pct: Decimal,
) -> tuple[str, Decimal]:
    """Return (match_status, unit_cost_variance_pct).

    Rules:
      * qty: EXACT match required against `qty_received` (GRN is source of truth).
      * cost: within ±tolerance_pct → matched; else cost_variance.
    """
    qty_ok = qty_invoiced == qty_received
    base = unit_cost_po if unit_cost_po else Decimal("1")
    var_pct = Decimal("0") if unit_cost_po == 0 else (
        ((unit_cost_invoiced - unit_cost_po) / base) * Decimal("100")
    ).quantize(Decimal("0.001"))
    cost_ok = abs(var_pct) <= tolerance_pct

    if qty_ok and cost_ok:
        status = "matched"
    elif not qty_ok and not cost_ok:
        status = "both_variance"
    elif not qty_ok:
        status = "qty_variance"
    else:
        status = "cost_variance"
    return status, var_pct


async def ensure_draft_invoice_for(session: AsyncSession, po_id: str) -> Optional[SupplierInvoice]:
    """Idempotently create a draft invoice for a `received` PO.

    Called from the PO receive handler once cumulative receipts match ordered
    quantities. Skipped silently if the PO isn't received, or if an invoice
    already exists (single-invoice-per-PO MVP).
    """
    po = await session.get(PurchaseOrder, po_id)
    if not po or po.status != "received":
        return None
    existing = (await session.execute(
        select(SupplierInvoice).where(SupplierInvoice.po_id == po.id)
    )).scalar_one_or_none()
    if existing:
        return existing

    supplier = await session.get(Supplier, po.supplier_id)
    if not supplier:
        return None
    code = await _next_invoice_code(session, supplier.country)

    inv = SupplierInvoice(
        code=code, po_id=po.id, partner_id=po.partner_id, supplier_id=po.supplier_id,
        warehouse_id=po.warehouse_id, currency=po.currency, status="draft",
    )
    session.add(inv)
    await session.flush()

    line_data = await _line_data_from_po(session, po)
    subtotal = Decimal("0"); tax_total = Decimal("0")
    for L in line_data:
        pol: PurchaseOrderLine = L["po_line"]
        qty_recv = L["qty_received"]
        # Auto-draft mirrors: invoiced qty = received qty; unit cost = PO cost
        line_total = (Decimal(qty_recv) * Decimal(pol.unit_cost)).quantize(Decimal("0.01"))
        line_tax = (line_total * Decimal(pol.tax_pct) / Decimal("100")).quantize(Decimal("0.01"))
        session.add(SupplierInvoiceLine(
            invoice_id=inv.id, po_line_id=pol.id,
            product_name=pol.product_name, supplier_sku=pol.supplier_sku,
            qty_ordered=pol.qty_ordered, qty_received=qty_recv, qty_invoiced=qty_recv,
            unit_cost_po=pol.unit_cost, unit_cost_invoiced=pol.unit_cost,
            unit_cost_variance_pct=Decimal("0"),
            tax_pct=pol.tax_pct, line_total=line_total, match_status="matched",
        ))
        subtotal += line_total
        tax_total += line_tax
    inv.subtotal = subtotal
    inv.tax_total = tax_total
    inv.grand_total = subtotal + tax_total
    inv.updated_at = datetime.now(timezone.utc)

    session.add(SupplierInvoiceAudit(
        invoice_id=inv.id, action="auto_draft", to_status="draft",
        actor_kind="system", actor_label="MARTbaked auto-draft",
        notes=f"Auto-generated from received PO {po.po_code}",
    ))
    # Alert supplier that a draft is waiting for their submission
    from shared.notifications.routes import notify as inapp_notify
    await inapp_notify(
        session,
        recipient_kind="supplier", recipient_id=po.supplier_id,
        kind="invoice_draft_ready",
        title=f"Draft invoice {inv.code} ready",
        body=f"PO {po.po_code} fully received — upload your invoice PDF and submit for approval.",
        link="/martbaked/sellers/portal/invoices",
        entity_kind="supplier_invoice", entity_id=inv.id,
        actor_label="MARTbaked",
    )
    return inv


async def rerun_three_way_match(session: AsyncSession, inv: SupplierInvoice) -> None:
    """Refresh line-level match_status + header match_status/tolerance snapshot.

    Called after supplier edits invoiced qty/cost and after supplier submit.
    Never mutates PO or receipt data.
    """
    tolerance = get_unit_cost_tolerance_pct()
    inv.tolerance_pct_used = tolerance
    lines = (await session.execute(
        select(SupplierInvoiceLine).where(SupplierInvoiceLine.invoice_id == inv.id)
    )).scalars().all()
    any_variance = False
    for ln in lines:
        status, var_pct = _run_line_match(
            ln.qty_ordered, ln.qty_received, ln.qty_invoiced,
            Decimal(ln.unit_cost_po), Decimal(ln.unit_cost_invoiced), tolerance,
        )
        ln.match_status = status
        ln.unit_cost_variance_pct = var_pct
        # Recompute the line total from the *invoiced* values (source of billed truth)
        ln.line_total = (Decimal(ln.qty_invoiced) * Decimal(ln.unit_cost_invoiced)).quantize(Decimal("0.01"))
        if status != "matched":
            any_variance = True

    # Header totals refresh
    subtotal = sum((Decimal(ln.line_total) for ln in lines), Decimal("0"))
    tax_total = sum((Decimal(ln.line_total) * Decimal(ln.tax_pct) / Decimal("100")).quantize(Decimal("0.01")) for ln in lines)
    inv.subtotal = subtotal
    inv.tax_total = tax_total
    inv.grand_total = subtotal + tax_total
    inv.match_status = "variance" if any_variance else "matched"
    inv.updated_at = datetime.now(timezone.utc)


async def audit(session: AsyncSession, inv: SupplierInvoice, *,
                actor_kind: str, actor_id: Optional[str], actor_label: Optional[str],
                action: str, from_status: Optional[str] = None,
                to_status: Optional[str] = None, notes: Optional[str] = None) -> None:
    session.add(SupplierInvoiceAudit(
        invoice_id=inv.id, action=action, from_status=from_status, to_status=to_status,
        actor_kind=actor_kind, actor_id=actor_id, actor_label=actor_label, notes=notes,
    ))


def invoice_dict(
    inv: SupplierInvoice, *,
    partner: Optional[Partner] = None, supplier: Optional[Supplier] = None,
    warehouse: Optional[Warehouse] = None, po: Optional[PurchaseOrder] = None,
    lines: Optional[list[SupplierInvoiceLine]] = None,
    audits: Optional[list[SupplierInvoiceAudit]] = None,
) -> dict:
    return {
        "id": inv.id, "code": inv.code,
        "status": inv.status, "match_status": inv.match_status,
        "po": {"id": po.id, "po_code": po.po_code, "status": po.status} if po else None,
        "partner": {"id": partner.id, "business_name": partner.business_name} if partner else None,
        "supplier": {"id": supplier.id, "code": supplier.code, "business_name": supplier.business_name} if supplier else None,
        "warehouse": {"id": warehouse.id, "code": warehouse.code, "name": warehouse.name} if warehouse else None,
        "currency": inv.currency,
        "supplier_invoice_number": inv.supplier_invoice_number,
        "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
        "subtotal": float(inv.subtotal), "tax_total": float(inv.tax_total), "grand_total": float(inv.grand_total),
        "invoice_document_storage_path": inv.invoice_document_storage_path,
        "invoice_document_uploaded_at": inv.invoice_document_uploaded_at.isoformat() if inv.invoice_document_uploaded_at else None,
        "tolerance_pct_used": float(inv.tolerance_pct_used) if inv.tolerance_pct_used is not None else None,
        "submitted_at": inv.submitted_at.isoformat() if inv.submitted_at else None,
        "matched_at": inv.matched_at.isoformat() if inv.matched_at else None,
        "approved_at": inv.approved_at.isoformat() if inv.approved_at else None,
        "disputed_at": inv.disputed_at.isoformat() if inv.disputed_at else None,
        "approval_notes": inv.approval_notes,
        "dispute_reason": inv.dispute_reason,
        "override_notes": inv.override_notes,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "lines": [{
            "id": ln.id, "po_line_id": ln.po_line_id, "product_name": ln.product_name,
            "supplier_sku": ln.supplier_sku,
            "qty_ordered": ln.qty_ordered, "qty_received": ln.qty_received, "qty_invoiced": ln.qty_invoiced,
            "unit_cost_po": float(ln.unit_cost_po), "unit_cost_invoiced": float(ln.unit_cost_invoiced),
            "unit_cost_variance_pct": float(ln.unit_cost_variance_pct),
            "tax_pct": float(ln.tax_pct), "line_total": float(ln.line_total),
            "match_status": ln.match_status, "match_notes": ln.match_notes,
        } for ln in (lines or [])],
        "audit_trail": [{
            "id": a.id, "action": a.action, "actor_kind": a.actor_kind,
            "actor_label": a.actor_label, "from_status": a.from_status, "to_status": a.to_status,
            "notes": a.notes, "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in (audits or [])],
    }
