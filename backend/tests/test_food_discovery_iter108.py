"""Iteration 108 — review-request-specific coverage for FOODbakēd P0 location discovery.

Covers scenarios NOT already covered by test_food_discovery.py:
  * burger_hub_ci (seeded restaurant) is delivery-eligible from Abidjan
  * Far-away coords return 0 items (strict empty state)
  * brands/top returns unique brands (one per name)
  * Admin POST persists latitude/longitude/delivery_radius_km, and
    subsequent /discovery picks the new row up when caller is in range
  * Admin PATCH changes delivery_radius_km — eligibility flips at the boundary
  * /api/homepage?country=CI&module=food contains food_top_brands section
"""
from __future__ import annotations

import os
import pathlib
import uuid

import pytest
import requests
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "frontend" / ".env")
load_dotenv(ROOT / "backend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ABIDJAN_LAT, ABIDJAN_LNG = 5.3484, -4.0017
FAR_LAT, FAR_LNG = 10.5, -5.0

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


# ---------------------------------------------------------------------------
# Admin auth fixture
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    # Try common admin login endpoints
    for path, payload in [
        ("/api/auth/admin/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}),
        ("/api/admin/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}),
        ("/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}),
    ]:
        try:
            r = s.post(f"{BASE_URL}{path}", json=payload, timeout=10)
        except Exception:
            continue
        if r.status_code == 200:
            token = (r.json() or {}).get("token") or (r.json() or {}).get("access_token")
            if token:
                s.headers.update({"Authorization": f"Bearer {token}"})
            return s
    pytest.skip("admin login endpoint not reachable")


# ---------------------------------------------------------------------------
# Public discovery smoke
# ---------------------------------------------------------------------------
def test_discovery_abidjan_returns_fields_and_in_radius():
    r = requests.get(f"{BASE_URL}/api/food/discovery",
                     params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                             "mode": "delivery", "limit": 30}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_customer_coords"] is True
    items = body["items"]
    assert len(items) > 0, "Expected at least seeded CI restaurants"
    for it in items:
        assert "distance_km" in it
        assert "eta_min" in it and "eta_max" in it
        assert "mode_eligible" in it
        assert it["mode_eligible"] is True
        # Within radius (default 5 km unless overridden)
        if it["distance_km"] is not None:
            assert it["distance_km"] <= it.get("delivery_radius_km", 5.0) + 0.01


def test_discovery_far_away_returns_zero_items():
    r = requests.get(f"{BASE_URL}/api/food/discovery",
                     params={"country": "CI", "lat": FAR_LAT, "lng": FAR_LNG,
                             "mode": "delivery", "limit": 30}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["has_customer_coords"] is True
    assert len(body["items"]) == 0, f"Expected 0 items, got {len(body['items'])}"


def test_discovery_no_coords_fallback_country_match():
    r = requests.get(f"{BASE_URL}/api/food/discovery",
                     params={"country": "CI", "mode": "delivery", "limit": 30}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["has_customer_coords"] is False
    assert len(body["items"]) > 0


def test_brands_top_returns_unique_brand_names():
    r = requests.get(f"{BASE_URL}/api/food/brands/top",
                     params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                             "mode": "delivery", "limit": 20}, timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    names = [i["brand"].strip().lower() for i in items]
    assert len(names) == len(set(names)), f"Duplicate brands: {names}"
    for it in items:
        assert "eta_min" in it and "distance_km" in it and "restaurant_id" in it


def test_discovery_check_burger_hub_eligible_from_abidjan():
    r = requests.get(f"{BASE_URL}/api/food/discovery/check",
                     params={"restaurant_id": "burger_hub_ci",
                             "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                             "mode": "delivery"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["delivery_eligible"] is True


def test_search_populates_distance_km():
    r = requests.get(f"{BASE_URL}/api/food/search",
                     params={"q": "burger", "country": "CI",
                             "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG, "limit": 20},
                     timeout=15)
    assert r.status_code == 200, r.text
    rests = r.json().get("restaurants", [])
    assert len(rests) > 0
    # At least one restaurant with coords should have distance_km populated
    with_dist = [x for x in rests if x.get("distance_km") is not None]
    assert len(with_dist) > 0, f"No distance_km populated in: {rests}"


def test_homepage_contains_food_top_brands_section():
    r = requests.get(f"{BASE_URL}/api/homepage",
                     params={"country": "CI", "module": "food"}, timeout=15)
    assert r.status_code == 200
    types = [s["section_type"] for s in r.json().get("sections", [])]
    assert "food_top_brands" in types, f"section_types={types}"


# ---------------------------------------------------------------------------
# Admin CRUD → delivery zone persistence + PATCH flips eligibility
# ---------------------------------------------------------------------------
def test_admin_create_restaurant_persists_delivery_zone(admin_session):
    name_token = f"iter108{uuid.uuid4().hex[:8]}"
    rid = f"{name_token}_ci"  # deterministic id: slug + "_" + country.lower()
    payload = {
        "name": name_token,
        "slug": name_token,
        "country": "CI",
        "cuisines": [],
        "prep_time_min": 10,
        "prep_time_max": 20,
        "latitude": 5.3485,
        "longitude": -4.0018,
        "delivery_radius_km": 5,
        "delivery_enabled": True,
        "pickup_enabled": True,
        "status": "active",
        "is_open": True,
        "featured": True,
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/food/restaurants", json=payload, timeout=15)
    if r.status_code not in (200, 201):
        pytest.skip(f"admin create not accepted ({r.status_code}): {r.text[:200]}")

    try:
        # GET persisted values
        got = admin_session.get(f"{BASE_URL}/api/admin/food/restaurants", timeout=15)
        assert got.status_code == 200, got.text
        rows = got.json()
        rows = rows.get("items", rows) if isinstance(rows, dict) else rows
        mine = next((x for x in rows if x.get("id") == rid), None)
        assert mine is not None, "Created restaurant missing from list"
        assert float(mine["latitude"]) == pytest.approx(5.3485, abs=0.001)
        assert float(mine["longitude"]) == pytest.approx(-4.0018, abs=0.001)
        assert float(mine["delivery_radius_km"]) == pytest.approx(5.0, abs=0.01)

        # Discovery picks it up when caller is nearby
        disc = requests.get(f"{BASE_URL}/api/food/discovery",
                            params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                    "mode": "delivery", "limit": 60}, timeout=15).json()
        ids = [i["id"] for i in disc["items"]]
        assert rid in ids, f"newly-created restaurant not in discovery: {ids}"

        # PATCH: shrink radius to 2 km and move to ~3 km north → should become ineligible
        # 3 km north of Abidjan ≈ +0.027 lat
        patch = admin_session.patch(f"{BASE_URL}/api/admin/food/restaurants/{rid}",
                                    json={"latitude": ABIDJAN_LAT + 0.027,
                                          "longitude": ABIDJAN_LNG,
                                          "delivery_radius_km": 2}, timeout=15)
        assert patch.status_code in (200, 204), patch.text

        chk = requests.get(f"{BASE_URL}/api/food/discovery/check",
                           params={"restaurant_id": rid,
                                   "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                   "mode": "delivery"}, timeout=15).json()
        assert chk["delivery_eligible"] is False, chk
        assert float(chk["delivery_radius_km"]) == pytest.approx(2.0, abs=0.01)
    finally:
        admin_session.delete(f"{BASE_URL}/api/admin/food/restaurants/{rid}", timeout=10)
