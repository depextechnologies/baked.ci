"""EXPRESSbakēd — Driver Dispatch.

Chooses the nearest available driver of matching vehicle capacity and
attaches them to the booking. Uses Haversine on driver `current_lat/lng`
vs the pickup point.

Driver rows live in `module_drivers` (module='express') with the
Phase-2 fields:
    - is_available: bool  (starts True after seed)
    - current_lat, current_lng: float (last known ping)
    - rating: float (0.0 - 5.0)
    - vehicle_type: matches VEHICLES codes (bike/scooter/three_wheeler/mini_truck/truck)
    - status: 'active' is required to be dispatchable

No PostGIS/geospatial index is used here on purpose — this mirrors the
original app-level scan-and-sort design (capped at 200 candidates), which is
sufficient at current driver density. A real nearest-neighbor DB query
(PostGIS `geography` + GiST index) is a clear follow-up if that changes.
"""
from __future__ import annotations
import math
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import ExpressBooking, ModuleDriver


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
    session: AsyncSession,
    country: str,
    vehicle_code: str,
    pickup_lat: float,
    pickup_lng: float,
) -> Optional[ModuleDriver]:
    """Return the nearest available driver for the given country + vehicle."""
    families = FALLBACK_CHAIN.get(vehicle_code, [vehicle_code])
    for vt in families:
        drivers = (
            (
                await session.execute(
                    select(ModuleDriver)
                    .where(
                        ModuleDriver.module == "express",
                        ModuleDriver.country == country.upper(),
                        ModuleDriver.vehicle_type == vt,
                        ModuleDriver.status == "active",
                        ModuleDriver.is_available.is_(True),
                        ModuleDriver.deleted_at.is_(None),
                        ModuleDriver.current_lat.isnot(None),
                        ModuleDriver.current_lng.isnot(None),
                    )
                    .limit(200)
                )
            )
            .scalars()
            .all()
        )
        if not drivers:
            continue
        drivers = sorted(
            drivers, key=lambda d: _haversine_km(pickup_lat, pickup_lng, float(d.current_lat), float(d.current_lng))
        )
        return drivers[0]
    return None


async def assign_driver_to_booking(session: AsyncSession, booking: ExpressBooking) -> Optional[ModuleDriver]:
    """Attach nearest available driver, mark unavailable atomically."""
    driver = await find_nearest_driver(
        session,
        country=booking.country or "CI",
        vehicle_code=booking.vehicle_code or "bike",
        pickup_lat=float(booking.pickup_latitude or 0.0),
        pickup_lng=float(booking.pickup_longitude or 0.0),
    )
    if not driver:
        return None
    # Atomic reservation — prevents two bookings grabbing the same driver.
    result = await session.execute(
        update(ModuleDriver)
        .where(ModuleDriver.id == driver.id, ModuleDriver.is_available.is_(True))
        .values(is_available=False, active_booking_id=booking.id)
    )
    if result.rowcount == 0:
        return None
    await session.commit()
    await session.refresh(driver)
    return driver


async def release_driver(session: AsyncSession, driver_id: str) -> None:
    """Mark a driver available again after delivery / cancellation."""
    await session.execute(
        update(ModuleDriver).where(ModuleDriver.id == driver_id).values(is_available=True, active_booking_id=None)
    )
    await session.commit()


def driver_snapshot(driver: ModuleDriver) -> dict:
    """Public-safe subset attached to bookings + broadcast to customer."""
    return {
        "id": driver.id,
        "name": driver.name,
        "phone": driver.phone,
        "vehicle_type": driver.vehicle_type,
        "vehicle_reg": driver.vehicle_reg or "",
        "rating": float(driver.rating or 4.8),
        "photo_url": driver.photo_url,
    }
