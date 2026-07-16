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


# ---------- orders ----------
class CreateOrderIn(BaseModel):
    address_id: str
    delivery_slot_id: str
    delivery_slot_label: str
    payment_method: str = Field("cod")
    instructions: Optional[str] = None


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
    min_order = country.get("min_order", 0)
    if subtotal < min_order:
        raise HTTPException(400, f"Minimum order is {min_order} {country.get('currency','')}")

    delivery_fee = 0 if subtotal >= country.get("free_delivery_over", 0) else country.get("delivery_fee", 0)
    total = round(subtotal + delivery_fee, 2)
    currency = country.get("currency", lines[0].get("currency"))

    address = await db.customer_addresses.find_one({"id": payload.address_id, "customer_id": customer["id"]}, {"_id": 0})
    if not address:
        raise HTTPException(400, "Address not found")

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
        "total": total,
        "currency": currency,
        "address": address,
        "delivery_slot_id": payload.delivery_slot_id,
        "delivery_slot_label": payload.delivery_slot_label,
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
