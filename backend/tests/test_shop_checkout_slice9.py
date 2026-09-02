"""SHOPbakēd — Slice 9 checkout engine tests."""
from __future__ import annotations
import os
import subprocess
import pytest
import requests


pytestmark = pytest.mark.xdist_group("shop_checkout_slice9")


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
                        json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    tok = requests.post(f"{API}/martbaked/sellers/login",
                        json={"email": SUP_EMAIL, "password": SUP_PASSWORD}, timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers():
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": "+2250700909090"}, timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"], "code": otp["dev_code"]}, timeout=15).json()
    return {"Authorization": f"Bearer {ver['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def published_product(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat_id = next(c["id"] for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub_id = next(s["id"] for s in subs if s["slug"] == "iphone")
    p = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": "Slice9 iPhone", "category_id": cat_id, "subcategory_id": sub_id},
                      timeout=15).json()
    requests.post(f"{API}/shop/portal/products/{p['id']}/variants",
                  headers=supplier_headers,
                  json={"sku": "S9-256", "price": 1099, "stock_qty": 10,
                        "attributes": {"colour": "black", "storage": "256"}}, timeout=15)
    requests.post(f"{API}/admin/modules/shop/product-requests/{p['id']}/approve",
                  headers=sa_headers, json={}, timeout=15)
    return p["id"]


def _clean_cart(customer_headers):
    cart = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
    for it in cart["items"]:
        requests.delete(f"{API}/shop/cart/items/{it['id']}",
                        headers=customer_headers, timeout=10)


class TestCheckoutFlow:
    def test_empty_cart_returns_400(self, customer_headers):
        _clean_cart(customer_headers)
        r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                          json={"payment_method": "cash_on_delivery"}, timeout=15)
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "empty_cart"

    def test_full_checkout_mints_order_and_clears_cart(self, customer_headers, published_product):
        _clean_cart(customer_headers)
        detail = requests.get(f"{API}/shop/products/{published_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        stock_before = detail["variants"][0]["stock_qty"]

        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": vid, "quantity": 3}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                          json={"payment_method": "cash_on_delivery",
                                "delivery_address": {"line1": "Test", "city": "Abidjan"}},
                          timeout=15)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "paid"
        assert body["payment_status"] == "paid"
        assert body["payment_provider"] == "cash_on_delivery"
        assert body["total"] == 3297.0
        assert body["number"].startswith("SHOP-CI-")
        assert len(body["snapshot"]["lines"]) == 1

        # Cart cleared.
        cart = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert cart["items"] == []

        # Stock deducted.
        detail_after = requests.get(f"{API}/shop/products/{published_product}", timeout=10).json()
        v_after = next(v for v in detail_after["variants"] if v["id"] == vid)
        assert v_after["stock_qty"] == stock_before - 3

    def test_stripe_stays_pending(self, customer_headers, published_product):
        _clean_cart(customer_headers)
        detail = requests.get(f"{API}/shop/products/{published_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": vid, "quantity": 1}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                          json={"payment_method": "stripe"}, timeout=15)
        assert r.status_code == 201
        assert r.json()["status"] == "pending_payment"
        assert r.json()["payment_status"] == "pending"

    def test_insufficient_stock_rejected(self, customer_headers, published_product):
        _clean_cart(customer_headers)
        detail = requests.get(f"{API}/shop/products/{published_product}", timeout=10).json()
        vid = detail["variants"][0]["id"]
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": vid, "quantity": 99}, timeout=15)
        r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                          json={"payment_method": "cash_on_delivery"}, timeout=15)
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "insufficient_stock"
        _clean_cart(customer_headers)

    def test_list_and_detail_scoped_to_customer(self, customer_headers):
        r = requests.get(f"{API}/shop/orders/me", headers=customer_headers, timeout=15)
        assert r.status_code == 200
        orders = r.json()["items"]
        assert len(orders) >= 1
        for o in orders:
            d = requests.get(f"{API}/shop/orders/{o['id']}", headers=customer_headers, timeout=10)
            assert d.status_code == 200
            body = d.json()
            assert body["number"] == o["number"]
            assert len(body["items"]) >= 1

    def test_other_customer_cannot_access(self, customer_headers, published_product):
        # A different customer should get 404 on someone else's order.
        my_orders = requests.get(f"{API}/shop/orders/me", headers=customer_headers, timeout=10).json()["items"]
        assert my_orders
        target_id = my_orders[0]["id"]
        # New OTP → different customer.
        otp = requests.post(f"{API}/auth/otp/request",
                            json={"country_code": "CI", "phone": "+2250700909091"}, timeout=15).json()
        ver = requests.post(f"{API}/auth/otp/verify",
                            json={"challenge_id": otp["challenge_id"], "code": otp["dev_code"]}, timeout=15).json()
        other = {"Authorization": f"Bearer {ver['access_token']}"}
        r = requests.get(f"{API}/shop/orders/{target_id}", headers=other, timeout=10)
        assert r.status_code == 404

    def test_auth_required(self):
        assert requests.post(f"{API}/shop/checkout", json={}, timeout=10).status_code == 401
        assert requests.get(f"{API}/shop/orders/me", timeout=10).status_code == 401
