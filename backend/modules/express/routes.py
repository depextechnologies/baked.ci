"""EXPRESSbakēd — customer-facing REST endpoints.

All configuration (vehicles, package types, pricing rules, mover items) lives
in Postgres and is editable from Super Admin. Booking status transitions are
recorded in `express_booking_timeline` for auditability.
"""
from __future__ import annotations
import secrets
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import SessionLocal, get_session
from core.deps import get_current_customer
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
async def list_vehicles(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    """Active vehicles for a given country, sorted by admin-controlled order."""
    rows = (
        (
            await session.execute(
                select(ExpressVehicle)
                .where(ExpressVehicle.country == country.upper(), ExpressVehicle.active.is_(True))
                .order_by(ExpressVehicle.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


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
    pickup: AddressPoint
    drop: AddressPoint
    receiver: ReceiverIn
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


@router.post("/bookings/parcel")
async def create_parcel_booking(
    payload: ParcelBookingIn,
    background: BackgroundTasks,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
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
        receiver_name=payload.receiver.name,
        receiver_phone=payload.receiver.phone,
        receiver_alt_phone=payload.receiver.alt_phone,
        receiver_building=payload.receiver.building,
        receiver_landmark=payload.receiver.landmark,
        receiver_notes=payload.receiver.notes,
        receiver_preferences=payload.receiver.preferences,
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
    data = await booking_to_dict(session, booking)
    # Kick off the driver simulator in DEMO_MODE (production path relies on
    # driver-app status endpoints below to advance the lifecycle).
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
        raise HTTPException(404, "Booking not found")
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
        raise HTTPException(400, "Cannot cancel this booking")
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


class DriverStatusIn(BaseModel):
    status: str  # arriving | picked_up | in_transit | delivered
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/bookings/{booking_id}/driver-status")
async def driver_advance_status(
    booking_id: str, payload: DriverStatusIn, session: AsyncSession = Depends(get_session)
):
    from modules.express.tracking import transition_status
    from modules.express.dispatch import release_driver

    booking = await session.get(ExpressBooking, booking_id)
    if not booking:
        raise HTTPException(404, "Booking not found")
    curr = booking.status
    allowed = ALLOWED_TRANSITIONS.get(curr, set())
    if payload.status not in allowed:
        raise HTTPException(400, f"Cannot transition {curr!r} → {payload.status!r}")
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


# ---------- Utilities ----------
def _make_booking_ref(prefix: str = "EXP") -> str:
    # 8-digit human-readable reference (ms timestamp) + 4-hex random suffix
    # to prevent collisions under high concurrency.
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"{prefix}{ts % 100000000:08d}{secrets.token_hex(2).upper()}"
