"""BAKĒD v1.0 — Address management (serviceability, recent-searches, GB removal)
Tests for the new global address service + regression on customer addresses / mart currency.
"""
import os
import random
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


# ---------- helpers ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def authed(api):
    """Authenticate a fresh customer via dev OTP."""
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    j = r.json()
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"challenge_id": j["challenge_id"], "code": j["dev_code"]})
    assert v.status_code == 200, v.text
    token = v.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------- Config: countries (GB removed, CI+LR present) ----------
class TestCountryConfig:
    def test_countries_only_ci_and_lr(self, api):
        r = api.get(f"{BASE_URL}/api/config/countries")
        assert r.status_code == 200
        data = r.json()
        codes = sorted([c["code"] for c in data])
        assert codes == ["CI", "LR"], f"Expected only CI+LR, got {codes}"
        # No stray LBR alias
        assert "LBR" not in codes
        assert "GB" not in codes
        by_code = {c["code"]: c for c in data}
        assert by_code["CI"]["currency"] == "XOF"
        assert by_code["LR"]["currency"] == "LRD"
        assert by_code["LR"]["phone_code"] == "+231"
        assert by_code["LR"]["locale"] == "en-LR"


# ---------- Serviceability endpoint ----------
class TestServiceability:
    def test_ci_cocody_within_15km(self, api):
        r = api.get(f"{BASE_URL}/api/addresses/serviceability",
                    params={"lat": 5.36, "lng": -4.0, "country": "CI"})
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is True, data
        assert data["distance_km"] is not None
        assert data["distance_km"] <= 15.0
        assert data["nearest_hub"] is not None
        assert "Cocody" in data["nearest_hub"]["name"], f"Expected Cocody hub, got {data['nearest_hub']}"

    def test_ci_paris_out_of_range(self, api):
        r = api.get(f"{BASE_URL}/api/addresses/serviceability",
                    params={"lat": 48.85, "lng": 2.35, "country": "CI"})
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is False
        assert "not delivering" in data["message"].lower() or "expanding" in data["message"].lower()

    def test_lr_monrovia_serviceable(self, api):
        r = api.get(f"{BASE_URL}/api/addresses/serviceability",
                    params={"lat": 6.30, "lng": -10.80, "country": "LR"})
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is True, data
        assert data["nearest_hub"] is not None
        name = data["nearest_hub"]["name"]
        assert ("Sinkor" in name) or ("Congo Town" in name), f"Expected Sinkor or Congo Town, got {name}"

    def test_unknown_country_defaults_to_unserviceable(self, api):
        r = api.get(f"{BASE_URL}/api/addresses/serviceability",
                    params={"lat": 5.36, "lng": -4.0, "country": "ZZ"})
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is False


# ---------- Recent Searches (auth-gated CRUD) ----------
class TestRecentSearches:
    def test_recent_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/addresses/recent-searches")
        assert r.status_code in (401, 403)

    def test_add_get_dedupe_delete(self, authed):
        # Ensure fresh (delete any pre-existing entries from this session — none expected but safe)
        existing = authed.get(f"{BASE_URL}/api/addresses/recent-searches").json()
        for e in existing:
            authed.delete(f"{BASE_URL}/api/addresses/recent-searches/{e['id']}")

        # POST
        payload = {
            "formatted_address": "Cocody, Abidjan",
            "latitude": 5.36,
            "longitude": -4.0,
            "country": "CI",
            "place_id": "ChIJTestCocody",
        }
        p = authed.post(f"{BASE_URL}/api/addresses/recent-searches", json=payload)
        assert p.status_code == 200, p.text
        assert p.json().get("ok") is True

        # GET
        g = authed.get(f"{BASE_URL}/api/addresses/recent-searches")
        assert g.status_code == 200
        items = g.json()
        assert len(items) == 1
        assert items[0]["place_id"] == "ChIJTestCocody"
        assert items[0]["formatted_address"] == "Cocody, Abidjan"
        assert items[0]["country"] == "CI"

        # POST again with same place_id → dedupe
        p2 = authed.post(f"{BASE_URL}/api/addresses/recent-searches", json=payload)
        assert p2.status_code == 200
        g2 = authed.get(f"{BASE_URL}/api/addresses/recent-searches").json()
        assert len(g2) == 1, f"expected dedupe by place_id, got {len(g2)} entries"

        # DELETE
        rid = g2[0]["id"]
        d = authed.delete(f"{BASE_URL}/api/addresses/recent-searches/{rid}")
        assert d.status_code == 200
        g3 = authed.get(f"{BASE_URL}/api/addresses/recent-searches").json()
        assert len(g3) == 0


# ---------- Customer addresses accept new Places fields ----------
class TestCustomerAddressRichFields:
    def test_full_detail_address_round_trip(self, authed):
        payload = {
            "label": "Home",
            "line1": "Villa 12, Rue des Jardins",
            "city": "Abidjan",
            "country": "CI",
            "instructions": "Call at gate",
            "latitude": 5.36,
            "longitude": -4.0,
            "place_id": "ChIJPlaceIdCocody",
            "formatted_address": "Rue des Jardins, Cocody, Abidjan, Côte d'Ivoire",
            "region": "Lagunes",
            "postal_code": "00225",
        }
        r = authed.post(f"{BASE_URL}/api/customers/me/addresses", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["place_id"] == payload["place_id"]
        assert created["formatted_address"] == payload["formatted_address"]
        assert created["region"] == "Lagunes"
        assert created["postal_code"] == "00225"

        # GET verifies persistence
        g = authed.get(f"{BASE_URL}/api/customers/me/addresses")
        assert g.status_code == 200
        addrs = g.json()
        match = next((a for a in addrs if a.get("place_id") == payload["place_id"]), None)
        assert match is not None
        assert match["formatted_address"] == payload["formatted_address"]
        assert match["region"] == "Lagunes"
        assert match["postal_code"] == "00225"
        # No MongoDB leak
        assert "_id" not in match


# ---------- MART / LR products (no GB / GBP) ----------
class TestMartLR:
    def test_mart_products_lr_lrd(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products", params={"country": "LR"})
        assert r.status_code == 200
        products = r.json()
        assert len(products) == 12, f"Expected 12 LRD products, got {len(products)}"
        for p in products:
            assert p["currency"] == "LRD"
            assert p["currency"] != "GBP"

    def test_mart_categories_lr_no_gb(self, api):
        r = api.get(f"{BASE_URL}/api/mart/categories", params={"country": "LR"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        # No category should reference GBP/GB
        payload_str = str(data).upper()
        assert "GBP" not in payload_str
