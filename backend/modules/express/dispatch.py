"""EXPRESSbakēd — Driver Dispatch.

Chooses the nearest available driver of matching vehicle capacity and
attaches them to the booking. Uses Haversine on driver `current_lat/lng`
vs the pickup point.

Driver documents live in `module_drivers` (module='express') with the
Phase-2 fields:
    - is_available: bool  (starts True after seed)
    - current_lat, current_lng: float (last known ping)
    - rating: float (0.0 - 5.0)
    - vehicle_type: matches VEHICLES codes (bike/scooter/three_wheeler/mini_truck/truck)
    - status: 'active' is required to be dispatchable
"""
from __future__ import annotations
import math
from typing import Optional

from core.db import db
from core.models_base import _now_iso


def _haversine_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    R = 6371.0
    p1 = math.radians(a_lat)
    p2 = math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


# The dispatch layer accepts either the exact vehicle code, or the "capability
# family" (a larger vehicle can serve a smaller job). Keeps dispatch usable
# when a market has few drivers of a given class.
FALLBACK_CHAIN = {
    "bike":          ["bike", "scooter", "three_wheeler"],
    "scooter":       ["scooter", "bike", "three_wheeler"],
    "three_wheeler": ["three_wheeler", "mini_truck", "truck"],
    "mini_truck":    ["mini_truck", "truck", "three_wheeler"],
    "truck":         ["truck", "mini_truck"],
}


async def find_nearest_driver(
    country: str,
    vehicle_code: str,
    pickup_lat: float,
    pickup_lng: float,
) -> Optional[dict]:
    """Return the nearest available driver for the given country + vehicle."""
    families = FALLBACK_CHAIN.get(vehicle_code, [vehicle_code])
    for vt in families:
        cursor = db.module_drivers.find(
            {
                "module": "express",
                "country": country.upper(),
                "vehicle_type": vt,
                "status": "active",
                "is_available": True,
                "deleted_at": None,
                "current_lat": {"$ne": None},
                "current_lng": {"$ne": None},
            },
            {"_id": 0},
        )
        drivers = await cursor.to_list(200)
        if not drivers:
            continue
        drivers.sort(
            key=lambda d: _haversine_km(pickup_lat, pickup_lng, d["current_lat"], d["current_lng"]),
        )
        return drivers[0]
    return None


async def assign_driver_to_booking(booking: dict) -> Optional[dict]:
    """Attach nearest available driver, mark unavailable atomically."""
    pickup = booking.get("pickup") or {}
    driver = await find_nearest_driver(
        country=booking.get("country", "CI"),
        vehicle_code=booking.get("vehicle_code") or "bike",
        pickup_lat=pickup.get("latitude") or 0.0,
        pickup_lng=pickup.get("longitude") or 0.0,
    )
    if not driver:
        return None
    # Atomic reservation — prevents two bookings grabbing the same driver.
    res = await db.module_drivers.update_one(
        {"id": driver["id"], "is_available": True},
        {"$set": {"is_available": False, "updated_at": _now_iso(), "active_booking_id": booking["id"]}},
    )
    if res.modified_count == 0:
        return None
    return driver


async def release_driver(driver_id: str) -> None:
    """Mark a driver available again after delivery / cancellation."""
    await db.module_drivers.update_one(
        {"id": driver_id},
        {"$set": {"is_available": True, "active_booking_id": None, "updated_at": _now_iso()}},
    )


def driver_snapshot(driver: dict) -> dict:
    """Public-safe subset attached to bookings + broadcast to customer."""
    return {
        "id": driver.get("id"),
        "name": driver.get("name"),
        "phone": driver.get("phone"),
        "vehicle_type": driver.get("vehicle_type"),
        "vehicle_reg": driver.get("vehicle_reg") or "",
        "rating": float(driver.get("rating") or 4.8),
        "photo_url": driver.get("photo_url"),
    }
