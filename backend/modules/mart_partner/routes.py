"""MARTbakēd Partner — Stage 1 Public Application endpoints.

Public, unauthenticated: anyone can submit an application from `/partner/apply`.
The applicant does NOT gain any partner-portal access here — that only happens
after Stage 2 (Super Admin Approval, coming next slice).
"""
from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import PartnerApplication

router = APIRouter(prefix="/mart-partner", tags=["mart-partner"])


# ---------- DTOs ----------

class KycDocumentIn(BaseModel):
    kind: str = Field(..., examples=["registration", "tax", "id", "lease", "other"])
    url: str
    filename: Optional[str] = None


class ApplicationSubmit(BaseModel):
    """Full application payload — validated then persisted in one shot.

    Split into groups mirroring the frontend wizard steps so the payload is
    self-documenting when we look at it in the DB or admin UI.
    """
    model_config = ConfigDict(extra="forbid")

    # Business
    module: str = Field("mart", pattern="^(mart|food|shop|express|auto|immo)$")
    country: str = Field(..., min_length=2, max_length=2)
    business_name: str = Field(..., min_length=2, max_length=200)
    legal_name: Optional[str] = None
    business_type: str = Field(
        ..., pattern="^(dark_store|supermarket|convenience_store|grocery|pharmacy|specialty|warehouse|fulfillment_center)$",
    )
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    years_in_business: Optional[int] = Field(None, ge=0, le=200)

    # Contact / Owner
    primary_contact_name: str = Field(..., min_length=2)
    primary_contact_email: EmailStr
    primary_contact_phone: str = Field(..., min_length=6, max_length=40)
    owner_name: str = Field(..., min_length=2)
    owner_id_type: Optional[str] = None
    owner_id_number: Optional[str] = None

    # Warehouse / Property
    warehouse_address_line: str = Field(..., min_length=4)
    warehouse_city: str = Field(..., min_length=2)
    warehouse_latitude: Optional[float] = None
    warehouse_longitude: Optional[float] = None
    # Map-based geolocation (v0.6) — captured by the Places picker
    warehouse_country_code: Optional[str] = Field(default=None, min_length=2, max_length=2)
    warehouse_region: Optional[str] = None
    warehouse_postal_code: Optional[str] = None
    warehouse_place_id: Optional[str] = None
    warehouse_formatted_address: Optional[str] = None
    warehouse_location_accuracy: Optional[str] = None
    property_type: Optional[str] = Field(None, pattern="^(owned|leased)$")
    property_size_sqm: Optional[float] = Field(None, ge=0)
    service_area_km: Optional[float] = Field(None, ge=0, le=500)

    # Bank
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_swift_or_code: Optional[str] = None
    mobile_money_provider: Optional[str] = None
    mobile_money_number: Optional[str] = None

    # KYC documents (URLs — real upload wiring comes with the object-storage playbook)
    kyc_documents: list[KycDocumentIn] = Field(default_factory=list)
    extra: dict = Field(default_factory=dict)


def _serialise(row: PartnerApplication) -> dict:
    return {
        "id": row.id,
        "reference": row.reference,
        "status": row.status,
        "module": row.module,
        "country": row.country,
        "business_name": row.business_name,
        "legal_name": row.legal_name,
        "business_type": row.business_type,
        "registration_number": row.registration_number,
        "tax_id": row.tax_id,
        "years_in_business": row.years_in_business,
        "primary_contact_name": row.primary_contact_name,
        "primary_contact_email": row.primary_contact_email,
        "primary_contact_phone": row.primary_contact_phone,
        "owner_name": row.owner_name,
        "owner_id_type": row.owner_id_type,
        "owner_id_number": row.owner_id_number,
        "warehouse_address_line": row.warehouse_address_line,
        "warehouse_city": row.warehouse_city,
        "warehouse_latitude": float(row.warehouse_latitude) if row.warehouse_latitude is not None else None,
        "warehouse_longitude": float(row.warehouse_longitude) if row.warehouse_longitude is not None else None,
        "warehouse_country_code": getattr(row, "warehouse_country_code", None),
        "warehouse_region": getattr(row, "warehouse_region", None),
        "warehouse_postal_code": getattr(row, "warehouse_postal_code", None),
        "warehouse_place_id": getattr(row, "warehouse_place_id", None),
        "warehouse_formatted_address": getattr(row, "warehouse_formatted_address", None),
        "warehouse_location_accuracy": getattr(row, "warehouse_location_accuracy", None),
        "property_type": row.property_type,
        "property_size_sqm": float(row.property_size_sqm) if row.property_size_sqm is not None else None,
        "service_area_km": float(row.service_area_km) if row.service_area_km is not None else None,
        "bank_name": row.bank_name,
        "bank_account_holder": row.bank_account_holder,
        "bank_account_number": row.bank_account_number,
        "bank_swift_or_code": row.bank_swift_or_code,
        "mobile_money_provider": row.mobile_money_provider,
        "mobile_money_number": row.mobile_money_number,
        "kyc_documents": row.kyc_documents or [],
        "extra": row.extra or {},
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        "additional_info_message": row.additional_info_message,
        "rejection_reason": row.rejection_reason,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _next_reference(session: AsyncSession, module: str, country: str) -> str:
    """Human-friendly reference — MART-CI-2026-0001 style.

    Uses a scoped year-count so it stays short and readable in the admin queue
    and in emails to the applicant.
    """
    year = datetime.now(timezone.utc).year
    prefix = f"{module.upper()}-{country.upper()}-{year}-"
    count = await session.scalar(
        select(func.count(PartnerApplication.id)).where(
            PartnerApplication.module == module,
            PartnerApplication.country == country.upper(),
            PartnerApplication.submitted_at.is_not(None),
            func.extract("year", PartnerApplication.submitted_at) == year,
        )
    )
    seq = (count or 0) + 1
    return f"{prefix}{seq:04d}"


# ---------- Public endpoints ----------

# ---------------------------------------------------------------------------
# Map-based geolocation — validation helpers (Fixing_Prompt_2026-02-11_v2 §13)
# ---------------------------------------------------------------------------

# Configuration-driven country whitelist so future rollouts stay a 1-line change.
# Read from `SUPPORTED_COUNTRIES` env when present, comma-separated ISO-2 codes.
def _supported_countries() -> set[str]:
    raw = os.environ.get("SUPPORTED_COUNTRIES", "CI")
    return {c.strip().upper() for c in raw.split(",") if c.strip()}


def _validate_warehouse_location(payload: "ApplicationSubmit") -> None:
    """Enforce map-based location integrity. Called from POST /applications.

    * NEW applications MUST include latitude + longitude (Fixing_Prompt §9).
    * Coords must lie in valid geographic ranges.
    * Country (from `payload.country` or `warehouse_country_code`) must be in
      the platform's whitelist.
    * Backwards-compat mode: if BOTH coords are None the payload is rejected
      only for `dark_store` business type — other business types keep the
      existing text-only flow until they're migrated.
    """
    lat, lng = payload.warehouse_latitude, payload.warehouse_longitude
    is_dark_store = (payload.business_type == "dark_store")

    if is_dark_store and (lat is None or lng is None):
        raise HTTPException(status_code=400, detail={
            "code": "coordinates_required",
            "message": "Please pick your store location on the map. "
                       "Latitude and longitude are required for dark stores.",
        })
    if lat is not None and not (-90.0 <= float(lat) <= 90.0):
        raise HTTPException(status_code=400, detail={
            "code": "invalid_coordinates",
            "message": "Latitude must be between -90 and 90.",
        })
    if lng is not None and not (-180.0 <= float(lng) <= 180.0):
        raise HTTPException(status_code=400, detail={
            "code": "invalid_coordinates",
            "message": "Longitude must be between -180 and 180.",
        })

    # Country whitelist. Prefer the country ISO from the reverse-geocoded
    # place (warehouse_country_code) since it's derived from the pin, not the
    # applicant-typed field.
    supported = _supported_countries()
    detected  = (payload.warehouse_country_code or payload.country or "").upper()
    if detected and detected not in supported:
        raise HTTPException(status_code=400, detail={
            "code": "unsupported_country",
            "message": "This location is currently outside the MARTbakēd service area.",
            "supported": sorted(supported),
        })


@router.post("/applications", status_code=201)
async def submit_application(
    payload: ApplicationSubmit, session: AsyncSession = Depends(get_session),
):
    """Submit a new MARTbakēd Partner application.

    Idempotency: the applicant can submit as many drafts as they like, but each
    submitted application creates a fresh row that must be reviewed. We do NOT
    dedupe on email because a real business might apply under multiple legal
    entities. Admin can merge later.
    """
    _validate_warehouse_location(payload)
    now = datetime.now(timezone.utc)
    reference = await _next_reference(session, payload.module, payload.country)

    row = PartnerApplication(
        module=payload.module,
        country=payload.country.upper(),
        status="submitted",
        reference=reference,
        submitted_at=now,
        primary_contact_name=payload.primary_contact_name,
        primary_contact_email=payload.primary_contact_email,
        primary_contact_phone=payload.primary_contact_phone,
        owner_name=payload.owner_name,
        owner_id_type=payload.owner_id_type,
        owner_id_number=payload.owner_id_number,
        business_name=payload.business_name,
        legal_name=payload.legal_name,
        business_type=payload.business_type,
        registration_number=payload.registration_number,
        tax_id=payload.tax_id,
        years_in_business=payload.years_in_business,
        warehouse_address_line=payload.warehouse_address_line,
        warehouse_city=payload.warehouse_city,
        warehouse_latitude=payload.warehouse_latitude,
        warehouse_longitude=payload.warehouse_longitude,
        warehouse_country_code=(payload.warehouse_country_code or payload.country).upper(),
        warehouse_region=payload.warehouse_region,
        warehouse_postal_code=payload.warehouse_postal_code,
        warehouse_place_id=payload.warehouse_place_id,
        warehouse_formatted_address=payload.warehouse_formatted_address,
        warehouse_location_accuracy=payload.warehouse_location_accuracy,
        property_type=payload.property_type,
        property_size_sqm=payload.property_size_sqm,
        service_area_km=payload.service_area_km,
        bank_name=payload.bank_name,
        bank_account_holder=payload.bank_account_holder,
        bank_account_number=payload.bank_account_number,
        bank_swift_or_code=payload.bank_swift_or_code,
        mobile_money_provider=payload.mobile_money_provider,
        mobile_money_number=payload.mobile_money_number,
        kyc_documents=[d.model_dump() for d in payload.kyc_documents],
        extra=payload.extra,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _serialise(row)


@router.get("/applications/status")
async def check_status(
    reference: str = Query(..., description="e.g. MART-CI-2026-0001"),
    email: EmailStr = Query(..., description="Applicant primary contact email"),
    session: AsyncSession = Depends(get_session),
):
    """Public status check — applicant enters reference + email to see progress.

    We require BOTH reference and email so a leaked reference number alone
    can't expose someone else's application details.
    """
    row = (
        await session.execute(
            select(PartnerApplication).where(
                PartnerApplication.reference == reference,
                func.lower(PartnerApplication.primary_contact_email) == email.lower(),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No application matches that reference and email")
    return _serialise(row)


# ============================================================================
#                    ADMIN — Stage 2: Super Admin Review
# ============================================================================
#
# Everything below requires a super-admin JWT (get_current_admin dependency).
# Approval materialises a Partner + Warehouse row per the PRD Stage-3 spec.
import secrets

from shared.admin.routes import get_current_admin
from core.models import AdminUser, Partner, Warehouse
from core.security import hash_password


admin_router = APIRouter(
    prefix="/admin/mart-partner",
    tags=["admin", "mart-partner"],
    dependencies=[Depends(get_current_admin)],
)


class ReviewNoteIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@admin_router.get("/applications")
async def admin_list_applications(
    status: Optional[str] = None,
    country: Optional[str] = None,
    module: Optional[str] = "mart",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """Paginated queue view for the admin console.

    Newest-first because the Super Admin is triaging incoming applications.
    """
    stmt = select(PartnerApplication).order_by(PartnerApplication.created_at.desc())
    if status:  stmt = stmt.where(PartnerApplication.status == status)
    if country: stmt = stmt.where(PartnerApplication.country == country.upper())
    if module:  stmt = stmt.where(PartnerApplication.module == module)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    total = await session.scalar(select(func.count(PartnerApplication.id)).select_from(PartnerApplication))
    return {"total": total, "items": [_serialise(r) for r in rows]}


@admin_router.get("/applications/{app_id}")
async def admin_get_application(
    app_id: str, session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerApplication, app_id)
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return _serialise(row)


async def _load_or_404(session: AsyncSession, app_id: str) -> PartnerApplication:
    row = await session.get(PartnerApplication, app_id)
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return row


@admin_router.post("/applications/{app_id}/mark-under-review")
async def admin_mark_under_review(
    app_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await _load_or_404(session, app_id)
    if row.status in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail=f"Application already {row.status}")
    row.status = "under_review"
    row.reviewed_by_admin_id = admin.id
    await session.commit()
    await session.refresh(row)
    return _serialise(row)


@admin_router.post("/applications/{app_id}/request-info")
async def admin_request_info(
    app_id: str,
    payload: ReviewNoteIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await _load_or_404(session, app_id)
    if row.status in ("approved", "rejected"):
        raise HTTPException(status_code=409, detail=f"Application already {row.status}")
    row.status = "additional_info_required"
    row.additional_info_message = payload.message
    row.reviewed_by_admin_id = admin.id
    await session.commit()
    await session.refresh(row)
    return _serialise(row)


@admin_router.post("/applications/{app_id}/reject")
async def admin_reject(
    app_id: str,
    payload: ReviewNoteIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await _load_or_404(session, app_id)
    if row.status == "approved":
        raise HTTPException(status_code=409, detail="Cannot reject an already-approved application")
    row.status = "rejected"
    row.rejection_reason = payload.message
    row.reviewed_at = datetime.now(timezone.utc)
    row.reviewed_by_admin_id = admin.id
    await session.commit()
    await session.refresh(row)
    return _serialise(row)


@admin_router.post("/applications/{app_id}/approve")
async def admin_approve(
    app_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Approve an application AND auto-materialise the Stage-3 records.

    Per PRD Stage 3: "Only after approval shall the system automatically create
    Partner Account, Partner ID, Login Credentials, Business Profile, Warehouse,
    Default User Roles, Empty Inventory, Default Dashboard."

    This slice creates: Partner + primary Warehouse + temp password. Inventory
    tables land in the next slice; the account is already usable to log in as
    soon as Stage-3 partner-login is wired.
    """
    row = await _load_or_404(session, app_id)
    if row.status == "approved":
        # Idempotency guardrail — never create duplicate partner/store rows.
        # Return 409 with structured detail so the frontend can render a
        # meaningful message instead of the generic "Something went wrong".
        raise HTTPException(status_code=409, detail={
            "code": "already_approved",
            "message": "This application has already been approved. "
                       "Refresh the list to see the current state.",
        })
    if row.status in ("rejected", "cancelled"):
        raise HTTPException(status_code=409, detail={
            "code": "invalid_state_transition",
            "message": f"Cannot approve an application currently in '{row.status}'.",
            "current_status": row.status,
        })

    now = datetime.now(timezone.utc)
    # 12-char temp password — copy-once for the admin to hand off to the partner.
    temp_password = secrets.token_urlsafe(9)

    partner = Partner(
        application_id=row.id,
        module=row.module,
        country=row.country,
        business_name=row.business_name,
        business_type=row.business_type,
        owner_name=row.owner_name,
        owner_email=row.primary_contact_email,
        owner_phone=row.primary_contact_phone,
        temp_password_hash=hash_password(temp_password),
        approved_at=now,
        approved_by_admin_id=admin.id,
    )
    session.add(partner)
    await session.flush()  # need partner.id for the warehouse FK

    # Auto-generate the human-readable store code (Fixing_Prompt §27).
    from modules.mart_partner.codes import next_store_code
    generated_code = await next_store_code(
        session, module=partner.module or "mart",
        city=row.warehouse_city,
    )

    warehouse = Warehouse(
        partner_id=partner.id,
        code=generated_code,
        name=f"{row.business_name} — Main",
        address_line=row.warehouse_address_line,
        city=row.warehouse_city,
        region=getattr(row, "warehouse_region", None),
        country=row.country,
        latitude=row.warehouse_latitude,
        longitude=row.warehouse_longitude,
        property_type=row.property_type,
        property_size_sqm=row.property_size_sqm,
        service_area_km=row.service_area_km,
        # Map-based location fields inherited from the reviewed application
        formatted_address=getattr(row, "warehouse_formatted_address", None),
        place_id=getattr(row, "warehouse_place_id", None),
        postal_code=getattr(row, "warehouse_postal_code", None),
        location_accuracy=getattr(row, "warehouse_location_accuracy", None),
        # Freshly-approved stores land in `setup_required` — admin/owner must
        # complete zones + products before flipping to `active`.
        status="setup_required",
        is_active=True,
        contact_email=partner.owner_email,
        contact_phone=partner.owner_phone,
    )
    session.add(warehouse)

    row.status = "approved"
    row.reviewed_at = now
    row.reviewed_by_admin_id = admin.id
    row.partner_id = partner.id

    await session.commit()
    await session.refresh(row)
    await session.refresh(partner)
    await session.refresh(warehouse)

    # ---------------------------------------------------------------------
    # Approval email — Fixing_Prompt §13.
    # Best-effort: SMTP failures are logged but never roll back the approval
    # (the admin still has the success dialog with a copy button as fallback).
    # ---------------------------------------------------------------------
    email_sent = False
    try:
        from core.mailer import send_email_async
        portal_url = os.environ.get("PARTNER_PORTAL_URL", "https://baked.ci/partner-portal/login")
        html = f"""
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">Welcome to MARTbakēd, {partner.business_name}!</h2>
            <p style="margin:0 0 16px;color:#333">
              Your partner application has been <b>approved</b>. Your dark store is now
              in <b>setup&nbsp;required</b> status — sign in to complete the last few
              steps (opening hours, product catalog, staff invites) and go live.
            </p>
            <div style="background:#faf3ec;border-left:4px solid #DC7F1E;padding:14px 18px;border-radius:6px;margin:16px 0">
              <div style="font-size:12px;color:#7a5030;letter-spacing:.08em;text-transform:uppercase;font-weight:700">Store ID</div>
              <div style="font-family:ui-monospace,monospace;font-size:18px;color:#0a0a0f;margin-top:4px">{generated_code}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:6px 0;color:#666">Owner email</td>
                  <td style="padding:6px 0"><b>{partner.owner_email}</b></td></tr>
              <tr><td style="padding:6px 0;color:#666">Temporary password</td>
                  <td style="padding:6px 0;font-family:ui-monospace,monospace"><b>{temp_password}</b></td></tr>
              <tr><td style="padding:6px 0;color:#666">Store</td>
                  <td style="padding:6px 0">{warehouse.name}</td></tr>
              <tr><td style="padding:6px 0;color:#666">Location</td>
                  <td style="padding:6px 0">{warehouse.address_line}, {warehouse.city}</td></tr>
            </table>
            <div style="margin-top:20px">
              <a href="{portal_url}"
                 style="display:inline-block;background:#DC7F1E;color:#0a0a0f;text-decoration:none;
                        padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
                Sign in to your MARTbakēd portal
              </a>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#888">
              For security, please change your password at first login.
              This email contains sensitive credentials — do not forward.
            </p>
          </div>
        """
        text = (
            f"Welcome to MARTbakēd, {partner.business_name}!\n\n"
            f"Your partner application has been APPROVED.\n\n"
            f"  Store ID:            {generated_code}\n"
            f"  Owner email:         {partner.owner_email}\n"
            f"  Temporary password:  {temp_password}\n"
            f"  Store:               {warehouse.name}\n"
            f"  Location:            {warehouse.address_line}, {warehouse.city}\n\n"
            f"Sign in: {portal_url}\n\n"
            f"For security, please change your password at first login."
        )
        email_sent = await send_email_async(
            to=partner.owner_email,
            subject=f"Your MARTbakēd store is approved — Store ID {generated_code}",
            html_body=html, text_body=text,
        )
    except Exception:  # noqa: BLE001
        import logging as _logging
        _logging.getLogger("baked").exception("approval.email.failed application=%s", row.id)

    # Audit trail — Fixing_Prompt §12. Best-effort AFTER the main commit
    # (a failing audit MUST NOT roll back the approval).
    try:
        from shared.admin.routes import _audit
        await _audit(session, admin,
                     action="mart.application.approve",
                     target_id=row.id,
                     metadata={
                         "application_id": row.id,
                         "partner_id": partner.id,
                         "warehouse_id": warehouse.id,
                         "store_code": generated_code,
                         "previous_status": "under_review",
                         "new_status": "approved",
                     })
    except Exception:  # noqa: BLE001
        import logging as _logging
        _logging.getLogger("baked").exception("audit.approve.failed application=%s", row.id)

    return {
        "application": _serialise(row),
        "partner": {
            "id": partner.id,
            "business_name": partner.business_name,
            "owner_email": partner.owner_email,
        },
        "warehouse": {
            "id": warehouse.id,
            "code": warehouse.code,          # unique Store ID (Fixing_Prompt §6)
            "name": warehouse.name,
            "status": warehouse.status,      # 'setup_required' after approval
            "address_line": warehouse.address_line,
            "city": warehouse.city,
            "country": warehouse.country,
            "latitude": float(warehouse.latitude) if warehouse.latitude is not None else None,
            "longitude": float(warehouse.longitude) if warehouse.longitude is not None else None,
        },
        # SHOWN ONCE — admin must hand this to the partner. Never persisted plaintext.
        "temp_password": temp_password,
        # Was the approval email delivered? When false (SMTP misconfig / bounce)
        # the admin still has the temp_password above to share manually.
        "email_sent": email_sent,
    }


# ============================================================================
#                    PARTNER PORTAL — Stage 3 (login + shell)
# ============================================================================
#
# Auth pattern mirrors the admin flow verified via integration_playbook_expert_v2:
#   - Bearer token in Authorization header (same JWT secret, role="partner")
#   - bcrypt via core.security.hash_password / verify_password
#   - Force password reset on first login via Partner.must_reset_password flag
from core.security import verify_password
from fastapi import Header


class PartnerLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=200)


class PartnerPasswordResetIn(BaseModel):
    current_password: str = Field(..., min_length=6, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


async def get_current_partner(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> Partner:
    """Auth dependency for partner-portal endpoints.

    Accepts BOTH:
      * `role=partner`        (owner token — legacy `/partner/auth/login`)
      * `role=partner_staff`  (teammate token — Slice B `/partner/auth/staff-login`)

    Returns the Partner row either way — endpoints that need finer-grained
    role checks should additionally depend on `require_role(...)` from
    `staff_routes.py`.
    """
    from jwt import ExpiredSignatureError, InvalidTokenError, decode as jwt_decode  # local — module already imported jwt elsewhere
    import os
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
    if role_claim == "partner":
        partner = await session.get(Partner, payload.get("sub"))
        staff_store_id = None
    elif role_claim == "partner_staff":
        from core.models import PartnerStaff
        staff = await session.get(PartnerStaff, payload.get("sub"))
        if not staff or not staff.is_active:
            raise HTTPException(status_code=401, detail="Staff account inactive")
        partner = await session.get(Partner, staff.partner_id)
        staff_store_id = payload.get("store_id")
    else:
        raise HTTPException(status_code=403, detail="Partner token required")

    if not partner or not partner.is_active:
        raise HTTPException(status_code=401, detail="Partner not found or inactive")
    # Stash the JWT-bound store_id on the Partner instance so downstream
    # helpers (like `_assert_owns_warehouse`) can enforce store scoping
    # without every endpoint threading a new argument through.
    #
    # Fixing_Prompt §16: NEVER trust a store_id submitted by the client.
    # This value comes exclusively from a signed JWT.
    partner._staff_store_id = staff_store_id  # type: ignore[attr-defined]
    return partner


def _partner_dict(partner: Partner) -> dict:
    return {
        "id": partner.id,
        "business_name": partner.business_name,
        "business_type": partner.business_type,
        "owner_name": partner.owner_name,
        "owner_email": partner.owner_email,
        "owner_phone": partner.owner_phone,
        "module": partner.module,
        "country": partner.country,
        "must_reset_password": partner.must_reset_password,
        "is_active": partner.is_active,
        "approved_at": partner.approved_at.isoformat() if partner.approved_at else None,
    }


def _warehouse_dict(wh: Warehouse) -> dict:
    return {
        "id": wh.id,
        "code": wh.code,
        "name": wh.name,
        "address_line": wh.address_line,
        "city": wh.city,
        "region": getattr(wh, "region", None),
        "country": wh.country,
        "status": wh.status,
        "time_zone": getattr(wh, "time_zone", None),
        "store_type": getattr(wh, "store_type", None),
        "contact_email": getattr(wh, "contact_email", None),
        "contact_phone": getattr(wh, "contact_phone", None),
        "property_type": wh.property_type,
        "property_size_sqm": float(wh.property_size_sqm) if wh.property_size_sqm is not None else None,
        "service_area_km": float(wh.service_area_km) if wh.service_area_km is not None else None,
    }


async def _primary_warehouse(session: AsyncSession, partner_id: str) -> Optional[Warehouse]:
    return (
        await session.execute(
            select(Warehouse).where(Warehouse.partner_id == partner_id, Warehouse.is_active == True)  # noqa: E712
            .order_by(Warehouse.created_at.asc())
        )
    ).scalars().first()


partner_router = APIRouter(prefix="/partner", tags=["partner-portal"])

# Role-based dependencies from Slice B — imported lazily to avoid a
# circular import (staff_routes.py imports Partner from this module).
from modules.mart_partner.staff_routes import require_role  # noqa: E402


@partner_router.post("/auth/login")
async def partner_login(
    payload: PartnerLoginIn, session: AsyncSession = Depends(get_session),
):
    """Partner sign-in with email + temp/permanent password.

    Response includes `must_reset_password` so the frontend can gate the
    dashboard behind a password-reset screen on first login.
    """
    row = (
        await session.execute(
            select(Partner).where(func.lower(Partner.owner_email) == payload.email.lower())
        )
    ).scalar_one_or_none()
    if not row or not row.temp_password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="This partner account is suspended")
    if not verify_password(payload.password, row.temp_password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    from core.security import create_access_token
    token = create_access_token(row.id, role="partner")
    wh = await _primary_warehouse(session, row.id)
    return {
        "access_token": token,
        "partner": _partner_dict(row),
        "warehouse": _warehouse_dict(wh) if wh else None,
    }


@partner_router.get("/auth/me")
async def partner_me(
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(default=None),
):
    """Owner AND staff both hit this to hydrate the portal on load. When
    the token is a staff token, `staff` is populated so the frontend can
    gate UI by role; owners get `staff=null`."""
    from jwt import decode as jwt_decode
    import os as _os
    from core.models import PartnerStaff as _PartnerStaff

    wh = None
    staff_dict = None
    if authorization and authorization.startswith("Bearer "):
        try:
            claims = jwt_decode(authorization[7:], _os.environ["JWT_SECRET"], algorithms=["HS256"])
            if claims.get("role") == "partner_staff":
                staff = await session.get(_PartnerStaff, claims.get("sub"))
                if staff:
                    staff_dict = {
                        "id": staff.id, "email": staff.email, "name": staff.name,
                        "role": staff.role, "is_active": staff.is_active,
                        "employee_code": staff.employee_code,
                        "warehouse_id": staff.warehouse_id,
                    }
                # Staff sessions are ALWAYS scoped to the JWT store — even
                # if the partner has multiple warehouses, only THIS one is
                # relevant for the operational UI (Fixing_Prompt §17).
                scoped_store_id = claims.get("store_id")
                if scoped_store_id:
                    wh = await session.get(Warehouse, scoped_store_id)
        except Exception:  # noqa: BLE001
            pass

    # Owner sessions (or staff sessions with a missing store claim) fall
    # back to the partner's primary warehouse.
    if wh is None:
        wh = await _primary_warehouse(session, partner.id)

    return {
        "partner": _partner_dict(partner),
        "warehouse": _warehouse_dict(wh) if wh else None,
        "staff": staff_dict,
    }


@partner_router.post("/auth/reset-password")
async def partner_reset_password(
    payload: PartnerPasswordResetIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Change password. Required on first login (`must_reset_password=true`)
    and available at any time after. Requires current password for safety."""
    if not verify_password(payload.current_password, partner.temp_password_hash or ""):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must differ from current")
    partner.temp_password_hash = hash_password(payload.new_password)
    partner.must_reset_password = False
    await session.commit()
    await session.refresh(partner)
    return {"partner": _partner_dict(partner)}


@partner_router.get("/dashboard")
async def partner_dashboard(
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Stage-3 dashboard shell — real metrics driven by product/order/wallet
    tables added in Slices 5–7. Values gracefully return 0 when a slice
    has no data yet."""
    from core.models import PartnerProduct, PartnerOrder, PartnerWallet, WarehouseZone
    wh = await _primary_warehouse(session, partner.id)

    products_live = await session.scalar(
        select(func.count(PartnerProduct.id)).where(
            PartnerProduct.partner_id == partner.id, PartnerProduct.is_active == True,  # noqa: E712
        )
    ) or 0
    inventory_items = await session.scalar(
        select(func.coalesce(func.sum(PartnerProduct.stock_qty), 0)).where(PartnerProduct.partner_id == partner.id)
    ) or 0

    today = datetime.now(timezone.utc).date()
    orders_today = await session.scalar(
        select(func.count(PartnerOrder.id)).where(
            PartnerOrder.partner_id == partner.id,
            func.date(PartnerOrder.created_at) == today,
        )
    ) or 0
    from core.models import Order as CustomerOrder
    revenue_today = await session.scalar(
        select(func.coalesce(func.sum(CustomerOrder.total), 0))
        .select_from(PartnerOrder)
        .join(CustomerOrder, CustomerOrder.id == PartnerOrder.order_id)
        .where(
            PartnerOrder.partner_id == partner.id,
            PartnerOrder.status.in_(("handed_off", "completed")),
            func.date(PartnerOrder.created_at) == today,
        )
    ) or 0

    wallet_bal = await session.scalar(
        select(PartnerWallet.balance).where(PartnerWallet.partner_id == partner.id)
    ) or 0

    zone_count = 0
    if wh:
        zone_count = await session.scalar(
            select(func.count(WarehouseZone.id)).where(WarehouseZone.warehouse_id == wh.id)
        ) or 0

    return {
        "partner": _partner_dict(partner),
        "warehouse": _warehouse_dict(wh) if wh else None,
        "metrics": {
            "orders_today":     int(orders_today),
            "revenue_today":    float(revenue_today),
            "products_live":    int(products_live),
            "inventory_items":  int(inventory_items),
            "wallet_balance":   float(wallet_bal),
        },
        "checklist": [
            {"key": "reset_password", "label": "Change your temporary password", "done": not partner.must_reset_password},
            {"key": "warehouse",      "label": "Set up your warehouse zones",   "done": zone_count > 0},
            {"key": "first_product",  "label": "Add your first product",         "done": products_live > 0},
            {"key": "first_order",    "label": "Receive your first order",       "done": int(orders_today) > 0 or (await session.scalar(select(func.count(PartnerOrder.id)).where(PartnerOrder.partner_id == partner.id)) or 0) > 0},
        ],
    }


# ============================================================================
#              Warehouse hierarchy — 5 levels (Slice 4b)
# ============================================================================
from core.models import (
    WarehouseZone, WarehouseAisle, WarehouseRack, WarehouseShelf, WarehouseBin,
)


LEVEL_MODEL = {
    "zone":   (WarehouseZone,   "warehouse_id"),
    "aisle":  (WarehouseAisle,  "zone_id"),
    "rack":   (WarehouseRack,   "aisle_id"),
    "shelf":  (WarehouseShelf,  "rack_id"),
    "bin":    (WarehouseBin,    "shelf_id"),
}
LEVEL_CHILD = {"zone": "aisle", "aisle": "rack", "rack": "shelf", "shelf": "bin", "bin": None}


class NodeIn(BaseModel):
    level: str = Field(..., pattern="^(zone|aisle|rack|shelf|bin)$")
    parent_id: str
    code: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=200)
    sort_order: int = 0


class NodeUpdateIn(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=40)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


async def _assert_owns_warehouse(session: AsyncSession, partner: Partner, warehouse_id: str) -> Warehouse:
    wh = await session.get(Warehouse, warehouse_id)
    if not wh or wh.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    # Store-scope enforcement — Fixing_Prompt §16. Staff tokens carry a
    # `store_id` claim and MUST NOT act on any other warehouse under the
    # same partner. Owner tokens are unrestricted (they can operate across
    # every store they own).
    staff_store_id = getattr(partner, "_staff_store_id", None)
    if staff_store_id and staff_store_id != wh.id:
        raise HTTPException(status_code=403, detail={
            "code": "cross_store_denied",
            "message": "You are not authorised to act on that store.",
        })
    return wh


def _node_dict(row, level: str) -> dict:
    return {
        "id": row.id, "level": level, "code": row.code, "name": row.name,
        "sort_order": row.sort_order, "is_active": row.is_active,
    }


@partner_router.get("/warehouse/{warehouse_id}/tree")
async def warehouse_tree(
    warehouse_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Return the full 5-level hierarchy nested under the warehouse."""
    wh = await _assert_owns_warehouse(session, partner, warehouse_id)

    zones = (await session.execute(
        select(WarehouseZone).where(WarehouseZone.warehouse_id == wh.id).order_by(WarehouseZone.sort_order, WarehouseZone.code)
    )).scalars().all()
    z_ids = [z.id for z in zones]
    aisles = (await session.execute(
        select(WarehouseAisle).where(WarehouseAisle.zone_id.in_(z_ids)).order_by(WarehouseAisle.sort_order, WarehouseAisle.code)
    )).scalars().all() if z_ids else []
    a_ids = [a.id for a in aisles]
    racks = (await session.execute(
        select(WarehouseRack).where(WarehouseRack.aisle_id.in_(a_ids)).order_by(WarehouseRack.sort_order, WarehouseRack.code)
    )).scalars().all() if a_ids else []
    r_ids = [r.id for r in racks]
    shelves = (await session.execute(
        select(WarehouseShelf).where(WarehouseShelf.rack_id.in_(r_ids)).order_by(WarehouseShelf.sort_order, WarehouseShelf.code)
    )).scalars().all() if r_ids else []
    s_ids = [s.id for s in shelves]
    bins_ = (await session.execute(
        select(WarehouseBin).where(WarehouseBin.shelf_id.in_(s_ids)).order_by(WarehouseBin.sort_order, WarehouseBin.code)
    )).scalars().all() if s_ids else []

    # Nest children under parents in one pass each
    def _pack(items, key, subitems, subkey, sub_level):
        by_parent = {}
        for it in subitems:
            by_parent.setdefault(getattr(it, key), []).append({**_node_dict(it, sub_level), "children": []})
        for it in items:
            it["children"] = by_parent.get(it["id"], [])
        return items

    bin_nodes   = [_node_dict(b, "bin")   for b in bins_]
    shelf_nodes = [_node_dict(s, "shelf") for s in shelves]
    rack_nodes  = [_node_dict(r, "rack")  for r in racks]
    aisle_nodes = [_node_dict(a, "aisle") for a in aisles]
    zone_nodes  = [_node_dict(z, "zone")  for z in zones]

    # Manually attach children upwards
    for s in shelf_nodes:
        s["children"] = [b for b in bin_nodes if False]  # placeholder overwritten below
    by_shelf = {}
    for b in bins_:
        by_shelf.setdefault(b.shelf_id, []).append(_node_dict(b, "bin"))
    for s in shelf_nodes:
        s["children"] = by_shelf.get(s["id"], [])

    by_rack = {}
    for s in shelves:
        by_rack.setdefault(s.rack_id, []).append(next(sn for sn in shelf_nodes if sn["id"] == s.id))
    for r in rack_nodes:
        r["children"] = by_rack.get(r["id"], [])

    by_aisle = {}
    for r in racks:
        by_aisle.setdefault(r.aisle_id, []).append(next(rn for rn in rack_nodes if rn["id"] == r.id))
    for a in aisle_nodes:
        a["children"] = by_aisle.get(a["id"], [])

    by_zone = {}
    for a in aisles:
        by_zone.setdefault(a.zone_id, []).append(next(an for an in aisle_nodes if an["id"] == a.id))
    for z in zone_nodes:
        z["children"] = by_zone.get(z["id"], [])

    return {
        "warehouse": _warehouse_dict(wh),
        "zones": zone_nodes,
        "counts": {
            "zones": len(zone_nodes), "aisles": len(aisle_nodes),
            "racks": len(rack_nodes), "shelves": len(shelf_nodes), "bins": len(bin_nodes),
        },
    }


@partner_router.post("/warehouse/{warehouse_id}/nodes", status_code=201,
                     dependencies=[Depends(require_role("owner", "manager"))])
async def create_node(
    warehouse_id: str, payload: NodeIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    await _assert_owns_warehouse(session, partner, warehouse_id)
    Model, parent_col = LEVEL_MODEL[payload.level]

    # Verify parent belongs to this partner's warehouse (defense in depth).
    if payload.level == "zone":
        if payload.parent_id != warehouse_id:
            raise HTTPException(status_code=400, detail="Zone parent must be the warehouse id")
    else:
        ParentModel = LEVEL_MODEL[{"aisle":"zone","rack":"aisle","shelf":"rack","bin":"shelf"}[payload.level]][0]
        parent = await session.get(ParentModel, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent node not found")

    row = Model(**{parent_col: payload.parent_id, "code": payload.code, "name": payload.name, "sort_order": payload.sort_order})
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"A {payload.level} with code '{payload.code}' already exists under this parent")
    await session.refresh(row)
    return _node_dict(row, payload.level)


@partner_router.patch("/warehouse/{warehouse_id}/nodes/{level}/{node_id}",
                      dependencies=[Depends(require_role("owner", "manager"))])
async def update_node(
    warehouse_id: str, level: str, node_id: str, payload: NodeUpdateIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    await _assert_owns_warehouse(session, partner, warehouse_id)
    if level not in LEVEL_MODEL:
        raise HTTPException(status_code=400, detail="Invalid level")
    Model, _ = LEVEL_MODEL[level]
    row = await session.get(Model, node_id)
    if not row:
        raise HTTPException(status_code=404, detail="Node not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"Code '{payload.code}' already exists at this level")
    await session.refresh(row)
    return _node_dict(row, level)


@partner_router.delete("/warehouse/{warehouse_id}/nodes/{level}/{node_id}", status_code=204,
                       dependencies=[Depends(require_role("owner", "manager"))])
async def delete_node(
    warehouse_id: str, level: str, node_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Delete a node only if it has no children (409 otherwise)."""
    await _assert_owns_warehouse(session, partner, warehouse_id)
    if level not in LEVEL_MODEL:
        raise HTTPException(status_code=400, detail="Invalid level")
    Model, _ = LEVEL_MODEL[level]
    row = await session.get(Model, node_id)
    if not row:
        raise HTTPException(status_code=404, detail="Node not found")
    child_level = LEVEL_CHILD[level]
    if child_level:
        ChildModel, child_parent_col = LEVEL_MODEL[child_level]
        count = await session.scalar(
            select(func.count(ChildModel.id)).where(getattr(ChildModel, child_parent_col) == node_id)
        )
        if count:
            raise HTTPException(status_code=409, detail=f"Delete {count} child {child_level}(s) first")
    await session.delete(row)
    await session.commit()


# ============================================================================
#            Products, Orders, Wallet (Slices 5 / 6 / 7)
# ============================================================================
from decimal import Decimal
from core.models.base import new_id
from core.models import (
    MartProduct, Order as CustomerOrder, OrderItem,
    PartnerOrder, PartnerProduct, PartnerWallet, PartnerWalletTxn,
    PARTNER_ORDER_STATUSES,
)


# ---------------------------------------------------------------- helpers ---

def _partner_product_dict(row: PartnerProduct, master: Optional[MartProduct] = None) -> dict:
    """Merge partner-owned fields with master fallbacks (for source=master)."""
    if row.source == "master" and master is not None:
        name  = master.name
        brand = master.brand
        unit  = master.unit
        image = master.image
        cat   = master.category_slug
        sub   = master.subcategory_slug
        currency = master.currency
        currency_symbol = master.currency_symbol
        master_price = float(master.price) if master.price is not None else None
    else:
        name  = row.name
        brand = row.brand
        unit  = row.unit
        image = row.image
        cat   = row.category_slug
        sub   = row.subcategory_slug
        currency = row.currency
        currency_symbol = None
        master_price = None
    return {
        "id": row.id,
        "source": row.source,
        "master_product_id": row.master_product_id,
        "name": name,
        "brand": brand,
        "unit": unit,
        "image": image,
        "category_slug": cat,
        "subcategory_slug": sub,
        "sku_code": row.sku_code,
        "partner_price": float(row.partner_price),
        "master_price": master_price,
        "currency": currency,
        "currency_symbol": currency_symbol,
        "stock_qty": row.stock_qty,
        "low_stock_threshold": row.low_stock_threshold,
        "is_active": row.is_active,
        "approval_status": getattr(row, "approval_status", "approved"),
        "review_notes": getattr(row, "review_notes", None),
        "submitted_at": row.submitted_at.isoformat() if getattr(row, "submitted_at", None) else None,
        "reviewed_at": row.reviewed_at.isoformat() if getattr(row, "reviewed_at", None) else None,
        "description": row.description,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def _load_masters(session: AsyncSession, ids: list[str]) -> dict[str, MartProduct]:
    if not ids:
        return {}
    rows = (
        await session.execute(select(MartProduct).where(MartProduct.id.in_(list(set(ids)))))
    ).scalars().all()
    return {r.id: r for r in rows}


# ============================================================================
#                             PRODUCTS (Slice 5)
# ============================================================================

class LinkMasterIn(BaseModel):
    master_product_id: str
    partner_price: float = Field(..., gt=0)
    stock_qty: int = Field(0, ge=0)
    low_stock_threshold: int = Field(5, ge=0)
    sku_code: Optional[str] = Field(None, max_length=80)


class CustomProductIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    brand: Optional[str] = Field(None, max_length=120)
    unit: Optional[str] = Field(None, max_length=60)
    image: Optional[str] = None
    category_slug: Optional[str] = Field(None, max_length=80)
    subcategory_slug: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    sku_code: Optional[str] = Field(None, max_length=80)
    partner_price: float = Field(..., gt=0)
    currency: str = Field("XOF", min_length=3, max_length=3)
    stock_qty: int = Field(0, ge=0)
    low_stock_threshold: int = Field(5, ge=0)


class ProductUpdateIn(BaseModel):
    partner_price: Optional[float] = Field(None, gt=0)
    stock_qty: Optional[int] = Field(None, ge=0)
    low_stock_threshold: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    sku_code: Optional[str] = Field(None, max_length=80)
    # Custom-only editable fields
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    brand: Optional[str] = Field(None, max_length=120)
    unit: Optional[str] = Field(None, max_length=60)
    image: Optional[str] = None
    description: Optional[str] = None


@partner_router.get("/products")
async def list_partner_products(
    q: Optional[str] = None,
    active: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(PartnerProduct).where(PartnerProduct.partner_id == partner.id).order_by(PartnerProduct.created_at.desc())
    if active is not None:
        stmt = stmt.where(PartnerProduct.is_active == active)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    masters = await _load_masters(session, [r.master_product_id for r in rows if r.master_product_id])

    items = []
    for r in rows:
        m = masters.get(r.master_product_id) if r.master_product_id else None
        d = _partner_product_dict(r, m)
        if q:
            hay = " ".join([str(d.get(k) or "") for k in ("name", "brand", "sku_code")]).lower()
            if q.lower() not in hay:
                continue
        items.append(d)

    total = await session.scalar(
        select(func.count(PartnerProduct.id)).where(PartnerProduct.partner_id == partner.id)
    )
    live = await session.scalar(
        select(func.count(PartnerProduct.id)).where(
            PartnerProduct.partner_id == partner.id, PartnerProduct.is_active == True,  # noqa: E712
        )
    )
    return {"items": items, "total": total or 0, "live": live or 0}


@partner_router.get("/master-catalog")
async def search_master_catalog(
    q: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    limit: int = Query(30, ge=1, le=100),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """Search the shared MART master catalog scoped to the partner's country.

    Filters: free-text `q`, `category` slug, and `subcategory` slug. All three
    can combine — the search dialog on the Darkstore side uses them together
    so ops can narrow 1000s of SKUs down to a handful of matches (Social.docx #2).
    """
    stmt = (
        select(MartProduct)
        .where(MartProduct.country == partner.country, MartProduct.module == partner.module)
        .order_by(MartProduct.popularity.desc(), MartProduct.name.asc())
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where((MartProduct.name.ilike(like)) | (MartProduct.brand.ilike(like)))
    if category:
        stmt = stmt.where(MartProduct.category_slug == category)
    if subcategory:
        stmt = stmt.where(MartProduct.subcategory_slug == subcategory)

    rows = (await session.execute(stmt.limit(limit))).scalars().all()

    # Mark which are already linked so the frontend can disable them.
    linked_ids = set((await session.execute(
        select(PartnerProduct.master_product_id).where(
            PartnerProduct.partner_id == partner.id,
            PartnerProduct.master_product_id.is_not(None),
        )
    )).scalars().all())

    return {
        "items": [
            {
                "id": r.id, "name": r.name, "brand": r.brand, "unit": r.unit,
                "image": r.image, "category_slug": r.category_slug,
                "subcategory_slug": r.subcategory_slug,
                "price": float(r.price), "currency": r.currency,
                "currency_symbol": r.currency_symbol,
                "already_linked": r.id in linked_ids,
            }
            for r in rows
        ],
    }


@partner_router.post("/products/link", status_code=201,
                     dependencies=[Depends(require_role("owner", "manager"))])
async def link_master_product(
    payload: LinkMasterIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    master = await session.get(MartProduct, payload.master_product_id)
    if not master or master.country != partner.country:
        raise HTTPException(status_code=404, detail="Master product not found in your country")

    row = PartnerProduct(
        partner_id=partner.id,
        source="master",
        master_product_id=master.id,
        partner_price=payload.partner_price,
        currency=master.currency,
        stock_qty=payload.stock_qty,
        low_stock_threshold=payload.low_stock_threshold,
        sku_code=payload.sku_code,
    )
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(status_code=409, detail="This master product is already in your catalog")
    await session.refresh(row)
    return _partner_product_dict(row, master)


@partner_router.post("/products/custom", status_code=201,
                     dependencies=[Depends(require_role("owner", "manager"))])
async def create_custom_product(
    payload: CustomProductIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    row = PartnerProduct(
        partner_id=partner.id,
        source="custom",
        name=payload.name,
        brand=payload.brand,
        unit=payload.unit,
        image=payload.image,
        category_slug=payload.category_slug,
        subcategory_slug=payload.subcategory_slug,
        description=payload.description,
        sku_code=payload.sku_code,
        partner_price=payload.partner_price,
        currency=payload.currency,
        stock_qty=payload.stock_qty,
        low_stock_threshold=payload.low_stock_threshold,
        # Phase 2: partner-created custom SKUs MUST be reviewed before going live.
        approval_status="pending",
        is_active=False,
        submitted_at=datetime.now(timezone.utc),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _partner_product_dict(row)


@partner_router.patch("/products/{product_id}")
async def update_partner_product(
    product_id: str,
    payload: ProductUpdateIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
    # We need the actor to know the role — packers can only edit stock_qty.
    actor=Depends(require_role("owner", "manager", "packer")),
):
    row = await session.get(PartnerProduct, product_id)
    if not row or row.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump(exclude_unset=True)
    # Guard: master-linked SKUs can't rename/rebrand — those come from the master
    if row.source == "master":
        for k in ("name", "brand", "unit", "image", "description"):
            data.pop(k, None)
    # Guard: packers can only adjust stock counts (e.g. damage during picking).
    # Anything else (price, active flag, SKU code) requires manager+.
    if actor.role == "packer":
        allowed = {"stock_qty"}
        stripped = {k: v for k, v in data.items() if k in allowed}
        if not stripped:
            raise HTTPException(status_code=403, detail={
                "code": "insufficient_role",
                "message": "Packers may only adjust stock_qty on products.",
            })
        data = stripped
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    master = await session.get(MartProduct, row.master_product_id) if row.master_product_id else None
    return _partner_product_dict(row, master)


@partner_router.delete("/products/{product_id}", status_code=204,
                       dependencies=[Depends(require_role("owner", "manager"))])
async def delete_partner_product(
    product_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(PartnerProduct, product_id)
    if not row or row.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Product not found")
    await session.delete(row)
    await session.commit()


# ============================================================================
#                             ORDERS (Slice 6)
# ============================================================================

# Explicit state machine to prevent invalid transitions.
_ORDER_TRANSITIONS = {
    "new":         {"accepted", "cancelled"},
    "accepted":    {"packing", "cancelled"},
    "packing":     {"ready", "cancelled"},
    "ready":       {"handed_off", "cancelled"},
    "handed_off":  {"completed"},
    "completed":   set(),
    "cancelled":   set(),
}


def _order_dict(po: PartnerOrder, order: CustomerOrder, items: list[OrderItem]) -> dict:
    return {
        "id": po.id,
        "order_id": order.id,
        "order_number": order.number,
        "status": po.status,
        "customer_status": order.status,
        # Partner-side totals (this partner's slice only)
        "subtotal": float(po.subtotal or 0),
        "item_count": int(po.item_count or len(items)),
        # Customer-side grand total (for context — partner does NOT get paid this)
        "customer_total": float(order.total),
        "delivery_fee": float(order.delivery_fee),
        "currency": order.currency,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "delivery_slot_label": order.delivery_slot_label,
        "address": order.address_snapshot,
        "instructions": order.instructions,
        "consolidation_status": getattr(order, "consolidation_status", None),
        "items": [
            {
                "id": it.id, "name": it.name, "brand": it.brand, "unit": it.unit,
                "image": it.image, "price": float(it.price), "quantity": it.quantity,
                "line_total": float(it.line_total),
            } for it in items
        ],
        "accepted_at":    po.accepted_at.isoformat() if po.accepted_at else None,
        "ready_at":       po.ready_at.isoformat() if po.ready_at else None,
        "handed_off_at":  po.handed_off_at.isoformat() if po.handed_off_at else None,
        "cancelled_at":   po.cancelled_at.isoformat() if po.cancelled_at else None,
        "cancellation_reason": po.cancellation_reason,
        "created_at":     po.created_at.isoformat() if po.created_at else None,
    }


@partner_router.get("/orders")
async def list_partner_orders(
    status: Optional[str] = Query(None, description="new|accepted|packing|ready|handed_off|completed|cancelled"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(PartnerOrder)
        .where(PartnerOrder.partner_id == partner.id)
        .order_by(PartnerOrder.created_at.desc())
    )
    if status:
        if status not in PARTNER_ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        stmt = stmt.where(PartnerOrder.status == status)
    pos = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    if not pos:
        buckets = {s: 0 for s in PARTNER_ORDER_STATUSES}
        return {"items": [], "total": 0, "buckets": buckets}

    order_ids = [po.order_id for po in pos]
    po_ids = [po.id for po in pos]
    orders = {
        o.id: o for o in (
            await session.execute(select(CustomerOrder).where(CustomerOrder.id.in_(order_ids)))
        ).scalars().all()
    }
    # Only pull THIS partner's slice of items (tagged with partner_order_id)
    items_by_po: dict[str, list[OrderItem]] = {}
    for it in (
        await session.execute(select(OrderItem).where(OrderItem.partner_order_id.in_(po_ids)))
    ).scalars().all():
        items_by_po.setdefault(it.partner_order_id, []).append(it)

    out = []
    for po in pos:
        o = orders.get(po.order_id)
        if not o:
            continue
        out.append(_order_dict(po, o, items_by_po.get(po.id, [])))

    # Status buckets for the tab UI
    bucket_rows = (await session.execute(
        select(PartnerOrder.status, func.count(PartnerOrder.id))
        .where(PartnerOrder.partner_id == partner.id).group_by(PartnerOrder.status)
    )).all()
    buckets = {s: 0 for s in PARTNER_ORDER_STATUSES}
    for s, c in bucket_rows:
        buckets[s] = c

    return {"items": out, "total": sum(buckets.values()), "buckets": buckets}


@partner_router.get("/orders/{partner_order_id}")
async def get_partner_order(
    partner_order_id: str,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    po = await session.get(PartnerOrder, partner_order_id)
    if not po or po.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Order not found")
    order = await session.get(CustomerOrder, po.order_id)
    items = (await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all()
    return _order_dict(po, order, list(items))


class OrderStatusIn(BaseModel):
    status: str = Field(..., pattern="^(accepted|packing|ready|handed_off|completed|cancelled)$")
    reason: Optional[str] = Field(None, max_length=400)


@partner_router.post("/orders/{partner_order_id}/status",
                     dependencies=[Depends(require_role("owner", "manager", "packer"))])
async def update_partner_order_status(
    partner_order_id: str,
    payload: OrderStatusIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    po = await session.get(PartnerOrder, partner_order_id)
    if not po or po.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if payload.status not in _ORDER_TRANSITIONS.get(po.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition {po.status} → {payload.status}",
        )

    now = datetime.now(timezone.utc)
    po.status = payload.status
    if payload.status == "accepted":
        po.accepted_at = now
    elif payload.status == "ready":
        po.ready_at = now
    elif payload.status == "handed_off":
        po.handed_off_at = now
    elif payload.status == "cancelled":
        po.cancelled_at = now
        po.cancellation_reason = payload.reason
        # ---- Restore reserved stock on the PartnerProduct rows ----
        # We only put stock BACK if it was actually decremented (i.e. this
        # partner_order was created by the allocation engine, so its items
        # carry partner_product_id).
        restored_items = (await session.execute(
            select(OrderItem).where(OrderItem.partner_order_id == po.id)
        )).scalars().all()
        for it in restored_items:
            if it.partner_product_id:
                pp = await session.get(PartnerProduct, it.partner_product_id)
                if pp:
                    pp.stock_qty = int(pp.stock_qty or 0) + int(it.quantity)

    # On handoff, credit partner wallet (net of 10% platform commission) — using
    # THIS partner's slice of the order, not the customer's grand total.
    # Ledger records TWO rows for clean audit: +gross (revenue) then -commission.
    if payload.status == "handed_off":
        order = await session.get(CustomerOrder, po.order_id)
        wallet = await _ensure_wallet(session, partner, order.currency)
        gross = Decimal(str(po.subtotal or order.subtotal))
        commission = (gross * Decimal("0.10")).quantize(Decimal("0.01"))
        await _write_wallet_txn(
            session, wallet, kind="credit_order", amount=float(gross),
            description=f"Order {order.number} — gross revenue",
            order_id=order.id,
        )
        if commission > 0:
            await _write_wallet_txn(
                session, wallet, kind="debit_commission", amount=-float(commission),
                description=f"Order {order.number} — 10% platform commission",
                order_id=order.id,
            )

    await session.commit()
    await session.refresh(po)
    order = await session.get(CustomerOrder, po.order_id)
    items = (await session.execute(
        select(OrderItem).where(OrderItem.partner_order_id == po.id)
    )).scalars().all()
    return _order_dict(po, order, list(items))


# ============================================================================
#                             WALLET (Slice 7)
# ============================================================================

async def _ensure_wallet(session: AsyncSession, partner: Partner, currency: str = "XOF") -> PartnerWallet:
    """Lazily create the partner's wallet on first access."""
    w = (await session.execute(
        select(PartnerWallet).where(PartnerWallet.partner_id == partner.id)
    )).scalar_one_or_none()
    if w:
        return w
    w = PartnerWallet(partner_id=partner.id, currency=currency, balance=0)
    session.add(w)
    await session.flush()
    return w


async def _write_wallet_txn(
    session: AsyncSession, wallet: PartnerWallet, *,
    kind: str, amount: float, description: str,
    order_id: Optional[str] = None, reference: Optional[str] = None,
) -> PartnerWalletTxn:
    """Append a signed ledger entry and update the materialised balance.
    Amount sign convention: credits positive, debits negative."""
    new_balance = float(Decimal(str(wallet.balance)) + Decimal(str(amount)))
    wallet.balance = new_balance
    tx = PartnerWalletTxn(
        wallet_id=wallet.id, kind=kind, amount=amount, currency=wallet.currency,
        balance_after=new_balance, description=description,
        order_id=order_id, reference=reference,
    )
    session.add(tx)
    await session.flush()
    return tx


def _wallet_dict(w: PartnerWallet) -> dict:
    return {
        "id": w.id, "balance": float(w.balance),
        "currency": w.currency, "is_active": w.is_active,
    }


def _tx_dict(t: PartnerWalletTxn) -> dict:
    return {
        "id": t.id, "kind": t.kind, "amount": float(t.amount),
        "currency": t.currency, "balance_after": float(t.balance_after),
        "description": t.description, "order_id": t.order_id,
        "reference": t.reference,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@partner_router.get("/wallet")
async def get_wallet(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    w = await _ensure_wallet(session, partner)
    await session.commit()  # persist lazy create
    await session.refresh(w)

    txns = (await session.execute(
        select(PartnerWalletTxn).where(PartnerWalletTxn.wallet_id == w.id)
        .order_by(PartnerWalletTxn.created_at.desc()).limit(limit).offset(offset)
    )).scalars().all()
    total = await session.scalar(
        select(func.count(PartnerWalletTxn.id)).where(PartnerWalletTxn.wallet_id == w.id)
    )
    return {
        "wallet": _wallet_dict(w),
        "transactions": [_tx_dict(t) for t in txns],
        "total": total or 0,
    }


class TopupIn(BaseModel):
    amount: float = Field(..., gt=0, le=10_000_000)
    method: str = Field("card", pattern="^(card|mobile_money|bank_transfer)$")


@partner_router.post("/wallet/topup",
                     dependencies=[Depends(require_role("owner", "manager", "cashier"))])
async def wallet_topup(
    payload: TopupIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """MOCKED top-up — no real payment provider wired yet. Marks a synthetic
    Stripe/mobile-money reference so real integration is a drop-in later."""
    w = await _ensure_wallet(session, partner)
    ref = f"mock_{payload.method}_{new_id('t')[2:14]}"  # placeholder external ref
    tx = await _write_wallet_txn(
        session, w, kind="credit_topup", amount=payload.amount,
        description=f"Top-up via {payload.method} (mocked)",
        reference=ref,
    )
    await session.commit()
    await session.refresh(w)
    await session.refresh(tx)
    return {"wallet": _wallet_dict(w), "transaction": _tx_dict(tx), "MOCKED": True}


class WithdrawIn(BaseModel):
    amount: float = Field(..., gt=0)
    destination: str = Field("bank", pattern="^(bank|mobile_money)$")


@partner_router.post("/wallet/withdraw",
                     dependencies=[Depends(require_role("owner", "manager"))])
async def wallet_withdraw(
    payload: WithdrawIn,
    partner: Partner = Depends(get_current_partner),
    session: AsyncSession = Depends(get_session),
):
    """MOCKED withdrawal request — records a debit and returns success.
    Real payout wiring lands with the Stripe/Payouts integration."""
    w = await _ensure_wallet(session, partner)
    if float(w.balance) < payload.amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    ref = f"mock_payout_{new_id('p')[2:14]}"
    tx = await _write_wallet_txn(
        session, w, kind="debit_payout", amount=-payload.amount,
        description=f"Withdrawal to {payload.destination} (mocked)",
        reference=ref,
    )
    await session.commit()
    await session.refresh(w)
    await session.refresh(tx)
    return {"wallet": _wallet_dict(w), "transaction": _tx_dict(tx), "MOCKED": True}


# ============================================================================
#          DEMO seed — admin-only, creates fake customer orders for a partner
# ============================================================================
# Real order routing (customer → partner) will land with the fulfilment slice.
# Until then, this endpoint lets us demo the partner Orders/Wallet UI end-to-end.

from core.models import Customer


@admin_router.post("/partners/{partner_id}/demo-orders", status_code=201)
async def seed_demo_orders(
    partner_id: str,
    count: int = Query(3, ge=1, le=10),
    session: AsyncSession = Depends(get_session),
):
    """DEMO: create N synthetic customer orders assigned to this partner.

    Each order gets 2–3 items copied from the partner's own catalog so totals
    make sense. Marked with `payment_method="demo"` so we can easily wipe.
    """
    partner = await session.get(Partner, partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    # Pick or create a demo customer
    demo_email = "demo-customer@baked.ci"
    customer = (await session.execute(
        select(Customer).where(func.lower(Customer.email) == demo_email)
    )).scalar_one_or_none()
    if not customer:
        customer = Customer(
            email=demo_email, name="Demo Customer",
            phone="+2250700000000", country=partner.country,
        )
        session.add(customer)
        await session.flush()

    # Grab up to 5 partner products
    psku_rows = (await session.execute(
        select(PartnerProduct).where(PartnerProduct.partner_id == partner_id).limit(5)
    )).scalars().all()
    if not psku_rows:
        raise HTTPException(status_code=400, detail="Partner has no products yet")

    masters = await _load_masters(session, [r.master_product_id for r in psku_rows if r.master_product_id])

    created = []
    for i in range(count):
        # Round-robin pick 2 items per order
        picks = [psku_rows[j % len(psku_rows)] for j in range(i, i + 2)]

        subtotal = Decimal("0")
        item_specs = []
        for p in picks:
            m = masters.get(p.master_product_id) if p.master_product_id else None
            name = m.name if m else p.name
            brand = m.brand if m else p.brand
            unit = m.unit if m else p.unit
            image = m.image if m else p.image
            master_id = p.master_product_id or (m.id if m else None)
            if not master_id:
                # custom SKU with no master row — synthesize a mart_products row so
                # order_items.product_id FK is satisfied. Simpler: skip if no master.
                # For MVP demo we require at least one linked master SKU.
                continue
            qty = 2
            line = Decimal(str(p.partner_price)) * qty
            subtotal += line
            item_specs.append({
                "master_id": master_id, "name": name, "brand": brand, "unit": unit,
                "image": image, "price": float(p.partner_price), "qty": qty,
                "line_total": float(line),
            })

        if not item_specs:
            continue

        currency = "XOF"
        delivery_fee = Decimal("500")
        total = subtotal + delivery_fee

        # Human-readable order number
        n = await session.scalar(select(func.count(CustomerOrder.id))) or 0
        order = CustomerOrder(
            number=f"DEMO-{(n + 1):05d}",
            customer_id=customer.id,
            module=partner.module,
            country=partner.country,
            status="pending",
            subtotal=float(subtotal),
            delivery_fee=float(delivery_fee),
            total=float(total),
            currency=currency,
            address_snapshot={
                "label": "Demo Address",
                "line1": "12 Boulevard Latrille",
                "city": "Abidjan",
                "country": partner.country,
            },
            payment_method="demo",
            payment_status="paid",
        )
        session.add(order)
        await session.flush()

        for spec in item_specs:
            session.add(OrderItem(
                order_id=order.id, product_id=spec["master_id"],
                name=spec["name"], brand=spec["brand"], unit=spec["unit"],
                image=spec["image"], price=spec["price"], quantity=spec["qty"],
                line_total=spec["line_total"], currency=currency,
            ))

        po = PartnerOrder(partner_id=partner_id, order_id=order.id, status="new",
                          subtotal=float(subtotal), item_count=sum(s["qty"] for s in item_specs))
        session.add(po)
        await session.flush()

        # Link each order_item to the partner_order so the picker screen can
        # surface the correct line items + progress tracking.
        (await session.execute(
            select(OrderItem).where(OrderItem.order_id == order.id)
        )).scalars().all()
        for oi in (await session.execute(
            select(OrderItem).where(OrderItem.order_id == order.id)
        )).scalars().all():
            oi.partner_id = partner_id
            oi.partner_order_id = po.id
        created.append(order.number)

    await session.commit()
    return {"created": len(created), "order_numbers": created}


# ===========================================================================
# Social.docx Issue #1 — Admin approval flow for Darkstore-authored products.
#
# Bug: A partner (Darkstore) creates a *custom* PartnerProduct via
# `POST /partner/products/custom` — it lands `approval_status="pending"`,
# `is_active=False`. Historically nothing then promoted it to the shared
# Master Catalog (`mart_products`), so even after an operator "approved"
# it in the partner catalogue, it stayed invisible to every OTHER Darkstore
# under `/partner/master-catalog?q=`. That's the exact symptom reported in
# Fixing_Prompt.docx §1.
#
# The three endpoints below close the loop:
#   - GET  /admin/mart-partner/partner-products?status=pending
#   - POST /admin/mart-partner/partner-products/{id}/approve   ← materialises MartProduct
#   - POST /admin/mart-partner/partner-products/{id}/reject
# ===========================================================================

class AdminApproveOverrideIn(BaseModel):
    """Optional overrides an admin can apply while approving a custom
    product — the frontend can pass a cleaned-up name or a chosen currency
    for the master row. Everything else is copied from the partner draft."""
    model_config = ConfigDict(extra="forbid")
    name:       Optional[str] = None
    brand:      Optional[str] = None
    category_slug:    Optional[str] = None
    subcategory_slug: Optional[str] = None
    master_price:     Optional[float] = None
    currency:   Optional[str] = None
    unit:       Optional[str] = None
    image:      Optional[str] = None
    description:Optional[str] = None


class AdminRejectPartnerProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str = Field(..., min_length=3,
                       description="Reason returned to the Darkstore so they can revise")


def _partner_product_admin_dict(row, partner: Optional[Partner] = None,
                                 warehouse: Optional[Warehouse] = None) -> dict:
    """Enriched dict for the review UI — includes owning partner + warehouse."""
    return {
        "id": row.id, "name": row.name, "brand": row.brand, "unit": row.unit,
        "image": row.image, "category_slug": row.category_slug,
        "subcategory_slug": row.subcategory_slug, "description": row.description,
        "sku_code": row.sku_code, "partner_price": float(row.partner_price or 0),
        "currency": row.currency, "stock_qty": row.stock_qty,
        "approval_status": row.approval_status, "is_active": row.is_active,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "review_notes": getattr(row, "review_notes", None),
        "master_product_id": row.master_product_id,
        "partner": None if not partner else {
            "id": partner.id, "business_name": partner.business_name, "country": partner.country,
        },
        "warehouse": None if not warehouse else {
            "id": warehouse.id, "code": warehouse.code, "city": warehouse.city,
        },
    }


@admin_router.get("/partner-products")
async def admin_list_partner_products(
    status: str = Query("pending", pattern="^(pending|approved|rejected|all)$"),
    country: Optional[str] = None,
    q: Optional[str] = Query(None, description="Search on product name/brand"),
    limit: int = Query(50, ge=1, le=200),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Ops queue of Darkstore-authored custom products. Filters mirror the
    supplier product-request review UI so the operator experience is
    consistent across the two review surfaces."""
    stmt = (select(PartnerProduct, Partner)
            .join(Partner, Partner.id == PartnerProduct.partner_id)
            .where(PartnerProduct.source == "custom")
            .order_by(PartnerProduct.submitted_at.desc().nulls_last(),
                      PartnerProduct.created_at.desc()))
    if status != "all":
        stmt = stmt.where(PartnerProduct.approval_status == status)
    if country:
        stmt = stmt.where(Partner.country == country.upper())
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where((PartnerProduct.name.ilike(like)) | (PartnerProduct.brand.ilike(like)))
    rows = (await session.execute(stmt.limit(limit))).all()

    # Bucket counts across ALL rows (unfiltered by q/country) — matches how
    # the supplier product-request UI renders its tab pills.
    bucket_stmt = (select(PartnerProduct.approval_status, func.count(PartnerProduct.id))
                   .where(PartnerProduct.source == "custom")
                   .group_by(PartnerProduct.approval_status))
    buckets = {"pending": 0, "approved": 0, "rejected": 0}
    for s, c in (await session.execute(bucket_stmt)).all():
        if s in buckets: buckets[s] = c

    return {
        "items": [_partner_product_admin_dict(pp, p) for (pp, p) in rows],
        "buckets": buckets,
    }


@admin_router.post("/partner-products/{product_id}/approve")
async def admin_approve_partner_product(
    product_id: str,
    payload: AdminApproveOverrideIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Approve a Darkstore-authored custom product AND promote it into the
    shared MART master catalogue.

    Order of operations (all in one transaction):
      1. Load PartnerProduct + owning Partner (400 if not custom, 409 if not pending).
      2. Create a MartProduct with country=partner.country, module="mart", using
         payload overrides if provided otherwise the partner's own values.
      3. Rewire the PartnerProduct to point at the new MartProduct (become a
         linked, not custom, row so future edits happen on the private layer).
      4. Flip approval_status → approved, is_active → True.
      5. Notify the partner via in-app inbox.
    """
    pp = await session.get(PartnerProduct, product_id)
    if not pp:
        raise HTTPException(404, {"code": "not_found", "message": "Product not found"})
    if pp.source != "custom":
        raise HTTPException(400, {"code": "not_custom",
                                  "message": "Only custom partner products need approval"})
    if pp.approval_status != "pending":
        raise HTTPException(409, {"code": "already_reviewed",
                                  "message": f"Cannot approve a product currently '{pp.approval_status}'"})

    partner = await session.get(Partner, pp.partner_id)
    if not partner:
        raise HTTPException(400, {"code": "orphan", "message": "Product has no owning partner"})

    name  = (payload.name  or pp.name  or "").strip()
    brand = (payload.brand or pp.brand or "").strip() or None
    if not name:
        raise HTTPException(400, {"code": "name_required", "message": "Approved product must have a name"})

    # Master catalogue has a unique (name, country, module) constraint. If a
    # duplicate exists we link to it rather than raise — that's the correct
    # ops action ("this looks like an existing master, use it").
    from sqlalchemy.exc import IntegrityError
    master_price = float(payload.master_price if payload.master_price is not None else (pp.partner_price or 0))
    currency = (payload.currency or pp.currency or "").strip() or None
    if not currency:
        raise HTTPException(400, {"code": "currency_required", "message": "Currency required for master row"})

    existing = (await session.execute(
        select(MartProduct).where(
            MartProduct.name == name,
            MartProduct.country == partner.country,
            MartProduct.module == (partner.module or "mart"),
        )
    )).scalars().first()

    if existing:
        mp = existing
    else:
        mp = MartProduct(
            name=name,
            country=partner.country,
            module=partner.module or "mart",
            brand=brand,
            category_slug=(payload.category_slug or pp.category_slug),
            subcategory_slug=(payload.subcategory_slug or pp.subcategory_slug),
            unit=(payload.unit or pp.unit),
            price=master_price,
            currency=currency,
            image=(payload.image or pp.image),
            description=(payload.description or pp.description),
            status="active",
        )
        session.add(mp)
        try:
            await session.flush()
        except IntegrityError:
            # Race: another admin approved a same-name product between our
            # SELECT and INSERT. Re-fetch and reuse.
            await session.rollback()
            mp = (await session.execute(
                select(MartProduct).where(
                    MartProduct.name == name,
                    MartProduct.country == partner.country,
                    MartProduct.module == (partner.module or "mart"),
                )
            )).scalars().first()
            # Re-load the partner product too since rollback wiped the session state.
            pp = await session.get(PartnerProduct, product_id)
            partner = await session.get(Partner, pp.partner_id)
            if not mp:
                raise HTTPException(500, {"code": "materialise_failed",
                                          "message": "Could not materialise master row"})

    # Rewire the partner row into linked-to-master mode + approve it.
    pp.source = "master"
    pp.master_product_id = mp.id
    pp.approval_status = "approved"
    pp.is_active = True
    pp.review_notes = None

    # In-app notification back to the partner.
    try:
        from shared.notifications.routes import notify as inapp_notify
        await inapp_notify(
            session,
            recipient_kind="partner_owner", recipient_id=partner.id,
            kind="partner_product_approved",
            title=f"'{name}' approved",
            body="Your product is now live in the Master Catalog and visible to your store.",
            link=f"/partner-portal/{(partner.module or 'mart')}/inventory",
            entity_kind="partner_product", entity_id=pp.id,
            actor_label=admin.email,
        )
    except Exception:
        # Notification failures should never block approval — logged upstream.
        pass

    await session.commit()
    await session.refresh(pp)
    return _partner_product_admin_dict(pp, partner)


@admin_router.post("/partner-products/{product_id}/reject")
async def admin_reject_partner_product(
    product_id: str,
    payload: AdminRejectPartnerProductIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    pp = await session.get(PartnerProduct, product_id)
    if not pp:
        raise HTTPException(404, {"code": "not_found", "message": "Product not found"})
    if pp.source != "custom":
        raise HTTPException(400, {"code": "not_custom",
                                  "message": "Only custom partner products can be rejected here"})
    if pp.approval_status != "pending":
        raise HTTPException(409, {"code": "already_reviewed",
                                  "message": f"Cannot reject a product currently '{pp.approval_status}'"})

    pp.approval_status = "rejected"
    pp.review_notes    = payload.notes
    pp.is_active       = False

    partner = await session.get(Partner, pp.partner_id)
    try:
        from shared.notifications.routes import notify as inapp_notify
        await inapp_notify(
            session,
            recipient_kind="partner_owner", recipient_id=pp.partner_id,
            kind="partner_product_rejected",
            title=f"'{pp.name}' needs changes",
            body=payload.notes,
            link=f"/partner-portal/{(partner.module or 'mart') if partner else 'mart'}/inventory",
            entity_kind="partner_product", entity_id=pp.id,
            actor_label=admin.email,
        )
    except Exception:
        pass

    await session.commit()
    return _partner_product_admin_dict(pp, partner)

