"""EXPRESSbakēd — Driver Dispatch.

Real-driver mode (Phase A, 2026-02):
    * Filters `module_drivers` down to rows with `linked_driver_id IS NOT NULL`
      (a real SENDbakēd driver bridged in via /driver/me/online).
    * Requires a fresh `last_seen_at` (< STALE_AFTER_SECONDS) so a driver
      who closed the app without going offline stops being offered jobs.
    * Excludes drivers that already rejected the specific booking.

Offer/accept lifecycle:
    dispatch_next_offer(booking)  →  status='offering', offered_to_driver_id
       set, offer_expires_at set. Pushes 'job_offer' via driver WS.
    driver Accept                 →  atomic swap to status='driver_assigned'.
    driver Reject / timeout       →  driver added to declined_driver_ids;
                                     dispatch_next_offer() is retried.
    all drivers exhausted         →  status back to 'searching', customer sees
                                     the spinner state (they may cancel).

No PostGIS — same reasoning as before, capped app-level scan is enough at
current density.
"""
from __future__ import annotations
import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import ExpressBooking, ExpressBookingTimeline, ModuleDriver
from modules.driver.realtime import notify_driver

log = logging.getLogger("baked.express.dispatch")

# Tuned in .env for ops flexibility (e.g. lower during a stress test).
STALE_AFTER_SECONDS = int(os.environ.get("EXPRESS_DRIVER_STALE_AFTER_S", "60"))
OFFER_TTL_SECONDS   = int(os.environ.get("EXPRESS_OFFER_TTL_S", "60"))
MATCH_RADIUS_KM     = float(os.environ.get("EXPRESS_MATCH_RADIUS_KM", "15"))


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
    *,
    exclude_ids: Optional[list[str]] = None,
) -> Optional[ModuleDriver]:
    """Return the nearest real, online, fresh driver — or None.

    `exclude_ids` is the list of drivers who already saw + rejected this
    booking; the dispatcher keeps walking down the fallback vehicle chain
    without offering them a second time.
    """
    exclude_ids = exclude_ids or []
    stale_before = datetime.now(timezone.utc) - timedelta(seconds=STALE_AFTER_SECONDS)
    families = FALLBACK_CHAIN.get(vehicle_code, [vehicle_code])
    for vt in families:
        q = (
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
                # --- Phase A: real drivers only + freshness gate ---
                ModuleDriver.linked_driver_id.isnot(None),
                ModuleDriver.last_seen_at >= stale_before,
            )
            .limit(200)
        )
        if exclude_ids:
            q = q.where(~ModuleDriver.id.in_(exclude_ids))
        drivers = (await session.execute(q)).scalars().all()
        if not drivers:
            continue
        # Rank by Haversine, drop anyone beyond the match radius.
        ranked = sorted(
            (
                (d, _haversine_km(pickup_lat, pickup_lng, float(d.current_lat), float(d.current_lng)))
                for d in drivers
            ),
            key=lambda t: t[1],
        )
        for d, km in ranked:
            if km <= MATCH_RADIUS_KM:
                return d
    return None


async def dispatch_next_offer(session: AsyncSession, booking: ExpressBooking) -> Optional[ModuleDriver]:
    """Find the next best driver and push a job offer to them via WS.

    Returns the driver who received the offer, or None if the pool is
    exhausted (in which case the caller should mark the booking back to
    'searching' — a new online driver may pick it up when they turn on).

    The DB state after a successful offer:
        booking.status = 'offering'
        booking.offered_to_driver_id = driver.id
        booking.offered_at = now
        booking.offer_expires_at = now + OFFER_TTL_SECONDS
    """
    driver = await find_nearest_driver(
        session,
        country=booking.country or "CI",
        vehicle_code=booking.vehicle_code or "bike",
        pickup_lat=float(booking.pickup_latitude or 0.0),
        pickup_lng=float(booking.pickup_longitude or 0.0),
        exclude_ids=list(booking.declined_driver_ids or []),
    )
    if driver is None:
        # Exhausted — return to searching so any new driver who comes online
        # (or an existing driver whose ping refreshes last_seen_at) is
        # eligible on the next dispatch tick.
        booking.status = "searching"
        booking.offered_to_driver_id = None
        booking.offered_at = None
        booking.offer_expires_at = None
        session.add(ExpressBookingTimeline(
            booking_id=booking.id, code="searching",
            label="Looking for a driver…", at=datetime.now(timezone.utc),
        ))
        return None

    now = datetime.now(timezone.utc)
    booking.status = "offering"
    booking.offered_to_driver_id = driver.id
    booking.offered_at = now
    booking.offer_expires_at = now + timedelta(seconds=OFFER_TTL_SECONDS)
    session.add(ExpressBookingTimeline(
        booking_id=booking.id, code="offering",
        label=f"Offered to driver {driver.id}", at=now,
    ))

    # Fire the WS event AFTER the row is set up so a fast Accept from the
    # driver observes the offer_expires_at in the DB. `notify_driver` is a
    # best-effort broadcast — the client also polls /me/offers/current as a
    # fallback in case the socket is momentarily disconnected.
    if driver.linked_driver_id:
        await notify_driver(driver.linked_driver_id, "job_offer", _offer_payload(booking))
    return driver


def _offer_payload(booking: ExpressBooking) -> dict:
    """Compact snapshot the driver client renders in the Incoming Request card."""
    now = datetime.now(timezone.utc)
    remain = 0
    if booking.offer_expires_at:
        remain = max(0, int((booking.offer_expires_at - now).total_seconds()))
    return {
        "booking_id": booking.id,
        "ref": booking.ref,
        "booking_type": booking.booking_type,
        "vehicle_code": booking.vehicle_code,
        "country": booking.country,
        "expires_in_seconds": remain,
        "expires_at": booking.offer_expires_at.isoformat() if booking.offer_expires_at else None,
        "pickup": {
            "lat":     float(booking.pickup_latitude)  if booking.pickup_latitude  else None,
            "lng":     float(booking.pickup_longitude) if booking.pickup_longitude else None,
            "line1":   booking.pickup_line1,
            "address": booking.pickup_formatted_address,
            "city":    booking.pickup_city,
        },
        "drop": {
            "lat":     float(booking.drop_latitude)  if booking.drop_latitude  else None,
            "lng":     float(booking.drop_longitude) if booking.drop_longitude else None,
            "line1":   booking.drop_line1,
            "address": booking.drop_formatted_address,
            "city":    booking.drop_city,
        },
        "receiver_name":  booking.receiver_name,
        "receiver_phone": booking.receiver_phone,
        "distance_km":    float(booking.distance_km) if booking.distance_km else None,
        "duration_min":   booking.duration_min,
        "earnings":       float(booking.total) if booking.total is not None else None,
        "currency":       booking.currency,
        "currency_symbol": booking.currency_symbol,
        "payment_method": booking.payment_method,
        "package_type":   booking.package_type,
    }


async def accept_offer_atomic(
    session: AsyncSession, booking_id: str, module_driver_id: str,
) -> tuple[bool, str]:
    """Attempt to atomically flip an outstanding offer into 'driver_assigned'.

    Returns (ok, reason). Only the driver the offer was made to can accept,
    and only while `now < offer_expires_at`. The single UPDATE .. WHERE
    guarantees that if two drivers race, only one row is touched.
    """
    now = datetime.now(timezone.utc)
    result = await session.execute(
        update(ExpressBooking)
        .where(
            ExpressBooking.id == booking_id,
            ExpressBooking.status == "offering",
            ExpressBooking.offered_to_driver_id == module_driver_id,
            ExpressBooking.offer_expires_at > now,
        )
        .values(
            status="driver_assigned",
            driver_id=module_driver_id,
            offered_to_driver_id=None,
            offer_expires_at=None,
        )
    )
    if result.rowcount == 0:
        # Diagnose why we failed so the client can render the right toast.
        booking = await session.get(ExpressBooking, booking_id)
        if not booking:                                                return False, "not_found"
        if booking.status == "driver_assigned":                        return False, "already_taken"
        if booking.status in ("cancelled", "delivered"):               return False, "closed"
        if booking.offer_expires_at and booking.offer_expires_at <= now: return False, "expired"
        return False, "offer_gone"

    # Reserve the driver on the ModuleDriver row (matches the existing
    # active_booking_id contract used by tracking.py) and write the
    # customer-visible driver_snapshot so /send/track shows the driver card.
    await session.execute(
        update(ModuleDriver)
        .where(ModuleDriver.id == module_driver_id)
        .values(is_available=False, active_booking_id=booking_id)
    )
    md = await session.get(ModuleDriver, module_driver_id)
    if md is not None:
        snap = {
            "id": md.id,
            "name": md.name,
            "phone": md.phone if not (md.phone or "").startswith("drv:") else None,
            "vehicle_type": md.vehicle_type,
            "vehicle_reg": md.vehicle_reg or "",
            "rating": float(md.rating or 4.8),
            "photo_url": md.photo_url,
        }
        await session.execute(
            update(ExpressBooking)
            .where(ExpressBooking.id == booking_id)
            .values(
                driver_snapshot=snap,
                driver_location_lat=md.current_lat,
                driver_location_lng=md.current_lng,
            )
        )
        session.add(ExpressBookingTimeline(
            booking_id=booking_id, code="driver_assigned",
            label=f"Driver assigned: {md.name}", at=now,
        ))
    return True, "ok"


async def decline_offer(
    session: AsyncSession, booking: ExpressBooking, module_driver_id: str,
) -> None:
    """Record a rejection + immediately try the next eligible driver.
    Caller must `session.commit()` when returning.
    """
    declined = list(booking.declined_driver_ids or [])
    if module_driver_id not in declined:
        declined.append(module_driver_id)
    booking.declined_driver_ids = declined
    booking.offered_to_driver_id = None
    booking.offer_expires_at = None
    booking.status = "searching"
    session.add(ExpressBookingTimeline(
        booking_id=booking.id, code="declined",
        label=f"Declined by driver {module_driver_id}", at=datetime.now(timezone.utc),
    ))
    await dispatch_next_offer(session, booking)


async def assign_driver_to_booking(session: AsyncSession, booking: ExpressBooking) -> Optional[ModuleDriver]:
    """Legacy synchronous-assign entry point used by the demo simulator.

    Now delegates through dispatch_next_offer + auto-accept-for-demo. Kept
    only so the old code path doesn't break — real production traffic goes
    through the offer flow, not this. Deprecate once demo is removed.
    """
    driver = await dispatch_next_offer(session, booking)
    if not driver:
        return None
    ok, _reason = await accept_offer_atomic(session, booking.id, driver.id)
    if not ok:
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
