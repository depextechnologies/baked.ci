# Customer email/password auth (register w/ phone OTP, email verify, email login, forgot/reset, PATCH email reset)
import os
import random
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/auth"
PW = "TestBakedPass2026!"


def _ip():
    return f"10.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"


def _s():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Forwarded-For": _ip()})
    return s


def _phone():
    return "07" + "".join(random.choice("0123456789") for _ in range(8))


def _email():
    return f"test_{uuid.uuid4().hex[:10]}@test.example"


def _start(s, **kw):
    body = {"first_name": "TEST_Ama", "last_name": "Kouassi", "country_code": "+225", "phone": _phone(),
            "email": _email(), "password": PW, "accept_terms": True, "channel": "sms"}
    body.update(kw)
    return s.post(f"{API}/register/start", json=body), body


def _code(r):
    d = r.json().get("detail")
    return d.get("code") if isinstance(d, dict) else d


# ---- register/start validation
class TestRegisterStartValidation:
    @pytest.mark.parametrize("kw,status,code", [
        ({"first_name": "  "}, 422, "invalid_name"),
        ({"last_name": ""}, 422, "invalid_name"),
        ({"email": "bad-email"}, 422, "invalid_email"),
        ({"password": "Short1!"}, 422, "password_too_short"),
        ({"password": "password1234"}, 422, "password_too_common"),
        ({"accept_terms": False}, 422, "terms_required"),
        ({"phone": "123"}, 422, "invalid_phone"),
        ({"channel": "whatsapp"}, 400, "whatsapp_unavailable"),
    ])
    def test_validation(self, kw, status, code):
        r, _ = _start(_s(), **kw)
        assert r.status_code == status, r.text
        assert _code(r) == code

    def test_email_taken(self):
        r, _ = _start(_s(), email="awa.kone@test.example")
        assert r.status_code == 409 and _code(r) == "email_taken", r.text

    def test_account_exists(self):
        r, _ = _start(_s(), phone="0700000201")
        assert r.status_code == 409 and _code(r) == "account_exists", r.text


# ---- full new registration + email verify + login + forgot/reset + patch email
class TestRegisterFlow:
    state = {}

    def test_start_success(self):
        r, body = _start(_s())
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("registration_id", "challenge_id", "masked_phone", "dev_code", "existing_account"):
            assert k in d
        assert d["existing_account"] is False
        assert d["masked_phone"].endswith("****")
        self.state.update(body=body, reg=d)

    def test_verify_wrong_then_right(self):
        s = _s()
        reg = self.state["reg"]
        wrong = "000000" if reg["dev_code"] != "000000" else "111111"
        r = s.post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": wrong})
        assert r.status_code == 400 and _code(r) == "code_incorrect", r.text
        r = s.post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": reg["dev_code"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["access_token"]
        c = d["customer"]
        assert c["has_password"] is True
        assert c.get("email_verified_at") is None
        assert "password_hash" not in c
        assert c["email"] == self.state["body"]["email"]
        ev = d["email_verification"]
        assert isinstance(ev, dict) and ev["status"] in ("sent", "unavailable") and ev.get("dev_code")
        self.state.update(token=d["access_token"], cid=c["id"], ev_code=ev["dev_code"])

    def test_verify_reuse_registration_fails(self):
        reg = self.state["reg"]
        r = _s().post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": reg["dev_code"]})
        assert r.status_code == 400

    def test_email_verify_wrong_and_right(self):
        s = _s()
        s.headers["Authorization"] = f"Bearer {self.state['token']}"
        wrong = "000000" if self.state["ev_code"] != "000000" else "111111"
        r = s.post(f"{API}/email/verify", json={"code": wrong})
        assert r.status_code == 400, r.text
        r = s.post(f"{API}/email/verify", json={"code": self.state["ev_code"]})
        assert r.status_code == 200, r.text
        assert r.json()["email_verified_at"]
        me = s.get(f"{BASE_URL}/api/customers/me")
        assert me.status_code == 200 and me.json()["email_verified_at"]

    def test_login_email(self):
        email = self.state["body"]["email"]
        r = _s().post(f"{API}/login/email", json={"email": email.upper(), "password": PW})
        assert r.status_code == 200, r.text
        assert r.json()["customer"]["id"] == self.state["cid"]
        bad = _s().post(f"{API}/login/email", json={"email": email, "password": "WrongPass12345"})
        unk = _s().post(f"{API}/login/email", json={"email": _email(), "password": "WrongPass12345"})
        assert bad.status_code == 401 and unk.status_code == 401
        assert bad.json()["detail"] == unk.json()["detail"]
        assert bad.json()["detail"]["message"] == "Incorrect email or password"

    def test_forgot_and_reset(self):
        email = self.state["body"]["email"]
        r = _s().post(f"{API}/password/forgot", json={"email": email})
        assert r.status_code == 200 and r.json()["status"] == "ok" and r.json().get("dev_code"), r.text
        code = r.json()["dev_code"]
        unk = _s().post(f"{API}/password/forgot", json={"email": _email()})
        assert unk.status_code == 200 and unk.json() == {"status": "ok"}
        # weak new password rejected
        weak = _s().post(f"{API}/password/reset", json={"email": email, "code": code, "new_password": "short"})
        assert weak.status_code == 422
        new_pw = "ResetBakedPass2026#"
        r = _s().post(f"{API}/password/reset", json={"email": email, "code": code, "new_password": new_pw})
        assert r.status_code == 200 and r.json()["access_token"], r.text
        old = _s().post(f"{API}/login/email", json={"email": email, "password": PW})
        assert old.status_code == 401
        new = _s().post(f"{API}/login/email", json={"email": email, "password": new_pw})
        assert new.status_code == 200
        # code reuse
        again = _s().post(f"{API}/password/reset", json={"email": email, "code": code, "new_password": "AnotherPass2026$"})
        assert again.status_code == 400

    def test_patch_email_resets_verified(self):
        s = _s()
        s.headers["Authorization"] = f"Bearer {self.state['token']}"
        new_email = _email()
        r = s.patch(f"{BASE_URL}/api/customers/me", json={"email": new_email})
        assert r.status_code == 200, r.text
        assert r.json()["email"] == new_email and r.json()["email_verified_at"] is None
        # forgot now gives no dev_code (unverified)
        f = _s().post(f"{API}/password/forgot", json={"email": new_email})
        assert f.json() == {"status": "ok"}


# ---- unverified email: forgot gives no code
class TestForgotUnverified:
    def test_unverified_no_code(self):
        r, body = _start(_s())
        reg = r.json()
        v = _s().post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": reg["dev_code"]})
        assert v.status_code == 200
        f = _s().post(f"{API}/password/forgot", json={"email": body["email"]})
        assert f.status_code == 200 and f.json() == {"status": "ok"}


# ---- attempts + resend
class TestVerifyAttemptsAndResend:
    def test_sixth_attempt_429_and_resend(self):
        r, _ = _start(_s())
        reg = r.json()
        wrong = "000000" if reg["dev_code"] != "000000" else "111111"
        statuses = [
            _s().post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": wrong}).status_code
            for _ in range(6)
        ]
        assert statuses[:5] == [400] * 5 and statuses[5] == 429, statuses
        rs = _s().post(f"{API}/register/resend", json={"registration_id": reg["registration_id"]})
        assert rs.status_code == 200, rs.text
        assert rs.json()["challenge_id"] != reg["challenge_id"] and rs.json().get("dev_code")
        ok = _s().post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": rs.json()["dev_code"]})
        assert ok.status_code == 200, ok.text


# ---- phone-only customer upgrade keeps same id
class TestUpgradePhoneOnly:
    def test_upgrade(self):
        s = _s()
        phone = _phone()
        o = s.post(f"{API}/otp/request", json={"country_code": "+225", "phone": phone})
        assert o.status_code == 200, o.text
        v = s.post(f"{API}/otp/verify", json={"challenge_id": o.json()["challenge_id"], "code": o.json()["dev_code"]})
        assert v.status_code == 200, v.text
        cid = v.json()["customer"]["id"]
        assert v.json()["customer"].get("has_password") is False
        r, _ = _start(_s(), phone=phone)
        assert r.status_code == 200, r.text
        assert r.json()["existing_account"] is True
        reg = r.json()
        rv = _s().post(f"{API}/register/verify", json={"registration_id": reg["registration_id"], "code": reg["dev_code"]})
        assert rv.status_code == 200, rv.text
        assert rv.json()["customer"]["id"] == cid
        assert rv.json()["customer"]["has_password"] is True
        # second registration for same phone now blocked
        r2, _ = _start(_s(), phone=phone)
        assert r2.status_code == 409 and _code(r2) == "account_exists"


# ---- brute-force on same email
class TestBruteForce:
    def test_lockout(self):
        email = _email()
        s = _s()  # same IP
        codes = [s.post(f"{API}/login/email", json={"email": email, "password": "WrongPass12345"}).status_code for _ in range(8)]
        assert codes[:6] == [401] * 6 and 429 in codes[6:], codes

    def test_lockout_bypass_with_spoofed_xff(self):
        """SECURITY: per-email limit keyed by client-controlled left-most X-Forwarded-For."""
        email = _email()
        codes = [_s().post(f"{API}/login/email", json={"email": email, "password": "WrongPass12345"}).status_code for _ in range(9)]
        assert 429 in codes, f"Brute-force limit bypassable by rotating X-Forwarded-For: {codes}"
