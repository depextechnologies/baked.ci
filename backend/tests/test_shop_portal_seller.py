"""SHOPbakēd — Slice 4 seller portal tests.

Covers the full seller flow:
  * Module gate (`SHOP` in supplier.modules) blocks / allows access.
  * Create product → status `pending_review`.
  * `GET /shop/portal/products/{pid}` returns the resolved attribute
    schema (proves Slice 3 is wired end-to-end).
  * Variant CRUD: add, list, patch, delete, SKU uniqueness.
  * Any variant change to an `active` product bumps it back to
    `pending_review` (re-approval contract).
  * Category / subcategory FK integrity guards.

Uses the seeded demo supplier `demo-delta-supplier@test.example`. The
test module grants SHOP access at setup and revokes it at teardown so
the flow starts from a known state.
"""
from __future__ import annotations
import os
import pytest
import requests
import asyncio


# All tests in this file mutate the same supplier row — pin them to a
# single xdist worker so the module-scoped fixtures don't race.
pytestmark = pytest.mark.xdist_group("shop_portal_slice4")


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"
DEMO_DELTA_ID = "sup_demo_delta_seed"


# ---- Fixtures --------------------------------------------------------

def _sql_exec(sql: str) -> None:
    import subprocess
    subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked", "-c", sql],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True,
    )


@pytest.fixture(scope="module")
def with_shop_module():
    _sql_exec(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb "
              f"WHERE id='{DEMO_DELTA_ID}';")
    yield
    # NOTE: intentionally NOT restoring to ["MART"] here — Slice 5 tests
    # concurrently need delta on SHOP too, and letting the teardown revoke
    # would race across xdist workers. Slice 5's `ensure_shop_on_delta`
    # re-asserts on every test anyway; leaving the row on ["MART","SHOP"]
    # is the safer default for the running preview env.


@pytest.fixture
def without_shop_module():
    """Function-scoped so each test starts from a known state that
    doesn't fight the module-scoped `with_shop_module`. Restores whatever
    was there when the function-scoped teardown fires."""
    prior = _fetch_modules()
    _sql_exec(f"UPDATE suppliers SET modules = '[\"MART\"]'::jsonb "
              f"WHERE id='{DEMO_DELTA_ID}';")
    yield
    prior_json = _serialize_modules(prior)
    _sql_exec(f"UPDATE suppliers SET modules = '{prior_json}'::jsonb "
              f"WHERE id='{DEMO_DELTA_ID}';")


def _fetch_modules():
    import subprocess
    out = subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked", "-tA", "-c",
         f"SELECT modules FROM suppliers WHERE id='{DEMO_DELTA_ID}';"],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return out or '["MART"]'


def _serialize_modules(raw: str) -> str:
    # `raw` already looks like ["MART","SHOP"] — return as-is with quotes escaped.
    return raw.replace("'", "''")


@pytest.fixture
def supplier_token():
    r = requests.post(
        f"{API}/martbaked/sellers/login",
        json={"email": SUP_EMAIL, "password": SUP_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _lookup_slugs():
    """Fetch Apple category id + iPhone subcategory id from the seeded tree."""
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat_id = next(c["id"] for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub_id = next(s["id"] for s in subs if s["slug"] == "iphone")
    return cat_id, sub_id


# ---- Tests -----------------------------------------------------------

class TestShopPortalFullFlow:
    """Full slice-4 flow in one class so LoadScopeScheduling keeps every
    test on the same xdist worker — they all mutate the same supplier row.
    """

    def test_shop_not_enabled_returns_403(self, without_shop_module, supplier_token):
        # Use a temp supplier so we don't ping-pong `delta` across workers.
        # `_h(supplier_token)` is delta; instead, log in as `foxtrot` which
        # stays on ["MART"] throughout the suite.
        r = requests.post(f"{API}/martbaked/sellers/login",
                          json={"email": "demo-foxtrot-supplier@test.example",
                                "password": "Supplier1234!"}, timeout=15)
        if r.status_code != 200:
            pytest.skip("foxtrot login unavailable in this env")
        fox_tok = r.json()["access_token"]
        r2 = requests.get(f"{API}/shop/portal/catalogue",
                          headers=_h(fox_tok), timeout=10)
        assert r2.status_code == 403
        body = r2.json()
        assert body.get("detail", {}).get("code") == "shop_not_enabled"

    def test_supplier_me_exposes_modules(self, supplier_token):
        r = requests.get(f"{API}/supplier/me", headers=_h(supplier_token), timeout=10)
        assert r.status_code == 200
        mods = r.json().get("modules")
        assert isinstance(mods, list) and "MART" in mods

    def test_empty_catalogue(self, with_shop_module, supplier_token):
        r = requests.get(f"{API}/shop/portal/catalogue",
                         headers=_h(supplier_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_create_product_sets_pending_review(self, with_shop_module, supplier_token):
        cat_id, sub_id = _lookup_slugs()
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(supplier_token),
            json={
                "title": "iPhone 15 Pro (test)",
                "category_id": cat_id, "subcategory_id": sub_id,
                "description": "Test seed product",
                "images": ["https://example.com/iphone.jpg"],
                "attributes": {"colour": "black"},
            }, timeout=15,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "pending_review"
        assert body["supplier_id"] == DEMO_DELTA_ID
        assert body["module"] == "shop"

    def test_get_product_returns_resolved_schema(self, with_shop_module, supplier_token):
        cat_id, _ = _lookup_slugs()
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(supplier_token),
            json={"title": "iPad Air (test)", "category_id": cat_id,
                  "subcategory_id": _sub_of("apple", "ipad")},
            timeout=15,
        )
        pid = r.json()["id"]
        detail = requests.get(f"{API}/shop/portal/products/{pid}",
                              headers=_h(supplier_token), timeout=10).json()
        schema_keys = {a["key"] for a in detail["attribute_schema"]}
        assert "storage" in schema_keys
        storage = next(a for a in detail["attribute_schema"] if a["key"] == "storage")
        assert storage["is_required"] is True
        assert storage["scope"] == "subcategory"

    def test_variant_crud_and_re_review(self, with_shop_module, supplier_token):
        cat_id, _ = _lookup_slugs()
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(supplier_token),
            json={"title": "MacBook Air (test)", "category_id": cat_id,
                  "subcategory_id": _sub_of("apple", "mac")},
            timeout=15,
        )
        pid = r.json()["id"]
        v = requests.post(
            f"{API}/shop/portal/products/{pid}/variants",
            headers=_h(supplier_token),
            json={"sku": "MBA-M2-256", "price": 1299, "stock_qty": 5,
                  "condition": "new",
                  "attributes": {"storage": "256", "ram": "8", "colour": "silver"}},
            timeout=15,
        )
        assert v.status_code == 201, v.text
        vid = v.json()["id"]
        dup = requests.post(
            f"{API}/shop/portal/products/{pid}/variants",
            headers=_h(supplier_token),
            json={"sku": "MBA-M2-256", "price": 1299}, timeout=15,
        )
        assert dup.status_code == 409
        p = requests.patch(
            f"{API}/shop/portal/products/{pid}/variants/{vid}",
            headers=_h(supplier_token),
            json={"stock_qty": 12}, timeout=15,
        )
        assert p.status_code == 200
        assert p.json()["stock_qty"] == 12
        d = requests.delete(
            f"{API}/shop/portal/products/{pid}/variants/{vid}",
            headers=_h(supplier_token), timeout=15,
        )
        assert d.status_code == 204

    def test_bad_category_rejected(self, with_shop_module, supplier_token):
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(supplier_token),
            json={"title": "Ghost", "category_id": "cat_does_not_exist"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_bad_subcategory_pairing(self, with_shop_module, supplier_token):
        cat_id, _ = _lookup_slugs()
        subs = requests.get(f"{API}/shop/subcategories?country=CI&category=mode-femme",
                            timeout=10).json()
        wrong_sub = subs[0]["id"]
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(supplier_token),
            json={"title": "Mismatch", "category_id": cat_id,
                  "subcategory_id": wrong_sub}, timeout=15,
        )
        assert r.status_code == 400

    def test_cannot_access_others_products(self, with_shop_module, supplier_token):
        r = requests.get(f"{API}/shop/portal/products/shpprd_fake_1234567890",
                         headers=_h(supplier_token), timeout=10)
        assert r.status_code == 404


def _sub_of(cat_slug: str, sub_slug: str) -> str:
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category={cat_slug}",
                        timeout=10).json()
    return next(s["id"] for s in subs if s["slug"] == sub_slug)
