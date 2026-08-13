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
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import (
    AuditLog,
    Cart,
    CartItem,
    Customer,
    CustomerAddress,
    MartProduct,
    Order,
    OrderItem,
    RewardEntry,
    new_id,
)
from core.serializers import row_to_dict
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


REWARD_EARN_RATE = 1        # 1 point per unit spent (integer part of subtotal)
REWARD_CONVERSION = 100     # 100 points = 1 unit of currency


async def _snapshot_cart(session: AsyncSession, customer_id: str) -> tuple[Optional[Cart], list[dict], float]:
    cart = (
        await session.execute(select(Cart).where(Cart.customer_id == customer_id, Cart.status == "active"))
    ).scalar_one_or_none()
    if not cart:
        return None, [], 0.0
    items = (await session.execute(select(CartItem).where(CartItem.cart_id == cart.id))).scalars().all()
    if not items:
        return cart, [], 0.0
    # Overlay partner pricing here too — checkout eligibility should reflect the
    # exact price the customer will pay after allocation.
    from modules.mart_partner.allocation import effective_partner_price
    products = {p.id: p for p in (
        await session.execute(select(MartProduct).where(MartProduct.id.in_([it.product_id for it in items])))
    ).scalars().all()}
    countries = {p.country for p in products.values() if p}
    partner_prices: dict[str, dict] = {}
    for c in countries:
        partner_prices.update(await effective_partner_price(
            session, [p.id for p in products.values() if p.country == c], country=c, module="mart",
        ))

    lines: list[dict] = []
    subtotal = 0.0
    for it in items:
        p = products.get(it.product_id)
        if not p:
            continue
        pp = partner_prices.get(p.id)
        unit_price = float(pp["partner_price"]) if pp else float(p.price)
        line_total = round(unit_price * it.quantity, 2)
        subtotal += line_total
        lines.append({
            "product_id": p.id,
            "name": p.name,
            "unit": p.unit,
            "brand": p.brand,
            "image": p.image,
            "price": unit_price,
            "quantity": it.quantity,
            "line_total": line_total,
            "currency": p.currency,
        })
    return cart, lines, round(subtotal, 2)


@router.get("/mart/cart/eligibility")
async def cart_eligibility(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
    use_points: int = Query(0, ge=0),
):
    """Return eligibility for the customer's active cart.
    Frontend uses this as the single-source-of-truth for the checkout gate.

    Also previews reward-points redemption when `use_points` is provided.
    """
    _cart, _lines, subtotal = await _snapshot_cart(session, customer.id)
    country = await get_country_config(session, customer.country or "CI") or {}
    elig = check_order_eligibility(
        subtotal=subtotal,
        country_delivery_fee=country.get("delivery_fee", 0),
        country_free_delivery_over=country.get("free_delivery_over", 0),
        min_order=country.get("min_order", 0),
    )
    elig["currency"] = country.get("currency", "")
    elig["currency_symbol"] = country.get("currency_symbol", "")

    # Rewards preview
    available = int(customer.reward_points or 0)
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
    # Rich Google Places / global address fields (all optional, forward-compatible)
    place_id: Optional[str] = None
    formatted_address: Optional[str] = None
    region: Optional[str] = None
    postal_code: Optional[str] = None
    label: Optional[str] = None


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


SLOT_LABELS = {
    "express": ("slot_express", "10-15 min · Express"),
    "superfast": ("slot_superfast", "20-30 min · Super Fast"),
    "standard": ("slot_standard", "30-45 min · Standard"),
    "later": ("slot_later", "Schedule later"),
}


async def _order_to_dict(session: AsyncSession, order: Order) -> dict:
    items = (await session.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
    data = row_to_dict(order, rename={"address_snapshot": "address"})
    data["items"] = [row_to_dict(i) for i in items]

    # Attach partner-fulfilment summary so the customer confirmation screen
    # can render "sourced from N stores" — we join partner_orders → partners.
    from core.models import PartnerOrder, Partner
    po_rows = (await session.execute(
        select(PartnerOrder).where(PartnerOrder.order_id == order.id)
    )).scalars().all()
    partners_by_id = {}
    if po_rows:
        rows = (await session.execute(
            select(Partner).where(Partner.id.in_([po.partner_id for po in po_rows]))
        )).scalars().all()
        partners_by_id = {p.id: p for p in rows}

    data["partners"] = [
        {
            "partner_id": po.partner_id,
            "partner_name": (partners_by_id.get(po.partner_id).business_name
                             if partners_by_id.get(po.partner_id) else "Store"),
            "subtotal": float(po.subtotal or 0),
            "item_count": int(po.item_count or 0),
            "status": po.status,
        }
        for po in po_rows
    ]
    data["partner_count"] = len(po_rows)
    return data


@router.post("/orders")
async def create_order(
    payload: CreateOrderIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    # Everything below participates in one implicit transaction (the session
    # auto-begins on first use and is only committed once, at the very end) —
    # any exception raised before that final commit leaves zero partial writes.
    cart, lines, master_subtotal = await _snapshot_cart(session, customer.id)
    if not lines:
        raise HTTPException(400, "Cart is empty")

    country = await get_country_config(session, customer.country or "CI") or {}

    # ---- Resolve delivery address FIRST — the allocator needs its lat/lng ----
    address_snapshot = None
    source_address_id = None
    if payload.address_id:
        addr_row = await session.get(CustomerAddress, payload.address_id)
        if addr_row and addr_row.customer_id == customer.id:
            address_snapshot = row_to_dict(addr_row)
            source_address_id = addr_row.id
    if not address_snapshot and payload.address:
        addr_doc = payload.address.model_dump()
        addr_doc["country"] = (addr_doc.get("country") or customer.country or "CI").upper()
        addr_row = CustomerAddress(**addr_doc, customer_id=customer.id)
        session.add(addr_row)
        await session.flush()
        address_snapshot = row_to_dict(addr_row)
        source_address_id = addr_row.id
    if not address_snapshot:
        raise HTTPException(400, "Address is required (provide address_id or inline address)")

    # ---- Inventory Allocation ----
    # Route each cart line to a partner that has stock + is closest to the
    # delivery address. If ANY line can't be filled we fail the whole checkout
    # — the customer sees ONE order, so a partial allocation makes no sense.
    from modules.mart_partner.allocation import allocate
    try:
        plan = await allocate(
            session,
            cart_lines=[{"master_product_id": ln["product_id"], "quantity": ln["quantity"]} for ln in lines],
            country=(customer.country or "CI"),
            module="mart",
            delivery_lat=address_snapshot.get("latitude"),
            delivery_lng=address_snapshot.get("longitude"),
            delivery_city=address_snapshot.get("city"),
            lock_stock=True,
        )
    except ValueError as ve:
        msg = str(ve)
        if msg.startswith("insufficient_stock:"):
            raise HTTPException(status_code=409, detail={
                "code": "insufficient_stock",
                "message": ("Out of stock — the last units were just claimed. "
                            "Please refresh and try again."),
            }) from ve
        raise
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        # Broadened safety net: any unforeseen allocation failure (DB deadlock,
        # ORM drift, lock timeout) should return a stable 409/500 rather than a
        # raw stack trace, and MUST be logged so silent breakage is impossible.
        import logging
        logging.getLogger("baked").exception(
            "checkout.allocation_failed", extra={"error": repr(exc)}
        )
        raise HTTPException(status_code=409, detail={
            "code": "allocation_failed",
            "message": ("We couldn't reserve stock right now. Please refresh "
                        "your cart and try again in a moment."),
        }) from exc
    if not plan.fulfillable:
        # Enrich unfulfillable rows with human-friendly names for the UI.
        gaps = []
        for u in plan.unfulfillable:
            for ln in lines:
                if ln["product_id"] == u.master_product_id:
                    gaps.append({"name": ln["name"], "quantity": u.quantity_requested,
                                 "reason": u.reason, "stocked_by_count": u.stocked_by_count})
                    break
        raise HTTPException(status_code=400, detail={
            "code": "not_available_in_area",
            "message": ("Some items in your cart aren't available in your area yet. "
                        "MARTbakēd is coming soon to more stores."),
            "gaps": gaps,
        })

    # ---- Pricing: partner_price replaces master price for the totals ----
    subtotal = round(plan.subtotal, 2)

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
    currency = country.get("currency", plan.currency)

    # ---- Rewards redemption ----
    available_points = int(customer.reward_points or 0)
    use_points = min(max(0, payload.use_points), available_points)
    # Never let a redemption drive the total below the minimum-order threshold
    max_discount_allowed = max(0.0, subtotal_after_delivery - (country.get("min_order", 0) or 0))
    points_discount = round(min(use_points / REWARD_CONVERSION, max_discount_allowed), 2)
    # Round redemption down to whole points if capped
    if points_discount < use_points / REWARD_CONVERSION:
        use_points = int(points_discount * REWARD_CONVERSION)
    total = round(subtotal_after_delivery - points_discount, 2)

    # Resolve delivery slot (id + label, else code, else default)
    slot_id = payload.delivery_slot_id
    slot_label = payload.delivery_slot_label
    if not slot_id and payload.delivery_slot:
        slot_id, slot_label = SLOT_LABELS.get(payload.delivery_slot, ("slot_express", "10-15 min · Express"))
    if not slot_id:
        slot_id, slot_label = ("slot_express", "10-15 min · Express")

    points_earned = int(subtotal * REWARD_EARN_RATE)
    order = Order(
        number="",  # filled below once we have the generated id
        customer_id=customer.id,
        module="mart",
        country=customer.country or "CI",
        status="pending",
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        points_redeemed=use_points,
        points_discount=points_discount,
        points_earned=points_earned,
        total=total,
        currency=currency,
        address_snapshot=address_snapshot,
        source_address_id=source_address_id,
        delivery_slot_id=slot_id,
        delivery_slot_label=slot_label,
        payment_method=payload.payment_method,
        payment_status="pending",
        instructions=payload.instructions,
        # Consolidation only kicks in when 2+ partners are involved.
        consolidation_status="pending" if plan.partner_count > 1 else "not_applicable",
    )
    session.add(order)
    await session.flush()
    order.number = f"BK{order.id[-8:].upper()}"

    # ---- Create PartnerOrder rows + tagged OrderItems ----
    # We deliberately build them in one pass so every OrderItem lands with its
    # partner_order_id already set (no back-fill pass).
    from core.models import PartnerOrder as PartnerOrderModel
    partner_slices_for_notification: list[tuple[str, str]] = []
    for slice_ in plan.slices:
        po = PartnerOrderModel(
            partner_id=slice_.partner_id,
            order_id=order.id,
            status="new",
            subtotal=slice_.subtotal,
            item_count=sum(al.quantity for al in slice_.lines),
        )
        session.add(po)
        await session.flush()  # need po.id for the OrderItem tagging below
        partner_slices_for_notification.append((slice_.partner_id, po.id))
        for al in slice_.lines:
            session.add(OrderItem(
                order_id=order.id,
                product_id=al.master_product_id,
                partner_id=slice_.partner_id,
                partner_order_id=po.id,
                partner_product_id=al.partner_product_id,
                name=al.name, brand=al.brand, unit=al.unit, image=al.image,
                price=al.unit_price,
                quantity=al.quantity,
                line_total=round(al.line_total, 2),
                currency=al.currency,
            ))

    # Fire OrderCreated
    await event_bus.publish(Events.ORDER_CREATED, {"order_id": order.id, "customer_id": customer.id, "total": total})

    # Authorize payment (COD auto-authorizes)
    provider = get_payment_provider(payload.payment_method)
    order_for_provider = {"id": order.id, "number": order.number, "total": total, "currency": currency}
    try:
        intent = await provider.create_intent(order_for_provider)
    except NotImplementedError as e:
        raise HTTPException(400, str(e)) from e

    order.payment_status = intent["status"]
    order.payment_provider = intent.get("provider")
    order.payment_provider_ref = intent.get("provider_ref")
    if intent["status"] in ("succeeded", "authorized"):
        order.status = "confirmed"
        await event_bus.publish(
            Events.PAYMENT_COMPLETED, {"order_id": order.id, "amount": total, "provider": intent.get("provider")}
        )

        # Rewards: deduct redeemed points, credit earned points, record entries
        points_delta = points_earned - use_points
        if points_delta != 0 or use_points > 0:
            customer.reward_points = max(0, available_points + points_delta)
        if points_earned > 0:
            session.add(
                RewardEntry(
                    customer_id=customer.id, kind="earned", points=points_earned,
                    order_id=order.id, order_number=order.number, label=f"Earned on {order.number}",
                )
            )
        if use_points > 0:
            session.add(
                RewardEntry(
                    customer_id=customer.id, kind="redeemed", points=-use_points,
                    order_id=order.id, order_number=order.number, label=f"Redeemed on {order.number}",
                )
            )

    # Clear the cart
    if cart:
        await session.execute(sa_delete(CartItem).where(CartItem.cart_id == cart.id))

    # Analytics
    await event_bus.publish(
        Events.ANALYTICS_UPDATED, {"kind": "order_created", "country": order.country, "total": total, "currency": currency}
    )
    # Audit
    session.add(
        AuditLog(
            actor_id=customer.id, actor_kind="customer", action="order.created",
            target_id=order.id, metadata_={"total": total, "currency": currency,
                                            "partner_count": plan.partner_count},
        )
    )

    await session.commit()

    # Slice F — fire partner notifications (SMS + email). Fire-and-forget so
    # a slow SMS provider never adds latency to the customer's checkout.
    try:
        from modules.mart_partner.notifications import dispatch_new_order_notifications
        dispatch_new_order_notifications(order.id, partner_slices_for_notification)
    except Exception:  # noqa: BLE001
        import logging
        logging.getLogger("baked").exception("notify.new_order.dispatch_failed")

    out = await _order_to_dict(session, order)
    # Add partner summary so the confirmation screen can show "fulfilled from N stores"
    out["partners"] = [
        {"partner_id": s.partner_id, "partner_name": s.partner_name,
         "warehouse_city": s.warehouse_city, "subtotal": round(s.subtotal, 2),
         "item_count": sum(al.quantity for al in s.lines)}
        for s in plan.slices
    ]
    out["partner_count"] = plan.partner_count
    return out


@router.get("/orders/me")
async def list_my_orders(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(30, le=100),
):
    rows = (
        (
            await session.execute(
                select(Order)
                .where(Order.customer_id == customer.id, Order.deleted_at.is_(None))
                .order_by(Order.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [await _order_to_dict(session, o) for o in rows]


async def _get_owned_order(session: AsyncSession, order_id: str, customer_id: str) -> Order:
    order = await session.get(Order, order_id)
    if not order or order.customer_id != customer_id:
        raise HTTPException(404, "Order not found")
    return order


@router.get("/orders/{order_id}")
async def get_order(
    order_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    order = await _get_owned_order(session, order_id, customer.id)
    return await _order_to_dict(session, order)


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    order = await _get_owned_order(session, order_id, customer.id)
    if order.status not in ("pending", "confirmed"):
        raise HTTPException(400, f"Cannot cancel order in status {order.status}")
    order.status = "cancelled"
    await session.commit()
    await event_bus.publish(Events.ORDER_UPDATED, {"order_id": order_id, "status": "cancelled"})
    return await _order_to_dict(session, order)


# ---------- tracking (mock/demo) ----------
# Demo driver + store coordinates per country
_COUNTRY_GEO = {
    "CI": {"store": {"name": "MARTbakēd Store · Cocody", "lat": 5.3455, "lng": -4.0021}, "destination": {"lat": 5.3535, "lng": -3.9857}},
    "LR": {"store": {"name": "MARTbakēd Store · Sinkor", "lat": 6.2833, "lng": -10.7783}, "destination": {"lat": 6.3005, "lng": -10.7969}},
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


def _elapsed_seconds(order: Order) -> int:
    created = order.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return int((datetime.now(timezone.utc) - created).total_seconds())


def _current_stage(elapsed: int) -> str:
    stage = "placed"
    for code, at, _lbl in _TIMELINE_STAGES:
        if elapsed >= at:
            stage = code
    return stage


@router.get("/orders/{order_id}/tracking")
async def order_tracking(
    order_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    order = await _get_owned_order(session, order_id, customer.id)
    elapsed = _elapsed_seconds(order)

    # Honour cancelled state
    if order.status == "cancelled":
        return {"order": await _order_to_dict(session, order), "stage": "cancelled", "timeline": [], "driver": None, "geo": None, "eta_seconds": None}

    # Compute the demo-progressed stage. If persisted status is "delivered", pin to it.
    stage = "delivered" if order.status == "delivered" else _current_stage(elapsed)

    # Persist the auto-advanced status so admins & other views see it consistently
    desired = "delivered" if stage == "delivered" else (
        "on_the_way" if stage == "on_the_way" else
        "picked_up" if stage == "picked_up" else
        "preparing" if stage == "preparing" else
        order.status
    )
    if desired != order.status:
        order.status = desired
        await session.commit()

    country = (order.country or "CI").upper()
    geo = _COUNTRY_GEO.get(country) or _COUNTRY_GEO["CI"]
    # If a destination lat/lng exists on the address, use it
    addr = order.address_snapshot or {}
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
    started = order.created_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
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
        "order": await _order_to_dict(session, order),
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
async def rate_order(
    order_id: str,
    payload: RateOrderIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    order = await _get_owned_order(session, order_id, customer.id)
    order.rating = payload.rating
    order.rating_comment = payload.comment or ""
    order.rated_at = datetime.now(timezone.utc)
    await session.commit()
    return await _order_to_dict(session, order)
