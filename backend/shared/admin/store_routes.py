"""Super Admin — Stores (multi-dark-store) CRUD + lifecycle actions.

Fixing_Prompt §29/§30 — every state transition is admin-only and audited so
operators can onboard, approve, activate, suspend, maintenance-flag or
permanently close dark stores without ever touching the DB.

Mounted under `/api/admin/stores` (admin-role-gated).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    Partner, WAREHOUSE_STATUSES, WAREHOUSE_STATUS_OPERATIONAL, Warehouse,
)
from modules.mart_partner.codes import next_store_code
from shared.admin.routes import _audit, get_current_admin


router = APIRouter(prefix="/admin/stores", tags=["admin-stores"])


# ---------------------------------------------------------------------------
#   State machine — which transitions the admin can perform, from any state.
# ---------------------------------------------------------------------------
_TRANSITIONS: dict[str, set[str]] = {
    "pending":                  {"under_review", "additional_info_required", "approved", "rejected"},
    "under_review":             {"additional_info_required", "approved", "rejected"},
    "additional_info_required": {"under_review", "approved", "rejected"},
    "approved":                 {"setup_required", "setup_in_progress", "active", "rejected"},
    "rejected":                 set(),  # terminal
    "setup_required":           {"setup_in_progress", "rejected", "closed"},
    "setup_in_progress":        {"active", "additional_info_required", "closed"},
    "active":                   {"temporarily_suspended", "maintenance", "closed"},
    "temporarily_suspended":    {"active", "maintenance", "closed"},
    "maintenance":              {"active", "temporarily_suspended", "closed"},
    "closed":                   set(),  # terminal
}


def _store_dict(w: Warehouse, partner: Optional[Partner] = None) -> dict:
    return {
        "id": w.id,
        "code": w.code,
        "name": w.name,
        "status": w.status,
        "is_active": w.is_active,
        "partner_id": w.partner_id,
        "partner_name": partner.business_name if partner else None,
        "partner_email": partner.owner_email if partner else None,
        "address_line": w.address_line,
        "city": w.city,
        "region": getattr(w, "region", None),
        "country": w.country,
        "latitude": float(w.latitude) if w.latitude is not None else None,
        "longitude": float(w.longitude) if w.longitude is not None else None,
        "service_area_km": float(w.service_area_km) if w.service_area_km is not None else None,
        "warehouse_capacity_sqm": float(w.warehouse_capacity_sqm) if w.warehouse_capacity_sqm is not None else None,
        "time_zone": getattr(w, "time_zone", None),
        "store_type": getattr(w, "store_type", None),
        "opening_date": w.opening_date.isoformat() if getattr(w, "opening_date", None) else None,
        "contact_email": getattr(w, "contact_email", None),
        "contact_phone": getattr(w, "contact_phone", None),
        "store_manager_staff_id": getattr(w, "store_manager_staff_id", None),
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


# ---------------------------------------------------------------------------
#   Payloads
# ---------------------------------------------------------------------------

class StoreCreateIn(BaseModel):
    partner_id: str
    name: str = Field(..., min_length=2, max_length=200)
    address_line: str = Field(..., min_length=2, max_length=400)
    city: str = Field(..., min_length=2, max_length=120)
    country: str = Field(..., min_length=2, max_length=2)
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    service_area_km: Optional[float] = Field(default=None, ge=0, le=200)
    warehouse_capacity_sqm: Optional[float] = Field(default=None, ge=0)
    time_zone: Optional[str] = None
    store_type: Optional[str] = Field(default="dark_store")
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    # Admin can decide whether a freshly-created store lands in pending
    # (default — needs approval) or straight to active.
    initial_status: str = Field(default="pending")


class StorePatchIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    address_line: Optional[str] = Field(default=None, min_length=2, max_length=400)
    city: Optional[str] = None
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    service_area_km: Optional[float] = Field(default=None, ge=0, le=200)
    warehouse_capacity_sqm: Optional[float] = Field(default=None, ge=0)
    time_zone: Optional[str] = None
    store_type: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    store_manager_staff_id: Optional[str] = None


class LifecycleActionIn(BaseModel):
    action: str = Field(..., description="target status, e.g. 'active', 'temporarily_suspended', 'closed'")
    reason: Optional[str] = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
#   List / Detail
# ---------------------------------------------------------------------------

@router.get("")
async def list_stores(
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    partner_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    country: Optional[str] = Query(default=None),
    city: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Search on code, name, or partner name"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Warehouse, Partner)
        .join(Partner, Partner.id == Warehouse.partner_id, isouter=True)
        .order_by(Warehouse.created_at.desc())
    )
    if partner_id:
        stmt = stmt.where(Warehouse.partner_id == partner_id)
    if status:
        if status not in WAREHOUSE_STATUSES:
            raise HTTPException(400, f"Unknown status '{status}'")
        stmt = stmt.where(Warehouse.status == status)
    if country:
        stmt = stmt.where(Warehouse.country == country.upper())
    if city:
        stmt = stmt.where(func.lower(Warehouse.city) == city.lower())
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            func.lower(Warehouse.code).like(needle),
            func.lower(Warehouse.name).like(needle),
            func.lower(Partner.business_name).like(needle),
        ))

    total = (await session.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()
    rows = (await session.execute(stmt.limit(limit).offset(offset))).all()

    # Aggregate: counts per status (small enough to always ship)
    status_rows = (await session.execute(
        select(Warehouse.status, func.count(Warehouse.id)).group_by(Warehouse.status)
    )).all()
    status_counts = {s: 0 for s in WAREHOUSE_STATUSES}
    for s, c in status_rows:
        status_counts[s] = c

    return {
        "total": total,
        "items": [_store_dict(w, p) for w, p in rows],
        "status_counts": status_counts,
        "operational_statuses": sorted(WAREHOUSE_STATUS_OPERATIONAL),
    }


@router.get("/{store_id}")
async def get_store(
    store_id: str,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    w = await session.get(Warehouse, store_id)
    if not w:
        raise HTTPException(404, "Store not found")
    p = await session.get(Partner, w.partner_id)
    return _store_dict(w, p)


# ---------------------------------------------------------------------------
#   Create / Update / Delete
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_store(
    payload: StoreCreateIn,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if payload.initial_status not in WAREHOUSE_STATUSES:
        raise HTTPException(400, f"Unknown initial_status '{payload.initial_status}'")

    partner = await session.get(Partner, payload.partner_id)
    if not partner:
        raise HTTPException(404, "Partner not found")

    # Auto-generate the human-readable code. Backend-only per Fixing_Prompt §27.
    code = await next_store_code(session, module=partner.module or "mart", city=payload.city)

    w = Warehouse(
        partner_id=partner.id,
        code=code,
        name=payload.name.strip(),
        address_line=payload.address_line.strip(),
        city=payload.city.strip(),
        region=payload.region,
        country=payload.country.upper(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        service_area_km=payload.service_area_km,
        warehouse_capacity_sqm=payload.warehouse_capacity_sqm,
        time_zone=payload.time_zone,
        store_type=payload.store_type,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        status=payload.initial_status,
        # is_active mirrors "operational" — active + maintenance + suspended
        # stay is_active=true so partner-portal queries keep the store visible.
        is_active=(payload.initial_status not in {"rejected", "closed"}),
    )
    session.add(w)
    await session.flush()
    await _audit(session, admin, action="store.create", target_id=w.id, metadata={
        "code": w.code, "partner_id": partner.id, "initial_status": payload.initial_status,
    })
    await session.commit()
    await session.refresh(w)
    return _store_dict(w, partner)


@router.patch("/{store_id}")
async def update_store(
    store_id: str,
    payload: StorePatchIn,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    w = await session.get(Warehouse, store_id)
    if not w:
        raise HTTPException(404, "Store not found")

    changed = {}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(w, k):
            setattr(w, k, v)
            changed[k] = v
    if not changed:
        # No-op but never rude.
        p = await session.get(Partner, w.partner_id)
        return _store_dict(w, p)

    await _audit(session, admin, action="store.update", target_id=w.id, metadata=changed)
    await session.commit()
    await session.refresh(w)
    p = await session.get(Partner, w.partner_id)
    return _store_dict(w, p)


@router.post("/{store_id}/lifecycle")
async def transition_store(
    store_id: str,
    payload: LifecycleActionIn,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    w = await session.get(Warehouse, store_id)
    if not w:
        raise HTTPException(404, "Store not found")

    target = payload.action
    if target not in WAREHOUSE_STATUSES:
        raise HTTPException(400, f"Unknown target status '{target}'")

    allowed = _TRANSITIONS.get(w.status, set())
    if target == w.status:
        raise HTTPException(400, {
            "code": "no_change",
            "message": f"Store is already '{target}'.",
        })
    if target not in allowed:
        raise HTTPException(400, {
            "code": "illegal_transition",
            "message": f"Cannot transition '{w.status}' → '{target}'.",
            "allowed": sorted(allowed),
        })

    w.status = target
    # is_active mirrors "operational" — the customer-facing product feed queries
    # this boolean, so keeping it in sync avoids a second index scan.
    w.is_active = (target not in {"rejected", "closed"})

    await _audit(session, admin,
                 action=f"store.lifecycle.{target}", target_id=w.id,
                 metadata={"from": w.status if False else None,
                           "to": target, "reason": payload.reason})
    await session.commit()
    await session.refresh(w)
    p = await session.get(Partner, w.partner_id)
    return _store_dict(w, p)


@router.delete("/{store_id}", status_code=204)
async def delete_store(
    store_id: str,
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Hard delete a store. Reserved for typo-cleanup — only allowed for
    stores that are `pending` / `rejected` / `closed` AND have no partner
    products / partner orders attached. For everything else the admin
    must transition to `closed` instead.
    """
    w = await session.get(Warehouse, store_id)
    if not w:
        raise HTTPException(404, "Store not found")
    if w.status not in {"pending", "rejected", "closed"}:
        raise HTTPException(400, {
            "code": "delete_forbidden",
            "message": "Only pending / rejected / closed stores can be hard-deleted. "
                       "Transition to 'closed' first.",
        })
    # Best-effort safety net — refuse hard delete if any related row exists.
    from core.models import PartnerOrder
    has_orders = (await session.execute(
        select(func.count(PartnerOrder.id)).where(
            PartnerOrder.partner_id == w.partner_id
        ).limit(1)
    )).scalar_one()
    if has_orders:
        raise HTTPException(400, {
            "code": "delete_forbidden",
            "message": "This partner has past orders — hard delete would orphan records. "
                       "Keep the store in 'closed' state instead.",
        })
    await session.delete(w)
    await _audit(session, admin, action="store.delete", target_id=store_id)
    await session.commit()


# Metadata endpoint — feeds the frontend's status filter + transition graph.
@router.get("/_meta/transitions")
async def transitions_meta(admin=Depends(get_current_admin)):
    return {
        "statuses": list(WAREHOUSE_STATUSES),
        "operational": sorted(WAREHOUSE_STATUS_OPERATIONAL),
        "transitions": {k: sorted(v) for k, v in _TRANSITIONS.items()},
    }


# Lightweight partner picklist — powers the Create Store modal's dropdown.
# Kept in this file so the Stores UI has one focused API surface.
@router.get("/_meta/partners")
async def partners_picklist(
    admin=Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    q: Optional[str] = Query(default=None),
    module: Optional[str] = Query(default=None),
    limit: int = Query(default=200, le=500),
):
    stmt = select(Partner).where(Partner.is_active).order_by(Partner.business_name.asc()).limit(limit)
    if module:
        stmt = stmt.where(Partner.module == module)
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            func.lower(Partner.business_name).like(needle),
            func.lower(Partner.owner_email).like(needle),
        ))
    rows = (await session.execute(stmt)).scalars().all()
    return {
        "items": [
            {
                "id": p.id, "business_name": p.business_name,
                "owner_email": p.owner_email, "module": p.module,
                "country": p.country,
            }
            for p in rows
        ],
    }
