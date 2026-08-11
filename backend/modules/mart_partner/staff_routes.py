"""Partner Staff & RBAC — Slice B.

Wires up:
  * `POST /api/partner/auth/staff-login`  — staff email + password login
  * `GET  /api/partner/staff`             — list teammates (owner + manager)
  * `POST /api/partner/staff/invite`      — email an invite link (owner + manager)
  * `POST /api/partner/staff/accept-invite` — set password + activate + login
  * `PATCH /api/partner/staff/{id}`       — change role or deactivate (owner)
  * `DELETE /api/partner/staff/{id}`      — remove teammate (owner)
  * `require_role(...)` dep and a role-aware `PartnerActor` dep that
    resolves owner vs staff on every request without an extra DB roundtrip.

The `Partner` row remains the implicit "owner" — no data migration; owners
still log in via `/partner/auth/login` and get `role="partner"` tokens.
Staff log in via `/partner/auth/staff-login` and get `role="partner_staff"`
tokens plus extra `staff_id` + `staff_role` claims.
"""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.security import (
    JWT_ACCESS_TTL_MIN, create_access_token, hash_password, verify_password,
)
from core.models import (
    PARTNER_STAFF_ROLES, Partner, PartnerStaff, PartnerStaffAuditLog,
    WAREHOUSE_STATUS_OPERATIONAL, Warehouse,
)

# Roles a partner_staff row may actually store (owner lives on Partner).
_STORED_ROLES = tuple(r for r in PARTNER_STAFF_ROLES if r != "owner")
_STORED_ROLES_PATTERN = "^(" + "|".join(_STORED_ROLES) + ")$"


# ============================================================================
#                         Role-aware actor dependency
# ============================================================================

# A single object we can pass down into every endpoint so callers don't need
# to care whether the caller is the owner (Partner row) or a staff row.
class PartnerActor:
    __slots__ = ("partner", "staff", "role", "actor_id", "actor_email",
                 "actor_kind", "store_id", "store_code")

    def __init__(
        self, *, partner: Partner, staff: Optional[PartnerStaff], role: str,
        store_id: Optional[str] = None, store_code: Optional[str] = None,
    ):
        self.partner      = partner
        self.staff        = staff
        self.role         = role  # 'owner' | 'manager' | 'packer' | 'cashier' | 'supervisor' | ...
        self.actor_kind   = "owner" if staff is None else "staff"
        self.actor_id     = partner.id if staff is None else staff.id
        self.actor_email  = partner.owner_email if staff is None else staff.email
        # Store context — set for staff tokens (from JWT claim), None for owners
        # (owners can operate across all their stores).
        self.store_id     = store_id
        self.store_code   = store_code

    @property
    def partner_id(self) -> str:
        return self.partner.id


async def get_partner_actor(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> PartnerActor:
    """Resolves the Bearer token to a `PartnerActor` — accepts BOTH
    the legacy `role=partner` (owner) tokens and the new
    `role=partner_staff` (teammate) tokens."""
    from jwt import ExpiredSignatureError, InvalidTokenError, decode as jwt_decode

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    try:
        payload = jwt_decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    role_claim = payload.get("role")
    sub = payload.get("sub")

    if role_claim == "partner":
        # Owner token — sub is the partner_id.
        partner = await session.get(Partner, sub)
        if not partner or not partner.is_active:
            raise HTTPException(status_code=401, detail="Partner not found or inactive")
        return PartnerActor(partner=partner, staff=None, role="owner")

    if role_claim == "partner_staff":
        # Staff token — sub is the staff_id, staff_role is the effective role.
        staff = await session.get(PartnerStaff, sub)
        if not staff or not staff.is_active:
            raise HTTPException(status_code=401, detail="Staff account inactive")
        partner = await session.get(Partner, staff.partner_id)
        if not partner or not partner.is_active:
            raise HTTPException(status_code=401, detail="Partner not found or inactive")
        return PartnerActor(
            partner=partner, staff=staff, role=staff.role,
            store_id=payload.get("store_id"),
            store_code=payload.get("store_code"),
        )

    raise HTTPException(status_code=403, detail="Partner token required")


def require_role(*allowed: str):
    """FastAPI dependency factory. Usage:

        @router.post(..., dependencies=[Depends(require_role("owner","manager"))])

    Or per-endpoint:

        actor: PartnerActor = Depends(require_role("owner","manager","packer"))
    """
    async def _dep(actor: PartnerActor = Depends(get_partner_actor)) -> PartnerActor:
        if actor.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "insufficient_role",
                    "message": f"This action requires role in {list(allowed)}; you are '{actor.role}'.",
                },
            )
        return actor
    return _dep


def require_store_context(actor: PartnerActor = Depends(get_partner_actor)) -> PartnerActor:
    """FastAPI dependency: guarantees the request is scoped to a specific store.

    Owners are allowed through (they can operate across every one of their
    stores — the endpoint itself should still filter by owner.partner_id).
    Staff MUST have a `store_id` claim in their JWT, else 403 no_store_context.

    Fixing_Prompt §16: DO NOT TRUST any store_id submitted by the client.
    Every store-scoped endpoint reads the store from THIS dep, not from the
    request body / path / query.
    """
    if actor.actor_kind == "staff" and not actor.store_id:
        raise HTTPException(status_code=403, detail={
            "code": "no_store_context",
            "message": "Please sign in through Staff Login to select your store.",
        })
    return actor


def enforce_store_id(actor: PartnerActor, claimed_store_id: Optional[str]) -> None:
    """Assert a client-supplied `store_id` matches the JWT-bound store.

    For staff tokens: `claimed_store_id` (if present) must equal actor.store_id
    → mismatch is a 403 cross_store_denied. For owner tokens, any of the
    partner's warehouses is acceptable — callers should validate ownership.
    """
    if actor.actor_kind != "staff":
        return
    if claimed_store_id and claimed_store_id != actor.store_id:
        raise HTTPException(status_code=403, detail={
            "code": "cross_store_denied",
            "message": "You are not authorised to act on that store.",
        })


# ============================================================================
#                                Router
# ============================================================================

staff_router = APIRouter(prefix="/partner", tags=["partner-staff"])


# --- Pydantic ---------------------------------------------------------------

class StaffLoginIn(BaseModel):
    # Employee ID / Username / email — per Fixing_Prompt §5. Accept either.
    # An email-looking value is matched against `partner_staff.email`, any
    # other value is matched against `partner_staff.employee_code`.
    identifier: str = Field(..., min_length=3, max_length=200,
                            description="Email OR Employee ID (EMP-XXX-000).")
    # No min_length on login — we want ALL wrong-credential paths to return
    # a uniform 401 "Invalid credentials" so we don't leak the server-side
    # password policy through 422 validation errors.
    password: str = Field(..., max_length=200)
    store_id: str = Field(
        ..., min_length=2, max_length=32,
        description="Human-readable store code (e.g. MRT-ABJ-001). Required.",
    )
    # Back-compat: older clients still send `email`; accept it as an alias.
    email: Optional[EmailStr] = Field(default=None, exclude=True)


class StaffInviteIn(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=200)
    role: str = Field(..., pattern=_STORED_ROLES_PATTERN)
    warehouse_id: Optional[str] = Field(
        default=None,
        description="Primary store the teammate reports to. Defaults to the "
                    "inviter's active store when omitted.",
    )


class StaffAcceptInviteIn(BaseModel):
    token: str = Field(..., min_length=16, max_length=200)
    password: str = Field(..., min_length=8, max_length=200)


class StaffPatchIn(BaseModel):
    role: Optional[str] = Field(default=None, pattern=_STORED_ROLES_PATTERN)
    is_active: Optional[bool] = None


# --- Helpers ----------------------------------------------------------------

def _staff_dict(s: PartnerStaff) -> dict:
    return {
        "id": s.id, "email": s.email, "name": s.name, "role": s.role,
        "employee_code": s.employee_code, "warehouse_id": s.warehouse_id,
        "is_active": s.is_active, "must_reset_password": s.must_reset_password,
        "invite_pending": s.invite_accepted_at is None and s.password_hash is None,
        "last_login_at": s.last_login_at.isoformat() if s.last_login_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


async def _log(session: AsyncSession, actor: PartnerActor, action: str,
               target_id: Optional[str] = None, detail: Optional[str] = None) -> None:
    session.add(PartnerStaffAuditLog(
        partner_id=actor.partner_id,
        actor_kind=actor.actor_kind,
        actor_id=actor.actor_id,
        actor_email=actor.actor_email,
        action=action,
        target_id=target_id,
        detail=detail,
    ))


def _invite_url(token: str) -> str:
    base = os.environ.get("APP_BASE_URL", "").rstrip("/") or "https://baked.ci"
    return f"{base}/partner-portal/accept-invite?token={token}"


# --- Auth: staff login ------------------------------------------------------

@staff_router.post("/auth/staff-login")
async def staff_login(
    payload: StaffLoginIn, session: AsyncSession = Depends(get_session),
):
    # Multi-store login (Fixing_Prompt §14):
    #   1. Resolve store by code → must exist AND be operational (`active`).
    #   2. Resolve staff by email OR employee_code.
    #   3. Verify password.
    #   4. Verify staff belongs to that store (partner_id + warehouse_id).
    #   5. Emit JWT with store context claims.
    # Wrong-credential + inactive-store paths ALL return uniform 401
    # "Invalid credentials" — never leak which piece failed.

    identifier = (payload.identifier or payload.email or "").strip()
    if not identifier:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    resolved_store = (await session.execute(
        select(Warehouse).where(Warehouse.code == payload.store_id.strip().upper())
    )).scalar_one_or_none()
    if not resolved_store:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if resolved_store.status not in WAREHOUSE_STATUS_OPERATIONAL:
        # Store exists but isn't accepting logins. Audit and refuse with a
        # SPECIFIC (non-401) error so the client can tell the user what to do.
        session.add(PartnerStaffAuditLog(
            partner_id=resolved_store.partner_id,
            actor_kind="anonymous", actor_id="anonymous",
            actor_email=identifier[:200],
            action="staff.login_store_not_operational",
            target_id=resolved_store.id,
            detail=f"status={resolved_store.status}",
        ))
        await session.commit()
        raise HTTPException(status_code=403, detail={
            "code": "store_not_operational",
            "message": f"This store is currently {resolved_store.status.replace('_', ' ')}.",
        })

    # Email OR employee_code — the "@" sniff-test is enough because
    # employee_code is guaranteed to be uppercase + hyphenated.
    if "@" in identifier:
        query = select(PartnerStaff).where(
            func.lower(PartnerStaff.email) == identifier.lower()
        )
    else:
        query = select(PartnerStaff).where(
            PartnerStaff.employee_code == identifier.upper(),
        )
    row = (await session.execute(query)).scalar_one_or_none()
    if not row or not row.password_hash or not row.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, row.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # The staff MUST belong to the partner that owns this store. If they have
    # a primary `warehouse_id`, it MUST match. (Legacy staff without a primary
    # store default to the partner scope for backwards-compat.)
    partner_owns_store = (resolved_store.partner_id == row.partner_id)
    warehouse_matches   = (row.warehouse_id in (None, resolved_store.id))
    if not (partner_owns_store and warehouse_matches):
        session.add(PartnerStaffAuditLog(
            partner_id=row.partner_id,
            actor_kind="staff", actor_id=row.id, actor_email=row.email,
            action="staff.login_cross_store_denied",
            target_id=resolved_store.id,
            detail=f"attempted_store={payload.store_id}",
        ))
        await session.commit()
        raise HTTPException(status_code=403, detail={
            "code": "wrong_store",
            "message": "You are not assigned to that store.",
        })

    partner = await session.get(Partner, row.partner_id)
    if not partner or not partner.is_active:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    row.last_login_at = datetime.now(timezone.utc)
    # store_id + store_code in the JWT so the backend can enforce it on
    # every store-scoped request without an extra DB round-trip.
    token = create_access_token(
        row.id, role="partner_staff",
        extra={
            "staff_role": row.role, "partner_id": partner.id,
            "employee_code": row.employee_code,
            "store_id":   resolved_store.id,
            "store_code": resolved_store.code,
        },
    )
    await _log(session, PartnerActor(partner=partner, staff=row, role=row.role),
               action="staff.login",
               detail=f"store={payload.store_id} via={'email' if '@' in identifier else 'employee_code'}")
    await session.commit()

    return {
        "access_token": token, "token_type": "bearer",
        "expires_in": JWT_ACCESS_TTL_MIN * 60,
        "staff": _staff_dict(row),
        "partner": {
            "id": partner.id, "business_name": partner.business_name,
            "owner_name": partner.owner_name, "owner_email": partner.owner_email,
            "module": partner.module, "country": partner.country,
        },
        "store": {
            "id": resolved_store.id, "code": resolved_store.code,
            "name": resolved_store.name, "city": resolved_store.city,
            "status": resolved_store.status,
        },
    }


# --- Staff CRUD (owner + manager, unless noted) -----------------------------

@staff_router.get("/staff")
async def list_staff(
    actor: PartnerActor = Depends(require_role("owner", "manager")),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(PartnerStaff).where(PartnerStaff.partner_id == actor.partner_id)
        .order_by(PartnerStaff.created_at.asc())
    )).scalars().all()
    # Always synthesize the owner row on top so the UI has a complete list.
    owner_row = {
        "id": actor.partner.id,
        "email": actor.partner.owner_email,
        "name": actor.partner.owner_name,
        "role": "owner",
        "is_active": actor.partner.is_active,
        "must_reset_password": actor.partner.must_reset_password,
        "invite_pending": False,
        "last_login_at": None,
        "created_at": actor.partner.approved_at.isoformat() if actor.partner.approved_at else None,
        "is_owner_row": True,
    }
    return {
        "items": [owner_row] + [{**_staff_dict(r), "is_owner_row": False} for r in rows],
    }


@staff_router.post("/staff/invite", status_code=201)
async def invite_staff(
    payload: StaffInviteIn,
    actor: PartnerActor = Depends(require_role("owner", "manager")),
    session: AsyncSession = Depends(get_session),
):
    # Uniqueness: same email can't exist twice under the same partner
    existing = (await session.execute(
        select(PartnerStaff).where(
            PartnerStaff.partner_id == actor.partner_id,
            func.lower(PartnerStaff.email) == payload.email.lower(),
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="A teammate with this email already exists")

    # Resolve target warehouse (Fixing_Prompt §12 — explicit store assignment).
    #   * If invoker is staff, always default to their JWT-bound store.
    #   * Otherwise, use the invite payload's warehouse_id or the owner's
    #     first active warehouse.
    target_warehouse_id: Optional[str] = None
    if actor.actor_kind == "staff":
        target_warehouse_id = actor.store_id
    elif payload.warehouse_id:
        target_warehouse_id = payload.warehouse_id
    else:
        wh_row = (await session.execute(
            select(Warehouse).where(
                Warehouse.partner_id == actor.partner_id, Warehouse.is_active
            ).order_by(Warehouse.created_at.asc())
        )).scalar_one_or_none()
        target_warehouse_id = wh_row.id if wh_row else None

    # Validate warehouse belongs to actor's partner + is operational
    target_warehouse = None
    if target_warehouse_id:
        target_warehouse = await session.get(Warehouse, target_warehouse_id)
        if not target_warehouse or target_warehouse.partner_id != actor.partner_id:
            raise HTTPException(status_code=400, detail={
                "code": "invalid_warehouse",
                "message": "That store doesn't belong to your account.",
            })
        if target_warehouse.status not in WAREHOUSE_STATUS_OPERATIONAL:
            raise HTTPException(status_code=400, detail={
                "code": "store_not_operational",
                "message": f"Cannot invite to a store that is {target_warehouse.status.replace('_', ' ')}.",
            })

    # Auto-generate an employee_code. City3 is derived from the target store
    # (falls back to XXX for legacy partners).
    from modules.mart_partner.codes import next_employee_code
    emp_code = await next_employee_code(
        session, partner_id=actor.partner_id,
        city=(target_warehouse.city if target_warehouse else None),
    )

    token = secrets.token_urlsafe(24)
    row = PartnerStaff(
        partner_id=actor.partner_id,
        warehouse_id=target_warehouse_id,
        employee_code=emp_code,
        email=payload.email.lower(),
        name=payload.name.strip(),
        role=payload.role,
        password_hash=None,
        must_reset_password=False,
        invited_by_staff_id=actor.actor_id,
        invite_token=token,
        invite_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
        is_active=True,
    )
    session.add(row)
    await session.flush()

    # Create the primary store assignment row for multi-store forward-compat.
    if target_warehouse_id:
        from core.models import PartnerStaffStoreAssignment
        session.add(PartnerStaffStoreAssignment(
            staff_id=row.id, warehouse_id=target_warehouse_id, is_primary=True,
        ))

    invite_url = _invite_url(token)

    # Try SMTP; fall back gracefully — the API response ALWAYS includes the
    # invite URL so the inviter can copy-paste it into WhatsApp / SMS
    # if their SMTP is not configured yet.
    email_sent = False
    try:
        from core.mailer import send_email_async, is_configured
        if is_configured():
            subject = f"You're invited to join {actor.partner.business_name} on BAKĒD"
            html = f"""
              <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
                <h2 style="margin:0 0 8px">You're invited to join <strong>{actor.partner.business_name}</strong></h2>
                <p style="color:#555;margin:0 0 16px">
                  {actor.actor_email} has invited you to join their MARTbakēd store as a <b>{payload.role}</b>.
                </p>
                <a href="{invite_url}"
                   style="display:inline-block;background:#DC7F1E;color:#0a0a0f;text-decoration:none;
                          padding:12px 24px;border-radius:8px;font-weight:600">
                  Accept invitation
                </a>
                <p style="color:#888;font-size:12px;margin-top:24px">
                  Or copy this link: <br>
                  <code style="word-break:break-all">{invite_url}</code>
                </p>
                <p style="color:#888;font-size:12px;margin-top:16px">
                  This invitation expires in 14 days.
                </p>
              </div>"""
            text = (
                f"You're invited to join {actor.partner.business_name} on BAKĒD as a {payload.role}.\n\n"
                f"Accept: {invite_url}\n\n"
                f"This invitation expires in 14 days."
            )
            email_sent = await send_email_async(to=payload.email, subject=subject, html_body=html, text_body=text)
    except Exception:
        email_sent = False

    await _log(session, actor, action="staff.invite", target_id=row.id,
               detail=f"role={payload.role} email={payload.email}")
    await session.commit()
    await session.refresh(row)

    return {
        "staff": _staff_dict(row),
        "invite_url": invite_url,
        "email_sent": email_sent,
        "expires_at": row.invite_expires_at.isoformat(),
    }


@staff_router.post("/staff/accept-invite")
async def accept_invite(
    payload: StaffAcceptInviteIn, session: AsyncSession = Depends(get_session),
):
    row = (await session.execute(
        select(PartnerStaff).where(PartnerStaff.invite_token == payload.token)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found or already used")
    if row.invite_accepted_at:
        raise HTTPException(status_code=409, detail="Invitation already accepted — please log in")
    if row.invite_expires_at and row.invite_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="This teammate account has been deactivated")

    row.password_hash = hash_password(payload.password)
    row.invite_accepted_at = datetime.now(timezone.utc)
    row.invite_token = None
    row.must_reset_password = False
    row.last_login_at = datetime.now(timezone.utc)

    partner = await session.get(Partner, row.partner_id)
    if not partner or not partner.is_active:
        raise HTTPException(status_code=403, detail="Partner account inactive")

    token = create_access_token(
        row.id, role="partner_staff",
        extra={"staff_role": row.role, "partner_id": partner.id},
    )
    await _log(session, PartnerActor(partner=partner, staff=row, role=row.role),
               action="staff.invite_accepted", target_id=row.id)
    await session.commit()
    return {
        "access_token": token, "token_type": "bearer",
        "expires_in": JWT_ACCESS_TTL_MIN * 60,
        "staff": _staff_dict(row),
        "partner": {"id": partner.id, "business_name": partner.business_name,
                    "owner_name": partner.owner_name, "owner_email": partner.owner_email,
                    "module": partner.module, "country": partner.country},
    }


@staff_router.patch("/staff/{staff_id}")
async def update_staff(
    staff_id: str, payload: StaffPatchIn,
    # Managers can adjust roles + activation on the teammates they invited;
    # matches the invite-permission scope so UI + backend never disagree.
    actor: PartnerActor = Depends(require_role("owner", "manager")),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerStaff, staff_id)
    if not row or row.partner_id != actor.partner_id:
        raise HTTPException(status_code=404, detail="Teammate not found")
    # Guardrail: a manager can NEVER modify an owner (there isn't one in
    # partner_staff today, but future-proof against seeded rows) nor another
    # manager — only owner can demote/deactivate a peer manager.
    if actor.role == "manager" and row.role == "manager" and row.id != actor.actor_id:
        raise HTTPException(status_code=403, detail={
            "code": "cannot_modify_peer_manager",
            "message": "Only the owner can modify another manager.",
        })
    if payload.role:
        row.role = payload.role
    if payload.is_active is not None:
        row.is_active = payload.is_active
    await _log(session, actor, action="staff.update", target_id=row.id,
               detail=str(payload.model_dump(exclude_unset=True)))
    await session.commit()
    await session.refresh(row)
    return _staff_dict(row)


@staff_router.delete("/staff/{staff_id}", status_code=204)
async def delete_staff(
    staff_id: str,
    actor: PartnerActor = Depends(require_role("owner", "manager")),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerStaff, staff_id)
    if not row or row.partner_id != actor.partner_id:
        raise HTTPException(status_code=404, detail="Teammate not found")
    # Peer-manager guardrail (same rationale as PATCH above).
    if actor.role == "manager" and row.role == "manager" and row.id != actor.actor_id:
        raise HTTPException(status_code=403, detail={
            "code": "cannot_modify_peer_manager",
            "message": "Only the owner can remove another manager.",
        })
    await session.delete(row)
    await _log(session, actor, action="staff.delete", target_id=staff_id)
    await session.commit()
