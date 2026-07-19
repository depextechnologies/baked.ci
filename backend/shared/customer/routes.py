"""Customer profile + addresses."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.models_base import _now_iso, new_id
from core.deps import get_current_customer

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


@router.get("/me")
async def get_me(customer: dict = Depends(get_current_customer)):
    return customer


@router.patch("/me")
async def update_me(payload: CustomerUpdate, customer: dict = Depends(get_current_customer)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = _now_iso()
    await db.customers.update_one({"id": customer["id"]}, {"$set": updates})
    return await db.customers.find_one({"id": customer["id"]}, {"_id": 0})


@router.get("/me/addresses")
async def list_addresses(customer: dict = Depends(get_current_customer)) -> List[dict]:
    return await db.customer_addresses.find(
        {"customer_id": customer["id"], "deleted_at": None}, {"_id": 0}
    ).to_list(50)


@router.post("/me/addresses")
async def create_address(payload: AddressIn, customer: dict = Depends(get_current_customer)):
    doc = payload.model_dump()
    doc.update(
        {
            "id": new_id("addr"),
            "customer_id": customer["id"],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "deleted_at": None,
            "version": 1,
        }
    )
    if payload.is_default:
        await db.customer_addresses.update_many(
            {"customer_id": customer["id"]}, {"$set": {"is_default": False}}
        )
    await db.customer_addresses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/me/addresses/{address_id}")
async def delete_address(address_id: str, customer: dict = Depends(get_current_customer)):
    r = await db.customer_addresses.update_one(
        {"id": address_id, "customer_id": customer["id"]},
        {"$set": {"deleted_at": _now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Address not found")
    return {"ok": True}


@router.patch("/me/addresses/{address_id}")
async def update_address(address_id: str, payload: AddressIn, customer: dict = Depends(get_current_customer)):
    exists = await db.customer_addresses.find_one({"id": address_id, "customer_id": customer["id"], "deleted_at": None}, {"_id": 0})
    if not exists:
        raise HTTPException(404, "Address not found")
    updates = payload.model_dump()
    updates["updated_at"] = _now_iso()
    if payload.is_default:
        await db.customer_addresses.update_many({"customer_id": customer["id"]}, {"$set": {"is_default": False}})
    await db.customer_addresses.update_one({"id": address_id}, {"$set": updates})
    return await db.customer_addresses.find_one({"id": address_id}, {"_id": 0})


# ---------- Preferences (settings screen) ----------
class PreferencesIn(BaseModel):
    push_notifications: Optional[bool] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    region: Optional[str] = None
    dark_mode: Optional[bool] = None
    marketing_opt_in: Optional[bool] = None


@router.get("/me/preferences")
async def get_prefs(customer: dict = Depends(get_current_customer)):
    prefs = customer.get("preferences") or {}
    defaults = {"push_notifications": True, "email_notifications": True, "sms_notifications": True, "language": customer.get("language") or "en", "currency": None, "region": customer.get("country") or "CI", "dark_mode": True, "marketing_opt_in": False}
    return {**defaults, **prefs}


@router.patch("/me/preferences")
async def set_prefs(payload: PreferencesIn, customer: dict = Depends(get_current_customer)):
    incoming = {k: v for k, v in payload.model_dump().items() if v is not None}
    prefs = {**(customer.get("preferences") or {}), **incoming}
    await db.customers.update_one({"id": customer["id"]}, {"$set": {"preferences": prefs, "updated_at": _now_iso()}})
    return prefs


@router.delete("/me")
async def delete_me(customer: dict = Depends(get_current_customer)):
    """GDPR: soft-delete the account and scrub PII."""
    await db.customers.update_one({"id": customer["id"]}, {"$set": {
        "deleted_at": _now_iso(),
        "email": None, "phone": None, "name": "Deleted user",
        "auth_providers": [], "updated_at": _now_iso(),
    }})
    return {"ok": True}


# ---------- Referrals ----------
def _make_ref_code(cid: str) -> str:
    import hashlib
    h = hashlib.sha256(cid.encode()).hexdigest().upper()
    # 6-char alphanumeric, letters + digits
    return "BAKED" + "".join(c for c in h if c.isalnum())[:4]


@router.get("/me/referrals")
async def my_referrals(customer: dict = Depends(get_current_customer)):
    code = customer.get("referral_code") or _make_ref_code(customer["id"])
    if not customer.get("referral_code"):
        await db.customers.update_one({"id": customer["id"]}, {"$set": {"referral_code": code}})
    friends_joined = await db.customers.count_documents({"referred_by": code, "deleted_at": None})
    total_earned = 0  # No auto-award in MVP
    pending = 0
    return {
        "referral_code": code,
        "referral_link": f"https://baked.app/join?ref={code}",
        "friends_joined": friends_joined,
        "total_earned": total_earned,
        "pending": pending,
        "reward_per_referral": 10,  # config-driven placeholder
        "currency": (customer.get("country") == "CI" and "XOF") or "GBP",
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
async def my_tickets(customer: dict = Depends(get_current_customer)):
    tickets = await db.support_tickets.find({"customer_id": customer["id"], "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    counts = {"open": 0, "in_progress": 0, "resolved": 0, "closed": 0}
    for t in tickets:
        counts[t.get("status", "open")] = counts.get(t.get("status", "open"), 0) + 1
    return {"tickets": tickets, "counts": counts}


@router.post("/me/tickets")
async def create_ticket(payload: TicketIn, customer: dict = Depends(get_current_customer)):
    if payload.category not in TICKET_CATEGORIES:
        raise HTTPException(400, f"Invalid category; expected one of {sorted(TICKET_CATEGORIES)}")
    doc = payload.model_dump()
    doc.update({
        "id": new_id("tkt"),
        "number": "TK" + new_id("").upper().replace("_", "")[:8],
        "customer_id": customer["id"],
        "status": "open",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "deleted_at": None,
        "version": 1,
    })
    await db.support_tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/me/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, customer: dict = Depends(get_current_customer)):
    t = await db.support_tickets.find_one({"id": ticket_id, "customer_id": customer["id"], "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    return t
