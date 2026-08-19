"""SENDbakēd Driver — Slice 2 Delivery Lifecycle E2E backend test.

Full flow:
  register (phone -> OTP) -> KYC wizard -> submit -> admin approve -> go online
  -> admin dispatch demo job -> accept -> arrive-pickup -> verify pickup OTP
  -> arrive-dropoff -> verify delivery OTP -> delivered
"""
import io
import os
import random
import time

import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def phone():
    # Unique phone per test run to avoid conflicts
    return f"+9199900{random.randint(10000, 99999)}"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def driver_ctx(phone):
    """Registers driver via OTP, completes KYC, submits. Returns dict w/ token,id."""
    # 1) Request OTP
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": "IN"}, timeout=30)
    assert r.status_code == 200, r.text
    code = r.json().get("dev_hint")
    assert code, f"dev_hint missing: {r.json()}"

    # 2) Verify OTP -> access_token
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["access_token"]
    driver_id = body["driver"]["id"]
    h = {"Authorization": f"Bearer {token}"}

    # 3) KYC wizard PATCH each step
    steps = [
        ("personal",  {"name": "QA Driver", "email": "qa.driver@test.example"}),
        ("id",        {"gov_id_type": "aadhaar", "gov_id_number": "111122223333"}),
        ("licence",   {"licence_number": "DL-QA-0001", "licence_expiry": "2030-12-31"}),
        ("selfie",    {}),  # selfie is set through upload
        ("vehicle",   {"vehicle_type": "bike", "vehicle_plate": "DL01AB1234"}),
        ("bank",      {"bank_account_holder": "QA Driver", "bank_account_number": "1234567890",
                       "bank_ifsc_or_swift": "HDFC0000001"}),
        ("emergency", {"emergency_contact_name": "Kin", "emergency_contact_phone": "+919990001111"}),
    ]
    for step, data in steps:
        r = requests.patch(f"{BASE_URL}/api/driver/me/kyc",
                           json={"step": step, "data": data}, headers=h, timeout=30)
        assert r.status_code == 200, f"kyc {step} failed: {r.status_code} {r.text}"

    # 4) Uploads (dummy image bytes) for id front, licence front, selfie
    dummy = b"\x89PNG\r\n\x1a\n" + b"0" * 128
    for kind in ("gov_id_front", "licence_front", "selfie"):
        files = {"file": (f"{kind}.png", io.BytesIO(dummy), "image/png")}
        r = requests.post(f"{BASE_URL}/api/driver/me/upload",
                          files=files, data={"kind": kind}, headers=h, timeout=30)
        assert r.status_code == 200, f"upload {kind} failed: {r.status_code} {r.text}"

    # 5) Submit for review
    r = requests.post(f"{BASE_URL}/api/driver/me/submit", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_review"

    return {"token": token, "id": driver_id, "headers": h}


def test_01_admin_approve(admin_token, driver_ctx):
    ah = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_ctx['id']}/approve",
                      json={}, headers=ah, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    # GET /me confirms
    r = requests.get(f"{BASE_URL}/api/driver/me", headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_02_go_online(driver_ctx):
    r = requests.post(f"{BASE_URL}/api/driver/me/online",
                      json={"is_online": True, "lat": 28.5691, "lng": 77.3210},
                      headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["is_online"] is True


def test_03_dispatch_and_accept(admin_token, driver_ctx):
    ah = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_ctx['id']}/dispatch-demo-job",
                      json={}, headers=ah, timeout=30)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "offered"
    assert job["fare"]["currency"] == "INR"
    driver_ctx["job_id"] = job["id"]

    # driver's active-job endpoint sees it
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job",
                     headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200
    aj = r.json()
    assert aj and aj["status"] == "offered" and aj["id"] == driver_ctx["job_id"]

    # Accept
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{driver_ctx['job_id']}/accept",
                      json={}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"


def test_04_pickup_flow(driver_ctx):
    jid = driver_ctx["job_id"]
    # get pickup_otp
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job",
                     headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "accepted"
    pickup_otp = j["pickup_otp"]
    assert pickup_otp and len(pickup_otp) == 6

    # arrive pickup
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-pickup",
                      json={}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "arriving_pickup"

    # wrong OTP rejected
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-pickup",
                      json={"code": "000000"}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 400

    # correct OTP
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-pickup",
                      json={"code": pickup_otp}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "picked_up"


def test_05_dropoff_flow(driver_ctx):
    jid = driver_ctx["job_id"]
    # arrive dropoff
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-dropoff",
                      json={}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "arriving_dropoff"

    # fetch delivery_otp
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job",
                     headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200
    j = r.json()
    dotp = j["delivery_otp"]
    assert dotp and len(dotp) == 6

    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-delivery",
                      json={"code": dotp}, headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "delivered"

    # active-job now None
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job",
                     headers=driver_ctx["headers"], timeout=30)
    assert r.status_code == 200
    assert r.json() in (None, {})
