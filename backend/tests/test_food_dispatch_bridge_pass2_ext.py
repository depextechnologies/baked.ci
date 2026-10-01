"""FOODbakēd — Pass 2 extended coverage (iteration 98).

Augments test_food_dispatch_bridge.py with the gaps called out in the
Pass 2 review request:

  P0 — delivery_dispatched audit event appears on happy-path preparing
  P0 — anonymous customers log delivery_failed(anonymous_customer_cannot_receive_delivery)
       but partner PATCH still returns 200
  P1 — confirm-pickup PIN flow (wrong→422, pre-assignment→409, happy→200,
       food_orders flips to out_for_delivery)
  P1 — delivered cascade: SEND transition_status('delivered') flips the
       FOOD order to delivered + idempotent on replay
  P1 — non-FOOD cascade safety: a parcel booking flipping delivered must
       NOT touch any food_orders row
  P2 — dynamic vehicle: items_count 10 → scooter; 25 → three_wheeler

Direct SQL (asyncpg) is used to:
  * simulate driver assignment on an express_bookings row (no live driver
    exists in dev DB), and
  * pad food_order_items so the vehicle picker sees the right count,
as per the agent-to-agent context note in the review request.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import re
import uuid

import asyncpg
import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
RID = "burger_hub_ci"

# asyncpg wants a plain postgres:// DSN, not SQLAlchemy's +asyncpg flavour.
RAW_DSN = re.sub(r"^postgresql\+asyncpg", "postgresql", os.environ["DATABASE_URL"])


# ---------------------------------------------------------------------------
# Shared helpers (kept inline rather than importing from the sibling file so
# this suite stays runnable in isolation).
# ---------------------------------------------------------------------------

def _admin_headers() -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _item_for(rid: str) -> str:
    r = requests.get(f"{BASE_URL}/api/food/restaurants/{rid}/menu", timeout=10)
    r.raise_for_status()
    for sec in r.json().get("sections", []):
        for it in sec.get("items", []):
            if it.get("is_available"):
                return it["id"]
    raise AssertionError("no available item")


def _dev_customer() -> tuple[str, str]:
    digits = str(uuid.uuid4().int)[:8]
    phone  = f"07{digits}"
    ch = requests.post(f"{BASE_URL}/api/auth/otp/request",
                       json={"country_code": "+225", "phone": phone}, timeout=10).json()
    code = ch.get("dev_code")
    assert code, f"dev OTP code missing: {ch}"
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"challenge_id": ch["challenge_id"], "code": code},
                      timeout=10).json()
    return v["access_token"], f"+225{phone}"


def _place_delivery_order(auth: bool = True) -> tuple[str, dict]:
    """Place a DELIVERY order. If auth=False, place anonymously."""
    headers = {}
    phone = "+2250711002299"
    if auth:
        tok, phone = _dev_customer()
        headers = {"Authorization": f"Bearer {tok}"}
    addr = {"line1": "Rue des Jardins, Cocody", "city": "Abidjan",
            "lat": 5.3484, "lng": -4.0017, "phone": phone,
            "contact_name": "QA Pass2 Ext"}
    item = _item_for(RID)
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": RID, "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "QA Pass2 Ext", "phone": phone},
        "delivery_address": addr,
    }, headers=headers, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"], headers


def _accept(oid: str) -> None:
    r = requests.patch(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                       headers=_admin_headers(),
                       json={"action": "accept"}, timeout=10)
    assert r.status_code == 200, r.text


def _preparing(oid: str) -> int:
    r = requests.patch(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                       headers=_admin_headers(),
                       json={"action": "preparing"}, timeout=10)
    return r.status_code


# ---------------------------------------------------------------------------
# Direct DB helpers
# ---------------------------------------------------------------------------

async def _pad_items(oid: str, target: int) -> None:
    """Insert dummy food_order_items rows until the order has `target`
    line items. Used to drive the vehicle picker across its thresholds."""
    conn = await asyncpg.connect(RAW_DSN)
    try:
        current = await conn.fetchval(
            "SELECT COUNT(*) FROM food_order_items WHERE order_id = $1", oid)
        for _ in range(max(0, target - int(current))):
            await conn.execute(
                "INSERT INTO food_order_items "
                " (id, order_id, item_name_snapshot, quantity, unit_price, line_total) "
                " VALUES ($1, $2, 'QA Pad', 1, 0, 0)",
                str(uuid.uuid4()), oid)
    finally:
        await conn.close()


async def _force_driver_assigned(booking_id: str) -> None:
    """Simulate SEND dispatch finding a driver. We DO NOT create a real
    module_drivers row — the booking just gets a synthetic driver_id and
    status flipped so the pickup-PIN gate opens."""
    conn = await asyncpg.connect(RAW_DSN)
    try:
        # NB: express_bookings.driver_id is nullable in dev; if there's an
        # FK, borrow any existing driver_id, otherwise fabricate one.
        drv = await conn.fetchval("SELECT id FROM module_drivers LIMIT 1")
        if drv is None:
            drv = str(uuid.uuid4())
        await conn.execute(
            "UPDATE express_bookings "
            "   SET status='driver_assigned', driver_id=$2, updated_at=now() "
            " WHERE id=$1", booking_id, drv)
    finally:
        await conn.close()


async def _get_booking_row(oid: str) -> dict | None:
    conn = await asyncpg.connect(RAW_DSN)
    try:
        row = await conn.fetchrow(
            "SELECT id, status, pickup_pin, vehicle_code, source_module, "
            "       food_order_id, booking_type "
            "  FROM express_bookings "
            " WHERE food_order_id=$1 AND status <> 'cancelled' "
            " ORDER BY created_at DESC LIMIT 1", oid)
        return dict(row) if row else None
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# P0 — delivery_dispatched event logged
# ---------------------------------------------------------------------------

def test_delivery_dispatched_event_logged_on_preparing():
    oid, _ = _place_delivery_order()
    _accept(oid)
    assert _preparing(oid) == 200
    detail = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                          headers=_admin_headers(), timeout=10).json()
    types = [e["type"] for e in detail["events"]]
    assert "delivery_dispatched" in types, types


# ---------------------------------------------------------------------------
# P0 — anonymous customer logs delivery_failed, partner PATCH still 200
# ---------------------------------------------------------------------------

def test_anonymous_customer_logs_delivery_failed():
    oid, _ = _place_delivery_order(auth=False)
    _accept(oid)
    code = _preparing(oid)
    assert code == 200, "partner PATCH must not fail even if dispatch skips anonymous orders"
    detail = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                          headers=_admin_headers(), timeout=10).json()
    assert detail["status"] == "preparing"
    events = detail["events"]
    failed = [e for e in events if e["type"] == "delivery_failed"]
    assert failed, [e["type"] for e in events]
    # Dispatch error reason must mention the anonymous guard.
    assert "anonymous" in (failed[-1].get("notes") or ""), failed[-1]


# ---------------------------------------------------------------------------
# P1 — confirm-pickup PIN flow
# ---------------------------------------------------------------------------

def test_confirm_pickup_requires_driver_assignment():
    """Before driver assignment the endpoint must return 409 even if the
    PIN is correct — this guards against partners racing ahead of SEND."""
    oid, _ = _place_delivery_order()
    _accept(oid)
    assert _preparing(oid) == 200
    booking = asyncio.run(_get_booking_row(oid))
    assert booking is not None
    r = requests.post(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/confirm-pickup",
                      headers=_admin_headers(),
                      json={"pin": booking["pickup_pin"]}, timeout=10)
    assert r.status_code == 409, r.text


def test_confirm_pickup_wrong_pin_422_correct_pin_flips_statuses():
    oid, hdr = _place_delivery_order()
    _accept(oid)
    assert _preparing(oid) == 200
    booking = asyncio.run(_get_booking_row(oid))
    asyncio.run(_force_driver_assigned(booking["id"]))

    # Wrong PIN → 422
    bad = requests.post(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/confirm-pickup",
                        headers=_admin_headers(),
                        json={"pin": "0000" if booking["pickup_pin"] != "0000" else "1111"},
                        timeout=10)
    assert bad.status_code == 422, bad.text

    # Correct PIN → 200 and both sides flip.
    ok = requests.post(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/confirm-pickup",
                       headers=_admin_headers(),
                       json={"pin": booking["pickup_pin"]}, timeout=10)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "out_for_delivery"
    assert body["booking_id"] == booking["id"]

    # Food order side.
    detail = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                          headers=_admin_headers(), timeout=10).json()
    assert detail["status"] == "out_for_delivery", detail["status"]
    types = [e["type"] for e in detail["events"]]
    assert "out_for_delivery" in types, types

    # Express side.
    after = asyncio.run(_get_booking_row(oid))
    assert after["status"] == "picked_up", after


# ---------------------------------------------------------------------------
# P1 — cascade delivered (SEND → FOOD) + idempotency
# ---------------------------------------------------------------------------

def _cascade_delivered_in_process(booking_id: str) -> None:
    """Invoke the SEND transition_status helper in-process so the cascade
    runs with full session wiring (same path production uses from the
    driver app). This is the recommended simulator per the review note.
    Each call uses a FRESH async engine so the asyncpg connection pool
    is bound to the asyncio.run() loop (SessionLocal is a module-level
    singleton bound to its creator loop)."""
    import sys
    sys.path.insert(0, "/app/backend")

    async def _run():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
        from modules.express import tracking as _tracking
        engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=False)
        Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as s:
                await _tracking.transition_status(s, booking_id, "delivered")
        finally:
            await engine.dispose()
    asyncio.run(_run())


def test_cascade_delivered_flips_food_order_and_is_idempotent():
    oid, _ = _place_delivery_order()
    _accept(oid)
    assert _preparing(oid) == 200
    booking = asyncio.run(_get_booking_row(oid))
    asyncio.run(_force_driver_assigned(booking["id"]))

    _cascade_delivered_in_process(booking["id"])
    detail = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                          headers=_admin_headers(), timeout=10).json()
    assert detail["status"] == "delivered", detail["status"]
    assert detail.get("delivered_at"), detail

    delivered_events_1 = [e for e in detail["events"] if e["type"] == "delivered"]
    assert len(delivered_events_1) >= 1
    first_delivered_at = detail["delivered_at"]

    # Second cascade must be a no-op (no new delivered event, same timestamp).
    _cascade_delivered_in_process(booking["id"])
    detail2 = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                           headers=_admin_headers(), timeout=10).json()
    assert detail2["delivered_at"] == first_delivered_at
    delivered_events_2 = [e for e in detail2["events"] if e["type"] == "delivered"]
    assert len(delivered_events_2) == len(delivered_events_1), (
        delivered_events_1, delivered_events_2)


# ---------------------------------------------------------------------------
# P1 — non-FOOD cascade safety
# ---------------------------------------------------------------------------

def test_parcel_delivered_does_not_touch_food_orders():
    """Direct DB: create a vanilla parcel express_booking (source_module
    IS NULL, food_order_id IS NULL), flip it to delivered via the SEND
    helper, and confirm food_orders is untouched + no exception raised."""
    async def _run():
        conn = await asyncpg.connect(RAW_DSN)
        bid = str(uuid.uuid4())
        try:
            # Borrow an existing customer_id so the FK is satisfied.
            cust = await conn.fetchval("SELECT id FROM customers LIMIT 1")
            if cust is None:
                pytest.skip("no customers seeded — can't construct a parcel booking")
            # Count food_orders before.
            before = await conn.fetchval("SELECT COUNT(*) FROM food_orders")

            # Minimal parcel row (booking_type='parcel', source_module NULL).
            # Only NOT NULL columns are set; everything else is nullable.
            await conn.execute(
                "INSERT INTO express_bookings "
                "  (id, ref, customer_id, module, booking_type, country, status, "
                "   payment_status, currency, total, receiver_preferences, "
                "   created_at, updated_at) "
                " VALUES ($1, $2, $3, 'express', 'parcel', 'CI', 'driver_assigned', "
                "         'pending', 'XOF', 0, '{}', now(), now())",
                bid, f"QA-{bid[:8]}", cust)
        finally:
            await conn.close()

        # Flip delivered using the real SEND helper → cascade MUST short-circuit.
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
        import sys
        sys.path.insert(0, "/app/backend")
        from modules.express import tracking as _tracking
        engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=False)
        Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as s:
                await _tracking.transition_status(s, bid, "delivered")
        finally:
            await engine.dispose()

        conn = await asyncpg.connect(RAW_DSN)
        try:
            after = await conn.fetchval("SELECT COUNT(*) FROM food_orders")
            row = await conn.fetchrow(
                "SELECT status, food_order_id, source_module "
                "  FROM express_bookings WHERE id=$1", bid)
        finally:
            await conn.close()

        assert row["status"] == "delivered", row
        assert row["food_order_id"] is None
        assert row["source_module"] is None
        assert after == before, "food_orders row count must be unchanged"

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# P2 — dynamic vehicle selection
# ---------------------------------------------------------------------------

def _place_and_pad(target_items: int) -> dict:
    oid, _ = _place_delivery_order()
    _accept(oid)
    asyncio.run(_pad_items(oid, target_items))
    assert _preparing(oid) == 200
    booking = asyncio.run(_get_booking_row(oid))
    assert booking is not None
    return booking


def test_vehicle_bike_le8_items():
    booking = _place_and_pad(1)   # 1 line item → bike
    assert booking["vehicle_code"] == "bike", booking


def test_vehicle_scooter_10_items():
    booking = _place_and_pad(10)  # 9..20 → scooter
    assert booking["vehicle_code"] == "scooter", booking


def test_vehicle_three_wheeler_25_items():
    booking = _place_and_pad(25)  # 21+ → three_wheeler
    assert booking["vehicle_code"] == "three_wheeler", booking
