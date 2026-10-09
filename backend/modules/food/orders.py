"""FOODbakēd — Order pipeline (Pass 1: receive-side only, no driver dispatch).

Routes:
  Customer:
    POST /api/food/customer/orders          Create order(s) from cart
    GET  /api/food/customer/orders          List my orders
    GET  /api/food/customer/orders/{id}     Detail + status timeline
  Partner:
    GET   /api/food/manage/{rid}/orders              List orders (status group)
    GET   /api/food/manage/{rid}/orders/{id}         Detail
    PATCH /api/food/manage/{rid}/orders/{id}         Accept/reject/preparing/ready

Design highlights
-----------------
* The cart passes raw item snapshots; the server re-prices and validates
  against `food_menu_items` to avoid trusting client-side amounts.
* Mixed-restaurant checkouts split into N `food_orders` rows (one per
  restaurant). The response returns `orders=[…]`.
* On create, the server publishes `food.order.created` on the partner
  pub/sub channel (same one Reservations uses) so the existing
  RestaurantNotificationEngine fires the 10-sec alarm with no refresh.
* Idempotent create via optional `client_order_id` header, so a retry
  from the browser never produces duplicate orders.
* Partner actions enforce tenant isolation via `_get_menu_writer`.
* Status machine:  placed → accepted → preparing → ready → completed
                                  ↳→ rejected / cancelled
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, conint, constr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer, get_optional_customer
from core.models import Customer
from modules.food.reservations import _publish  # reuse existing pub/sub
from modules.food.routes import _get_menu_writer

log = logging.getLogger("baked.food.orders")

customer_router = APIRouter(prefix="/food/customer", tags=["food-orders"])
partner_router  = APIRouter(prefix="/food/manage",   tags=["food-orders"])


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _iso(v: Any) -> Optional[str]:
    if not v: return None
    if isinstance(v, str): return v
    if isinstance(v, datetime) and v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


def _order_short(o: Any, items_count: int = 0) -> dict:
    return {
        "id": o.id, "order_number": o.order_number,
        "restaurant_id": o.restaurant_id, "status": o.status,
        "order_type": o.order_type, "placed_at": _iso(o.placed_at),
        "accepted_at": _iso(o.accepted_at), "ready_at": _iso(o.ready_at),
        "delivered_at": _iso(o.delivered_at), "cancelled_at": _iso(o.cancelled_at),
        "grand_total": float(o.grand_total or 0),
        "currency": o.currency, "payment_status": o.payment_status,
        "items_count": items_count,
    }


async def _detail(session: AsyncSession, oid: str) -> dict:
    o = (await session.execute(text("""
        SELECT o.*, r.name AS restaurant_name, r.slug AS restaurant_slug, r.image AS restaurant_image
          FROM food_orders o JOIN food_restaurants r ON r.id = o.restaurant_id
         WHERE o.id = :id
    """), {"id": oid})).fetchone()
    if not o:
        raise HTTPException(404, "Order not found")
    items = (await session.execute(text(
        "SELECT * FROM food_order_items WHERE order_id = :id ORDER BY created_at"
    ), {"id": oid})).fetchall()
    events = (await session.execute(text(
        "SELECT to_status AS event_type, created_at, notes, from_status, actor_role FROM food_order_events WHERE order_id = :id ORDER BY created_at ASC"
    ), {"id": oid})).fetchall()
    return {
        **_order_short(o, len(items)),
        "restaurant": {"id": o.restaurant_id, "name": o.restaurant_name,
                       "slug": o.restaurant_slug, "image": o.restaurant_image},
        "customer_snapshot": o.customer_snapshot or {},
        "delivery_address":  o.delivery_address or {},
        "subtotal": float(o.subtotal or 0), "discount": float(o.discount or 0),
        "delivery_fee": float(o.delivery_fee or 0), "tax": float(o.tax or 0),
        "promo_code": o.promo_code, "notes": o.notes,
        "items": [{
            "id": it.id, "item_id": it.menu_item_id,
            "name": it.item_name_snapshot, "quantity": it.quantity,
            "unit_price": float(it.unit_price or 0),
            "line_total": float(it.line_total or 0),
            "variant": it.variant_snapshot, "addons": it.addons_snapshot,
            "section": it.section_snapshot,
        } for it in items],
        "events": [{"type": e.event_type, "from": e.from_status, "at": _iso(e.created_at),
                    "actor_role": e.actor_role, "notes": e.notes} for e in events],
    }


async def _log_event(session: AsyncSession, oid: str, to_status: str,
                     from_status: Optional[str] = None,
                     actor_role: Optional[str] = None,
                     notes: Optional[str] = None) -> None:
    await session.execute(text("""
        INSERT INTO food_order_events (id, order_id, from_status, to_status, actor_role, notes)
        VALUES (:id, :oid, :fs, :ts, :role, :notes)
    """), {"id": f"evt_{uuid.uuid4().hex[:16]}", "oid": oid,
           "fs": from_status, "ts": to_status, "role": actor_role, "notes": notes})


# ---------------------------------------------------------------------------
# Customer: create order
# ---------------------------------------------------------------------------

class OrderItemIn(BaseModel):
    item_id:  constr(strip_whitespace=True, min_length=1, max_length=64)
    quantity: conint(ge=1, le=50)
    variant:  Optional[dict] = None        # {id, name, price_delta?}
    addons:   Optional[list[dict]] = None  # [{id, name, price}]
    notes:    Optional[constr(max_length=240)] = None


class OrderIn(BaseModel):
    restaurant_id: constr(strip_whitespace=True, min_length=1, max_length=64)
    order_type:    constr(strip_whitespace=True, pattern="^(delivery|pickup)$")
    items:         list[OrderItemIn] = Field(..., min_length=1)
    delivery_address: Optional[dict] = None     # {label, line1, city, lat, lng, phone, contact_name}
    customer_snapshot: Optional[dict] = None    # {name, phone, email}
    payment_method:   Optional[constr(max_length=24)] = "cod"
    promo_code:       Optional[constr(max_length=48)] = None
    notes:            Optional[constr(max_length=500)] = None
    client_order_id:  Optional[constr(max_length=64)] = None  # idempotency key


def _gen_order_number() -> str:
    # FD-<6 hex>
    return "FD-" + uuid.uuid4().hex[:6].upper()


@customer_router.post("/orders", status_code=201)
async def create_order(
    payload: OrderIn,
    session: AsyncSession = Depends(get_session),
    customer: Optional[Customer] = Depends(get_optional_customer),
):
    # ---- Idempotency: if client_order_id already seen for this restaurant+customer, return it.
    if payload.client_order_id:
        existing = (await session.execute(text("""
            SELECT id FROM food_orders
             WHERE restaurant_id = :rid
               AND customer_snapshot->>'client_order_id' = :cid
             LIMIT 1
        """), {"rid": payload.restaurant_id, "cid": payload.client_order_id})).fetchone()
        if existing:
            return await _detail(session, existing.id)

    # ---- Validate restaurant
    r = (await session.execute(text(
        "SELECT id, country, status, delivery_paused_until, pickup_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": payload.restaurant_id})).fetchone()
    if not r or r.status != "active":
        raise HTTPException(404, "Restaurant unavailable")

    # ---- Phase 4: service pause check. Reject the order with a clear
    # payload the customer-side UI can act on (e.g. offer the OTHER service
    # mode if only one is paused).
    now = datetime.now(timezone.utc)
    pause_until = None
    if payload.order_type == "delivery" and r.delivery_paused_until and r.delivery_paused_until > now:
        pause_until = r.delivery_paused_until
    elif payload.order_type == "pickup" and r.pickup_paused_until and r.pickup_paused_until > now:
        pause_until = r.pickup_paused_until
    if pause_until is not None:
        raise HTTPException(409, {
            "code": "service_paused",
            "service": payload.order_type,
            "paused_until": _iso(pause_until),
            "message": (
                "Ce service est temporairement en pause par le restaurant. "
                "Merci de réessayer plus tard."
            ),
        })

    # ---- Re-price items from DB (never trust client prices)
    item_ids = [it.item_id for it in payload.items]
    rows = (await session.execute(text("""
        SELECT id, name, base_price, currency, is_available, image, restaurant_id
          FROM food_menu_items
         WHERE id = ANY(:ids) AND restaurant_id = :rid
    """), {"ids": item_ids, "rid": payload.restaurant_id})).fetchall()
    by_id = {x.id: x for x in rows}
    for it in payload.items:
        if it.item_id not in by_id:
            raise HTTPException(422, f"Item {it.item_id} not on this restaurant's menu")
        if not by_id[it.item_id].is_available:
            raise HTTPException(409, f"Item '{by_id[it.item_id].name}' is sold out")

    # ---- Build items + totals
    oid = f"ord_{uuid.uuid4().hex[:16]}"
    subtotal = 0.0
    items_out = []
    for line_no, it in enumerate(payload.items):
        base = by_id[it.item_id]
        variant_delta = float((it.variant or {}).get("price_delta") or 0)
        addons = it.addons or []
        addons_total = sum(float(a.get("price") or 0) for a in addons)
        unit_price = float(base.base_price or 0) + variant_delta + addons_total
        line_total = unit_price * it.quantity
        subtotal += line_total
        items_out.append({
            "id": f"oit_{uuid.uuid4().hex[:16]}",
            "order_id": oid, "line_no": line_no, "item_id": base.id,
            "name": base.name, "quantity": it.quantity,
            "unit_price": unit_price, "line_total": line_total,
            "variant": it.variant or None, "addons": addons,
            "notes": it.notes, "image": base.image,
        })

    # Delivery fee — pulled from the restaurant's configured `delivery_fee`
    # column (same source as the /api/cart/quote endpoint, so the amount a
    # customer sees in cart matches what we actually charge). Pickup orders
    # are never billed a delivery fee.
    delivery_fee = float(r.delivery_fee or 0) if payload.order_type == "delivery" else 0.0
    tax = 0.0
    grand_total = subtotal + delivery_fee + tax
    currency = (rows[0].currency if rows else None) or "XOF"

    # ---- Customer snapshot
    cust_snap = dict(payload.customer_snapshot or {})
    if customer:
        cust_snap.setdefault("id", customer.id)
        cust_snap.setdefault("name", customer.name)
        cust_snap.setdefault("phone", getattr(customer, "phone", None))
        cust_snap.setdefault("email", getattr(customer, "email", None))
    if payload.client_order_id:
        cust_snap["client_order_id"] = payload.client_order_id

    # ---- Persist order
    import json as _json
    await session.execute(text("""
        INSERT INTO food_orders
          (id, order_number, restaurant_id, customer_id, customer_snapshot, country,
           order_type, status, currency, subtotal, delivery_fee, tax, grand_total,
           payment_method, payment_status, delivery_address, notes)
        VALUES
          (:id, :num, :rid, :cid, CAST(:csnap AS JSONB), :country,
           :otype, 'placed', :cur, :sub, :dfee, :tax, :total,
           :pm, 'pending', CAST(:addr AS JSONB), :notes)
    """), {
        "id": oid, "num": _gen_order_number(), "rid": payload.restaurant_id,
        "cid": customer.id if customer else None,
        "csnap": _json.dumps(cust_snap),
        "country": r.country,
        "otype": payload.order_type, "cur": currency,
        "sub": subtotal, "dfee": delivery_fee, "tax": tax, "total": grand_total,
        "pm": payload.payment_method or "cod",
        "addr": _json.dumps(payload.delivery_address or {}),
        "notes": payload.notes,
    })
    for it in items_out:
        await session.execute(text("""
            INSERT INTO food_order_items
              (id, order_id, menu_item_id, item_name_snapshot, section_snapshot,
               quantity, unit_price, line_total, variant_snapshot, addons_snapshot, item_discount)
            VALUES
              (:id, :oid, :iid, :n, :sec, :q, :up, :lt,
               CAST(:vs AS JSONB), CAST(:asn AS JSONB), 0)
        """), {
            "id": it["id"], "oid": it["order_id"],
            "iid": it["item_id"], "n": it["name"],
            "sec": None,
            "q": it["quantity"], "up": it["unit_price"], "lt": it["line_total"],
            "vs": _json.dumps(it["variant"] or {}),
            "asn": _json.dumps(it["addons"] or []),
        })
    await _log_event(session, oid, to_status="placed", actor_role="customer",
                     notes=f"items={len(items_out)} total={grand_total}")
    await session.commit()

    detail = await _detail(session, oid)

    # ---- Realtime fan-out to the partner portal (live WS + browser Push)
    try:
        await _publish(payload.restaurant_id, {
            "type": "food.order.created",
            "order": {
                "id": detail["id"], "order_number": detail["order_number"],
                "status": detail["status"], "order_type": detail["order_type"],
                "grand_total": detail["grand_total"], "currency": detail["currency"],
                "items_count": len(detail["items"]),
                "placed_at": detail["placed_at"],
            },
        })
    except Exception as e:  # noqa: BLE001
        log.warning("food.order.created publish failed: %s", e)

    # Browser Push — wakes the partner's phone even when the tab is closed.
    # Fire-and-forget: a slow push service never blocks the customer's HTTP
    # response. Revoked endpoints are pruned by the dispatcher.
    try:
        from modules.food.push import fire_and_forget, new_order_payload
        from core.db import SessionLocal
        fire_and_forget(SessionLocal, payload.restaurant_id, new_order_payload({
            **detail,
            "customer_snapshot": payload.customer_snapshot or {},
        }))
    except Exception as e:  # noqa: BLE001
        log.warning("push fan-out skipped: %s", e)

    return detail


# ---------------------------------------------------------------------------
# Customer: list / detail
# ---------------------------------------------------------------------------

@customer_router.get("/orders")
async def list_my_orders(
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    rows = (await session.execute(text("""
        SELECT o.*, r.name AS restaurant_name, r.slug AS restaurant_slug, r.image AS restaurant_image,
               (SELECT COUNT(*) FROM food_order_items i WHERE i.order_id = o.id) AS items_count
          FROM food_orders o JOIN food_restaurants r ON r.id = o.restaurant_id
         WHERE o.customer_id = :cid
         ORDER BY o.placed_at DESC LIMIT 100
    """), {"cid": customer.id})).fetchall()
    return {"orders": [{
        **_order_short(r, int(r.items_count or 0)),
        "restaurant": {"id": r.restaurant_id, "name": r.restaurant_name,
                       "slug": r.restaurant_slug, "image": r.restaurant_image},
    } for r in rows]}


@customer_router.get("/orders/{oid}")
async def get_my_order(oid: str,
                      session: AsyncSession = Depends(get_session),
                      customer: Customer = Depends(get_current_customer)):
    o = (await session.execute(text(
        "SELECT customer_id FROM food_orders WHERE id = :id"
    ), {"id": oid})).fetchone()
    if not o:
        raise HTTPException(404, "Order not found")
    if o.customer_id != customer.id:
        raise HTTPException(403, "Not your order")
    return await _detail(session, oid)


# ---------------------------------------------------------------------------
# Partner: list / act
# ---------------------------------------------------------------------------

PARTNER_STATUS_GROUPS = {
    "new":        ("placed",),
    "accepted":   ("accepted",),
    "preparing":  ("preparing",),
    "ready":      ("ready",),
    "completed":  ("completed", "delivered"),
    "cancelled":  ("cancelled", "rejected"),
}


@partner_router.get("/{rid}/orders")
async def partner_list_orders(
    rid: str,
    status: Optional[str] = None,
    request: Request = None,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if status and status not in PARTNER_STATUS_GROUPS:
        raise HTTPException(422, f"unknown status group '{status}'")
    where = ["restaurant_id = :rid"]
    params: dict[str, Any] = {"rid": rid}
    if status:
        where.append("status = ANY(:statuses)")
        params["statuses"] = list(PARTNER_STATUS_GROUPS[status])
    rows = (await session.execute(text(f"""
        SELECT o.*, (SELECT COUNT(*) FROM food_order_items i WHERE i.order_id = o.id) AS items_count
          FROM food_orders o
         WHERE {" AND ".join(where)}
         ORDER BY placed_at DESC LIMIT 100
    """), params)).fetchall()
    # counts per group
    counts_rows = (await session.execute(text(
        "SELECT status, COUNT(*) AS n FROM food_orders WHERE restaurant_id = :rid GROUP BY status"
    ), {"rid": rid})).fetchall()
    counts_by_status = {r.status: int(r.n) for r in counts_rows}
    counts = {g: sum(counts_by_status.get(s, 0) for s in PARTNER_STATUS_GROUPS[g]) for g in PARTNER_STATUS_GROUPS}
    return {
        "orders": [_order_short(r, int(r.items_count or 0)) for r in rows],
        "counts": counts,
    }


@partner_router.get("/{rid}/orders/{oid}")
async def partner_get_order(rid: str, oid: str, request: Request,
                            session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    o = (await session.execute(text(
        "SELECT restaurant_id FROM food_orders WHERE id = :id"
    ), {"id": oid})).fetchone()
    if not o or o.restaurant_id != rid:
        raise HTTPException(404, "Order not found")
    return await _detail(session, oid)


# ---- Transitions ---------------------------------------------------------

VALID_TRANSITIONS = {
    "accept":    (("placed",),   "accepted",  "accepted_at"),
    "reject":    (("placed",),   "rejected",  "cancelled_at"),
    "preparing": (("accepted",), "preparing", None),
    "ready":     (("preparing",),"ready",     "ready_at"),
    "cancel":    (("placed", "accepted", "preparing"), "cancelled", "cancelled_at"),
}


class PartnerAction(BaseModel):
    action: constr(pattern="^(accept|reject|preparing|ready|cancel)$")
    reason: Optional[constr(max_length=200)] = None   # reject/cancel
    prep_minutes: Optional[conint(ge=1, le=240)] = None


@partner_router.patch("/{rid}/orders/{oid}")
async def partner_act_on_order(rid: str, oid: str, payload: PartnerAction,
                                request: Request,
                                session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    o = (await session.execute(text(
        "SELECT status, restaurant_id FROM food_orders WHERE id = :id FOR UPDATE"
    ), {"id": oid})).fetchone()
    if not o or o.restaurant_id != rid:
        raise HTTPException(404, "Order not found")

    allowed_from, new_status, ts_col = VALID_TRANSITIONS[payload.action]
    if o.status not in allowed_from:
        raise HTTPException(409, f"Cannot {payload.action} an order in status '{o.status}'")

    if payload.action in ("reject", "cancel") and not payload.reason:
        raise HTTPException(422, "A reason is required for reject/cancel")

    sets = ["status = :st", "updated_at = now()"]
    params: dict[str, Any] = {"id": oid, "st": new_status}
    if ts_col:
        sets.append(f"{ts_col} = now()")

    await session.execute(text(
        f"UPDATE food_orders SET {', '.join(sets)} WHERE id = :id"
    ), params)
    await _log_event(session, oid, to_status=new_status, from_status=o.status,
                     actor_role="partner", notes=payload.reason)
    await session.commit()

    # ------------------------------------------------------------------
    # Pass 2 — Driver Dispatch bridge
    # ------------------------------------------------------------------
    # On `accepted → preparing` we spin up a shadow express_bookings row and
    # kick off SEND dispatch so the driver 10-second alarm fires in parallel
    # with the kitchen preparing the food. Idempotent — a replayed PATCH
    # won't duplicate the delivery job.
    delivery_booking_id: Optional[str] = None
    if new_status == "preparing":
        from modules.food.dispatch_bridge import create_delivery_job_for_order, DispatchError
        try:
            delivery_booking_id, dispatch_status = await create_delivery_job_for_order(session, oid)
            if dispatch_status == "created":
                await _log_event(session, oid, to_status="delivery_dispatched",
                                 from_status=new_status, actor_role="system",
                                 notes=f"booking={delivery_booking_id}")
            await session.commit()
        except DispatchError as e:
            # Don't fail the partner PATCH if we can't start dispatch — log
            # a dedicated audit event so Ops can replay / fix the address.
            await _log_event(session, oid, to_status="delivery_failed",
                             from_status=new_status, actor_role="system",
                             notes=f"dispatch_error={e.args[0] if e.args else 'unknown'}")
            await session.commit()
            log.warning("food.dispatch_bridge failed for order=%s: %s", oid, e)

    detail = await _detail(session, oid)

    # Fan-out so the partner page re-fetches + customer tracker ticks forward.
    try:
        await _publish(rid, {
            "type": "food.order.updated",
            "order": {
                "id": detail["id"], "status": detail["status"],
                "order_number": detail["order_number"],
                "ready_at": detail["ready_at"],
                "accepted_at": detail["accepted_at"],
            },
        })
    except Exception as e:  # noqa: BLE001
        log.warning("food.order.updated publish failed: %s", e)

    return detail


# ---------------------------------------------------------------------------
# Pass 2 — Delivery visibility + pickup confirmation
# ---------------------------------------------------------------------------

@partner_router.get("/{rid}/orders/{oid}/delivery")
async def partner_get_delivery(rid: str, oid: str,
                                request: Request,
                                session: AsyncSession = Depends(get_session)):
    """Live Driver card data for the partner Orders page. Tenant-isolated
    through `_get_menu_writer` + explicit restaurant_id ownership check.
    Returns 404 if the order doesn't belong to this restaurant, 204 if
    the order has no delivery job yet (pickup orders / dispatch not kicked
    in). Includes the pickup PIN so the partner can read it to the driver."""
    await _get_menu_writer(rid, request, session)
    from core.models import ExpressBooking
    from modules.food.dispatch_bridge import food_delivery_public

    owner = (await session.execute(text(
        "SELECT restaurant_id FROM food_orders WHERE id = :id"
    ), {"id": oid})).fetchone()
    if not owner or owner.restaurant_id != rid:
        raise HTTPException(404, "Order not found")

    # Pick the most recent non-cancelled booking (allowing operator rescue
    # by cancelling + re-dispatching a stuck job).
    row = (await session.execute(text(
        "SELECT id FROM express_bookings "
        " WHERE food_order_id = :fo AND status <> 'cancelled' "
        " ORDER BY created_at DESC LIMIT 1"
    ), {"fo": oid})).fetchone()
    if not row:
        return {"booking_id": None, "status": "none"}
    booking = await session.get(ExpressBooking, row.id)
    return food_delivery_public(booking, include_pin=True)


@customer_router.get("/orders/{oid}/track")
async def customer_track_order(oid: str,
                                session: AsyncSession = Depends(get_session),
                                customer: Customer = Depends(get_current_customer)):
    """Customer live-tracking payload: order detail + attached delivery
    (pickup_pin stripped). Powers the FOOD-themed /foodbaked/orders/{id}/track
    page."""
    from core.models import ExpressBooking
    from modules.food.dispatch_bridge import food_delivery_public

    detail = await _detail(session, oid)
    owner = (await session.execute(text(
        "SELECT customer_id FROM food_orders WHERE id = :id"
    ), {"id": oid})).fetchone()
    if not owner or owner.customer_id != customer.id:
        raise HTTPException(404, "Order not found")

    row = (await session.execute(text(
        "SELECT id FROM express_bookings "
        " WHERE food_order_id = :fo AND status <> 'cancelled' "
        " ORDER BY created_at DESC LIMIT 1"
    ), {"fo": oid})).fetchone()
    delivery = None
    if row:
        b = await session.get(ExpressBooking, row.id)
        delivery = food_delivery_public(b, include_pin=False)
        # Strip driver phone from the customer view — they already have the
        # in-app contact mechanism (reserved for Pass 3).
        if delivery.get("driver"):
            delivery["driver"].pop("phone", None)
    return {"order": detail, "delivery": delivery}


class PickupConfirmIn(BaseModel):
    pin: constr(strip_whitespace=True, min_length=4, max_length=8)


@partner_router.post("/{rid}/orders/{oid}/confirm-pickup")
async def partner_confirm_pickup(rid: str, oid: str, payload: PickupConfirmIn,
                                  request: Request,
                                  session: AsyncSession = Depends(get_session)):
    """Driver has arrived; partner enters the PIN the driver just read to
    them, flipping the delivery booking `driver_assigned → picked_up`.
    This closes the SEND side (dispatch is done) and ticks the FOOD order
    forward to `out_for_delivery` so the customer tracker reflects it."""
    await _get_menu_writer(rid, request, session)
    owner = (await session.execute(text(
        "SELECT restaurant_id, status FROM food_orders WHERE id = :id"
    ), {"id": oid})).fetchone()
    if not owner or owner.restaurant_id != rid:
        raise HTTPException(404, "Order not found")

    booking = (await session.execute(text(
        "SELECT id, pickup_pin, status, driver_id "
        "  FROM express_bookings "
        " WHERE food_order_id = :fo AND status <> 'cancelled' "
        " ORDER BY created_at DESC LIMIT 1"
    ), {"fo": oid})).fetchone()
    if not booking:
        raise HTTPException(409, "No active delivery for this order")
    if booking.status not in ("driver_assigned", "arriving"):
        raise HTTPException(409, f"Driver is not here yet (status={booking.status})")
    if (payload.pin or "").strip() != (booking.pickup_pin or ""):
        raise HTTPException(422, "Invalid pickup PIN")

    # Flip the express_booking and the food order in one transaction.
    await session.execute(text(
        "UPDATE express_bookings SET status = 'picked_up', updated_at = now() "
        " WHERE id = :id"
    ), {"id": booking.id})
    await session.execute(text(
        "UPDATE food_orders SET status = 'out_for_delivery', updated_at = now() "
        " WHERE id = :id"
    ), {"id": oid})
    await _log_event(session, oid, to_status="out_for_delivery",
                     from_status=owner.status, actor_role="partner",
                     notes=f"pickup_confirmed booking={booking.id}")
    await session.commit()

    # Fan-out to both partner + customer.
    try:
        await _publish(rid, {
            "type": "food.order.updated",
            "order": {"id": oid, "status": "out_for_delivery"},
        })
    except Exception as e:  # noqa: BLE001
        log.warning("confirm-pickup publish failed: %s", e)
    return {"ok": True, "status": "out_for_delivery", "booking_id": booking.id}


# ---------------------------------------------------------------------------
# Cascade — called by SEND tracking when the driver marks delivered
# ---------------------------------------------------------------------------

async def cascade_delivered_from_express(session: AsyncSession,
                                           food_order_id: str,
                                           booking_id: str) -> bool:
    """Mark the FOOD order delivered when the SEND side flips to delivered.
    Idempotent: a second call is a no-op if the order is already delivered.
    Returns True if a state change happened, False otherwise."""
    row = (await session.execute(text(
        "SELECT status, restaurant_id FROM food_orders WHERE id = :id FOR UPDATE"
    ), {"id": food_order_id})).fetchone()
    if not row:
        log.warning("cascade_delivered: order %s missing", food_order_id)
        return False
    if row.status == "delivered":
        return False
    await session.execute(text(
        "UPDATE food_orders "
        "   SET status = 'delivered', delivered_at = now(), updated_at = now() "
        " WHERE id = :id"
    ), {"id": food_order_id})
    await _log_event(session, food_order_id, to_status="delivered",
                     from_status=row.status, actor_role="system",
                     notes=f"booking={booking_id}")
    # Settlement — snapshot commission + credit vendor wallet.
    try:
        from modules.vendor_settlement import settle_order_on_delivery
        await settle_order_on_delivery(session, food_order_id)
    except Exception as e:  # noqa: BLE001
        log.warning("vendor settlement on delivery failed: %s", e)
    await session.commit()
    try:
        await _publish(row.restaurant_id, {
            "type": "food.order.updated",
            "order": {"id": food_order_id, "status": "delivered"},
        })
    except Exception as e:  # noqa: BLE001
        log.warning("food.delivered publish failed: %s", e)
    return True



# ---------------------------------------------------------------------------
# Phase 4 — Service pause (delivery / pickup) and dashboard stats
# ---------------------------------------------------------------------------

class PauseIn(BaseModel):
    service: constr(strip_whitespace=True) = Field(
        "all",
        pattern="^(delivery|pickup|all)$",
        description="Which service to pause: 'delivery', 'pickup', or 'all'.",
    )
    minutes: conint(ge=0, le=24 * 60) = Field(
        30,
        description="Minutes from now until auto-resume. 0 = pause indefinitely (until manual resume).",
    )


def _service_status(r: Any) -> dict:
    now = datetime.now(timezone.utc)
    def _active(ts):
        return bool(ts and ts > now)
    return {
        "delivery_paused_until": _iso(getattr(r, "delivery_paused_until", None)),
        "pickup_paused_until":   _iso(getattr(r, "pickup_paused_until",   None)),
        "delivery_paused": _active(getattr(r, "delivery_paused_until", None)),
        "pickup_paused":   _active(getattr(r, "pickup_paused_until",   None)),
    }


@partner_router.get("/{rid}/service-status")
async def partner_service_status(rid: str, request: Request,
                                   session: AsyncSession = Depends(get_session)):
    """Current pause state for both delivery and pickup."""
    await _get_menu_writer(rid, request, session)
    r = (await session.execute(text(
        "SELECT delivery_paused_until, pickup_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return _service_status(r)


@partner_router.post("/{rid}/pause")
async def partner_pause_service(rid: str, payload: PauseIn, request: Request,
                                 session: AsyncSession = Depends(get_session)):
    """Pause delivery, pickup, or both for `minutes` (0 = indefinite).

    The pause rejects brand-new orders for the targeted service. Existing
    accepted orders keep moving through the pipeline. Pickup/delivery
    pauses are independent so a partner can pause just delivery while
    accepting walk-in pickups.
    """
    await _get_menu_writer(rid, request, session)
    until_sql = "NULL" if payload.minutes == 0 else "now() + make_interval(mins => :mins)"
    sets = []
    params: dict[str, Any] = {"id": rid, "mins": payload.minutes}
    if payload.service in ("delivery", "all"):
        sets.append(f"delivery_paused_until = {until_sql}")
    if payload.service in ("pickup", "all"):
        sets.append(f"pickup_paused_until = {until_sql}")
    await session.execute(text(
        f"UPDATE food_restaurants SET {', '.join(sets)}, updated_at = now() WHERE id = :id"
    ), params)
    await session.commit()
    r = (await session.execute(text(
        "SELECT delivery_paused_until, pickup_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    status = _service_status(r)
    try:
        await _publish(rid, {"type": "food.service.paused", "service": payload.service, **status})
    except Exception as e:  # noqa: BLE001
        log.warning("service pause publish failed: %s", e)
    return status


@partner_router.post("/{rid}/resume")
async def partner_resume_service(rid: str, payload: PauseIn, request: Request,
                                   session: AsyncSession = Depends(get_session)):
    """Clear the pause for `service` (delivery / pickup / all)."""
    await _get_menu_writer(rid, request, session)
    sets = []
    if payload.service in ("delivery", "all"):
        sets.append("delivery_paused_until = NULL")
    if payload.service in ("pickup", "all"):
        sets.append("pickup_paused_until = NULL")
    await session.execute(text(
        f"UPDATE food_restaurants SET {', '.join(sets)}, updated_at = now() WHERE id = :id"
    ), {"id": rid})
    await session.commit()
    r = (await session.execute(text(
        "SELECT delivery_paused_until, pickup_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    status = _service_status(r)
    try:
        await _publish(rid, {"type": "food.service.resumed", "service": payload.service, **status})
    except Exception as e:  # noqa: BLE001
        log.warning("service resume publish failed: %s", e)
    return status


@partner_router.get("/{rid}/dashboard-stats")
async def partner_dashboard_stats(rid: str, request: Request,
                                    session: AsyncSession = Depends(get_session)):
    """Today's KPI strip for the dashboard.

    Returns per-restaurant counts since local midnight (UTC-approximation):
      orders_today      — total orders placed today
      pending_orders    — placed + accepted (actionable queue depth)
      ready_orders      — ready for handoff
      revenue_today     — sum(grand_total) of non-cancelled orders today
      avg_prep_minutes  — moving average over the last 10 completed orders
      currency          — restaurant's currency
    """
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text("""
        WITH today AS (
            SELECT o.id, o.status, o.grand_total, o.currency,
                   EXTRACT(EPOCH FROM (COALESCE(o.ready_at, o.delivered_at) - o.accepted_at))/60.0 AS prep_min
              FROM food_orders o
             WHERE o.restaurant_id = :rid
               AND o.placed_at >= date_trunc('day', now())
        )
        SELECT
            (SELECT COUNT(*) FROM today) AS orders_today,
            (SELECT COUNT(*) FROM today WHERE status IN ('placed','accepted'))  AS pending_orders,
            (SELECT COUNT(*) FROM today WHERE status = 'ready')                 AS ready_orders,
            COALESCE((SELECT SUM(grand_total) FROM today WHERE status <> 'cancelled'), 0) AS revenue_today,
            (SELECT COALESCE(AVG(prep_min), 0) FROM today
              WHERE prep_min IS NOT NULL AND prep_min > 0 AND prep_min < 240)   AS avg_prep_minutes,
            (SELECT currency FROM food_orders WHERE restaurant_id = :rid ORDER BY placed_at DESC LIMIT 1) AS currency
    """), {"rid": rid})).fetchone()
    return {
        "orders_today":     int(row.orders_today or 0),
        "pending_orders":   int(row.pending_orders or 0),
        "ready_orders":     int(row.ready_orders or 0),
        "revenue_today":    float(row.revenue_today or 0),
        "avg_prep_minutes": round(float(row.avg_prep_minutes or 0), 1),
        "currency":         row.currency or "XOF",
    }


# ---------------------------------------------------------------------------
# Phase 4b — Web Push subscription management
# ---------------------------------------------------------------------------

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth:   str

class PushSubscriptionIn(BaseModel):
    endpoint: constr(min_length=10, max_length=4096)
    keys:     PushSubscriptionKeys
    user_agent: Optional[str] = None

class PushUnsubscribeIn(BaseModel):
    endpoint: constr(min_length=10, max_length=4096)


@partner_router.get("/{rid}/push/vapid-public-key")
async def partner_push_vapid_public(rid: str, request: Request,
                                      session: AsyncSession = Depends(get_session)):
    """Serve the public VAPID key the browser needs for `PushManager.subscribe`.
    Returns 503 when the server isn't configured for push so the UI can
    hide the opt-in control cleanly."""
    await _get_menu_writer(rid, request, session)
    from modules.food.push import VAPID_PUBLIC_KEY, is_configured
    if not is_configured():
        raise HTTPException(503, "Push not configured on this server")
    return {"public_key": VAPID_PUBLIC_KEY}


@partner_router.post("/{rid}/push/subscribe")
async def partner_push_subscribe(rid: str, payload: PushSubscriptionIn,
                                   request: Request,
                                   session: AsyncSession = Depends(get_session)):
    """Store (or refresh) a browser push subscription for this restaurant.

    The same device re-POSTing on every app boot is fine — the row is
    idempotent via `ON CONFLICT (endpoint) DO UPDATE`.
    """
    writer = await _get_menu_writer(rid, request, session)
    from modules.food.push import save_subscription
    try:
        await save_subscription(
            session,
            restaurant_id=rid,
            partner_id=getattr(writer, "id", None),
            subscription=payload.model_dump(),
            user_agent=payload.user_agent or request.headers.get("user-agent"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@partner_router.post("/{rid}/push/unsubscribe")
async def partner_push_unsubscribe(rid: str, payload: PushUnsubscribeIn,
                                     request: Request,
                                     session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    from modules.food.push import delete_subscription
    await delete_subscription(session, payload.endpoint)
    return {"ok": True}


@partner_router.get("/{rid}/push/status")
async def partner_push_status(rid: str, request: Request,
                                session: AsyncSession = Depends(get_session)):
    """How many devices this restaurant currently has subscribed."""
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text(
        "SELECT COUNT(*) AS n FROM partner_push_subscriptions WHERE restaurant_id = :rid"
    ), {"rid": rid})).fetchone()
    from modules.food.push import is_configured
    return {"configured": is_configured(), "subscriptions": int(row.n or 0)}

