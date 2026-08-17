"""In-app notifications — dispatcher + read/list HTTP routes.

Three-way portal split via one shared table. The `dispatch` helper is called
from any state-transition site (PO submit/ack/ship/receive, invoice submit/
approve/dispute) with a `(recipient_kind, recipient_id)` target — the same
row that gets emailed also lands here so users see the change instantly on
their next 20 s poll (or immediately after any interaction that refreshes
the bell).

Rate-limit-safe: notifications never fail the parent transaction. If we
can't write a row we log and move on.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, Notification, Supplier,
)
from modules.mart_partner.staff_routes import PartnerActor, get_partner_actor
from shared.suppliers.portal_routes import get_current_supplier

log = logging.getLogger("baked.notifications")


# ---------------------------------------------------------------------------
# Dispatcher (called from PO / invoice route handlers)
# ---------------------------------------------------------------------------

async def notify(
    session: AsyncSession, *,
    recipient_kind: str, recipient_id: str,
    kind: str, title: str, body: Optional[str] = None,
    link: Optional[str] = None,
    entity_kind: Optional[str] = None, entity_id: Optional[str] = None,
    actor_label: Optional[str] = None,
) -> None:
    """Insert a notification. Must be awaited inside the caller's session so
    it commits atomically with the state transition."""
    if recipient_kind not in ("supplier", "partner", "admin"):
        log.warning("notify.bad_kind %s", recipient_kind)
        return
    try:
        session.add(Notification(
            recipient_kind=recipient_kind, recipient_id=recipient_id,
            kind=kind, title=title, body=body, link=link,
            entity_kind=entity_kind, entity_id=entity_id, actor_label=actor_label,
        ))
    except Exception:  # noqa: BLE001
        log.exception("notify.insert_failed kind=%s recipient=%s", kind, recipient_id)


# ---------------------------------------------------------------------------
# Router factory (one per portal)
# ---------------------------------------------------------------------------

def _serialize(n: Notification) -> dict:
    return {
        "id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
        "link": n.link, "entity_kind": n.entity_kind, "entity_id": n.entity_id,
        "actor_label": n.actor_label, "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "read_at":    n.read_at.isoformat()    if n.read_at    else None,
    }


async def _list(
    session: AsyncSession, *,
    recipient_kind: str, recipient_id: str,
    unread_only: bool = False, limit: int = 40,
) -> dict:
    stmt = (
        select(Notification)
        .where(Notification.recipient_kind == recipient_kind,
               Notification.recipient_id == recipient_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = (await session.execute(stmt)).scalars().all()

    unread_count = (await session.execute(
        select(func.count(Notification.id)).where(
            Notification.recipient_kind == recipient_kind,
            Notification.recipient_id == recipient_id,
            Notification.is_read.is_(False),
        )
    )).scalar() or 0
    return {"items": [_serialize(n) for n in rows], "unread_count": unread_count}


async def _mark_read(session: AsyncSession, *, recipient_kind: str, recipient_id: str,
                     notif_id: Optional[str] = None) -> None:
    stmt = update(Notification).where(
        Notification.recipient_kind == recipient_kind,
        Notification.recipient_id == recipient_id,
        Notification.is_read.is_(False),
    ).values(is_read=True, read_at=datetime.now(timezone.utc))
    if notif_id:
        stmt = stmt.where(Notification.id == notif_id)
    await session.execute(stmt)


# ------- Supplier surface -------

supplier_router = APIRouter(prefix="/supplier/me/notifications", tags=["supplier-notifications"])


@supplier_router.get("")
async def sup_list(unread: int = 0, limit: int = Query(40, le=100),
                   session: AsyncSession = Depends(get_session),
                   supplier: Supplier = Depends(get_current_supplier)):
    return await _list(session, recipient_kind="supplier", recipient_id=supplier.id,
                       unread_only=bool(unread), limit=limit)


@supplier_router.post("/{notif_id}/read")
async def sup_read(notif_id: str,
                   session: AsyncSession = Depends(get_session),
                   supplier: Supplier = Depends(get_current_supplier)):
    await _mark_read(session, recipient_kind="supplier", recipient_id=supplier.id, notif_id=notif_id)
    await session.commit()
    return {"ok": True}


@supplier_router.post("/read-all")
async def sup_read_all(session: AsyncSession = Depends(get_session),
                       supplier: Supplier = Depends(get_current_supplier)):
    await _mark_read(session, recipient_kind="supplier", recipient_id=supplier.id)
    await session.commit()
    return {"ok": True}


# ------- Partner surface -------

partner_router = APIRouter(prefix="/partner/notifications", tags=["partner-notifications"])


@partner_router.get("")
async def par_list(unread: int = 0, limit: int = Query(40, le=100),
                   session: AsyncSession = Depends(get_session),
                   actor: PartnerActor = Depends(get_partner_actor)):
    return await _list(session, recipient_kind="partner", recipient_id=actor.partner_id,
                       unread_only=bool(unread), limit=limit)


@partner_router.post("/{notif_id}/read")
async def par_read(notif_id: str,
                   session: AsyncSession = Depends(get_session),
                   actor: PartnerActor = Depends(get_partner_actor)):
    await _mark_read(session, recipient_kind="partner", recipient_id=actor.partner_id, notif_id=notif_id)
    await session.commit()
    return {"ok": True}


@partner_router.post("/read-all")
async def par_read_all(session: AsyncSession = Depends(get_session),
                       actor: PartnerActor = Depends(get_partner_actor)):
    await _mark_read(session, recipient_kind="partner", recipient_id=actor.partner_id)
    await session.commit()
    return {"ok": True}


# ------- Admin surface -------

def _admin_dep():
    from shared.admin.routes import get_current_admin
    return get_current_admin


admin_router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])


@admin_router.get("")
async def adm_list(unread: int = 0, limit: int = Query(40, le=100),
                   session: AsyncSession = Depends(get_session),
                   admin: AdminUser = Depends(_admin_dep())):  # noqa: B008
    return await _list(session, recipient_kind="admin", recipient_id=admin.id,
                       unread_only=bool(unread), limit=limit)


@admin_router.post("/{notif_id}/read")
async def adm_read(notif_id: str,
                   session: AsyncSession = Depends(get_session),
                   admin: AdminUser = Depends(_admin_dep())):  # noqa: B008
    await _mark_read(session, recipient_kind="admin", recipient_id=admin.id, notif_id=notif_id)
    await session.commit()
    return {"ok": True}


@admin_router.post("/read-all")
async def adm_read_all(session: AsyncSession = Depends(get_session),
                       admin: AdminUser = Depends(_admin_dep())):  # noqa: B008
    await _mark_read(session, recipient_kind="admin", recipient_id=admin.id)
    await session.commit()
    return {"ok": True}
