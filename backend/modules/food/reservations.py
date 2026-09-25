"""FOODbakēd — Table reservations + real-time partner notification engine.

Endpoint surface
----------------
Public (no auth OR optional customer auth):
  GET   /api/food/restaurants/{slug_or_id}/reservation-config
  GET   /api/food/restaurants/{slug_or_id}/reservation-slots?date=YYYY-MM-DD&party_size=N
  POST  /api/food/restaurants/{slug_or_id}/reservations

Customer (Bearer customer JWT — global Baked auth):
  GET   /api/food/customer/reservations
  POST  /api/food/customer/reservations/{id}/cancel

Restaurant partner OR super-admin (per `_get_menu_writer` — tenant isolated):
  GET   /api/food/manage/{rid}/reservations
  PATCH /api/food/manage/{rid}/reservations/{id}
  GET   /api/food/manage/{rid}/reservation-settings
  PUT   /api/food/manage/{rid}/reservation-settings
  PATCH /api/food/manage/{rid}/reservation-toggle
  WS    /api/food/manage/{rid}/ws?token=<partner_jwt>

Real-time
---------
Shared FOODbakēd Restaurant Notification Engine. Publishes to
`food:restaurant:{restaurant_id}` on the existing pubsub bus. Frames:

    {"type": "food.reservation.created", "reservation": {…}}
    {"type": "food.reservation.updated", "reservation": {…}}
    {"type": "food.order.created",       "order":       {…}}    # reserved

The WebSocket resolves `restaurant_id` from the caller's JWT (partner) or
URL (admin) — a partner can NEVER subscribe to a restaurant it doesn't
own. Backend is the source of truth: pending reservations survive
disconnects; the partner UI re-hydrates from `GET /manage/{rid}/reservations`
on reconnect.
"""
from __future__ import annotations

import asyncio
import logging
import random
import string
import uuid
from datetime import datetime, date, time, timedelta, timezone
from typing import Any, Optional

import jwt as _jwt
from fastapi import (
    APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect,
)
from pydantic import BaseModel, EmailStr, Field, constr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketState

from core.db import SessionLocal, get_session
from core.deps import get_current_customer, get_optional_customer
from core.mailer import send_email_async
from core.models import Customer
from core.security import decode_token
from modules.food.routes import _get_menu_writer, _restaurant_row  # type: ignore
from modules.realtime import get_pubsub


log = logging.getLogger("baked.food.reservations")


# ---------------------------------------------------------------------------
# Router surfaces
# ---------------------------------------------------------------------------

public_router  = APIRouter(prefix="/food", tags=["food-reservations"])
customer_router = APIRouter(prefix="/food/customer", tags=["food-reservations"])
manage_router  = APIRouter(prefix="/food/manage",   tags=["food-reservations"])


DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DEFAULT_HOURS = {k: [["12:00", "14:30"], ["19:00", "22:00"]] for k in DAY_KEYS}


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _iso(dt: Any) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _serialise_reservation(row: Any) -> dict:
    return {
        "id":                row.id,
        "booking_reference": row.booking_reference,
        "restaurant_id":     row.restaurant_id,
        "customer_id":       row.customer_id,
        "guest_name":        row.guest_name,
        "guest_phone":       row.guest_phone,
        "guest_email":       row.guest_email,
        "party_size":        row.party_size,
        "reservation_at":    _iso(row.reservation_at),
        "notes":             row.notes,
        "status":            row.status,
        "rejection_reason":  row.rejection_reason,
        "cancellation_reason": row.cancellation_reason,
        "confirmed_at":      _iso(row.confirmed_at),
        "cancelled_at":      _iso(row.cancelled_at),
        "completed_at":      _iso(row.completed_at),
        "source":            row.source,
        "created_at":        _iso(row.created_at),
        "updated_at":        _iso(row.updated_at),
    }


def _serialise_settings(row: Any) -> dict:
    return {
        "restaurant_id":         row.restaurant_id,
        "slot_capacity":         row.slot_capacity,
        "min_party_size":        row.min_party_size,
        "max_party_size":        row.max_party_size,
        "min_lead_time_minutes": row.min_lead_time_minutes,
        "slot_interval_minutes": row.slot_interval_minutes,
        "advance_booking_days":  row.advance_booking_days,
        "auto_confirm":          row.auto_confirm,
        "hours":                 row.hours or DEFAULT_HOURS,
        "blackout_dates":        row.blackout_dates or [],
        "sound_new_order":       row.sound_new_order,
        "sound_new_reservation": row.sound_new_reservation,
        "sound_volume":          float(row.sound_volume) if row.sound_volume is not None else 0.8,
    }


# ---------------------------------------------------------------------------
# Restaurant lookup helpers
# ---------------------------------------------------------------------------

async def _resolve_restaurant(session: AsyncSession, slug_or_id: str, country: Optional[str] = None) -> Any:
    # Prefer exact ID match first (unique). If not found, fall back to slug —
    # scoped by country when provided (some slugs — e.g. `burger-hub` — are
    # shared across CI and IN tenants, so accept the caller's country hint
    # to disambiguate; otherwise return the first hit deterministically by
    # created_at ASC to keep behaviour stable across restarts.
    row = (await session.execute(text(
        "SELECT * FROM food_restaurants WHERE id = :s LIMIT 1"
    ), {"s": slug_or_id})).fetchone()
    if row:
        return row
    if country:
        row = (await session.execute(text(
            "SELECT * FROM food_restaurants WHERE slug = :s AND country = :c LIMIT 1"
        ), {"s": slug_or_id, "c": country})).fetchone()
    if not row:
        row = (await session.execute(text(
            "SELECT * FROM food_restaurants WHERE slug = :s ORDER BY created_at ASC LIMIT 1"
        ), {"s": slug_or_id})).fetchone()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    return row


async def _get_or_seed_settings(session: AsyncSession, rid: str) -> Any:
    row = (await session.execute(text(
        "SELECT * FROM food_reservation_settings WHERE restaurant_id = :rid"
    ), {"rid": rid})).fetchone()
    if row:
        return row
    # Lazy-seed with sensible defaults. Restaurant "hours" aren't currently
    # stored on `food_restaurants` — we start with DEFAULT_HOURS and partners
    # override via PUT /reservation-settings.
    import json as _json
    await session.execute(text("""
        INSERT INTO food_reservation_settings
            (restaurant_id, slot_capacity, min_party_size, max_party_size,
             min_lead_time_minutes, slot_interval_minutes, advance_booking_days,
             auto_confirm, hours, blackout_dates,
             sound_new_order, sound_new_reservation, sound_volume)
        VALUES
            (:rid, 20, 1, 12, 30, 30, 60, FALSE,
             CAST(:hours AS JSONB), '[]'::jsonb, TRUE, TRUE, 0.80)
        ON CONFLICT (restaurant_id) DO NOTHING
    """), {"rid": rid, "hours": _json.dumps(DEFAULT_HOURS)})
    await session.commit()
    return (await session.execute(text(
        "SELECT * FROM food_reservation_settings WHERE restaurant_id = :rid"
    ), {"rid": rid})).fetchone()


def _booking_reference() -> str:
    # 8 chars, uppercase alnum, no ambiguous 0/O/I/1
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "R-" + "".join(random.choices(alphabet, k=6))


# ---------------------------------------------------------------------------
# Slot availability
# ---------------------------------------------------------------------------

def _parse_hms(hm: str) -> time:
    h, m = hm.split(":")
    return time(int(h), int(m))


def _iter_slots(day_ranges: list, interval_min: int) -> list[time]:
    slots: list[time] = []
    for r in day_ranges or []:
        if not r or len(r) != 2:
            continue
        try:
            start = _parse_hms(r[0])
            end   = _parse_hms(r[1])
        except Exception:
            continue
        cursor = datetime.combine(date.today(), start)
        end_dt = datetime.combine(date.today(), end)
        while cursor + timedelta(minutes=interval_min) <= end_dt:
            slots.append(cursor.time())
            cursor += timedelta(minutes=interval_min)
    # De-dupe & sort.
    return sorted(set(slots))


async def _availability_for_date(
    session: AsyncSession, rid: str, settings: Any, target_date: date, party_size: int,
) -> list[dict]:
    hours_map = settings.hours or DEFAULT_HOURS
    key = DAY_KEYS[target_date.weekday()]
    day_ranges = hours_map.get(key) or []
    # Blackout?
    blackouts = settings.blackout_dates or []
    if target_date.isoformat() in blackouts:
        return []
    slots = _iter_slots(day_ranges, settings.slot_interval_minutes)
    if not slots:
        return []

    lead_cutoff = datetime.now(timezone.utc) + timedelta(minutes=settings.min_lead_time_minutes)

    # Grab all reservations for the day (active statuses) to compute per-slot load.
    day_start = datetime.combine(target_date, time(0, 0), tzinfo=timezone.utc)
    day_end   = day_start + timedelta(days=1)
    rows = (await session.execute(text("""
        SELECT reservation_at, party_size, status
          FROM food_reservations
         WHERE restaurant_id = :rid
           AND reservation_at >= :ds
           AND reservation_at <  :de
           AND status IN ('pending','confirmed')
    """), {"rid": rid, "ds": day_start, "de": day_end})).fetchall()

    # Bucket by slot start (HH:MM string in UTC → we display in UTC since the
    # restaurant persists times in UTC).
    load: dict[str, int] = {}
    for r in rows:
        r_at = r.reservation_at
        if r_at.tzinfo is None:
            r_at = r_at.replace(tzinfo=timezone.utc)
        key_s = r_at.strftime("%H:%M")
        load[key_s] = load.get(key_s, 0) + int(r.party_size or 0)

    out: list[dict] = []
    for t_ in slots:
        slot_dt = datetime.combine(target_date, t_, tzinfo=timezone.utc)
        if slot_dt < lead_cutoff:
            continue
        key_s = t_.strftime("%H:%M")
        used = load.get(key_s, 0)
        remaining = settings.slot_capacity - used
        available = remaining >= party_size
        out.append({
            "slot":      key_s,
            "iso":       slot_dt.isoformat(),
            "capacity":  settings.slot_capacity,
            "remaining": max(remaining, 0),
            "available": available,
        })
    return out


# ---------------------------------------------------------------------------
# Publish helper (broadcast to WS subscribers)
# ---------------------------------------------------------------------------

def restaurant_channel(rid: str) -> str:
    return f"food:restaurant:{rid}"


async def _publish(rid: str, frame: dict) -> None:
    try:
        await get_pubsub().publish(restaurant_channel(rid), frame)
    except Exception as e:  # noqa: BLE001
        log.warning("food.reservations.publish_err rid=%s err=%s", rid, e)


# ---------------------------------------------------------------------------
# Public — reservation-config + slots
# ---------------------------------------------------------------------------

@public_router.get("/restaurants/{slug_or_id}/reservation-config")
async def get_reservation_config(
    slug_or_id: str,
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    r = await _resolve_restaurant(session, slug_or_id, country)
    if not r.reservations_enabled:
        return {
            "restaurant": {"id": r.id, "slug": r.slug, "name": r.name},
            "enabled": False,
            "paused": False,
        }
    settings = await _get_or_seed_settings(session, r.id)
    paused = False
    if r.reservations_paused_until:
        pu = r.reservations_paused_until
        if pu.tzinfo is None:
            pu = pu.replace(tzinfo=timezone.utc)
        paused = pu > datetime.now(timezone.utc)
    return {
        "restaurant": {"id": r.id, "slug": r.slug, "name": r.name,
                        "image": r.image, "cuisines": r.cuisines or []},
        "enabled": True,
        "paused":  paused,
        "min_party_size":        settings.min_party_size,
        "max_party_size":        settings.max_party_size,
        "min_lead_time_minutes": settings.min_lead_time_minutes,
        "slot_interval_minutes": settings.slot_interval_minutes,
        "advance_booking_days":  settings.advance_booking_days,
    }


@public_router.get("/restaurants/{slug_or_id}/reservation-slots")
async def list_slots(
    slug_or_id: str,
    date_iso: str = Query(..., alias="date"),
    party_size: int = Query(2, ge=1, le=40),
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    r = await _resolve_restaurant(session, slug_or_id, country)
    if not r.reservations_enabled:
        raise HTTPException(404, "Reservations not available for this restaurant")
    try:
        target = date.fromisoformat(date_iso)
    except ValueError:
        raise HTTPException(422, "Invalid date — expected YYYY-MM-DD")

    settings = await _get_or_seed_settings(session, r.id)
    if party_size < settings.min_party_size or party_size > settings.max_party_size:
        raise HTTPException(422, f"Party size must be between {settings.min_party_size} and {settings.max_party_size}")
    today = datetime.now(timezone.utc).date()
    if target < today:
        return {"date": date_iso, "slots": []}
    if (target - today).days > settings.advance_booking_days:
        raise HTTPException(422, f"Reservations open up to {settings.advance_booking_days} days ahead")

    slots = await _availability_for_date(session, r.id, settings, target, party_size)
    return {"date": date_iso, "party_size": party_size, "slots": slots}


# ---------------------------------------------------------------------------
# Public — create reservation
# ---------------------------------------------------------------------------

class ReservationCreateIn(BaseModel):
    reservation_at: datetime = Field(..., description="ISO UTC — must be one of the returned slots")
    party_size:     int = Field(..., ge=1, le=40)
    guest_name:     constr(strip_whitespace=True, min_length=2, max_length=120)
    guest_phone:    constr(strip_whitespace=True, min_length=5, max_length=32)
    guest_email:    Optional[EmailStr] = None
    notes:          Optional[constr(strip_whitespace=True, max_length=500)] = None


@public_router.post("/restaurants/{slug_or_id}/reservations", status_code=201)
async def create_reservation(
    slug_or_id: str,
    payload: ReservationCreateIn,
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
    customer: Optional[Customer] = Depends(get_optional_customer),
):
    r = await _resolve_restaurant(session, slug_or_id, country)
    if not r.reservations_enabled:
        raise HTTPException(400, "Reservations are not enabled for this restaurant")

    settings = await _get_or_seed_settings(session, r.id)

    # Guard: paused window
    if r.reservations_paused_until:
        pu = r.reservations_paused_until
        if pu.tzinfo is None:
            pu = pu.replace(tzinfo=timezone.utc)
        if pu > datetime.now(timezone.utc):
            raise HTTPException(400, "Reservations are temporarily paused")

    # Guard: party size
    if payload.party_size < settings.min_party_size or payload.party_size > settings.max_party_size:
        raise HTTPException(422, f"Party size must be between {settings.min_party_size} and {settings.max_party_size}")

    # Guard: lead time
    slot_dt = payload.reservation_at
    if slot_dt.tzinfo is None:
        slot_dt = slot_dt.replace(tzinfo=timezone.utc)
    lead_cutoff = datetime.now(timezone.utc) + timedelta(minutes=settings.min_lead_time_minutes)
    if slot_dt < lead_cutoff:
        raise HTTPException(422, "Slot no longer available — please pick another time")

    # Guard: advance-booking window
    today = datetime.now(timezone.utc).date()
    if (slot_dt.date() - today).days > settings.advance_booking_days:
        raise HTTPException(422, f"Reservations open up to {settings.advance_booking_days} days ahead")

    # Guard: capacity for slot (recount atomically enough for a busy Sunday night)
    key_s = slot_dt.strftime("%H:%M")
    day_start = datetime.combine(slot_dt.date(), time(0, 0), tzinfo=timezone.utc)
    day_end   = day_start + timedelta(days=1)
    slot_load = (await session.execute(text("""
        SELECT COALESCE(SUM(party_size), 0) AS used
          FROM food_reservations
         WHERE restaurant_id = :rid
           AND reservation_at >= :ds
           AND reservation_at <  :de
           AND status IN ('pending','confirmed')
           AND to_char(reservation_at AT TIME ZONE 'UTC', 'HH24:MI') = :slot
    """), {"rid": r.id, "ds": day_start, "de": day_end, "slot": key_s})).scalar()
    used = int(slot_load or 0)
    if used + payload.party_size > settings.slot_capacity:
        raise HTTPException(409, "Slot just filled up — please pick another time")

    # Insert
    now = datetime.now(timezone.utc)
    reservation_id = f"rsv_{uuid.uuid4().hex[:16]}"
    ref = _booking_reference()
    # Ensure ref uniqueness (extremely likely first try)
    for _ in range(5):
        exists = (await session.execute(text(
            "SELECT 1 FROM food_reservations WHERE booking_reference = :b"
        ), {"b": ref})).fetchone()
        if not exists:
            break
        ref = _booking_reference()

    status_v = "confirmed" if settings.auto_confirm else "pending"
    confirmed_at = now if status_v == "confirmed" else None

    email = payload.guest_email
    if customer and not email:
        email = customer.email
    name = payload.guest_name
    phone = payload.guest_phone

    await session.execute(text("""
        INSERT INTO food_reservations
            (id, booking_reference, restaurant_id, customer_id,
             guest_name, guest_phone, guest_email, party_size, reservation_at,
             notes, status, confirmed_at, source, created_at, updated_at)
        VALUES
            (:id, :ref, :rid, :cid,
             :name, :phone, :email, :ps, :rat,
             :notes, :st, :cf, 'web', :now, :now)
    """), {
        "id": reservation_id, "ref": ref, "rid": r.id,
        "cid": customer.id if customer else None,
        "name": name, "phone": phone, "email": email,
        "ps": payload.party_size, "rat": slot_dt,
        "notes": payload.notes, "st": status_v, "cf": confirmed_at, "now": now,
    })
    await session.execute(text("""
        INSERT INTO food_reservation_events
            (id, reservation_id, from_status, to_status, actor, actor_role, notes, created_at)
        VALUES (:id, :rid, NULL, :st, :actor, :role, :notes, :now)
    """), {
        "id": f"rev_{uuid.uuid4().hex[:16]}", "rid": reservation_id,
        "st": status_v,
        "actor": customer.id if customer else None,
        "role":  "customer" if customer else "guest",
        "notes": None, "now": now,
    })
    await session.commit()

    row = (await session.execute(text(
        "SELECT * FROM food_reservations WHERE id = :id"
    ), {"id": reservation_id})).fetchone()
    payload_out = _serialise_reservation(row)
    payload_out["restaurant"] = {
        "id": r.id, "name": r.name, "slug": r.slug, "image": r.image,
    }

    # Broadcast to the partner portal
    await _publish(r.id, {"type": "food.reservation.created", "reservation": payload_out})

    # Fire-and-forget notification emails (never block the response).
    asyncio.create_task(_send_reservation_emails(
        kind="created",
        restaurant_name=r.name,
        reservation=payload_out,
        customer_email=email,
        partner_notify=True,
    ))

    return payload_out


# ---------------------------------------------------------------------------
# Customer — my reservations
# ---------------------------------------------------------------------------

@customer_router.get("/reservations")
async def list_my_reservations(
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    # Match by customer_id primarily; also fold in guest reservations that
    # share the verified phone/email of the customer so pre-signup bookings
    # aren't orphaned.
    rows = (await session.execute(text("""
        SELECT * FROM food_reservations
         WHERE (customer_id = :cid)
            OR (customer_id IS NULL AND (
                    LOWER(guest_email) = LOWER(COALESCE(:email, ''))
                 OR guest_phone = COALESCE(:phone, '')
                ))
         ORDER BY reservation_at DESC
         LIMIT 200
    """), {"cid": customer.id, "email": customer.email or "", "phone": customer.phone or ""})).fetchall()
    # Auto-link matched guest reservations to the customer so they stick.
    orphan_ids = [r.id for r in rows if r.customer_id is None]
    if orphan_ids:
        await session.execute(text(
            "UPDATE food_reservations SET customer_id = :cid, updated_at = now() WHERE id = ANY(:ids)"
        ), {"cid": customer.id, "ids": orphan_ids})
        await session.commit()

    # Fetch restaurants for embedded summary.
    rest_ids = list({r.restaurant_id for r in rows})
    rest_by_id: dict[str, Any] = {}
    if rest_ids:
        rest_rows = (await session.execute(text(
            "SELECT id, name, slug, image FROM food_restaurants WHERE id = ANY(:ids)"
        ), {"ids": rest_ids})).fetchall()
        rest_by_id = {rr.id: rr for rr in rest_rows}

    out = []
    for r in rows:
        d = _serialise_reservation(r)
        rest = rest_by_id.get(r.restaurant_id)
        d["restaurant"] = {
            "id": rest.id, "name": rest.name, "slug": rest.slug, "image": rest.image,
        } if rest else None
        out.append(d)
    return {"reservations": out}


class ReservationCancelIn(BaseModel):
    reason: Optional[constr(strip_whitespace=True, max_length=300)] = None


@customer_router.post("/reservations/{rid}/cancel")
async def customer_cancel(
    rid: str,
    payload: ReservationCancelIn,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    row = (await session.execute(text(
        "SELECT * FROM food_reservations WHERE id = :id"
    ), {"id": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Reservation not found")
    if row.customer_id != customer.id:
        # Guest reservations can still be cancelled by phone match — but the
        # /me route already claims them. Reject here.
        raise HTTPException(403, "You can't cancel this reservation")
    if row.status not in ("pending", "confirmed"):
        raise HTTPException(400, "This reservation cannot be cancelled")

    now = datetime.now(timezone.utc)
    await session.execute(text("""
        UPDATE food_reservations
           SET status = 'cancelled', cancelled_at = :now, updated_at = :now,
               cancellation_reason = :reason
         WHERE id = :id
    """), {"id": rid, "now": now, "reason": payload.reason})
    await session.execute(text("""
        INSERT INTO food_reservation_events
            (id, reservation_id, from_status, to_status, actor, actor_role, notes, created_at)
        VALUES (:id, :rid, :from, 'cancelled', :actor, 'customer', :notes, :now)
    """), {
        "id": f"rev_{uuid.uuid4().hex[:16]}", "rid": rid, "from": row.status,
        "actor": customer.id, "notes": payload.reason, "now": now,
    })
    await session.commit()

    row = (await session.execute(text(
        "SELECT * FROM food_reservations WHERE id = :id"
    ), {"id": rid})).fetchone()
    out = _serialise_reservation(row)
    await _publish(row.restaurant_id, {"type": "food.reservation.updated", "reservation": out})
    return out


# ---------------------------------------------------------------------------
# Partner / admin — settings + toggle
# ---------------------------------------------------------------------------

@manage_router.get("/{rid}/reservation-settings")
async def get_settings(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    settings = await _get_or_seed_settings(session, rid)
    r = (await session.execute(text(
        "SELECT reservations_enabled, reservations_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    return {
        "settings": _serialise_settings(settings),
        "enabled":  bool(r.reservations_enabled),
        "paused_until": _iso(r.reservations_paused_until),
    }


class ReservationSettingsIn(BaseModel):
    slot_capacity:         Optional[int] = Field(None, ge=1, le=500)
    min_party_size:        Optional[int] = Field(None, ge=1, le=40)
    max_party_size:        Optional[int] = Field(None, ge=1, le=40)
    min_lead_time_minutes: Optional[int] = Field(None, ge=0, le=7*24*60)
    slot_interval_minutes: Optional[int] = Field(None)
    advance_booking_days:  Optional[int] = Field(None, ge=1, le=365)
    auto_confirm:          Optional[bool] = None
    hours:                 Optional[dict] = None
    blackout_dates:        Optional[list[str]] = None
    sound_new_order:       Optional[bool] = None
    sound_new_reservation: Optional[bool] = None
    sound_volume:          Optional[float] = Field(None, ge=0.0, le=1.0)


@manage_router.put("/{rid}/reservation-settings")
async def update_settings(
    rid: str, payload: ReservationSettingsIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    settings = await _get_or_seed_settings(session, rid)
    fields = payload.model_dump(exclude_none=True)
    if payload.slot_interval_minutes and payload.slot_interval_minutes not in (15, 30, 60):
        raise HTTPException(422, "slot_interval_minutes must be 15, 30 or 60")
    # Basic sanity: min <= max
    new_min = fields.get("min_party_size", settings.min_party_size)
    new_max = fields.get("max_party_size", settings.max_party_size)
    if new_max < new_min:
        raise HTTPException(422, "max_party_size must be >= min_party_size")

    import json as _json
    sets = []
    params: dict[str, Any] = {"rid": rid}
    for k, v in fields.items():
        if k in ("hours", "blackout_dates"):
            sets.append(f"{k} = CAST(:{k} AS JSONB)")
            params[k] = _json.dumps(v)
        else:
            sets.append(f"{k} = :{k}")
            params[k] = v
    sets.append("updated_at = now()")
    await session.execute(text(
        f"UPDATE food_reservation_settings SET {', '.join(sets)} WHERE restaurant_id = :rid"
    ), params)
    await session.commit()
    settings = await _get_or_seed_settings(session, rid)
    return _serialise_settings(settings)


class ReservationToggleIn(BaseModel):
    enabled: Optional[bool] = None
    pause_hours: Optional[int] = Field(None, ge=0, le=24 * 30)


@manage_router.patch("/{rid}/reservation-toggle")
async def toggle_reservations(
    rid: str, payload: ReservationToggleIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    sets = []
    params: dict[str, Any] = {"rid": rid}
    if payload.enabled is not None:
        sets.append("reservations_enabled = :enabled")
        params["enabled"] = payload.enabled
    if payload.pause_hours is not None:
        if payload.pause_hours == 0:
            sets.append("reservations_paused_until = NULL")
        else:
            sets.append("reservations_paused_until = :until")
            params["until"] = datetime.now(timezone.utc) + timedelta(hours=payload.pause_hours)
    if not sets:
        raise HTTPException(422, "Nothing to update")
    await session.execute(text(
        f"UPDATE food_restaurants SET {', '.join(sets)} WHERE id = :rid"
    ), params)
    await session.commit()
    r = (await session.execute(text(
        "SELECT reservations_enabled, reservations_paused_until FROM food_restaurants WHERE id = :id"
    ), {"id": rid})).fetchone()
    return {
        "enabled":      bool(r.reservations_enabled),
        "paused_until": _iso(r.reservations_paused_until),
    }


# ---------------------------------------------------------------------------
# Partner / admin — reservation list + status change
# ---------------------------------------------------------------------------

@manage_router.get("/{rid}/reservations")
async def list_reservations(
    rid: str, request: Request,
    date_iso: Optional[str] = Query(None, alias="date"),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    conds = ["restaurant_id = :rid"]
    params: dict[str, Any] = {"rid": rid, "limit": limit}
    if date_iso:
        try:
            target = date.fromisoformat(date_iso)
        except ValueError:
            raise HTTPException(422, "Invalid date")
        params["ds"] = datetime.combine(target, time(0, 0), tzinfo=timezone.utc)
        params["de"] = params["ds"] + timedelta(days=1)
        conds.append("reservation_at >= :ds AND reservation_at < :de")
    if status:
        conds.append("status = :status")
        params["status"] = status
    if q:
        conds.append(
            "(LOWER(guest_name) LIKE :q OR guest_phone LIKE :q OR "
            "LOWER(COALESCE(guest_email, '')) LIKE :q OR booking_reference ILIKE :q)"
        )
        params["q"] = f"%{q.lower()}%"

    rows = (await session.execute(text(
        f"""SELECT * FROM food_reservations
             WHERE {' AND '.join(conds)}
             ORDER BY reservation_at ASC, created_at ASC
             LIMIT :limit"""
    ), params)).fetchall()

    now = datetime.now(timezone.utc)
    day_start = datetime.combine(now.date(), time(0, 0), tzinfo=timezone.utc)
    day_end   = day_start + timedelta(days=1)
    counts = (await session.execute(text("""
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')                                       AS pending,
          COUNT(*) FILTER (WHERE reservation_at >= :ds AND reservation_at < :de
                              AND status IN ('pending','confirmed'))                       AS today,
          COUNT(*) FILTER (WHERE reservation_at >  :now
                              AND status IN ('pending','confirmed'))                       AS upcoming
          FROM food_reservations
         WHERE restaurant_id = :rid
    """), {"rid": rid, "ds": day_start, "de": day_end, "now": now})).fetchone()

    return {
        "reservations": [_serialise_reservation(r) for r in rows],
        "counts": {
            "pending":  int(counts.pending),
            "today":    int(counts.today),
            "upcoming": int(counts.upcoming),
        },
    }


class ReservationActionIn(BaseModel):
    action: str = Field(..., description="confirm|reject|cancel|no_show|complete")
    reason: Optional[constr(strip_whitespace=True, max_length=300)] = None


ACTION_TO_STATUS = {
    "confirm":   "confirmed",
    "reject":    "rejected",
    "cancel":    "cancelled",
    "no_show":   "no_show",
    "complete":  "completed",
}


@manage_router.patch("/{rid}/reservations/{res_id}")
async def act_on_reservation(
    rid: str, res_id: str, payload: ReservationActionIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    kind, actor = await _get_menu_writer(rid, request, session)
    new_status = ACTION_TO_STATUS.get(payload.action)
    if not new_status:
        raise HTTPException(422, "Unknown action")
    row = (await session.execute(text(
        "SELECT * FROM food_reservations WHERE id = :id AND restaurant_id = :rid"
    ), {"id": res_id, "rid": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Reservation not found")
    if row.status == new_status:
        return _serialise_reservation(row)

    # Transition guards
    TERMINAL = {"cancelled", "rejected", "completed", "no_show"}
    if row.status in TERMINAL:
        raise HTTPException(400, f"Cannot {payload.action} a {row.status} reservation")

    now = datetime.now(timezone.utc)
    sets = ["status = :st", "updated_at = :now"]
    params: dict[str, Any] = {"id": res_id, "st": new_status, "now": now}
    if new_status == "confirmed":
        sets.append("confirmed_at = :now")
    if new_status in ("cancelled", "rejected"):
        sets.append("cancelled_at = :now")
        if payload.action == "reject":
            sets.append("rejection_reason = :reason")
            params["reason"] = payload.reason
        else:
            sets.append("cancellation_reason = :reason")
            params["reason"] = payload.reason
    if new_status == "completed":
        sets.append("completed_at = :now")

    await session.execute(text(
        f"UPDATE food_reservations SET {', '.join(sets)} WHERE id = :id"
    ), params)
    await session.execute(text("""
        INSERT INTO food_reservation_events
            (id, reservation_id, from_status, to_status, actor, actor_role, notes, created_at)
        VALUES (:eid, :rid, :from, :to, :actor, :role, :notes, :now)
    """), {
        "eid": f"rev_{uuid.uuid4().hex[:16]}", "rid": res_id, "from": row.status,
        "to": new_status, "actor": actor, "role": kind, "notes": payload.reason, "now": now,
    })
    await session.commit()

    row = (await session.execute(text(
        "SELECT * FROM food_reservations WHERE id = :id"
    ), {"id": res_id})).fetchone()
    out = _serialise_reservation(row)
    await _publish(rid, {"type": "food.reservation.updated", "reservation": out})

    # Notify customer on confirm / reject
    if new_status in ("confirmed", "rejected") and row.guest_email:
        rest = (await session.execute(text(
            "SELECT name FROM food_restaurants WHERE id = :id"
        ), {"id": rid})).fetchone()
        asyncio.create_task(_send_reservation_emails(
            kind=new_status,
            restaurant_name=rest.name if rest else "Restaurant",
            reservation=out,
            customer_email=row.guest_email,
            partner_notify=False,
        ))
    return out


# ---------------------------------------------------------------------------
# Real-time WebSocket
# ---------------------------------------------------------------------------

async def _resolve_partner_from_ws_token(token: str) -> Optional[str]:
    """Return restaurant_id if token is a valid, active food_partner JWT."""
    try:
        payload = decode_token(token)
    except _jwt.PyJWTError:
        return None
    if payload.get("role") != "food_partner":
        return None
    async with SessionLocal() as s:
        row = (await s.execute(text(
            "SELECT restaurant_id, is_active FROM food_restaurant_partners WHERE id = :id"
        ), {"id": payload.get("sub")})).fetchone()
    if not row or not row.is_active:
        return None
    return row.restaurant_id


async def _resolve_admin_from_ws_token(token: str) -> bool:
    try:
        payload = decode_token(token)
    except _jwt.PyJWTError:
        return False
    return payload.get("role") in ("admin", "super_admin")


@manage_router.websocket("/{rid}/ws")
async def restaurant_ws(ws: WebSocket, rid: str, token: str = Query("")):
    """Subscribe to `food:restaurant:{rid}`. Access:
      * food_partner whose restaurant_id matches
      * super-admin (rid must exist)
    """
    if not token:
        await ws.close(code=4401); return

    partner_rid = await _resolve_partner_from_ws_token(token)
    is_admin = False
    if partner_rid:
        if partner_rid != rid:
            await ws.close(code=4403); return
    else:
        is_admin = await _resolve_admin_from_ws_token(token)
        if not is_admin:
            await ws.close(code=4401); return
        # Verify restaurant exists
        async with SessionLocal() as s:
            r = (await s.execute(text(
                "SELECT id FROM food_restaurants WHERE id = :id"
            ), {"id": rid})).fetchone()
        if not r:
            await ws.close(code=4404); return

    await ws.accept()
    channel = restaurant_channel(rid)
    sub = await get_pubsub().subscribe(channel)
    await ws.send_json({"type": "hello", "restaurant_id": rid})
    aiter = sub.__aiter__()

    async def _next_frame():
        try:
            return await aiter.__anext__()
        except StopAsyncIteration:
            return None

    async def _reader():
        # Keep the socket healthy: drain (and discard) any client-sent frames.
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            raise
        except Exception:
            return

    reader_task = asyncio.create_task(_reader())
    try:
        while ws.client_state == WebSocketState.CONNECTED:
            frame_task = asyncio.create_task(_next_frame())
            done, pending = await asyncio.wait(
                {frame_task, reader_task},
                timeout=25.0,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if reader_task in done:
                # Client disconnected; propagate below via receive_text raising.
                for p in pending: p.cancel()
                break
            if not done:
                # Heartbeat timeout — send ping and keep going.
                frame_task.cancel()
                try: await frame_task
                except Exception: pass
                try: await ws.send_json({"type": "ping"})
                except Exception: break
                continue
            # Frame task completed.
            try:
                frame = frame_task.result()
            except Exception:
                frame = None
            if frame is None:
                break
            try:
                await ws.send_json(frame)
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:  # noqa: BLE001
        log.warning("food.reservations.ws_err rid=%s err=%s", rid, e)
    finally:
        reader_task.cancel()
        try: await reader_task
        except Exception: pass
        try: await sub.close()
        except Exception: pass
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------

async def _send_reservation_emails(*, kind: str, restaurant_name: str,
                                    reservation: dict, customer_email: Optional[str],
                                    partner_notify: bool) -> None:
    when = reservation.get("reservation_at", "")
    party = reservation.get("party_size", "")
    ref = reservation.get("booking_reference", "")
    subject_map = {
        "created":   f"Réservation reçue · Reservation received — {restaurant_name}",
        "confirmed": f"Réservation confirmée · Reservation confirmed — {restaurant_name}",
        "rejected":  f"Réservation refusée · Reservation declined — {restaurant_name}",
    }
    subject = subject_map.get(kind, f"Réservation · Reservation — {restaurant_name}")
    body_html = f"""
    <div style="font-family: Inter, Arial, sans-serif; max-width:520px;">
      <h2 style="color:#00A651; margin-bottom:8px;">{subject}</h2>
      <p><strong>Restaurant:</strong> {restaurant_name}<br/>
         <strong>Date:</strong> {when}<br/>
         <strong>Personnes · Party:</strong> {party}<br/>
         <strong>Référence · Reference:</strong> {ref}</p>
      <p style="color:#666; font-size:12px;">Envoyé automatiquement par FOODbakēd · Sent automatically by FOODbakēd.</p>
    </div>
    """
    try:
        if customer_email:
            await send_email_async(to=customer_email, subject=subject, html_body=body_html)
        # Partner notify skipped in MVP — the real-time modal covers it.
        _ = partner_notify
    except Exception as e:  # noqa: BLE001
        log.warning("food.reservations.email_err kind=%s err=%s", kind, e)
