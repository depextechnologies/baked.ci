"""EXPRESSbakēd — customer-facing REST endpoints.

All configuration (vehicles, package types, pricing rules, mover items) lives
in Postgres and is editable from Super Admin. Booking status transitions are
recorded in `express_booking_timeline` for auditability.
"""
from __future__ import annotations
import secrets
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import SessionLocal, get_session
from core.deps import get_current_customer
from core.i18n import t as _t, current_lang
from core.models import (
    Customer,
    ExpressBooking,
    ExpressBookingItem,
    ExpressBookingTimeline,
    ExpressDeliveryPref,
    ExpressMoversCategory,
    ExpressMoversItem,
    ExpressMoveType,
    ExpressPackageType,
    ExpressTimeSlot,
    ExpressVehicle,
    SendServiceVehicle,
    SEND_SERVICE_TYPES,
    ExpressWeightTier,
    new_id,
)
from core.serializers import row_to_dict
from modules.express.pricing import quote_parcel, quote_movers
from modules.express.serializers import booking_to_dict, public_booking_fields
from modules.express.tracking import (
    manager as ws_manager,
    run_demo_simulation,
    demo_mode_enabled,
)

router = APIRouter(prefix="/express", tags=["express"])


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# ---------- Configuration reads ----------
@router.get("/vehicles")
async def list_vehicles(
    country: str = Query("CI"),
    service_type: Optional[str] = Query(None, description="Filter to vehicles eligible for a SEND service tile"),
    session: AsyncSession = Depends(get_session),
):
    """Active vehicles for a given country, sorted by admin-controlled order.

    When `service_type` is supplied the result is filtered via the
    `send_service_vehicles` config table so the customer only sees vehicles
    eligible for the SEND service they picked (Phase C — no separate vehicle
    picker screen). Rows are sorted by the service-specific `sort_order`
    when the filter applies, otherwise by the vehicle's own `sort_order`.
    """
    if service_type is not None and service_type not in SEND_SERVICE_TYPES:
        raise HTTPException(400, {
            "code": "unknown_service_type",
            "message": f"Unknown SEND service_type: {service_type}",
            "allowed": list(SEND_SERVICE_TYPES),
        })

    q = (
        select(ExpressVehicle)
        .where(ExpressVehicle.country == country.upper(), ExpressVehicle.active.is_(True))
    )
    if service_type:
        eligibility = (await session.execute(
            select(SendServiceVehicle.vehicle_code, SendServiceVehicle.sort_order)
            .where(
                SendServiceVehicle.service_type == service_type,
                SendServiceVehicle.active.is_(True),
            )
        )).all()
        allowed_order = {code: sort for code, sort in eligibility}
        if not allowed_order:
            return []
        q = q.where(ExpressVehicle.code.in_(list(allowed_order.keys())))
        rows = (await session.execute(q)).scalars().all()
        rows.sort(key=lambda v: (allowed_order.get(v.code, 999), v.sort_order))
    else:
        rows = (await session.execute(q.order_by(ExpressVehicle.sort_order))).scalars().all()

    return [row_to_dict(r) for r in rows]


@router.get("/product-types")
async def list_send_product_types(session: AsyncSession = Depends(get_session)):
    """SEND Multiple Shipments — configurable product-type catalogue.

    Returns active rows sorted by `sort_order`, with the row flagged as
    default first-in-line (`is_default`). Frontend must NEVER hard-code
    this list — ops edits are applied without a deploy.
    """
    from core.models import SendProductType
    rows = (await session.execute(
        select(SendProductType)
        .where(SendProductType.active.is_(True))
        .order_by(SendProductType.sort_order, SendProductType.code)
    )).scalars().all()
    return [
        {
            "code":       r.code,
            "name_fr":    r.name_fr,
            "name_en":    r.name_en,
            "is_default": bool(r.is_default),
            "sort_order": r.sort_order,
        }
        for r in rows
    ]


@router.get("/services")
async def list_send_services(session: AsyncSession = Depends(get_session)):
    """Return the full SEND service → eligible vehicle catalogue.

    The frontend uses this endpoint as a single source of truth: which
    services exist, which vehicle codes qualify, in what order. No
    hard-coded lists on the client.
    """
    rows = (await session.execute(
        select(SendServiceVehicle)
        .where(SendServiceVehicle.active.is_(True))
        .order_by(SendServiceVehicle.service_type, SendServiceVehicle.sort_order)
    )).scalars().all()
    grouped: dict[str, list[dict]] = {s: [] for s in SEND_SERVICE_TYPES}
    for r in rows:
        grouped.setdefault(r.service_type, []).append({
            "vehicle_code": r.vehicle_code,
            "sort_order":   r.sort_order,
        })
    return {"service_types": list(SEND_SERVICE_TYPES), "services": grouped}


@router.get("/package-types")
async def list_package_types(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(ExpressPackageType)
                .where(ExpressPackageType.country == country.upper(), ExpressPackageType.active.is_(True))
                .order_by(ExpressPackageType.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/weight-tiers")
async def list_weight_tiers(session: AsyncSession = Depends(get_session)):
    """Weight-range chips (config-driven so ranges can be relabelled per market)."""
    rows = (
        (await session.execute(select(ExpressWeightTier).where(ExpressWeightTier.active.is_(True)).order_by(ExpressWeightTier.sort_order)))
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/delivery-preferences")
async def list_delivery_preferences(session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(ExpressDeliveryPref).where(ExpressDeliveryPref.active.is_(True)).order_by(ExpressDeliveryPref.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


# ---------- Quotes ----------
class ParcelQuoteIn(BaseModel):
    country: str = "CI"
    vehicle_code: str
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    package_type: Optional[str] = None
    package_weight_range: Optional[str] = None
    promo_code: Optional[str] = None
    peak: bool = False
    night: bool = False
    declared_value: Optional[float] = None


@router.post("/quote/parcel")
async def parcel_quote(payload: ParcelQuoteIn, session: AsyncSession = Depends(get_session)):
    return await quote_parcel(
        session,
        country=payload.country,
        vehicle_code=payload.vehicle_code,
        pickup_lat=payload.pickup_lat, pickup_lng=payload.pickup_lng,
        drop_lat=payload.drop_lat, drop_lng=payload.drop_lng,
        promo_code=payload.promo_code,
        peak=payload.peak, night=payload.night,
        declared_value=payload.declared_value,
    )


# ---------- Phase E · Multi-stop trip quote ----------

class MultiStopLatLng(BaseModel):
    lat: float
    lng: float


class MultiStopEntry(BaseModel):
    pickup: MultiStopLatLng
    drop:   MultiStopLatLng


class MultiStopQuoteIn(BaseModel):
    country: str = "CI"
    vehicle_code: str
    stops: List[MultiStopEntry] = Field(min_length=1, max_length=8)
    promo_code: Optional[str] = None
    peak: bool = False
    night: bool = False


@router.post("/quote/multi_stop")
async def multi_stop_quote(payload: MultiStopQuoteIn, session: AsyncSession = Depends(get_session)):
    from .pricing import quote_multi_stop
    try:
        return await quote_multi_stop(
            session,
            country=payload.country,
            vehicle_code=payload.vehicle_code,
            stops=[s.model_dump() for s in payload.stops],
            promo_code=payload.promo_code,
            peak=payload.peak, night=payload.night,
        )
    except ValueError as e:
        raise HTTPException(400, {"code": "invalid_multi_stop", "message": str(e)})


class MoverItemIn(BaseModel):
    item_id: str
    qty: int = Field(ge=1)


class MoversQuoteIn(BaseModel):
    country: str = "CI"
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    items: List[MoverItemIn] = []
    labour_movers: int = 2
    floors_pickup: int = 0
    floors_drop: int = 0
    stairs_pickup: bool = False
    stairs_drop: bool = False
    declared_value: Optional[float] = None
    time_slot_surcharge: float = 0.0


@router.post("/quote/movers")
async def movers_quote(payload: MoversQuoteIn, session: AsyncSession = Depends(get_session)):
    data = payload.model_dump()
    items = data.pop("items")
    return await quote_movers(session, items=[it for it in items], **data)


# ---------- Movers config ----------
@router.get("/movers/categories")
async def movers_categories(session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(ExpressMoversCategory).where(ExpressMoversCategory.active.is_(True)).order_by(ExpressMoversCategory.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/movers/items")
async def movers_items(
    category: Optional[str] = Query(None), country: str = Query("CI"), session: AsyncSession = Depends(get_session)
):
    stmt = select(ExpressMoversItem).where(
        ExpressMoversItem.active.is_(True),
        or_(ExpressMoversItem.country == country.upper(), ExpressMoversItem.country.is_(None)),
    )
    if category:
        stmt = stmt.where(ExpressMoversItem.category_code == category)
    rows = (await session.execute(stmt.order_by(ExpressMoversItem.sort_order).limit(500))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.get("/movers/move-types")
async def movers_types(session: AsyncSession = Depends(get_session)):
    rows = (
        (await session.execute(select(ExpressMoveType).where(ExpressMoveType.active.is_(True)).order_by(ExpressMoveType.sort_order)))
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/movers/time-slots")
async def movers_time_slots(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(ExpressTimeSlot)
                .where(ExpressTimeSlot.active.is_(True), ExpressTimeSlot.country == country.upper())
                .order_by(ExpressTimeSlot.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


# ---------- Bookings ----------
class AddressPoint(BaseModel):
    line1: str
    latitude: float
    longitude: float
    formatted_address: Optional[str] = None
    place_id: Optional[str] = None
    landmark: Optional[str] = None
    building: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None


class ReceiverIn(BaseModel):
    name: str
    phone: str
    alt_phone: Optional[str] = None
    building: Optional[str] = None
    landmark: Optional[str] = None
    notes: Optional[str] = None
    preferences: List[str] = []  # e.g. ["call_before", "leave_at_door", "signature"]


class ParcelBookingIn(BaseModel):
    country: str = "CI"
    vehicle_code: str
    service_type: Optional[str] = None    # Phase C — SEND service tile origin
    pickup: AddressPoint
    drop: AddressPoint
    # Phase E — ordered list of {pickup, drop} pairs, used when
    # service_type=multiple_shipments. When present the first entry must
    # match the top-level pickup/drop (Step 1 seed). Ignored otherwise.
    stops: Optional[List[dict]] = None
    # Multi-shipments bookings capture the receiver per-leg inside stops[]
    # so the top-level Receiver becomes optional. Falls back to the first
    # drop's contact when the customer never entered a global receiver.
    receiver: Optional[ReceiverIn] = None
    package_type: Optional[str] = None
    package_weight_range: Optional[str] = None
    package_dimensions: Optional[dict] = None
    package_notes: Optional[str] = None
    promo_code: Optional[str] = None
    declared_value: Optional[float] = None
    scheduled_for: Optional[str] = None
    payment_method: str = "cod"


def _address_columns(prefix: str, addr: AddressPoint) -> dict:
    return {
        f"{prefix}_line1": addr.line1,
        f"{prefix}_latitude": addr.latitude,
        f"{prefix}_longitude": addr.longitude,
        f"{prefix}_formatted_address": addr.formatted_address,
        f"{prefix}_place_id": addr.place_id,
        f"{prefix}_landmark": addr.landmark,
        f"{prefix}_building": addr.building,
        f"{prefix}_city": addr.city,
        f"{prefix}_country": addr.country,
    }


def _receiver_field(payload: "ParcelBookingIn", field: str, stops: Optional[list]) -> Optional[str]:
    """Multi-Shipments makes the top-level Receiver optional (per-leg
    contact is captured inside stops[]). Falls back to the FIRST drop's
    contact so downstream single-column code (SMS, driver snapshot) keeps
    working uniformly. Never raises."""
    if payload.receiver is not None:
        val = getattr(payload.receiver, field, None)
        if val:
            return val
    if stops:
        first_drop = (stops[0] or {}).get("drop") or {}
        if field == "name":
            return first_drop.get("receiver_name") or first_drop.get("contact_name") or "Recipient"
        if field == "phone":
            return first_drop.get("receiver_phone") or first_drop.get("contact_phone") or ""
    return None


@router.post("/bookings/parcel")
async def create_parcel_booking(
    payload: ParcelBookingIn,
    background: BackgroundTasks,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    # Phase C — service_type → eligible-vehicle enforcement. Guarantees a
    # customer who selected e.g. Fresh Products can only book a refrigerated
    # vehicle, no matter what payload the client happens to send.
    if payload.service_type is not None:
        if payload.service_type not in SEND_SERVICE_TYPES:
            raise HTTPException(400, {
                "code": "unknown_service_type",
                "message": f"Unknown SEND service_type: {payload.service_type}",
                "allowed": list(SEND_SERVICE_TYPES),
            })
        allowed = (await session.execute(
            select(SendServiceVehicle.vehicle_code)
            .where(
                SendServiceVehicle.service_type == payload.service_type,
                SendServiceVehicle.active.is_(True),
            )
        )).scalars().all()
        if payload.vehicle_code not in set(allowed):
            raise HTTPException(400, {
                "code": "vehicle_not_eligible",
                "message": f"Vehicle '{payload.vehicle_code}' is not eligible for service '{payload.service_type}'",
                "eligible_vehicle_codes": list(allowed),
            })
    # Phase E — Multi-stop pricing when the customer built a trip with N
    # shipments. Falls back to the legacy single-shipment quote for every
    # other service_type.
    multi_stops_payload = None
    if payload.service_type == "multiple_shipments" and payload.stops and len(payload.stops) >= 1:
        from .pricing import quote_multi_stop
        # Normalise into {pickup:{lat,lng}, drop:{lat,lng}} tuples.
        norm_stops = []
        for s in payload.stops:
            try:
                norm_stops.append({
                    "pickup": {"lat": float(s["pickup"]["lat"]), "lng": float(s["pickup"]["lng"])},
                    "drop":   {"lat": float(s["drop"]["lat"]),   "lng": float(s["drop"]["lng"])},
                })
            except (KeyError, TypeError, ValueError):
                raise HTTPException(400, {"code": "invalid_multi_stop", "message": "Malformed stop entry"})
        # The first stop must match the top-level pickup/drop (Step 1 seed).
        first = norm_stops[0]
        if (abs(first["pickup"]["lat"] - payload.pickup.latitude)  > 1e-4
            or abs(first["pickup"]["lng"] - payload.pickup.longitude) > 1e-4
            or abs(first["drop"]["lat"]  - payload.drop.latitude)   > 1e-4
            or abs(first["drop"]["lng"]  - payload.drop.longitude)  > 1e-4):
            raise HTTPException(400, {
                "code": "multi_stop_head_mismatch",
                "message": "First shipment must match the primary pickup/drop pair.",
            })
        quote = await quote_multi_stop(
            session,
            country=payload.country,
            vehicle_code=payload.vehicle_code,
            stops=norm_stops,
            promo_code=payload.promo_code,
        )
        # Full stops payload (with the raw address blobs from the client) is
        # persisted on the booking row so drivers + admin see every stop.
        # Enrich with per-leg status + delivery PIN (Driver Multi-Stop UX).
        # Product-type default is fetched from the send_product_types
        # catalogue so ops changes propagate without a redeploy.
        from .multi_stop import enrich_stops
        from core.models import SendProductType
        default_row = (await session.execute(
            select(SendProductType).where(
                SendProductType.is_default.is_(True),
                SendProductType.active.is_(True),
            ).limit(1)
        )).scalar_one_or_none()
        default_pt = default_row.code if default_row else "general_product"
        multi_stops_payload = enrich_stops(
            [s for s in payload.stops],
            default_product_type=default_pt,
        )
    else:
        quote = await quote_parcel(
            session,
            country=payload.country,
            vehicle_code=payload.vehicle_code,
            pickup_lat=payload.pickup.latitude, pickup_lng=payload.pickup.longitude,
            drop_lat=payload.drop.latitude, drop_lng=payload.drop.longitude,
            promo_code=payload.promo_code, declared_value=payload.declared_value,
        )
    ref = _make_booking_ref("EXP")
    booking = ExpressBooking(
        id=new_id("exp"),
        ref=ref,
        customer_id=customer.id,
        module="express",
        booking_type="parcel",
        service_type=payload.service_type,
        stops=multi_stops_payload,
        country=payload.country.upper(),
        status="searching",
        payment_method=payload.payment_method,
        payment_status="pending",
        currency=quote["currency"],
        currency_symbol=quote["currency_symbol"],
        total=quote["total"],
        vehicle_code=payload.vehicle_code,
        **_address_columns("pickup", payload.pickup),
        **_address_columns("drop", payload.drop),
        receiver_name=_receiver_field(payload, "name",  multi_stops_payload),
        receiver_phone=_receiver_field(payload, "phone", multi_stops_payload),
        receiver_alt_phone=(payload.receiver.alt_phone if payload.receiver else None),
        receiver_building=(payload.receiver.building if payload.receiver else None),
        receiver_landmark=(payload.receiver.landmark if payload.receiver else None),
        receiver_notes=(payload.receiver.notes if payload.receiver else None),
        receiver_preferences=(payload.receiver.preferences if payload.receiver else []),
        package_type=payload.package_type,
        package_weight_range=payload.package_weight_range,
        package_dimensions=payload.package_dimensions,
        package_notes=payload.package_notes,
        distance_km=quote["distance_km"],
        duration_min=quote["duration_min"],
        price_breakdown=quote,
        scheduled_for=_parse_dt(payload.scheduled_for),
    )
    session.add(booking)
    await session.flush()
    now = datetime.now(timezone.utc)
    session.add_all([
        ExpressBookingTimeline(booking_id=booking.id, code="created", label="Booking created", at=now),
        ExpressBookingTimeline(booking_id=booking.id, code="searching", label="Searching for a driver…", at=now),
    ])
    await session.commit()
    # Multi-stop: fire off per-drop SMS with the receiver's delivery PIN.
    # Best-effort — never fails the booking response.
    if multi_stops_payload:
        try:
            from .multi_stop import dispatch_delivery_pins
            await dispatch_delivery_pins(booking)
        except Exception:  # noqa: BLE001
            pass
    # --- Phase A: try to dispatch a real online driver immediately -------
    # The dispatcher is fire-and-forget — if no driver qualifies right now
    # the timeout worker will retry when a driver next comes online / pings.
    from modules.express.dispatch import dispatch_next_offer
    try:
        await dispatch_next_offer(session, booking)
        await session.commit()
    except Exception:  # noqa: BLE001 — never fail the customer's booking API
        await session.rollback()
    data = await booking_to_dict(session, booking)
    # Legacy demo-mode simulator — off by default in Phase A. Real dispatch
    # is authoritative; the sim exists only for local demos when explicitly
    # opted in via EXPRESS_DEMO_MODE=true (guarded here + inside tracking).
    if demo_mode_enabled():
        background.add_task(run_demo_simulation, booking.id)
    return data


class MoversBookingIn(BaseModel):
    country: str = "CI"
    move_type: str
    pickup: AddressPoint
    drop: AddressPoint
    pickup_building: dict = {}
    drop_building: dict = {}
    items: List[MoverItemIn] = []
    custom_items: List[dict] = []
    scheduled_date: Optional[str] = None
    time_slot_code: Optional[str] = None
    declared_value: Optional[float] = None
    labour_movers: int = 2
    payment_method: str = "cod"


@router.post("/bookings/movers")
async def create_movers_booking(
    payload: MoversBookingIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    time_slot_surcharge = 0.0
    if payload.time_slot_code:
        slot = (
            await session.execute(
                select(ExpressTimeSlot).where(
                    ExpressTimeSlot.code == payload.time_slot_code,
                    ExpressTimeSlot.country == payload.country.upper(),
                    ExpressTimeSlot.active.is_(True),
                )
            )
        ).scalar_one_or_none()
        time_slot_surcharge = float(slot.surcharge) if slot else 0.0
    quote = await quote_movers(
        session,
        country=payload.country,
        pickup_lat=payload.pickup.latitude, pickup_lng=payload.pickup.longitude,
        drop_lat=payload.drop.latitude, drop_lng=payload.drop.longitude,
        items=[it.model_dump() for it in payload.items],
        labour_movers=payload.labour_movers,
        floors_pickup=int(payload.pickup_building.get("floor") or 0),
        floors_drop=int(payload.drop_building.get("floor") or 0),
        stairs_pickup=bool(payload.pickup_building.get("stairs")),
        stairs_drop=bool(payload.drop_building.get("stairs")),
        declared_value=payload.declared_value,
        time_slot_surcharge=time_slot_surcharge,
    )
    ref = _make_booking_ref("EXPMV")
    booking = ExpressBooking(
        id=new_id("mov"),
        ref=ref,
        customer_id=customer.id,
        module="express",
        booking_type="movers",
        country=payload.country.upper(),
        status="confirmed",
        payment_method=payload.payment_method,
        payment_status="advance_pending",
        currency=quote["currency"],
        currency_symbol=quote["currency_symbol"],
        total=quote["total"],
        **_address_columns("pickup", payload.pickup),
        **_address_columns("drop", payload.drop),
        move_type=payload.move_type,
        movers_pickup_access=payload.pickup_building,
        movers_drop_access=payload.drop_building,
        custom_items=payload.custom_items,
        quote_breakdown=quote,
        advance=quote["advance"],
        remaining=quote["remaining"],
        scheduled_for=_parse_dt(payload.scheduled_date),
        time_slot_code=payload.time_slot_code,
        labour_movers=payload.labour_movers,
    )
    session.add(booking)
    await session.flush()
    session.add_all(
        ExpressBookingItem(booking_id=booking.id, item_id=it.item_id, qty=it.qty) for it in payload.items
    )
    session.add(
        ExpressBookingTimeline(
            booking_id=booking.id, code="created", label="Move booked", at=datetime.now(timezone.utc)
        )
    )
    await session.commit()
    return await booking_to_dict(session, booking)


@router.get("/bookings/mine")
async def my_bookings(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
    status: Optional[str] = Query(None),
):
    stmt = select(ExpressBooking).where(ExpressBooking.customer_id == customer.id, ExpressBooking.module == "express")
    if status == "active":
        stmt = stmt.where(ExpressBooking.status.in_(["searching", "driver_assigned", "picked", "in_transit", "confirmed"]))
    elif status == "completed":
        stmt = stmt.where(ExpressBooking.status == "delivered")
    elif status == "cancelled":
        stmt = stmt.where(ExpressBooking.status == "cancelled")
    rows = (await session.execute(stmt.order_by(ExpressBooking.created_at.desc()).limit(100))).scalars().all()
    return [await booking_to_dict(session, b) for b in rows]


@router.get("/bookings/{booking_id}")
async def get_booking(
    booking_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    booking = await session.get(ExpressBooking, booking_id)
    if not booking or booking.customer_id != customer.id:
        raise HTTPException(404, _t("errors.order.booking_not_found", current_lang()))
    return await booking_to_dict(session, booking)


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    from modules.express.tracking import transition_status

    booking = await session.get(ExpressBooking, booking_id)
    if (
        not booking
        or booking.customer_id != customer.id
        or booking.status not in ("searching", "driver_assigned", "confirmed")
    ):
        raise HTTPException(400, _t("errors.order.cannot_cancel_booking", current_lang()))
    return await transition_status(session, booking_id, "cancelled", label="Cancelled by customer")


# ---------- Live Tracking (WebSocket) ----------
@router.websocket("/ws/bookings/{booking_id}")
async def ws_booking(ws: WebSocket, booking_id: str):
    """Live booking stream. Sends an initial snapshot then broadcasts every
    subsequent status/location update. Auth is deliberately open (booking id
    is opaque). The client should treat received data as read-only."""
    await ws_manager.connect(booking_id, ws)
    try:
        async with SessionLocal() as session:
            booking = await session.get(ExpressBooking, booking_id)
            if booking:
                data = await booking_to_dict(session, booking)
                await ws.send_json({"type": "snapshot", **public_booking_fields(data)})
            else:
                await ws.send_json({"type": "error", "message": "Booking not found"})
        # Keep the socket open — the manager broadcasts new frames. We only
        # need to read from the client to detect disconnect.
        while True:
            try:
                _ = await ws.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        await ws_manager.disconnect(booking_id, ws)


# ---------- Driver-app status endpoint (production path) ----------
# When DEMO_MODE is off, the driver mobile app calls this after each real
# action. Kept simple/token-less here for Phase 2 scaffolding; a real driver
# JWT will guard it in Phase 5.
ALLOWED_TRANSITIONS = {
    "driver_assigned": {"arriving", "picked_up", "cancelled"},
    "arriving":        {"picked_up", "cancelled"},
    "picked_up":       {"in_transit", "cancelled"},
    "in_transit":      {"delivered", "cancelled"},
}


async def _authorise_driver_for_booking(booking, request, session):
    """Enforce that the caller is the ModuleDriver assigned to this booking.

    Shared by /driver-status and /stop-advance so both endpoints reject
    unauthenticated callers and drivers who aren't assigned to the trip.
    Raises HTTPException(401/403) — never returns falsy.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, _t("errors.auth.driver_jwt_required", current_lang()))
    try:
        from core.security import decode_token
        from core.models import ModuleDriver
        claims = decode_token(auth.split(" ", 1)[1])
        if not claims or claims.get("role") != "driver":
            raise HTTPException(401, _t("errors.auth.driver_jwt_required", current_lang()))
        md = (await session.execute(
            select(ModuleDriver).where(ModuleDriver.linked_driver_id == claims["sub"])
        )).scalar_one_or_none()
        if md is None or booking.driver_id != md.id:
            raise HTTPException(403, {"code": "not_your_booking",
                                      "message": _t("errors.auth.not_your_booking", current_lang())})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, _t("errors.auth.invalid_driver_creds", current_lang()))


class DriverStatusIn(BaseModel):
    status: str  # arriving | picked_up | in_transit | delivered
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/bookings/{booking_id}/driver-status")
async def driver_advance_status(
    booking_id: str, payload: DriverStatusIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    from modules.express.tracking import transition_status
    from modules.express.dispatch import release_driver

    booking = await session.get(ExpressBooking, booking_id)
    if not booking:
        raise HTTPException(404, _t("errors.order.booking_not_found", current_lang()))
    await _authorise_driver_for_booking(booking, request, session)

    curr = booking.status
    allowed = ALLOWED_TRANSITIONS.get(curr, set())
    if payload.status not in allowed:
        raise HTTPException(400, _t("errors.order.cannot_transition", current_lang(),
                                    current=curr, target=payload.status))
    driver_loc = None
    if payload.lat is not None and payload.lng is not None:
        driver_loc = {"lat": payload.lat, "lng": payload.lng}
    extra = {}
    if payload.status == "delivered":
        extra["delivered_at"] = datetime.now(timezone.utc)
        extra["payment_status"] = "paid"
    driver_id = booking.driver_id
    result = await transition_status(session, booking_id, payload.status, extra=extra, driver_location=driver_loc)
    if payload.status == "delivered" and driver_id:
        await release_driver(session, driver_id)
    return result


# ---------- Multi-stop leg advancement (Phase E driver UX) ----------
class StopAdvanceIn(BaseModel):
    sequence: int = Field(..., ge=1, le=32)
    leg: str = Field(..., description="'pickup' or 'drop'")
    delivery_pin: Optional[str] = Field(default=None, max_length=8)
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/bookings/{booking_id}/stop-advance")
async def driver_advance_stop_leg(
    booking_id: str, payload: StopAdvanceIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Advance a single (pickup|drop) leg of a specific stop in a multi-stop
    booking. Enforces ordered execution and delivery-PIN verification.
    Cascades the overall booking status and appends a timeline event.
    """
    from modules.express.multi_stop import advance_stop_leg, MultiStopError
    from modules.express.tracking import transition_status
    from modules.express.dispatch import release_driver

    booking = await session.get(ExpressBooking, booking_id)
    if not booking:
        raise HTTPException(404, _t("errors.order.booking_not_found", current_lang()))
    await _authorise_driver_for_booking(booking, request, session)

    if not booking.stops:
        raise HTTPException(400, {"code": "not_multi_stop",
                                  "message": "Booking is not a multi-stop booking."})

    try:
        target_stop, new_status = advance_stop_leg(
            booking,
            sequence=payload.sequence,
            leg=payload.leg,
            delivery_pin=payload.delivery_pin,
        )
    except MultiStopError as e:
        raise HTTPException(400, {"code": e.code, "message": e.message})

    # Persist the mutated stops JSONB.
    await session.commit()
    await session.refresh(booking)

    # Append a timeline event scoped to the checkpoint (survives status re-use).
    label = (
        f"Pickup {payload.sequence} completed" if payload.leg == "pickup"
        else f"Delivery {payload.sequence} completed"
    )
    code = f"stop_{payload.leg}_{payload.sequence}_completed"
    session.add(ExpressBookingTimeline(
        booking_id=booking.id, code=code, label=label,
        at=datetime.now(timezone.utc),
    ))
    await session.commit()

    # Cascade overall booking status through the standard tracker so all
    # WebSocket subscribers see the update.
    driver_loc = None
    if payload.lat is not None and payload.lng is not None:
        driver_loc = {"lat": payload.lat, "lng": payload.lng}
    extra = {}
    driver_id = booking.driver_id
    if new_status == "delivered":
        extra["delivered_at"] = datetime.now(timezone.utc)
        extra["payment_status"] = "paid"
    result = await transition_status(
        session, booking_id, new_status,
        extra=extra, driver_location=driver_loc, label=label,
    )
    if new_status == "delivered" and driver_id:
        await release_driver(session, driver_id)
    return result


# ---------- Utilities ----------
def _make_booking_ref(prefix: str = "EXP") -> str:
    # 8-digit human-readable reference (ms timestamp) + 4-hex random suffix
    # to prevent collisions under high concurrency.
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"{prefix}{ts % 100000000:08d}{secrets.token_hex(2).upper()}"
