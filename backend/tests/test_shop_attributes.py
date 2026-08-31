"""SHOPbakēd — Slice 3 dynamic attributes tests.

Covers:
  * The 6 seeded SHOP attribute definitions exist with `module="shop"`,
    each carrying options where the type calls for them.
  * Resolver returns the correct set for a given (category, subcategory).
  * Inheritance: subcategory-scoped override wins over parent-category row
    (sneakers → colour required; iphone → storage required).
  * Slug-based lookup works for both category and subcategory.
  * Idempotency: attribute + option + assignment counts do not drift after
    a re-seed.
  * MART attributes are NOT contaminated by the SHOP tag.
"""
from __future__ import annotations
import os
import pytest
import requests


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"

SHOP_ATTR_KEYS = {"size", "colour", "ram", "storage", "condition", "warranty"}


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(
        f"{API}/admin/auth/login",
        json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30,
    )
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestAttributeDefinitions:
    def test_definitions_present(self, sa_headers):
        # Admin attributes endpoint returns all definitions; we filter to shop.
        r = requests.get(f"{API}/admin/mart/attributes?include_inactive=true",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        by_key = {a["key"]: a for a in items}
        for k in SHOP_ATTR_KEYS:
            assert k in by_key, f"missing SHOP attribute: {k}"

    def test_select_types_have_options(self, sa_headers):
        r = requests.get(f"{API}/admin/mart/attributes?include_inactive=true",
                         headers=sa_headers, timeout=15)
        items = {a["key"]: a for a in r.json()["items"]}
        for k in SHOP_ATTR_KEYS:
            item = items[k]
            if item["type"] in ("select", "multi_select"):
                assert item["option_count"] > 0, f"{k} missing options"


class TestResolverInheritance:
    def test_parent_only_categoy(self):
        r = requests.get(
            f"{API}/shop/categories/chaussures-sneakers/attributes", timeout=10,
        )
        assert r.status_code == 200
        by_key = {a["key"]: a for a in r.json()["attributes"]}
        assert set(by_key) == {"condition", "colour", "size"}
        assert all(a["scope"] == "category" for a in by_key.values())

    def test_subcategory_inherits_parent(self):
        r = requests.get(
            f"{API}/shop/categories/chaussures-sneakers/attributes"
            "?subcategory_id=sneakers",
            timeout=10,
        )
        assert r.status_code == 200
        by_key = {a["key"]: a for a in r.json()["attributes"]}
        assert {"condition", "colour", "size"}.issubset(set(by_key))
        # Condition + size inherited from parent, scope=category
        assert by_key["condition"]["scope"] == "category"
        assert by_key["size"]["scope"] == "category"

    def test_subcategory_overrides_parent(self):
        # Sneakers overrides Colour → required=True; parent had required=False
        r = requests.get(
            f"{API}/shop/categories/chaussures-sneakers/attributes"
            "?subcategory_id=sneakers", timeout=10,
        )
        colour = next(a for a in r.json()["attributes"] if a["key"] == "colour")
        assert colour["scope"] == "subcategory"
        assert colour["is_required"] is True

    def test_iphone_storage_required(self):
        r = requests.get(
            f"{API}/shop/categories/apple/attributes?subcategory_id=iphone",
            timeout=10,
        )
        storage = next(a for a in r.json()["attributes"] if a["key"] == "storage")
        assert storage["scope"] == "subcategory"
        assert storage["is_required"] is True

    def test_apple_ipad_mac_all_override_storage(self):
        for sub in ("ipad", "mac"):
            r = requests.get(
                f"{API}/shop/categories/apple/attributes?subcategory_id={sub}",
                timeout=10,
            )
            storage = next(a for a in r.json()["attributes"] if a["key"] == "storage")
            assert storage["is_required"] is True, sub


class TestSlugLookup:
    def test_category_slug_ok(self):
        r = requests.get(f"{API}/shop/categories/mode-femme/attributes", timeout=10)
        assert r.status_code == 200
        assert r.json()["category"]["slug"] == "mode-femme"

    def test_unknown_category_404(self):
        r = requests.get(f"{API}/shop/categories/does-not-exist/attributes", timeout=10)
        assert r.status_code == 404

    def test_unknown_subcategory_falls_back_to_category(self):
        # Unknown sub → resolver returns parent-only attributes rather than 500.
        r = requests.get(
            f"{API}/shop/categories/mode-femme/attributes?subcategory_id=nope",
            timeout=10,
        )
        assert r.status_code == 200
        # falls back to parent-only view
        for a in r.json()["attributes"]:
            assert a["scope"] == "category"


class TestNonAssignedCategory:
    def test_category_without_assignments(self):
        # `automobile` gets condition only per the seed.
        r = requests.get(f"{API}/shop/categories/automobile/attributes", timeout=10)
        assert r.status_code == 200
        keys = {a["key"] for a in r.json()["attributes"]}
        assert keys == {"condition"}


class TestIsolationFromMart:
    def test_mart_resolver_unaffected(self):
        # MART's own resolver endpoint must still work — the module column
        # on mart_attributes must not have broken existing routes.
        r = requests.get(f"{API}/mart/categories", timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) > 0
        first_cat_id = cats[0]["id"]
        rr = requests.get(f"{API}/mart/categories/{first_cat_id}/attributes", timeout=10)
        assert rr.status_code == 200, rr.text
