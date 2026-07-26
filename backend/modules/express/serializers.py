"""Shared dict-shaping helpers for express booking API/WebSocket responses.

Bookings store pickup/drop/receiver/package as flattened columns (see
core/models/express.py); these helpers rebuild the nested dict shape the
frontend expects, matching the original embedded-document API contract.
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import ExpressBooking, ExpressBookingItem, ExpressBookingTimeline
from core.serializers import row_to_dict

_FLATTENED_PREFIXES = ("pickup_", "drop_", "receiver_", "package_", "movers_")
_FLATTENED_EXTRA = {"driver_location_lat", "driver_location_lng"}


def _pickup(b: ExpressBooking) -> Optional[dict]:
    if b.pickup_line1 is None:
        return None
    return {
        "line1": b.pickup_line1,
        "latitude": float(b.pickup_latitude) if b.pickup_latitude is not None else None,
        "longitude": float(b.pickup_longitude) if b.pickup_longitude is not None else None,
        "formatted_address": b.pickup_formatted_address,
        "place_id": b.pickup_place_id,
        "landmark": b.pickup_landmark,
        "building": b.pickup_building,
        "city": b.pickup_city,
        "country": b.pickup_country,
    }


def _drop(b: ExpressBooking) -> Optional[dict]:
    if b.drop_line1 is None:
        return None
    return {
        "line1": b.drop_line1,
        "latitude": float(b.drop_latitude) if b.drop_latitude is not None else None,
        "longitude": float(b.drop_longitude) if b.drop_longitude is not None else None,
        "formatted_address": b.drop_formatted_address,
        "place_id": b.drop_place_id,
        "landmark": b.drop_landmark,
        "building": b.drop_building,
        "city": b.drop_city,
        "country": b.drop_country,
    }


def _receiver(b: ExpressBooking) -> Optional[dict]:
    if b.receiver_name is None:
        return None
    return {
        "name": b.receiver_name,
        "phone": b.receiver_phone,
        "alt_phone": b.receiver_alt_phone,
        "building": b.receiver_building,
        "landmark": b.receiver_landmark,
        "notes": b.receiver_notes,
        "preferences": b.receiver_preferences or [],
    }


def _package(b: ExpressBooking) -> Optional[dict]:
    if b.package_type is None and b.package_weight_range is None and b.package_notes is None and b.package_dimensions is None:
        return None
    return {
        "type": b.package_type,
        "weight_range": b.package_weight_range,
        "dimensions": b.package_dimensions,
        "notes": b.package_notes,
    }


def _driver_location(b: ExpressBooking) -> Optional[dict]:
    if b.driver_location_lat is None or b.driver_location_lng is None:
        return None
    return {"lat": float(b.driver_location_lat), "lng": float(b.driver_location_lng)}


async def booking_to_dict(session: AsyncSession, booking: ExpressBooking) -> dict:
    timeline_rows = (
        (
            await session.execute(
                select(ExpressBookingTimeline)
                .where(ExpressBookingTimeline.booking_id == booking.id)
                .order_by(ExpressBookingTimeline.seq)
            )
        )
        .scalars()
        .all()
    )
    data = row_to_dict(booking)
    data["pickup"] = _pickup(booking)
    data["drop"] = _drop(booking)
    data["receiver"] = _receiver(booking)
    data["package"] = _package(booking)
    data["driver_location"] = _driver_location(booking)
    data["timeline"] = [{"code": t.code, "label": t.label, "at": t.at.isoformat()} for t in timeline_rows]
    if booking.booking_type == "movers":
        item_rows = (
            (await session.execute(select(ExpressBookingItem).where(ExpressBookingItem.booking_id == booking.id)))
            .scalars()
            .all()
        )
        data["items"] = [{"item_id": i.item_id, "qty": i.qty} for i in item_rows]
    for key in list(data.keys()):
        if key.startswith(_FLATTENED_PREFIXES) or key in _FLATTENED_EXTRA:
            data.pop(key, None)
    return data


def public_booking_fields(data: dict) -> dict:
    keep = {
        "id", "ref", "status", "booking_type", "vehicle_code", "country",
        "pickup", "drop", "receiver", "distance_km", "duration_min",
        "currency", "currency_symbol", "total", "payment_method",
        "payment_status", "driver_id", "driver_snapshot",
        "driver_location", "eta_seconds", "timeline", "updated_at",
    }
    return {k: data.get(k) for k in keep if k in data}
