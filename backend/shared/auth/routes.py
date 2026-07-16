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

from core.db import db
from core.models_base import _now_iso, new_id
from core.security import create_access_token
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


async def _find_or_create_customer_by_phone(e164_phone: str) -> dict:
    existing = await db.customers.find_one({"phone": e164_phone}, {"_id": 0})
    if existing:
        return existing
    now = _now_iso()
    doc = {
        "id": new_id("cust"),
        "phone": e164_phone,
        "email": None,
        "name": None,
        "picture": None,
        "role": "customer",
        "auth_providers": ["phone"],
        "country": "CI",
        "locale": "fr-CI",
        "verified": False,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "created_by": None,
        "updated_by": None,
        "version": 1,
    }
    await db.customers.insert_one(doc)
    await event_bus.publish(Events.CUSTOMER_REGISTERED, {"customer_id": doc["id"], "channel": "phone"})
    doc.pop("_id", None)
    return doc


async def _find_or_create_customer_by_google(email: str, name: str, picture: str) -> dict:
    existing = await db.customers.find_one({"email": email}, {"_id": 0})
    if existing:
        # merge google provider
        providers = list(set(existing.get("auth_providers", []) + ["google"]))
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": {"auth_providers": providers, "picture": picture or existing.get("picture"), "updated_at": _now_iso()}},
        )
        existing["auth_providers"] = providers
        return existing
    now = _now_iso()
    doc = {
        "id": new_id("cust"),
        "phone": None,
        "email": email,
        "name": name,
        "picture": picture,
        "role": "customer",
        "auth_providers": ["google"],
        "country": "CI",
        "locale": "fr-CI",
        "verified": True,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
        "created_by": None,
        "updated_by": None,
        "version": 1,
    }
    await db.customers.insert_one(doc)
    await event_bus.publish(Events.CUSTOMER_REGISTERED, {"customer_id": doc["id"], "channel": "google"})
    doc.pop("_id", None)
    return doc


# ---------- endpoints ----------
@router.post("/otp/request")
async def request_otp(payload: OtpRequestIn):
    e164 = _e164(payload.country_code, payload.phone)
    code = generate_code(6)
    now = datetime.now(timezone.utc)
    challenge = {
        "id": new_id("otp"),
        "phone": e164,
        "code": code,
        "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=OTP_TTL_SECONDS)).isoformat(),
        "consumed": False,
    }
    await db.otp_challenges.insert_one(challenge)
    provider = get_otp_provider()
    delivery = await provider.send_code(e164, code, locale="fr-CI")
    await event_bus.publish(Events.OTP_REQUESTED, {"phone": e164, "challenge_id": challenge["id"]})
    resp = {
        "challenge_id": challenge["id"],
        "expires_in": OTP_TTL_SECONDS,
        "masked_phone": e164[:-4] + "****",
    }
    # In dev environments surface the code so it can be used from the UI (never in prod).
    if BAKED_ENV != "production" and delivery.get("dev_code"):
        resp["dev_code"] = delivery["dev_code"]
    return resp


@router.post("/otp/verify")
async def verify_otp(payload: OtpVerifyIn):
    challenge = await db.otp_challenges.find_one({"id": payload.challenge_id}, {"_id": 0})
    if not challenge or challenge.get("consumed"):
        raise HTTPException(status_code=400, detail="Invalid or used challenge")
    expires_at = datetime.fromisoformat(challenge["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    if challenge["attempts"] >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts")
    await db.otp_challenges.update_one({"id": challenge["id"]}, {"$inc": {"attempts": 1}})
    if payload.code != challenge["code"]:
        raise HTTPException(status_code=400, detail="Incorrect code")

    customer = await _find_or_create_customer_by_phone(challenge["phone"])
    await db.customers.update_one({"id": customer["id"]}, {"$set": {"verified": True, "updated_at": _now_iso()}})
    customer["verified"] = True
    await db.otp_challenges.update_one({"id": challenge["id"]}, {"$set": {"consumed": True}})
    await event_bus.publish(Events.CUSTOMER_VERIFIED, {"customer_id": customer["id"]})

    token = create_access_token(customer["id"], role=customer.get("role", "customer"))
    return {"access_token": token, "token_type": "bearer", "customer": customer}


@router.post("/google/session")
async def google_session(payload: GoogleSessionIn, response: Response):
    """Exchange Emergent Google Auth session_id for an app session cookie + Bearer token."""
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    customer = await _find_or_create_customer_by_google(
        email=data["email"], name=data.get("name", ""), picture=data.get("picture", "")
    )
    session_token = data.get("session_token") or uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.customer_sessions.insert_one(
        {
            "id": new_id("sess"),
            "customer_id": customer["id"],
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": _now_iso(),
        }
    )
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    token = create_access_token(customer["id"], role=customer.get("role", "customer"))
    return {"access_token": token, "customer": customer}


@router.get("/me")
async def me(customer: dict = Depends(get_current_customer)):
    return customer


@router.post("/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.customer_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
