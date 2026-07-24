"""EXPRESSbakēd — Live Tracking WebSocket manager + demo simulator.

Two responsibilities:
  1) `ConnectionManager` fans out booking updates to every socket
     currently watching a given booking id.
  2) `run_demo_simulation(booking_id)` — when EXPRESS_DEMO_MODE=true, a
     background task steps a booking through the full lifecycle in ~2
     minutes with interpolated driver movement on Google Maps.

Status vocabulary matches the customer UI:
    searching → driver_assigned → arriving → picked_up → in_transit → delivered
"""
from __future__ import annotations
import asyncio
import logging
import os
from typing import Dict, Set

from fastapi import WebSocket

from core.db import db
from core.models_base import _now_iso
from modules.express.dispatch import assign_driver_to_booking, driver_snapshot, release_driver

logger = logging.getLogger("baked.express.tracking")


class ConnectionManager:
    """One set of listeners per booking id. Best-effort broadcast — dead
    sockets are pruned silently so the simulator can never crash on them."""

    def __init__(self) -> None:
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, booking_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms.setdefault(booking_id, set()).add(ws)

    async def disconnect(self, booking_id: str, ws: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(booking_id)
            if room and ws in room:
                room.discard(ws)
                if not room:
                    self._rooms.pop(booking_id, None)

    async def broadcast(self, booking_id: str, payload: dict) -> None:
        async with self._lock:
            targets = list(self._rooms.get(booking_id, ()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        if dead:
            async with self._lock:
                room = self._rooms.get(booking_id)
                if room:
                    for ws in dead:
                        room.discard(ws)


manager = ConnectionManager()


# ---------------- Broadcast helpers ---------------- #

def _booking_public(doc: dict) -> dict:
    """Sanitised booking snapshot for WebSocket subscribers."""
    keep = {
        "id", "ref", "status", "booking_type", "vehicle_code", "country",
        "pickup", "drop", "receiver", "distance_km", "duration_min",
        "currency", "currency_symbol", "total", "payment_method",
        "payment_status", "driver_id", "driver_snapshot",
        "driver_location", "eta_seconds", "timeline", "updated_at",
    }
    return {k: doc.get(k) for k in keep if k in doc}


async def broadcast_snapshot(booking_id: str) -> dict:
    """Reload the booking and broadcast it — safe to call after any mutation."""
    doc = await db.express_bookings.find_one({"id": booking_id}, {"_id": 0})
    if not doc:
        return {}
    payload = {"type": "snapshot", **_booking_public(doc)}
    await manager.broadcast(booking_id, payload)
    return doc


# ---------------- Status transitions ---------------- #

STATUS_LABELS = {
    "driver_assigned": "Driver assigned",
    "arriving":        "Driver is arriving",
    "picked_up":       "Package picked up",
    "in_transit":      "In transit",
    "delivered":       "Delivered",
    "cancelled":       "Cancelled",
}


async def transition_status(
    booking_id: str,
    new_status: str,
    extra: dict | None = None,
    driver_location: dict | None = None,
    eta_seconds: int | None = None,
) -> dict | None:
    """Persist a status change + append to timeline + broadcast."""
    now = _now_iso()
    label = STATUS_LABELS.get(new_status, new_status)
    update = {"status": new_status, "updated_at": now}
    if driver_location is not None:
        update["driver_location"] = driver_location
    if eta_seconds is not None:
        update["eta_seconds"] = eta_seconds
    if extra:
        update.update(extra)
    result = await db.express_bookings.find_one_and_update(
        {"id": booking_id},
        {"$set": update, "$push": {"timeline": {"code": new_status, "label": label, "at": now}}},
        return_document=True,
    )
    if not result:
        return None
    result.pop("_id", None)
    await manager.broadcast(booking_id, {"type": "snapshot", **_booking_public(result)})
    return result


# ---------------- Location interpolation ---------------- #

def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


async def _stream_movement(
    booking_id: str,
    from_lat: float, from_lng: float,
    to_lat: float, to_lng: float,
    total_seconds: float,
    tick_seconds: float = 2.0,
    eta_countdown: bool = True,
) -> None:
    """Interpolate driver_location from A→B over total_seconds and broadcast."""
    steps = max(1, int(total_seconds / tick_seconds))
    for i in range(1, steps + 1):
        t = i / steps
        lat = _lerp(from_lat, to_lat, t)
        lng = _lerp(from_lng, to_lng, t)
        remaining = int((steps - i) * tick_seconds) if eta_countdown else None
        await db.express_bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "driver_location": {"lat": lat, "lng": lng},
                "eta_seconds": remaining,
                "updated_at": _now_iso(),
            }},
        )
        await manager.broadcast(booking_id, {
            "type": "location",
            "booking_id": booking_id,
            "driver_location": {"lat": lat, "lng": lng},
            "eta_seconds": remaining,
        })
        await asyncio.sleep(tick_seconds)


# ---------------- Demo simulation ---------------- #

def demo_mode_enabled() -> bool:
    return (os.environ.get("EXPRESS_DEMO_MODE") or "false").lower() in ("1", "true", "yes")


async def run_demo_simulation(booking_id: str) -> None:
    """Step a booking through the full lifecycle over ~2 minutes.

    Timeline (approx):
      t=0s   assign driver + emit driver_assigned
      t=0-30s driver → pickup (arriving)
      t=30s  picked_up
      t=30-115s pickup → drop (in_transit)
      t=115s delivered + release driver

    Only runs when EXPRESS_DEMO_MODE=true. Silent no-op otherwise.
    """
    if not demo_mode_enabled():
        return
    try:
        await asyncio.sleep(1.0)  # let the HTTP response return first
        booking = await db.express_bookings.find_one({"id": booking_id}, {"_id": 0})
        if not booking or booking.get("status") not in ("searching", None):
            return

        # 1) Assign a driver
        driver = await assign_driver_to_booking(booking)
        if not driver:
            logger.warning("baked.express.demo no_driver booking=%s", booking_id)
            # keep it in searching; a real system would retry. Broadcast anyway.
            await broadcast_snapshot(booking_id)
            return

        pickup = booking["pickup"]
        drop = booking["drop"]
        start_lat = float(driver.get("current_lat") or pickup["latitude"])
        start_lng = float(driver.get("current_lng") or pickup["longitude"])

        await transition_status(
            booking_id, "driver_assigned",
            extra={
                "driver_id": driver["id"],
                "driver_snapshot": driver_snapshot(driver),
            },
            driver_location={"lat": start_lat, "lng": start_lng},
            eta_seconds=30,
        )

        # 2) Driver → pickup (arriving) — 30s
        await transition_status(booking_id, "arriving", eta_seconds=30)
        await _stream_movement(
            booking_id,
            start_lat, start_lng,
            float(pickup["latitude"]), float(pickup["longitude"]),
            total_seconds=30.0,
        )

        # 3) Picked up (short beat)
        await transition_status(
            booking_id, "picked_up",
            driver_location={"lat": pickup["latitude"], "lng": pickup["longitude"]},
            eta_seconds=int(booking.get("duration_min") or 15) * 60 // 4 or 60,
        )
        await asyncio.sleep(5.0)

        # 4) In transit → drop — 80s
        await transition_status(booking_id, "in_transit", eta_seconds=80)
        await _stream_movement(
            booking_id,
            float(pickup["latitude"]), float(pickup["longitude"]),
            float(drop["latitude"]), float(drop["longitude"]),
            total_seconds=80.0,
        )

        # 5) Delivered
        await transition_status(
            booking_id, "delivered",
            driver_location={"lat": drop["latitude"], "lng": drop["longitude"]},
            eta_seconds=0,
            extra={"delivered_at": _now_iso(), "payment_status": "paid"},
        )
        await release_driver(driver["id"])
    except Exception as e:  # noqa: BLE001
        logger.exception("baked.express.demo simulation_failed booking=%s err=%s", booking_id, e)
