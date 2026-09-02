"""Category Auto-Suggest (Fixing_Prompt.docx v3 — 2026-02-28).

Tree endpoint enriches each Zone with `suggested_category_slug`, sourced from
`WarehouseCategoryDefault` for that (warehouse, zone). Frontend uses this to
pre-fill the Category picker when adding an Aisle.

Coverage:
  1. A Zone with NO default returns `suggested_category_slug: None`.
  2. Mapping a category default to a Zone → tree returns that slug on the Zone.
  3. Updating the default to another category → suggestion updates.
  4. Clearing the default (zone_id=null) → suggestion falls back to None.
  5. Two defaults pointing at the SAME zone → suggestion is None (ambiguous).
"""
from __future__ import annotations
import os, pathlib, uuid, pytest, requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PW    = "Alpha1234!Beta"
WAREHOUSE_ID  = "wh_alpha_demo_seed"

CAT_FV, CAT_DAIRY = "fruits-vegetables", "dairy-eggs"


def _short(): return uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def fresh_zone(auth):
    """Create a fresh Zone that carries no defaults so we can isolate the
    suggestion logic from any pre-existing wiring on shared seed zones."""
    sfx = _short()
    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes",
                      headers=auth,
                      json={"level": "zone", "parent_id": WAREHOUSE_ID,
                            "code": f"SG{sfx}", "name": f"Suggest Zone {sfx}"}, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _suggested_for_zone(auth, zone_id: str):
    r = requests.get(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/tree",
                     headers=auth, timeout=15)
    assert r.status_code == 200, r.text
    for z in r.json()["zones"]:
        if z["id"] == zone_id:
            return z.get("suggested_category_slug")
    raise AssertionError(f"zone {zone_id} not returned")


def _upsert_default(auth, category_slug, zone_id):
    r = requests.put(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                     headers=auth,
                     json={"category_slug": category_slug, "zone_id": zone_id},
                     timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


class TestZoneSuggestion:
    def test_no_default_returns_none(self, auth, fresh_zone):
        assert _suggested_for_zone(auth, fresh_zone) is None

    def test_mapping_default_surfaces_suggestion(self, auth, fresh_zone):
        _upsert_default(auth, CAT_FV, fresh_zone)
        assert _suggested_for_zone(auth, fresh_zone) == CAT_FV

    def test_remapping_updates_suggestion(self, auth, fresh_zone):
        _upsert_default(auth, CAT_FV, fresh_zone)
        assert _suggested_for_zone(auth, fresh_zone) == CAT_FV
        # Point the SAME category to a different zone (clears from this one).
        sfx = _short()
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes",
                          headers=auth,
                          json={"level": "zone", "parent_id": WAREHOUSE_ID,
                                "code": f"SGX{sfx}", "name": f"Other Zone {sfx}"}, timeout=15)
        assert r.status_code == 201
        other = r.json()["id"]
        _upsert_default(auth, CAT_FV, other)
        # Original zone should no longer have this suggestion.
        assert _suggested_for_zone(auth, fresh_zone) is None
        assert _suggested_for_zone(auth, other) == CAT_FV

    def test_clearing_default_removes_suggestion(self, auth, fresh_zone):
        _upsert_default(auth, CAT_DAIRY, fresh_zone)
        assert _suggested_for_zone(auth, fresh_zone) == CAT_DAIRY
        # Send zone_id=None to clear (per upsert_category_default semantics).
        r = requests.put(f"{BASE_URL}/api/partner/inventory/warehouse/{WAREHOUSE_ID}/category-defaults",
                         headers=auth,
                         json={"category_slug": CAT_DAIRY, "zone_id": None}, timeout=15)
        assert r.status_code == 200, r.text
        assert _suggested_for_zone(auth, fresh_zone) is None

    def test_ambiguous_multi_category_zone_returns_none(self, auth, fresh_zone):
        # Two different categories both defaulting to the same zone → we
        # deliberately return None (can't pick one) rather than an arbitrary
        # winner. This matches the docstring in routes.py:warehouse_tree.
        _upsert_default(auth, CAT_FV, fresh_zone)
        _upsert_default(auth, CAT_DAIRY, fresh_zone)
        assert _suggested_for_zone(auth, fresh_zone) is None
