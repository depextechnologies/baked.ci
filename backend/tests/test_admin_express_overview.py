"""Sub-feature D — Super Admin Express Management Overview backend tests.

Covers:
- GET /api/admin/modules/express/stats  (KPIs shape + values)
- Live KPIs: new booking -> active_bookings increments, driver reserved
- GET /api/admin/modules/express/bookings  (list + filters)
"""
import os
import time
import random
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def customer():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    phone = "0" + "".join(str(random.randint(0, 9)) for _ in range(9))
    r = s.post(f"{BASE_URL}/api/auth/otp/request",
               json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    j = r.json()
    v = s.post(f"{BASE_URL}/api/auth/otp/verify",
               json={"challenge_id": j["challenge_id"], "code": j["dev_code"]})
    assert v.status_code == 200, v.text
    s.headers.update({"Authorization": f"Bearer {v.json()['access_token']}"})
    return s


def _mk_parcel_booking(customer):
    payload = {
        "country": "CI",
        "vehicle_code": "bike",
        "pickup": {"line1": "Plateau", "latitude": 5.36, "longitude": -4.00,
                   "city": "Abidjan", "country": "CI"},
        "drop": {"line1": "Marcory", "latitude": 5.32, "longitude": -4.02,
                 "city": "Abidjan", "country": "CI"},
        "receiver": {"name": "TEST Overview", "phone": "0100000000",
                     "preferences": ["call_before"]},
        "package_type": "general",
        "package_weight_range": "wt_upto_5",
        "payment_method": "cod",
    }
    r = customer.post(f"{BASE_URL}/api/express/bookings/parcel", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- KPIs ----------
class TestExpressStats:
    def test_stats_shape(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/stats")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["module"] == "express"
        assert j["status"] == "active"
        assert "revenue" in j and isinstance(j["revenue"], list)
        kpis = j["kpis"]
        for k in ("active_bookings", "completed_today", "searching_now",
                  "cancelled_today", "drivers_available", "avg_trip_min"):
            assert k in kpis, f"missing KPI {k}"
        # drivers_available is a string "n/n"
        assert isinstance(kpis["drivers_available"], str)
        assert "/" in kpis["drivers_available"]
        left, right = kpis["drivers_available"].split("/")
        assert left.isdigit() and right.isdigit()

    def test_unauth_stats_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/stats")
        assert r.status_code == 401, r.text

    def test_live_kpis_increment_after_booking(self, admin, customer):
        # Snapshot
        s0 = admin.get(f"{BASE_URL}/api/admin/modules/express/stats").json()["kpis"]
        active0 = s0["active_bookings"]
        drv_avail_0 = int(s0["drivers_available"].split("/")[0])
        drv_total_0 = int(s0["drivers_available"].split("/")[1])

        booking = _mk_parcel_booking(customer)
        assert booking["status"] == "searching"

        # Simulator reserves a driver quickly
        time.sleep(5)
        s1 = admin.get(f"{BASE_URL}/api/admin/modules/express/stats").json()["kpis"]
        assert s1["active_bookings"] >= active0 + 1, (
            f"active_bookings did not go up: before={active0} after={s1['active_bookings']}")
        drv_avail_1 = int(s1["drivers_available"].split("/")[0])
        drv_total_1 = int(s1["drivers_available"].split("/")[1])
        assert drv_total_1 == drv_total_0
        assert drv_avail_1 <= drv_avail_0, (
            f"drivers_available did not drop: before={drv_avail_0} after={drv_avail_1}")


# ---------- Bookings list ----------
class TestExpressBookingsList:
    def test_list_default(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "active", "limit": 100})
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("total", "limit", "offset", "items"):
            assert k in j
        assert isinstance(j["items"], list)
        if j["items"]:
            it = j["items"][0]
            for k in ("id", "ref", "booking_type", "status", "country",
                      "vehicle_code", "pickup", "drop", "receiver_name",
                      "receiver_phone", "driver_id", "driver_name",
                      "distance_km", "duration_min", "total",
                      "currency_symbol", "payment_status", "updated_at"):
                assert k in it, f"missing field {k}"

    def test_status_filter_searching(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "searching", "limit": 50})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "searching"

    def test_status_filter_active_family(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "active", "limit": 100})
        assert r.status_code == 200
        allowed = {"searching", "driver_assigned", "arriving", "picked_up", "in_transit"}
        for it in r.json()["items"]:
            assert it["status"] in allowed

    def test_status_filter_delivered(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "delivered", "limit": 50})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "delivered"

    def test_status_any_returns_all(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "any", "limit": 200})
        assert r.status_code == 200
        # No status assertion, but should be a superset of active
        r_active = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                             params={"status": "active", "limit": 200}).json()
        assert r.json()["total"] >= r_active["total"]

    def test_status_filter_unknown_returns_400(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"status": "bogus_state"})
        assert r.status_code == 400, r.text

    def test_country_ci(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"country": "CI", "status": "any", "limit": 100})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["country"] == "CI"

    def test_country_lr(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"country": "LR", "status": "any", "limit": 100})
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["country"] == "LR"

    def test_country_invalid_empty(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"country": "ZZ", "status": "any"})
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_search_by_ref_and_receiver(self, admin, customer):
        booking = _mk_parcel_booking(customer)
        ref = booking["ref"]
        # search by full ref
        r = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                      params={"q": ref, "status": "any"})
        assert r.status_code == 200
        refs = [it["ref"] for it in r.json()["items"]]
        assert ref in refs, f"ref {ref} not found in search results {refs}"
        # search by partial ref
        r2 = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                       params={"q": ref[:6], "status": "any"})
        assert r2.status_code == 200
        assert any(it["ref"] == ref for it in r2.json()["items"])
        # search by receiver name
        r3 = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                       params={"q": "TEST Overview", "status": "any"})
        assert r3.status_code == 200
        assert any(it["ref"] == ref for it in r3.json()["items"])
        # search by phone
        r4 = admin.get(f"{BASE_URL}/api/admin/modules/express/bookings",
                       params={"q": "0100000000", "status": "any"})
        assert r4.status_code == 200
        assert any(it["ref"] == ref for it in r4.json()["items"])

    def test_unauth_bookings_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/modules/express/bookings")
        assert r.status_code == 401
