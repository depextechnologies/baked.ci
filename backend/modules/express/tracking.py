"""EXPRESSbakēd — Live Tracking WebSocket manager + demo simulator.

Two responsibilities:
  1) `ConnectionManager` fans out booking updates to every socket
     currently watching a given booking id.
  2) `run_demo_simulation(booking_id)` — when EXPRESS_DEMO_MODE=true, a
     background task steps a booking through the full lifecycle in ~2
     minutes with interpolated driver movement on Google Maps.

Status vocabulary matches the customer UI:
    searching → driver_assigned → arriving → picked_up → in_transit → delivered

Background tasks (the demo simulator) run outside the FastAPI request
lifecycle, so they open their own AsyncSession via `SessionLocal` rather than
sharing a request-scoped one.
"""
from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional, Set

from fastapi import WebSocket
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import SessionLocal
from core.models import ExpressBooking, ExpressBookingTimeline
from modules.express.dispatch import assign_driver_to_booking, driver_snapshot, release_driver
from modules.express.serializers import booking_to_dict, public_booking_fields

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


async def broadcast_snapshot(session: AsyncSession, booking_id: str) -> dict:
    """Reload the booking and broadcast it — safe to call after any mutation."""
    booking = await session.get(ExpressBooking, booking_id)
    if not booking:
        return {}
    data = await booking_to_dict(session, booking)
    payload = {"type": "snapshot", **public_booking_fields(data)}
    await manager.broadcast(booking_id, payload)
    return data


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
    session: AsyncSession,
    booking_id: str,
    new_status: str,
    extra: dict | None = None,
    driver_location: dict | None = None,
    eta_seconds: int | None = None,
    label: str | None = None,
) -> dict | None:
    """Persist a status change + append a timeline entry + broadcast, in one transaction."""
    booking = await session.get(ExpressBooking, booking_id)
    if not booking:
        return None
    resolved_label = label or STATUS_LABELS.get(new_status, new_status)
    booking.status = new_status
    if driver_location is not None:
        booking.driver_location_lat = driver_location["lat"]
        booking.driver_location_lng = driver_location["lng"]
    if eta_seconds is not None:
        booking.eta_seconds = eta_seconds
    if extra:
        for k, v in extra.items():
            setattr(booking, k, v)
    now = datetime.now(timezone.utc)
    session.add(ExpressBookingTimeline(booking_id=booking_id, code=new_status, label=resolved_label, at=now))
    await session.commit()
    data = await booking_to_dict(session, booking)
    await manager.broadcast(booking_id, {"type": "snapshot", **public_booking_fields(data)})
    return data


# ---------------- Location interpolation ---------------- #

def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


async def _stream_movement(
    session: AsyncSession,
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
        await session.execute(
            update(ExpressBooking)
            .where(ExpressBooking.id == booking_id)
            .values(driver_location_lat=lat, driver_location_lng=lng, eta_seconds=remaining)
        )
        await session.commit()
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
        async with SessionLocal() as session:
            booking = await session.get(ExpressBooking, booking_id)
            if not booking or booking.status not in ("searching", None):
                return

            # 1) Assign a driver
            driver = await assign_driver_to_booking(session, booking)
            if not driver:
                logger.warning("baked.express.demo no_driver booking=%s", booking_id)
                # keep it in searching; a real system would retry. Broadcast anyway.
                await broadcast_snapshot(session, booking_id)
                return

            pickup_lat, pickup_lng = float(booking.pickup_latitude), float(booking.pickup_longitude)
            drop_lat, drop_lng = float(booking.drop_latitude), float(booking.drop_longitude)
            start_lat = float(driver.current_lat) if driver.current_lat is not None else pickup_lat
            start_lng = float(driver.current_lng) if driver.current_lng is not None else pickup_lng

            await transition_status(
                session, booking_id, "driver_assigned",
                extra={"driver_id": driver.id, "driver_snapshot": driver_snapshot(driver)},
                driver_location={"lat": start_lat, "lng": start_lng},
                eta_seconds=30,
            )
            # Let the customer see "Driver assigned" for 2s before we start moving.
            await asyncio.sleep(2.0)

            # 2) Driver → pickup (arriving) — 30s
            await transition_status(session, booking_id, "arriving", eta_seconds=30)
            await _stream_movement(session, booking_id, start_lat, start_lng, pickup_lat, pickup_lng, total_seconds=30.0)

            # 3) Picked up (short beat)
            await transition_status(
                session, booking_id, "picked_up",
                driver_location={"lat": pickup_lat, "lng": pickup_lng},
                eta_seconds=int(booking.duration_min or 15) * 60 // 4 or 60,
            )
            await asyncio.sleep(5.0)

            # 4) In transit → drop — 80s
            await transition_status(session, booking_id, "in_transit", eta_seconds=80)
            await _stream_movement(session, booking_id, pickup_lat, pickup_lng, drop_lat, drop_lng, total_seconds=80.0)

            # 5) Delivered
            await transition_status(
                session, booking_id, "delivered",
                driver_location={"lat": drop_lat, "lng": drop_lng},
                eta_seconds=0,
                extra={"delivered_at": datetime.now(timezone.utc), "payment_status": "paid"},
            )
            await release_driver(session, driver.id)
    except Exception as e:  # noqa: BLE001
        logger.exception("baked.express.demo simulation_failed booking=%s err=%s", booking_id, e)
