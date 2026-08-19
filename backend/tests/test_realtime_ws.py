"""Slice 7 — Realtime WS driver/customer live tracking. Backend tests.

Covers:
- Auth guards (missing/malformed JWT, wrong role, wrong driver, wrong token, terminal job)
- End-to-end broadcast: driver → customer
- Cross-job broadcast isolation
- Throttled DB write (LOCATION_WRITE_MIN_S)
- Heartbeat ping arrives
- Malformed frame tolerance
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Optional

import pytest
import requests
import websockets
from websockets.exceptions import InvalidStatus


def _read_env(k: str) -> str:
    v = os.environ.get(k)
    if v:
        return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith(k + "="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(f"{k} not set")


BASE_URL = _read_env("REACT_APP_BACKEND_URL").rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


def _mkphone(salt: int = 0) -> str:
    return f"+91977{(int(time.time() * 1000) + salt) % 10_000_000:07d}"


# ---------------------------------------------------------------------------
# Bootstrap helpers (shared with slice 6 pattern)
# ---------------------------------------------------------------------------

def _admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


def _bootstrap_approved_online_driver(admin_headers: dict, salt: int = 0) -> dict:
    phone = _mkphone(salt)
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": "IN"}, timeout=30)
    assert r.status_code == 200, r.text
    code = r.json()["dev_hint"]
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    driver_id = body["driver"]["id"]
    jwt = body["access_token"]
    h = {"Authorization": f"Bearer {jwt}"}

    steps = [
        ("personal", {"name": "WS Test Driver", "email": f"ws{salt}@t.co"}),
        ("id", {"gov_id_type": "aadhaar", "gov_id_number": "111122223333",
                "gov_id_front_url": "/x", "gov_id_back_url": "/x"}),
        ("licence", {"licence_number": "DL0001", "licence_front_url": "/x",
                     "licence_expiry": "2030-01-01"}),
        ("selfie", {"selfie_url": "/x"}),
        ("vehicle", {"vehicle_type": "bike", "vehicle_plate": "AA1",
                     "vehicle_reg_url": "/x"}),
        ("bank", {"bank_account_holder": "Test", "bank_account_number": "1234567890",
                  "bank_ifsc_or_swift": "HDFC0001"}),
        ("emergency", {"emergency_contact_name": "Kin",
                       "emergency_contact_phone": "+919999999999"}),
    ]
    for step, data in steps:
        r = requests.patch(f"{BASE_URL}/api/driver/me/kyc",
                           json={"step": step, "data": data}, headers=h, timeout=30)
        assert r.status_code == 200, f"{step}: {r.text}"
    r = requests.post(f"{BASE_URL}/api/driver/me/submit", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_id}/approve",
                      json={}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    # Go online
    r = requests.post(f"{BASE_URL}/api/driver/me/online",
                      json={"is_online": True, "lat": 28.5691, "lng": 77.3210},
                      headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return {"id": driver_id, "jwt": jwt, "headers": h, "phone": phone}


def _dispatch_and_accept(drv: dict, admin_headers: dict) -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{drv['id']}/dispatch-demo-job",
                      json={}, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    job = r.json()
    jid = job["id"]
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/accept",
                      json={}, headers=drv["headers"], timeout=30)
    assert r.status_code == 200, r.text
    return job


def _walk_to_delivered(drv: dict, jid: str) -> None:
    h = drv["headers"]
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job", headers=h, timeout=30)
    pickup_otp = r.json()["pickup_otp"]
    requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-pickup",
                  json={}, headers=h, timeout=30)
    requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-pickup",
                  json={"code": pickup_otp}, headers=h, timeout=30)
    requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-dropoff",
                  json={}, headers=h, timeout=30)
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job", headers=h, timeout=30)
    delivery_otp = r.json()["delivery_otp"]
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-delivery",
                      json={"code": delivery_otp}, headers=h, timeout=30)
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def admin_headers():
    tok = _admin_token()
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def driver_a(admin_headers):
    return _bootstrap_approved_online_driver(admin_headers, salt=1)


@pytest.fixture(scope="module")
def driver_b(admin_headers):
    time.sleep(1)
    return _bootstrap_approved_online_driver(admin_headers, salt=2)


@pytest.fixture(scope="module")
def job_a(driver_a, admin_headers):
    return _dispatch_and_accept(driver_a, admin_headers)


@pytest.fixture(scope="module")
def job_b(driver_b, admin_headers):
    return _dispatch_and_accept(driver_b, admin_headers)


# ---------------------------------------------------------------------------
# Async helpers
# ---------------------------------------------------------------------------

async def _expect_ws_reject(url: str) -> Optional[int]:
    """Return the 4xxx close code or the HTTP handshake status if rejected."""
    try:
        async with websockets.connect(url, open_timeout=10, close_timeout=5) as ws:
            # If accept happened despite expected rejection, read one msg then fail
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=2)
                return None  # unexpectedly accepted
            except asyncio.TimeoutError:
                return None
    except InvalidStatus as e:  # HTTP handshake rejection (e.g. 403)
        return int(e.response.status_code)
    except websockets.exceptions.ConnectionClosed as e:
        return int(e.code)
    except Exception as e:
        # Some environments surface handshake close as generic error
        return -1


async def _recv_until(ws, predicate, timeout: float = 5.0):
    end = time.time() + timeout
    while time.time() < end:
        remaining = end - time.time()
        if remaining <= 0:
            break
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        try:
            msg = json.loads(raw)
        except Exception:
            continue
        if predicate(msg):
            return msg
    return None


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------

class TestAuthGuards:
    def test_driver_ws_no_token_rejected(self, job_a):
        # No token query param → FastAPI Query(required) → 403
        url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 422), f"expected reject, got {code}"

    def test_driver_ws_malformed_jwt_rejected(self, job_a):
        url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token=not-a-jwt"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 401, 4401), f"expected reject, got {code}"

    def test_driver_ws_wrong_role_admin_token_rejected(self, job_a, admin_headers):
        admin_jwt = admin_headers["Authorization"].split()[1]
        url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token={admin_jwt}"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 401, 4401), f"expected reject, got {code}"

    def test_driver_ws_wrong_driver_rejected(self, job_a, driver_b):
        # driver_b's JWT on job_a → 4403 not_your_job
        url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token={driver_b['jwt']}"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 401, 4403), f"expected reject, got {code}"

    def test_customer_ws_no_t_rejected(self, job_a):
        url = f"{WS_URL}/api/ws/track/{job_a['id']}"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 422), f"expected reject, got {code}"

    def test_customer_ws_wrong_token_rejected(self, job_a):
        url = f"{WS_URL}/api/ws/track/{job_a['id']}?t=bogus_token_xxx"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 404, 4404), f"expected reject, got {code}"

    def test_driver_ws_terminal_job_rejected(self, admin_headers):
        """Bootstrap a fresh driver+job, walk to delivered, then try WS."""
        drv = _bootstrap_approved_online_driver(admin_headers, salt=99)
        job = _dispatch_and_accept(drv, admin_headers)
        _walk_to_delivered(drv, job["id"])
        url = f"{WS_URL}/api/ws/driver/jobs/{job['id']}?token={drv['jwt']}"
        code = asyncio.run(_expect_ws_reject(url))
        assert code in (403, 409, 4409), f"expected terminal reject, got {code}"


# ---------------------------------------------------------------------------
# End-to-end broadcast + isolation
# ---------------------------------------------------------------------------

class TestBroadcast:
    def test_customer_receives_hello_then_driver_location(self, driver_a, job_a):
        async def run():
            cust_url = f"{WS_URL}/api/ws/track/{job_a['id']}?t={job_a['share_token']}"
            drv_url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token={driver_a['jwt']}"

            async with websockets.connect(cust_url, open_timeout=10) as cust:
                hello = await asyncio.wait_for(cust.recv(), timeout=5)
                hello_msg = json.loads(hello)
                assert hello_msg["type"] == "hello"
                assert hello_msg["job_id"] == job_a["id"]

                async with websockets.connect(drv_url, open_timeout=10) as drv:
                    # Driver's own hello
                    drv_hello = json.loads(await asyncio.wait_for(drv.recv(), timeout=5))
                    assert drv_hello["type"] == "hello"

                    t0 = time.time()
                    await drv.send(json.dumps({
                        "type": "location", "lat": 28.5691, "lng": 77.3210,
                        "heading": 90.0, "speed_mps": 5.5,
                    }))
                    loc = await _recv_until(cust, lambda m: m.get("type") == "location", timeout=2.0)
                    dt_ms = (time.time() - t0) * 1000
                    assert loc is not None, "no location frame within 2s"
                    assert dt_ms < 1000, f"latency {dt_ms:.0f}ms >= 1000ms"
                    assert abs(loc["lat"] - 28.5691) < 1e-6
                    assert abs(loc["lng"] - 77.3210) < 1e-6
                    assert "ts_server" in loc

                    # Assert no duplicate location frame within next 1s
                    dup = await _recv_until(
                        cust, lambda m: m.get("type") == "location", timeout=1.0
                    )
                    assert dup is None, f"unexpected duplicate location: {dup}"

        asyncio.run(run())

    def test_cross_job_isolation(self, driver_a, driver_b, job_a, job_b):
        """Publish on job_a; customer subscribed on job_b must NOT see it."""
        async def run():
            cust_a = f"{WS_URL}/api/ws/track/{job_a['id']}?t={job_a['share_token']}"
            cust_b = f"{WS_URL}/api/ws/track/{job_b['id']}?t={job_b['share_token']}"
            drv_a = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token={driver_a['jwt']}"

            async with websockets.connect(cust_a, open_timeout=10) as ca, \
                       websockets.connect(cust_b, open_timeout=10) as cb, \
                       websockets.connect(drv_a, open_timeout=10) as da:
                # Drain the hello frames
                await asyncio.wait_for(ca.recv(), timeout=5)
                await asyncio.wait_for(cb.recv(), timeout=5)
                await asyncio.wait_for(da.recv(), timeout=5)

                await da.send(json.dumps({
                    "type": "location", "lat": 28.6000, "lng": 77.3000
                }))
                # ca must receive it; cb must NOT
                got_a = await _recv_until(ca, lambda m: m.get("type") == "location", timeout=2.0)
                got_b = await _recv_until(cb, lambda m: m.get("type") == "location", timeout=1.5)
                assert got_a is not None, "customer on job_a did not receive location"
                assert got_b is None, f"customer on job_b LEAKED frame: {got_b}"

        asyncio.run(run())


# ---------------------------------------------------------------------------
# Throttled DB write
# ---------------------------------------------------------------------------

class TestThrottledWrite:
    def test_five_rapid_frames_writes_once(self, admin_headers):
        """LOCATION_WRITE_MIN_S=10: 5 frames in <1s → at most 1 DB update.

        We bootstrap a dedicated driver so `_last_write_at` is clean.
        Assertion: after 5 rapid distinct-coord frames, the persisted lat
        equals the FIRST frame's lat (subsequent frames within 10s are skipped).
        Then send another frame ~11s later — the persisted lat must advance.
        """
        drv = _bootstrap_approved_online_driver(admin_headers, salt=77)
        job = _dispatch_and_accept(drv, admin_headers)

        async def send_frames(coords):
            drv_url = f"{WS_URL}/api/ws/driver/jobs/{job['id']}?token={drv['jwt']}"
            async with websockets.connect(drv_url, open_timeout=10) as ws:
                await asyncio.wait_for(ws.recv(), timeout=5)  # hello
                for lat, lng in coords:
                    await ws.send(json.dumps({"type": "location", "lat": lat, "lng": lng}))
                    await asyncio.sleep(0.05)
                await asyncio.sleep(0.6)  # let async persist task finish

        # Batch 1: 5 frames within <1s starting at lat0
        lat0 = 28.5691
        coords_1 = [(lat0 + i * 0.001, 77.3210 + i * 0.001) for i in range(5)]
        asyncio.run(send_frames(coords_1))

        r = requests.get(f"{BASE_URL}/api/driver/me", headers=drv["headers"], timeout=30)
        assert r.status_code == 200, r.text
        lat_after_batch1 = r.json().get("current_lat")
        assert lat_after_batch1 is not None
        # First frame's coord should be persisted; last frame's should NOT
        assert abs(lat_after_batch1 - lat0) < 1e-6, (
            f"expected first-frame lat {lat0}, got {lat_after_batch1} — throttle broken"
        )

        # Wait past LOCATION_WRITE_MIN_S (10s) and send one more.
        time.sleep(11)
        new_lat = 29.0000
        asyncio.run(send_frames([(new_lat, 78.0)]))
        r = requests.get(f"{BASE_URL}/api/driver/me", headers=drv["headers"], timeout=30)
        assert r.status_code == 200, r.text
        lat_after_batch2 = r.json().get("current_lat")
        assert abs(lat_after_batch2 - new_lat) < 1e-6, (
            f"expected second write to persist {new_lat}, got {lat_after_batch2}"
        )


# ---------------------------------------------------------------------------
# Heartbeat + malformed frame tolerance
# ---------------------------------------------------------------------------

class TestHeartbeatAndTolerance:
    def test_customer_gets_ping_within_30s(self, job_a):
        """The server-side heartbeat cadence is 25s; assert one ping arrives
        in ≤30s of connect."""
        async def run():
            cust_url = f"{WS_URL}/api/ws/track/{job_a['id']}?t={job_a['share_token']}"
            async with websockets.connect(cust_url, open_timeout=10) as ws:
                # hello first
                await asyncio.wait_for(ws.recv(), timeout=5)
                ping = await _recv_until(
                    ws, lambda m: m.get("type") == "ping", timeout=30.0
                )
                assert ping is not None, "no ping frame within 30s"

        asyncio.run(run())

    def test_malformed_location_ignored_socket_stays_open(self, driver_a, job_a):
        async def run():
            cust_url = f"{WS_URL}/api/ws/track/{job_a['id']}?t={job_a['share_token']}"
            drv_url = f"{WS_URL}/api/ws/driver/jobs/{job_a['id']}?token={driver_a['jwt']}"
            async with websockets.connect(cust_url, open_timeout=10) as cust, \
                       websockets.connect(drv_url, open_timeout=10) as drv:
                await asyncio.wait_for(cust.recv(), timeout=5)
                await asyncio.wait_for(drv.recv(), timeout=5)
                # Send garbage lat/lng
                await drv.send(json.dumps({
                    "type": "location", "lat": "oops", "lng": "oops"
                }))
                # Customer should NOT receive anything
                junk = await _recv_until(
                    cust, lambda m: m.get("type") == "location", timeout=1.5
                )
                assert junk is None, f"malformed frame leaked: {junk}"
                # Follow with a valid frame — should fan out
                await drv.send(json.dumps({
                    "type": "location", "lat": 28.57, "lng": 77.32
                }))
                good = await _recv_until(
                    cust, lambda m: m.get("type") == "location", timeout=2.0
                )
                assert good is not None, "socket appears to have closed after malformed"
                assert abs(good["lat"] - 28.57) < 1e-6

        asyncio.run(run())
