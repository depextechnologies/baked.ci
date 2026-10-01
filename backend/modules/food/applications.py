"""FOODbakēd — Restaurant Partner Onboarding (application wizard) + Admin Review.

Two authenticated surfaces:
  * `applicant_router`   (`/api/food/apply/*`) — the applicant portal at
    `/foodbaked/sellers`. Phone-first / email-first OTP signup, phone+OTP
    login, resumable wizard, document uploads, submit for review.
  * `apply_admin_router` (`/api/admin/food/applications/*`) — the super-admin
    queue at `/admin/modules/food/applications`. Approve / Reject / Request
    correction + individual document review.

Approval side-effects:
  1. Create `food_restaurants` row (idempotent via slug + country).
  2. Create shell `food_restaurant_partners` row (no password yet).
  3. Mint a `food_activation_tokens` row.
  4. Send welcome email with the activation URL.

Applicant JWT claim shape:  {sub: application_id, role: "food_applicant"}.

Security invariants (see tests/test_food_application_isolation.py):
  * Applicant token can ONLY touch its own application_id (403 otherwise).
  * Every applicant route resolves the application from the JWT — never
    from the URL — so ID substitution is impossible.
"""
from __future__ import annotations

import os
import re
import secrets
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, List

import jwt as _jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.mailer import send_email_async
from core.providers import object_storage
from core.providers.otp_provider import generate_code, get_otp_provider
from core.security import create_access_token, decode_token, hash_password
from shared.admin.routes import get_current_admin


applicant_router   = APIRouter(prefix="/food/apply",              tags=["food-apply"])
apply_admin_router = APIRouter(prefix="/admin/food/applications", tags=["food-apply-admin"])


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

APP_ENV        = os.environ.get("APP_ENV", "development").lower()
IS_PRODUCTION  = APP_ENV in ("prod", "production")
OTP_TTL_MIN    = 10
OTP_MAX_TRIES  = 5
ACTIVATION_TTL_HOURS = 72
JSON_STEPS = {1: "restaurant_details", 3: "timing", 4: "menu_cuisines"}   # steps stored as JSONB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mk_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _norm_phone(phone: str) -> str:
    p = re.sub(r"[^\d+]", "", phone or "")
    if not p:
        raise HTTPException(400, "Invalid phone")
    if not p.startswith("+"):
        raise HTTPException(400, "Phone must be in E.164 format (e.g. +2250700000000)")
    return p


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "restaurant"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _row_to_dict(row) -> dict:
    return {c: getattr(row, c) for c in row._mapping.keys()}


def _application_public(row) -> dict:
    return {
        "id": row.id,
        "applicant_name":  row.applicant_name,
        "applicant_email": row.applicant_email,
        "applicant_phone": row.applicant_phone,
        "email_verified":  row.email_verified,
        "phone_verified":  row.phone_verified,
        "country":         row.country,
        "status":          row.status,
        "current_step":    row.current_step,
        "restaurant_details": row.restaurant_details or {},
        "timing":              row.timing or {},
        "menu_cuisines":       row.menu_cuisines or {},
        "offers_reservations":           bool(getattr(row, "offers_reservations", False)),
        "reservations_seating_capacity": getattr(row, "reservations_seating_capacity", None),
        "submitted_at":       row.submitted_at.isoformat() if row.submitted_at else None,
        "reviewed_at":        row.reviewed_at.isoformat()  if row.reviewed_at  else None,
        "decision_notes":     row.decision_notes,
        "correction_notes":   row.correction_notes,
        "created_at":         row.created_at.isoformat() if row.created_at else None,
    }


def _doc_public(row) -> dict:
    return {
        "id": row.id, "doc_type": row.doc_type, "file_url": row.file_url,
        "file_name": row.file_name, "content_type": row.content_type,
        "size_bytes": row.size_bytes, "status": row.status,
        "rejection_reason": row.rejection_reason,
        "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    }


def _bank_public(row) -> dict:
    if not row: return None
    return {
        "country": row.country, "method": row.method,
        "bank_name": row.bank_name, "account_holder": row.account_holder,
        "details": row.details or {}, "verification_status": row.verification_status,
    }


# ---------------------------------------------------------------------------
# Applicant auth (phone-OTP login; email + phone OTP verification at signup)
# ---------------------------------------------------------------------------

def _make_applicant_token(application_id: str, phone: str, email: str) -> str:
    return create_access_token(
        application_id, role="food_applicant",
        extra={"phone": phone, "email": email},
    )


async def get_current_applicant(request: Request, session: AsyncSession = Depends(get_session)):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(auth[7:])
    except _jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    if payload.get("role") != "food_applicant":
        raise HTTPException(403, "Applicant only")
    app_id = payload.get("sub")
    row = (await session.execute(text(
        "SELECT * FROM food_partner_applications WHERE id = :id"
    ), {"id": app_id})).fetchone()
    if not row:
        raise HTTPException(401, "Application not found")
    return row


# ---------------------------------------------------------------------------
# OTP: request + verify (shared by signup + login)
# ---------------------------------------------------------------------------


class OtpRequestIn(BaseModel):
    channel: str = Field(..., pattern="^(phone|email)$")
    target:  str
    purpose: str = Field(..., pattern="^(signup_email|signup_phone|login_phone)$")


class OtpVerifyIn(BaseModel):
    channel: str
    target:  str
    purpose: str
    code:    str = Field(..., min_length=4, max_length=8)


async def _emit_otp(session: AsyncSession, channel: str, target: str, purpose: str,
                     locale: str = "fr") -> dict:
    code = generate_code(6)
    row_id = _mk_id("fpo")
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN)
    await session.execute(text("""
        INSERT INTO food_partner_otps (id, channel, target, purpose, code_hash, expires_at)
        VALUES (:id, :ch, :tg, :p, :h, :exp)
    """), {"id": row_id, "ch": channel, "tg": target, "p": purpose,
           "h": _hash_code(code), "exp": expires})
    await session.commit()

    # Deliver — SMS provider for phone / SMTP for email.
    if channel == "phone":
        provider = get_otp_provider()
        result = await provider.send_code(target, code, locale=locale)
    else:
        subject = "Votre code FOODbakēd" if locale.startswith("fr") else "Your FOODbakēd code"
        html = f"""
          <div style="font-family:system-ui;font-size:14px;color:#111">
            <p>Bonjour · Hello,</p>
            <p>Votre code de vérification FOODbakēd est · Your FOODbakēd verification code is:</p>
            <p style="font-size:28px;letter-spacing:.3em;font-weight:700;color:#00A651">{code}</p>
            <p>Ce code expire dans {OTP_TTL_MIN} minutes. · This code expires in {OTP_TTL_MIN} minutes.</p>
            <p style="color:#666;font-size:12px;margin-top:24px">Vous n'avez pas demandé ce code? Ignorez cet email. · Didn't request this? Ignore this email.</p>
          </div>
        """
        sent = await send_email_async(to=target, subject=subject, html_body=html,
                                      text_body=f"Votre code · Your code: {code}")
        result = {"delivered": bool(sent), "channel": "email-smtp"}

    resp = {"delivered": bool(result.get("delivered")), "channel": result.get("channel")}
    # Dev-hint ONLY when not in production.
    if not IS_PRODUCTION:
        resp["dev_code"] = code
    return resp


async def _verify_otp(session: AsyncSession, channel: str, target: str,
                      purpose: str, code: str) -> bool:
    row = (await session.execute(text("""
        SELECT * FROM food_partner_otps
        WHERE channel = :ch AND target = :tg AND purpose = :p
          AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
    """), {"ch": channel, "tg": target, "p": purpose})).fetchone()
    if not row:
        return False
    if row.tries >= OTP_MAX_TRIES:
        return False
    ok = row.code_hash == _hash_code(code)
    if ok:
        await session.execute(text(
            "UPDATE food_partner_otps SET consumed_at = now() WHERE id = :id"
        ), {"id": row.id})
        await session.commit()
    else:
        await session.execute(text(
            "UPDATE food_partner_otps SET tries = tries + 1 WHERE id = :id"
        ), {"id": row.id})
        await session.commit()
    return ok


@applicant_router.post("/otp/request")
async def request_otp(payload: OtpRequestIn, session: AsyncSession = Depends(get_session)):
    if payload.channel == "phone":
        target = _norm_phone(payload.target)
    else:
        target = payload.target.strip().lower()
        if "@" not in target:
            raise HTTPException(400, "Invalid email")
    return await _emit_otp(session, payload.channel, target, payload.purpose)


@applicant_router.post("/otp/verify")
async def verify_otp(payload: OtpVerifyIn, session: AsyncSession = Depends(get_session)):
    target = _norm_phone(payload.target) if payload.channel == "phone" else payload.target.strip().lower()
    ok = await _verify_otp(session, payload.channel, target, payload.purpose, payload.code)
    if not ok:
        raise HTTPException(400, "Code invalide ou expiré · Invalid or expired code")
    return {"verified": True}


# ---------------------------------------------------------------------------
# Signup + Login
# ---------------------------------------------------------------------------


class SignupIn(BaseModel):
    applicant_name:  Optional[str] = None
    email:           EmailStr
    phone:           str
    country:         str = Field(..., min_length=2, max_length=4)
    email_code:      str
    phone_code:      str


@applicant_router.post("/signup")
async def signup(payload: SignupIn, session: AsyncSession = Depends(get_session)):
    """After the applicant verified BOTH email + phone OTPs (verify-otp), create
    the draft application and mint an applicant JWT."""
    email = payload.email.lower()
    phone = _norm_phone(payload.phone)

    email_ok = await _verify_otp(session, "email", email, "signup_email", payload.email_code)
    phone_ok = await _verify_otp(session, "phone", phone, "signup_phone", payload.phone_code)
    if not (email_ok and phone_ok):
        raise HTTPException(400, "Vérification OTP requise · OTP verification required")

    # Reject if email or phone already applied
    dup = (await session.execute(text(
        "SELECT id, status FROM food_partner_applications WHERE LOWER(applicant_email) = :e OR applicant_phone = :p"
    ), {"e": email, "p": phone})).fetchone()
    if dup:
        raise HTTPException(409, "Une application existe déjà pour ces coordonnées · An application already exists for these details")

    app_id = _mk_id("fpa")
    await session.execute(text("""
        INSERT INTO food_partner_applications
            (id, applicant_name, applicant_email, applicant_phone,
             email_verified, phone_verified, country, status, current_step)
        VALUES (:id, :name, :email, :phone, TRUE, TRUE, :country, 'draft', 1)
    """), {"id": app_id, "name": payload.applicant_name, "email": email,
           "phone": phone, "country": payload.country.upper()})
    await session.commit()

    row = (await session.execute(text("SELECT * FROM food_partner_applications WHERE id = :id"),
                                  {"id": app_id})).fetchone()
    token = _make_applicant_token(app_id, phone, email)
    return {"access_token": token, "token_type": "bearer", "application": _application_public(row)}


class LoginRequestIn(BaseModel):
    phone: str


@applicant_router.post("/login/request-otp")
async def login_request(payload: LoginRequestIn, session: AsyncSession = Depends(get_session)):
    phone = _norm_phone(payload.phone)
    exists = (await session.execute(text(
        "SELECT 1 FROM food_partner_applications WHERE applicant_phone = :p"
    ), {"p": phone})).fetchone()
    if not exists:
        # Silent 200 to avoid enumeration attacks — return generic success.
        return {"delivered": False, "channel": "no-account"}
    return await _emit_otp(session, "phone", phone, "login_phone")


class LoginVerifyIn(BaseModel):
    phone: str
    code:  str


@applicant_router.post("/login/verify-otp")
async def login_verify(payload: LoginVerifyIn, session: AsyncSession = Depends(get_session)):
    phone = _norm_phone(payload.phone)
    ok = await _verify_otp(session, "phone", phone, "login_phone", payload.code)
    if not ok:
        raise HTTPException(400, "Code invalide · Invalid code")
    row = (await session.execute(text(
        "SELECT * FROM food_partner_applications WHERE applicant_phone = :p"
    ), {"p": phone})).fetchone()
    if not row:
        raise HTTPException(404, "Aucune application trouvée · No application found")
    token = _make_applicant_token(row.id, row.applicant_phone, row.applicant_email)
    return {"access_token": token, "token_type": "bearer", "application": _application_public(row)}


# ---------------------------------------------------------------------------
# Applicant self-service (wizard)
# ---------------------------------------------------------------------------


@applicant_router.get("/me")
async def me(app_row=Depends(get_current_applicant), session: AsyncSession = Depends(get_session)):
    return await _full_application(app_row.id, session)


async def _full_application(app_id: str, session: AsyncSession) -> dict:
    row  = (await session.execute(text("SELECT * FROM food_partner_applications WHERE id = :id"), {"id": app_id})).fetchone()
    docs = (await session.execute(text("SELECT * FROM food_application_documents WHERE application_id = :id ORDER BY sort_order, uploaded_at"), {"id": app_id})).fetchall()
    bank = (await session.execute(text("SELECT * FROM food_application_bank WHERE application_id = :id"), {"id": app_id})).fetchone()
    # Country doc requirements
    reqs = (await session.execute(text("""
        SELECT * FROM food_doc_requirements
        WHERE country_code = :c OR country_code = '*'
        ORDER BY sort_order
    """), {"c": row.country})).fetchall()
    return {
        "application": _application_public(row),
        "documents":   [_doc_public(d) for d in docs],
        "bank":        _bank_public(bank),
        "doc_requirements": [
            {"doc_type": r.doc_type, "label_en": r.label_en, "label_fr": r.label_fr,
             "is_required": r.is_required, "sort_order": r.sort_order}
            for r in reqs
        ],
    }


class StepIn(BaseModel):
    data: dict
    current_step: Optional[int] = None
    advance: bool = False  # True when Suivant/Next clicked


def _guard_editable(app_row):
    """Applicants can only save when the app is in a mutable state."""
    if app_row.status in ("approved", "under_review"):
        raise HTTPException(403, "Application is not editable in this state")


@applicant_router.put("/step/{step}")
async def save_step(step: int, payload: StepIn,
                    app_row=Depends(get_current_applicant),
                    session: AsyncSession = Depends(get_session)):
    if step not in (1, 3, 4):
        raise HTTPException(400, "This step doesn't accept structured data — use its dedicated endpoint")
    _guard_editable(app_row)
    field = JSON_STEPS[step]
    data = dict(payload.data or {})
    # Step 1 extras: reservations toggle lives inside restaurant_details but
    # we mirror it to dedicated columns so admin approval can propagate it
    # without JSON gymnastics.
    extra_sets: list[str] = []
    extra_params: dict[str, Any] = {}
    if step == 1:
        if "offers_reservations" in data:
            extra_sets.append("offers_reservations = :offers_reservations")
            extra_params["offers_reservations"] = bool(data.get("offers_reservations"))
        if "reservations_seating_capacity" in data:
            cap = data.get("reservations_seating_capacity")
            if cap in (None, ""):
                extra_params["reservations_seating_capacity"] = None
            else:
                try:
                    extra_params["reservations_seating_capacity"] = max(0, min(9999, int(cap)))
                except (TypeError, ValueError):
                    raise HTTPException(422, "reservations_seating_capacity must be an integer")
            extra_sets.append("reservations_seating_capacity = :reservations_seating_capacity")

    params = {"id": app_row.id, "data": _to_jsonb(data), **extra_params}
    sets = f"{field} = CAST(:data AS JSONB)"
    if extra_sets:
        sets += ", " + ", ".join(extra_sets)
    if payload.advance:
        sets += ", current_step = GREATEST(current_step, :next_step)"
        params["next_step"] = min(step + 1, 6)
    elif payload.current_step:
        sets += ", current_step = GREATEST(current_step, :cs)"
        params["cs"] = payload.current_step
    await session.execute(text(
        f"UPDATE food_partner_applications SET {sets}, updated_at = now() WHERE id = :id"
    ), params)
    await session.commit()
    return await _full_application(app_row.id, session)


class BankIn(BaseModel):
    method: str = Field(..., pattern="^(bank_account|mobile_money|upi|mixed)$")
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    details: dict = Field(default_factory=dict)
    advance: bool = False


@applicant_router.put("/bank")
async def save_bank(payload: BankIn,
                    app_row=Depends(get_current_applicant),
                    session: AsyncSession = Depends(get_session)):
    _guard_editable(app_row)
    # Upsert
    exists = (await session.execute(text(
        "SELECT 1 FROM food_application_bank WHERE application_id = :id"
    ), {"id": app_row.id})).fetchone()
    if exists:
        await session.execute(text("""
            UPDATE food_application_bank
               SET country = :c, method = :m, bank_name = :bn,
                   account_holder = :ah, details = CAST(:d AS JSONB), updated_at = now()
             WHERE application_id = :id
        """), {"id": app_row.id, "c": app_row.country, "m": payload.method,
               "bn": payload.bank_name, "ah": payload.account_holder,
               "d": _to_jsonb(payload.details)})
    else:
        await session.execute(text("""
            INSERT INTO food_application_bank
                (application_id, country, method, bank_name, account_holder, details)
            VALUES (:id, :c, :m, :bn, :ah, CAST(:d AS JSONB))
        """), {"id": app_row.id, "c": app_row.country, "m": payload.method,
               "bn": payload.bank_name, "ah": payload.account_holder,
               "d": _to_jsonb(payload.details)})
    if payload.advance:
        await session.execute(text(
            "UPDATE food_partner_applications SET current_step = GREATEST(current_step, 6), updated_at = now() WHERE id = :id"
        ), {"id": app_row.id})
    await session.commit()
    return await _full_application(app_row.id, session)


# ---------------------------------------------------------------------------
# Document uploads
# ---------------------------------------------------------------------------


_DOC_MAX_MB = 12
_DOC_ALLOWED = {
    "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp",
}


@applicant_router.post("/documents")
async def upload_document(
    doc_type: str = Query(..., min_length=2, max_length=48),
    file: UploadFile = File(...),
    app_row=Depends(get_current_applicant),
    session: AsyncSession = Depends(get_session),
):
    _guard_editable(app_row)
    ct = (file.content_type or "").lower()
    if ct not in _DOC_ALLOWED:
        raise HTTPException(400, "Format non supporté (PDF/PNG/JPG/WEBP)")
    data = await file.read()
    if len(data) > _DOC_MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"Fichier trop volumineux ({_DOC_MAX_MB} MB max)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() or "bin"
    ts  = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    safe_doc = re.sub(r"[^a-z0-9_]", "", doc_type.lower()) or "misc"
    key = f"{object_storage.APP_NAME}/food/applications/{app_row.id}/{safe_doc}_{ts}.{ext}"
    object_storage.put_object(key, data, ct)

    doc_id = _mk_id("fad")
    await session.execute(text("""
        INSERT INTO food_application_documents
            (id, application_id, doc_type, file_url, file_name, content_type, size_bytes, status)
        VALUES (:id, :aid, :dt, :url, :fn, :ct, :sz, 'pending')
    """), {"id": doc_id, "aid": app_row.id, "dt": safe_doc,
           "url": f"/api/food/apply/documents/{key}", "fn": file.filename,
           "ct": ct, "sz": len(data)})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_application_documents WHERE id = :id"), {"id": doc_id})).fetchone()
    return _doc_public(row)


@applicant_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str,
                          app_row=Depends(get_current_applicant),
                          session: AsyncSession = Depends(get_session)):
    _guard_editable(app_row)
    row = (await session.execute(text(
        "SELECT * FROM food_application_documents WHERE id = :d AND application_id = :a"
    ), {"d": doc_id, "a": app_row.id})).fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    await session.execute(text("DELETE FROM food_application_documents WHERE id = :d"), {"d": doc_id})
    await session.commit()
    return {"deleted": doc_id}


@applicant_router.get("/documents/{key:path}")
async def serve_document(key: str, request: Request,
                          session: AsyncSession = Depends(get_session)):
    """Serve an uploaded document. Only the applicant themself OR a super-admin
    may fetch — never anonymous. Enforced by JWT."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(auth[7:])
    except _jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")

    role = payload.get("role")
    if role not in ("food_applicant", "admin", "super_admin"):
        raise HTTPException(403, "Not allowed")

    if role == "food_applicant":
        # File key must live inside their own application folder.
        if f"/applications/{payload['sub']}/" not in f"/{key}/":
            raise HTTPException(403, "Cannot access this document")

    try:
        content, ct = object_storage.get_object(key)
    except Exception:
        raise HTTPException(404, "Not found")
    from fastapi.responses import Response
    return Response(content=content, media_type=ct)


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


@applicant_router.post("/submit")
async def submit(app_row=Depends(get_current_applicant),
                 session: AsyncSession = Depends(get_session)):
    if app_row.status not in ("draft", "needs_correction"):
        raise HTTPException(400, "Application already submitted")

    # Verify all required documents present.
    reqs = (await session.execute(text("""
        SELECT doc_type FROM food_doc_requirements
        WHERE (country_code = :c OR country_code = '*') AND is_required = TRUE
    """), {"c": app_row.country})).fetchall()
    required = {r.doc_type for r in reqs}
    have = (await session.execute(text(
        "SELECT DISTINCT doc_type FROM food_application_documents WHERE application_id = :id"
    ), {"id": app_row.id})).fetchall()
    have_set = {r.doc_type for r in have}
    missing = required - have_set
    if missing:
        raise HTTPException(400, f"Documents requis manquants · Missing required documents: {sorted(missing)}")

    # Minimum shape checks
    rd = app_row.restaurant_details or {}
    if not rd.get("name") or not rd.get("address"):
        raise HTTPException(400, "Nom et adresse du restaurant requis · Restaurant name & address required")
    bank = (await session.execute(text("SELECT 1 FROM food_application_bank WHERE application_id = :id"),
                                    {"id": app_row.id})).fetchone()
    if not bank:
        raise HTTPException(400, "Informations bancaires requises · Bank details required")

    await session.execute(text("""
        UPDATE food_partner_applications
           SET status = 'submitted', submitted_at = now(), updated_at = now(), correction_notes = NULL
         WHERE id = :id
    """), {"id": app_row.id})
    await session.commit()
    return await _full_application(app_row.id, session)


# ---------------------------------------------------------------------------
# Admin queue
# ---------------------------------------------------------------------------


class AdminReviewIn(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|request_correction|start_review)$")
    reason: Optional[str] = None
    notes:  Optional[str] = None


class AdminDocReviewIn(BaseModel):
    status: str = Field(..., pattern="^(pending|verified|rejected)$")
    rejection_reason: Optional[str] = None


@apply_admin_router.get("")
async def admin_list(
    status: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    where = []
    params: dict = {"limit": limit}
    if status:
        where.append("status = :status"); params["status"] = status
    if country:
        where.append("country = :country"); params["country"] = country.upper()
    if q:
        where.append("(LOWER(applicant_email) LIKE :q OR applicant_phone LIKE :q OR LOWER(applicant_name) LIKE :q OR (restaurant_details->>'name') ILIKE :q)")
        params["q"] = f"%{q.lower()}%"
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    res = await session.execute(text(
        f"SELECT * FROM food_partner_applications {clause} ORDER BY submitted_at DESC NULLS LAST, created_at DESC LIMIT :limit"
    ), params)
    return [_application_public(r) for r in res.fetchall()]


@apply_admin_router.get("/{app_id}")
async def admin_detail(app_id: str,
                        session: AsyncSession = Depends(get_session),
                        _admin=Depends(get_current_admin)):
    row = (await session.execute(text("SELECT * FROM food_partner_applications WHERE id = :id"),
                                  {"id": app_id})).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return await _full_application(app_id, session)


@apply_admin_router.patch("/{app_id}/documents/{doc_id}")
async def admin_review_document(app_id: str, doc_id: str, payload: AdminDocReviewIn,
                                 session: AsyncSession = Depends(get_session),
                                 admin=Depends(get_current_admin)):
    if payload.status == "rejected" and not payload.rejection_reason:
        raise HTTPException(400, "rejection_reason required")
    res = await session.execute(text("""
        UPDATE food_application_documents
           SET status = :s, rejection_reason = :r, reviewed_at = now(), reviewed_by = :by
         WHERE id = :d AND application_id = :a
         RETURNING *
    """), {"s": payload.status, "r": payload.rejection_reason,
           "by": admin.id, "d": doc_id, "a": app_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Document not found for this application")
    await session.commit()
    return _doc_public(row)


@apply_admin_router.patch("/{app_id}")
async def admin_review(app_id: str, payload: AdminReviewIn,
                        session: AsyncSession = Depends(get_session),
                        admin=Depends(get_current_admin)):
    row = (await session.execute(text("SELECT * FROM food_partner_applications WHERE id = :id"),
                                  {"id": app_id})).fetchone()
    if not row:
        raise HTTPException(404, "Not found")

    if payload.action == "start_review":
        if row.status not in ("submitted", "under_review"):
            raise HTTPException(400, "Application must be submitted to start review")
        await session.execute(text(
            "UPDATE food_partner_applications SET status = 'under_review', reviewed_by = :by, updated_at = now() WHERE id = :id"
        ), {"by": admin.id, "id": app_id})

    elif payload.action == "request_correction":
        if not payload.notes:
            raise HTTPException(400, "notes required for correction request")
        if row.status not in ("submitted", "under_review"):
            raise HTTPException(400, "Application not in a reviewable state")
        await session.execute(text("""
            UPDATE food_partner_applications
               SET status = 'needs_correction', correction_notes = :n,
                   reviewed_by = :by, reviewed_at = now(), updated_at = now()
             WHERE id = :id
        """), {"n": payload.notes, "by": admin.id, "id": app_id})

    elif payload.action == "reject":
        if not payload.reason:
            raise HTTPException(400, "reason required to reject")
        if row.status in ("approved",):
            raise HTTPException(400, "Cannot reject an approved application")
        await session.execute(text("""
            UPDATE food_partner_applications
               SET status = 'rejected', decision_notes = :n,
                   reviewed_by = :by, reviewed_at = now(), updated_at = now()
             WHERE id = :id
        """), {"n": payload.reason, "by": admin.id, "id": app_id})

    elif payload.action == "approve":
        if row.status == "approved":
            raise HTTPException(400, "Already approved")
        # ---- Create restaurant (idempotent by slug+country) ----
        rd = row.restaurant_details or {}
        rname = rd.get("name") or "Restaurant"
        slug = _slugify(rd.get("slug") or rname)
        rid = f"{re.sub(r'[^a-z0-9]+', '_', slug)}_{row.country.lower()}"
        existing = (await session.execute(text("SELECT id FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
        if not existing:
            await session.execute(text("""
                INSERT INTO food_restaurants
                    (id, name, slug, country, cuisines, rating, review_count,
                     prep_time_min, prep_time_max, delivery_fee, is_open, featured,
                     sort_order, image, status)
                VALUES
                    (:id, :name, :slug, :country, CAST(:cuisines AS JSONB), 0.0, 0,
                     :pmin, :pmax, 0, TRUE, FALSE, 100, :img, 'active')
            """), {
                "id": rid, "name": rname, "slug": slug, "country": row.country,
                "cuisines": _to_jsonb((row.menu_cuisines or {}).get("cuisines") or []),
                "pmin": (row.timing or {}).get("prep_time_min") or 20,
                "pmax": (row.timing or {}).get("prep_time_max") or 30,
                "img":  rd.get("cover_image") or "",
            })
        # ---- Reservations propagation ----
        # If applicant opted-in during onboarding, flip reservations_enabled
        # to TRUE, keep reservation_public FALSE until partner activates.
        if bool(getattr(row, "offers_reservations", False)):
            await session.execute(text(
                "UPDATE food_restaurants "
                "SET reservations_enabled = TRUE, reservation_public = FALSE "
                "WHERE id = :id"
            ), {"id": rid})
            # Seed default reservation settings (idempotent).
            import json as _json
            _default_hours = {
                "mon": [["12:00", "14:30"], ["19:00", "22:00"]],
                "tue": [["12:00", "14:30"], ["19:00", "22:00"]],
                "wed": [["12:00", "14:30"], ["19:00", "22:00"]],
                "thu": [["12:00", "14:30"], ["19:00", "22:00"]],
                "fri": [["12:00", "14:30"], ["19:00", "23:00"]],
                "sat": [["12:00", "14:30"], ["19:00", "23:00"]],
                "sun": [["12:00", "14:30"], ["19:00", "22:00"]],
            }
            _cap = int(getattr(row, "reservations_seating_capacity", 0) or 0) or 30
            await session.execute(text("""
                INSERT INTO food_reservation_settings
                    (restaurant_id, slot_capacity, min_party_size, max_party_size,
                     min_lead_time_minutes, slot_interval_minutes, advance_booking_days,
                     auto_confirm, hours, blackout_dates)
                VALUES
                    (:rid, :cap, 1, 12, 60, 30, 60, FALSE,
                     CAST(:hours AS JSONB), '[]'::jsonb)
                ON CONFLICT (restaurant_id) DO NOTHING
            """), {"rid": rid, "cap": _cap, "hours": _json.dumps(_default_hours)})
        # ---- Create shell partner ----
        pid = _mk_id("fp")
        await session.execute(text("""
            INSERT INTO food_restaurant_partners
                (id, restaurant_id, email, password_hash, name, is_active, application_id)
            VALUES (:id, :rid, :email, NULL, :name, TRUE, :aid)
        """), {"id": pid, "rid": rid, "email": row.applicant_email,
               "name": row.applicant_name, "aid": app_id})
        # ---- Activation token (72h) ----
        raw = secrets.token_urlsafe(32)
        tok_id = _mk_id("fat")
        await session.execute(text("""
            INSERT INTO food_activation_tokens (id, partner_id, token_hash, expires_at)
            VALUES (:id, :pid, :h, :exp)
        """), {"id": tok_id, "pid": pid, "h": _hash_code(raw),
               "exp": datetime.now(timezone.utc) + timedelta(hours=ACTIVATION_TTL_HOURS)})
        # ---- Update application ----
        await session.execute(text("""
            UPDATE food_partner_applications
               SET status = 'approved', decision_notes = :n,
                   reviewed_by = :by, reviewed_at = now(), updated_at = now(),
                   created_restaurant_id = :rid, created_partner_id = :pid
             WHERE id = :id
        """), {"n": payload.notes or "Approved", "by": admin.id, "id": app_id,
               "rid": rid, "pid": pid})
        await session.commit()

        # ---- Welcome email with activation link ----
        # Build an absolute URL so email clients render a real anchor.
        # In non-production we prefer the live preview origin so QA testers
        # can click through on the same cluster they are testing on.
        _env = (os.environ.get("APP_ENV") or "development").lower()
        if _env == "production":
            base = (
                os.environ.get("APP_BASE_URL")
                or os.environ.get("REACT_APP_BACKEND_URL")
                or "https://baked.ci"
            )
        else:
            base = (
                os.environ.get("REACT_APP_BACKEND_URL")
                or os.environ.get("APP_BASE_URL")
                or "https://baked.ci"
            )
        base = base.rstrip("/")
        activate_url = f"{base}/partner/food/activate?token={raw}"
        html = f"""
          <div style="font-family:system-ui;color:#111;max-width:560px">
            <h2 style="color:#00A651">Bienvenue chez FOODbakēd · Welcome to FOODbakēd</h2>
            <p>Bonjour {row.applicant_name or ''},</p>
            <p>Votre restaurant <b>{rname}</b> a été approuvé sur FOODbakēd. · Your restaurant has been approved.</p>
            <p>Pour commencer, définissez votre mot de passe partenaire · To get started, set your partner password:</p>
            <p><a href="{activate_url}" style="display:inline-block;padding:12px 20px;background:#00A651;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Activer mon compte · Activate my account</a></p>
            <p style="color:#666;font-size:12px">Le lien expire dans {ACTIVATION_TTL_HOURS} heures. · This link expires in {ACTIVATION_TTL_HOURS} hours.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
            <h3 style="font-size:14px;color:#111">Quickstart</h3>
            <ol style="font-size:13px;color:#333;line-height:1.6">
              <li>Activez votre compte via le lien ci-dessus · Activate your account</li>
              <li>Ajoutez vos sections de menu et vos plats · Add menu sections & items</li>
              <li>Basculez le statut "Ouvert" quand vous êtes prêt · Toggle "Open" when ready</li>
            </ol>
            <p style="color:#666;font-size:12px;margin-top:24px">Une question ? Répondez à cet e-mail. · Any question? Reply to this email.</p>
          </div>
        """
        await send_email_async(to=row.applicant_email,
                                subject="Bienvenue sur FOODbakēd · Welcome to FOODbakēd",
                                html_body=html)
        result = await _full_application(app_id, session)
        if not IS_PRODUCTION:
            result["_activation_url"] = activate_url  # for QA
        return result

    await session.commit()
    return await _full_application(app_id, session)


# ---------------------------------------------------------------------------
# Partner activation (post-approval set-password)
# ---------------------------------------------------------------------------


class ActivateIn(BaseModel):
    token:    str
    password: str = Field(..., min_length=8, max_length=128)


activation_router = APIRouter(prefix="/food/partner", tags=["food-partner"])


@activation_router.post("/activate")
async def activate(payload: ActivateIn, session: AsyncSession = Depends(get_session)):
    row = (await session.execute(text("""
        SELECT * FROM food_activation_tokens
         WHERE token_hash = :h AND consumed_at IS NULL AND expires_at > now()
    """), {"h": _hash_code(payload.token)})).fetchone()
    if not row:
        raise HTTPException(400, "Lien invalide ou expiré · Invalid or expired link")
    await session.execute(text("""
        UPDATE food_restaurant_partners
           SET password_hash = :ph, is_active = TRUE, updated_at = now()
         WHERE id = :pid
    """), {"ph": hash_password(payload.password), "pid": row.partner_id})
    await session.execute(text(
        "UPDATE food_activation_tokens SET consumed_at = now() WHERE id = :id"
    ), {"id": row.id})
    await session.commit()
    return {"activated": True}


# ---------------------------------------------------------------------------
# Public helpers (open)
# ---------------------------------------------------------------------------


public_apply_router = APIRouter(prefix="/food/apply", tags=["food-apply"])


@public_apply_router.get("/doc-requirements")
async def public_doc_requirements(country: str = Query(..., min_length=2, max_length=4),
                                    session: AsyncSession = Depends(get_session)):
    reqs = (await session.execute(text("""
        SELECT * FROM food_doc_requirements
        WHERE country_code = :c OR country_code = '*'
        ORDER BY sort_order
    """), {"c": country.upper()})).fetchall()
    return [
        {"doc_type": r.doc_type, "label_en": r.label_en, "label_fr": r.label_fr,
         "is_required": r.is_required, "sort_order": r.sort_order}
        for r in reqs
    ]


# ---------------------------------------------------------------------------
# JSON serialiser
# ---------------------------------------------------------------------------


def _to_jsonb(value: Any) -> str:
    import json
    return json.dumps(value if value is not None else {})
