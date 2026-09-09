"""Shared Auth module — Unified Customer Identity.

Primary: Mobile + OTP.
Alternative: Google (self-hosted OAuth 2.0 via Google Identity Services),
             Email (stub for future).
Produces a single customer identity shared across all 6 BAKĒD business modules.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
import os
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from core.db import get_session
from core.models import Customer, CustomerSession, OtpChallenge
from core.security import create_access_token
from core.serializers import customer_to_dict
from core.providers.otp_provider import get_otp_provider, generate_code
from core.events import event_bus, Events
from core.deps import get_current_customer
from core.i18n import t as _t, current_lang

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_SECONDS = 180
BAKED_ENV = os.environ.get("BAKED_ENV", "development")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
# Empty in preview → host-only cookie for the responding domain.
# Set to `.baked.ci` in production → cookie shared across `baked.ci` and any
# future `*.baked.ci` subdomains (auth.baked.ci, admin.baked.ci, ...).
SESSION_COOKIE_DOMAIN = os.environ.get("SESSION_COOKIE_DOMAIN") or None


# ---------- DTOs ----------
class OtpRequestIn(BaseModel):
    country_code: str = Field(..., examples=["+225"])
    phone: str = Field(..., examples=["0102030405"])


class OtpVerifyIn(BaseModel):
    challenge_id: str
    code: str


class GoogleCredentialIn(BaseModel):
    # OAuth 2.0 authorization code returned by @react-oauth/google popup
    # (redirect_uri='postmessage'). Backend exchanges this for an id_token
    # with Google and then verifies it — never talks to any Emergent domain.
    code: str


# ---------- helpers ----------
def _e164(country_code: str, phone: str) -> str:
    """Thin wrapper around the shared `to_e164` util. Kept for backwards
    compatibility with call sites in this file."""
    from core.utils.phone import to_e164
    return to_e164(country_code, phone)


async def _find_or_create_customer_by_phone(session: AsyncSession, e164_phone: str) -> Customer:
    existing = (await session.execute(select(Customer).where(Customer.phone == e164_phone))).scalar_one_or_none()
    if existing:
        return existing
    customer = Customer(phone=e164_phone, role="customer", auth_providers=["phone"], country="CI", locale="fr-CI")
    session.add(customer)
    await session.flush()
    await event_bus.publish(Events.CUSTOMER_REGISTERED, {"customer_id": customer.id, "channel": "phone"})
    return customer


async def _find_or_create_customer_by_google(
    session: AsyncSession, email: str, name: str, picture: str
) -> Customer:
    existing = (await session.execute(select(Customer).where(Customer.email == email))).scalar_one_or_none()
    if existing:
        existing.auth_providers = sorted(set(existing.auth_providers or []) | {"google"})
        existing.picture = picture or existing.picture
        await session.flush()
        return existing
    customer = Customer(
        email=email,
        name=name,
        picture=picture,
        role="customer",
        auth_providers=["google"],
        country="CI",
        locale="fr-CI",
        verified=True,
    )
    session.add(customer)
    await session.flush()
    await event_bus.publish(Events.CUSTOMER_REGISTERED, {"customer_id": customer.id, "channel": "google"})
    return customer


# ---------- endpoints ----------
@router.post("/otp/request")
async def request_otp(payload: OtpRequestIn, session: AsyncSession = Depends(get_session)):
    e164 = _e164(payload.country_code, payload.phone)
    code = generate_code(6)
    now = datetime.now(timezone.utc)
    challenge = OtpChallenge(
        phone=e164, code=code, attempts=0, expires_at=now + timedelta(seconds=OTP_TTL_SECONDS)
    )
    session.add(challenge)
    await session.commit()
    provider = get_otp_provider()
    delivery = await provider.send_code(e164, code, locale="fr-CI")
    await event_bus.publish(Events.OTP_REQUESTED, {"phone": e164, "challenge_id": challenge.id})
    resp = {
        "challenge_id": challenge.id,
        "expires_in": OTP_TTL_SECONDS,
        "masked_phone": e164[:-4] + "****",
    }
    # In dev environments surface the code so it can be used from the UI (never in prod).
    if BAKED_ENV != "production" and delivery.get("dev_code"):
        resp["dev_code"] = delivery["dev_code"]
    return resp


@router.post("/otp/verify")
async def verify_otp(payload: OtpVerifyIn, session: AsyncSession = Depends(get_session)):
    challenge = await session.get(OtpChallenge, payload.challenge_id)
    if not challenge or challenge.consumed:
        raise HTTPException(status_code=400, detail=_t("errors.auth.challenge_invalid", current_lang()))
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail=_t("errors.auth.otp_expired", current_lang()))
    if challenge.attempts >= 5:
        raise HTTPException(status_code=429, detail=_t("errors.auth.otp_max_attempts", current_lang()))

    # Persist the attempt on its own, BEFORE checking the code — a wrong-code
    # exception below must not roll this back, or rate-limiting never triggers.
    await session.execute(
        update(OtpChallenge).where(OtpChallenge.id == challenge.id).values(attempts=OtpChallenge.attempts + 1)
    )
    await session.commit()

    if payload.code != challenge.code:
        raise HTTPException(status_code=400, detail=_t("errors.auth.otp_incorrect", current_lang()))

    customer = await _find_or_create_customer_by_phone(session, challenge.phone)
    customer.verified = True
    challenge.consumed = True
    await session.commit()

    await event_bus.publish(Events.CUSTOMER_VERIFIED, {"customer_id": customer.id})
    token = create_access_token(customer.id, role=customer.role)
    return {"access_token": token, "token_type": "bearer", "customer": customer_to_dict(customer)}


@router.post("/google/verify")
async def google_verify(
    payload: GoogleCredentialIn,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """Self-hosted Google Sign-In. Exchanges the OAuth 2.0 auth code from
    Google's popup for an ID token, verifies it, and either links or creates
    a customer. Fully white-label — never talks to any Emergent domain.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail=_t("errors.auth.google_not_configured", current_lang()))

    # Step 1 — Exchange the auth code with Google for tokens.
    # `redirect_uri='postmessage'` matches what @react-oauth/google's popup
    # uses; Google will only accept a matching value here.
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": payload.code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail=_t("errors.auth.google_exchange_failed", current_lang(), detail=r.text))
    tokens = r.json()
    id_token_str = tokens.get("id_token")
    if not id_token_str:
        raise HTTPException(status_code=401, detail=_t("errors.auth.google_no_id_token", current_lang()))

    # Step 2 — Verify the ID token signature + audience.
    try:
        info = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=_t("errors.auth.google_invalid_credential", current_lang(), detail=str(exc))) from exc

    email = info.get("email")
    if not email or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail=_t("errors.auth.google_email_unverified", current_lang()))

    # Step 3 — Find or create the customer, issue app JWT.
    customer = await _find_or_create_customer_by_google(
        session,
        email=email,
        name=info.get("name", ""),
        picture=info.get("picture", ""),
    )

    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session.add(CustomerSession(
        customer_id=customer.id, session_token=session_token, expires_at=expires_at,
    ))
    await session.commit()

    # Cookie is host-only in preview; in prod SESSION_COOKIE_DOMAIN=.baked.ci
    # shares it across baked.ci and any *.baked.ci subdomain.
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        domain=SESSION_COOKIE_DOMAIN,
    )
    access_token = create_access_token(customer.id, role=customer.role)
    return {"access_token": access_token, "customer": customer_to_dict(customer)}


@router.get("/me")
async def me(customer: Customer = Depends(get_current_customer)):
    return customer_to_dict(customer)


@router.post("/logout")
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    session_token = request.cookies.get("session_token")
    if session_token:
        await session.execute(delete(CustomerSession).where(CustomerSession.session_token == session_token))
        await session.commit()
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
