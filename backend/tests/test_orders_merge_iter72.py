"""Iter72 — Order History Merge (MART + SHOP).

Verifies:
  * /api/orders/me returns MART orders (list shape).
  * /api/shop/orders/me returns {items: [...]} with snapshot.lines, item_count,
    currency, total, delivery_address, module='shop' — the exact contract the
    MobileActivities merge relies on.
  * A customer with BOTH a MART and a SHOP order can be reconstructed into a
    single merged list by combining the two endpoints (mirrors FE Promise.all).
  * A customer with only a SHOP order still sees that SHOP order (regression:
    /orders/me empty array must not swallow SHOP list).
"""
from __future__ import annotations
import os
import subprocess
import pytest
import requests

pytestmark = pytest.mark.xdist_group("orders_merge_iter72")

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
    try:
        _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    except Exception:
        pass
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": SUP_EMAIL, "password": SUP_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


def _mint_customer(phone: str):
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": phone}, timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"],
                              "code": otp["dev_code"]}, timeout=15).json()
    return {"Authorization": f"Bearer {ver['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers():
    # Distinct phone from other tests to avoid cart/order pollution
    worker = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
    suffix = "7" if worker == "gw0" else "8"
    return _mint_customer(f"+225070090909{suffix}")


@pytest.fixture(scope="module")
def shop_only_customer_headers():
    worker = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
    suffix = "1" if worker == "gw0" else "2"
    return _mint_customer(f"+225070090901{suffix}")


@pytest.fixture(scope="module")
def customer_address(customer_headers):
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
    r = requests.get(f"{API}/mart/products?country=CI&limit=100", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    products = body if isinstance(body, list) else body.get("items", [])
    hi = [p for p in products if (p.get("price") or 0) >= 3000 and p.get("is_stocked_locally", True)]
    if hi:
        return hi[0]
    products = [p for p in products if p.get("is_stocked_locally", True)]
    assert products, "No MART products available"
    products.sort(key=lambda p: p.get("price", 0), reverse=True)
    return products[0]


@pytest.fixture(scope="module")
def published_shop_variant(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat = next(c for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub = next(s for s in subs if s["slug"] == "iphone")
    p = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": "TEST_Iter72 iPhone",
                            "category_id": cat["id"], "subcategory_id": sub["id"]},
                      timeout=15).json()
    v = requests.post(f"{API}/shop/portal/products/{p['id']}/variants",
                      headers=supplier_headers,
                      json={"sku": "TEST-I72-256", "price": 1500, "stock_qty": 30,
                            "attributes": {"colour": "black", "storage": "256"}},
                      timeout=15).json()
    requests.post(f"{API}/admin/modules/shop/product-requests/{p['id']}/approve",
                  headers=sa_headers, json={}, timeout=15)
    return v["id"]


def _clean_carts(headers):
    try:
        requests.delete(f"{API}/carts/me", headers=headers, timeout=10)
    except Exception:
        pass
    shop = requests.get(f"{API}/shop/cart/me", headers=headers, timeout=10).json()
    for it in shop.get("items", []):
        requests.delete(f"{API}/shop/cart/items/{it['id']}", headers=headers, timeout=10)


# -------------------------------------------------------------------------
# Contract for /api/shop/orders/me — critical for the merge on FE
# -------------------------------------------------------------------------
class TestShopOrdersMeContract:
    def test_shop_orders_me_returns_items_wrapper(self, shop_only_customer_headers,
                                                   published_shop_variant):
        _clean_carts(shop_only_customer_headers)
        # place a SHOP order
        requests.post(f"{API}/shop/cart/items", headers=shop_only_customer_headers,
                      json={"variant_id": published_shop_variant, "quantity": 2}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=shop_only_customer_headers,
                          json={"payment_method": "cash_on_delivery",
                                "delivery_address": {"line1": "Test 1", "city": "Abidjan",
                                                      "country": "CI"}}, timeout=20)
        assert r.status_code in (200, 201), r.text

        r2 = requests.get(f"{API}/shop/orders/me",
                          headers=shop_only_customer_headers, timeout=10)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert isinstance(body, dict) and "items" in body, body
        assert len(body["items"]) >= 1
        o = body["items"][0]
        # Contract fields FE relies on
        for f in ("id", "number", "module", "status", "total", "currency",
                  "created_at", "delivery_address", "snapshot"):
            assert f in o, f"missing {f} in shop order dict"
        assert o["module"] == "shop"
        assert o["snapshot"].get("lines"), "snapshot.lines required for FE row"
        line = o["snapshot"]["lines"][0]
        for f in ("variant_id", "quantity", "unit_price", "line_total", "product_title"):
            assert f in line, f"missing {f} in snapshot.line"
        assert "item_count" in o["snapshot"]


# -------------------------------------------------------------------------
# Merge — a customer with a MART order + a SHOP order sees both in the union
# -------------------------------------------------------------------------
class TestMergedOrdersView:
    def test_customer_has_both_mart_and_shop_orders(self, customer_headers,
                                                    customer_address,
                                                    mart_product_over_min_order,
                                                    published_shop_variant):
        _clean_carts(customer_headers)

        # 1) MART order
        price = mart_product_over_min_order.get("price") or 0
        qty = max(1, (3000 // price) + 1) if price else 5
        requests.post(f"{API}/carts/me/items", headers=customer_headers,
                      json={"product_id": mart_product_over_min_order["id"],
                            "quantity": qty, "module": "mart"}, timeout=15)
        slots = requests.get(f"{API}/mart/delivery-slots?country=CI", timeout=10).json()
        slot = slots[0]
        r_mart = requests.post(f"{API}/orders", headers=customer_headers,
                               json={"address_id": customer_address["id"],
                                     "delivery_slot_id": slot["id"],
                                     "delivery_slot_label": slot["label"],
                                     "payment_method": "cod",
                                     "instructions": "TEST_iter72"}, timeout=25)
        assert r_mart.status_code in (200, 201), r_mart.text
        mart_id = r_mart.json()["id"]

        # 2) SHOP order
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        r_shop = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                               json={"payment_method": "cash_on_delivery",
                                     "delivery_address": {"line1": customer_address["line1"],
                                                          "city": "Abidjan",
                                                          "country": "CI"}}, timeout=20)
        assert r_shop.status_code in (200, 201), r_shop.text
        shop_id = r_shop.json()["id"]

        # 3) Simulate FE merge: /orders/me + /shop/orders/me
        mart_list = requests.get(f"{API}/orders/me", headers=customer_headers, timeout=10).json()
        shop_body = requests.get(f"{API}/shop/orders/me", headers=customer_headers, timeout=10).json()
        assert isinstance(mart_list, list), type(mart_list)
        assert any(o.get("id") == mart_id for o in mart_list), \
            f"MART order {mart_id} not in /orders/me"
        assert any(o.get("id") == shop_id for o in shop_body["items"]), \
            f"SHOP order {shop_id} not in /shop/orders/me"

        merged_ids = {o["id"] for o in mart_list} | {o["id"] for o in shop_body["items"]}
        assert mart_id in merged_ids and shop_id in merged_ids

    def test_shop_only_customer_still_sees_shop_orders(self, published_shop_variant):
        """Regression: even if /orders/me is empty, SHOP orders remain visible.

        Self-contained: mint a fresh customer (no MART cart / no address /
        no MART order) and confirm the SHOP list still surfaces the order.
        """
        worker = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
        digit = "9" if worker == "gw0" else "0"
        hdrs = _mint_customer(f"+22507009090{digit}9")
        _clean_carts(hdrs)
        # Place a SHOP order (no MART interaction at all)
        requests.post(f"{API}/shop/cart/items", headers=hdrs,
                      json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=hdrs,
                          json={"payment_method": "cash_on_delivery",
                                "delivery_address": {"line1": "Solo SHOP",
                                                     "city": "Abidjan", "country": "CI"}},
                          timeout=20)
        assert r.status_code in (200, 201), r.text

        mart = requests.get(f"{API}/orders/me", headers=hdrs, timeout=10).json()
        shop = requests.get(f"{API}/shop/orders/me", headers=hdrs, timeout=10).json()
        assert isinstance(mart, list)
        # MART list may be empty; SHOP list must NOT be
        assert len(shop.get("items", [])) >= 1, \
            f"Regression: SHOP order swallowed. mart={mart} shop={shop}"
