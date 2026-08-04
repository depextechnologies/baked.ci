"""MARTbakēd Partner — Stage 1 Public Application endpoints.

Public, unauthenticated: anyone can submit an application from `/partner/apply`.
The applicant does NOT gain any partner-portal access here — that only happens
after Stage 2 (Super Admin Approval, coming next slice).
"""
from __future__ import annotations
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
        raise HTTPException(status_code=409, detail="Application already approved")

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

    warehouse = Warehouse(
        partner_id=partner.id,
        name=f"{row.business_name} — Main",
        address_line=row.warehouse_address_line,
        city=row.warehouse_city,
        country=row.country,
        latitude=row.warehouse_latitude,
        longitude=row.warehouse_longitude,
        property_type=row.property_type,
        property_size_sqm=row.property_size_sqm,
        service_area_km=row.service_area_km,
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

    return {
        "application": _serialise(row),
        "partner": {
            "id": partner.id,
            "business_name": partner.business_name,
            "owner_email": partner.owner_email,
        },
        "warehouse": {
            "id": warehouse.id,
            "name": warehouse.name,
            "address_line": warehouse.address_line,
        },
        # SHOWN ONCE — admin must hand this to the partner. Never persisted plaintext.
        "temp_password": temp_password,
    }
