"""SENDbakēd Driver — Slice 3 Wallet (earnings ledger + withdrawals) backend E2E.

Reuses the same driver bootstrap flow as Slice 2 lifecycle test, then asserts:
- fresh driver has zero balance
- verify-delivery credits the ledger exactly once (idempotent via unique
  (job_id, kind) index — retried verify-delivery call must not double-credit)
- dashboard today.earnings.amount is sourced from the ledger post-delivery
- POST /me/withdrawals validation branches:
    bank_missing / below_minimum / insufficient_balance / withdrawal_pending
- GET /me/withdrawals returns newest-first
"""
import io
import os
import random

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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register_driver(with_bank: bool = True):
    """Full onboarding — returns dict with token, id, headers, phone."""
    phone = f"+9199900{random.randint(10000, 99999)}"
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": "IN"}, timeout=30)
    assert r.status_code == 200, r.text
    code = r.json()["dev_hint"]
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    token = body["access_token"]
    did = body["driver"]["id"]
    h = {"Authorization": f"Bearer {token}"}

    steps = [
        ("personal",  {"name": "QA WalletDriver", "email": "wallet.qa@test.example"}),
        ("id",        {"gov_id_type": "aadhaar", "gov_id_number": "999988887777"}),
        ("licence",   {"licence_number": "DL-WQA-0001", "licence_expiry": "2030-12-31"}),
        ("selfie",    {}),
        ("vehicle",   {"vehicle_type": "bike", "vehicle_plate": "DL01WQ1234"}),
    ]
    if with_bank:
        steps.append(("bank", {"bank_account_holder": "QA WalletDriver",
                               "bank_account_number": "9876543210",
                               "bank_ifsc_or_swift": "HDFC0000001"}))
    steps.append(("emergency", {"emergency_contact_name": "Kin",
                                "emergency_contact_phone": "+919990001111"}))

    for step, data in steps:
        r = requests.patch(f"{BASE_URL}/api/driver/me/kyc",
                           json={"step": step, "data": data}, headers=h, timeout=30)
        assert r.status_code == 200, f"kyc {step}: {r.status_code} {r.text}"

    dummy = b"\x89PNG\r\n\x1a\n" + b"0" * 128
    for kind in ("gov_id_front", "licence_front", "selfie"):
        r = requests.post(f"{BASE_URL}/api/driver/me/upload",
                          files={"file": (f"{kind}.png", io.BytesIO(dummy), "image/png")},
                          data={"kind": kind}, headers=h, timeout=30)
        assert r.status_code == 200, r.text

    r = requests.post(f"{BASE_URL}/api/driver/me/submit", headers=h, timeout=30)
    assert r.status_code == 200
    return {"token": token, "id": did, "headers": h, "phone": phone}


def _admin_approve(admin_token, driver_id):
    ah = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{driver_id}/approve",
                      json={}, headers=ah, timeout=30)
    assert r.status_code == 200, r.text


def _complete_delivery(admin_token, drv):
    ah = {"Authorization": f"Bearer {admin_token}"}
    h = drv["headers"]
    # online
    r = requests.post(f"{BASE_URL}/api/driver/me/online",
                      json={"is_online": True, "lat": 28.5691, "lng": 77.3210},
                      headers=h, timeout=30)
    assert r.status_code == 200
    # dispatch
    r = requests.post(f"{BASE_URL}/api/admin/drivers/{drv['id']}/dispatch-demo-job",
                      json={}, headers=ah, timeout=30)
    assert r.status_code == 200, r.text
    job = r.json()
    jid = job["id"]
    # accept
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/accept",
                      json={}, headers=h, timeout=30)
    assert r.status_code == 200
    # pickup
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job", headers=h, timeout=30)
    pickup_otp = r.json()["pickup_otp"]
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-pickup",
                      json={}, headers=h, timeout=30)
    assert r.status_code == 200
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-pickup",
                      json={"code": pickup_otp}, headers=h, timeout=30)
    assert r.status_code == 200
    # dropoff
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/arrive-dropoff",
                      json={}, headers=h, timeout=30)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/driver/me/active-job", headers=h, timeout=30)
    delivery_otp = r.json()["delivery_otp"]
    r = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-delivery",
                      json={"code": delivery_otp}, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return jid, delivery_otp, job["fare"]["amount"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def approved_driver(admin_token):
    drv = _register_driver(with_bank=True)
    _admin_approve(admin_token, drv["id"])
    return drv


def test_01_fresh_driver_zero_balance(approved_driver):
    r = requests.get(f"{BASE_URL}/api/driver/me/earnings",
                     headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["available_balance"] == 0
    assert d["lifetime"] == 0
    assert d["today"]["trips"] == 0
    assert d["month"]["trips"] == 0
    assert d["recent"] == []
    assert d["currency"] == "INR"


def test_02_delivery_credits_ledger_and_idempotent(admin_token, approved_driver):
    jid, dotp, fare = _complete_delivery(admin_token, approved_driver)
    approved_driver["job_id"] = jid
    approved_driver["delivery_otp"] = dotp
    approved_driver["fare"] = fare

    r = requests.get(f"{BASE_URL}/api/driver/me/earnings",
                     headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["available_balance"] == fare
    assert d["lifetime"] == fare
    assert d["today"]["amount"] == fare
    assert d["today"]["trips"] == 1
    assert len(d["recent"]) == 1
    e0 = d["recent"][0]
    assert e0["kind"] == "fare"
    assert e0["job_id"] == jid
    assert e0["currency"] == "INR"
    assert e0["amount"] == fare

    # Idempotency: retry verify-delivery — should 409 and NOT create a 2nd row
    r2 = requests.post(f"{BASE_URL}/api/driver/me/jobs/{jid}/verify-delivery",
                       json={"code": dotp}, headers=approved_driver["headers"], timeout=30)
    assert r2.status_code == 409  # already delivered
    r = requests.get(f"{BASE_URL}/api/driver/me/earnings",
                     headers=approved_driver["headers"], timeout=30)
    d2 = r.json()
    assert d2["lifetime"] == fare, f"double credit! lifetime={d2['lifetime']}"
    assert len(d2["recent"]) == 1


def test_03_dashboard_sources_from_ledger(approved_driver):
    r = requests.get(f"{BASE_URL}/api/driver/me/dashboard",
                     headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["today"]["earnings"]["amount"] == approved_driver["fare"]
    assert d["today"]["earnings"]["trips"] == 1


def test_04_withdrawal_below_minimum(approved_driver):
    r = requests.post(f"{BASE_URL}/api/driver/me/withdrawals",
                      json={"amount": 50}, headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 400
    body = r.json()
    detail = body.get("detail", body)
    assert detail.get("code") == "below_minimum", detail


def test_05_withdrawal_insufficient_balance(approved_driver):
    r = requests.post(f"{BASE_URL}/api/driver/me/withdrawals",
                      json={"amount": 999999}, headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 400
    detail = r.json().get("detail", r.json())
    assert detail.get("code") == "insufficient_balance", detail


def test_06_withdrawal_success_reduces_balance(approved_driver):
    fare = approved_driver["fare"]
    r = requests.post(f"{BASE_URL}/api/driver/me/withdrawals",
                      json={"amount": fare}, headers=approved_driver["headers"], timeout=30)
    assert r.status_code in (200, 201), r.text
    w = r.json()
    assert w["status"] == "pending"
    assert w["amount"] == fare
    assert w["currency"] == "INR"
    approved_driver["withdrawal_id"] = w["id"]

    r = requests.get(f"{BASE_URL}/api/driver/me/earnings",
                     headers=approved_driver["headers"], timeout=30)
    d = r.json()
    assert d["available_balance"] == 0, f"expected 0 got {d['available_balance']}"
    assert d["lifetime"] == fare
    assert d["pending_withdrawal"] is not None
    assert d["pending_withdrawal"]["status"] == "pending"


def test_07_withdrawal_pending_blocks_second(approved_driver):
    r = requests.post(f"{BASE_URL}/api/driver/me/withdrawals",
                      json={"amount": 100}, headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 409
    detail = r.json().get("detail", r.json())
    assert detail.get("code") == "withdrawal_pending", detail


def test_08_list_withdrawals_newest_first(approved_driver):
    r = requests.get(f"{BASE_URL}/api/driver/me/withdrawals",
                     headers=approved_driver["headers"], timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 1
    # newest first
    if len(items) > 1:
        assert items[0]["requested_at"] >= items[1]["requested_at"]


def test_09_bank_missing_branch():
    """A driver without bank_account_number → 409 bank_missing.
    We just OTP-register the driver (no KYC/submit) — _current_driver only
    checks the bearer token, so we can exercise the withdrawal endpoint with
    an un-approved driver whose bank_account_number is still None."""
    phone = f"+9199900{random.randint(10000, 99999)}"
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": "IN"}, timeout=30)
    assert r.status_code == 200
    code = r.json()["dev_hint"]
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code}, timeout=30)
    assert r.status_code == 200
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE_URL}/api/driver/me/withdrawals",
                      json={"amount": 200}, headers=h, timeout=30)
    assert r.status_code == 409, r.text
    detail = r.json().get("detail", r.json())
    assert detail.get("code") == "bank_missing", detail
