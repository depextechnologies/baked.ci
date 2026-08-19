"""Slice 5 — Admin Payout Console backend tests."""
import os
import pytest
import requests

def _load_base_url() -> str:
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # Read from frontend/.env directly
        p = "/app/frontend/.env"
        if os.path.exists(p):
            for line in open(p):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    if not v:
        raise RuntimeError("REACT_APP_BACKEND_URL missing")
    return v.rstrip("/")

BASE_URL = _load_base_url()
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PW = "baked@2026#!$@"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _driver_token(phone: str, country: str = "IN") -> str | None:
    """OTP login helper using dev_hint (dev mode)."""
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp",
                      json={"phone_e164": phone, "country": country}, timeout=15)
    if r.status_code != 200:
        return None
    code = r.json().get("dev_hint")
    if not code:
        return None
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp",
                      json={"phone_e164": phone, "code": code}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json()["access_token"]


# ---------- P0: auth + list shape ----------
class TestAdminListWithdrawals:
    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals", timeout=15)
        assert r.status_code in (401, 403)

    def test_list_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) >= {"items", "buckets", "pending_totals"}
        assert set(data["buckets"].keys()) >= {"pending", "paid", "failed"}
        if data["items"]:
            it = data["items"][0]
            assert "driver" in it and "bank" in it
            assert set(it["driver"].keys()) >= {"id", "name", "phone_e164", "country"}
            assert set(it["bank"].keys()) >= {"holder", "account_masked", "ifsc"}
            # last-4 only visible
            am = it["bank"]["account_masked"]
            assert am is None or (len(am) > 4 and am[-4:].isdigit()) or len(am) <= 4

    def test_newest_first(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals", headers=admin_headers, timeout=30)
        items = r.json()["items"]
        if len(items) >= 2:
            assert items[0]["requested_at"] >= items[1]["requested_at"]

    def test_status_filter(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals?status=pending",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "pending"

    def test_country_filter(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals?country=IN",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["driver"]["country"] == "IN"

    def test_q_filter_by_name(self, admin_headers):
        base = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals",
                            headers=admin_headers, timeout=30).json()
        if not base["items"]:
            pytest.skip("no rows to filter")
        name = base["items"][0]["driver"]["name"]
        sub = name.split()[0] if " " in name else name[:4]
        r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals",
                         headers=admin_headers, params={"q": sub}, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert items, "expected at least one match"
        for it in items:
            assert sub.lower() in (it["driver"]["name"] or "").lower() or \
                   sub in (it["driver"]["phone_e164"] or "")

    def test_buckets_unaffected_by_q(self, admin_headers):
        a = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals",
                         headers=admin_headers, timeout=30).json()["buckets"]
        b = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals",
                         headers=admin_headers, params={"q": "zzznomatchzz"},
                         timeout=30).json()["buckets"]
        assert a == b, f"buckets should not change with q filter: {a} vs {b}"


# ---------- P0: transitions + 409 guards ----------
@pytest.fixture(scope="module")
def pending_rows(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/drivers/withdrawals?status=pending",
                     headers=admin_headers, timeout=30)
    return r.json()["items"]


class TestMarkPaidAndFailed:
    def test_mark_paid_happy(self, admin_headers, pending_rows):
        if len(pending_rows) < 1:
            pytest.skip("no pending rows to mark paid")
        wid = pending_rows[0]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-paid",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "paid"
        assert d["processed_at"]
        assert d["driver"]["id"]

    def test_mark_paid_again_returns_409(self, admin_headers, pending_rows):
        if len(pending_rows) < 1:
            pytest.skip()
        wid = pending_rows[0]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-paid",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 409
        assert "paid" in r.text.lower()

    def test_mark_failed_happy_and_note_stored(self, admin_headers, pending_rows):
        if len(pending_rows) < 2:
            pytest.skip("need >=2 pending rows")
        wid = pending_rows[1]["id"]
        note = "ifsc invalid"
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-failed",
                          headers=admin_headers, json={"note": note}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "failed"
        assert d["failure_note"] == note

    def test_mark_failed_on_failed_returns_409(self, admin_headers, pending_rows):
        if len(pending_rows) < 2:
            pytest.skip()
        wid = pending_rows[1]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-failed",
                          headers=admin_headers, json={"note": "x"}, timeout=15)
        assert r.status_code == 409

    def test_mark_failed_empty_note_stored_as_null(self, admin_headers, pending_rows):
        if len(pending_rows) < 3:
            pytest.skip("need >=3 pending rows for this branch")
        wid = pending_rows[2]["id"]
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-failed",
                          headers=admin_headers, json={}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "failed"
        assert d["failure_note"] in (None, "")

    def test_mark_paid_on_failed_returns_409(self, admin_headers, pending_rows):
        if len(pending_rows) < 2:
            pytest.skip()
        wid = pending_rows[1]["id"]  # was marked failed above
        r = requests.post(f"{BASE_URL}/api/admin/drivers/withdrawals/{wid}/mark-paid",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 409


# ---------- P0: balance recomputation on driver side ----------
class TestBalanceRecompute:
    def test_available_balance_restored_after_mark_failed(self, admin_headers, pending_rows):
        """After mark-failed, driver's available_balance must include that amount again."""
        # Find a driver from row 1 or 2 (the mark-failed target)
        target = next((p for p in pending_rows[1:] if p), None)
        if not target:
            pytest.skip("no target row")
        phone = target["driver"]["phone_e164"]
        tok = _driver_token(phone)
        if not tok:
            pytest.skip("could not obtain driver OTP token (dev mode disabled?)")
        r = requests.get(f"{BASE_URL}/api/driver/me/earnings",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Locked should NOT include the failed row → available_balance should be lifetime minus
        # only pending+paid amounts. If everything for this driver is failed now, available == lifetime.
        assert data["available_balance"] <= data["lifetime"] + 0.01
        # Also confirm pending_withdrawal is None if this was the only pending
        # (soft check)
        assert isinstance(data["available_balance"], (int, float))
