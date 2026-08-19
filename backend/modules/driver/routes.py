"""SENDbakēd Driver — Slice 1 (Auth + KYC + Dashboard).

Endpoints (all prefixed `/api/driver`):

  POST  /auth/request-otp    { phone_e164, country }  → { otp_id, dev_hint }
  POST  /auth/verify-otp     { phone_e164, code }     → { access_token, driver, next_step }
  GET   /me                                            → current driver row
  PATCH /me/kyc              { step, data }            → advances kyc_step + persists field(s)
  POST  /me/upload           multipart(file, kind)     → { file_url }
  POST  /me/submit                                     → status → pending_review
  POST  /me/online           { is_online, lat?, lng? } → toggles availability (only approved)
  GET   /me/dashboard                                  → summary card data

  Admin (behind existing require_admin):
  GET   /admin/drivers                                 → list drivers with filters
  POST  /admin/drivers/{id}/approve                    → status → approved
  POST  /admin/drivers/{id}/reject   { notes }         → status → rejected

SMS is mocked — the generated OTP is printed to the backend log and also
returned in the `dev_hint` field of `request-otp` when `APP_ENV != production`.
"""
from __future__ import annotations
import os
import random
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, DRIVER_STATUSES, Driver, DriverOtp, KYC_STEPS, VEHICLE_TYPES,
)
from core.providers import object_storage
from core.security import create_access_token, decode_token
from shared.admin.routes import get_current_admin


OTP_TTL_MIN     = 10
OTP_MAX_TRIES   = 5
DRIVER_JWT_ROLE = "driver"


def _dev_mode() -> bool:
    return (os.environ.get("APP_ENV") or "").lower() != "production"


def _driver_dict(d: Driver) -> dict:
    """Serialise a driver row for the client. Sensitive fields (bank account
    number) are truncated so the frontend can display a hint without echoing
    the full value back on every refresh."""
    def _mask(v: Optional[str]) -> Optional[str]:
        if not v: return v
        if len(v) <= 4: return "•" * len(v)
        return "•" * (len(v) - 4) + v[-4:]
    return {
        "id": d.id, "phone_e164": d.phone_e164, "country": d.country,
        "name": d.name, "email": d.email,
        "status": d.status, "kyc_step": d.kyc_step,
        "gov_id_type": d.gov_id_type, "gov_id_number": _mask(d.gov_id_number),
        "gov_id_front_url": d.gov_id_front_url, "gov_id_back_url": d.gov_id_back_url,
        "licence_number": _mask(d.licence_number), "licence_front_url": d.licence_front_url,
        "licence_expiry": d.licence_expiry.isoformat() if d.licence_expiry else None,
        "selfie_url": d.selfie_url,
        "vehicle_type": d.vehicle_type, "vehicle_plate": d.vehicle_plate, "vehicle_reg_url": d.vehicle_reg_url,
        "bank_account_holder": d.bank_account_holder,
        "bank_account_number": _mask(d.bank_account_number),
        "bank_ifsc_or_swift": d.bank_ifsc_or_swift,
        "emergency_contact_name": d.emergency_contact_name,
        "emergency_contact_phone": d.emergency_contact_phone,
        "is_online": d.is_online, "current_area": d.current_area,
        "current_lat": d.current_lat, "current_lng": d.current_lng,
        "submitted_at": d.submitted_at.isoformat() if d.submitted_at else None,
        "approved_at":  d.approved_at.isoformat()  if d.approved_at  else None,
        "reviewer_notes": d.reviewer_notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


# ---------------------------------------------------------------------------
# Auth (phone + OTP)
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/driver", tags=["driver"])


class RequestOtpIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone_e164: str = Field(..., min_length=8, max_length=24, pattern=r"^\+[0-9]{7,20}$")
    country:    str = Field(..., min_length=2, max_length=2)


@router.post("/auth/request-otp")
async def request_otp(payload: RequestOtpIn, session: AsyncSession = Depends(get_session)):
    """Generate + 'send' an OTP. In dev the code is returned in `dev_hint`
    so QA can log in without a real SMS gateway."""
    code = f"{random.randint(0, 999_999):06d}"
    row = DriverOtp(
        phone_e164=payload.phone_e164, code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN),
    )
    session.add(row)
    # Ensure a Driver record exists so subsequent verify-otp knows the country.
    d = (await session.execute(
        select(Driver).where(Driver.phone_e164 == payload.phone_e164)
    )).scalar_one_or_none()
    if not d:
        session.add(Driver(phone_e164=payload.phone_e164, country=payload.country.upper()))
    await session.commit()
    print(f"[driver.otp] {payload.phone_e164} → {code} (dev)")   # mocked SMS
    return {
        "otp_id": row.id,
        "expires_in_seconds": OTP_TTL_MIN * 60,
        "dev_hint": code if _dev_mode() else None,
    }


class VerifyOtpIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone_e164: str = Field(..., min_length=8, max_length=24, pattern=r"^\+[0-9]{7,20}$")
    code:       str = Field(..., min_length=4, max_length=8)


@router.post("/auth/verify-otp")
async def verify_otp(payload: VerifyOtpIn, session: AsyncSession = Depends(get_session)):
    now = datetime.now(timezone.utc)
    row = (await session.execute(
        select(DriverOtp)
        .where(DriverOtp.phone_e164 == payload.phone_e164,
               DriverOtp.consumed_at.is_(None))
        .order_by(DriverOtp.created_at.desc())
    )).scalars().first()
    if not row or row.expires_at < now:
        raise HTTPException(400, {"code": "otp_expired", "message": "Code expired — request a new one."})
    if row.attempts >= OTP_MAX_TRIES:
        raise HTTPException(429, {"code": "too_many_attempts", "message": "Too many attempts. Request a new code."})
    if row.code != payload.code:
        row.attempts += 1
        await session.commit()
        raise HTTPException(400, {"code": "otp_invalid", "message": "Incorrect code. Try again."})
    row.consumed_at = now
    d = (await session.execute(
        select(Driver).where(Driver.phone_e164 == payload.phone_e164)
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Driver record not found — start over.")
    await session.commit()
    tok = create_access_token(d.id, role=DRIVER_JWT_ROLE, extra={"module": "driver"})
    return {
        "access_token": tok,
        "driver": _driver_dict(d),
        "next_step": "dashboard" if d.status == "approved" else d.kyc_step,
    }


# ---------------------------------------------------------------------------
# Current driver
# ---------------------------------------------------------------------------

async def get_current_driver(
    request=None, session: AsyncSession = Depends(get_session),
) -> Driver:
    from fastapi import Request
    if request is None:                                    # FastAPI injects the Request via Depends chain
        raise HTTPException(500, "internal: missing request")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        payload = decode_token(auth.split(" ", 1)[1])
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get("role") != DRIVER_JWT_ROLE:
        raise HTTPException(403, "Driver auth required")
    d = await session.get(Driver, payload.get("sub"))
    if not d:
        raise HTTPException(404, "Driver not found")
    return d


# FastAPI's Depends can't inject Request without explicit annotation; use a
# small helper that wraps it cleanly.
from fastapi import Request

async def _current_driver(request: Request, session: AsyncSession = Depends(get_session)) -> Driver:
    return await get_current_driver(request=request, session=session)


@router.get("/me")
async def get_me(driver: Driver = Depends(_current_driver)):
    return _driver_dict(driver)


# ---------------------------------------------------------------------------
# KYC — step-by-step wizard save
# ---------------------------------------------------------------------------

# Whitelist per step of the fields the client can update. This is the *only*
# server-side gate that keeps a driver from setting `status='approved'` via
# a crafted PATCH.
KYC_FIELD_WHITELIST: dict[str, set[str]] = {
    "personal":  {"name", "email"},
    "id":        {"gov_id_type", "gov_id_number", "gov_id_front_url", "gov_id_back_url"},
    "licence":   {"licence_number", "licence_front_url", "licence_expiry"},
    "selfie":    {"selfie_url"},
    "vehicle":   {"vehicle_type", "vehicle_plate", "vehicle_reg_url"},
    "bank":      {"bank_account_holder", "bank_account_number", "bank_ifsc_or_swift"},
    "emergency": {"emergency_contact_name", "emergency_contact_phone"},
}

# Progression graph — advance kyc_step to whatever the client explicitly
# passes, but never beyond `submitted`.
_STEP_ORDER = list(KYC_STEPS)


class KycPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: str
    data: dict[str, Any]


@router.patch("/me/kyc")
async def patch_kyc(
    payload: KycPatchIn,
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    step = payload.step
    if step not in KYC_FIELD_WHITELIST:
        raise HTTPException(400, f"Unknown KYC step '{step}'")
    if driver.status not in ("onboarding", "rejected"):
        raise HTTPException(409, {"code": "kyc_locked",
                                  "message": f"KYC can't be edited while status is '{driver.status}'"})

    allowed = KYC_FIELD_WHITELIST[step]
    for k, v in payload.data.items():
        if k not in allowed:
            raise HTTPException(400, f"Field '{k}' cannot be set at step '{step}'")
        # Simple type coercions
        if k == "licence_expiry" and v:
            try: v = date.fromisoformat(v)
            except Exception: raise HTTPException(400, "licence_expiry must be ISO date YYYY-MM-DD")
        if k == "vehicle_type" and v and v not in VEHICLE_TYPES:
            raise HTTPException(400, f"vehicle_type must be one of {VEHICLE_TYPES}")
        setattr(driver, k, v)

    # Advance the wizard pointer if the client just completed a step.
    if step in _STEP_ORDER:
        i = _STEP_ORDER.index(step)
        next_step = _STEP_ORDER[min(i + 1, len(_STEP_ORDER) - 1)]
        # Never regress the wizard
        if _STEP_ORDER.index(next_step) > _STEP_ORDER.index(driver.kyc_step or "personal"):
            driver.kyc_step = next_step

    await session.commit()
    await session.refresh(driver)
    return _driver_dict(driver)


# ---------------------------------------------------------------------------
# Uploads — reuse the shared object storage provider
# ---------------------------------------------------------------------------

@router.post("/me/upload")
async def driver_upload(
    file: UploadFile = File(...),
    kind: str = Form(..., description="gov_id_front | gov_id_back | licence_front | selfie | vehicle_reg"),
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    if kind not in {"gov_id_front", "gov_id_back", "licence_front", "selfie", "vehicle_reg"}:
        raise HTTPException(400, f"Unknown upload kind '{kind}'")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, "File too large (8 MB max)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    key = f"{object_storage.APP_NAME}/driver/{driver.id}/{kind}/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.{ext}"
    try:
        object_storage.put_object(key, content, file.content_type or "application/octet-stream")
    except Exception as e:
        raise HTTPException(502, f"Upload failed: {e}")
    url = f"/api/driver/uploads/{key}"
    # persist the URL onto the right column for convenience
    col = {"gov_id_front": "gov_id_front_url", "gov_id_back": "gov_id_back_url",
           "licence_front": "licence_front_url", "selfie": "selfie_url",
           "vehicle_reg": "vehicle_reg_url"}[kind]
    setattr(driver, col, url)
    await session.commit()
    return {"file_url": url, "kind": kind}


@router.get("/uploads/{key:path}")
async def driver_upload_serve(key: str):
    """Proxy a previously-uploaded driver document. The URL is stored with
    the `/api/driver/uploads/` prefix so the frontend can just <img src>."""
    from fastapi.responses import Response
    try:
        content, ct = object_storage.get_object(key)
    except Exception:
        raise HTTPException(404, "Upload not found")
    return Response(content=content, media_type=ct)


# ---------------------------------------------------------------------------
# Submit for review
# ---------------------------------------------------------------------------

@router.post("/me/submit")
async def submit_for_review(
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    if driver.status not in ("onboarding", "rejected"):
        raise HTTPException(409, f"Already submitted (status={driver.status})")
    missing = _missing_kyc(driver)
    if missing:
        raise HTTPException(409, {"code": "kyc_incomplete", "missing": missing,
                                  "message": "Complete every KYC step before submitting."})
    driver.status = "pending_review"
    driver.kyc_step = "submitted"
    driver.submitted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(driver)
    return _driver_dict(driver)


def _missing_kyc(d: Driver) -> list[str]:
    missing = []
    if not d.name:                    missing.append("personal.name")
    if not d.gov_id_type:              missing.append("id.type")
    if not d.gov_id_number:            missing.append("id.number")
    if not d.gov_id_front_url:         missing.append("id.front")
    if not d.licence_number:           missing.append("licence.number")
    if not d.licence_front_url:        missing.append("licence.front")
    if not d.selfie_url:               missing.append("selfie")
    if not d.vehicle_type:             missing.append("vehicle.type")
    if not d.vehicle_plate:            missing.append("vehicle.plate")
    if not d.bank_account_holder:      missing.append("bank.holder")
    if not d.bank_account_number:      missing.append("bank.number")
    if not d.emergency_contact_name:   missing.append("emergency.name")
    if not d.emergency_contact_phone:  missing.append("emergency.phone")
    return missing


# ---------------------------------------------------------------------------
# Availability toggle + dashboard summary
# ---------------------------------------------------------------------------

class OnlineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_online: bool
    lat: Optional[float] = None
    lng: Optional[float] = None
    area: Optional[str]  = None


@router.post("/me/online")
async def set_online(
    payload: OnlineIn,
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    if payload.is_online and driver.status != "approved":
        raise HTTPException(403, {"code": "not_approved",
                                  "message": "You can go online once your account is approved."})
    driver.is_online = payload.is_online
    driver.last_seen_at = datetime.now(timezone.utc)
    if payload.lat is not None: driver.current_lat = payload.lat
    if payload.lng is not None: driver.current_lng = payload.lng
    if payload.area:            driver.current_area = payload.area
    await session.commit()
    return {"is_online": driver.is_online, "last_seen_at": driver.last_seen_at.isoformat()}


@router.get("/me/dashboard")
async def driver_dashboard(driver: Driver = Depends(_current_driver)):
    """Slice 1 stub — real earnings/jobs arrive in Slice 2 with the delivery
    lifecycle. For now we return the shape the frontend needs so screens
    can render without ever rendering `undefined`."""
    return {
        "driver": {"id": driver.id, "name": driver.name, "status": driver.status,
                   "is_online": driver.is_online, "kyc_step": driver.kyc_step,
                   "vehicle_type": driver.vehicle_type},
        "today": {
            "earnings":      {"amount": 0, "currency": _currency_for(driver.country), "trips": 0, "hours_online": 0},
            "acceptance_rate": None,
            "cancellation_rate": None,
        },
        "current_area": driver.current_area or ("New Delhi" if driver.country == "IN" else "Cocody, Abidjan"),
        "incentives": [],           # populated in Slice 3 (Earnings + wallet)
        "next_payout": None,
    }


def _currency_for(country: str) -> str:
    return {"IN": "INR", "CI": "XOF"}.get(country, "XOF")


# ---------------------------------------------------------------------------
# Admin — driver directory + approvals
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/drivers", tags=["admin-drivers"])


@admin_router.get("")
async def admin_list_drivers(
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Fuzzy match on name/phone"),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Driver).order_by(Driver.submitted_at.desc().nullslast(), Driver.created_at.desc())
    if status:  stmt = stmt.where(Driver.status == status)
    if country: stmt = stmt.where(Driver.country == country.upper())
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Driver.name.ilike(like)) | (Driver.phone_e164.ilike(like)))
    rows = (await session.execute(stmt)).scalars().all()
    bstmt = select(Driver.status, func.count(Driver.id)).group_by(Driver.status)
    buckets = {s: 0 for s in DRIVER_STATUSES}
    for s, c in (await session.execute(bstmt)).all():
        buckets[s] = c
    return {"items": [_driver_dict(d) for d in rows], "buckets": buckets}


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


@admin_router.post("/{driver_id}/approve")
async def admin_approve(
    driver_id: str, payload: ReviewIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    d = await session.get(Driver, driver_id)
    if not d: raise HTTPException(404, "Driver not found")
    if d.status not in ("pending_review", "rejected", "suspended"):
        raise HTTPException(409, f"Cannot approve from status='{d.status}'")
    d.status = "approved"
    d.approved_at = datetime.now(timezone.utc)
    d.reviewer_notes = payload.notes
    await session.commit()
    return _driver_dict(d)


@admin_router.post("/{driver_id}/reject")
async def admin_reject(
    driver_id: str, payload: ReviewIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    d = await session.get(Driver, driver_id)
    if not d: raise HTTPException(404, "Driver not found")
    if d.status not in ("pending_review", "approved"):
        raise HTTPException(409, f"Cannot reject from status='{d.status}'")
    d.status = "rejected"
    d.reviewer_notes = payload.notes
    await session.commit()
    return _driver_dict(d)
