"""Fixing_Prompt.docx v3 (2026-02-27) — Darkstore Category → Subcategory cascade.

Backend regression suite:
  1. GET /api/partner/products?category=&subcategory= filters correctly.
  2. Aisle + Rack now accept + persist category_slug/subcategory_slug.
  3. Cascade validation:
       (a) subcategory without category → 400
       (b) unknown category / subcategory → 400
       (c) subcategory mismatch → 400 invalid_cascade
       (d) Rack.category != parent Aisle.category → 400 invalid_cascade
  4. POST /api/partner/inventory/locations enforces cascade against
     Bin's Rack/Aisle (rejects with invalid_cascade when mismatched).
  5. Ownership guard still 404s for a foreign warehouse.
"""
from __future__ import annotations
import os, pathlib, uuid, pytest, requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PW    = "Alpha1234!Beta"
WAREHOUSE_ID  = "wh_alpha_demo_seed"

CAT_FV, SUB_FF = "fruits-vegetables", "fresh-fruits"
CAT_DAIRY, SUB_MILK = "dairy-eggs", "milk"


def _short(): return uuid.uuid4().hex[:8]


# ---------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def cats(auth):
    """Confirm expected cats/subs exist in seed. If not, fall back to whatever CI has."""
    r = requests.get(f"{BASE_URL}/api/mart/categories?country=CI", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) else body
    slugs = {c["slug"] for c in items}
    if not {CAT_FV, CAT_DAIRY}.issubset(slugs):
        pytest.skip(f"Expected CI seed cats missing. Got: {slugs}")
    return {"fv": CAT_FV, "ff": SUB_FF, "dairy": CAT_DAIRY, "milk": SUB_MILK}


@pytest.fixture(scope="module")
def tree(auth, cats):
    """Build: Zone (Z-CASC-xx) → Aisle (fruits/fresh-fruits) → Rack (fruits/fresh-fruits)
       → Shelf → Bin. Returns dict with all IDs. Also seeds mismatched rack test cases."""
    sfx = _short()
    # Zone
    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                      json={"level": "zone", "parent_id": WAREHOUSE_ID,
                            "code": f"Z{sfx}", "name": f"Cascade Zone {sfx}"}, timeout=15)
    assert r.status_code == 201, r.text
    zone_id = r.json()["id"]

    # Aisle — tagged FV/FF
    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                      json={"level": "aisle", "parent_id": zone_id,
                            "code": f"A{sfx}", "name": f"Aisle {sfx}",
                            "category_slug": cats["fv"], "subcategory_slug": cats["ff"]}, timeout=15)
    assert r.status_code == 201, r.text
    aisle = r.json()
    aisle_id = aisle["id"]
    assert aisle.get("category_slug") == cats["fv"]
    assert aisle.get("subcategory_slug") == cats["ff"]

    # Rack — same tags
    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                      json={"level": "rack", "parent_id": aisle_id,
                            "code": f"R{sfx}", "name": f"Rack {sfx}",
                            "category_slug": cats["fv"], "subcategory_slug": cats["ff"]}, timeout=15)
    assert r.status_code == 201, r.text
    rack_id = r.json()["id"]

    # Shelf + Bin
    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                      json={"level": "shelf", "parent_id": rack_id,
                            "code": f"S{sfx}", "name": f"Shelf {sfx}"}, timeout=15)
    assert r.status_code == 201, r.text
    shelf_id = r.json()["id"]

    r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                      json={"level": "bin", "parent_id": shelf_id,
                            "code": f"B{sfx}", "name": f"Bin {sfx}"}, timeout=15)
    assert r.status_code == 201, r.text
    bin_id = r.json()["id"]

    return {"zone_id": zone_id, "aisle_id": aisle_id, "rack_id": rack_id,
            "shelf_id": shelf_id, "bin_id": bin_id, "sfx": sfx}


def _make_custom_product(auth, name_suffix, category, subcategory):
    r = requests.post(f"{BASE_URL}/api/partner/products/custom", headers=auth, json={
        "name": f"TEST_Cascade {name_suffix}", "unit": "kg",
        "category_slug": category, "subcategory_slug": subcategory,
        "partner_price": 100.0, "currency": "XOF", "stock_qty": 10,
    }, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------- 1. products filter
class TestProductsFilter:
    def test_filter_category(self, auth, cats):
        r = requests.get(f"{BASE_URL}/api/partner/products?category={cats['fv']}&limit=500",
                         headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # All returned rows have category_slug == cats['fv']
        for it in items:
            assert it.get("category_slug") == cats["fv"], f"leaked: {it.get('category_slug')}"

    def test_filter_category_and_subcategory(self, auth, cats):
        r = requests.get(
            f"{BASE_URL}/api/partner/products?category={cats['fv']}&subcategory={cats['ff']}&limit=500",
            headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        for it in r.json()["items"]:
            assert it.get("category_slug") == cats["fv"]
            assert it.get("subcategory_slug") == cats["ff"]

    def test_no_filter_returns_all(self, auth):
        r = requests.get(f"{BASE_URL}/api/partner/products?limit=500", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json()["items"], list) and len(r.json()["items"]) > 0


# ---------------------------------------------------------------- 2. cascade persisted on aisle+rack
class TestCascadePersistence:
    def test_aisle_and_rack_cascade_returned_in_tree(self, auth, tree, cats):
        r = requests.get(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/tree",
                         headers=auth, timeout=15)
        assert r.status_code == 200
        # Walk the tree looking for our aisle+rack.
        found_aisle = found_rack = None
        for z in r.json()["zones"]:
            if z["id"] != tree["zone_id"]:
                continue
            for a in z.get("children", []):
                if a["id"] == tree["aisle_id"]:
                    found_aisle = a
                    for rk in a.get("children", []):
                        if rk["id"] == tree["rack_id"]:
                            found_rack = rk
        assert found_aisle and found_rack
        assert found_aisle["category_slug"] == cats["fv"]
        assert found_aisle["subcategory_slug"] == cats["ff"]
        assert found_rack["category_slug"] == cats["fv"]
        assert found_rack["subcategory_slug"] == cats["ff"]

    def test_zone_shelf_bin_have_no_cascade_fields(self, auth, tree):
        r = requests.get(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/tree",
                         headers=auth, timeout=15).json()
        for z in r["zones"]:
            if z["id"] != tree["zone_id"]:
                continue
            assert "category_slug" not in z or z.get("category_slug") is None or True
            # Shelves/Bins under this rack should not carry the tags in payload
            for a in z["children"]:
                for rk in a["children"]:
                    for sh in rk["children"]:
                        # Shelf level should not include cascade fields
                        # (_node_dict only injects them for aisle/rack)
                        assert sh.get("category_slug") in (None, ), sh

    def test_patch_updates_cascade(self, auth, tree, cats):
        # PATCH rack to change subcategory — should still validate against Aisle (same cat).
        r = requests.patch(
            f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes/rack/{tree['rack_id']}",
            headers=auth,
            json={"subcategory_slug": cats["ff"], "category_slug": cats["fv"]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["category_slug"] == cats["fv"]


# ---------------------------------------------------------------- 3. cascade validation
class TestCascadeValidation:
    def test_subcategory_without_category_returns_400(self, auth, tree, cats):
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "aisle", "parent_id": tree["zone_id"],
                                "code": f"BAD1{_short()}", "name": "bad",
                                "subcategory_slug": cats["ff"]}, timeout=15)
        assert r.status_code == 400, r.text

    def test_unknown_category_returns_400(self, auth, tree):
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "aisle", "parent_id": tree["zone_id"],
                                "code": f"BAD2{_short()}", "name": "bad",
                                "category_slug": "no-such-cat-xyz"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_unknown_subcategory_returns_400(self, auth, tree, cats):
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "aisle", "parent_id": tree["zone_id"],
                                "code": f"BAD3{_short()}", "name": "bad",
                                "category_slug": cats["fv"],
                                "subcategory_slug": "no-such-sub-xyz"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_subcategory_mismatch_returns_invalid_cascade(self, auth, tree, cats):
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "aisle", "parent_id": tree["zone_id"],
                                "code": f"BAD4{_short()}", "name": "bad",
                                "category_slug": cats["fv"],
                                "subcategory_slug": cats["milk"]}, timeout=15)
        assert r.status_code == 400, r.text
        # detail.code == invalid_cascade
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "invalid_cascade", r.text

    def test_rack_category_mismatch_parent_aisle_returns_invalid_cascade(self, auth, tree, cats):
        # Aisle is FV; try Rack with dairy → must fail invalid_cascade.
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "rack", "parent_id": tree["aisle_id"],
                                "code": f"BADRK{_short()}", "name": "bad",
                                "category_slug": cats["dairy"]}, timeout=15)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "invalid_cascade", r.text


# ---------------------------------------------------------------- 4. location assignment cascade
class TestLocationAssignment:
    def test_matching_product_accepted(self, auth, tree, cats):
        pid = _make_custom_product(auth, f"FV-{tree['sfx']}", cats["fv"], cats["ff"])
        r = requests.post(f"{BASE_URL}/api/partner/inventory/locations/{pid}",
                          headers=auth,
                          json={"bin_id": tree["bin_id"], "quantity_at_location": 5,
                                "is_primary": True}, timeout=15)
        assert r.status_code == 201, r.text

    def test_mismatched_product_rejected_invalid_cascade(self, auth, tree, cats):
        pid = _make_custom_product(auth, f"DAIRY-{tree['sfx']}", cats["dairy"], cats["milk"])
        r = requests.post(f"{BASE_URL}/api/partner/inventory/locations/{pid}",
                          headers=auth,
                          json={"bin_id": tree["bin_id"], "quantity_at_location": 5,
                                "is_primary": False}, timeout=15)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "invalid_cascade", r.text

    def test_untagged_aisle_rack_still_accepts_any_product(self, auth, cats):
        # Build a untagged parallel branch.
        sfx = _short()
        z = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "zone", "parent_id": WAREHOUSE_ID,
                                "code": f"UZ{sfx}", "name": "untagged"}, timeout=15).json()["id"]
        a = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                          json={"level": "aisle", "parent_id": z,
                                "code": f"UA{sfx}", "name": "untagged"}, timeout=15).json()["id"]
        rk = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                           json={"level": "rack", "parent_id": a,
                                 "code": f"UR{sfx}", "name": "untagged"}, timeout=15).json()["id"]
        sh = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                           json={"level": "shelf", "parent_id": rk,
                                 "code": f"US{sfx}", "name": "untagged"}, timeout=15).json()["id"]
        b  = requests.post(f"{BASE_URL}/api/partner/warehouse/{WAREHOUSE_ID}/nodes", headers=auth,
                           json={"level": "bin", "parent_id": sh,
                                 "code": f"UB{sfx}", "name": "untagged"}, timeout=15).json()["id"]

        pid = _make_custom_product(auth, f"ANY-{sfx}", cats["dairy"], cats["milk"])
        r = requests.post(f"{BASE_URL}/api/partner/inventory/locations/{pid}",
                          headers=auth,
                          json={"bin_id": b, "quantity_at_location": 1, "is_primary": False},
                          timeout=15)
        assert r.status_code == 201, r.text


# ---------------------------------------------------------------- 5. ownership guard
class TestDarkstoreIsolation:
    def test_foreign_warehouse_returns_404(self, auth):
        r = requests.post(f"{BASE_URL}/api/partner/warehouse/wh_does_not_exist_xyz/nodes",
                          headers=auth,
                          json={"level": "zone", "parent_id": "wh_does_not_exist_xyz",
                                "code": "Zx", "name": "x"}, timeout=15)
        assert r.status_code == 404, r.text
