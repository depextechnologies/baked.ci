"""FOODbakēd — Search endpoint filters + location-aware eligibility.

Covers the P0 ask: `/api/food/search` must mirror the category Discovery
page semantics so the two experiences stay in lock-step.
"""
from __future__ import annotations

import os
import pathlib
import urllib.parse

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
# Abidjan centre, matches Burger Hub test fixture (within 15 km)
LAT, LNG = 5.3453, -4.0244


def _hit(q, **kw):
    params = {
        "q": q,
        "country": kw.pop("country", "CI"),
        "limit": kw.pop("limit", 24),
    }
    params.update({k: v for k, v in kw.items() if v is not None})
    url = f"{BASE_URL}/api/food/search?{urllib.parse.urlencode(params)}"
    r = requests.get(url, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Location-aware response shape
# ---------------------------------------------------------------------------
def test_search_with_coords_returns_eligibility_signals():
    d = _hit("burger", lat=LAT, lng=LNG, mode="delivery")
    assert d["has_customer_coords"] is True
    assert d["radius_km"] == 15.0
    assert d["restaurants"], "burger search should return at least one restaurant"
    sample = d["restaurants"][0]
    for key in (
        "delivery_eligible", "mode_eligible", "distance_km",
        "eta_min", "eta_max", "delivery_unavailable_reason",
    ):
        assert key in sample, f"missing eligibility field {key} on card"


def test_search_without_coords_falls_back_to_country():
    d = _hit("burger", mode="delivery")
    # Country fallback: cards still returned, but no distance info.
    assert d["has_customer_coords"] is False
    assert d["restaurants"], "country fallback should still match restaurants"
    assert all("distance_km" not in r or r["distance_km"] is None
               for r in d["restaurants"])


def test_search_pickup_mode_excludes_ineligible():
    """Pickup mode must drop venues that can't honour pickup for this address."""
    d = _hit("burger", lat=LAT, lng=LNG, mode="pickup")
    assert all(r.get("mode_eligible") for r in d["restaurants"])
    assert all(r.get("mode_eligible") for r in d["dishes"])


def test_search_delivery_mode_keeps_outside_zone_with_flag():
    """15 km discovery still shows deliverable candidates even when a given
    venue can't deliver — flagged with delivery_eligible=False so the UI
    can render the "Delivery unavailable" banner."""
    d = _hit("burger", lat=LAT, lng=LNG, mode="delivery")
    # At least one card should have an explicit eligibility flag (True or False).
    assert all("delivery_eligible" in r for r in d["restaurants"])


# ---------------------------------------------------------------------------
# Filter parity with /food/restaurants/discover
# ---------------------------------------------------------------------------
def test_search_filter_min_rating():
    d = _hit("burger", min_rating=4.5)
    assert d["restaurants"], "min_rating=4.5 should still match seeded venues"
    assert all(r["rating"] >= 4.5 for r in d["restaurants"])


def test_search_filter_sort_rating_desc():
    d = _hit("burger", sort="rating_desc")
    ratings = [r["rating"] for r in d["restaurants"]]
    assert ratings == sorted(ratings, reverse=True)


def test_search_filter_cuisine_narrows_results():
    d = _hit("burger", cuisines="burgers")
    assert d["restaurants"], "burgers cuisine filter should return at least one row"
    assert all("burgers" in (r["cuisines"] or []) for r in d["restaurants"])


def test_search_filter_max_price_narrows_dishes():
    d = _hit("burger", max_price=5000)
    assert d["dishes"], "max_price=5000 should keep most burger dishes"
    assert all(x["price"] <= 5000 for x in d["dishes"])


def test_search_filter_pure_veg_vegetarian():
    d = _hit("burger", vegetarian="pure_veg")
    # When pure_veg filter is on, every returned dish must be flagged is_veg.
    assert all(x["is_veg"] for x in d["dishes"])


def test_search_open_now_only_open_venues():
    d = _hit("burger", open_now=True)
    assert all(r["is_open"] for r in d["restaurants"])


# ---------------------------------------------------------------------------
# Dish bucket inherits eligibility & radius enforcement
# ---------------------------------------------------------------------------
def test_search_dish_bucket_carries_eligibility_when_coords_supplied():
    d = _hit("burger", lat=LAT, lng=LNG, mode="delivery")
    if d["dishes"]:
        sample = d["dishes"][0]
        assert "mode_eligible" in sample
        assert "delivery_eligible" in sample
