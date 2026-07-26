"""Shared Auth module — Unified Customer Identity.

Primary: Mobile + OTP.
Alternative: Google (Emergent-managed), Email (stub for future).
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

from core.db import get_session
from core.models import Customer, CustomerSession, OtpChallenge
from core.security import create_access_token
from core.serializers import customer_to_dict
from core.providers.otp_provider import get_otp_provider, generate_code
from core.events import event_bus, Events
from core.deps import get_current_customer

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_SECONDS = 180
BAKED_ENV = os.environ.get("BAKED_ENV", "development")
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


# ---------- DTOs ----------
class OtpRequestIn(BaseModel):
    country_code: str = Field(..., examples=["+225"])
    phone: str = Field(..., examples=["0102030405"])


class OtpVerifyIn(BaseModel):
    challenge_id: str
    code: str


class GoogleSessionIn(BaseModel):
    session_id: str


# ---------- helpers ----------
def _e164(country_code: str, phone: str) -> str:
    cc = country_code.strip()
    if not cc.startswith("+"):
        cc = "+" + cc
    digits = "".join(ch for ch in phone if ch.isdigit()).lstrip("0")
    return f"{cc}{digits}"


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
        raise HTTPException(status_code=400, detail="Invalid or used challenge")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    if challenge.attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts")

    # Persist the attempt on its own, BEFORE checking the code — a wrong-code
    # exception below must not roll this back, or rate-limiting never triggers.
    await session.execute(
        update(OtpChallenge).where(OtpChallenge.id == challenge.id).values(attempts=OtpChallenge.attempts + 1)
    )
    await session.commit()

    if payload.code != challenge.code:
        raise HTTPException(status_code=400, detail="Incorrect code")

    customer = await _find_or_create_customer_by_phone(session, challenge.phone)
    customer.verified = True
    challenge.consumed = True
    await session.commit()

    await event_bus.publish(Events.CUSTOMER_VERIFIED, {"customer_id": customer.id})
    token = create_access_token(customer.id, role=customer.role)
    return {"access_token": token, "token_type": "bearer", "customer": customer_to_dict(customer)}


@router.post("/google/session")
async def google_session(payload: GoogleSessionIn, response: Response, session: AsyncSession = Depends(get_session)):
    """Exchange Emergent Google Auth session_id for an app session cookie + Bearer token."""
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    customer = await _find_or_create_customer_by_google(
        session, email=data["email"], name=data.get("name", ""), picture=data.get("picture", "")
    )
    session_token = data.get("session_token") or uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session.add(CustomerSession(customer_id=customer.id, session_token=session_token, expires_at=expires_at))
    await session.commit()
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    token = create_access_token(customer.id, role=customer.role)
    return {"access_token": token, "customer": customer_to_dict(customer)}


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
