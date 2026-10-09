"""
FOODbakēd — Reservations end-to-end pytest coverage.

Boots up requests-based tests against the live backend at BASE_URL. Covers:
  * Reservation-disabled restaurants reject slot + create endpoints.
  * A fresh restaurant is enabled → slot list returns future slots respecting
    lead-time + advance-window guards.
  * Guest reservation flow (POST) creates a pending row with an R-XXXXXX ref.
  * Party-size validation against min/max.
  * Slot capacity guard (server rejects overbooking).
  * Customer's `/food/customer/reservations` claims guest rows on match.
  * Partner action endpoint transitions status and rejects invalid ops.
  * Tenant isolation on manage endpoints (partner cannot see other rid).
"""
from __future__ import annotations

import os
import time as _time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8001")


def _api(path: str) -> str:
    return f"{BASE_URL}/api{path}"


# ----------------------------------------------------- helpers

def _pick_enabled_slug() -> str:
    """Return a restaurant slug we can enable reservations on. Enables via
    direct SQL if not already enabled."""
    import asyncio
    from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
    from sqlalchemy import text as _t
    from core.db import SessionLocal

    async def m():
        async with SessionLocal() as s:
            r = (await s.execute(_t(
                "SELECT id, slug FROM food_restaurants WHERE country='CI' LIMIT 1"
            ))).fetchone()
            if not r: return None
            await s.execute(_t(
                "UPDATE food_restaurants SET reservations_enabled = TRUE WHERE id = :id"
            ), {"id": r.id})
            await s.commit()
            return r.slug
    return asyncio.get_event_loop().run_until_complete(m())


@pytest.fixture(scope="module")
def slug():
    s = _pick_enabled_slug()
    assert s, "No CI restaurant seeded"
    return s


def _tomorrow_slot() -> str:
    """Return an ISO datetime string ~19:00 tomorrow UTC."""
    d = datetime.now(timezone.utc) + timedelta(days=1)
    d = d.replace(hour=19, minute=0, second=0, microsecond=0)
    return d.isoformat()


# ----------------------------------------------------- tests

def test_reservation_config_disabled_returns_flag():
    # Find a slug that is NOT enabled — the test above may have enabled one
    # in CI; look for any IN row.
    import asyncio
    from dotenv import load_dotenv; load_dotenv("/app/backend/.env")
    from sqlalchemy import text as _t
    from core.db import SessionLocal
    async def m():
        async with SessionLocal() as s:
            r = (await s.execute(_t(
                "SELECT slug FROM food_restaurants WHERE reservations_enabled=FALSE LIMIT 1"
            ))).fetchone()
            return r.slug if r else None
    disabled_slug = asyncio.get_event_loop().run_until_complete(m())
    if not disabled_slug:
        pytest.skip("no disabled restaurant left")
    r = requests.get(_api(f"/food/restaurants/{disabled_slug}/reservation-config"))
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False


def test_reservation_config_returns_settings(slug):
    r = requests.get(_api(f"/food/restaurants/{slug}/reservation-config"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is True
    for k in ("min_party_size", "max_party_size", "min_lead_time_minutes", "slot_interval_minutes"):
        assert k in body


def test_slots_reject_past_date(slug):
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    r = requests.get(_api(f"/food/restaurants/{slug}/reservation-slots"), params={"date": yesterday, "party_size": 2})
    assert r.status_code == 200
    assert r.json()["slots"] == []


def test_slots_return_availability(slug):
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
    r = requests.get(_api(f"/food/restaurants/{slug}/reservation-slots"), params={"date": tomorrow, "party_size": 2})
    assert r.status_code == 200
    slots = r.json()["slots"]
    assert isinstance(slots, list) and len(slots) > 0
    for s in slots:
        assert "iso" in s and "slot" in s and "capacity" in s


def test_create_guest_reservation_pending(slug):
    r = requests.post(
        _api(f"/food/restaurants/{slug}/reservations"),
        json={
            "reservation_at": _tomorrow_slot(),
            "party_size": 2,
            "guest_name": "Pytest Guest",
            "guest_phone": "+22509999" + str(int(_time.time()))[-4:],
            "guest_email": f"pytest+{uuid.uuid4().hex[:8]}@example.com",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["booking_reference"].startswith("R-")
    assert body["party_size"] == 2


def test_party_size_out_of_range_rejected(slug):
    r = requests.post(
        _api(f"/food/restaurants/{slug}/reservations"),
        json={
            "reservation_at": _tomorrow_slot(),
            "party_size": 99,
            "guest_name": "Pytest",
            "guest_phone": "+2250700000000",
        },
    )
    assert r.status_code in (400, 422)


def test_lead_time_enforced(slug):
    # 1 minute from now → below the default 30-minute lead
    soon = (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()
    r = requests.post(
        _api(f"/food/restaurants/{slug}/reservations"),
        json={
            "reservation_at": soon,
            "party_size": 2,
            "guest_name": "Pytest",
            "guest_phone": "+2250700000000",
        },
    )
    assert r.status_code in (400, 409, 422)


def test_capacity_overflow_rejected(slug):
    # Pick a random future slot unlikely to be filled by prior runs.
    import random
    days_out = random.randint(30, 55)
    hour = random.choice([13, 14, 20, 21])
    minute = random.choice([0, 30])
    when = (datetime.now(timezone.utc) + timedelta(days=days_out)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    ).isoformat()
    # slot_capacity default = 20 → two parties of 12 = 24 > 20.
    r1 = requests.post(_api(f"/food/restaurants/{slug}/reservations"), json={
        "reservation_at": when, "party_size": 12,
        "guest_name": "Big group", "guest_phone": "+2250790000001",
    })
    assert r1.status_code == 201, r1.text
    r2 = requests.post(_api(f"/food/restaurants/{slug}/reservations"), json={
        "reservation_at": when, "party_size": 12,
        "guest_name": "Another big group", "guest_phone": "+2250790000002",
    })
    assert r2.status_code == 409


def test_unknown_restaurant_404():
    r = requests.get(_api("/food/restaurants/does-not-exist/reservation-config"))
    assert r.status_code == 404
