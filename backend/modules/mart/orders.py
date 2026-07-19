"""MARTbakēd Checkout & Orders.

Flow:
  1. GET  /delivery-slots?country=CI          — upcoming windows
  2. GET  /payment-methods?country=CI         — enabled providers
  3. POST /orders                             — create order from active cart
  4. GET  /orders/me                          — customer's orders
  5. GET  /orders/:id                         — order detail
  6. POST /orders/:id/cancel                  — cancel while pending

Events: OrderCreated → PaymentCompleted / PaymentFailed → OrderUpdated
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.db import db
from core.deps import get_current_customer
from core.models_base import _now_iso, new_id
from core.events import event_bus, Events
from core.providers.payment_provider import get_payment_provider, list_payment_methods
from core.config import get_country_config
from .cart_rules import check_order_eligibility

router = APIRouter(tags=["orders"])


# ---------- delivery slots ----------
@router.get("/mart/delivery-slots")
async def delivery_slots(country: str = Query("CI"), days: int = Query(2, ge=1, le=7)) -> list[dict]:
    """Return today + next `days` upcoming windows in the country's timezone."""
    now = datetime.now(timezone.utc)
    slots: list[dict] = []
    windows = [(0, 30, "ASAP"), (30, 60, "30-60 min"), (60, 90, "1-1.5 h"), (90, 150, "1.5-2.5 h")]
    for i, (a, b, label) in enumerate(windows):
        start = now + timedelta(minutes=a)
        end = now + timedelta(minutes=b)
        slots.append({
            "id": f"slot_{country}_{i}",
            "label": label,
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "kind": "asap" if i == 0 else "scheduled",
        })
    # future days
    for d in range(1, days + 1):
        base = (now + timedelta(days=d)).replace(hour=9, minute=0, second=0, microsecond=0)
        for h in (9, 12, 15, 18):
            s = base.replace(hour=h)
            e = s + timedelta(hours=2)
            slots.append({
                "id": f"slot_{country}_d{d}_h{h}",
                "label": f"{s.strftime('%a %H:%M')} - {e.strftime('%H:%M')}",
                "start_at": s.isoformat(),
                "end_at": e.isoformat(),
                "kind": "scheduled",
            })
    return slots


@router.get("/mart/payment-methods")
async def payment_methods(country: str = Query("CI")):
    return list_payment_methods()


@router.get("/mart/cart/eligibility")
async def cart_eligibility(customer: dict = Depends(get_current_customer), use_points: int = Query(0, ge=0)):
    """Return eligibility for the customer's active cart.
    Frontend uses this as the single-source-of-truth for the checkout gate.

    Also previews reward-points redemption when `use_points` is provided.
    """
    _cart, _lines, subtotal = await _snapshot_cart(customer["id"])
    country = await get_country_config(customer.get("country", "CI")) or {}
    elig = check_order_eligibility(
        subtotal=subtotal,
        country_delivery_fee=country.get("delivery_fee", 0),
        country_free_delivery_over=country.get("free_delivery_over", 0),
        min_order=country.get("min_order", 0),
    )
    elig["currency"] = country.get("currency", "")
    elig["currency_symbol"] = country.get("currency_symbol", "")

    # Rewards preview
    available = int(customer.get("reward_points") or 0)
    requested = min(max(0, use_points), available)
    max_discount_allowed = max(0.0, elig["total"] - (country.get("min_order", 0) or 0))
    discount = round(min(requested / REWARD_CONVERSION, max_discount_allowed), 2)
    # Snap to whole-point boundaries
    applied = int(discount * REWARD_CONVERSION)
    elig["points_available"] = available
    elig["points_requested"] = requested
    elig["points_applied"] = applied
    elig["points_discount"] = discount
    elig["points_conversion"] = REWARD_CONVERSION
    elig["points_max_redeemable"] = min(available, int(max_discount_allowed * REWARD_CONVERSION))
    elig["total_after_points"] = round(elig["total"] - discount, 2)
    elig["points_earned_preview"] = int(subtotal * REWARD_EARN_RATE)
    return elig


# ---------- orders ----------
class OrderAddressIn(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    instructions: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CreateOrderIn(BaseModel):
    address_id: Optional[str] = None
    address: Optional[OrderAddressIn] = None
    delivery_slot_id: Optional[str] = None
    delivery_slot_label: Optional[str] = None
    delivery_slot: Optional[str] = None       # mobile: canonical slot code (express/superfast/standard/later)
    payment_method: str = Field("cod")
    module: Optional[str] = None              # kept for forward compat with other modules
    instructions: Optional[str] = None
    use_points: int = Field(0, ge=0, description="Number of baked Points to redeem as a discount")


REWARD_EARN_RATE = 1        # 1 point per unit spent (integer part of subtotal)
REWARD_CONVERSION = 100     # 100 points = 1 unit of currency


SLOT_LABELS = {
    "express": ("slot_express", "10-15 min · Express"),
    "superfast": ("slot_superfast", "20-30 min · Super Fast"),
    "standard": ("slot_standard", "30-45 min · Standard"),
    "later": ("slot_later", "Schedule later"),
}


async def _snapshot_cart(customer_id: str) -> tuple[dict | None, list[dict], float]:
    cart = await db.carts.find_one({"customer_id": customer_id, "status": "active"}, {"_id": 0})
    if not cart or not cart.get("items"):
        return None, [], 0.0
    lines: list[dict] = []
    subtotal = 0.0
    for it in cart["items"]:
        p = await db.mart_products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not p:
            continue
        line_total = round(p["price"] * it["quantity"], 2)
        subtotal += line_total
        lines.append({
            "product_id": p["id"],
            "name": p["name"],
            "unit": p.get("unit"),
            "brand": p.get("brand"),
            "image": p.get("image"),
            "price": p["price"],
            "quantity": it["quantity"],
            "line_total": line_total,
            "currency": p.get("currency"),
        })
    return cart, lines, round(subtotal, 2)


@router.post("/orders")
async def create_order(payload: CreateOrderIn, customer: dict = Depends(get_current_customer)):
    cart, lines, subtotal = await _snapshot_cart(customer["id"])
    if not lines:
        raise HTTPException(400, "Cart is empty")

    country = await get_country_config(customer.get("country", "CI")) or {}

    # Centralised eligibility: total = subtotal + delivery, then check against min_order
    elig = check_order_eligibility(
        subtotal=subtotal,
        country_delivery_fee=country.get("delivery_fee", 0),
        country_free_delivery_over=country.get("free_delivery_over", 0),
        min_order=country.get("min_order", 0),
    )
    if not elig["eligible"]:
        raise HTTPException(400, f"Minimum order is {country.get('min_order', 0)} {country.get('currency','')}. Add {elig['shortfall']:g} {country.get('currency','')} more to your basket.")

    delivery_fee = elig["delivery_fee"]
    subtotal_after_delivery = elig["total"]
    currency = country.get("currency", lines[0].get("currency"))

    # ---- Rewards redemption ----
    available_points = int(customer.get("reward_points") or 0)
    use_points = min(max(0, payload.use_points), available_points)
    # Never let a redemption drive the total below the minimum-order threshold
    max_discount_allowed = max(0.0, subtotal_after_delivery - (country.get("min_order", 0) or 0))
    points_discount = round(min(use_points / REWARD_CONVERSION, max_discount_allowed), 2)
    # Round redemption down to whole points if capped
    if points_discount < use_points / REWARD_CONVERSION:
        use_points = int(points_discount * REWARD_CONVERSION)
    total = round(subtotal_after_delivery - points_discount, 2)

    address = None
    if payload.address_id:
        address = await db.customer_addresses.find_one({"id": payload.address_id, "customer_id": customer["id"]}, {"_id": 0})
    if not address and payload.address:
        # Inline address (mobile checkout) — persist as a customer address for later reuse
        address_doc = payload.address.model_dump()
        address_doc.update({
            "id": new_id("adr"),
            "customer_id": customer["id"],
            "country": (address_doc.get("country") or customer.get("country") or "CI").upper(),
            "created_at": _now_iso(), "updated_at": _now_iso(), "deleted_at": None,
        })
        await db.customer_addresses.insert_one(address_doc)
        address_doc.pop("_id", None)
        address = address_doc
    if not address:
        raise HTTPException(400, "Address is required (provide address_id or inline address)")

    # Resolve delivery slot (id + label, else code, else default)
    slot_id = payload.delivery_slot_id
    slot_label = payload.delivery_slot_label
    if not slot_id and payload.delivery_slot:
        slot_id, slot_label = SLOT_LABELS.get(payload.delivery_slot, ("slot_express", "10-15 min · Express"))
    if not slot_id:
        slot_id, slot_label = ("slot_express", "10-15 min · Express")

    order_id = new_id("ord")
    order = {
        "id": order_id,
        "number": f"BK{order_id[-8:].upper()}",
        "customer_id": customer["id"],
        "module": "mart",
        "country": customer.get("country", "CI"),
        "status": "pending",
        "items": lines,
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "points_redeemed": use_points,
        "points_discount": points_discount,
        "points_earned": int(subtotal * REWARD_EARN_RATE),
        "total": total,
        "currency": currency,
        "address": address,
        "delivery_slot_id": slot_id,
        "delivery_slot_label": slot_label,
        "payment_method": payload.payment_method,
        "payment_status": "pending",
        "payment_provider_ref": None,
        "instructions": payload.instructions,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "deleted_at": None,
        "version": 1,
    }
    await db.orders.insert_one(order)

    # Fire OrderCreated
    await event_bus.publish(Events.ORDER_CREATED, {"order_id": order_id, "customer_id": customer["id"], "total": total})

    # Authorize payment (COD auto-authorizes)
    provider = get_payment_provider(payload.payment_method)
    try:
        intent = await provider.create_intent(order)
    except NotImplementedError as e:
        raise HTTPException(400, str(e)) from e

    updates = {
        "payment_status": intent["status"],
        "payment_provider": intent.get("provider"),
        "payment_provider_ref": intent.get("provider_ref"),
        "updated_at": _now_iso(),
    }
    if intent["status"] == "succeeded" or intent["status"] == "authorized":
        updates["status"] = "confirmed"
        await event_bus.publish(Events.PAYMENT_COMPLETED, {"order_id": order_id, "amount": total, "provider": intent.get("provider")})

        # Rewards: deduct redeemed points, credit earned points, record entries
        points_delta = order["points_earned"] - order["points_redeemed"]
        if points_delta != 0 or order["points_redeemed"] > 0:
            new_balance = max(0, available_points + points_delta)
            await db.customers.update_one({"id": customer["id"]}, {"$set": {"reward_points": new_balance, "updated_at": _now_iso()}})
        if order["points_earned"] > 0:
            await db.reward_entries.insert_one({
                "id": new_id("rwd"), "customer_id": customer["id"], "kind": "earned",
                "points": order["points_earned"], "order_id": order_id, "order_number": order["number"],
                "label": f"Earned on {order['number']}", "created_at": _now_iso(),
            })
        if order["points_redeemed"] > 0:
            await db.reward_entries.insert_one({
                "id": new_id("rwd"), "customer_id": customer["id"], "kind": "redeemed",
                "points": -order["points_redeemed"], "order_id": order_id, "order_number": order["number"],
                "label": f"Redeemed on {order['number']}", "created_at": _now_iso(),
            })
    await db.orders.update_one({"id": order_id}, {"$set": updates})

    # Clear the cart
    await db.carts.update_one({"id": cart["id"]}, {"$set": {"items": [], "updated_at": _now_iso()}})

    # Analytics
    await event_bus.publish(Events.ANALYTICS_UPDATED, {"kind": "order_created", "country": order["country"], "total": total, "currency": currency})
    # Audit
    await db.audit_logs.insert_one({
        "id": new_id("aud"),
        "actor_id": customer["id"],
        "actor_kind": "customer",
        "action": "order.created",
        "target_id": order_id,
        "metadata": {"total": total, "currency": currency},
        "created_at": _now_iso(),
    })

    final = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return final


@router.get("/orders/me")
async def list_my_orders(customer: dict = Depends(get_current_customer), limit: int = Query(30, le=100)):
    return await db.orders.find(
        {"customer_id": customer["id"], "deleted_at": None},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)


@router.get("/orders/{order_id}")
async def get_order(order_id: str, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    return order


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in ("pending", "confirmed"):
        raise HTTPException(400, f"Cannot cancel order in status {order['status']}")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "updated_at": _now_iso()}})
    await event_bus.publish(Events.ORDER_UPDATED, {"order_id": order_id, "status": "cancelled"})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


# ---------- tracking (mock/demo) ----------
# Demo driver + store coordinates per country
_COUNTRY_GEO = {
    "CI": {"store": {"name": "MARTbakēd Store · Cocody", "lat": 5.3455, "lng": -4.0021}, "destination": {"lat": 5.3535, "lng": -3.9857}},
    "GB": {"store": {"name": "MARTbakēd Store · Marylebone", "lat": 51.5238, "lng": -0.1585}, "destination": {"lat": 51.5237, "lng": -0.1585}},
}
_DEMO_DRIVERS = [
    {"name": "Rahul Kumar", "rating": 4.8, "vehicle": "Electric Scooter", "vehicle_reg": "AB12 C3456", "phone": "+225 07 12 34 56 78", "photo": "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop&q=80"},
    {"name": "Ibrahim Kone", "rating": 4.9, "vehicle": "Green Bolt scooter", "vehicle_reg": "AB-2245-CI", "phone": "+225 07 01 02 03 04", "photo": "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=200&h=200&fit=crop&q=80"},
]

# stage progression by elapsed seconds since order created
_TIMELINE_STAGES = [
    ("placed",     0,   "Order Placed"),
    ("preparing",  30,  "Preparing"),
    ("picked_up",  90,  "Picked Up"),
    ("on_the_way", 120, "On the Way"),
    ("delivered",  360, "Delivered"),
]


def _interp(a: dict, b: dict, t: float) -> dict:
    t = max(0.0, min(1.0, t))
    return {"lat": a["lat"] + (b["lat"] - a["lat"]) * t, "lng": a["lng"] + (b["lng"] - a["lng"]) * t}


def _elapsed_seconds(order: dict) -> int:
    try:
        created = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
    except Exception:
        return 0
    return int((datetime.now(timezone.utc) - created).total_seconds())


def _current_stage(elapsed: int) -> str:
    stage = "placed"
    for code, at, _lbl in _TIMELINE_STAGES:
        if elapsed >= at:
            stage = code
    return stage


@router.get("/orders/{order_id}/tracking")
async def order_tracking(order_id: str, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    elapsed = _elapsed_seconds(order)

    # Honour cancelled state
    if order["status"] == "cancelled":
        return {"order": order, "stage": "cancelled", "timeline": [], "driver": None, "geo": None, "eta_seconds": None}

    # Compute the demo-progressed stage. If persisted status is "delivered", pin to it.
    stage = "delivered" if order["status"] == "delivered" else _current_stage(elapsed)

    # Persist the auto-advanced status so admins & other views see it consistently
    persisted = order["status"]
    desired = "delivered" if stage == "delivered" else (
        "on_the_way" if stage == "on_the_way" else
        "picked_up" if stage == "picked_up" else
        "preparing" if stage == "preparing" else
        order["status"]
    )
    if desired != persisted:
        await db.orders.update_one({"id": order_id}, {"$set": {"status": desired, "updated_at": _now_iso()}})
        order["status"] = desired

    country = (order.get("country") or "CI").upper()
    geo = _COUNTRY_GEO.get(country) or _COUNTRY_GEO["CI"]
    # If a destination lat/lng exists on the address, use it
    addr = order.get("address") or {}
    if addr.get("latitude") and addr.get("longitude"):
        geo = {"store": geo["store"], "destination": {"lat": addr["latitude"], "lng": addr["longitude"]}}
    # Driver current position interpolated between store→destination for the on-the-way window
    if stage in ("placed", "preparing"):
        driver_pos = geo["store"]
    elif stage == "picked_up":
        driver_pos = _interp(geo["store"], geo["destination"], 0.15)
    elif stage == "on_the_way":
        # 120s..360s → 0.15 → 0.98
        t = (elapsed - 120) / max(1, (360 - 120))
        driver_pos = _interp(geo["store"], geo["destination"], 0.15 + t * 0.83)
    else:
        driver_pos = geo["destination"]

    # Build timeline with timestamps
    try:
        started = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))
    except Exception:
        started = datetime.now(timezone.utc)
    timeline = []
    for code, at, label in _TIMELINE_STAGES:
        completed = elapsed >= at
        ts = (started + timedelta(seconds=at)).isoformat() if completed else None
        timeline.append({"code": code, "label": label, "completed": completed, "at": ts})

    driver = _DEMO_DRIVERS[hash(order_id) % len(_DEMO_DRIVERS)]

    # ETA
    eta_seconds = None
    if stage in ("placed", "preparing", "picked_up", "on_the_way"):
        eta_seconds = max(0, 360 - elapsed)

    return {
        "order": order,
        "stage": stage,
        "timeline": timeline,
        "driver": driver,
        "geo": {
            "store": geo["store"],
            "destination": geo["destination"],
            "driver": driver_pos,
        },
        "eta_seconds": eta_seconds,
        "elapsed_seconds": elapsed,
    }


class RateOrderIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


@router.post("/orders/{order_id}/rate")
async def rate_order(order_id: str, payload: RateOrderIn, customer: dict = Depends(get_current_customer)):
    order = await db.orders.find_one({"id": order_id, "customer_id": customer["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    updates = {"rating": payload.rating, "rating_comment": payload.comment or "", "rated_at": _now_iso(), "updated_at": _now_iso()}
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})
