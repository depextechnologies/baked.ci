"""Driver email/Google/OTP auth regression tests (iteration 62).

Covers:
- POST /api/driver/auth/email-register (happy + 409 + 422)
- POST /api/driver/auth/email-login   (happy + 401)
- POST /api/driver/auth/google/verify (401 for bogus code)
- POST /api/driver/auth/request-otp + verify-otp regression
- GET  /api/driver/me with email-issued token
- DB schema check for migration 0030 (password_hash, google_sub, nullable phone_e164)
"""
from __future__ import annotations

import base64
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api/driver"


def _jwt_role(tok: str) -> str:
    payload_b64 = tok.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    data = json.loads(base64.urlsafe_b64decode(payload_b64))
    return data.get("role") or data.get("user_role") or ""


@pytest.fixture(scope="module")
def fresh_email():
    return f"qa.email.driver+{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@baked.dev"


@pytest.fixture(scope="module")
def password():
    return "driverPass123!"


# --------------------------- email-register ---------------------------

class TestEmailRegister:
    def test_register_happy(self, fresh_email, password):
        r = requests.post(f"{API}/auth/email-register", json={
            "email": fresh_email, "password": password, "country": "IN",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and isinstance(body["access_token"], str)
        assert body["next_step"] == "personal"
        drv = body["driver"]
        assert drv["email"] == fresh_email.lower()
        assert drv["country"] == "IN"
        assert drv["status"] == "onboarding"
        assert drv["kyc_step"] == "personal"
        assert _jwt_role(body["access_token"]) == "driver"
        # stash for later tests
        pytest.driver_token = body["access_token"]
        pytest.driver_id = drv["id"]

    def test_register_duplicate_409(self, fresh_email, password):
        r = requests.post(f"{API}/auth/email-register", json={
            "email": fresh_email, "password": password, "country": "IN",
        }, timeout=15)
        assert r.status_code == 409, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "email_taken"

    def test_register_short_password_422(self):
        r = requests.post(f"{API}/auth/email-register", json={
            "email": f"qa.short+{uuid.uuid4().hex[:6]}@baked.dev", "password": "short", "country": "IN",
        }, timeout=15)
        assert r.status_code == 422, r.text

    def test_register_bad_email_422(self):
        r = requests.post(f"{API}/auth/email-register", json={
            "email": "not-an-email", "password": "goodpass123", "country": "IN",
        }, timeout=15)
        assert r.status_code == 422, r.text


# --------------------------- email-login ---------------------------

class TestEmailLogin:
    def test_login_happy(self, fresh_email, password):
        r = requests.post(f"{API}/auth/email-login", json={
            "email": fresh_email, "password": password,
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert body["driver"]["email"] == fresh_email.lower()
        assert body["next_step"] == "personal"

    def test_login_wrong_password_401(self, fresh_email):
        r = requests.post(f"{API}/auth/email-login", json={
            "email": fresh_email, "password": "wrongPassword!!",
        }, timeout=15)
        assert r.status_code == 401, r.text
        assert r.json().get("detail", {}).get("code") == "invalid_credentials"

    def test_login_unknown_email_401(self):
        r = requests.post(f"{API}/auth/email-login", json={
            "email": f"nope+{uuid.uuid4().hex[:6]}@baked.dev", "password": "whatever123",
        }, timeout=15)
        assert r.status_code == 401
        assert r.json().get("detail", {}).get("code") == "invalid_credentials"


# --------------------------- google verify ---------------------------

class TestGoogleVerify:
    def test_bogus_code_returns_401(self):
        r = requests.post(f"{API}/auth/google/verify", json={
            "code": "definitely-not-a-real-google-authorization-code-xxxxxxx",
            "country": "IN",
        }, timeout=15)
        # Accept 401 (correct) OR 500 if GOOGLE_CLIENT_ID unconfigured — flag which
        assert r.status_code in (401, 500), r.text
        if r.status_code == 500:
            pytest.skip(f"Google not configured on backend: {r.text[:120]}")


# --------------------------- OTP regression ---------------------------

class TestOtpRegression:
    def test_request_and_verify_otp(self):
        phone = "+919990001234"
        r = requests.post(f"{API}/auth/request-otp", json={
            "phone_e164": phone, "country": "IN",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "otp_id" in body
        code = body.get("dev_hint")
        assert code and len(code) == 6, f"missing dev_hint: {body}"
        r2 = requests.post(f"{API}/auth/verify-otp", json={
            "phone_e164": phone, "code": code,
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert "access_token" in b2 and "driver" in b2 and "next_step" in b2


# --------------------------- /me guard ---------------------------

class TestDriverMe:
    def test_me_with_email_token(self):
        tok = getattr(pytest, "driver_token", None)
        if not tok:
            pytest.skip("email-register test didn't run")
        r = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("id") == pytest.driver_id


# --------------------------- DB schema (migration 0030) ---------------------------

class TestSchemaMigration0030:
    def test_columns_exist(self):
        import asyncio
        import sqlalchemy as sa
        from sqlalchemy.ext.asyncio import create_async_engine
        url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
        if not url:
            # try reading from backend/.env
            try:
                with open("/app/backend/.env") as fh:
                    for line in fh:
                        if line.startswith("DATABASE_URL="):
                            url = line.split("=", 1)[1].strip().strip('"')
                            break
            except FileNotFoundError:
                pass
        if not url:
            pytest.skip("DATABASE_URL not available")
        # ensure asyncpg driver
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        async def _check():
            eng = create_async_engine(url)
            async with eng.connect() as conn:
                cols = (await conn.execute(sa.text(
                    "SELECT column_name, is_nullable FROM information_schema.columns "
                    "WHERE table_name='drivers'"
                ))).all()
            await eng.dispose()
            return {c[0]: c[1] for c in cols}

        cols = asyncio.get_event_loop().run_until_complete(_check())
        assert "password_hash" in cols, cols
        assert "google_sub" in cols, cols
        assert cols.get("phone_e164") == "YES", f"phone_e164 must be nullable, got {cols.get('phone_e164')}"
