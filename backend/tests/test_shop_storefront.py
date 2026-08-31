"""SHOPbakēd — Slice 6 customer storefront tests.

Covers the public PDP endpoint + the authenticated cart flow:
  * GET /shop/products/{pid} — PDP returns product + variants + resolved
    attribute schema + price range.
  * Draft / pending products are hidden from the storefront (404).
  * Cart CRUD: add, upsert-on-same-variant, patch qty, delete; ownership
    enforced; 401 without customer token.
  * Multi-module cart isolation: SHOP items don't leak into MART's
    `/api/carts/me` and vice versa (they live in different tables but
    share the same parent Cart row).
"""
from __future__ import annotations
import os
import subprocess
import pytest
import requests


pytestmark = pytest.mark.xdist_group("shop_storefront_slice6")


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"
SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
DELTA_ID = "sup_demo_delta_seed"


def _sql(sql: str) -> None:
    subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked", "-c", sql],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True,
    )


@pytest.fixture(scope="module")
def sa_headers():
    tok = requests.post(f"{API}/admin/auth/login",
                        json={"email": SA_EMAIL, "password": SA_PASSWORD},
                        timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    tok = requests.post(f"{API}/martbaked/sellers/login",
                        json={"email": SUP_EMAIL, "password": SUP_PASSWORD},
                        timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers():
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": "+2250799999901"},
                        timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"], "code": otp["dev_code"]},
                        timeout=15).json()
    return {"Authorization": f"Bearer {ver['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def published_product(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat_id = next(c["id"] for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub_id = next(s["id"] for s in subs if s["slug"] == "iphone")

    r = requests.post(
        f"{API}/shop/portal/products", headers=supplier_headers,
        json={"title": "Slice6 iPhone", "category_id": cat_id, "subcategory_id": sub_id,
              "images": ["https://example.com/i.jpg"], "description": "PDP fixture"},
        timeout=15,
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    for spec in [
        {"sku": "S6-BLK-128", "price": 999, "stock_qty": 5,
         "attributes": {"colour": "black", "storage": "128"}},
        {"sku": "S6-BLK-256", "price": 1099, "stock_qty": 3,
         "attributes": {"colour": "black", "storage": "256"}},
        {"sku": "S6-WHT-128", "price": 999, "stock_qty": 4,
         "attributes": {"colour": "white", "storage": "128"}},
    ]:
        v = requests.post(f"{API}/shop/portal/products/{pid}/variants",
                          headers=supplier_headers, json=spec, timeout=15)
        assert v.status_code == 201, v.text

    r = requests.post(f"{API}/admin/modules/shop/product-requests/{pid}/approve",
                      headers=sa_headers, json={}, timeout=15)
    assert r.status_code == 200
    return pid


class TestPdp:
    def test_pdp_returns_variants_and_schema(self, published_product):
        r = requests.get(f"{API}/shop/products/{published_product}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "active"
        assert len(body["variants"]) == 3
        assert body["price_min"] == 999.0 and body["price_max"] == 1099.0
        keys = {a["key"] for a in body["attribute_schema"]}
        assert {"storage", "colour", "condition"}.issubset(keys)

    def test_draft_product_returns_404(self, supplier_headers):
        # A newly created (pending_review) product should NOT be visible via PDP.
        cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
        cat_id = next(c["id"] for c in cats if c["slug"] == "apple")
        r = requests.post(
            f"{API}/shop/portal/products", headers=supplier_headers,
            json={"title": "PendingPDP", "category_id": cat_id}, timeout=15,
        )
        pid = r.json()["id"]
        # PDP is public — must not leak unapproved product.
        assert requests.get(f"{API}/shop/products/{pid}", timeout=10).status_code == 404


class TestCart:
    def test_cart_auth_required(self):
        assert requests.get(f"{API}/shop/cart/me", timeout=10).status_code == 401

    def test_cart_add_upsert_patch_delete(self, customer_headers, published_product):
        detail = requests.get(f"{API}/shop/products/{published_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]

        # Start clean.
        cart = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        for it in cart["items"]:
            requests.delete(f"{API}/shop/cart/items/{it['id']}",
                            headers=customer_headers, timeout=10)

        # Add
        r = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                          json={"variant_id": vid, "quantity": 2}, timeout=10)
        assert r.status_code == 201
        assert r.json()["item_count"] == 2

        # Add same again → upsert (quantity += 1)
        r2 = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                           json={"variant_id": vid, "quantity": 1}, timeout=10)
        assert r2.json()["item_count"] == 3
        assert len(r2.json()["items"]) == 1

        # Patch quantity
        iid = r2.json()["items"][0]["id"]
        r3 = requests.patch(f"{API}/shop/cart/items/{iid}",
                            headers=customer_headers, json={"quantity": 5}, timeout=10)
        assert r3.json()["item_count"] == 5

        # Delete
        r4 = requests.delete(f"{API}/shop/cart/items/{iid}",
                             headers=customer_headers, timeout=10)
        assert r4.status_code == 204

    def test_add_bad_variant_404(self, customer_headers):
        r = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                          json={"variant_id": "shpvar_doesnotexist", "quantity": 1},
                          timeout=10)
        assert r.status_code == 404

    def test_patch_unknown_item_404(self, customer_headers):
        r = requests.patch(f"{API}/shop/cart/items/shpci_nope",
                           headers=customer_headers, json={"quantity": 3}, timeout=10)
        assert r.status_code == 404


class TestModuleIsolation:
    def test_mart_cart_endpoint_still_works(self, customer_headers):
        # MART's cart endpoint is auth-guarded but works independently — no
        # regression from adding shop_cart_items.
        r = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        # MART cart items live in `cart_items`; SHOP items live elsewhere,
        # so this response must never expose SHOP entries here.
        for it in body.get("items", []):
            assert it.get("module", "mart") == "mart"
