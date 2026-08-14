"""PO Notifications — Phase 4c.

Fires transactional emails on the three key PO status transitions:

  * PO submitted  → email supplier's business_email (buyer needs supplier to ack)
  * PO acknowledged → email partner owner_email (buyer needs to know supplier is on it)
  * PO shipped → email partner owner_email + warehouse_manager staff (buyer needs
    to prepare receiving)

Design principles (mirrors modules/mart_partner/notifications.py):
  * Fire-and-forget via `asyncio.create_task` — never block the request path.
  * Every send is best-effort; failures are logged, not raised.
  * If SMTP isn't configured (dev), `send_email_async` no-ops and returns False —
    the audit-trail row already exists so the partner can still see the change
    in-portal even without email.

The public API is a single function `dispatch_po_notification(kind, po_id)` — the
concrete SQL fetch happens in the async task itself so the caller's session is
never leaked across the boundary.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Literal

from sqlalchemy import select

from core.db import SessionLocal
from core.mailer import send_email_async
from core.models import (
    Partner, PartnerStaff, PurchaseOrder, PurchaseOrderLine, Supplier, Warehouse,
)

logger = logging.getLogger("baked.po_notifications")

Kind = Literal["submitted", "acknowledged", "shipped"]

# The public-facing URL where the recipient can view the PO. Falls back to a
# safe default when the env var isn't set (still valid HTML).
def _portal_url(kind: Kind) -> str:
    base = os.environ.get("PUBLIC_APP_BASE_URL", "").rstrip("/") or "https://baked.ci"
    if kind == "submitted":  # supplier lands here
        return f"{base}/martbaked/sellers/portal/orders"
    return f"{base}/partner-portal/purchase-orders"


def _fmt_currency(v: float, currency: str) -> str:
    try:
        return f"{v:,.2f} {currency}"
    except Exception:  # noqa: BLE001
        return f"{v} {currency}"


# ---------------------------------------------------------------------------
# HTML / text builders
# ---------------------------------------------------------------------------

_BRAND_CSS = (
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;"
    "max-width:560px;margin:0 auto;padding:24px;color:#111;background:#fff"
)
_CTA_CSS = (
    "display:inline-block;background:#77BC1F;color:#0A1200;text-decoration:none;"
    "padding:12px 24px;border-radius:10px;font-weight:600;margin-top:16px;"
    "letter-spacing:.2px"
)
_LABEL_CSS = "color:#64748B;font-size:11px;letter-spacing:1px;text-transform:uppercase"


def _kv(label: str, value: str) -> str:
    return (
        f"<div style='margin:6px 0'>"
        f"<span style='{_LABEL_CSS}'>{label}</span><br>"
        f"<span style='font-size:14px;font-weight:600'>{value}</span>"
        f"</div>"
    )


def _submitted_email(po: PurchaseOrder, partner: Partner, warehouse: Warehouse, line_count: int) -> tuple[str, str, str]:
    subject = f"[BAKED] New PO {po.po_code} — {partner.business_name}"
    html = f"""
      <div style="{_BRAND_CSS}">
        <div style="color:#77BC1F;font-weight:700;letter-spacing:1px">BAKED · MARTbaked</div>
        <h2 style="margin:12px 0 4px">New Purchase Order</h2>
        <p style="color:#555;margin:0 0 20px">
          You have a new PO from <strong>{partner.business_name}</strong> — please review and acknowledge in your Supplier Portal.
        </p>
        {_kv("PO code", po.po_code)}
        {_kv("Buyer", f"{partner.business_name} · {warehouse.code}")}
        {_kv("Line items", str(line_count))}
        {_kv("Grand total", _fmt_currency(float(po.grand_total or 0), po.currency))}
        {_kv("Expected delivery", po.expected_delivery_date.isoformat() if po.expected_delivery_date else "—")}
        <a href="{_portal_url('submitted')}" style="{_CTA_CSS}">Open Supplier Portal</a>
        <p style="color:#94A3B8;font-size:11px;margin-top:24px">
          You received this because your supplier account is linked to this PO. Do not reply.
        </p>
      </div>"""
    text = (
        f"New Purchase Order {po.po_code} from {partner.business_name}\n"
        f"Warehouse: {warehouse.code}\n"
        f"Lines: {line_count}\n"
        f"Grand total: {_fmt_currency(float(po.grand_total or 0), po.currency)}\n\n"
        f"Open your Supplier Portal: {_portal_url('submitted')}"
    )
    return subject, html, text


def _acknowledged_email(po: PurchaseOrder, supplier: Supplier, warehouse: Warehouse) -> tuple[str, str, str]:
    subject = f"[BAKED] PO {po.po_code} acknowledged by {supplier.business_name}"
    html = f"""
      <div style="{_BRAND_CSS}">
        <div style="color:#77BC1F;font-weight:700;letter-spacing:1px">BAKED · MARTbaked</div>
        <h2 style="margin:12px 0 4px">Supplier acknowledged your PO</h2>
        <p style="color:#555;margin:0 0 20px">
          <strong>{supplier.business_name}</strong> confirmed your purchase order and is preparing goods for shipment.
        </p>
        {_kv("PO code", po.po_code)}
        {_kv("Warehouse", warehouse.code)}
        {_kv("Supplier", f"{supplier.business_name} · {supplier.code}")}
        {_kv("Grand total", _fmt_currency(float(po.grand_total or 0), po.currency))}
        <a href="{_portal_url('acknowledged')}" style="{_CTA_CSS}">View Purchase Orders</a>
      </div>"""
    text = (
        f"PO {po.po_code} acknowledged by {supplier.business_name}\n"
        f"Warehouse: {warehouse.code}\n"
        f"Grand total: {_fmt_currency(float(po.grand_total or 0), po.currency)}\n\n"
        f"Track it: {_portal_url('acknowledged')}"
    )
    return subject, html, text


def _shipped_email(po: PurchaseOrder, supplier: Supplier, warehouse: Warehouse) -> tuple[str, str, str]:
    subject = f"[BAKED] PO {po.po_code} shipped — prepare {warehouse.code} for receiving"
    html = f"""
      <div style="{_BRAND_CSS}">
        <div style="color:#77BC1F;font-weight:700;letter-spacing:1px">BAKED · MARTbaked</div>
        <h2 style="margin:12px 0 4px">Goods on the way</h2>
        <p style="color:#555;margin:0 0 20px">
          <strong>{supplier.business_name}</strong> has shipped PO <strong>{po.po_code}</strong>.
          Get your receiving team ready at <strong>{warehouse.code}</strong> to book stock in as it arrives.
        </p>
        {_kv("PO code", po.po_code)}
        {_kv("Supplier", f"{supplier.business_name} · {supplier.code}")}
        {_kv("Warehouse", warehouse.code)}
        {_kv("Grand total", _fmt_currency(float(po.grand_total or 0), po.currency))}
        <a href="{_portal_url('shipped')}" style="{_CTA_CSS}">Open receiving</a>
      </div>"""
    text = (
        f"PO {po.po_code} shipped by {supplier.business_name}\n"
        f"Warehouse: {warehouse.code}\n"
        f"Prepare receiving: {_portal_url('shipped')}"
    )
    return subject, html, text


# ---------------------------------------------------------------------------
# Concrete async workers
# ---------------------------------------------------------------------------

async def _run(kind: Kind, po_id: str) -> None:
    async with SessionLocal() as session:
        po = await session.get(PurchaseOrder, po_id)
        if not po:
            logger.warning("po_notify.missing_po id=%s kind=%s", po_id, kind)
            return
        partner = await session.get(Partner, po.partner_id)
        supplier = await session.get(Supplier, po.supplier_id)
        warehouse = await session.get(Warehouse, po.warehouse_id)
        if not (partner and supplier and warehouse):
            logger.warning("po_notify.missing_fk id=%s kind=%s", po_id, kind)
            return

        line_count = (await session.execute(
            select(PurchaseOrderLine).where(PurchaseOrderLine.purchase_order_id == po.id)
        )).scalars().all()

        # Build recipients + template
        recipients: list[str] = []
        if kind == "submitted":
            if supplier.business_email:
                recipients.append(supplier.business_email)
            subject, html, text = _submitted_email(po, partner, warehouse, len(line_count))
        elif kind == "acknowledged":
            if partner.owner_email:
                recipients.append(partner.owner_email)
            subject, html, text = _acknowledged_email(po, supplier, warehouse)
        elif kind == "shipped":
            if partner.owner_email:
                recipients.append(partner.owner_email)
            # Also loop in the warehouse manager for this store, if any
            wh_managers = (await session.execute(
                select(PartnerStaff).where(
                    PartnerStaff.partner_id == partner.id,
                    PartnerStaff.warehouse_id == warehouse.id,
                    PartnerStaff.role == "warehouse_manager",
                    PartnerStaff.is_active.is_(True),
                )
            )).scalars().all()
            for m in wh_managers:
                if m.email and m.email not in recipients:
                    recipients.append(m.email)
            subject, html, text = _shipped_email(po, supplier, warehouse)
        else:
            logger.warning("po_notify.unknown_kind kind=%s", kind)
            return

        if not recipients:
            logger.info("po_notify.no_recipients po=%s kind=%s", po_id, kind)
            return

        for to in recipients:
            try:
                await send_email_async(to=to, subject=subject, html_body=html, text_body=text)
            except Exception:  # noqa: BLE001
                logger.exception("po_notify.send_failed po=%s kind=%s to=%s", po_id, kind, to)


def dispatch_po_notification(kind: Kind, po_id: str) -> None:
    """Fire-and-forget dispatch — call this immediately after `session.commit()`
    inside the PO transition endpoints. Never awaited; never raises."""
    try:
        asyncio.create_task(_run(kind, po_id), name=f"po_notify:{kind}:{po_id}")
    except Exception:  # noqa: BLE001
        logger.exception("po_notify.dispatch_failed kind=%s po=%s", kind, po_id)
