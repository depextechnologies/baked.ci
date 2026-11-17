"""Email + password credentials on the shared customer identity.

Registration verifies phone ownership (OTP) before any account is created or upgraded; email is marked
verified only after its own code is confirmed. Passwords use Argon2id; codes are stored hashed.
"""
from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core import mailer
from core.db import get_session
from core.deps import get_current_customer
from core.models import Customer, CustomerAuthCode, OtpChallenge
from core.providers.otp_provider import generate_code, get_otp_provider
from core.security import create_access_token
from core.serializers import customer_to_dict
from core.utils.rate_limit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth-password"])
_ph = PasswordHasher()
_DUMMY_HASH = _ph.hash("baked-dummy-password-for-timing")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
COMMON = {"123456789012", "password1234", "azertyuiop12", "qwertyuiop12", "motdepasse12", "000000000000", "111111111111", "abcdefghijkl", "1234567890ab"}
DEV = os.environ.get("BAKED_ENV", "development") != "production"


def _err(status: int, code: str, message: str):
    raise HTTPException(status, {"code": code, "message": message})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _hash_code(row_id: str, code: str) -> str:
    return hashlib.sha256(f"{row_id}:{code.strip()}".encode()).hexdigest()


def _check_password(pw: str) -> None:
    if len(pw) < 12:
        _err(422, "password_too_short", "Password must be at least 12 characters")
    if len(pw) > 256:
        _err(422, "password_too_long", "Password is too long")
    if pw.lower() in COMMON or len(set(pw)) < 4:
        _err(422, "password_too_common", "This password is too easy to guess")


async def _email_owner(session: AsyncSession, email: str) -> Optional[Customer]:
    return (await session.execute(select(Customer).where(func.lower(Customer.email) == email, Customer.deleted_at.is_(None)))).scalars().first()


async def _send_email_code(session: AsyncSession, customer: Customer, purpose: str, minutes: int) -> dict:
    code = generate_code(6)
    row = CustomerAuthCode(purpose=purpose, target=customer.email.lower(), customer_id=customer.id, expires_at=_now() + timedelta(minutes=minutes))
    session.add(row)
    await session.flush()
    row.code_hash = _hash_code(row.id, code)
    await session.commit()
    fr = (customer.locale or "fr").startswith("fr")
    subject = ("Votre code BAKED : " if fr else "Your BAKED code: ") + code
    what = {"email_verify": ("vérifier votre adresse e-mail", "verify your email address"), "password_reset": ("réinitialiser votre mot de passe", "reset your password")}[purpose]
    body = (f"<p>Votre code pour {what[0]} : <b style='font-size:22px'>{code}</b></p><p>Il expire dans {minutes} minutes. Ne le partagez avec personne.</p>" if fr
            else f"<p>Your code to {what[1]}: <b style='font-size:22px'>{code}</b></p><p>It expires in {minutes} minutes. Never share it.</p>")
    sent = mailer.is_configured() and await mailer.send_email_async(to=customer.email, subject=subject, html_body=body, text_body=f"{subject}")
    out = {"status": "sent" if sent else "unavailable"}
    if DEV:
        out["dev_code"] = code
    return out


async def _consume_code(session: AsyncSession, row: Optional[CustomerAuthCode], code: str) -> CustomerAuthCode:
    if not row or row.consumed or _aware(row.expires_at) < _now():
        _err(400, "code_expired", "Code expired. Request a new one.")
    if row.attempts >= 5:
        _err(429, "too_many_attempts", "Too many attempts. Request a new code.")
    await session.execute(update(CustomerAuthCode).where(CustomerAuthCode.id == row.id).values(attempts=CustomerAuthCode.attempts + 1))
    await session.commit()
    if not secrets.compare_digest(row.code_hash or "", _hash_code(row.id, code)):
        _err(400, "code_incorrect", "Incorrect code")
    row.consumed = True
    return row


def _token(customer: Customer) -> dict:
    return {"access_token": create_access_token(customer.id, role=customer.role), "token_type": "bearer", "customer": customer_to_dict(customer)}


# ---------------- Registration ----------------
class RegisterStartIn(BaseModel):
    first_name: str
    last_name: str
    country_code: str
    phone: str
    email: str
    password: str
    accept_terms: bool
    channel: Literal["sms", "whatsapp"] = "sms"


@router.post("/register/start")
async def register_start(payload: RegisterStartIn, request: Request, session: AsyncSession = Depends(get_session)):
    check_rate_limit(request, bucket="register-start", limit=10, per_seconds=3600)
    from core.utils.phone import to_e164
    first, last = " ".join(payload.first_name.split()), " ".join(payload.last_name.split())
    if not first or not last or len(first) > 60 or len(last) > 60:
        _err(422, "invalid_name", "First and last name are required")
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        _err(422, "invalid_email", "Enter a valid email address")
    _check_password(payload.password)
    if not payload.accept_terms:
        _err(422, "terms_required", "Please accept the Terms of Service and Privacy Policy")
    try:
        e164 = to_e164(payload.country_code, payload.phone)
    except Exception:  # noqa: BLE001
        _err(422, "invalid_phone", "Enter a valid phone number")
    if len(re.sub(r"\D", "", e164)) < 8:
        _err(422, "invalid_phone", "Enter a valid phone number")
    if payload.channel == "whatsapp":
        _err(400, "whatsapp_unavailable", "WhatsApp codes are not activated yet. Please use SMS.")
    phone_owner = (await session.execute(select(Customer).where(Customer.phone == e164, Customer.deleted_at.is_(None)))).scalars().first()
    if phone_owner and phone_owner.password_hash:
        _err(409, "account_exists", "An account with a password already exists for this number. Please log in.")
    email_owner = await _email_owner(session, email)
    if email_owner and (not phone_owner or email_owner.id != phone_owner.id):
        _err(409, "email_taken", "This email is already used by another account")

    code = generate_code(6)
    challenge = OtpChallenge(phone=e164, code=code, attempts=0, expires_at=_now() + timedelta(minutes=5))
    session.add(challenge)
    await session.flush()
    reg = CustomerAuthCode(purpose="register", target=e164, expires_at=_now() + timedelta(minutes=20), payload={
        "first_name": first, "last_name": last, "email": email, "password_hash": _ph.hash(payload.password), "challenge_id": challenge.id,
    })
    session.add(reg)
    await session.commit()
    delivery = await get_otp_provider().send_code(e164, code, locale=request.headers.get("X-BAKED-Language", "fr"))
    out = {"registration_id": reg.id, "challenge_id": challenge.id, "masked_phone": e164[:-4] + "****", "expires_in": 300, "existing_account": bool(phone_owner)}
    if DEV and delivery.get("dev_code"):
        out["dev_code"] = delivery["dev_code"]
    return out


class RegisterVerifyIn(BaseModel):
    registration_id: str
    code: str


@router.post("/register/verify")
async def register_verify(payload: RegisterVerifyIn, session: AsyncSession = Depends(get_session)):
    reg = await session.get(CustomerAuthCode, payload.registration_id)
    if not reg or reg.purpose != "register" or reg.consumed or _aware(reg.expires_at) < _now():
        _err(400, "registration_expired", "Registration expired. Please start again.")
    ch = await session.get(OtpChallenge, reg.payload.get("challenge_id"))
    if not ch or ch.consumed or _aware(ch.expires_at) < _now():
        _err(400, "code_expired", "Code expired. Request a new one.")
    if ch.attempts >= 5:
        _err(429, "too_many_attempts", "Too many attempts. Request a new code.")
    await session.execute(update(OtpChallenge).where(OtpChallenge.id == ch.id).values(attempts=OtpChallenge.attempts + 1))
    await session.commit()
    if payload.code.strip() != ch.code:
        _err(400, "code_incorrect", "Incorrect code")

    data = reg.payload
    customer = (await session.execute(select(Customer).where(Customer.phone == reg.target, Customer.deleted_at.is_(None)))).scalars().first()
    if customer and customer.password_hash:
        _err(409, "account_exists", "An account with a password already exists for this number. Please log in.")
    owner = await _email_owner(session, data["email"])
    if owner and (not customer or owner.id != customer.id):
        _err(409, "email_taken", "This email is already used by another account")
    if not customer:
        from shared.auth.routes import _find_or_create_customer_by_phone
        customer = await _find_or_create_customer_by_phone(session, reg.target)
    full = f'{data["first_name"]} {data["last_name"]}'
    customer.name = customer.name or full
    if (customer.email or "").lower() != data["email"]:
        customer.email, customer.email_verified_at = data["email"], None
    customer.password_hash = data["password_hash"]
    customer.verified = True
    customer.auth_providers = sorted(set(customer.auth_providers or []) | {"phone", "password"})
    customer.preferences = {**(customer.preferences or {}), "first_name": data["first_name"], "last_name": data["last_name"]}
    ch.consumed = True
    reg.consumed = True
    await session.commit()
    out = _token(customer)
    out["email_verification"] = "verified" if customer.email_verified_at else await _send_email_code(session, customer, "email_verify", 30)
    return out


# ---------------- Email verification ----------------
@router.post("/email/send-verification")
async def send_verification(request: Request, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)):
    check_rate_limit(request, bucket=f"email-verify:{customer.id}", limit=5, per_seconds=3600)
    if not customer.email:
        _err(400, "no_email", "Add an email address first")
    if customer.email_verified_at:
        return {"status": "verified"}
    return await _send_email_code(session, customer, "email_verify", 30)


class CodeIn(BaseModel):
    code: str


@router.post("/email/verify")
async def verify_email(payload: CodeIn, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)):
    if not customer.email:
        _err(400, "no_email", "Add an email address first")
    row = (await session.execute(select(CustomerAuthCode).where(
        CustomerAuthCode.purpose == "email_verify", CustomerAuthCode.customer_id == customer.id,
        CustomerAuthCode.target == customer.email.lower(), CustomerAuthCode.consumed.is_(False),
    ).order_by(CustomerAuthCode.created_at.desc()))).scalars().first()
    await _consume_code(session, row, payload.code)
    customer.email_verified_at = _now()
    await session.commit()
    return customer_to_dict(customer)


# ---------------- Email + password login ----------------
class EmailLoginIn(BaseModel):
    email: str
    password: str


@router.post("/login/email")
async def login_email(payload: EmailLoginIn, request: Request, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    check_rate_limit(request, bucket="login-email", limit=30, per_seconds=900)
    check_rate_limit(request, bucket=f"login-email:{email}", limit=6, per_seconds=900)
    customer = await _email_owner(session, email) if EMAIL_RE.match(email) else None
    try:
        _ph.verify(customer.password_hash if customer and customer.password_hash else _DUMMY_HASH, payload.password)
        ok = bool(customer and customer.password_hash)
    except (VerifyMismatchError, InvalidHashError):
        ok = False
    if not ok:
        _err(401, "invalid_credentials", "Incorrect email or password")
    if _ph.check_needs_rehash(customer.password_hash):
        customer.password_hash = _ph.hash(payload.password)
        await session.commit()
    return _token(customer)


# ---------------- Password recovery (verified emails only) ----------------
class ForgotIn(BaseModel):
    email: str


@router.post("/password/forgot")
async def forgot_password(payload: ForgotIn, request: Request, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    check_rate_limit(request, bucket="pw-forgot", limit=10, per_seconds=3600)
    out = {"status": "ok"}
    customer = await _email_owner(session, email) if EMAIL_RE.match(email) else None
    if customer and customer.password_hash and customer.email_verified_at:
        res = await _send_email_code(session, customer, "password_reset", 15)
        if DEV:
            out["dev_code"] = res.get("dev_code")
    return out


class ResetIn(BaseModel):
    email: str
    code: str
    new_password: str


@router.post("/password/reset")
async def reset_password(payload: ResetIn, request: Request, session: AsyncSession = Depends(get_session)):
    email = payload.email.strip().lower()
    check_rate_limit(request, bucket="pw-reset", limit=20, per_seconds=3600)
    _check_password(payload.new_password)
    row = (await session.execute(select(CustomerAuthCode).where(
        CustomerAuthCode.purpose == "password_reset", CustomerAuthCode.target == email, CustomerAuthCode.consumed.is_(False),
    ).order_by(CustomerAuthCode.created_at.desc()))).scalars().first()
    await _consume_code(session, row, payload.code)
    customer = await session.get(Customer, row.customer_id)
    customer.password_hash = _ph.hash(payload.new_password)
    await session.execute(update(CustomerAuthCode).where(CustomerAuthCode.purpose == "password_reset", CustomerAuthCode.target == email).values(consumed=True))
    await session.commit()
    return _token(customer)


class RegisterResendIn(BaseModel):
    registration_id: str


@router.post("/register/resend")
async def register_resend(payload: RegisterResendIn, request: Request, session: AsyncSession = Depends(get_session)):
    check_rate_limit(request, bucket="register-resend", limit=6, per_seconds=3600)
    reg = await session.get(CustomerAuthCode, payload.registration_id)
    if not reg or reg.purpose != "register" or reg.consumed or _aware(reg.expires_at) < _now():
        _err(400, "registration_expired", "Registration expired. Please start again.")
    code = generate_code(6)
    ch = OtpChallenge(phone=reg.target, code=code, attempts=0, expires_at=_now() + timedelta(minutes=5))
    session.add(ch)
    await session.flush()
    reg.payload = {**reg.payload, "challenge_id": ch.id}
    await session.commit()
    delivery = await get_otp_provider().send_code(reg.target, code, locale=request.headers.get("X-BAKED-Language", "fr"))
    out = {"challenge_id": ch.id, "masked_phone": reg.target[:-4] + "****"}
    if DEV and delivery.get("dev_code"):
        out["dev_code"] = delivery["dev_code"]
    return out
