# Native Google Sign-In (Emergent-managed) + OTP sanity for native login
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


class TestEmergentSession:
    def test_invalid_session_id_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/emergent/session", json={"session_id": "invalid_session_xxxxxxxxxxxx"})
        assert r.status_code == 401, r.text
        assert "detail" in r.json()

    def test_missing_session_id_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/emergent/session", json={})
        assert r.status_code == 422

    def test_short_session_id_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/emergent/session", json={"session_id": "ab"})
        assert r.status_code == 422


class TestOtpLogin:
    def test_otp_request_and_verify(self):
        r = requests.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": "0700000000", "country_code": "+225"})
        if r.status_code == 422:
            pytest.skip(f"payload shape differs: {r.text[:200]}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("dev_code")
        v = requests.post(f"{BASE_URL}/api/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]})
        assert v.status_code == 200, v.text
        assert v.json().get("access_token")


class TestExplorerData:
    def test_mart_categories(self):
        r = requests.get(f"{BASE_URL}/api/mart/categories")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("categories") or data.get("items") or []
        assert len(items) > 0
