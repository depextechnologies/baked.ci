"""
Backend tests for PostgreSQL migration validation & seed data integrity
(iteration_13 — Fixing_Prompt.docx pre-flight).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")

# Try to source public backend URL from frontend .env if env-var is missing.
if "BACKEND_URL" in os.environ:
    BASE_URL = os.environ["BACKEND_URL"].rstrip("/")

TIMEOUT = 20


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- HEALTH ----------
class TestHealth:
    def test_health_ok(self, s):
        r = s.get(f"{BASE_URL}/api/health", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok", body
        assert body.get("db") == "up", body


# ---------- SEED DATA ----------
class TestSeedData:
    def test_countries(self, s):
        r = s.get(f"{BASE_URL}/api/config/countries", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else data.get("countries") or data.get("items") or []
        assert len(rows) >= 2, f"expected >=2 countries, got {len(rows)}: {data}"
        codes = {c.get("code") or c.get("country_code") or c.get("iso2") for c in rows}
        assert {"CI", "LR"}.issubset(codes), f"missing CI/LR in {codes}"

    def test_express_vehicles_ci(self, s):
        r = s.get(f"{BASE_URL}/api/express/vehicles", params={"country": "CI"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data if isinstance(data, list) else data.get("vehicles") or data.get("items") or []
        assert len(rows) == 5, f"expected 5 vehicles for CI, got {len(rows)}"
        vtypes = {v.get("vehicle_type") or v.get("type") or v.get("code") for v in rows}
        expected = {"bike", "scooter", "three_wheeler", "mini_truck", "truck"}
        assert expected.issubset(vtypes), f"missing vehicle types. got={vtypes}"
        for v in rows:
            bp = v.get("base_price") or v.get("basePrice")
            eta_min = v.get("eta_min_min") or v.get("etaMinMin")
            eta_max = v.get("eta_min_max") or v.get("etaMinMax")
            assert isinstance(bp, (int, float)) and bp >= 0, f"bad base_price: {v}"
            assert isinstance(eta_min, (int, float)), f"bad eta_min_min: {v}"
            assert isinstance(eta_max, (int, float)), f"bad eta_min_max: {v}"

    def test_mart_categories(self, s):
        r = s.get(f"{BASE_URL}/api/mart/categories", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else data.get("categories") or data.get("items") or []
        # 9 per country default view; some backends may return all 18. Accept >=9.
        assert len(rows) >= 9, f"expected >=9 mart categories, got {len(rows)}"

    def test_mart_offers(self, s):
        # Note: review request said /api/mart/deals — actual backend route is /api/mart/offers
        r = s.get(f"{BASE_URL}/api/mart/offers", params={"country": "CI"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data if isinstance(data, list) else data.get("offers") or data.get("items") or []
        assert len(rows) >= 1, f"expected >=1 mart offer/deal, got {len(rows)}"

    def test_express_vehicles_lr(self, s):
        # No /api/express/services endpoint on backend — /express/services is a FRONTEND route.
        # Validate LR side of express seed instead.
        r = s.get(f"{BASE_URL}/api/express/vehicles", params={"country": "LR"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data if isinstance(data, list) else data.get("vehicles") or []
        assert len(rows) == 5, f"expected 5 LR vehicles, got {len(rows)}"


# ---------- SERVICEABILITY ----------
class TestServiceability:
    def test_serviceable_ci_abidjan(self, s):
        r = s.get(
            f"{BASE_URL}/api/addresses/serviceability",
            params={"lat": 5.360, "lng": -4.005, "country": "CI"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("serviceable") is True, b
        assert "distance_km" in b
        assert "nearest_hub" in b
        assert "radius_km" in b
        assert b.get("country") == "CI"
        assert "message" in b

    def test_unsupported_country_not_500(self, s):
        r = s.get(
            f"{BASE_URL}/api/addresses/serviceability",
            params={"lat": 5.36, "lng": -4.005, "country": "XX"},
            timeout=TIMEOUT,
        )
        # Must NOT be 500; expected 200 with serviceable:false OR 4xx client error
        assert r.status_code != 500, r.text
        if r.status_code == 200:
            b = r.json()
            assert b.get("serviceable") is False, b
            assert "message" in b

    def test_far_out_point_returns_false_not_500(self, s):
        r = s.get(
            f"{BASE_URL}/api/addresses/serviceability",
            params={"lat": 0, "lng": 0, "country": "CI"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("serviceable") is False, b


# ---------- DB ROW SANITY via seeded aggregate endpoints (best-effort) ----------
class TestRowCountsBestEffort:
    """These are inferred through public endpoints; exact counts checked when possible."""

    def test_countries_count_exact(self, s):
        r = s.get(f"{BASE_URL}/api/config/countries", timeout=TIMEOUT)
        data = r.json()
        rows = data if isinstance(data, list) else data.get("countries") or []
        assert len(rows) == 2, f"expected exactly 2 countries, got {len(rows)}"

    def test_express_vehicles_total(self, s):
        total = 0
        for c in ("CI", "LR"):
            r = s.get(f"{BASE_URL}/api/express/vehicles", params={"country": c}, timeout=TIMEOUT)
            assert r.status_code == 200
            d = r.json()
            rows = d if isinstance(d, list) else d.get("vehicles") or []
            total += len(rows)
        assert total == 10, f"expected 10 express_vehicles (5x2), got {total}"

    def test_mart_categories_total(self, s):
        total = 0
        for c in ("CI", "LR"):
            r = s.get(f"{BASE_URL}/api/mart/categories", params={"country": c}, timeout=TIMEOUT)
            assert r.status_code == 200
            d = r.json()
            rows = d if isinstance(d, list) else d.get("categories") or []
            total += len(rows)
        # Expected 18 (9 x 2). Accept exact.
        assert total == 18, f"expected 18 mart_categories, got {total}"
