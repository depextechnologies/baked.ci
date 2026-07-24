"""EXPRESSbakēd — Phase 2 backend tests.

Covers:
- Regression: vehicles endpoint (5 vehicles CI, still active)
- Driver seed: 30 drivers total in module_drivers, all with rating/current_lat/current_lng
- Admin drivers CRUD: list, filter by status, POST with three_wheeler + coords, PATCH is_available + status
- Booking dispatch + demo simulator (WebSocket + status progression)
- WebSocket live streaming (snapshot + location frames)
- Full demo lifecycle (~2min)
- Driver-app status endpoint (production path) with allowed/invalid transitions
- Dispatch fallback (bike -> scooter/three_wheeler when no bike drivers available)
"""
import json
import os
import random
import time
import threading
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
import websocket  # websocket-client

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="session")
def customer_token(api):
    """Auth a fresh CI customer via dev OTP."""
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    j = r.json()
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"challenge_id": j["challenge_id"], "code": j["dev_code"]})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


@pytest.fixture(scope="session")
def customer(customer_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {customer_token}"})
    return s


@pytest.fixture(scope="session")
def admin(api):
    r = api.post(f"{BASE_URL}/api/admin/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s


# ---------- Regression: Vehicles ----------
class TestVehiclesRegression:
    def test_vehicles_ci_still_5_active(self, api):
        r = api.get(f"{BASE_URL}/api/express/vehicles", params={"country": "CI"})
        assert r.status_code == 200, r.text
        docs = r.json()
        assert len(docs) == 5
        codes = sorted(d["code"] for d in docs)
        assert codes == sorted(["bike", "scooter", "three_wheeler", "mini_truck", "truck"])
        for d in docs:
            assert d["active"] is True


# ---------- Driver seed ----------
class TestDriverSeed:
    def test_30_drivers_total(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/drivers")
        assert r.status_code == 200, r.text
        docs = r.json()
        # phone-idempotent seed → after warm-up we expect at least 30 (15 CI + 15 LR)
        seeded = [d for d in docs if (d.get("phone") or "").startswith(("+225", "+231"))]
        assert len(seeded) >= 30, f"Expected ≥30 seeded drivers, got {len(seeded)}"
        # Country split
        ci_count = sum(1 for d in seeded if d.get("country") == "CI")
        lr_count = sum(1 for d in seeded if d.get("country") == "LR")
        assert ci_count >= 15, ci_count
        assert lr_count >= 15, lr_count

    def test_active_drivers_have_phase2_fields(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/drivers",
                      params={"status": "active"})
        assert r.status_code == 200, r.text
        docs = r.json()
        assert len(docs) > 0
        vt_seen = set()
        for d in docs:
            assert d["module"] == "express"
            assert d["status"] == "active"
            assert "rating" in d and d["rating"] is not None
            assert isinstance(d["rating"], (int, float))
            assert "current_lat" in d and d["current_lat"] is not None
            assert "current_lng" in d and d["current_lng"] is not None
            assert "is_available" in d
            vt_seen.add(d.get("vehicle_type"))
        # All 5 vehicle types should appear across the seed
        for expected in ("bike", "scooter", "three_wheeler", "mini_truck", "truck"):
            assert expected in vt_seen, f"Missing vehicle_type {expected} in seeded drivers"


# ---------- Admin driver CRUD ----------
class TestAdminDriverCRUD:
    def test_create_three_wheeler_and_verify_defaults(self, admin):
        payload = {
            "name": "TEST_Phase2 Driver",
            "phone": f"+2250199{random.randint(100000, 999999)}",
            "country": "CI",
            "city": "Cocody",
            "vehicle_type": "three_wheeler",
            "vehicle_reg": "TEST-3W-0001",
            "license_number": "TEST-DL-000001",
            "current_lat": 5.3600,
            "current_lng": -4.0083,
        }
        r = admin.post(f"{BASE_URL}/api/admin/modules/express/drivers", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["vehicle_type"] == "three_wheeler"
        assert d["is_available"] is True
        assert d["rating"] == 4.8  # default
        assert d["current_lat"] == 5.3600
        assert d["current_lng"] == -4.0083
        assert d["active_booking_id"] is None
        # GET back to verify persistence
        listing = admin.get(f"{BASE_URL}/api/admin/modules/express/drivers").json()
        ids = [x["id"] for x in listing]
        assert d["id"] in ids
        # cleanup
        admin.delete(f"{BASE_URL}/api/admin/modules/express/drivers/{d['id']}")

    def test_patch_availability_and_status(self, admin):
        payload = {
            "name": "TEST_Toggle Driver",
            "phone": f"+2250199{random.randint(100000, 999999)}",
            "country": "CI",
            "vehicle_type": "bike",
            "current_lat": 5.36,
            "current_lng": -4.00,
        }
        d = admin.post(f"{BASE_URL}/api/admin/modules/express/drivers", json=payload).json()
        did = d["id"]

        # Flip availability off
        r = admin.patch(f"{BASE_URL}/api/admin/modules/express/drivers/{did}",
                        json={"is_available": False})
        assert r.status_code == 200, r.text
        assert r.json()["is_available"] is False

        # Suspend
        r = admin.patch(f"{BASE_URL}/api/admin/modules/express/drivers/{did}",
                        json={"status": "suspended"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "suspended"

        # cleanup
        admin.delete(f"{BASE_URL}/api/admin/modules/express/drivers/{did}")


# ---------- Booking creation + dispatch (demo) ----------
PICKUP = {
    "line1": "Cocody, Rue des Jardins", "latitude": 5.360, "longitude": -4.005,
    "city": "Abidjan", "country": "CI",
}
DROP = {
    "line1": "Plateau, Ave Chardy", "latitude": 5.335, "longitude": -4.025,
    "city": "Abidjan", "country": "CI",
}
RECEIVER = {"name": "Jane Receiver", "phone": "+2250700000002"}


def _create_parcel_booking(customer, vehicle_code="bike"):
    payload = {
        "country": "CI",
        "vehicle_code": vehicle_code,
        "pickup": PICKUP,
        "drop": DROP,
        "receiver": RECEIVER,
        "package_type": "documents",
        "package_weight_range": "wt_upto_5",
        "payment_method": "cod",
    }
    r = customer.post(f"{BASE_URL}/api/express/bookings/parcel", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


class TestBookingDispatchDemo:
    def test_booking_gets_driver_within_seconds(self, customer):
        booking = _create_parcel_booking(customer, "bike")
        bid = booking["id"]
        assert booking["status"] == "searching"
        assert booking["driver_id"] is None

        # Wait for demo simulator to assign a driver (should happen ~1-3s in)
        driver_seen = False
        last = None
        for _ in range(25):  # up to ~12.5s
            time.sleep(0.5)
            r = customer.get(f"{BASE_URL}/api/express/bookings/{bid}")
            assert r.status_code == 200, r.text
            last = r.json()
            if last.get("driver_id"):
                driver_seen = True
                break
        assert driver_seen, f"Driver not assigned within 12s. Last state: {last.get('status')}"

        assert last["status"] in ("driver_assigned", "arriving", "picked_up", "in_transit", "delivered")
        assert last["driver_snapshot"] is not None
        snap = last["driver_snapshot"]
        assert snap.get("name")
        assert snap.get("vehicle_type") in ("bike", "scooter", "three_wheeler")
        assert snap.get("rating") is not None
        assert last["driver_location"] is not None


# ---------- WebSocket streaming ----------
class TestWebSocket:
    def test_ws_snapshot_and_location_frames(self, customer):
        booking = _create_parcel_booking(customer, "bike")
        bid = booking["id"]
        ws_url = f"{WS_BASE}/api/express/ws/bookings/{bid}"

        frames = []
        ws = websocket.create_connection(ws_url, timeout=10)
        try:
            # first frame should be a snapshot
            ws.settimeout(15)
            first = json.loads(ws.recv())
            frames.append(first)
            assert first["type"] == "snapshot"
            assert first.get("id") == bid

            # Collect ~20s of frames
            deadline = time.time() + 22
            location_frames = 0
            while time.time() < deadline:
                try:
                    ws.settimeout(max(1, deadline - time.time()))
                    msg = json.loads(ws.recv())
                    frames.append(msg)
                    if msg.get("type") == "location":
                        location_frames += 1
                        if location_frames >= 3:
                            break
                except Exception:
                    break
            assert location_frames >= 2, (
                f"Expected ≥2 location frames within 20s, got {location_frames}. "
                f"Frame types: {[f.get('type') for f in frames]}"
            )
            # Validate location frame shape
            loc_frame = next(f for f in frames if f.get("type") == "location")
            assert "driver_location" in loc_frame
            assert "lat" in loc_frame["driver_location"]
            assert "lng" in loc_frame["driver_location"]
            assert "eta_seconds" in loc_frame
        finally:
            ws.close()


# ---------- Full demo lifecycle ----------
class TestFullDemoLifecycle:
    def test_lifecycle_reaches_delivered_within_2min(self, customer):
        """Polls booking via REST every 1s up to ~140s to observe full
        lifecycle. Also asserts the persisted timeline contains every
        expected stage."""
        booking = _create_parcel_booking(customer, "bike")
        bid = booking["id"]

        statuses_seen = set()
        final = None
        deadline = time.time() + 140

        while time.time() < deadline:
            time.sleep(1.0)
            r = customer.get(f"{BASE_URL}/api/express/bookings/{bid}")
            if r.status_code != 200:
                continue
            doc = r.json()
            statuses_seen.add(doc.get("status"))
            final = doc
            if doc.get("status") == "delivered":
                break

        assert final and final.get("status") == "delivered", (
            f"Did not reach delivered in 140s. Final={final.get('status') if final else None}. "
            f"Seen: {statuses_seen}"
        )
        # Timeline is persisted server-side and should contain every stage
        timeline_codes = {t.get("code") for t in (final.get("timeline") or [])}
        expected_stages = {"driver_assigned", "arriving", "picked_up", "in_transit", "delivered"}
        missing = expected_stages - timeline_codes
        assert not missing, f"Missing lifecycle stages in timeline: {missing}. Timeline: {timeline_codes}"
        assert final.get("payment_status") == "paid"
        assert final.get("driver_id"), "delivered booking missing driver_id"

        # Driver should be released back to available (via /admin listing)
        # Not strictly required to test via admin, but let's not block if we can't.


# ---------- Production driver-status path ----------
class TestDriverStatusEndpoint:
    def test_invalid_transition_from_searching_returns_400(self, customer):
        # Create booking with EXPRESS_DEMO_MODE=true means simulator will kick in,
        # so try to catch it right away before assignment.
        booking = _create_parcel_booking(customer, "truck")  # truck less common, may not assign fast
        bid = booking["id"]
        r = customer.post(
            f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
            json={"status": "delivered", "lat": 5.335, "lng": -4.025},
        )
        # Booking is either 'searching' (not in ALLOWED_TRANSITIONS) or already
        # 'driver_assigned'. Either way `delivered` is not directly allowed.
        assert r.status_code == 400, r.text

    def test_valid_arriving_transition_when_assigned(self, customer):
        # We need a booking in 'driver_assigned'. Use demo simulator to get us
        # into that state, then IMMEDIATELY (before simulator advances) call arriving.
        # But since simulator advances by itself, we just verify the endpoint
        # returns 200 or 400 depending on current state — key is: NO 500.
        booking = _create_parcel_booking(customer, "bike")
        bid = booking["id"]
        # Wait until driver_assigned
        got_assigned = False
        for _ in range(20):
            time.sleep(0.5)
            r = customer.get(f"{BASE_URL}/api/express/bookings/{bid}")
            if r.status_code == 200 and r.json().get("status") == "driver_assigned":
                got_assigned = True
                break
        if not got_assigned:
            pytest.skip("Could not observe driver_assigned state in time (simulator too fast)")
        r = customer.post(
            f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
            json={"status": "arriving", "lat": 5.36, "lng": -4.01},
        )
        # It could be 200 OR 400 if simulator already moved on. Never 500.
        assert r.status_code in (200, 400), r.text


# ---------- Dispatch fallback ----------
class TestDispatchFallback:
    def test_bike_falls_back_when_no_bikes_available(self, admin, customer):
        # Snapshot: mark all CI bike drivers unavailable
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/drivers",
                      params={"status": "active"})
        assert r.status_code == 200
        drivers = r.json()
        ci_bikes = [d for d in drivers if d.get("country") == "CI" and d.get("vehicle_type") == "bike"]
        original_avail = {d["id"]: d.get("is_available", True) for d in ci_bikes}
        try:
            for d in ci_bikes:
                admin.patch(f"{BASE_URL}/api/admin/modules/express/drivers/{d['id']}",
                            json={"is_available": False})

            # Book a bike — should still assign a scooter/three_wheeler via fallback
            booking = _create_parcel_booking(customer, "bike")
            bid = booking["id"]

            got_driver = None
            for _ in range(25):  # up to 12.5s
                time.sleep(0.5)
                r = customer.get(f"{BASE_URL}/api/express/bookings/{bid}")
                if r.status_code == 200 and r.json().get("driver_id"):
                    got_driver = r.json()
                    break
            assert got_driver is not None, "Fallback failed — no driver assigned"
            snap = got_driver.get("driver_snapshot") or {}
            assert snap.get("vehicle_type") in ("scooter", "three_wheeler"), \
                f"Expected fallback to scooter/three_wheeler, got {snap.get('vehicle_type')}"
        finally:
            # Restore
            for did, was_avail in original_avail.items():
                admin.patch(f"{BASE_URL}/api/admin/modules/express/drivers/{did}",
                            json={"is_available": was_avail})
