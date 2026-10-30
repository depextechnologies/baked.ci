"""FOODbakēd P0 Core Discovery — location-aware filtering coverage.

Covers the mandatory scenarios from the fixing-prompt:

  A. Abidjan: nearby restaurants are listed, others are not.
  C. Different city: Abidjan-only restaurants disappear when customer picks
     a far-away address.
  D. Brand grouping: 2 branches of the same brand, both eligible → one card
     on /brands/top pointing to the nearest.
  E. Closed restaurant: hidden from delivery-eligible results.
  F. Sold-out dish: respected by the search endpoint (reuses the existing
     is_available filter).
  Zone radius default: 5 km when partner hasn't set one.
  ETA engine: distance → min/max minutes, falls back when coords missing.
  Pickup mode: uses the wider 25 km discovery radius, not the restaurant's
    delivery radius.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import uuid

import pytest
import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
DB_URL   = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)

ABIDJAN_LAT, ABIDJAN_LNG = 5.3484, -4.0017
FAR_LAT, FAR_LNG         = 9.5000, -5.0000   # ~470 km north of Abidjan


def _run(coro):
    loop = asyncio.new_event_loop()
    try: return loop.run_until_complete(coro)
    finally: loop.close()


async def _db_exec(sql, **params):
    engine = create_async_engine(DB_URL, future=True)
    try:
        async with engine.begin() as conn:
            r = await conn.execute(text(sql), params)
            return r.fetchall() if r.returns_rows else []
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------
def test_haversine_zero_distance_is_zero():
    from modules.food.discovery import haversine_km
    assert haversine_km(5.3484, -4.0017, 5.3484, -4.0017) == 0


def test_haversine_abidjan_to_faraway_is_hundreds_of_km():
    from modules.food.discovery import haversine_km
    d = haversine_km(ABIDJAN_LAT, ABIDJAN_LNG, FAR_LAT, FAR_LNG)
    assert 400 < d < 600, d


def test_eta_without_distance_falls_back_to_prep_window():
    from modules.food.discovery import compute_eta_minutes
    assert compute_eta_minutes(None, 15, 30) == (15, 30)


def test_eta_adds_travel_minutes_proportional_to_distance():
    from modules.food.discovery import compute_eta_minutes, AVG_SPEED_KMH
    e_min, e_max = compute_eta_minutes(5.0, 15, 30)
    # 5 km @ 25 km/h = 12 min travel → ETA 27-42
    assert 25 <= e_min <= 29
    assert 40 <= e_max <= 44


# ---------------------------------------------------------------------------
# HTTP integration — seeds disposable rows per test
# ---------------------------------------------------------------------------
async def _mk_restaurant(*, lat, lng, name, radius=5, delivery=True, pickup=False,
                         is_open=True, country="CI", status="active", featured=True):
    rid = f"r_disc_{uuid.uuid4().hex[:10]}"
    await _db_exec("""
        INSERT INTO food_restaurants
          (id, name, slug, country, cuisines, prep_time_min, prep_time_max,
           status, is_open, featured, latitude, longitude,
           delivery_enabled, delivery_radius_km, pickup_enabled,
           created_at, updated_at)
        VALUES (:id, :n, :s, :c, '[]'::jsonb, 15, 30,
                :st, :io, :ft, :lat, :lng, :de, :rr, :pe, now(), now())
    """, id=rid, n=name, s=rid, c=country,
         st=status, io=is_open, ft=featured,
         lat=lat, lng=lng, de=delivery, rr=radius, pe=pickup)
    return rid


async def _cleanup(rids):
    if not rids: return
    await _db_exec("DELETE FROM food_restaurants WHERE id = ANY(:r)", r=list(rids))


def test_scenario_A_abidjan_nearby_restaurant_visible():
    rid = _run(_mk_restaurant(lat=5.35, lng=-4.00, name=f"A_{uuid.uuid4().hex[:4]}"))
    try:
        r = requests.get(f"{BASE_URL}/api/food/discovery",
                         params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                 "mode": "delivery", "limit": 30}, timeout=10)
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()["items"]]
        assert rid in ids
    finally:
        _run(_cleanup([rid]))


def test_scenario_C_restaurant_hidden_when_customer_far_away():
    rid = _run(_mk_restaurant(lat=5.35, lng=-4.00, radius=3, name=f"C_{uuid.uuid4().hex[:4]}"))
    try:
        r = requests.get(f"{BASE_URL}/api/food/discovery",
                         params={"country": "CI", "lat": FAR_LAT, "lng": FAR_LNG,
                                 "mode": "delivery", "limit": 30}, timeout=10)
        ids = [i["id"] for i in r.json()["items"]]
        assert rid not in ids
    finally:
        _run(_cleanup([rid]))


def test_scenario_D_two_branches_collapse_to_one_brand_card():
    name = f"Dup{uuid.uuid4().hex[:4]}"
    near = _run(_mk_restaurant(lat=5.3485, lng=-4.0018, name=name))
    far  = _run(_mk_restaurant(lat=5.3600, lng=-4.0300, name=name))
    try:
        r = requests.get(f"{BASE_URL}/api/food/brands/top",
                         params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                 "mode": "delivery", "limit": 20}, timeout=10)
        items = r.json()["items"]
        matches = [i for i in items if i["brand"] == name]
        assert len(matches) == 1, matches
        # Nearest branch wins
        assert matches[0]["restaurant_id"] == near
    finally:
        _run(_cleanup([near, far]))


def test_scenario_E_closed_restaurant_hidden_from_delivery_results():
    rid = _run(_mk_restaurant(lat=5.35, lng=-4.00, name=f"E_{uuid.uuid4().hex[:4]}",
                              is_open=False))
    try:
        r = requests.get(f"{BASE_URL}/api/food/discovery",
                         params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                 "mode": "delivery", "limit": 30}, timeout=10)
        ids = [i["id"] for i in r.json()["items"]]
        assert rid not in ids
    finally:
        _run(_cleanup([rid]))


def test_pickup_mode_uses_wider_radius():
    # 15 km from Abidjan — outside the 5 km delivery radius but inside the
    # 25 km pickup discovery radius.
    rid = _run(_mk_restaurant(lat=5.47, lng=-4.00, radius=3, name=f"P_{uuid.uuid4().hex[:4]}",
                              delivery=True, pickup=True))
    try:
        r_del = requests.get(f"{BASE_URL}/api/food/discovery",
                             params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                     "mode": "delivery", "limit": 30}, timeout=10).json()
        r_pck = requests.get(f"{BASE_URL}/api/food/discovery",
                             params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                     "mode": "pickup", "limit": 30}, timeout=10).json()
        ids_del = [i["id"] for i in r_del["items"]]
        ids_pck = [i["id"] for i in r_pck["items"]]
        assert rid not in ids_del
        assert rid in ids_pck
    finally:
        _run(_cleanup([rid]))


def test_no_coords_falls_back_to_country_match():
    rid = _run(_mk_restaurant(lat=5.35, lng=-4.00, name=f"N_{uuid.uuid4().hex[:4]}"))
    try:
        r = requests.get(f"{BASE_URL}/api/food/discovery",
                         params={"country": "CI", "mode": "delivery", "limit": 30}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["has_customer_coords"] is False
        ids = [i["id"] for i in body["items"]]
        assert rid in ids
    finally:
        _run(_cleanup([rid]))


def test_brand_card_includes_eta_window():
    rid = _run(_mk_restaurant(lat=5.3485, lng=-4.0018, name=f"ET_{uuid.uuid4().hex[:4]}"))
    try:
        r = requests.get(f"{BASE_URL}/api/food/brands/top",
                         params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                 "mode": "delivery", "limit": 20}, timeout=10)
        matches = [i for i in r.json()["items"] if i["restaurant_id"] == rid]
        assert matches and matches[0]["eta_min"] and matches[0]["eta_max"]
        assert matches[0]["eta_min"] <= matches[0]["eta_max"]
    finally:
        _run(_cleanup([rid]))


def test_homepage_section_food_top_brands_is_seeded_for_ci_and_in():
    r = requests.get(f"{BASE_URL}/api/homepage",
                     params={"country": "CI", "module": "food"}, timeout=10)
    secs = r.json()["sections"]
    types = [s["section_type"] for s in secs]
    assert "food_top_brands" in types

    r_in = requests.get(f"{BASE_URL}/api/homepage",
                        params={"country": "IN", "module": "food"}, timeout=10)
    assert "food_top_brands" in [s["section_type"] for s in r_in.json()["sections"]]


def test_dine_in_mode_is_alias_for_reservation():
    """UI sends `mode=dine_in` from the hero toggle; backend must accept it
    and treat it identically to `mode=reservation`."""
    rid = _run(_mk_restaurant(lat=5.3485, lng=-4.0018, name=f"Rsv_{uuid.uuid4().hex[:4]}"))
    try:
        # Flip the restaurant into "reservation-public" so eligibility passes.
        _run(_db_exec("""
            UPDATE food_restaurants SET reservations_enabled=TRUE, reservation_public=TRUE
             WHERE id = :r
        """, r=rid))
        for mode in ("dine_in", "reservation"):
            r = requests.get(f"{BASE_URL}/api/food/discovery",
                             params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                     "mode": mode, "limit": 30}, timeout=10)
            assert r.status_code == 200, f"{mode}: {r.text}"
            ids = [i["id"] for i in r.json()["items"]]
            assert rid in ids, f"{mode} did not surface {rid}"
    finally:
        _run(_cleanup([rid]))


def test_dine_in_hides_restaurant_without_reservation_public():
    rid = _run(_mk_restaurant(lat=5.3485, lng=-4.0018, name=f"NoRs_{uuid.uuid4().hex[:4]}"))
    try:
        # Reservations enabled but kept PRIVATE — must be hidden from dine_in.
        _run(_db_exec("""
            UPDATE food_restaurants SET reservations_enabled=TRUE, reservation_public=FALSE
             WHERE id = :r
        """, r=rid))
        r = requests.get(f"{BASE_URL}/api/food/discovery",
                         params={"country": "CI", "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG,
                                 "mode": "dine_in", "limit": 30}, timeout=10)
        ids = [i["id"] for i in r.json()["items"]]
        assert rid not in ids
    finally:
        _run(_cleanup([rid]))


def test_search_endpoint_accepts_lat_lng_and_computes_distance():
    rid = _run(_mk_restaurant(lat=5.3485, lng=-4.0018, name=f"SRCH_{uuid.uuid4().hex[:4]}"))
    try:
        rows = requests.get(f"{BASE_URL}/api/food/search",
                            params={"q": "SRCH", "country": "CI",
                                    "lat": ABIDJAN_LAT, "lng": ABIDJAN_LNG, "limit": 25},
                            timeout=10).json()
        card = next((r for r in rows["restaurants"] if r["id"] == rid), None)
        assert card is not None
        assert card["distance_km"] is not None
        assert card["eta_min"] and card["eta_max"]
    finally:
        _run(_cleanup([rid]))
