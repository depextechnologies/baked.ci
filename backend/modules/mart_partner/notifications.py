"""Slice F — partner-facing notifications.

Fires on relevant order lifecycle events:
  * order.created           — SMS + email to every partner whose slice was allocated
  * order.status_changed    — reserved for future (pack, handoff, delivered)
  * wallet.low_balance      — reserved for future

Design principles:
  * Fire-and-forget from the request path (`asyncio.create_task`) so a slow
    SMS carrier never adds latency to checkout.
  * All errors are swallowed and logged — a broken carrier must NEVER cause
    an order commit to roll back.
  * Sends via the shared SMS + Mailer providers. If a channel isn't
    configured (dev), the send is a no-op that logs to console.
  * Owner phone / email come from the `Partner` row today. Staff-level
    notification preferences are a P2 follow-up.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

from core.db import SessionLocal
from core.mailer import send_email_async
from core.models import Order, Partner, PartnerOrder
from core.providers.sms_provider import send_sms

logger = logging.getLogger("baked.notifications")


def _fmt_currency(amount: float, currency: str) -> str:
    try:
        return f"{amount:,.0f} {currency}"
    except Exception:  # noqa: BLE001
        return f"{amount} {currency}"


async def _notify_partner_new_order(
    partner_id: str, order_id: str, partner_order_id: str
) -> None:
    async with SessionLocal() as session:
        partner = await session.get(Partner, partner_id)
        po      = await session.get(PartnerOrder, partner_order_id)
        order   = await session.get(Order, order_id)
        if not partner or not po or not order:
            logger.warning("notify.new_order.missing_rows partner=%s order=%s po=%s",
                           partner_id, order_id, partner_order_id)
            return

        currency = order.currency or "XOF"
        sms_body = (
            f"[BAKĒD] Nouvelle commande #{order.number} — "
            f"{po.item_count} article(s), {_fmt_currency(po.subtotal or 0, currency)}. "
            f"Ouvrez le portail pour préparer."
        )
        subject = f"Nouvelle commande #{order.number} — {po.item_count} article(s)"
        html = f"""
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 8px">Nouvelle commande reçue</h2>
            <p style="margin:0 0 16px;color:#555">
              Vous avez reçu une nouvelle commande sur <strong>{partner.business_name}</strong>.
            </p>
            <ul style="line-height:1.6;color:#333">
              <li>Numéro : <strong>#{order.number}</strong></li>
              <li>Articles : <strong>{po.item_count}</strong></li>
              <li>Sous-total : <strong>{_fmt_currency(po.subtotal or 0, currency)}</strong></li>
            </ul>
            <a href="https://baked.ci/partner-portal/orders"
               style="display:inline-block;background:#DC7F1E;color:#0a0a0f;text-decoration:none;
                      padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">
              Ouvrir le portail
            </a>
          </div>"""
        text = (
            f"Nouvelle commande #{order.number}\n"
            f"{po.item_count} article(s) — {_fmt_currency(po.subtotal or 0, currency)}\n\n"
            f"Ouvrez le portail : https://baked.ci/partner-portal/orders"
        )

        # SMS to owner phone (best effort)
        if partner.owner_phone:
            try:
                await send_sms(partner.owner_phone, sms_body, tag="order.created")
            except Exception:  # noqa: BLE001
                logger.exception("notify.new_order.sms_failed partner=%s", partner_id)

        # Email to owner (best effort)
        if partner.owner_email:
            try:
                await send_email_async(
                    to=partner.owner_email, subject=subject, html_body=html, text_body=text,
                )
            except Exception:  # noqa: BLE001
                logger.exception("notify.new_order.email_failed partner=%s", partner_id)


def dispatch_new_order_notifications(
    order_id: str, partner_slices: Iterable[tuple[str, str]]
) -> None:
    """Fire-and-forget entry-point used by the checkout endpoint.

    `partner_slices` is an iterable of `(partner_id, partner_order_id)` tuples,
    one per slice returned by the allocation engine.
    """
    for partner_id, po_id in partner_slices:
        try:
            asyncio.create_task(
                _notify_partner_new_order(partner_id, order_id, po_id),
                name=f"notify.new_order:{po_id}",
            )
        except Exception:  # noqa: BLE001
            logger.exception("notify.new_order.dispatch_failed partner=%s po=%s",
                             partner_id, po_id)
