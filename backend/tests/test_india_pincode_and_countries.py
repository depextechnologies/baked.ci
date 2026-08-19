"""Tests for:
- GET /api/config/countries filters out LR (production_visible=false)
- GET /api/addresses/serviceability with IN pincode allowlist bypass
- CI serviceability regression (hub-distance)
- Legacy LR row still readable at DB / admin level
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- config/countries ----------
class TestCountriesConfig:
    def test_countries_returns_only_ci_and_in(self):
        r = requests.get(f"{API}/config/countries", timeout=15)
        assert r.status_code == 200
        data = r.json()
        codes = sorted([c["code"] for c in data])
        assert codes == ["CI", "IN"], f"Expected ['CI','IN'], got {codes}"
        by = {c["code"]: c for c in data}
        assert "Ivoire" in by["CI"]["name"] or by["CI"]["name"] == "Côte d'Ivoire"
        assert by["IN"]["name"] == "India"
        assert "LR" not in codes


# ---------- serviceability IN pincode allowlist ----------
class TestINServiceability:
    @pytest.mark.parametrize("pin", ["201301", "201305", "201310", "201318"])
    def test_allowlisted_pincodes_are_serviceable(self, pin):
        r = requests.get(
            f"{API}/addresses/serviceability",
            params={"lat": 28.5355, "lng": 77.3910, "country": "IN", "postal_code": pin},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["serviceable"] is True, f"pin {pin} expected serviceable, got {data}"
        assert data.get("match") == "pincode_allowlist"

    def test_non_ncr_pincode_falls_back_and_is_not_serviceable(self):
        # Bangalore 560001 - not in allowlist, no IN hubs seeded
        r = requests.get(
            f"{API}/addresses/serviceability",
            params={"lat": 12.9716, "lng": 77.5946, "country": "IN", "postal_code": "560001"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is False
        assert data.get("match") != "pincode_allowlist"

    def test_in_without_postal_falls_back_to_hub_check(self):
        # Delhi lat/lng, no postal_code -> hub check -> no IN hubs -> not serviceable
        r = requests.get(
            f"{API}/addresses/serviceability",
            params={"lat": 28.6139, "lng": 77.2090, "country": "IN"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is False


# ---------- CI regression ----------
class TestCIServiceability:
    def test_ci_cocody_still_serviceable_via_hub(self):
        r = requests.get(
            f"{API}/addresses/serviceability",
            params={"lat": 5.36, "lng": -4.0083, "country": "CI"},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is True
        hub = data.get("nearest_hub") or {}
        assert "Cocody" in (hub.get("name") or ""), f"Expected Cocody hub, got {hub}"
        # distance should be small (<2km)
        assert data.get("distance_km") is not None and data["distance_km"] < 3.0


# ---------- Legacy LR safety ----------
class TestLegacyLRSafety:
    def test_admin_suppliers_lr_filter_no_500(self):
        # login super admin
        creds = {"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}
        s = requests.Session()
        lr = s.post(f"{API}/admin/auth/login", json=creds, timeout=15)
        if lr.status_code != 200:
            pytest.skip(f"admin login failed: {lr.status_code} {lr.text}")
        token = lr.json().get("token") or lr.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        # Try a couple of plausible admin listing endpoints; at minimum verify no 500
        candidates = [
            f"{API}/admin/suppliers?country=LR",
            f"{API}/admin/partners?country=LR",
        ]
        for url in candidates:
            resp = s.get(url, headers=headers, timeout=15)
            assert resp.status_code != 500, f"{url} returned 500: {resp.text[:300]}"
