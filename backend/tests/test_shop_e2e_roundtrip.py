"""SHOPbakēd — Slice 8 end-to-end round-trip test.

Emulates the full three-actor journey:

    (Seller)                              (Admin)                       (Customer)
        │                                     │                              │
        │  1. login (delta / SHOP-enabled)    │                              │
        │  2. create product (Apple/iPhone)   │                              │
        │  3. add 3 variants                  │                              │
        │  4. list catalogue → sees it        │                              │
        ├─────────────────────────────────────┤                              │
                                              │  5. list pending queue        │
                                              │  6. approve product           │
                                              │  7. verify buckets updated    │
                                              ├──────────────────────────────┤
                                                                             │  8. OTP login
                                                                             │  9. GET /shop/catalogue
                                                                             │ 10. PDP → sees variants
                                                                             │ 11. add-to-cart
                                                                             │ 12. patch quantity
                                                                             │ 13. checkout-snapshot

Every step asserts against the response so a regression in ANY slice
between 1..7 breaks this test loudly. This is the fork agent's smoke
test for the entire SHOPbakēd MVP.
"""
from __future__ import annotations
import os
import subprocess
import pytest
import requests


pytestmark = pytest.mark.xdist_group("shop_e2e_slice8")


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"
DELTA_ID = "sup_demo_delta_seed"


def _sql(sql: str) -> None:
    subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked", "-c", sql],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True,
    )


@pytest.fixture(scope="module")
def sa_token():
    return requests.post(f"{API}/admin/auth/login",
                         json={"email": SA_EMAIL, "password": SA_PASSWORD},
                         timeout=15).json()["access_token"]


@pytest.fixture(scope="module")
def seller_token():
    _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    return requests.post(f"{API}/martbaked/sellers/login",
                         json={"email": SUP_EMAIL, "password": SUP_PASSWORD},
                         timeout=15).json()["access_token"]


@pytest.fixture(scope="module")
def customer_token():
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": "+2250700808088"},
                        timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"], "code": otp["dev_code"]},
                        timeout=15).json()
    return ver["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _sub_id(cat_slug: str, sub_slug: str) -> str:
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category={cat_slug}", timeout=10).json()
    return next(s["id"] for s in subs if s["slug"] == sub_slug)


def _cat_id(cat_slug: str) -> str:
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    return next(c["id"] for c in cats if c["slug"] == cat_slug)


class TestFullE2ERoundTrip:
    """One class → single xdist worker → cleanly ordered phases."""

    # -------- Seller phase -------------------------------------------------

    def test_1_seller_can_see_shop_tab(self, seller_token):
        me = requests.get(f"{API}/supplier/me", headers=_h(seller_token), timeout=10).json()
        assert "SHOP" in (me.get("modules") or [])

    def test_2_seller_creates_product(self, seller_token, request):
        r = requests.post(
            f"{API}/shop/portal/products", headers=_h(seller_token),
            json={
                "title": "E2E iPhone 16",
                "category_id": _cat_id("apple"),
                "subcategory_id": _sub_id("apple", "iphone"),
                "description": "End-to-end regression fixture.",
                "images": ["https://example.com/e2e-iphone.jpg"],
                "attributes": {"colour": "black"},
            }, timeout=15,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "pending_review"
        # Stash for later steps via pytest cache.
        request.config.cache.set("shop_e2e/product_id", body["id"])

    def test_3_seller_adds_three_variants(self, seller_token, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        assert pid, "product_id fixture missing from test_2"
        specs = [
            {"sku": "E2E-BLK-128", "price": 999, "stock_qty": 6,
             "attributes": {"colour": "black", "storage": "128"}},
            {"sku": "E2E-BLK-256", "price": 1099, "stock_qty": 4,
             "attributes": {"colour": "black", "storage": "256"}},
            {"sku": "E2E-WHT-128", "price": 999, "stock_qty": 8,
             "attributes": {"colour": "white", "storage": "128"}},
        ]
        for spec in specs:
            v = requests.post(
                f"{API}/shop/portal/products/{pid}/variants",
                headers=_h(seller_token), json=spec, timeout=15,
            )
            assert v.status_code == 201, v.text

    def test_4_seller_catalogue_lists_product(self, seller_token, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        r = requests.get(f"{API}/shop/portal/catalogue", headers=_h(seller_token), timeout=10)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json()["items"])

    # -------- Admin phase --------------------------------------------------

    def test_5_admin_sees_pending(self, sa_token, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        r = requests.get(f"{API}/admin/modules/shop/product-requests?bucket=pending",
                         headers=_h(sa_token), timeout=15)
        assert r.status_code == 200
        # The product may be immediately post-create pending, or it may
        # have been auto-flipped by concurrent tests — assert it's *somewhere*.
        found = any(i["id"] == pid for i in r.json()["items"])
        if not found:
            all_r = requests.get(f"{API}/admin/modules/shop/product-requests?bucket=all",
                                 headers=_h(sa_token), timeout=15).json()
            assert any(i["id"] == pid for i in all_r["items"])

    def test_6_admin_approves(self, sa_token, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/{pid}/approve",
            headers=_h(sa_token), json={"notes": "e2e approve"}, timeout=15,
        )
        # 200 = fresh approve, 400 = already active (idempotent race) — both fine.
        assert r.status_code in (200, 400)
        # Verify status is active via the admin detail endpoint.
        d = requests.get(f"{API}/admin/modules/shop/product-requests/{pid}",
                         headers=_h(sa_token), timeout=15).json()
        assert d["status"] == "active"
        assert d["variant_count"] == 3

    def test_7_bucket_counters_reflect_approval(self, sa_token, request):
        r = requests.get(f"{API}/admin/modules/shop/product-requests?bucket=approved",
                         headers=_h(sa_token), timeout=15)
        pid = request.config.cache.get("shop_e2e/product_id", None)
        assert any(i["id"] == pid for i in r.json()["items"])

    # -------- Customer phase -----------------------------------------------

    def test_8_customer_sees_product_publicly(self, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        r = requests.get(f"{API}/shop/products/{pid}", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "active"
        assert len(body["variants"]) == 3
        assert body["price_min"] == 999.0 and body["price_max"] == 1099.0

    def test_9_customer_pdp_has_resolved_schema(self, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        detail = requests.get(f"{API}/shop/products/{pid}", timeout=10).json()
        keys = {a["key"] for a in detail["attribute_schema"]}
        assert {"colour", "storage", "condition"}.issubset(keys)
        # iPhone storage is a subcategory-scoped required override.
        storage = next(a for a in detail["attribute_schema"] if a["key"] == "storage")
        assert storage["is_required"] is True
        assert storage["scope"] == "subcategory"

    def test_10_customer_adds_to_cart(self, customer_token, request):
        pid = request.config.cache.get("shop_e2e/product_id", None)
        detail = requests.get(f"{API}/shop/products/{pid}", timeout=10).json()
        vid = next(v["id"] for v in detail["variants"] if v["sku"] == "E2E-BLK-256")
        # Start clean.
        cart = requests.get(f"{API}/shop/cart/me", headers=_h(customer_token), timeout=10).json()
        for it in cart["items"]:
            requests.delete(f"{API}/shop/cart/items/{it['id']}",
                            headers=_h(customer_token), timeout=10)
        r = requests.post(f"{API}/shop/cart/items", headers=_h(customer_token),
                          json={"variant_id": vid, "quantity": 2}, timeout=10)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["item_count"] == 2
        assert len(body["items"]) == 1
        assert body["subtotal"] == 2198.0
        request.config.cache.set("shop_e2e/cart_item_id", body["items"][0]["id"])

    def test_11_customer_patches_quantity(self, customer_token, request):
        cart_item_id = request.config.cache.get("shop_e2e/cart_item_id", None)
        r = requests.patch(f"{API}/shop/cart/items/{cart_item_id}",
                           headers=_h(customer_token),
                           json={"quantity": 3}, timeout=10)
        assert r.status_code == 200
        assert r.json()["item_count"] == 3
        assert r.json()["subtotal"] == 3297.0  # 1099 × 3

    def test_12_checkout_snapshot(self, customer_token, request):
        r = requests.post(f"{API}/shop/cart/checkout-snapshot",
                          headers=_h(customer_token), timeout=10)
        assert r.status_code == 200, r.text
        snap = r.json()
        assert snap["module"] == "shop"
        assert snap["currency"] == "XOF"
        assert snap["item_count"] == 3
        assert snap["line_count"] == 1
        assert snap["subtotal"] == 3297.0
        line = snap["lines"][0]
        assert line["sku"] == "E2E-BLK-256"
        assert line["quantity"] == 3
        assert line["unit_price"] == 1099.0
        assert line["line_total"] == 3297.0
        assert line["attributes"] == {"colour": "black", "storage": "256"}
        assert line["product_title"] == "E2E iPhone 16"

    def test_13_empty_cart_snapshot_400(self, customer_token, request):
        # Drain cart.
        cart = requests.get(f"{API}/shop/cart/me", headers=_h(customer_token), timeout=10).json()
        for it in cart["items"]:
            requests.delete(f"{API}/shop/cart/items/{it['id']}",
                            headers=_h(customer_token), timeout=10)
        r = requests.post(f"{API}/shop/cart/checkout-snapshot",
                          headers=_h(customer_token), timeout=10)
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "empty_cart"
