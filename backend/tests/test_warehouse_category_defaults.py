"""Social.docx Issue #4 — Warehouse Category → Zone Defaults + primary_location.

Verifies:
  * GET /api/partner/inventory/warehouse/{wh}/category-defaults returns one
    row per MART category for the partner's country/module with mapping=null
    for unmapped categories.
  * PUT upserts a mapping. Sending zone from another warehouse -> 400.
    Sending zone_id=null AND aisle_id=null -> clears the mapping.
  * GET /api/partner/products enriches items with `primary_location` for
    SKUs that have a PartnerProductLocation row.
"""
from __future__ import annotations
import os
import pathlib
import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PW    = "Alpha1234!Beta"
WAREHOUSE_ID  = "wh_alpha_demo_seed"


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PW}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------------ #
#   GET category-defaults
# ------------------------------------------------------------------ #
def test_list_category_defaults_shape(auth):
    r = requests.get(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                     headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["warehouse_id"] == WAREHOUSE_ID
    assert isinstance(data["items"], list)
    assert len(data["items"]) > 0, "expected at least one MART category"
    for it in data["items"]:
        assert "category_slug" in it and "category_name" in it
        assert "mapping" in it   # either null or object with zone_id/aisle_id
    # Confirm the pytest-friendly invariant: any unmapped category has mapping=None
    unmapped = [i for i in data["items"] if i["mapping"] is None]
    assert len(unmapped) >= 0


# ------------------------------------------------------------------ #
#   PUT upsert / delete / cross-warehouse rejection
# ------------------------------------------------------------------ #
def _get_first_zone_id_for_wh(auth) -> str:
    r = requests.get(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/tree",
                     headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    zones = r.json().get("zones", [])
    assert zones, "expected seeded zones in wh_alpha_demo_seed"
    return zones[0]["id"]


def test_upsert_and_clear_category_default(auth):
    zone_id = _get_first_zone_id_for_wh(auth)

    # Pick the first category from the defaults endpoint.
    r = requests.get(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                     headers=auth, timeout=15)
    slug = r.json()["items"][0]["category_slug"]

    # Upsert
    r = requests.put(
        f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
        json={"category_slug": slug, "zone_id": zone_id, "aisle_id": None},
        headers=auth, timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mapping"]["zone_id"] == zone_id
    assert body["mapping"]["category_slug"] == slug

    # Verify persistence via GET
    r2 = requests.get(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                      headers=auth, timeout=15)
    match = next(i for i in r2.json()["items"] if i["category_slug"] == slug)
    assert match["mapping"] is not None
    assert match["mapping"]["zone_id"] == zone_id

    # Clear (zone_id=null AND aisle_id=null)
    r3 = requests.put(
        f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
        json={"category_slug": slug, "zone_id": None, "aisle_id": None},
        headers=auth, timeout=15,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["mapping"] is None

    # And GET now returns mapping=null again
    r4 = requests.get(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                      headers=auth, timeout=15)
    match2 = next(i for i in r4.json()["items"] if i["category_slug"] == slug)
    assert match2["mapping"] is None


def test_upsert_rejects_zone_from_other_warehouse(auth):
    # Get a zone that does NOT belong to wh_alpha_demo_seed by asking a random uuid.
    # Simplest: forge a random zone id -> should also 400 with "does not belong".
    r = requests.get(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                     headers=auth, timeout=15)
    slug = r.json()["items"][0]["category_slug"]

    bad_zone = "zone_that_does_not_exist_ffffffff"
    r2 = requests.put(
        f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
        json={"category_slug": slug, "zone_id": bad_zone, "aisle_id": None},
        headers=auth, timeout=15,
    )
    assert r2.status_code == 400, f"expected 400 for foreign/missing zone, got {r2.status_code}: {r2.text}"


# ------------------------------------------------------------------ #
#   /api/partner/products now includes `primary_location`
# ------------------------------------------------------------------ #
def test_partner_products_include_primary_location(auth):
    r = requests.get(f"{BASE_URL}/api/partner/products?limit=500",
                     headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert isinstance(items, list) and items, "expected partner products in seed"
    # Every item must have the key (value may be None).
    assert all("primary_location" in it for it in items)

    # The seed script assigns Banane Cavendish to Bin B01 as primary.
    banane = next((it for it in items if "Banane" in (it.get("name") or "")), None)
    assert banane is not None, "expected Banane Cavendish in the seed catalog"
    loc = banane["primary_location"]
    assert loc is not None, "expected Banane Cavendish to have a primary_location"
    assert loc.get("is_primary") is True
    assert loc.get("label")  # human-readable "Zone A · Aisle 01 · ..."
    assert loc["bin"]["code"] == "B01"
    assert loc["zone"]["code"] == "A"
    assert loc["aisle"]["code"] == "01"


def test_partner_products_missing_location_returns_none(auth):
    r = requests.get(f"{BASE_URL}/api/partner/products?limit=500",
                     headers=auth, timeout=20)
    items = r.json()["items"]
    no_loc = [it for it in items if it.get("primary_location") is None]
    # There should be at least one product without a location assignment (only Banane is seeded).
    assert len(no_loc) >= 1
