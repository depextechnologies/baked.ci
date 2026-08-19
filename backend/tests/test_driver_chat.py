"""Slice 6 — In-ride chat + public tracking. Backend tests."""
import os
import time
from datetime import datetime
import requests
import pytest

def _read_env(k: str) -> str:
    v = os.environ.get(k)
    if v: return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith(k + "="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError: pass
    raise RuntimeError(f"{k} not set")

BASE_URL = _read_env("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


# ---- Helpers -------------------------------------------------------------

def _mkphone() -> str:
    # Unique phone per-run so bootstrap is idempotent across reruns
    return f"+91999{int(time.time()) % 10_000_000:07d}"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _bootstrap_driver(phone: str) -> tuple[str, str]:
    """Register + OTP + approve a fresh driver. Returns (driver_id, jwt)."""
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": "IN"})
    assert r.status_code == 200, r.text
    code = r.json()["dev_hint"]
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["driver"]["id"], body["access_token"]


def _fill_kyc_and_approve(driver_id: str, jwt: str, admin_headers: dict):
    """Approve directly via admin — bypass step-by-step wizard for speed."""
    # Some fields required for approval flow — go through wizard endpoints
    h = {"Authorization": f"Bearer {jwt}"}
    steps = [
        ("personal", {"name": "Test Driver", "email": "td@t.co"}),
        ("id", {"gov_id_type": "aadhaar", "gov_id_number": "111122223333",
                "gov_id_front_url": "/x", "gov_id_back_url": "/x"}),
        ("licence", {"licence_number": "DL0001", "licence_front_url": "/x",
                     "licence_expiry": "2030-01-01"}),
        ("selfie", {"selfie_url": "/x"}),
        ("vehicle", {"vehicle_type": "bike", "vehicle_plate": "AA1", "vehicle_reg_url": "/x"}),
        ("bank", {"bank_account_holder": "Test", "bank_account_number": "1234567890",
                  "bank_ifsc_or_swift": "HDFC0001"}),
        ("emergency", {"emergency_contact_name": "Kin", "emergency_contact_phone": "+919999999999"}),
    ]
    for step, data in steps:
        r = requests.patch(f"{BASE_URL}/api/driver/me/kyc",
                           json={"step": step, "data": data}, headers=h)
        assert r.status_code == 200, f"{step}: {r.text}"
    r = requests.post(f"{BASE_URL}/api/driver/me/submit", headers=h)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_id}/approve",
                      json={"notes": "auto-approve"}, headers=admin_headers)
    assert r.status_code == 200, r.text


def _dispatch_demo_job(driver_id: str, admin_headers: dict) -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_id}/dispatch-demo-job",
                     headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def driver_a(admin_headers):
    phone = _mkphone()
    did, jwt = _bootstrap_driver(phone)
    _fill_kyc_and_approve(did, jwt, admin_headers)
    return {"id": did, "jwt": jwt, "phone": phone}


@pytest.fixture(scope="module")
def driver_b(admin_headers):
    time.sleep(1)  # ensure phone uniqueness
    phone = _mkphone().replace("+919", "+918", 1)
    did, jwt = _bootstrap_driver(phone)
    _fill_kyc_and_approve(did, jwt, admin_headers)
    return {"id": did, "jwt": jwt, "phone": phone}


@pytest.fixture
def job_a(driver_a, admin_headers):
    return _dispatch_demo_job(driver_a["id"], admin_headers)


# ---- Share-token bootstrap -----------------------------------------------

class TestShareToken:
    def test_dispatch_returns_share_token(self, job_a):
        tok = job_a.get("share_token")
        assert isinstance(tok, str) and len(tok) >= 20, f"share_token invalid: {tok!r}"


# ---- Driver-side messages ------------------------------------------------

class TestDriverMessages:
    def test_get_returns_presets_and_status(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.get(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "presets" in data and "job_status" in data
        assert "downstairs" in data["presets"]

    def test_send_preset_canonicalises_text(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                         json={"preset_key": "downstairs", "text": "ignored"}, headers=h)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["preset_key"] == "downstairs"
        assert m["text"] == "I'm downstairs."
        assert m["sender"] == "driver"

    def test_send_freetext_null_preset(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                         json={"text": "hello there"}, headers=h)
        assert r.status_code == 200
        m = r.json()
        assert m["preset_key"] is None
        assert m["text"] == "hello there"

    def test_empty_message_400(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                         json={}, headers=h)
        assert r.status_code == 400
        assert "empty_message" in r.text

    def test_unknown_preset_400(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                         json={"preset_key": "nope"}, headers=h)
        assert r.status_code == 400
        assert "unknown_preset" in r.text

    def test_message_too_long_400(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                         json={"text": "x" * 501}, headers=h)
        assert r.status_code == 400
        assert "message_too_long" in r.text

    def test_ownership_404(self, driver_a, driver_b, job_a):
        # Driver B tries to access A's job
        h = {"Authorization": f"Bearer {driver_b['jwt']}"}
        r = requests.get(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages", headers=h)
        assert r.status_code == 404


# ---- Public track --------------------------------------------------------

class TestPublicTrack:
    def test_missing_token_401_or_422(self, job_a):
        r = requests.get(f"{BASE_URL}/api/send/track/{job_a['id']}")
        assert r.status_code in (401, 422), r.status_code

    def test_wrong_token_404(self, job_a):
        r = requests.get(f"{BASE_URL}/api/send/track/{job_a['id']}?t=bogus")
        assert r.status_code == 404

    def test_correct_token_safe_subset(self, job_a):
        r = requests.get(f"{BASE_URL}/api/send/track/{job_a['id']}?t={job_a['share_token']}")
        assert r.status_code == 200
        data = r.json()
        # No secrets in the payload
        blob = str(data)
        assert "pickup_otp" not in blob
        assert "delivery_otp" not in blob
        assert "bank" not in blob
        # In offered state — driver may or may not be exposed (offered is in CHAT_OPEN_STATUSES)
        assert data["status"] in ("offered", "accepted", "arriving_pickup",
                                   "picked_up", "arriving_dropoff", "delivered")

    def test_public_send_customer_preset(self, job_a):
        r = requests.post(f"{BASE_URL}/api/send/track/{job_a['id']}/messages?t={job_a['share_token']}",
                         json={"preset_key": "coming_down"})
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["sender"] == "customer"
        assert m["preset_key"] == "coming_down"
        assert m["text"] == "Coming down now."

    def test_public_unknown_preset_400(self, job_a):
        r = requests.post(f"{BASE_URL}/api/send/track/{job_a['id']}/messages?t={job_a['share_token']}",
                         json={"preset_key": "nope"})
        assert r.status_code == 400

    def test_public_driver_preset_rejected(self, job_a):
        # Customer side should reject a *driver*-only preset key
        r = requests.post(f"{BASE_URL}/api/send/track/{job_a['id']}/messages?t={job_a['share_token']}",
                         json={"preset_key": "downstairs"})
        assert r.status_code == 400


# ---- Incremental polling -------------------------------------------------

class TestPolling:
    def test_driver_after_returns_only_newer(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        # Send one, get cursor, send another, verify only 2nd returns
        r1 = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                          json={"preset_key": "at_gate"}, headers=h)
        assert r1.status_code == 200
        cursor = r1.json()["created_at"]
        time.sleep(1.1)
        r2 = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                          json={"preset_key": "traffic"}, headers=h)
        assert r2.status_code == 200
        r = requests.get(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages",
                        params={"after": cursor}, headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        cur_dt = datetime.fromisoformat(cursor)
        assert all(datetime.fromisoformat(m["created_at"]) > cur_dt for m in items)

    def test_bad_after_returns_everything_no_500(self, driver_a, job_a):
        h = {"Authorization": f"Bearer {driver_a['jwt']}"}
        r = requests.get(f"{BASE_URL}/api/driver/me/jobs/{job_a['id']}/messages?after=not-a-date", headers=h)
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_public_after_incremental(self, job_a):
        # Get baseline
        r = requests.get(f"{BASE_URL}/api/send/track/{job_a['id']}/messages?t={job_a['share_token']}")
        assert r.status_code == 200
        items = r.json()["items"]
        cursor = items[-1]["created_at"] if items else "1970-01-01T00:00:00+00:00"
        time.sleep(1.1)
        requests.post(f"{BASE_URL}/api/send/track/{job_a['id']}/messages?t={job_a['share_token']}",
                     json={"preset_key": "thanks"})
        r = requests.get(f"{BASE_URL}/api/send/track/{job_a['id']}/messages",
                        params={"t": job_a['share_token'], "after": cursor})
        assert r.status_code == 200
        newer = r.json()["items"]
        assert len(newer) >= 1
        cur_dt = datetime.fromisoformat(cursor)
        assert all(datetime.fromisoformat(m["created_at"]) > cur_dt for m in newer)


# ---- Terminal state guards -----------------------------------------------

class TestTerminalGuards:
    def test_chat_closed_after_delivered(self, admin_headers):
        # Fresh driver + job walked to delivered
        phone = _mkphone().replace("+919", "+917", 1)
        did, jwt = _bootstrap_driver(phone)
        _fill_kyc_and_approve(did, jwt, admin_headers)
        job = _dispatch_demo_job(did, admin_headers)
        h = {"Authorization": f"Bearer {jwt}"}
        # Walk through lifecycle
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job['id']}/accept", headers=h)
        assert r.status_code == 200, r.text
        pickup_otp = r.json()["pickup_otp"]
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job['id']}/verify-pickup",
                         json={"code": pickup_otp}, headers=h)
        assert r.status_code == 200, r.text
        delivery_otp = r.json()["delivery_otp"]
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job['id']}/verify-delivery",
                         json={"code": delivery_otp}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "delivered"

        # POST /messages → 409
        r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{job['id']}/messages",
                         json={"preset_key": "downstairs"}, headers=h)
        assert r.status_code == 409
        assert "chat_closed" in r.text
        # GET still works
        r = requests.get(f"{BASE_URL}/api/driver/me/jobs/{job['id']}/messages", headers=h)
        assert r.status_code == 200

        # Public POST 409, driver=null after delivered
        tok = job["share_token"]
        r = requests.get(f"{BASE_URL}/api/send/track/{job['id']}?t={tok}")
        assert r.status_code == 200
        assert r.json()["driver"] is None
        r = requests.post(f"{BASE_URL}/api/send/track/{job['id']}/messages?t={tok}",
                         json={"preset_key": "thanks"})
        assert r.status_code == 409
