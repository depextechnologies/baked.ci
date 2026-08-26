"""Backend tests for the DriverTripSheet state machine — iteration 63.

Covers /api/express/bookings/{id}/driver-status auth + transitions and
/api/driver/me/express-active reload restore.
"""
import os, subprocess, sys, json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://baked-platform.preview.emergentagent.com").rstrip("/")
PHONE = "+919990001234"


def _seed():
    """(Re)seed a fresh driver_assigned booking. Idempotent."""
    result = subprocess.run(
        [sys.executable, "/app/backend/tests/seed_trip_flow.py"],
        capture_output=True, text=True, env={**os.environ,
            "DATABASE_URL": open("/app/backend/.env").read().split("DATABASE_URL=")[1].splitlines()[0]},
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def seed():
    return _seed()


@pytest.fixture(scope="module")
def driver_token():
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": PHONE, "country": "IN"}, timeout=10)
    r.raise_for_status()
    otp = r.json()["dev_hint"]
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": PHONE, "code": otp}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


# --- Auth guard tests ---
def test_driver_status_no_bearer_returns_401(seed):
    r = requests.post(f"{BASE_URL}/api/express/bookings/{seed['booking_id']}/driver-status",
                      json={"status": "arriving"}, timeout=10)
    assert r.status_code == 401


def test_driver_status_bogus_token_returns_401(seed):
    r = requests.post(f"{BASE_URL}/api/express/bookings/{seed['booking_id']}/driver-status",
                      json={"status": "arriving"},
                      headers={"Authorization": "Bearer nope.bad.token"}, timeout=10)
    assert r.status_code == 401


def test_driver_status_wrong_driver_returns_403(seed, driver_token):
    # spin up a second driver via OTP and try to advance the first driver's booking
    other_phone = "+919990009090"
    r1 = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                       json={"phone_e164": other_phone, "country": "IN"}, timeout=10)
    r1.raise_for_status()
    otp = r1.json()["dev_hint"]
    r2 = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                       json={"phone_e164": other_phone, "code": otp}, timeout=10)
    r2.raise_for_status()
    other_tok = r2.json()["access_token"]
    r = requests.post(f"{BASE_URL}/api/express/bookings/{seed['booking_id']}/driver-status",
                      json={"status": "arriving"},
                      headers={"Authorization": f"Bearer {other_tok}"}, timeout=10)
    # Either 403 not_your_booking, or 401 if the other driver has no ModuleDriver
    # bridge yet (which the code also treats as forbidden). Both are acceptable.
    assert r.status_code in (401, 403)


# --- State machine ---
def test_full_transition_flow(driver_token):
    """driver_assigned → arriving → picked_up → in_transit → delivered."""
    seed = _seed()  # reset
    bid = seed["booking_id"]
    hdr = {"Authorization": f"Bearer {driver_token}"}
    for want in ["arriving", "picked_up", "in_transit", "delivered"]:
        r = requests.post(f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
                          json={"status": want, "lat": 12.9716, "lng": 77.5946},
                          headers=hdr, timeout=15)
        assert r.status_code == 200, f"advance to {want} failed: {r.status_code} {r.text}"
        assert r.json().get("status") == want, r.text


def test_invalid_transition_rejected(driver_token):
    """picked_up cannot jump straight to delivered (must pass through in_transit)."""
    seed = _seed()
    bid = seed["booking_id"]
    hdr = {"Authorization": f"Bearer {driver_token}"}
    # Move to picked_up
    r = requests.post(f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
                      json={"status": "picked_up"}, headers=hdr, timeout=10)
    assert r.status_code == 200
    # Now try illegal jump
    r = requests.post(f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
                      json={"status": "delivered"}, headers=hdr, timeout=10)
    assert r.status_code == 400


# --- Reload persistence ---
def test_express_active_returns_booking_after_seed(driver_token):
    seed = _seed()
    r = requests.get(f"{BASE_URL}/api/driver/me/express-active",
                     headers={"Authorization": f"Bearer {driver_token}"}, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("booking") is not None
    assert body["booking"]["id"] == seed["booking_id"]
    assert body["booking"]["status"] == "driver_assigned"


def test_express_active_null_when_delivered(driver_token):
    """After walking booking to delivered, express-active should return null."""
    seed = _seed()
    bid = seed["booking_id"]
    hdr = {"Authorization": f"Bearer {driver_token}"}
    for want in ["arriving", "picked_up", "in_transit", "delivered"]:
        requests.post(f"{BASE_URL}/api/express/bookings/{bid}/driver-status",
                      json={"status": want}, headers=hdr, timeout=10)
    r = requests.get(f"{BASE_URL}/api/driver/me/express-active",
                     headers=hdr, timeout=10)
    assert r.status_code == 200
    assert r.json().get("booking") is None
