"""Bridge helpers between the SENDbakēd Driver identity (`drivers`) and
the dispatch pool (`module_drivers`).

Rationale
---------
The dispatch engine reads from `module_drivers`. The real driver PWA writes
to `drivers`. Without a bridge no real driver ever qualifies for a real
booking — that was the Screenshot-3 root cause. Everything else in Phase A
depends on this glue being correct, so keep it small, atomic and
side-effect-free (session commit stays with the caller).

Vehicle default: the SENDbakēd driver KYC captures `vehicle_type` on the
Driver row. If the field is missing we fall back to 'bike' — the smallest
class, still eligible for parcel dispatch via FALLBACK_CHAIN.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Driver, ModuleDriver


DEFAULT_VEHICLE_TYPE = "bike"


async def get_or_create_module_driver(session: AsyncSession, driver: Driver) -> ModuleDriver:
    """Return the ModuleDriver row linked to this Driver, creating it if
    missing. Idempotent — safe to call on every online toggle."""
    md = (
        await session.execute(
            select(ModuleDriver).where(ModuleDriver.linked_driver_id == driver.id)
        )
    ).scalar_one_or_none()
    if md is not None:
        return md

    md = ModuleDriver(
        id=f"md_{driver.id}",
        module="express",
        name=driver.name or driver.email or f"Driver {driver.id[-6:]}",
        # `phone` is NOT NULL in the model; if the SENDbakēd driver signed up
        # via email/Google we synthesise a stable placeholder that never
        # collides with real phones (namespace with `drv:`). KYC will
        # eventually collect the real number.
        phone=driver.phone_e164 or f"drv:{driver.id}",
        email=driver.email,
        country=driver.country,
        vehicle_type=getattr(driver, "vehicle_type", None) or DEFAULT_VEHICLE_TYPE,
        vehicle_reg=getattr(driver, "vehicle_reg", None),
        license_number=getattr(driver, "license_number", None),
        status="active",
        is_available=False,     # not-yet-online
        linked_driver_id=driver.id,
    )
    session.add(md)
    await session.flush()
    return md


async def set_availability(
    session: AsyncSession, driver: Driver,
    *, is_available: bool,
    lat: Optional[float] = None, lng: Optional[float] = None,
) -> ModuleDriver:
    """Mirror the driver's online/offline state into the dispatch pool.
    Also refreshes location + last_seen_at when coords are provided.

    Caller must `session.commit()`.
    """
    md = await get_or_create_module_driver(session, driver)
    md.is_available = is_available
    # Don't clobber existing coords when going offline without a fresh ping.
    if lat is not None:
        md.current_lat = lat
    if lng is not None:
        md.current_lng = lng
    md.last_seen_at = datetime.now(timezone.utc)
    return md


async def push_location(
    session: AsyncSession, driver: Driver,
    *, lat: float, lng: float,
) -> None:
    """Fast-path location update. Uses a targeted UPDATE so we skip loading
    the row when we're only touching lat/lng/last_seen_at. Falls back to
    creating the row lazily if this is the very first ping (edge case:
    driver never called /online but sent a location — allowed for tests).

    If the driver currently has an assigned booking, also push the new
    coords into ExpressBooking.driver_location_* and broadcast to the
    customer's track WebSocket so their map moves.

    Caller must `session.commit()`.
    """
    now = datetime.now(timezone.utc)
    driver.current_lat = lat
    driver.current_lng = lng
    driver.last_seen_at = now
    result = await session.execute(
        update(ModuleDriver)
        .where(ModuleDriver.linked_driver_id == driver.id)
        .values(current_lat=lat, current_lng=lng, last_seen_at=now)
    )
    if result.rowcount == 0:
        await get_or_create_module_driver(session, driver)
        await session.execute(
            update(ModuleDriver)
            .where(ModuleDriver.linked_driver_id == driver.id)
            .values(current_lat=lat, current_lng=lng, last_seen_at=now)
        )
    # If this driver is on a live booking, push the new location downstream.
    from core.models import ExpressBooking
    from sqlalchemy import select
    md = (await session.execute(
        select(ModuleDriver).where(ModuleDriver.linked_driver_id == driver.id)
    )).scalar_one_or_none()
    if md is None or md.active_booking_id is None:
        return
    await session.execute(
        update(ExpressBooking)
        .where(ExpressBooking.id == md.active_booking_id)
        .values(driver_location_lat=lat, driver_location_lng=lng)
    )
    # Broadcast to the customer's per-booking WS (best-effort — never fails
    # the ping if the tracking module is misconfigured).
    try:
        from modules.express.tracking import broadcast_snapshot
        await session.flush()
        await broadcast_snapshot(session, md.active_booking_id)
    except Exception:
        pass
