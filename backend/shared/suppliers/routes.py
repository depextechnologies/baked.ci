"""MARTbakēd Supplier Onboarding — Phase 2A.

Public routes for `/martbaked/sellers/*`:
  * POST   /api/martbaked/sellers/apply/start          — begin application (draft supplier + application row)
  * POST   /api/martbaked/sellers/apply/otp/request    — send OTP to phone
  * POST   /api/martbaked/sellers/apply/otp/verify     — verify OTP, mark supplier.phone_verified
  * PATCH  /api/martbaked/sellers/apply/{app_id}/step  — save a step (business/owner/location/…)
  * POST   /api/martbaked/sellers/apply/{app_id}/submit — final submit → status=submitted
  * GET    /api/martbaked/sellers/apply/{app_id}       — full application snapshot (draft lookup)
  * GET    /api/martbaked/sellers/application-status/{application_code}
                                                       — public status lookup (no auth)

Supplier login (after approval):
  * POST /api/martbaked/sellers/login                  — email + password → JWT
  * POST /api/martbaked/sellers/activate               — set password via activation token (approval flow)

Super Admin review routes (under /api/admin/modules/mart/suppliers/*):
  * GET    /api/admin/modules/mart/suppliers/applications                   — list with bucket counts
  * GET    /api/admin/modules/mart/suppliers/applications/{app_id}          — full detail
  * POST   /api/admin/modules/mart/suppliers/applications/{app_id}/approve  — flip to approved + activate portal
  * POST   /api/admin/modules/mart/suppliers/applications/{app_id}/reject   — flip to rejected (notes required)
  * POST   /api/admin/modules/mart/suppliers/applications/{app_id}/request-info — flip to action_required (notes required)
  * POST   /api/admin/modules/mart/suppliers/{sid}/suspend                  — suspend an active supplier
  * POST   /api/admin/modules/mart/suppliers/{sid}/unsuspend                — reactivate
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.providers import object_storage
from core.models import (
    AdminUser, MartCategory, OtpChallenge,
    Supplier, SupplierApplication, SupplierBankInfo,
    SupplierCategoryInterest, SupplierContact, SupplierDocument,
    SupplierReviewAudit, SupplierSupplyLocation,
    SupplierWarehouseAssignment, Warehouse,
    SUPPLIER_BUSINESS_TYPES, SUPPLIER_CONTACT_RELATIONS,
    SUPPLIER_DOCUMENT_TYPES,
)
from core.providers.otp_provider import generate_code, get_otp_provider
from core.security import create_access_token, hash_password, verify_password


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

OTP_TTL_SECONDS = 300
BAKED_ENV = None  # dev-code echo is decided per-provider


def _e164(country_code: str, phone: str) -> str:
    """Thin wrapper around the shared `to_e164` util."""
    from core.utils.phone import to_e164
    return to_e164(country_code, phone)


async def _next_application_code(session: AsyncSession) -> str:
    """MART-SUP-{YYYY}-{seq:05d} — atomic per year via COUNT+retry-safe unique index."""
    year = datetime.now(timezone.utc).year
    prefix = f"MART-SUP-{year}-"
    n = (await session.scalar(
        select(func.count(SupplierApplication.id))
        .where(SupplierApplication.application_code.like(f"{prefix}%"))
    )) or 0
    n += 1
    return f"{prefix}{n:05d}"


def _supplier_dict(s: Supplier) -> dict:
    return {
        "id": s.id, "code": s.code, "seller_slug": s.seller_slug, "business_name": s.business_name,
        "trading_name": s.trading_name, "business_type": s.business_type,
        "business_type_other": s.business_type_other,
        "registration_number": s.registration_number, "tax_id": s.tax_id,
        "business_email": s.business_email, "business_phone": s.business_phone,
        "website": s.website, "years_in_operation": s.years_in_operation,
        "country": s.country, "default_currency": s.default_currency,
        "module": s.module, "modules": s.modules or [], "status": s.status,
        "supplier_portal_active": s.supplier_portal_active,
        "phone_verified": s.phone_verified, "email_verified": s.email_verified,
        "approved_at": s.approved_at.isoformat() if s.approved_at else None,
        "suspended_at": s.suspended_at.isoformat() if s.suspended_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _application_dict(a: SupplierApplication) -> dict:
    return {
        "id": a.id, "application_code": a.application_code,
        "supplier_id": a.supplier_id, "status": a.status,
        "current_step": a.current_step, "phone_e164": a.phone_e164,
        "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "action_required_notes": a.action_required_notes,
        "rejection_reason": a.rejection_reason,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


async def _load_full_snapshot(session: AsyncSession, supplier: Supplier) -> dict:
    """Return the full supplier snapshot for review / status views."""
    contacts = (await session.execute(
        select(SupplierContact).where(SupplierContact.supplier_id == supplier.id)
    )).scalars().all()
    docs = (await session.execute(
        select(SupplierDocument).where(SupplierDocument.supplier_id == supplier.id)
    )).scalars().all()
    locs = (await session.execute(
        select(SupplierSupplyLocation).where(SupplierSupplyLocation.supplier_id == supplier.id)
    )).scalars().all()
    cats = (await session.execute(
        select(SupplierCategoryInterest).where(SupplierCategoryInterest.supplier_id == supplier.id)
    )).scalars().all()
    bank = (await session.execute(
        select(SupplierBankInfo).where(SupplierBankInfo.supplier_id == supplier.id)
    )).scalar_one_or_none()
    return {
        "supplier": _supplier_dict(supplier),
        "contacts": [{
            "id": c.id, "full_name": c.full_name, "position": c.position,
            "phone": c.phone, "email": c.email, "nationality": c.nationality,
            "id_type": c.id_type, "id_number": c.id_number,
            "id_document_url": c.id_document_url, "relationship": c.relationship,
            "is_primary": c.is_primary,
        } for c in contacts],
        "documents": [{
            "id": d.id, "document_type": d.document_type, "title": d.title,
            "file_url": d.file_url,
            "issued_on": d.issued_on.isoformat() if d.issued_on else None,
            "expires_on": d.expires_on.isoformat() if d.expires_on else None,
            "verification_status": d.verification_status,
        } for d in docs],
        "supply_locations": [{
            "id": l.id, "kind": l.kind, "label": l.label, "city": l.city,
            "country": l.country, "zone": l.zone, "warehouse_id": l.warehouse_id,
            "address": l.address,
            "latitude": float(l.latitude) if l.latitude is not None else None,
            "longitude": float(l.longitude) if l.longitude is not None else None,
            "postal_code": l.postal_code, "service_radius_km": l.service_radius_km,
            "is_business_location": l.is_business_location,
            "approval_status": l.approval_status,
        } for l in locs],
        "categories": [{
            "id": c.id, "category_id": c.category_id,
            "requested_name": c.requested_name, "status": c.status,
        } for c in cats],
        "bank_info": {
            "bank_name": bank.bank_name, "account_holder": bank.account_holder,
            "account_number": bank.account_number, "iban": bank.iban,
            "swift_bic": bank.swift_bic,
            "mobile_money_provider": bank.mobile_money_provider,
            "mobile_money_number": bank.mobile_money_number,
            "preferred_method": bank.preferred_method,
            "billing_address": bank.billing_address, "billing_city": bank.billing_city,
            "billing_country": bank.billing_country,
        } if bank else None,
    }


# ===========================================================================
# PUBLIC APPLICATION ROUTES
# ===========================================================================

public_router = APIRouter(prefix="/martbaked/sellers", tags=["supplier-onboarding"])


class ApplyStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_email: EmailStr
    business_name: str = Field(..., min_length=2, max_length=300)
    business_type: str = Field(..., description="manufacturer|distributor|wholesaler|…")
    country: str = Field(..., min_length=2, max_length=2)


@public_router.post("/apply/start", status_code=201)
async def apply_start(payload: ApplyStartIn, session: AsyncSession = Depends(get_session)):
    """Create a draft supplier + application row and return the application id.
    Idempotent-ish: if a draft/action_required application already exists for
    the same email + country, reuse it so refreshes don't spawn dupes."""
    if payload.business_type not in SUPPLIER_BUSINESS_TYPES:
        raise HTTPException(400, f"business_type must be one of {SUPPLIER_BUSINESS_TYPES}")
    country = payload.country.upper()

    existing = (await session.execute(
        select(Supplier).where(
            Supplier.business_email == payload.business_email,
            Supplier.country == country,
        )
    )).scalar_one_or_none()
    if existing:
        if existing.status in ("approved", "suspended"):
            raise HTTPException(409, {
                "code": "already_active",
                "message": "A supplier with this email already exists. Please log in.",
            })
        app = (await session.execute(
            select(SupplierApplication).where(SupplierApplication.supplier_id == existing.id)
            .order_by(SupplierApplication.created_at.desc())
        )).scalars().first()
        if app and app.status in ("draft", "action_required"):
            return {"application": _application_dict(app), "supplier": _supplier_dict(existing)}
        if app and app.status in ("submitted", "under_review"):
            raise HTTPException(409, {
                "code": "already_submitted",
                "message": "Application already submitted. Use /application-status to check.",
                "application_code": app.application_code,
            })

    supplier = Supplier(
        business_name=payload.business_name,
        business_type=payload.business_type,
        business_email=payload.business_email,
        country=country,
        status="draft",
    )
    session.add(supplier)
    await session.flush()

    code = await _next_application_code(session)
    app = SupplierApplication(
        application_code=code, supplier_id=supplier.id,
        status="draft", current_step=1,
    )
    session.add(app)
    await session.commit()
    await session.refresh(supplier)
    await session.refresh(app)
    return {"application": _application_dict(app), "supplier": _supplier_dict(supplier)}


class OtpRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str
    country_code: str
    phone: str


@public_router.post("/apply/otp/request")
async def apply_otp_request(payload: OtpRequestIn, session: AsyncSession = Depends(get_session)):
    app = await session.get(SupplierApplication, payload.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    e164 = _e164(payload.country_code, payload.phone)
    code = generate_code(6)
    now = datetime.now(timezone.utc)
    ch = OtpChallenge(phone=e164, code=code, attempts=0,
                      expires_at=now + timedelta(seconds=OTP_TTL_SECONDS))
    session.add(ch)
    app.phone_e164 = e164
    app.phone_challenge_id = ch.id
    await session.commit()
    provider = get_otp_provider()
    delivery = await provider.send_code(e164, code, locale="fr-CI")
    resp = {"challenge_id": ch.id, "expires_in": OTP_TTL_SECONDS,
            "masked_phone": e164[:-4] + "****"}
    if delivery.get("dev_code"):
        resp["dev_code"] = delivery["dev_code"]
    return resp


class OtpVerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str
    challenge_id: str
    code: str


@public_router.post("/apply/otp/verify")
async def apply_otp_verify(payload: OtpVerifyIn, session: AsyncSession = Depends(get_session)):
    app = await session.get(SupplierApplication, payload.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    ch = await session.get(OtpChallenge, payload.challenge_id)
    if not ch or ch.consumed:
        raise HTTPException(400, "Invalid or used challenge")
    exp = ch.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Code expired")
    if ch.attempts >= 5:
        raise HTTPException(429, "Too many attempts")
    ch.attempts += 1
    if payload.code != ch.code:
        await session.commit()
        raise HTTPException(400, "Incorrect code")
    ch.consumed = True
    supplier = await session.get(Supplier, app.supplier_id)
    supplier.phone_verified = True
    supplier.business_phone = app.phone_e164
    app.current_step = max(app.current_step, 2)
    await session.commit()
    return {"phone_verified": True, "application_id": app.id, "current_step": app.current_step}


class StepIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: int = Field(..., ge=1, le=9)
    # Business info (step 2)
    business_name: Optional[str] = None
    trading_name: Optional[str] = None
    business_type: Optional[str] = None
    business_type_other: Optional[str] = None
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    website: Optional[str] = None
    years_in_operation: Optional[int] = None
    default_currency: Optional[str] = None
    # Owner / contact (step 3)
    contact: Optional[dict] = None
    # Business location (step 4)
    business_location: Optional[dict] = None
    # Categories (step 5) — list of {category_id} OR {requested_name, reason}
    categories: Optional[List[dict]] = None
    # Supply locations (step 6) — list of {kind, label, city, country, warehouse_id?, lat?, lng?, radius?}
    supply_locations: Optional[List[dict]] = None
    # Banking (step 7)
    bank_info: Optional[dict] = None
    # Documents (step 8) — list of {document_type, title, file_url, issued_on?, expires_on?}
    documents: Optional[List[dict]] = None


@public_router.patch("/apply/{app_id}/step")
async def apply_save_step(app_id: str, payload: StepIn, session: AsyncSession = Depends(get_session)):
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("draft", "action_required"):
        raise HTTPException(409, f"Cannot edit a {app.status} application")
    supplier = await session.get(Supplier, app.supplier_id)

    # ---- Step 2: Business Information ----
    if payload.step == 2:
        for f in ("business_name", "trading_name", "business_type", "business_type_other",
                  "registration_number", "tax_id", "business_email", "business_phone",
                  "website", "years_in_operation", "default_currency"):
            v = getattr(payload, f, None)
            if v is not None:
                if f == "business_type" and v not in SUPPLIER_BUSINESS_TYPES:
                    raise HTTPException(400, f"Invalid business_type")
                setattr(supplier, f, v)

    # ---- Step 3: Owner / authorised rep ----
    if payload.step == 3 and payload.contact:
        c = payload.contact
        if c.get("relationship") and c["relationship"] not in SUPPLIER_CONTACT_RELATIONS:
            raise HTTPException(400, "Invalid contact relationship")
        # Upsert the primary contact
        primary = (await session.execute(
            select(SupplierContact).where(
                SupplierContact.supplier_id == supplier.id,
                SupplierContact.is_primary.is_(True),
            )
        )).scalar_one_or_none()
        if primary:
            for k in ("full_name", "position", "phone", "email", "nationality",
                      "id_type", "id_number", "id_document_url", "relationship"):
                if c.get(k) is not None:
                    setattr(primary, k, c[k])
        else:
            session.add(SupplierContact(
                supplier_id=supplier.id, is_primary=True,
                full_name=c.get("full_name") or "Unnamed",
                position=c.get("position"), phone=c.get("phone"),
                email=c.get("email"), nationality=c.get("nationality"),
                id_type=c.get("id_type"), id_number=c.get("id_number"),
                id_document_url=c.get("id_document_url"),
                relationship=c.get("relationship") or "owner",
            ))

    # ---- Step 4: Business location (Google Maps pin) ----
    if payload.step == 4 and payload.business_location:
        loc = payload.business_location
        existing = (await session.execute(
            select(SupplierSupplyLocation).where(
                SupplierSupplyLocation.supplier_id == supplier.id,
                SupplierSupplyLocation.is_business_location.is_(True),
            )
        )).scalar_one_or_none()
        vals = dict(
            kind="business_location", label=loc.get("label") or supplier.business_name,
            city=loc.get("city"), country=(loc.get("country") or supplier.country).upper(),
            zone=loc.get("zone"), address=loc.get("address"),
            latitude=loc.get("latitude"), longitude=loc.get("longitude"),
            postal_code=loc.get("postal_code"),
            service_radius_km=loc.get("service_radius_km"),
            is_business_location=True, approval_status="pending",
        )
        if existing:
            for k, v in vals.items():
                setattr(existing, k, v)
        else:
            session.add(SupplierSupplyLocation(supplier_id=supplier.id, **vals))

    # ---- Step 5: Categories ----
    if payload.step == 5 and payload.categories is not None:
        # Wipe & re-insert (simple + idempotent)
        (await session.execute(
            select(SupplierCategoryInterest).where(
                SupplierCategoryInterest.supplier_id == supplier.id
            )
        )).scalars().all()  # noqa (fetch triggers no side effect)
        from sqlalchemy import delete as _delete
        await session.execute(
            _delete(SupplierCategoryInterest).where(
                SupplierCategoryInterest.supplier_id == supplier.id
            )
        )
        for item in payload.categories:
            cat_id = item.get("category_id")
            item_module = (item.get("module") or "mart").lower()
            if cat_id:
                # QA — Fixing_Prompt "Seller Apply #7": SHOP applicants pass
                # SHOP categoy ids which live in a different table. Resolve
                # against the module-appropriate model.
                if item_module == "shop":
                    from core.models import ShopCategory
                    exists = await session.get(ShopCategory, cat_id)
                else:
                    exists = await session.get(MartCategory, cat_id)
                if not exists:
                    raise HTTPException(400, f"Category not found: {cat_id} (module={item_module})")
                session.add(SupplierCategoryInterest(
                    supplier_id=supplier.id, category_id=cat_id,
                    module=item_module, status="approved",
                ))
            elif item.get("requested_name"):
                session.add(SupplierCategoryInterest(
                    supplier_id=supplier.id,
                    requested_name=item["requested_name"],
                    reason=item.get("reason"),
                    module=item_module,
                    status="pending",
                ))

    # ---- Step 6: Supply locations (non-business-location rows) ----
    if payload.step == 6 and payload.supply_locations is not None:
        from sqlalchemy import delete as _delete
        await session.execute(
            _delete(SupplierSupplyLocation).where(
                SupplierSupplyLocation.supplier_id == supplier.id,
                SupplierSupplyLocation.is_business_location.is_(False),
            )
        )
        for loc in payload.supply_locations:
            kind = loc.get("kind") or "supply_city"
            session.add(SupplierSupplyLocation(
                supplier_id=supplier.id, kind=kind,
                label=loc.get("label") or (loc.get("city") or kind),
                city=loc.get("city"),
                country=(loc.get("country") or supplier.country).upper(),
                zone=loc.get("zone"), warehouse_id=loc.get("warehouse_id"),
                address=loc.get("address"),
                latitude=loc.get("latitude"), longitude=loc.get("longitude"),
                service_radius_km=loc.get("service_radius_km"),
                is_business_location=False,
                approval_status="pending",
            ))

    # ---- Step 7: Banking ----
    if payload.step == 7 and payload.bank_info:
        b = payload.bank_info
        row = (await session.execute(
            select(SupplierBankInfo).where(SupplierBankInfo.supplier_id == supplier.id)
        )).scalar_one_or_none()
        if row:
            for k in ("bank_name", "account_holder", "account_number", "iban",
                      "swift_bic", "mobile_money_provider", "mobile_money_number",
                      "preferred_method", "billing_address", "billing_city",
                      "billing_country"):
                if b.get(k) is not None:
                    setattr(row, k, b[k])
        else:
            session.add(SupplierBankInfo(supplier_id=supplier.id, **{
                k: b.get(k) for k in (
                    "bank_name", "account_holder", "account_number", "iban",
                    "swift_bic", "mobile_money_provider", "mobile_money_number",
                    "preferred_method", "billing_address", "billing_city",
                    "billing_country",
                )
            }))

    # ---- Step 8: Documents ----
    if payload.step == 8 and payload.documents is not None:
        for d in payload.documents:
            dtype = d.get("document_type") or "other"
            if dtype not in SUPPLIER_DOCUMENT_TYPES:
                raise HTTPException(400, f"Invalid document_type: {dtype}")
            if not d.get("file_url"):
                raise HTTPException(400, "file_url is required for each document")
            session.add(SupplierDocument(
                supplier_id=supplier.id, document_type=dtype,
                title=d.get("title"), file_url=d["file_url"],
                issued_on=d.get("issued_on"), expires_on=d.get("expires_on"),
            ))

    app.current_step = max(app.current_step, payload.step + 1 if payload.step < 9 else 9)
    await session.commit()
    await session.refresh(app)
    return {"application": _application_dict(app), "current_step": app.current_step}


@public_router.post("/apply/{app_id}/submit")
async def apply_submit(app_id: str, session: AsyncSession = Depends(get_session)):
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("draft", "action_required"):
        raise HTTPException(409, f"Cannot submit a {app.status} application")
    supplier = await session.get(Supplier, app.supplier_id)
    if not supplier.phone_verified:
        raise HTTPException(400, "Phone must be verified before submission")

    # Snapshot the full application for auditability
    snapshot = await _load_full_snapshot(session, supplier)
    app.summary_snapshot = snapshot
    app.status = "submitted"
    app.submitted_at = datetime.now(timezone.utc)
    supplier.status = "submitted"

    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, application_id=app.id,
        action="submit", from_status="draft", to_status="submitted",
    ))
    await session.commit()
    await session.refresh(app)
    return {"application": _application_dict(app), "supplier": _supplier_dict(supplier)}


@public_router.get("/apply/{app_id}")
async def apply_get(app_id: str, session: AsyncSession = Depends(get_session)):
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    supplier = await session.get(Supplier, app.supplier_id)
    snapshot = await _load_full_snapshot(session, supplier)
    return {"application": _application_dict(app), **snapshot}


# ---------------------------------------------------------------------------
# Public file upload — scoped to a draft application id (Fixing_Prompt v13
# — Seller Apply #8). Sellers can upload IDs / registration certificates /
# tax docs during the wizard *before* they're an authenticated supplier.
# Only drafts (not-yet-submitted apps) can upload; submitted/approved apps
# use the auth-gated /api/supplier/uploads instead.
# ---------------------------------------------------------------------------
_APPLY_UPLOAD_MAX = 8 * 1024 * 1024  # 8 MiB
_APPLY_UPLOAD_MIME = ("image/", "application/pdf")


@public_router.post("/apply/{app_id}/uploads")
async def apply_upload(
    app_id: str,
    file: UploadFile = File(...),
    kind: str = Form("document"),
    session: AsyncSession = Depends(get_session),
):
    if kind not in ("document", "image"):
        raise HTTPException(400, "kind must be 'document' or 'image'")
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("draft", "action_required"):
        raise HTTPException(409, {"code": "app_frozen",
                                  "message": "Uploads are only allowed on draft applications."})

    ct = (file.content_type or "application/octet-stream").lower()
    if not any(ct.startswith(p) for p in _APPLY_UPLOAD_MIME):
        raise HTTPException(415, f"Unsupported content type: {ct} — use PDF or an image.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > _APPLY_UPLOAD_MAX:
        raise HTTPException(413, f"Max file size is {_APPLY_UPLOAD_MAX // (1024 * 1024)} MB")

    ext = "bin"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()[:8]
    path = f"{object_storage.APP_NAME}/apply/{app_id}/{kind}s/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}.{ext}"
    try:
        result = object_storage.put_object(path, data, ct)
    except Exception as exc:
        raise HTTPException(502, {"code": "storage_upload_failed", "message": str(exc)}) from exc

    return {
        "storage_path": result["path"],
        "file_url": f"/api/martbaked/sellers/apply/{app_id}/files/{result['path']}",
        "size_bytes": result.get("size", len(data)),
        "content_type": ct,
        "original_filename": file.filename,
    }


@public_router.get("/apply/{app_id}/files/{path:path}")
async def apply_file_serve(app_id: str, path: str, session: AsyncSession = Depends(get_session)):
    """Serve an uploaded application doc.

    Current scope (MVP): opaque path grants read access — retrievable by
    anyone who has both `app_id` AND the storage path. The path embeds a
    26-char microsecond timestamp so enumeration is not practical, but
    forwarded URLs are effectively bearer tokens. Follow-up hardening
    tracked in ROADMAP:
      * short-lived signed URLs for submitted apps
      * per-IP rate limit on the upload endpoint
    """
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if f"/apply/{app_id}/" not in f"/{path}":
        raise HTTPException(403, "Forbidden path")
    try:
        content, ct = object_storage.get_object(path)
    except Exception:
        raise HTTPException(404, "File not found")
    from fastapi import Response
    return Response(content=content, media_type=ct)


@public_router.get("/application-status/{application_code}")
async def application_status(application_code: str, session: AsyncSession = Depends(get_session)):
    """Public status endpoint (no auth) — safe minimal fields only."""
    app = (await session.execute(
        select(SupplierApplication).where(SupplierApplication.application_code == application_code)
    )).scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Application not found")
    supplier = await session.get(Supplier, app.supplier_id)
    return {
        "application_code": app.application_code,
        "status": app.status,
        "business_name": supplier.business_name,
        "submitted_at": app.submitted_at.isoformat() if app.submitted_at else None,
        "reviewed_at": app.reviewed_at.isoformat() if app.reviewed_at else None,
        "action_required_notes": app.action_required_notes if app.status == "action_required" else None,
        "rejection_reason": app.rejection_reason if app.status == "rejected" else None,
    }


# ===========================================================================
# SUPPLIER AUTH (post-approval login)
# ===========================================================================


class SupplierLoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str


@public_router.post("/login")
async def supplier_login(payload: SupplierLoginIn, session: AsyncSession = Depends(get_session)):
    supplier = (await session.execute(
        select(Supplier).where(Supplier.business_email == payload.email)
    )).scalar_one_or_none()
    if not supplier or not supplier.password_hash or not verify_password(payload.password, supplier.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if supplier.status != "approved" or not supplier.supplier_portal_active:
        raise HTTPException(403, {
            "code": "not_active",
            "message": "Supplier account is not active. Please complete onboarding.",
        })
    token = create_access_token(supplier.id, role="supplier", extra={"module": "mart"})
    return {"access_token": token, "token_type": "bearer", "supplier": _supplier_dict(supplier)}


class SupplierActivateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_code: str
    password: str = Field(..., min_length=8, max_length=128)


@public_router.post("/activate")
async def supplier_activate(payload: SupplierActivateIn, session: AsyncSession = Depends(get_session)):
    """Owner-set password after Super Admin approval.
    Uses application_code (from approval email) as the identifier so we don't
    have to mint a separate activation token — one-time consumption is enforced
    by the `supplier_portal_active` flag flipping to true."""
    app = (await session.execute(
        select(SupplierApplication).where(SupplierApplication.application_code == payload.application_code)
    )).scalar_one_or_none()
    if not app:
        raise HTTPException(404, "Application not found")
    supplier = await session.get(Supplier, app.supplier_id)
    if supplier.status != "approved":
        raise HTTPException(409, "Supplier is not approved yet")
    if supplier.supplier_portal_active and supplier.password_hash:
        raise HTTPException(409, {
            "code": "already_activated",
            "message": "Account already activated. Please log in.",
        })
    supplier.password_hash = hash_password(payload.password)
    supplier.supplier_portal_active = True
    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, application_id=app.id,
        action="portal_activated", from_status="approved", to_status="approved",
    ))
    await session.commit()
    token = create_access_token(supplier.id, role="supplier", extra={"module": "mart"})
    return {"access_token": token, "token_type": "bearer", "supplier": _supplier_dict(supplier)}


# ===========================================================================
# SUPER ADMIN REVIEW ROUTES
# ===========================================================================

admin_router = APIRouter(
    prefix="/admin/modules/mart/suppliers", tags=["admin-suppliers"]
)


def _admin_dep():
    """Late-bind get_current_admin to avoid a circular import at module load."""
    from shared.admin.routes import get_current_admin
    return get_current_admin


@admin_router.get("/applications")
async def admin_list_applications(
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    module: Optional[str] = Query(None, description="Filter suppliers by module — MART or SHOP. Matches on Supplier.modules JSONB array."),
    q: Optional[str] = Query(None, description="Search on business_name / email / application_code"),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    stmt = select(SupplierApplication, Supplier).join(
        Supplier, Supplier.id == SupplierApplication.supplier_id
    ).order_by(SupplierApplication.created_at.desc())
    if status:
        stmt = stmt.where(SupplierApplication.status == status)
    if country:
        stmt = stmt.where(Supplier.country == country.upper())
    if module:
        # `modules` is a JSONB array of module codes ("MART", "SHOP"…).
        # Use the `?` containment operator for a single element.
        stmt = stmt.where(Supplier.modules.op("?")(module.upper()))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            (Supplier.business_name.ilike(like))
            | (Supplier.business_email.ilike(like))
            | (SupplierApplication.application_code.ilike(like))
        )
    rows = (await session.execute(stmt)).all()

    # Bucket counts (country/module-scoped when filter is set)
    bstmt = select(SupplierApplication.status, func.count(SupplierApplication.id)).join(
        Supplier, Supplier.id == SupplierApplication.supplier_id
    ).group_by(SupplierApplication.status)
    if country:
        bstmt = bstmt.where(Supplier.country == country.upper())
    if module:
        bstmt = bstmt.where(Supplier.modules.op("?")(module.upper()))
    brows = (await session.execute(bstmt)).all()
    buckets = {s: 0 for s in ("draft", "submitted", "under_review", "action_required", "approved", "rejected")}
    for s, c in brows:
        buckets[s] = c

    items = []
    for app, sup in rows:
        items.append({**_application_dict(app), "supplier": _supplier_dict(sup)})
    return {"items": items, "buckets": buckets}


@admin_router.get("/applications/{app_id}")
async def admin_get_application(
    app_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    supplier = await session.get(Supplier, app.supplier_id)
    snapshot = await _load_full_snapshot(session, supplier)
    audits = (await session.execute(
        select(SupplierReviewAudit).where(SupplierReviewAudit.supplier_id == supplier.id)
        .order_by(SupplierReviewAudit.created_at.desc())
    )).scalars().all()
    return {
        "application": _application_dict(app),
        **snapshot,
        "audit_trail": [{
            "id": a.id, "action": a.action, "from_status": a.from_status,
            "to_status": a.to_status, "notes": a.notes,
            "actor_admin_id": a.actor_admin_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in audits],
    }


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = Field(None, max_length=2000)


@admin_router.post("/applications/{app_id}/approve")
async def admin_approve_application(
    app_id: str,
    payload: ReviewIn = ReviewIn(),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("submitted", "under_review", "action_required"):
        raise HTTPException(409, f"Cannot approve a {app.status} application")
    supplier = await session.get(Supplier, app.supplier_id)
    prev = supplier.status
    now = datetime.now(timezone.utc)

    # Assign a supplier code the first time we approve (SUP-{CC}-{seq:04d}).
    if not supplier.code:
        cnt = (await session.scalar(
            select(func.count(Supplier.id)).where(
                Supplier.country == supplier.country,
                Supplier.code.isnot(None),
            )
        )) or 0
        supplier.code = f"SUP-{supplier.country}-{cnt + 1:04d}"

    # Assign a URL-safe seller_slug the first time we approve. Idempotent —
    # never overwrite an existing slug (the URL is now part of the public
    # contract with the supplier).
    if not supplier.seller_slug:
        import re
        raw = (supplier.trading_name or supplier.business_name or "seller")
        base = re.sub(r"[^a-z0-9]+", "", raw.split(" ")[0].lower()) or "seller"
        candidate, n = base, 1
        while (await session.scalar(
            select(func.count(Supplier.id)).where(Supplier.seller_slug == candidate)
        )):
            n += 1
            candidate = f"{base}-{n}"
        supplier.seller_slug = candidate

    supplier.status = "approved"
    supplier.approved_at = now
    supplier.approved_by_admin_id = admin.id
    # Only require re-activation the FIRST time (i.e. no password_hash yet).
    # For re-approvals after a critical-field re-verification, the supplier's
    # portal password already exists — do NOT force them to re-set it.
    if not supplier.password_hash:
        supplier.supplier_portal_active = False  # awaits initial activation
    # else: keep supplier_portal_active as-is (typically True)

    app.status = "approved"
    app.reviewed_at = now
    app.reviewer_admin_id = admin.id

    # Auto-approve business_location, but leave supply_locations pending
    # (SA must curate which dark stores can be supplied — per doc §10).
    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, application_id=app.id, actor_admin_id=admin.id,
        action="approve", from_status=prev, to_status="approved",
        notes=payload.notes,
    ))
    await session.commit()
    return {
        "application": _application_dict(app),
        "supplier": _supplier_dict(supplier),
        "activation_url": f"/martbaked/sellers/activate?code={app.application_code}",
    }


@admin_router.post("/applications/{app_id}/reject")
async def admin_reject_application(
    app_id: str,
    payload: ReviewIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    if not payload.notes:
        raise HTTPException(400, "Rejection notes are required")
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("submitted", "under_review", "action_required"):
        raise HTTPException(409, f"Cannot reject a {app.status} application")
    supplier = await session.get(Supplier, app.supplier_id)
    prev = supplier.status
    now = datetime.now(timezone.utc)

    supplier.status = "rejected"
    app.status = "rejected"
    app.reviewed_at = now
    app.reviewer_admin_id = admin.id
    app.rejection_reason = payload.notes

    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, application_id=app.id, actor_admin_id=admin.id,
        action="reject", from_status=prev, to_status="rejected", notes=payload.notes,
    ))
    await session.commit()
    return {"application": _application_dict(app), "supplier": _supplier_dict(supplier)}


@admin_router.post("/applications/{app_id}/request-info")
async def admin_request_info(
    app_id: str,
    payload: ReviewIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    if not payload.notes:
        raise HTTPException(400, "Notes are required — tell the supplier what to fix")
    app = await session.get(SupplierApplication, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status not in ("submitted", "under_review"):
        raise HTTPException(409, f"Cannot request info on a {app.status} application")
    supplier = await session.get(Supplier, app.supplier_id)
    prev = supplier.status
    now = datetime.now(timezone.utc)

    supplier.status = "action_required"
    app.status = "action_required"
    app.reviewer_admin_id = admin.id
    app.action_required_notes = payload.notes
    app.reviewed_at = now

    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, application_id=app.id, actor_admin_id=admin.id,
        action="request_information", from_status=prev, to_status="action_required",
        notes=payload.notes,
    ))
    await session.commit()
    return {"application": _application_dict(app), "supplier": _supplier_dict(supplier)}


@admin_router.post("/{sid}/suspend")
async def admin_suspend_supplier(
    sid: str,
    payload: ReviewIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    if supplier.status not in ("approved",):
        raise HTTPException(409, f"Cannot suspend a {supplier.status} supplier")
    supplier.status = "suspended"
    supplier.suspended_at = datetime.now(timezone.utc)
    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, actor_admin_id=admin.id,
        action="suspend", from_status="approved", to_status="suspended",
        notes=payload.notes,
    ))
    await session.commit()
    return _supplier_dict(supplier)


@admin_router.post("/{sid}/unsuspend")
async def admin_unsuspend_supplier(
    sid: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    if supplier.status != "suspended":
        raise HTTPException(409, f"Cannot unsuspend a {supplier.status} supplier")
    supplier.status = "approved"
    supplier.suspended_at = None
    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, actor_admin_id=admin.id,
        action="unsuspend", from_status="suspended", to_status="approved",
    ))
    await session.commit()
    return _supplier_dict(supplier)


# ===========================================================================
# Fixing_Prompt v5 — Supplier-centric detail view + products
#
#   GET /api/admin/modules/mart/suppliers/{sid}                     — snapshot
#   GET /api/admin/modules/mart/suppliers/{sid}/products            — products
#     ?status=&category=&subcategory=&q=&limit=
# ===========================================================================


# ===========================================================================
# Slice 5 — Modules toggle: enable/disable module access per supplier.
# ===========================================================================

_SUPPORTED_MODULES = {"MART", "SHOP"}


class ModulesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    modules: List[str] = Field(..., min_length=1)


@admin_router.patch("/{sid}/modules")
async def admin_set_supplier_modules(
    sid: str,
    payload: ModulesIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """Overwrite the supplier's `modules` array (e.g. `["MART","SHOP"]`).

    * Every value must belong to the supported-modules whitelist.
    * `MART` is always kept — a supplier without any module is meaningless.
    * Audit-logged as `supplier.modules_updated` with before/after diff.
    """
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    incoming = [m.upper().strip() for m in payload.modules if m and m.strip()]
    unknown = [m for m in incoming if m not in _SUPPORTED_MODULES]
    if unknown:
        raise HTTPException(400, {"code": "unsupported_module",
                                  "message": f"Unknown modules: {', '.join(unknown)}"})
    if "MART" not in incoming:
        incoming = ["MART"] + incoming  # always retain MART
    # De-duplicate while preserving order.
    seen, ordered = set(), []
    for m in incoming:
        if m not in seen:
            ordered.append(m); seen.add(m)

    before = list(supplier.modules or [])
    if before == ordered:
        return {"id": supplier.id, "modules": ordered, "changed": False}

    supplier.modules = ordered
    session.add(SupplierReviewAudit(
        supplier_id=supplier.id, actor_admin_id=admin.id,
        action="supplier.modules_updated",
        from_status=",".join(before) or None,
        to_status=",".join(ordered),
        notes=None,
    ))
    await session.commit()
    return {"id": supplier.id, "modules": ordered, "changed": True,
            "before": before, "after": ordered}


@admin_router.get("/{sid}")
async def admin_get_supplier_detail(
    sid: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """Full supplier snapshot for the supplier-detail workspace. Groups
    supplier profile, warehouse assignments, audit trail and product-count
    summary so the frontend can hydrate the whole Overview tab in one call."""
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    snapshot = await _load_full_snapshot(session, supplier)

    # Audit trail
    audits = (await session.execute(
        select(SupplierReviewAudit).where(SupplierReviewAudit.supplier_id == sid)
        .order_by(SupplierReviewAudit.created_at.desc()).limit(50)
    )).scalars().all()

    # Latest application row (for the application_code chip)
    latest_app = (await session.execute(
        select(SupplierApplication).where(SupplierApplication.supplier_id == sid)
        .order_by(SupplierApplication.created_at.desc()).limit(1)
    )).scalar_one_or_none()

    # Warehouse assignments (inherited allocation for products)
    from core.models import SupplierWarehouseAssignment, Warehouse
    assigns = (await session.execute(
        select(SupplierWarehouseAssignment, Warehouse)
        .join(Warehouse, Warehouse.id == SupplierWarehouseAssignment.warehouse_id)
        .where(SupplierWarehouseAssignment.supplier_id == sid)
        .order_by(SupplierWarehouseAssignment.is_primary.desc())
    )).all()

    # Product summary buckets — used for the "Products (N)" tab badge
    from core.models import SupplierProductRequest
    bstmt = (
        select(SupplierProductRequest.status, func.count(SupplierProductRequest.id))
        .where(SupplierProductRequest.supplier_id == sid)
        .group_by(SupplierProductRequest.status)
    )
    buckets = {s: 0 for s in ("pending", "approved", "rejected", "withdrawn")}
    for s, c in (await session.execute(bstmt)).all():
        buckets[s] = c

    return {
        **snapshot,
        "application": {
            "id": latest_app.id, "application_code": latest_app.application_code,
            "status": latest_app.status,
            "submitted_at": latest_app.submitted_at.isoformat() if latest_app.submitted_at else None,
        } if latest_app else None,
        "warehouse_assignments": [{
            "id": a.id, "warehouse_id": a.warehouse_id, "is_primary": a.is_primary,
            "warehouse": {"code": w.code, "name": w.name, "city": w.city, "country": w.country},
        } for a, w in assigns],
        "product_buckets": buckets,
        "audit_trail": [{
            "id": a.id, "action": a.action, "from_status": a.from_status,
            "to_status": a.to_status, "notes": a.notes,
            "actor_admin_id": a.actor_admin_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in audits],
    }


@admin_router.get("/{sid}/products")
async def admin_list_supplier_products(
    sid: str,
    status: Optional[str] = Query(None, description="pending|approved|rejected|withdrawn|all"),
    category: Optional[str] = Query(None, description="category slug"),
    subcategory: Optional[str] = Query(None, description="subcategory slug"),
    q: Optional[str] = Query(None, description="search on name / manufacturer / EAN"),
    limit: int = Query(200, le=500),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """List every product request submitted by this supplier, joined with
    the resulting master product (if approved). Supports server-side status
    / category / subcategory / free-text filtering — used by the supplier
    detail page's Products tab."""
    from core.models import SupplierProductRequest, MartProduct
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    stmt = (
        select(SupplierProductRequest, MartProduct, MartCategory)
        .join(MartProduct,
              MartProduct.id == SupplierProductRequest.created_master_product_id,
              isouter=True)
        .join(MartCategory,
              MartCategory.id == SupplierProductRequest.proposed_category_id,
              isouter=True)
        .where(SupplierProductRequest.supplier_id == sid)
        .order_by(SupplierProductRequest.created_at.desc())
    )
    if status and status != "all":
        stmt = stmt.where(SupplierProductRequest.status == status)
    if category:
        # Match either the proposed category (pre-approval) or the mart
        # category attached to the created master product (post-approval).
        stmt = stmt.where(
            (MartCategory.slug == category) | (MartProduct.category_slug == category)
        )
    if subcategory:
        stmt = stmt.where(MartProduct.subcategory_slug == subcategory)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            SupplierProductRequest.proposed_name.ilike(like)
            | SupplierProductRequest.proposed_manufacturer.ilike(like)
            | SupplierProductRequest.proposed_ean_upc.ilike(like)
        )

    rows = (await session.execute(stmt.limit(limit))).all()

    # Bucket counts (unfiltered by status/text so tabs always show totals)
    bstmt = (
        select(SupplierProductRequest.status, func.count(SupplierProductRequest.id))
        .where(SupplierProductRequest.supplier_id == sid)
        .group_by(SupplierProductRequest.status)
    )
    buckets = {s: 0 for s in ("pending", "approved", "rejected", "withdrawn")}
    for s, c in (await session.execute(bstmt)).all():
        buckets[s] = c

    items = []
    for r, mp, cat in rows:
        items.append({
            "id": r.id,
            "supplier_id": r.supplier_id,
            "proposed_name": r.proposed_name,
            "proposed_manufacturer": r.proposed_manufacturer,
            "proposed_ean_upc": r.proposed_ean_upc,
            "proposed_pack_size": r.proposed_pack_size,
            "proposed_short_description": r.proposed_short_description,
            "proposed_cost_price": float(r.proposed_cost_price) if r.proposed_cost_price is not None else None,
            "proposed_currency": r.proposed_currency,
            "proposed_moq": r.proposed_moq,
            "proposed_lead_time_days": r.proposed_lead_time_days,
            "image_url": r.image_url,
            "images": [r.image_url] if r.image_url else [],
            "notes": r.notes,
            "status": r.status,
            "review_notes": r.review_notes,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            # Slice 2 — dynamic attribute snapshot ({key: {v,label,type}})
            # so the admin review drawer renders Category-specific fields.
            "attributes": r.attributes or {},
            "category": {
                "id": cat.id, "name": cat.name, "slug": cat.slug,
            } if cat else None,
            "master_product": {
                "id": mp.id, "name": mp.name, "sku_code": mp.sku_code,
                "category_slug": mp.category_slug, "subcategory_slug": mp.subcategory_slug,
                "price": float(mp.price) if mp.price is not None else None,
                "currency": mp.currency,
                "image": mp.image,
                "images": mp.images if getattr(mp, "images", None) else ([mp.image] if mp.image else []),
            } if mp else None,
        })
    return {
        "supplier": {"id": supplier.id, "business_name": supplier.business_name,
                     "code": supplier.code, "country": supplier.country,
                     "status": supplier.status},
        "buckets": buckets,
        "items": items,
    }


# ===========================================================================
# Social.docx §9 — Supplier ↔ Warehouse (Darkstore / FC) assignment
# ===========================================================================


class WarehouseAssignmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    warehouse_id: str
    is_primary: bool = False
    notes: Optional[str] = Field(None, max_length=1000)


def _wh_assignment_dict(row: SupplierWarehouseAssignment, wh: Warehouse) -> dict:
    return {
        "id": row.id,
        "supplier_id": row.supplier_id,
        "warehouse_id": row.warehouse_id,
        "is_primary": row.is_primary,
        "notes": row.notes,
        "warehouse": {
            "id": wh.id, "code": wh.code, "name": wh.name,
            "city": wh.city, "country": wh.country, "status": wh.status,
        } if wh else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@admin_router.get("/{sid}/warehouses")
async def admin_list_supplier_warehouses(
    sid: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """Return every warehouse currently assigned to this supplier, plus a
    catalogue of eligible warehouses (same country + module=mart, active)
    that the admin can pick from."""
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    # Assigned rows joined to warehouse metadata.
    assigns = (await session.execute(
        select(SupplierWarehouseAssignment, Warehouse)
        .join(Warehouse, Warehouse.id == SupplierWarehouseAssignment.warehouse_id)
        .where(SupplierWarehouseAssignment.supplier_id == sid)
        .order_by(SupplierWarehouseAssignment.is_primary.desc(),
                  SupplierWarehouseAssignment.created_at.asc())
    )).all()

    # Eligible catalogue — same country, active, not already assigned.
    assigned_ids = {a.warehouse_id for a, _ in assigns}
    eligible = (await session.execute(
        select(Warehouse).where(
            Warehouse.country == supplier.country,
            Warehouse.is_active == True,  # noqa: E712
        ).order_by(Warehouse.code)
    )).scalars().all()

    return {
        "supplier": {
            "id": supplier.id, "business_name": supplier.business_name,
            "code": supplier.code, "country": supplier.country, "status": supplier.status,
        },
        "assignments": [_wh_assignment_dict(a, w) for a, w in assigns],
        "eligible": [
            {"id": w.id, "code": w.code, "name": w.name, "city": w.city,
             "status": w.status, "is_assigned": w.id in assigned_ids}
            for w in eligible
        ],
    }


@admin_router.post("/{sid}/warehouses", status_code=201)
async def admin_assign_supplier_warehouse(
    sid: str, payload: WarehouseAssignmentIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    """Assign a warehouse to the supplier. `is_primary=true` demotes any
    existing primary in the same country to non-primary (only one primary
    per supplier)."""
    supplier = await session.get(Supplier, sid)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    wh = await session.get(Warehouse, payload.warehouse_id)
    if not wh:
        raise HTTPException(404, "Warehouse not found")
    if wh.country != supplier.country:
        raise HTTPException(400, {
            "code": "cross_country_denied",
            "message": "Supplier and warehouse must be in the same country.",
        })

    # Idempotency — if the row already exists, PATCH-style update instead of 409.
    existing = (await session.execute(
        select(SupplierWarehouseAssignment).where(
            SupplierWarehouseAssignment.supplier_id == sid,
            SupplierWarehouseAssignment.warehouse_id == payload.warehouse_id,
        )
    )).scalar_one_or_none()

    if payload.is_primary:
        # Demote current primary(ies) — one primary per supplier.
        others = (await session.execute(
            select(SupplierWarehouseAssignment).where(
                SupplierWarehouseAssignment.supplier_id == sid,
                SupplierWarehouseAssignment.is_primary == True,  # noqa: E712
            )
        )).scalars().all()
        for o in others:
            if not existing or o.id != existing.id:
                o.is_primary = False

    if existing:
        existing.is_primary = payload.is_primary
        existing.notes = payload.notes
        row = existing
    else:
        row = SupplierWarehouseAssignment(
            supplier_id=sid,
            warehouse_id=payload.warehouse_id,
            is_primary=payload.is_primary,
            notes=payload.notes,
            assigned_by_admin_id=admin.id,
        )
        session.add(row)

    session.add(SupplierReviewAudit(
        supplier_id=sid, actor_admin_id=admin.id,
        action="warehouse_assigned",
        notes=f"warehouse={wh.code} primary={payload.is_primary}",
    ))
    await session.commit()
    await session.refresh(row)
    return _wh_assignment_dict(row, wh)


@admin_router.delete("/{sid}/warehouses/{warehouse_id}", status_code=204)
async def admin_unassign_supplier_warehouse(
    sid: str, warehouse_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(_admin_dep()),
):
    row = (await session.execute(
        select(SupplierWarehouseAssignment).where(
            SupplierWarehouseAssignment.supplier_id == sid,
            SupplierWarehouseAssignment.warehouse_id == warehouse_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Assignment not found")
    wh = await session.get(Warehouse, warehouse_id)
    await session.delete(row)
    session.add(SupplierReviewAudit(
        supplier_id=sid, actor_admin_id=admin.id,
        action="warehouse_unassigned",
        notes=f"warehouse={wh.code if wh else warehouse_id}",
    ))
    await session.commit()

