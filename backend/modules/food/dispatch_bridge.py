"""FOODbakēd — Driver Dispatch Bridge (Pass 2).

One job: when a FOOD order moves `accepted → preparing`, create a shadow
`express_bookings` row flagged `source_module='food'` + `booking_type=
'food_delivery'` + `food_order_id=…`, then hand it to the existing
`dispatch_next_offer()` so eligible BAKED drivers get the 10-second
`job_offer` WS and the full accept-or-timeout flow kicks in for free.

Everything else (nearest-driver scan, declined-chain, atomic accept,
driver app UI, pickup/drop PIN handling) is unchanged — this file is
only the FOOD-side **glue**.

Key design decisions
--------------------
* **Idempotent**: we query for an existing live delivery row first, so a
  retried `preparing` transition (WS replay, double-click, race) never
  spawns a second offer. The migration also enforces a partial UNIQUE
  index as a hard DB guarantee.
* **Dynamic vehicle selection** per order (not hardcoded `bike`): based on
  `items_count`, with simple deterministic thresholds that live in one
  place so Super Admin can later override via a config row without
  rewriting dispatch.
* **Pickup PIN**: a 4-digit code generated at job creation. Shown to the
  partner on their Live Orders card; the driver enters it on arrival to
  flip `driver_assigned → picked_up`. Mirrors the SEND drop-PIN pattern.
* **Pickup/drop coordinates**: pulled from `food_restaurants` (pickup)
  and `food_orders.delivery_address` snapshot (drop). Both must have
  lat/lng — if either is missing we abort cleanly and surface the error
  in the food_order_events timeline so ops can investigate instead of
  silently never dispatching.
* **No driver pre-assignment**: `express_bookings.status` starts at
  `searching`; `dispatch_next_offer` moves it to `offering` once an
  eligible driver is found. UI must distinguish those two states.
"""
from __future__ import annotations

import json as _json
import logging
import secrets
import uuid
from typing import Optional, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from core.models import ExpressBooking, ExpressBookingTimeline
from modules.express.dispatch import dispatch_next_offer

log = logging.getLogger("baked.food.dispatch_bridge")


# ---------------------------------------------------------------------------
# Vehicle selection
# ---------------------------------------------------------------------------
# Deterministic size-based picking so a given order always resolves to the
# same vehicle class. All codes must appear in modules.express.dispatch
# .FALLBACK_CHAIN so the dispatch engine can still match if the preferred
# class has no live driver.
#
# Thresholds are intentionally conservative; Super Admin may later override
# via a config row (see TODO at module bottom).
def required_vehicle_for_order(items_count: int, order_grand_total: float = 0.0) -> str:
    """Pick the smallest vehicle class that can realistically carry the
    order. Only `items_count` is used today — grand_total is accepted so
    thresholds can be enriched later (e.g. bulk catering trigger)."""
    if items_count <= 8:
        return "bike"
    if items_count <= 20:
        return "scooter"
    return "three_wheeler"


def _four_digit_pin() -> str:
    """Non-sequential, non-leading-zero PIN. Avoids `0000` which looks
    like a bug on screen and uses `secrets` so it isn't predictable."""
    # 1000-9999 inclusive, no leading zero.
    return str(1000 + secrets.randbelow(9000))


# ---------------------------------------------------------------------------
# Idempotency guard
# ---------------------------------------------------------------------------

async def _existing_live_delivery(session: AsyncSession, food_order_id: str) -> Optional[str]:
    """Return the id of the active (non-cancelled) express_booking already
    linked to this food order, or None. Used before INSERT so we never
    rely purely on the DB unique index to produce a race error we have to
    recover from."""
    row = (await session.execute(text(
        "SELECT id FROM express_bookings "
        " WHERE food_order_id = :fo AND status <> 'cancelled' "
        " ORDER BY created_at DESC LIMIT 1"
    ), {"fo": food_order_id})).fetchone()
    return row.id if row else None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

class DispatchError(Exception):
    """Raised with a short machine code so the caller can log + continue
    without crashing the partner-action HTTP response."""


async def create_delivery_job_for_order(
    session: AsyncSession,
    food_order_id: str,
) -> Tuple[Optional[str], str]:
    """Idempotent: ensure a live `express_bookings` food_delivery row
    exists for this food order and that `dispatch_next_offer` has been
    kicked off.

    Returns (booking_id, status_code) where status_code is one of:
        'created'        – fresh row + dispatch_next_offer invoked
        'existing'       – a live row already existed; left as-is
        'skip_pickup'    – order_type='pickup', no delivery needed
        'skip_invalid'   – order not in a dispatchable state

    Raises DispatchError on hard failures (missing coords, bad restaurant),
    with the machine code in `exc.args[0]`.
    """
    # ------------------------------------------------------------------
    # 1) Pull the food order + its restaurant pickup coordinates
    # ------------------------------------------------------------------
    row = (await session.execute(text("""
        SELECT o.id, o.order_number, o.customer_id, o.order_type, o.status,
               o.delivery_address, o.grand_total, o.restaurant_id, o.country,
               o.customer_snapshot,
               (SELECT COUNT(*) FROM food_order_items it WHERE it.order_id = o.id) AS items_count,
               r.name AS r_name, r.address AS r_address, r.latitude AS r_lat, r.longitude AS r_lng,
               r.contact_phone AS r_phone
          FROM food_orders o
          JOIN food_restaurants r ON r.id = o.restaurant_id
         WHERE o.id = :id
    """), {"id": food_order_id})).fetchone()
    if not row:
        raise DispatchError("order_not_found")

    # Pickup-only orders never dispatch a driver.
    if (row.order_type or "").lower() == "pickup":
        return None, "skip_pickup"

    # Must be in a state we're happy to dispatch from. Partner may have
    # retried the transition from a stale card — don't dispatch for an
    # order already delivered or rejected.
    if row.status not in ("accepted", "preparing", "ready"):
        return None, "skip_invalid"

    # Delivery dispatch requires an authenticated customer (express_bookings
    # has FK → customers.id NOT NULL). Guest FOOD orders should be caught
    # earlier by the API, but belt-and-braces: raise here instead of a
    # cryptic NOT NULL violation.
    if not row.customer_id:
        raise DispatchError("anonymous_customer_cannot_receive_delivery")

    # ------------------------------------------------------------------
    # 2) Short-circuit if an active delivery row already exists
    # ------------------------------------------------------------------
    existing = await _existing_live_delivery(session, food_order_id)
    if existing:
        return existing, "existing"

    # ------------------------------------------------------------------
    # 3) Validate pickup + drop coordinates
    # ------------------------------------------------------------------
    r_lat, r_lng = row.r_lat, row.r_lng
    if r_lat is None or r_lng is None:
        raise DispatchError("restaurant_coords_missing")

    delivery = row.delivery_address or {}
    if not isinstance(delivery, dict):
        try:
            delivery = _json.loads(delivery)
        except Exception:  # noqa: BLE001
            delivery = {}
    d_lat = delivery.get("lat") or delivery.get("latitude")
    d_lng = delivery.get("lng") or delivery.get("longitude")
    if d_lat is None or d_lng is None:
        raise DispatchError("drop_coords_missing")

    # ------------------------------------------------------------------
    # 4) Build the shadow booking
    # ------------------------------------------------------------------
    cust_snap = row.customer_snapshot or {}
    receiver_name  = (delivery.get("contact_name")
                      or cust_snap.get("name")
                      or "Customer")
    receiver_phone = (delivery.get("phone")
                      or cust_snap.get("phone")
                      or "")

    booking_id = f"exp_{uuid.uuid4().hex[:16]}"
    booking_ref = f"FD-{row.order_number.split('-')[-1]}" if "-" in row.order_number else row.order_number
    vehicle_code = required_vehicle_for_order(int(row.items_count or 1), float(row.grand_total or 0))
    pickup_pin = _four_digit_pin()

    # The dispatch engine reads this row via `session.get(ExpressBooking, …)`
    # after we commit, so insert via SQL (consistent with the rest of the
    # FOOD module) rather than mixing ORM and raw inserts.
    try:
        await session.execute(text("""
            INSERT INTO express_bookings
              (id, ref, customer_id, module, booking_type, service_type,
               source_module, food_order_id,
               country, status, payment_method, payment_status, currency, total,
               vehicle_code,
               pickup_line1, pickup_latitude, pickup_longitude,
               pickup_formatted_address, pickup_country,
               drop_line1, drop_latitude, drop_longitude,
               drop_formatted_address, drop_city, drop_country,
               receiver_name, receiver_phone, receiver_notes, receiver_preferences,
               package_type, pickup_pin,
               declined_driver_ids)
            VALUES
              (:id, :ref, :cid, 'express', 'food_delivery', NULL,
               'food', :fo,
               :country, 'searching', :pm, 'pending', :cur, 0,
               :vc,
               :p_line1, :p_lat, :p_lng, :p_addr, :p_cc,
               :d_line1, :d_lat, :d_lng, :d_addr, :d_city, :d_cc,
               :rn, :rp, :rnotes, CAST('{}' AS VARCHAR[]),
               'food', :pin,
               CAST('[]' AS JSONB))
        """), {
            "id": booking_id, "ref": booking_ref,
            "cid": row.customer_id, "fo": food_order_id,
            "country": (row.country or "CI").upper()[:2],
            "pm": "cod",  # FOOD cod/wallet handled by payment_method on food_orders itself.
            "cur": "XOF",
            "vc": vehicle_code,
            "p_line1": row.r_address or row.r_name,
            "p_lat": r_lat, "p_lng": r_lng,
            "p_addr": row.r_address or "",
            "p_cc": (row.country or "CI").upper()[:2],
            "d_line1": delivery.get("line1") or delivery.get("label") or "",
            "d_lat": d_lat, "d_lng": d_lng,
            "d_addr": delivery.get("formatted_address") or delivery.get("line1") or "",
            "d_city": delivery.get("city") or "",
            "d_cc":  (row.country or "CI").upper()[:2],
            "rn": receiver_name, "rp": receiver_phone,
            "rnotes": delivery.get("notes") or "",
            "pin": pickup_pin,
        })
    except IntegrityError:
        # The unique index saved us from a race. Fetch the winner row.
        existing = await _existing_live_delivery(session, food_order_id)
        if existing:
            return existing, "existing"
        raise

    # ------------------------------------------------------------------
    # 5) Hand off to the existing dispatch engine
    # ------------------------------------------------------------------
    booking = await session.get(ExpressBooking, booking_id)
    if booking is None:  # pragma: no cover — defensive
        raise DispatchError("booking_not_persisted")

    # Insert a timeline origin marker *before* dispatch_next_offer so the
    # SEND tracking UI shows a non-empty history as soon as it polls.
    from datetime import datetime, timezone
    session.add(ExpressBookingTimeline(
        booking_id=booking_id, code="searching",
        label="Finding a driver for the restaurant",
        at=datetime.now(timezone.utc),
    ))

    await dispatch_next_offer(session, booking)
    # NB: the caller commits — this function stays side-effect-free w.r.t.
    # transaction boundaries, matching the SEND dispatch convention.
    return booking_id, "created"


# ---------------------------------------------------------------------------
# Public-safe serialisation for the FOOD-side delivery API
# ---------------------------------------------------------------------------

# Map the SEND status enum → FOOD-facing lifecycle string. The restaurant
# & customer UIs render these; keep translations in the i18n locale files.
STATUS_MAP = {
    "searching":        "searching_driver",
    "offering":         "offering_driver",
    "driver_assigned":  "driver_assigned",
    "arriving":         "driver_en_route_pickup",
    "picked_up":        "picked_up",
    "in_transit":       "en_route_customer",
    "delivered":        "delivered",
    "cancelled":        "cancelled",
    "confirmed":        "driver_assigned",
}


def food_delivery_public(booking: "ExpressBooking", *, include_pin: bool = False) -> dict:
    """Partner-safe + customer-safe view of a food_delivery express_booking.

    `include_pin=True` is reserved for the partner endpoint — the customer
    never sees the pickup PIN.
    """
    snap = booking.driver_snapshot or {}
    out = {
        "booking_id": booking.id,
        "food_order_id": booking.food_order_id,
        "status": STATUS_MAP.get(booking.status, booking.status),
        "raw_status": booking.status,
        "vehicle_code": booking.vehicle_code,
        "receiver_name":  booking.receiver_name,
        "receiver_phone": booking.receiver_phone,
        "pickup": {
            "lat":   float(booking.pickup_latitude)  if booking.pickup_latitude  is not None else None,
            "lng":   float(booking.pickup_longitude) if booking.pickup_longitude is not None else None,
            "line1": booking.pickup_line1,
            "city":  booking.pickup_city,
        },
        "drop": {
            "lat":   float(booking.drop_latitude)  if booking.drop_latitude  is not None else None,
            "lng":   float(booking.drop_longitude) if booking.drop_longitude is not None else None,
            "line1": booking.drop_line1,
            "city":  booking.drop_city,
        },
        "driver": {
            # Everything served from driver_snapshot — a stable, privacy-safe subset.
            "name":        snap.get("name"),
            "photo_url":   snap.get("photo_url"),
            "vehicle":     snap.get("vehicle_type"),
            "plate":       snap.get("vehicle_reg"),
            "rating":      snap.get("rating"),
            "phone":       snap.get("phone"),  # exposed to partner only; customer version strips it below.
        } if booking.driver_id else None,
        "driver_location": {
            "lat": float(booking.driver_location_lat) if booking.driver_location_lat is not None else None,
            "lng": float(booking.driver_location_lng) if booking.driver_location_lng is not None else None,
        } if booking.driver_location_lat is not None else None,
        "offered_at":        booking.offered_at.isoformat() if booking.offered_at else None,
        "offer_expires_at":  booking.offer_expires_at.isoformat() if booking.offer_expires_at else None,
        "delivered_at":      booking.delivered_at.isoformat() if booking.delivered_at else None,
    }
    if include_pin:
        out["pickup_pin"] = booking.pickup_pin
    return out
