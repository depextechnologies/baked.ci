"""Iter69 — SHOPbakēd unified cart + dual checkout (MART + SHOP mixed).

Backend never sees the "unified" shape — it just keeps MART cart in /api/carts/me
and SHOP cart in /api/shop/cart/me. This test verifies both endpoints stay
independent for the same customer, and that sequential dual-checkout (MART /orders
then /shop/checkout) creates BOTH orders under the same customer.
"""
from __future__ import annotations
import os
import subprocess
import pytest
import requests

pytestmark = pytest.mark.xdist_group("mixed_cart_iter69")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
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
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": SUP_EMAIL, "password": SUP_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers(request):
    # Use a distinct phone per worker to prevent cross-worker cart collision
    worker = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
    suffix = "3" if worker == "gw0" else "4"
    phone = f"+225070090909{suffix}"
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": phone}, timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"],
                              "code": otp["dev_code"]}, timeout=15).json()
    return {"Authorization": f"Bearer {ver['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_address(customer_headers):
    # Ensure at least one address exists — needed for MART checkout.
    existing = requests.get(f"{API}/customers/me/addresses",
                            headers=customer_headers, timeout=10).json()
    if existing:
        return existing[0]
    r = requests.post(f"{API}/customers/me/addresses", headers=customer_headers,
                      json={"label": "TEST_Home", "line1": "Rue des Test",
                            "city": "Abidjan", "country": "CI",
                            "latitude": 5.3600, "longitude": -4.0083,
                            "formatted_address": "Rue des Test, Abidjan",
                            "is_default": True}, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def mart_product_over_min_order():
    """Pick any MART product priced >= 3000 XOF to satisfy CI min-order alone."""
    r = requests.get(f"{API}/mart/products?country=CI&limit=100", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    products = body if isinstance(body, list) else body.get("items", [])
    # Prefer priced >= 3000 so 1 qty alone crosses min-order
    hi = [p for p in products if (p.get("price") or 0) >= 3000 and p.get("is_stocked_locally", True)]
    if hi:
        return hi[0]
    # Fallback: cheapest, we'll bump qty
    products = [p for p in products if p.get("is_stocked_locally", True)]
    assert products, "No MART products available"
    products.sort(key=lambda p: p.get("price", 0), reverse=True)
    return products[0]


@pytest.fixture(scope="module")
def published_shop_product(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat = next(c for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub = next(s for s in subs if s["slug"] == "iphone")
    p = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": "TEST_Iter69 iPhone",
                            "category_id": cat["id"], "subcategory_id": sub["id"]},
                      timeout=15).json()
    requests.post(f"{API}/shop/portal/products/{p['id']}/variants",
                  headers=supplier_headers,
                  json={"sku": "TEST-I69-256", "price": 1299, "stock_qty": 25,
                        "attributes": {"colour": "black", "storage": "256"}},
                  timeout=15)
    requests.post(f"{API}/admin/modules/shop/product-requests/{p['id']}/approve",
                  headers=sa_headers, json={}, timeout=15)
    return p["id"]


def _clean_carts(customer_headers):
    try:
        requests.delete(f"{API}/carts/me", headers=customer_headers, timeout=10)
    except Exception:
        pass
    shop = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
    for it in shop.get("items", []):
        requests.delete(f"{API}/shop/cart/items/{it['id']}",
                        headers=customer_headers, timeout=10)


# -------- Independence of MART and SHOP cart endpoints -----------------------
class TestCartIndependence:
    def test_mart_and_shop_carts_are_independent(self, customer_headers,
                                                 mart_product_over_min_order,
                                                 published_shop_product):
        _clean_carts(customer_headers)
        # Add a MART item
        r_mart = requests.post(f"{API}/carts/me/items", headers=customer_headers,
                               json={"product_id": mart_product_over_min_order["id"],
                                     "quantity": 1, "module": "mart"}, timeout=15)
        assert r_mart.status_code in (200, 201), r_mart.text

        # Add a SHOP variant
        detail = requests.get(f"{API}/shop/products/{published_shop_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        r_shop = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                               json={"variant_id": vid, "quantity": 2}, timeout=15)
        assert r_shop.status_code in (200, 201), r_shop.text

        # GET both endpoints — they must be independent and non-overlapping.
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()

        assert mart["item_count"] >= 1, mart
        assert len(mart["items"]) >= 1
        # None of the MART items should reference the SHOP variant id
        for it in mart["items"]:
            assert it.get("product", {}).get("id") != vid

        assert shop["item_count"] == 2, shop
        assert len(shop["items"]) == 1
        assert shop["items"][0]["variant"]["id"] == vid
        # SHOP cart should not contain MART items
        assert all(i.get("variant") is not None for i in shop["items"])


# -------- Dual (mixed) checkout ---------------------------------------------
class TestMixedCheckout:
    def test_dual_checkout_creates_both_orders(self, customer_headers,
                                               customer_address,
                                               mart_product_over_min_order,
                                               published_shop_product):
        _clean_carts(customer_headers)
        # Seed MART item with enough qty to clear 3000 XOF min-order
        price = mart_product_over_min_order.get("price") or 0
        qty = max(1, (3000 // price) + 1) if price else 5
        requests.post(f"{API}/carts/me/items", headers=customer_headers,
                      json={"product_id": mart_product_over_min_order["id"],
                            "quantity": qty, "module": "mart"}, timeout=15)
        # Seed SHOP item
        detail = requests.get(f"{API}/shop/products/{published_shop_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": vid, "quantity": 1}, timeout=15)

        # Snapshot cart totals
        mart_pre = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop_pre = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart_pre["subtotal"] >= 3000
        assert shop_pre["subtotal"] > 0

        # -- MART order ----
        slots = requests.get(f"{API}/mart/delivery-slots?country=CI", timeout=10).json()
        slot = slots[0]
        r_mart = requests.post(f"{API}/orders", headers=customer_headers,
                               json={"address_id": customer_address["id"],
                                     "delivery_slot_id": slot["id"],
                                     "delivery_slot_label": slot["label"],
                                     "payment_method": "cod",
                                     "instructions": "TEST_iter69"}, timeout=20)
        assert r_mart.status_code in (200, 201), r_mart.text
        mart_order = r_mart.json()
        assert "id" in mart_order

        # -- SHOP order ----
        r_shop = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                               json={"payment_method": "cash_on_delivery",
                                     "delivery_address": {
                                         "line1": customer_address["line1"],
                                         "city": customer_address.get("city", "Abidjan"),
                                         "country": "CI",
                                     }}, timeout=20)
        assert r_shop.status_code in (200, 201), r_shop.text
        shop_order = r_shop.json()
        assert shop_order["number"].startswith("SHOP-CI-")

        # -- Verify both persisted independently ----
        mart_get = requests.get(f"{API}/orders/{mart_order['id']}",
                                headers=customer_headers, timeout=10)
        assert mart_get.status_code == 200, mart_get.text
        assert mart_get.json()["id"] == mart_order["id"]

        shop_get = requests.get(f"{API}/shop/orders/{shop_order['id']}",
                                headers=customer_headers, timeout=10)
        assert shop_get.status_code == 200, shop_get.text
        assert shop_get.json()["number"] == shop_order["number"]

        # -- Both carts empty afterwards ----
        mart_post = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop_post = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart_post["item_count"] == 0
        assert shop_post["items"] == []

    def test_shop_only_checkout_still_routes_to_shop(self, customer_headers,
                                                    published_shop_product):
        _clean_carts(customer_headers)
        # Only SHOP item — no MART min-order gate should apply
        detail = requests.get(f"{API}/shop/products/{published_shop_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": vid, "quantity": 1}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                          json={"payment_method": "cash_on_delivery",
                                "delivery_address": {"line1": "Test", "city": "Abidjan"}},
                          timeout=20)
        assert r.status_code in (200, 201), r.text
        assert r.json()["number"].startswith("SHOP-CI-")
        # MART cart untouched (empty)
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        assert mart["item_count"] == 0
        _clean_carts(customer_headers)
