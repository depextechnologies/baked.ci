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
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, DRIVER_STATUSES, Driver, DriverEarning, DriverJob, DriverJobMessage,
    DriverOtp, DriverWithdrawal, KYC_STEPS, VEHICLE_TYPES, WITHDRAWAL_STATUSES,
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
async def driver_dashboard(driver: Driver = Depends(_current_driver),
                            session: AsyncSession = Depends(get_session)):
    """Slice-3-aware summary — today's earnings come from `driver_earnings`
    so the dashboard mirrors the wallet without a second network round-trip."""
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    todays = (await session.execute(
        select(DriverEarning).where(
            DriverEarning.driver_id == driver.id,
            DriverEarning.created_at >= start_today,
        )
    )).scalars().all()
    currency = _currency_for(driver.country)
    return {
        "driver": {"id": driver.id, "name": driver.name, "status": driver.status,
                   "is_online": driver.is_online, "kyc_step": driver.kyc_step,
                   "vehicle_type": driver.vehicle_type},
        "today": {
            "earnings": {
                "amount": round(sum(e.amount for e in todays), 2),
                "currency": currency,
                "trips":   sum(1 for e in todays if e.kind == "fare"),
                "hours_online": 0,
            },
            "acceptance_rate": None,
            "cancellation_rate": None,
        },
        "current_area": driver.current_area or ("New Delhi" if driver.country == "IN" else "Cocody, Abidjan"),
        "incentives": [],
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


# ===========================================================================
# Slice 2 — Delivery lifecycle
# ===========================================================================

def _job_dict(j: DriverJob) -> dict:
    return {
        "id": j.id, "status": j.status, "job_type": j.job_type,
        "customer_name": j.customer_name, "customer_phone": j.customer_phone,
        "pickup":  {"label": j.pickup_label,  "lat": j.pickup_lat,  "lng": j.pickup_lng},
        "dropoff": {"label": j.dropoff_label, "lat": j.dropoff_lat, "lng": j.dropoff_lng},
        "distance_km": j.distance_km,
        "fare": {"amount": j.fare_amount, "currency": j.fare_currency},
        # OTPs are surfaced to the driver so they can verify — in a real
        # deploy the customer's app would show them; the driver types them in.
        # For the mock we return both so QA can flow through end-to-end.
        "pickup_otp":   j.pickup_otp   if j.status in ("accepted", "arriving_pickup") else None,
        "delivery_otp": j.delivery_otp if j.status in ("picked_up", "arriving_dropoff") else None,
        "expires_at":   j.expires_at.isoformat()   if j.expires_at   else None,
        "offered_at":   j.offered_at.isoformat()   if j.offered_at   else None,
        "accepted_at":  j.accepted_at.isoformat()  if j.accepted_at  else None,
        "picked_up_at": j.picked_up_at.isoformat() if j.picked_up_at else None,
        "delivered_at": j.delivered_at.isoformat() if j.delivered_at else None,
        "share_token":  j.share_token,
    }


@router.get("/me/active-job")
async def get_active_job(
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    """Return the driver's currently in-flight job (if any).

    "In-flight" = status is anything other than a terminal state. If the
    offered job has expired since it was created, we quietly transition it
    to `expired` on the way out so the client never sees a stale offer.
    """
    j = (await session.execute(
        select(DriverJob).where(
            DriverJob.driver_id == driver.id,
            DriverJob.status.in_(("offered", "accepted", "arriving_pickup",
                                   "picked_up", "arriving_dropoff")),
        ).order_by(DriverJob.created_at.desc())
    )).scalars().first()
    if j and j.status == "offered" and j.expires_at and j.expires_at < datetime.now(timezone.utc):
        j.status = "expired"
        await session.commit()
        return None
    return _job_dict(j) if j else None


def _require_job(session, driver: Driver, job_id: str) -> DriverJob:
    """Sync helper used inside async routes — session.get is awaited by caller."""
    return None  # placeholder — real helpers below use awaited session.get


async def _load_job(session: AsyncSession, driver: Driver, job_id: str) -> DriverJob:
    j = await session.get(DriverJob, job_id)
    if not j or j.driver_id != driver.id:
        raise HTTPException(404, "Job not found")
    return j


def _txn_stamp(j: DriverJob, status: str, extra_col: Optional[str] = None):
    now = datetime.now(timezone.utc)
    j.status = status
    if extra_col:
        setattr(j, extra_col, now)


@router.post("/me/jobs/{job_id}/accept")
async def accept_job(job_id: str,
                     driver: Driver = Depends(_current_driver),
                     session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status != "offered":
        raise HTTPException(409, f"Cannot accept a job in status '{j.status}'")
    if j.expires_at and j.expires_at < datetime.now(timezone.utc):
        j.status = "expired"; await session.commit()
        raise HTTPException(409, {"code": "expired", "message": "This request has expired."})
    _txn_stamp(j, "accepted", "accepted_at")
    await session.commit(); return _job_dict(j)


class DeclineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Optional[str] = None


@router.post("/me/jobs/{job_id}/decline")
async def decline_job(job_id: str, payload: DeclineIn,
                      driver: Driver = Depends(_current_driver),
                      session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status != "offered":
        raise HTTPException(409, f"Cannot decline a job in status '{j.status}'")
    _txn_stamp(j, "declined")
    j.cancellation_reason = payload.reason
    await session.commit(); return _job_dict(j)


@router.post("/me/jobs/{job_id}/arrive-pickup")
async def arrive_pickup(job_id: str,
                        driver: Driver = Depends(_current_driver),
                        session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status != "accepted":
        raise HTTPException(409, f"Cannot arrive-pickup from status '{j.status}'")
    _txn_stamp(j, "arriving_pickup")
    await session.commit(); return _job_dict(j)


class VerifyOtpJobIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str


@router.post("/me/jobs/{job_id}/verify-pickup")
async def verify_pickup(job_id: str, payload: VerifyOtpJobIn,
                        driver: Driver = Depends(_current_driver),
                        session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status not in ("accepted", "arriving_pickup"):
        raise HTTPException(409, f"Cannot verify pickup from status '{j.status}'")
    if payload.code.strip() != j.pickup_otp:
        raise HTTPException(400, {"code": "otp_invalid", "message": "Pickup OTP is incorrect."})
    _txn_stamp(j, "picked_up", "picked_up_at")
    await session.commit(); return _job_dict(j)


@router.post("/me/jobs/{job_id}/arrive-dropoff")
async def arrive_dropoff(job_id: str,
                         driver: Driver = Depends(_current_driver),
                         session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status != "picked_up":
        raise HTTPException(409, f"Cannot arrive-dropoff from status '{j.status}'")
    _txn_stamp(j, "arriving_dropoff")
    await session.commit(); return _job_dict(j)


@router.post("/me/jobs/{job_id}/verify-delivery")
async def verify_delivery(job_id: str, payload: VerifyOtpJobIn,
                          driver: Driver = Depends(_current_driver),
                          session: AsyncSession = Depends(get_session)):
    j = await _load_job(session, driver, job_id)
    if j.status not in ("picked_up", "arriving_dropoff"):
        raise HTTPException(409, f"Cannot verify delivery from status '{j.status}'")
    if payload.code.strip() != j.delivery_otp:
        raise HTTPException(400, {"code": "otp_invalid", "message": "Delivery OTP is incorrect."})
    _txn_stamp(j, "delivered", "delivered_at")
    # Credit the wallet ledger. Unique (job_id, kind) index guarantees we
    # never double-credit if the client retries verify-delivery.
    existing = (await session.execute(
        select(DriverEarning).where(DriverEarning.job_id == j.id, DriverEarning.kind == "fare")
    )).scalars().first()
    if not existing:
        session.add(DriverEarning(
            driver_id=driver.id, job_id=j.id, kind="fare",
            amount=j.fare_amount, currency=j.fare_currency,
        ))
    await session.commit(); return _job_dict(j)


# ---------------------------------------------------------------------------
# Admin — one-click demo job dispatcher (used by QA to trigger Slice 2 flow)
# ---------------------------------------------------------------------------

_DEMO_JOB_TEMPLATES = {
    "IN": {
        "customer_name": "Ananya Verma", "customer_phone": "+919990001122",
        "pickup_label": "MARTbakēd Sector 18 Noida",
        "pickup_lat": 28.5691, "pickup_lng": 77.3210,
        "dropoff_label": "Sector 62, Noida",
        "dropoff_lat": 28.6272, "dropoff_lng": 77.3762,
        "distance_km": 8.4, "fare_amount": 156.0, "fare_currency": "INR",
    },
    "CI": {
        "customer_name": "Mariam Diallo", "customer_phone": "+22507070707",
        "pickup_label": "MARTbakēd Cocody",
        "pickup_lat": 5.3600, "pickup_lng": -4.0083,
        "dropoff_label": "Plateau, Abidjan",
        "dropoff_lat": 5.3197, "dropoff_lng": -4.0166,
        "distance_km": 6.2, "fare_amount": 2500.0, "fare_currency": "XOF",
    },
}


@admin_router.post("/{driver_id}/dispatch-demo-job")
async def admin_dispatch_demo_job(driver_id: str,
                                  admin: AdminUser = Depends(get_current_admin),
                                  session: AsyncSession = Depends(get_session)):
    """Insert a fake `offered` DriverJob for the target driver. Idempotency:
    if the driver already has an in-flight job we return that one instead of
    stacking offers."""
    d = await session.get(Driver, driver_id)
    if not d: raise HTTPException(404, "Driver not found")
    existing = (await session.execute(
        select(DriverJob).where(
            DriverJob.driver_id == d.id,
            DriverJob.status.in_(("offered", "accepted", "arriving_pickup",
                                   "picked_up", "arriving_dropoff")),
        )
    )).scalars().first()
    if existing: return _job_dict(existing)
    tpl = _DEMO_JOB_TEMPLATES.get(d.country, _DEMO_JOB_TEMPLATES["IN"])
    now = datetime.now(timezone.utc)
    j = DriverJob(
        driver_id=d.id, country=d.country, status="offered", job_type="parcel",
        pickup_otp=f"{random.randint(0, 999_999):06d}",
        delivery_otp=f"{random.randint(0, 999_999):06d}",
        offered_at=now, expires_at=now + timedelta(seconds=45),
        share_token=f"stk_{secrets.token_urlsafe(18)[:20]}",
        **tpl,
    )
    session.add(j)
    await session.commit(); await session.refresh(j)
    # Mocked SMS: print the customer's tracking link to the log so QA can
    # open it in another tab without a real SMS gateway.
    print(f"[send.track] job={j.id} → {tpl['customer_name']} track=/send/track/{j.id}?t={j.share_token}")
    return _job_dict(j)


# ===========================================================================
# Slice 3 — Wallet (earnings ledger + withdrawals)
# ===========================================================================

def _sum_since(session_rows, since: datetime) -> float:
    """Helper: sum earnings amount from an already-fetched list, since `since`."""
    return sum(e.amount for e in session_rows if e.created_at >= since)


def _earning_dict(e: DriverEarning) -> dict:
    return {
        "id": e.id, "job_id": e.job_id, "kind": e.kind,
        "amount": e.amount, "currency": e.currency, "note": e.note,
        "created_at": e.created_at.isoformat(),
    }


def _withdrawal_dict(w: DriverWithdrawal) -> dict:
    return {
        "id": w.id, "amount": w.amount, "currency": w.currency, "status": w.status,
        "bank": {"holder": w.bank_holder, "account": w.bank_account, "ifsc": w.bank_ifsc},
        "failure_note": w.failure_note,
        "requested_at": w.requested_at.isoformat(),
        "processed_at": w.processed_at.isoformat() if w.processed_at else None,
    }


@router.get("/me/earnings")
async def driver_earnings(driver: Driver = Depends(_current_driver),
                          session: AsyncSession = Depends(get_session)):
    """Wallet summary — today / this-week / this-month / all-time totals plus
    the last 30 ledger rows and pending-withdrawals count. `available_balance`
    = lifetime earnings - (paid + pending withdrawals) so a driver can't
    double-spend an in-flight request."""
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_week  = start_today - timedelta(days=start_today.weekday())
    start_month = start_today.replace(day=1)

    earnings = (await session.execute(
        select(DriverEarning).where(DriverEarning.driver_id == driver.id)
        .order_by(DriverEarning.created_at.desc())
    )).scalars().all()

    lifetime = sum(e.amount for e in earnings)
    withdrawals = (await session.execute(
        select(DriverWithdrawal).where(DriverWithdrawal.driver_id == driver.id)
        .order_by(DriverWithdrawal.requested_at.desc())
    )).scalars().all()
    locked = sum(w.amount for w in withdrawals if w.status in ("pending", "paid"))
    currency = earnings[0].currency if earnings else _currency_for(driver.country)

    return {
        "currency": currency,
        "available_balance": round(lifetime - locked, 2),
        "lifetime": round(lifetime, 2),
        "today":  {"amount": round(_sum_since(earnings, start_today), 2),
                    "trips": sum(1 for e in earnings if e.kind == "fare" and e.created_at >= start_today)},
        "week":   {"amount": round(_sum_since(earnings, start_week),  2),
                    "trips": sum(1 for e in earnings if e.kind == "fare" and e.created_at >= start_week)},
        "month":  {"amount": round(_sum_since(earnings, start_month), 2),
                    "trips": sum(1 for e in earnings if e.kind == "fare" and e.created_at >= start_month)},
        "recent": [_earning_dict(e) for e in earnings[:30]],
        "pending_withdrawal": next((_withdrawal_dict(w) for w in withdrawals if w.status == "pending"), None),
    }


class WithdrawIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., gt=0)


# Business rule: a driver in India can request payouts as small as ₹100; in
# CI the minimum is 1000 CFA. Keeps the operator's payout ops sane.
MIN_WITHDRAWAL = {"INR": 100.0, "XOF": 1000.0}


@router.post("/me/withdrawals")
async def request_withdrawal(payload: WithdrawIn,
                             driver: Driver = Depends(_current_driver),
                             session: AsyncSession = Depends(get_session)):
    if not driver.bank_account_number:
        raise HTTPException(409, {"code": "bank_missing",
                                  "message": "Add your bank details before requesting a payout."})
    # Reuse the summary logic so validation is authoritative.
    summary = await driver_earnings(driver=driver, session=session)
    currency = summary["currency"]
    minimum  = MIN_WITHDRAWAL.get(currency, 100.0)

    if summary["pending_withdrawal"]:
        raise HTTPException(409, {"code": "withdrawal_pending",
                                  "message": "You already have a pending payout — wait for it to clear."})
    if payload.amount < minimum:
        raise HTTPException(400, {"code": "below_minimum",
                                  "message": f"Minimum payout is {minimum:.0f} {currency}."})
    if payload.amount > summary["available_balance"]:
        raise HTTPException(400, {"code": "insufficient_balance",
                                  "message": "Requested amount exceeds available balance."})
    w = DriverWithdrawal(
        driver_id=driver.id, amount=round(payload.amount, 2), currency=currency,
        status="pending",
        bank_holder=driver.bank_account_holder,
        bank_account=driver.bank_account_number,   # already masked in _driver_dict, raw here for ops
        bank_ifsc=driver.bank_ifsc_or_swift,
    )
    session.add(w)
    await session.commit(); await session.refresh(w)
    return _withdrawal_dict(w)


@router.get("/me/withdrawals")
async def list_withdrawals(driver: Driver = Depends(_current_driver),
                           session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(
        select(DriverWithdrawal).where(DriverWithdrawal.driver_id == driver.id)
        .order_by(DriverWithdrawal.requested_at.desc())
    )).scalars().all()
    return {"items": [_withdrawal_dict(w) for w in rows]}



# ===========================================================================
# Slice 5 — Admin Payout Console
# ===========================================================================

def _withdrawal_admin_dict(w: DriverWithdrawal, d: Optional[Driver]) -> dict:
    """Same shape as the driver-facing dict + a `driver` sub-object so the
    ops table can render name/phone without a second round-trip."""
    def _mask(v: Optional[str]) -> Optional[str]:
        if not v: return v
        return v if len(v) <= 4 else "•" * (len(v) - 4) + v[-4:]
    return {
        "id": w.id, "amount": w.amount, "currency": w.currency, "status": w.status,
        "bank": {"holder": w.bank_holder, "account_masked": _mask(w.bank_account), "ifsc": w.bank_ifsc},
        "failure_note": w.failure_note,
        "requested_at": w.requested_at.isoformat(),
        "processed_at": w.processed_at.isoformat() if w.processed_at else None,
        "driver": None if not d else {
            "id": d.id, "name": d.name, "phone_e164": d.phone_e164, "country": d.country,
        },
    }


@admin_router.get("/withdrawals")
async def admin_list_withdrawals(
    status:  Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    q:       Optional[str] = Query(None, description="Fuzzy match on driver name/phone"),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = (select(DriverWithdrawal, Driver)
            .join(Driver, Driver.id == DriverWithdrawal.driver_id)
            .order_by(DriverWithdrawal.requested_at.desc()))
    if status:  stmt = stmt.where(DriverWithdrawal.status == status)
    if country: stmt = stmt.where(Driver.country == country.upper())
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Driver.name.ilike(like)) | (Driver.phone_e164.ilike(like)))
    rows = (await session.execute(stmt)).all()
    items = [_withdrawal_admin_dict(w, d) for (w, d) in rows]

    # Buckets over the un-filtered set so the tab counts stay stable when the
    # operator filters by country/q.
    bstmt = select(DriverWithdrawal.status, func.count(DriverWithdrawal.id)).group_by(DriverWithdrawal.status)
    buckets = {s: 0 for s in WITHDRAWAL_STATUSES}
    for s, c in (await session.execute(bstmt)).all():
        buckets[s] = c

    # Sum of pending payouts per currency — surfaced as an ops KPI card.
    kstmt = (select(DriverWithdrawal.currency, func.coalesce(func.sum(DriverWithdrawal.amount), 0))
             .where(DriverWithdrawal.status == "pending")
             .group_by(DriverWithdrawal.currency))
    pending_totals = {c: float(t) for c, t in (await session.execute(kstmt)).all()}

    return {"items": items, "buckets": buckets, "pending_totals": pending_totals}


class MarkFailedIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: Optional[str] = None


async def _load_withdrawal(session: AsyncSession, wid: str) -> DriverWithdrawal:
    w = await session.get(DriverWithdrawal, wid)
    if not w: raise HTTPException(404, "Withdrawal not found")
    return w


@admin_router.post("/withdrawals/{withdrawal_id}/mark-paid")
async def admin_mark_paid(
    withdrawal_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    w = await _load_withdrawal(session, withdrawal_id)
    if w.status != "pending":
        raise HTTPException(409, f"Cannot mark {w.status} withdrawal as paid")
    w.status = "paid"
    w.processed_at = datetime.now(timezone.utc)
    w.failure_note = None
    await session.commit()
    d = await session.get(Driver, w.driver_id)
    return _withdrawal_admin_dict(w, d)


@admin_router.post("/withdrawals/{withdrawal_id}/mark-failed")
async def admin_mark_failed(
    withdrawal_id: str,
    payload: MarkFailedIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    w = await _load_withdrawal(session, withdrawal_id)
    if w.status != "pending":
        raise HTTPException(409, f"Cannot mark {w.status} withdrawal as failed")
    w.status = "failed"
    w.processed_at = datetime.now(timezone.utc)
    w.failure_note = (payload.note or "").strip() or None
    await session.commit()
    d = await session.get(Driver, w.driver_id)
    return _withdrawal_admin_dict(w, d)


# ===========================================================================
# Slice 6 — In-ride chat
# ===========================================================================

# A closed set of quick presets per side. Free-text is still allowed, but the
# UX pushes users toward presets so translations are trivial and moderation
# is a non-issue. `preset_key` on the message row is null for free-text.
DRIVER_PRESETS = {
    "arriving_soon":   "I'm 2 minutes away.",
    "at_gate":         "I'm at the gate.",
    "downstairs":      "I'm downstairs.",
    "please_confirm":  "Can you confirm the address?",
    "traffic":         "Slight traffic — running a few minutes late.",
}

CUSTOMER_PRESETS = {
    "come_to_gate_b":  "Please come to Gate B.",
    "coming_down":     "Coming down now.",
    "leave_at_door":   "Please leave it at the door.",
    "call_me":         "Please call me on arrival.",
    "thanks":          "Thanks!",
}

# Chat is only meaningful while the job is in-flight. Terminal states seal
# the log for the ops record.
CHAT_OPEN_STATUSES = ("offered", "accepted", "arriving_pickup", "picked_up", "arriving_dropoff")


class ChatSendIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preset_key: Optional[str] = None
    text:       Optional[str] = None


def _msg_dict(m: DriverJobMessage) -> dict:
    return {
        "id": m.id, "sender": m.sender, "preset_key": m.preset_key,
        "text": m.text, "created_at": m.created_at.isoformat(),
    }


def _resolve_preset(sender: str, payload: ChatSendIn) -> tuple[Optional[str], str]:
    """Returns (preset_key, resolved_text). Presets always win over free
    text so a client can send just `preset_key` and we canonicalise the
    label server-side."""
    presets = DRIVER_PRESETS if sender == "driver" else CUSTOMER_PRESETS
    if payload.preset_key:
        if payload.preset_key not in presets:
            raise HTTPException(400, {"code": "unknown_preset",
                                      "message": f"Unknown preset '{payload.preset_key}'."})
        return payload.preset_key, presets[payload.preset_key]
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(400, {"code": "empty_message",
                                  "message": "Provide a preset_key or non-empty text."})
    if len(text) > 500:
        raise HTTPException(400, {"code": "message_too_long",
                                  "message": "Messages must be 500 characters or less."})
    return None, text


async def _fetch_messages(session: AsyncSession, job_id: str, after: Optional[str]) -> list[DriverJobMessage]:
    stmt = (select(DriverJobMessage)
            .where(DriverJobMessage.job_id == job_id)
            .order_by(DriverJobMessage.created_at.asc()))
    if after:
        # after = ISO timestamp; used for lightweight incremental polling
        try:
            cutoff = datetime.fromisoformat(after.replace("Z", "+00:00"))
            stmt = stmt.where(DriverJobMessage.created_at > cutoff)
        except Exception:
            pass  # bad `after` → return everything
    return (await session.execute(stmt)).scalars().all()


# ---- Driver side ---------------------------------------------------------

@router.get("/me/jobs/{job_id}/messages")
async def driver_list_messages(
    job_id: str,
    after: Optional[str] = Query(None),
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    j = await _load_job(session, driver, job_id)   # ownership + 404
    msgs = await _fetch_messages(session, j.id, after)
    return {
        "items": [_msg_dict(m) for m in msgs],
        "presets": DRIVER_PRESETS,
        "job_status": j.status,
    }


@router.post("/me/jobs/{job_id}/messages")
async def driver_send_message(
    job_id: str,
    payload: ChatSendIn,
    driver: Driver = Depends(_current_driver),
    session: AsyncSession = Depends(get_session),
):
    j = await _load_job(session, driver, job_id)
    if j.status not in CHAT_OPEN_STATUSES:
        raise HTTPException(409, {"code": "chat_closed",
                                  "message": f"Chat is closed for '{j.status}' jobs."})
    preset_key, text = _resolve_preset("driver", payload)
    m = DriverJobMessage(job_id=j.id, sender="driver", preset_key=preset_key, text=text)
    session.add(m)
    await session.commit(); await session.refresh(m)
    return _msg_dict(m)


# ---- Public customer-tracking side ---------------------------------------

track_router = APIRouter(prefix="/send/track", tags=["send-track"])


async def _load_by_share(session: AsyncSession, job_id: str, token: str) -> DriverJob:
    if not token:
        raise HTTPException(401, "Tracking token required")
    j = await session.get(DriverJob, job_id)
    if not j or not j.share_token or j.share_token != token:
        raise HTTPException(404, "Job not found")
    return j


def _public_job_dict(j: DriverJob, driver: Optional[Driver]) -> dict:
    """Safe subset for the customer — no OTPs, no driver phone unless
    accepted, no bank details anywhere."""
    return {
        "id": j.id, "status": j.status,
        "customer_name": j.customer_name,
        "pickup":  {"label": j.pickup_label,  "lat": j.pickup_lat,  "lng": j.pickup_lng},
        "dropoff": {"label": j.dropoff_label, "lat": j.dropoff_lat, "lng": j.dropoff_lng},
        "distance_km": j.distance_km,
        "fare": {"amount": j.fare_amount, "currency": j.fare_currency},
        "driver": None if not driver or j.status not in CHAT_OPEN_STATUSES else {
            "name": driver.name, "phone_e164": driver.phone_e164,
            "vehicle_type": driver.vehicle_type, "vehicle_plate": driver.vehicle_plate,
            "current_lat": driver.current_lat, "current_lng": driver.current_lng,
        },
        "accepted_at":  j.accepted_at.isoformat()  if j.accepted_at  else None,
        "picked_up_at": j.picked_up_at.isoformat() if j.picked_up_at else None,
        "delivered_at": j.delivered_at.isoformat() if j.delivered_at else None,
    }


@track_router.get("/{job_id}")
async def track_job(
    job_id: str,
    t: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    j = await _load_by_share(session, job_id, t)
    d = await session.get(Driver, j.driver_id) if j.driver_id else None
    return _public_job_dict(j, d)


@track_router.get("/{job_id}/messages")
async def track_list_messages(
    job_id: str,
    t: str = Query(...),
    after: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    j = await _load_by_share(session, job_id, t)
    msgs = await _fetch_messages(session, j.id, after)
    return {
        "items": [_msg_dict(m) for m in msgs],
        "presets": CUSTOMER_PRESETS,
        "job_status": j.status,
    }


@track_router.post("/{job_id}/messages")
async def track_send_message(
    job_id: str,
    payload: ChatSendIn,
    t: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    j = await _load_by_share(session, job_id, t)
    if j.status not in CHAT_OPEN_STATUSES:
        raise HTTPException(409, {"code": "chat_closed",
                                  "message": f"Chat is closed for '{j.status}' jobs."})
    preset_key, text = _resolve_preset("customer", payload)
    m = DriverJobMessage(job_id=j.id, sender="customer", preset_key=preset_key, text=text)
    session.add(m)
    await session.commit(); await session.refresh(m)
    return _msg_dict(m)

