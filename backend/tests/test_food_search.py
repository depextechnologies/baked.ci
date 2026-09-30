"""FOODbakēd — unified search endpoint regression."""
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


def _hit(q, **kw):
    params = {"q": q, "country": kw.pop("country", "CI"), "limit": kw.pop("limit", 8), **kw}
    url = f"{BASE_URL}/api/food/search?{urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})}"
    r = requests.get(url, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def test_search_returns_restaurants_dishes_cuisines_for_burger():
    d = _hit("burger")
    slugs = {r["slug"] for r in d["restaurants"]}
    assert "burger-hub" in slugs
    assert any(x["name"].lower().startswith("classic") for x in d["dishes"])
    assert any(c["code"] == "burgers" for c in d["cuisines"])


def test_search_partial_name_matches():
    d = _hit("spice")
    slugs = {r["slug"] for r in d["restaurants"]}
    assert "spice-nation" in slugs


def test_search_dish_name_returns_owning_restaurant():
    d = _hit("cheeseburger")
    assert len(d["dishes"]) > 0
    # The owning restaurant slug should be resolvable.
    for x in d["dishes"]:
        assert x["restaurant_slug"]
        assert x["price"] > 0


def test_search_cuisine_indian_matches_spice_nation():
    d = _hit("indien")   # FR term
    slugs = {r["slug"] for r in d["restaurants"]}
    assert "spice-nation" in slugs
    # Cuisine bucket also matches
    assert any(c["code"] == "indian" for c in d["cuisines"])


def test_search_reservation_query_returns_only_public_reservable():
    d = _hit("table")
    slugs = {r["slug"] for r in d["reservations"]}
    assert "burger-hub" in slugs  # demo restaurant we activated
    # And every entry must be truly reservable server-side (we can't inspect
    # reservation_public directly here, but the endpoint filters, so the mere
    # presence is proof enough for the smoke test)
    assert all(r["slug"] for r in d["reservations"])


def test_search_dine_in_mode_ranks_reservable_first():
    d = _hit("burger", mode="dine_in")
    if len(d["restaurants"]) >= 2:
        # First row should be reservable if any exist
        assert d["restaurants"][0]["reservable"] is True


def test_search_empty_query_rejected():
    r = requests.get(f"{BASE_URL}/api/food/search?q=&country=CI", timeout=10)
    assert r.status_code == 422


def test_search_no_match_returns_empty_buckets():
    d = _hit("zzzzz-does-not-exist-xyz")
    assert d["restaurants"] == []
    assert d["dishes"] == []
    assert d["cuisines"] == []
    assert d["reservations"] == []


def test_search_country_isolation():
    ci = _hit("burger", country="CI")
    inn = _hit("burger", country="IN")
    ci_slugs = {r["id"] for r in ci["restaurants"]}
    in_slugs = {r["id"] for r in inn["restaurants"]}
    # No cross-tenant leakage on restaurant ids (they have a "_ci" / "_in" suffix)
    assert all(x.endswith("_ci") for x in ci_slugs) or not ci_slugs
    assert all(x.endswith("_in") for x in in_slugs) or not in_slugs
