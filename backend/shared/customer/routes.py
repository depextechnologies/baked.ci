"""Customer profile + addresses."""
import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from core.providers import object_storage
from core.providers.otp_provider import generate_code, get_otp_provider
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.i18n import t as _t, current_lang
from core.models import Country, Customer, CustomerAddress, OtpChallenge, Order, RewardEntry, SupportTicket, new_id
from core.serializers import customer_to_dict, row_to_dict

router = APIRouter(prefix="/customers", tags=["customer"])


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    locale: Optional[str] = None


class AddressIn(BaseModel):
    label: str = Field(..., examples=["Home", "Office"])
    line1: str
    line2: Optional[str] = None
    city: str
    country: str = "CI"
    landmark: Optional[str] = None
    instructions: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: bool = False
    # Google Places / rich-address fields (all optional so existing addresses stay compatible)
    place_id: Optional[str] = None
    formatted_address: Optional[str] = None
    region: Optional[str] = None
    postal_code: Optional[str] = None
    recipient_name: Optional[str] = Field(None, max_length=120)
    recipient_phone: Optional[str] = Field(None, max_length=32)


@router.get("/me")
async def get_me(customer: Customer = Depends(get_current_customer)):
    return customer_to_dict(customer)


@router.patch("/me")
async def update_me(
    payload: CustomerUpdate,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "name" in updates:
        updates["name"] = " ".join(updates["name"].split())
        if not 1 <= len(updates["name"]) <= 80:
            raise HTTPException(422, {"code": "invalid_name", "message": "Name must be 1–80 characters"})
    if "email" in updates:
        email = updates["email"].strip().lower()
        if not email:
            if not customer.phone:
                raise HTTPException(422, {"code": "email_required", "message": "Email is required for this account"})
            updates["email"] = None
        else:
            if len(email) > 254 or not _EMAIL_RE.match(email):
                raise HTTPException(422, {"code": "invalid_email", "message": "Enter a valid email address"})
            taken = (await session.execute(
                select(Customer.id).where(func.lower(Customer.email) == email, Customer.id != customer.id)
            )).first()
            if taken:
                raise HTTPException(409, {"code": "email_taken", "message": "This email is already used by another account"})
            updates["email"] = email
    for k, v in updates.items():
        setattr(customer, k, v)
    await session.commit()
    return customer_to_dict(customer)


# ---------- Profile photo ----------
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024


@router.post("/me/photo")
async def upload_photo(
    file: UploadFile = File(...),
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    ext = _PHOTO_TYPES.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(400, {"code": "invalid_photo_type", "message": "Photo must be JPG, PNG, WEBP or HEIC"})
    data = await file.read()
    if not data:
        raise HTTPException(400, {"code": "empty_photo", "message": "Empty file"})
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, {"code": "photo_too_large", "message": "Photo must be 5 MB or less"})
    key = f"{object_storage.APP_NAME}/avatars/{customer.id}/{uuid.uuid4().hex}.{ext}"
    try:
        object_storage.put_object(key, data, file.content_type)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, {"code": "upload_failed", "message": f"Upload failed: {e}"})
    customer.picture = f"/api/customers/photos/{key}"
    await session.commit()
    return customer_to_dict(customer)


@router.delete("/me/photo")
async def delete_photo(customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)):
    customer.picture = None
    await session.commit()
    return customer_to_dict(customer)


@router.get("/photos/{key:path}")
async def serve_photo(key: str):
    if not key.startswith(f"{object_storage.APP_NAME}/avatars/"):
        raise HTTPException(404, "Not found")
    try:
        content, ct = object_storage.get_object(key)
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "Not found")
    return Response(content=content, media_type=ct, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------- Phone change (SMS-verified) ----------
class PhoneChangeIn(BaseModel):
    country_code: str = Field(..., examples=["+225"])
    phone: str


class PhoneVerifyIn(BaseModel):
    challenge_id: str
    code: str


async def _phone_taken(session: AsyncSession, phone: str, customer_id: str) -> bool:
    return (await session.execute(select(Customer.id).where(Customer.phone == phone, Customer.id != customer_id))).first() is not None


@router.post("/me/phone/request")
async def request_phone_change(
    payload: PhoneChangeIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    from core.utils.phone import to_e164
    try:
        e164 = to_e164(payload.country_code, payload.phone)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, {"code": "invalid_phone", "message": "Enter a valid phone number"})
    if len(re.sub(r"\D", "", e164)) < 8:
        raise HTTPException(422, {"code": "invalid_phone", "message": "Enter a valid phone number"})
    if e164 == customer.phone:
        raise HTTPException(409, {"code": "same_phone", "message": "This is already your phone number"})
    if await _phone_taken(session, e164, customer.id):
        raise HTTPException(409, {"code": "phone_taken", "message": "This number is already used by another account"})
    recent = (await session.execute(select(func.count()).select_from(OtpChallenge).where(
        OtpChallenge.phone == e164, OtpChallenge.created_at > datetime.now(timezone.utc) - timedelta(minutes=10),
    ))).scalar_one()
    if recent >= 5:
        raise HTTPException(429, {"code": "too_many_requests", "message": "Too many codes requested. Try again later."})
    code = generate_code(6)
    challenge = OtpChallenge(phone=e164, code=code, attempts=0, expires_at=datetime.now(timezone.utc) + timedelta(seconds=180))
    session.add(challenge)
    await session.commit()
    delivery = await get_otp_provider().send_code(e164, code, locale=customer.locale or "fr-CI")
    resp = {"challenge_id": challenge.id, "expires_in": 180, "masked_phone": e164[:-4] + "****"}
    if os.environ.get("BAKED_ENV", "development") != "production" and delivery.get("dev_code"):
        resp["dev_code"] = delivery["dev_code"]
    return resp


@router.post("/me/phone/verify")
async def verify_phone_change(
    payload: PhoneVerifyIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    challenge = await session.get(OtpChallenge, payload.challenge_id)
    if not challenge or challenge.consumed:
        raise HTTPException(400, {"code": "challenge_invalid", "message": "Code expired. Request a new one."})
    expires_at = challenge.expires_at if challenge.expires_at.tzinfo else challenge.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, {"code": "otp_expired", "message": "Code expired. Request a new one."})
    if challenge.attempts >= 5:
        raise HTTPException(429, {"code": "otp_max_attempts", "message": "Too many attempts. Request a new code."})
    await session.execute(update(OtpChallenge).where(OtpChallenge.id == challenge.id).values(attempts=OtpChallenge.attempts + 1))
    await session.commit()
    if payload.code.strip() != challenge.code:
        raise HTTPException(400, {"code": "otp_incorrect", "message": "Incorrect code"})
    if await _phone_taken(session, challenge.phone, customer.id):
        raise HTTPException(409, {"code": "phone_taken", "message": "This number is already used by another account"})
    customer.phone = challenge.phone
    customer.auth_providers = sorted(set(customer.auth_providers or []) | {"phone"})
    challenge.consumed = True
    await session.commit()
    return customer_to_dict(customer)


@router.get("/me/addresses")
async def list_addresses(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
) -> List[dict]:
    rows = (
        (
            await session.execute(
                select(CustomerAddress).where(
                    CustomerAddress.customer_id == customer.id, CustomerAddress.deleted_at.is_(None)
                ).order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.post("/me/addresses")
async def create_address(
    payload: AddressIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    doc = payload.model_dump()
    doc["country"] = (doc.get("country") or "CI").upper()
    has_default = (await session.execute(
        select(func.count()).select_from(CustomerAddress).where(
            CustomerAddress.customer_id == customer.id, CustomerAddress.deleted_at.is_(None), CustomerAddress.is_default.is_(True))
    )).scalar_one()
    if not has_default:
        doc["is_default"] = True
    if doc["is_default"]:
        await session.execute(
            update(CustomerAddress).where(CustomerAddress.customer_id == customer.id).values(is_default=False)
        )
    address = CustomerAddress(**doc, customer_id=customer.id)
    session.add(address)
    await session.commit()
    return row_to_dict(address)


@router.delete("/me/addresses/{address_id}")
async def delete_address(
    address_id: str,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        update(CustomerAddress)
        .where(CustomerAddress.id == address_id, CustomerAddress.customer_id == customer.id,
               CustomerAddress.deleted_at.is_(None))
        .values(deleted_at=func.now())
    )
    if result.rowcount == 0:
        raise HTTPException(404, _t("errors.order.address_not_found", current_lang()))
    live = CustomerAddress.customer_id == customer.id, CustomerAddress.deleted_at.is_(None)
    has_default = (await session.execute(
        select(func.count()).select_from(CustomerAddress).where(*live, CustomerAddress.is_default.is_(True)))).scalar_one()
    if not has_default:
        nxt = (await session.execute(select(CustomerAddress).where(*live)
                                     .order_by(CustomerAddress.created_at.desc()).limit(1))).scalar_one_or_none()
        if nxt:
            nxt.is_default = True
    await session.commit()
    return {"ok": True}


@router.patch("/me/addresses/{address_id}")
async def update_address(
    address_id: str,
    payload: AddressIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    address = await session.get(CustomerAddress, address_id)
    if not address or address.customer_id != customer.id or address.deleted_at is not None:
        raise HTTPException(404, _t("errors.order.address_not_found", current_lang()))
    if payload.is_default:
        await session.execute(
            update(CustomerAddress).where(CustomerAddress.customer_id == customer.id).values(is_default=False)
        )
    updates = payload.model_dump()
    updates["country"] = (updates.get("country") or "CI").upper()
    for k, v in updates.items():
        setattr(address, k, v)
    await session.flush()
    has_default = (await session.execute(
        select(func.count()).select_from(CustomerAddress).where(
            CustomerAddress.customer_id == customer.id, CustomerAddress.deleted_at.is_(None), CustomerAddress.is_default.is_(True))
    )).scalar_one()
    if not has_default:  # a customer with addresses always keeps one default
        address.is_default = True
    await session.commit()
    return row_to_dict(address)


# ---------- Preferences (settings screen) ----------
class PreferencesIn(BaseModel):
    push_notifications: Optional[bool] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    region: Optional[str] = None
    dark_mode: Optional[bool] = None
    theme: Optional[str] = Field(None, pattern="^(dark|light|system)$")
    marketing_opt_in: Optional[bool] = None


@router.get("/me/preferences")
async def get_prefs(customer: Customer = Depends(get_current_customer)):
    prefs = customer.preferences or {}
    defaults = {
        "push_notifications": True,
        "email_notifications": True,
        "sms_notifications": True,
        "language": customer.locale or "en",
        "currency": None,
        "region": customer.country or "CI",
        "dark_mode": True,
        "marketing_opt_in": False,
    }
    return {**defaults, **prefs}


@router.patch("/me/preferences")
async def set_prefs(
    payload: PreferencesIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    incoming = {k: v for k, v in payload.model_dump().items() if v is not None}
    prefs = {**(customer.preferences or {}), **incoming}
    customer.preferences = prefs
    await session.commit()
    return prefs


@router.delete("/me")
async def delete_me(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    """GDPR: soft-delete the account and scrub PII."""
    customer.deleted_at = func.now()
    customer.email = None
    customer.phone = None
    customer.name = "Deleted user"
    customer.auth_providers = []
    await session.commit()
    return {"ok": True}


# ---------- Referrals ----------
def _make_ref_code(cid: str) -> str:
    h = hashlib.sha256(cid.encode()).hexdigest().upper()
    return "BAKED" + "".join(c for c in h if c.isalnum())[:4]


async def _country_currency(session: AsyncSession, country_code: Optional[str]) -> tuple[str, str]:
    """Look up (currency, symbol) from the countries table — never hardcode."""
    code = (country_code or "CI").upper()
    country = await session.get(Country, code)
    if not country:
        return "XOF", "CFA"
    return country.currency or "XOF", country.currency_symbol or "CFA"


@router.get("/me/referrals")
async def my_referrals(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    code = customer.referral_code or _make_ref_code(customer.id)
    if not customer.referral_code:
        customer.referral_code = code
        await session.commit()
    friends_joined = (
        await session.execute(
            select(func.count())
            .select_from(Customer)
            .where(Customer.referred_by_customer_id == customer.id, Customer.deleted_at.is_(None))
        )
    ).scalar_one()
    total_earned = 0  # No auto-award in MVP
    pending = 0
    currency, _ = await _country_currency(session, customer.country)
    return {
        "referral_code": code,
        "referral_link": f"https://baked.app/join?ref={code}",
        "friends_joined": friends_joined,
        "total_earned": total_earned,
        "pending": pending,
        "reward_per_referral": 10,  # config-driven placeholder
        "currency": currency,
        "validity_days": 30,
        "message": "Refer a friend! They join, you both get rewards when the program launches.",
    }


# ---------- Support Tickets ----------
TICKET_CATEGORIES = {"order", "delivery", "wallet", "payment", "property", "vehicle", "account", "other"}
TICKET_STATUSES = {"open", "in_progress", "resolved", "closed"}


class TicketIn(BaseModel):
    category: str = Field(..., description="One of: order, delivery, wallet, payment, property, vehicle, account, other")
    subject: str
    description: str
    priority: str = Field("normal", pattern="^(low|normal|high|urgent)$")
    order_id: Optional[str] = None
    attachment_url: Optional[str] = None


@router.get("/me/tickets")
async def my_tickets(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    rows = (
        (
            await session.execute(
                select(SupportTicket)
                .where(SupportTicket.customer_id == customer.id, SupportTicket.deleted_at.is_(None))
                .order_by(SupportTicket.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    tickets = [row_to_dict(t) for t in rows]
    counts = {"open": 0, "in_progress": 0, "resolved": 0, "closed": 0}
    for t in tickets:
        counts[t.get("status", "open")] = counts.get(t.get("status", "open"), 0) + 1
    return {"tickets": tickets, "counts": counts}


@router.post("/me/tickets")
async def create_ticket(
    payload: TicketIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    if payload.category not in TICKET_CATEGORIES:
        raise HTTPException(400, _t("errors.customer.invalid_ticket_category", current_lang(),
                                    allowed=", ".join(sorted(TICKET_CATEGORIES))))
    ticket = SupportTicket(
        **payload.model_dump(),
        number="TK" + new_id("").upper().replace("_", "")[:8],
        customer_id=customer.id,
        status="open",
    )
    session.add(ticket)
    await session.commit()
    return row_to_dict(ticket)


@router.get("/me/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket or ticket.customer_id != customer.id or ticket.deleted_at is not None:
        raise HTTPException(404, _t("errors.customer.ticket_not_found", current_lang()))
    return row_to_dict(ticket)


# ---------- Wallet (MVP: balance is 0, transactions derived from paid orders) ----------
@router.get("/me/wallet")
async def my_wallet(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    """MVP wallet: real 0.00 balance + informational transaction feed from paid orders.
    COD/paid-out-of-wallet orders are listed for completeness but do NOT reduce wallet balance.
    """
    orders = (
        (
            await session.execute(
                select(Order)
                .where(Order.customer_id == customer.id, Order.deleted_at.is_(None))
                .order_by(Order.created_at.desc())
                .limit(30)
            )
        )
        .scalars()
        .all()
    )

    module_icons = {"mart": "shopping-bag", "food": "utensils", "shop": "shopping-bag", "express": "truck", "auto": "car", "immo": "home"}
    txns = []
    for o in orders:
        txns.append({
            "id": f"txn_{o.id}",
            "type": "purchase",
            "kind": o.module or "mart",
            "icon": module_icons.get(o.module or "mart", "shopping-bag"),
            "label": f"{(o.module or 'mart').upper()}bakēd Order",
            "reference": o.number,
            "order_id": o.id,
            "amount": -float(o.total or 0),  # negative for spend
            "currency": o.currency,
            "settled_via": o.payment_method or "cod",
            "wallet_impact": 0.0,  # never reduces wallet in MVP (paid outside)
            "at": o.created_at.isoformat() if o.created_at else None,
            "status": o.status,
        })

    country_currency, country_symbol = await _country_currency(session, customer.country)
    return {
        "balance": 0.0,
        "currency": country_currency,
        "currency_symbol": country_symbol,
        "transactions": txns,
        "auto_topup": {"enabled": False, "trigger": 10, "amount": 20, "available": False, "message": "Coming soon"},
        "features": {
            "top_up": {"available": False, "message": "Coming soon"},
            "withdraw": {"available": False, "message": "Coming soon"},
            "refunds": {"available": False, "message": "Coming soon"},
        },
        "note": "Wallet balance is 0.00 — the wallet is not yet activated. Your paid orders appear here for reference and do not affect the balance.",
    }


# ---------- Rewards (MVP placeholder — points on customer row) ----------
@router.get("/me/rewards")
async def my_rewards(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    points = int(customer.reward_points or 0)
    country_currency, country_symbol = await _country_currency(session, customer.country)
    conversion_rate = 100  # 100 points = 1 unit of currency
    recent_rows = (
        (
            await session.execute(
                select(RewardEntry)
                .where(RewardEntry.customer_id == customer.id)
                .order_by(RewardEntry.created_at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    return {
        "points": points,
        "worth": round(points / conversion_rate, 2),
        "currency": country_currency,
        "currency_symbol": country_symbol,
        "earn_rate": 1,
        "conversion_rate": conversion_rate,
        "tiers": [
            {"points": 100, "worth": round(100 / conversion_rate, 2)},
            {"points": 500, "worth": round(500 / conversion_rate, 2)},
            {"points": 1000, "worth": round(1000 / conversion_rate, 2)},
        ],
        "recent": [row_to_dict(r) for r in recent_rows],
        "policies": ["Earn 1 point for every unit spent", "Redeem 100 points for 1 unit of discount", "No expiry during MVP"],
        "message": "Rewards are live — earn on every order and redeem at checkout.",
    }
