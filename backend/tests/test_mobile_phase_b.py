# Mobile app Phase B backend tests: OTP auth, customer notifications, wallet, module category APIs, app-preview mount
import os
import random
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    phone = f"07{random.randint(10000000, 99999999)}"
    r = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": phone, "country": "CI"}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"otp request failed {r.status_code} {r.text[:200]}")
    d = r.json()
    assert d.get("dev_code")
    v = requests.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]}, timeout=20)
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# OTP: wrong code rejected
def test_otp_wrong_code():
    r = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": "0700000002", "country": "CI"}, timeout=20)
    assert r.status_code == 200, r.text
    v = requests.post(f"{API}/auth/otp/verify", json={"challenge_id": r.json()["challenge_id"], "code": "000000"}, timeout=20)
    assert v.status_code in (400, 401, 422)


# Notifications
def test_notifications_requires_auth():
    assert requests.get(f"{API}/customers/me/notifications", timeout=20).status_code == 401


def test_notifications_list(token):
    r = requests.get(f"{API}/customers/me/notifications", headers=H(token), timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["items"], list) and isinstance(d["unread_count"], int)


def test_notifications_read_all(token):
    r = requests.post(f"{API}/customers/me/notifications/read-all", headers=H(token), timeout=20)
    assert r.status_code == 200 and r.json()["ok"] is True
    assert requests.get(f"{API}/customers/me/notifications", headers=H(token), timeout=20).json()["unread_count"] == 0


def test_notifications_read_one_unknown(token):
    r = requests.post(f"{API}/customers/me/notifications/nonexistent123/read", headers=H(token), timeout=20)
    assert r.status_code in (200, 404)


def test_notifications_read_all_requires_auth():
    assert requests.post(f"{API}/customers/me/notifications/read-all", timeout=20).status_code == 401


# Wallet + me
def test_wallet(token):
    r = requests.get(f"{API}/customers/me/wallet", headers=H(token), timeout=20)
    assert r.status_code == 200, r.text
    print(r.json())


def test_auth_me(token):
    r = requests.get(f"{API}/auth/me", headers=H(token), timeout=20)
    assert r.status_code == 200 and r.json().get("phone")


# Module category APIs
@pytest.mark.parametrize("path", ["/mart/categories", "/food/categories", "/shop/categories", "/express/services"])
def test_module_apis(path):
    r = requests.get(f"{API}{path}", timeout=20)
    assert r.status_code == 200, r.text[:200]
    assert r.json()


# Static preview + website smoke
def test_app_preview_root():
    r = requests.get(f"{API}/app-preview/", timeout=20)
    assert r.status_code == 200 and "<html" in r.text.lower()


def test_website_root():
    r = requests.get(f"{BASE_URL}/", timeout=20)
    assert r.status_code == 200 and "root" in r.text
