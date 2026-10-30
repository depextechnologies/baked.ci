"""Iteration 109 — FOODbakēd Pickup/Dine-in hero toggle backend coverage.

Validates the three canonical modes against the CI seed:
  * dine_in alias is accepted (no 422) and canonicalises to reservation
  * dine_in restaurants are only those with reservations_enabled AND reservation_public
  * pickup brands/top filters by pickup_enabled
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ABIDJAN = {"lat": 5.3484, "lng": -4.0017}


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- /api/food/home ----------
class TestFoodHomeModes:
    def test_home_delivery_ci(self, client):
        r = client.get(f"{BASE_URL}/api/food/home", params={"country": "CI", "mode": "delivery", **ABIDJAN})
        assert r.status_code == 200
        data = r.json()
        assert "featured_restaurants" in data
        assert data["has_customer_coords"] is True

    def test_home_dine_in_no_422(self, client):
        """dine_in alias must be accepted by the pattern validator."""
        r = client.get(f"{BASE_URL}/api/food/home", params={"country": "CI", "mode": "dine_in", **ABIDJAN})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        # Every featured restaurant in dine_in must be reservation-eligible
        for item in data["featured_restaurants"]:
            assert item["reservation_eligible"] is True, f"Non-reservation restaurant leaked: {item['id']}"

    def test_home_pickup(self, client):
        r = client.get(f"{BASE_URL}/api/food/home", params={"country": "CI", "mode": "pickup", **ABIDJAN})
        assert r.status_code == 200
        for item in r.json()["featured_restaurants"]:
            assert item["pickup_eligible"] is True


# ---------- /api/food/discovery ----------
class TestDiscoveryModes:
    def test_dine_in_equals_reservation(self, client):
        """dine_in is a canonical alias for reservation — same restaurant IDs."""
        p = {"country": "CI", **ABIDJAN}
        r1 = client.get(f"{BASE_URL}/api/food/discovery", params={**p, "mode": "dine_in"})
        r2 = client.get(f"{BASE_URL}/api/food/discovery", params={**p, "mode": "reservation"})
        assert r1.status_code == 200 and r2.status_code == 200
        ids1 = sorted(i["id"] for i in r1.json()["items"])
        ids2 = sorted(i["id"] for i in r2.json()["items"])
        assert ids1 == ids2

    def test_dine_in_items_have_reservation_eligible(self, client):
        r = client.get(f"{BASE_URL}/api/food/discovery", params={"country": "CI", "mode": "dine_in", **ABIDJAN})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        for it in items:
            assert it["reservation_eligible"] is True

    def test_pickup_only_pickup_enabled(self, client):
        r = client.get(f"{BASE_URL}/api/food/discovery", params={"country": "CI", "mode": "pickup", **ABIDJAN})
        assert r.status_code == 200
        items = r.json()["items"]
        for it in items:
            assert it["pickup_eligible"] is True
            assert it["pickup_enabled"] is True


# ---------- /api/food/brands/top ----------
class TestBrandsTopModes:
    def test_brands_pickup(self, client):
        r = client.get(f"{BASE_URL}/api/food/brands/top", params={"country": "CI", "mode": "pickup", **ABIDJAN})
        assert r.status_code == 200
        for b in r.json()["items"]:
            assert b["mode_eligible"] is True

    def test_brands_dine_in(self, client):
        r = client.get(f"{BASE_URL}/api/food/brands/top", params={"country": "CI", "mode": "dine_in", **ABIDJAN})
        assert r.status_code == 200
        # Should return >=1 brand (seed: Burger Hub + Sushi Central + Le Gourmet)
        assert len(r.json()["items"]) >= 1

    def test_brands_counts_differ_between_modes(self, client):
        """Pickup and dine_in should expose different brand sets per seed data."""
        p = {"country": "CI", **ABIDJAN}
        pickup = client.get(f"{BASE_URL}/api/food/brands/top", params={**p, "mode": "pickup"}).json()["items"]
        dinein = client.get(f"{BASE_URL}/api/food/brands/top", params={**p, "mode": "dine_in"}).json()["items"]
        pickup_ids = {b["restaurant_id"] for b in pickup}
        dinein_ids = {b["restaurant_id"] for b in dinein}
        # They should not be identical sets (different filter semantics)
        assert pickup_ids != dinein_ids or len(pickup_ids) == 0
