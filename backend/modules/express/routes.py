"""EXPRESSbakēd — customer-facing REST endpoints.

All configuration (vehicles, package types, pricing rules, mover items) lives
in Mongo and is editable from Super Admin. Booking status transitions live
in `express_bookings.timeline` for auditability.
"""
from __future__ import annotations
import secrets
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel, Field

from core.db import db
from core.deps import get_current_customer
from core.models_base import _now_iso, new_id
from modules.express.pricing import quote_parcel, quote_movers
from modules.express.tracking import (
    manager as ws_manager,
    run_demo_simulation,
    demo_mode_enabled,
)

router = APIRouter(prefix="/express", tags=["express"])


# ---------- Configuration reads ----------
@router.get("/vehicles")
async def list_vehicles(country: str = Query("CI")):
    """Active vehicles for a given country, sorted by admin-controlled order."""
    docs = await db.express_vehicles.find(
        {"country": country.upper(), "active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(20)
    return docs


@router.get("/package-types")
async def list_package_types(country: str = Query("CI")):
    docs = await db.express_package_types.find(
        {"country": country.upper(), "active": True}, {"_id": 0}
    ).sort("sort_order", 1).to_list(30)
    return docs


@router.get("/weight-tiers")
async def list_weight_tiers():
    """Weight-range chips (config-driven so ranges can be relabelled per market)."""
    docs = await db.express_weight_tiers.find({"active": True}, {"_id": 0}).sort("sort_order", 1).to_list(20)
    return docs


@router.get("/delivery-preferences")
async def list_delivery_preferences():
    docs = await db.express_delivery_prefs.find({"active": True}, {"_id": 0}).sort("sort_order", 1).to_list(20)
    return docs


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
async def parcel_quote(payload: ParcelQuoteIn):
    return await quote_parcel(
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
async def movers_quote(payload: MoversQuoteIn):
    data = payload.model_dump()
    data["items"] = [it.model_dump() for it in payload.items]
    return await quote_movers(**data)


# ---------- Movers config ----------
@router.get("/movers/categories")
async def movers_categories():
    return await db.express_movers_categories.find({"active": True}, {"_id": 0}).sort("sort_order", 1).to_list(30)


@router.get("/movers/items")
async def movers_items(category: Optional[str] = Query(None), country: str = Query("CI")):
    q = {"active": True, "$or": [{"country": country.upper()}, {"country": {"$in": [None, "ALL"]}}]}
    if category:
        q["category_code"] = category
    return await db.express_movers_items.find(q, {"_id": 0}).sort("sort_order", 1).to_list(500)


@router.get("/movers/move-types")
async def movers_types():
    return await db.express_move_types.find({"active": True}, {"_id": 0}).sort("sort_order", 1).to_list(20)


@router.get("/movers/time-slots")
async def movers_time_slots(country: str = Query("CI")):
    return await db.express_time_slots.find({"active": True, "country": country.upper()}, {"_id": 0}).sort("sort_order", 1).to_list(20)


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


@router.post("/bookings/parcel")
async def create_parcel_booking(payload: ParcelBookingIn, background: BackgroundTasks, customer: dict = Depends(get_current_customer)):
    quote = await quote_parcel(
        country=payload.country,
        vehicle_code=payload.vehicle_code,
        pickup_lat=payload.pickup.latitude, pickup_lng=payload.pickup.longitude,
        drop_lat=payload.drop.latitude, drop_lng=payload.drop.longitude,
        promo_code=payload.promo_code, declared_value=payload.declared_value,
    )
    now = _now_iso()
    ref = _make_booking_ref("EXP")
    doc = {
        "id": new_id("exp"),
        "ref": ref,
        "customer_id": customer["id"],
        "module": "express",
        "booking_type": "parcel",
        "country": payload.country.upper(),
        "vehicle_code": payload.vehicle_code,
        "pickup": payload.pickup.model_dump(),
        "drop": payload.drop.model_dump(),
        "receiver": payload.receiver.model_dump(),
        "package": {
            "type": payload.package_type,
            "weight_range": payload.package_weight_range,
            "dimensions": payload.package_dimensions,
            "notes": payload.package_notes,
        },
        "distance_km": quote["distance_km"],
        "duration_min": quote["duration_min"],
        "price_breakdown": quote,
        "currency": quote["currency"],
        "currency_symbol": quote["currency_symbol"],
        "total": quote["total"],
        "payment_method": payload.payment_method,
        "payment_status": "pending",
        "status": "searching",
        "driver_id": None,
        "driver_snapshot": None,
        "driver_location": None,
        "eta_seconds": None,
        "timeline": [
            {"code": "created", "label": "Booking created", "at": now},
            {"code": "searching", "label": "Searching for a driver…", "at": now},
        ],
        "scheduled_for": payload.scheduled_for,
        "created_at": now,
        "updated_at": now,
    }
    await db.express_bookings.insert_one(doc)
    doc.pop("_id", None)
    # Kick off the driver simulator in DEMO_MODE (production path relies on
    # driver-app status endpoints below to advance the lifecycle).
    if demo_mode_enabled():
        background.add_task(run_demo_simulation, doc["id"])
    return doc


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
async def create_movers_booking(payload: MoversBookingIn, customer: dict = Depends(get_current_customer)):
    time_slot_surcharge = 0.0
    if payload.time_slot_code:
        slot = await db.express_time_slots.find_one(
            {"code": payload.time_slot_code, "country": payload.country.upper(), "active": True},
            {"_id": 0},
        )
        time_slot_surcharge = float((slot or {}).get("surcharge") or 0)
    quote = await quote_movers(
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
    now = _now_iso()
    ref = _make_booking_ref("EXPMV")
    doc = {
        "id": new_id("mov"),
        "ref": ref,
        "customer_id": customer["id"],
        "module": "express",
        "booking_type": "movers",
        "country": payload.country.upper(),
        "move_type": payload.move_type,
        "pickup": payload.pickup.model_dump(),
        "drop": payload.drop.model_dump(),
        "pickup_building": payload.pickup_building,
        "drop_building": payload.drop_building,
        "items": [it.model_dump() for it in payload.items],
        "custom_items": payload.custom_items,
        "quote_breakdown": quote,
        "currency": quote["currency"],
        "currency_symbol": quote["currency_symbol"],
        "total": quote["total"],
        "advance": quote["advance"],
        "remaining": quote["remaining"],
        "scheduled_date": payload.scheduled_date,
        "time_slot_code": payload.time_slot_code,
        "labour_movers": payload.labour_movers,
        "payment_method": payload.payment_method,
        "payment_status": "advance_pending",
        "status": "confirmed",
        "timeline": [
            {"code": "created", "label": "Move booked", "at": now},
        ],
        "created_at": now,
        "updated_at": now,
    }
    await db.express_bookings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/bookings/mine")
async def my_bookings(customer: dict = Depends(get_current_customer), status: Optional[str] = Query(None)):
    q = {"customer_id": customer["id"], "module": "express"}
    if status == "active":
        q["status"] = {"$in": ["searching", "driver_assigned", "picked", "in_transit", "confirmed"]}
    elif status == "completed":
        q["status"] = "delivered"
    elif status == "cancelled":
        q["status"] = "cancelled"
    docs = await db.express_bookings.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, customer: dict = Depends(get_current_customer)):
    doc = await db.express_bookings.find_one({"id": booking_id, "customer_id": customer["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Booking not found")
    return doc


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, customer: dict = Depends(get_current_customer)):
    now = _now_iso()
    r = await db.express_bookings.find_one_and_update(
        {"id": booking_id, "customer_id": customer["id"], "status": {"$in": ["searching", "driver_assigned", "confirmed"]}},
        {"$set": {"status": "cancelled", "updated_at": now}, "$push": {"timeline": {"code": "cancelled", "label": "Cancelled by customer", "at": now}}},
        return_document=True,
    )
    if not r:
        raise HTTPException(400, "Cannot cancel this booking")
    r.pop("_id", None)
    return r


# ---------- Live Tracking (WebSocket) ----------
@router.websocket("/ws/bookings/{booking_id}")
async def ws_booking(ws: WebSocket, booking_id: str):
    """Live booking stream. Sends an initial snapshot then broadcasts every
    subsequent status/location update. Auth is deliberately open (booking id
    is opaque). The client should treat received data as read-only."""
    await ws_manager.connect(booking_id, ws)
    try:
        doc = await db.express_bookings.find_one({"id": booking_id}, {"_id": 0})
        if doc:
            # send initial snapshot to just this socket
            await ws.send_json({
                "type": "snapshot",
                "id": doc.get("id"),
                "ref": doc.get("ref"),
                "status": doc.get("status"),
                "pickup": doc.get("pickup"),
                "drop": doc.get("drop"),
                "receiver": doc.get("receiver"),
                "vehicle_code": doc.get("vehicle_code"),
                "distance_km": doc.get("distance_km"),
                "duration_min": doc.get("duration_min"),
                "currency_symbol": doc.get("currency_symbol"),
                "total": doc.get("total"),
                "driver_id": doc.get("driver_id"),
                "driver_snapshot": doc.get("driver_snapshot"),
                "driver_location": doc.get("driver_location"),
                "eta_seconds": doc.get("eta_seconds"),
                "timeline": doc.get("timeline") or [],
                "updated_at": doc.get("updated_at"),
            })
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
async def driver_advance_status(booking_id: str, payload: DriverStatusIn):
    from modules.express.tracking import transition_status
    from modules.express.dispatch import release_driver
    doc = await db.express_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Booking not found")
    curr = doc.get("status")
    allowed = ALLOWED_TRANSITIONS.get(curr, set())
    if payload.status not in allowed:
        raise HTTPException(400, f"Cannot transition {curr!r} → {payload.status!r}")
    driver_loc = None
    if payload.lat is not None and payload.lng is not None:
        driver_loc = {"lat": payload.lat, "lng": payload.lng}
    extra = {}
    if payload.status == "delivered":
        extra["delivered_at"] = _now_iso()
        extra["payment_status"] = "paid"
    result = await transition_status(booking_id, payload.status, extra=extra, driver_location=driver_loc)
    if payload.status == "delivered" and doc.get("driver_id"):
        await release_driver(doc["driver_id"])
    return result


# ---------- Utilities ----------
def _make_booking_ref(prefix: str = "EXP") -> str:
    # 8-digit human-readable reference (ms timestamp) + 4-hex random suffix
    # to prevent collisions under high concurrency.
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    return f"{prefix}{ts % 100000000:08d}{secrets.token_hex(2).upper()}"
