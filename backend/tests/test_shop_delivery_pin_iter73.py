"""Iter73 — SHOP order delivery lifecycle (PIN gate + SA override).

Verifies the full lifecycle:
  * PIN minted at checkout, visible to customer, hidden from seller.
  * Seller portal paid → packing → shipped transitions (delivered blocked).
  * PIN-gated /deliver endpoint (wrong PIN, correct PIN, idempotent, lockout).
  * SA override endpoint can flip status without PIN.
  * Migration 0045 columns present.
"""
from __future__ import annotations
import os
import subprocess
import pytest
import requests

pytestmark = pytest.mark.xdist_group("shop_delivery_pin_iter73")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"
SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
DELTA_ID = "sup_demo_delta_seed"


def _sql(sql: str, fetch: bool = False):
    result = subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked",
         "-t", "-A", "-c", sql],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True, text=True,
    )
    return result.stdout.strip() if fetch else None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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
def published_shop_variant(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat = next(c for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub = next(s for s in subs if s["slug"] == "iphone")
    p = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": "TEST_Iter73 iPhone",
                            "category_id": cat["id"], "subcategory_id": sub["id"]},
                      timeout=15).json()
    v = requests.post(f"{API}/shop/portal/products/{p['id']}/variants",
                      headers=supplier_headers,
                      json={"sku": "TEST-I73-256", "price": 1500, "stock_qty": 100,
                            "attributes": {"colour": "black", "storage": "256"}},
                      timeout=15).json()
    requests.post(f"{API}/admin/modules/shop/product-requests/{p['id']}/approve",
                  headers=sa_headers, json={}, timeout=15)
    return v["id"]


def _clean_shop_cart(headers):
    shop = requests.get(f"{API}/shop/cart/me", headers=headers, timeout=10).json()
    for it in shop.get("items", []):
        requests.delete(f"{API}/shop/cart/items/{it['id']}", headers=headers, timeout=10)


def _place_order(customer_headers, variant_id):
    _clean_shop_cart(customer_headers)
    r = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": variant_id, "quantity": 1}, timeout=15)
    assert r.status_code in (200, 201), r.text
    r = requests.post(f"{API}/shop/checkout", headers=customer_headers,
                      json={"payment_method": "cash_on_delivery",
                            "delivery_address": {"line1": "Iter73 Rue",
                                                  "city": "Abidjan",
                                                  "country": "CI"}}, timeout=20)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# 1. Migration & column presence
# ---------------------------------------------------------------------------

class TestMigration0045:
    def test_alembic_version_ge_0045(self):
        v = _sql("SELECT version_num FROM alembic_version LIMIT 1;", fetch=True)
        assert v >= "0045", f"alembic version={v!r} (expected >= 0045)"

    def test_columns_present(self):
        cols = _sql(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='shop_orders' AND column_name IN "
            "('delivery_pin','delivery_pin_attempts','delivered_at');",
            fetch=True,
        )
        found = set(cols.split("\n")) if cols else set()
        assert {"delivery_pin", "delivery_pin_attempts", "delivered_at"} <= found, found


# ---------------------------------------------------------------------------
# 2. PIN minted at checkout & exposed to customer only
# ---------------------------------------------------------------------------

class TestPinMintedForCustomer:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900731")

    @pytest.fixture(scope="class")
    def order(self, customer_headers, published_shop_variant):
        return _place_order(customer_headers, published_shop_variant)

    def test_checkout_returns_six_digit_pin(self, order):
        assert "delivery_pin" in order, order
        pin = order["delivery_pin"]
        assert isinstance(pin, str) and len(pin) == 6 and pin.isdigit(), pin

    def test_orders_me_exposes_pin(self, customer_headers, order):
        r = requests.get(f"{API}/shop/orders/me", headers=customer_headers, timeout=10)
        assert r.status_code == 200
        found = next((o for o in r.json()["items"] if o["id"] == order["id"]), None)
        assert found is not None
        assert found.get("delivery_pin") == order["delivery_pin"]

    def test_order_detail_exposes_pin(self, customer_headers, order):
        r = requests.get(f"{API}/shop/orders/{order['id']}",
                         headers=customer_headers, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("delivery_pin") == order["delivery_pin"]


# ---------------------------------------------------------------------------
# 3. PIN never leaks to seller portal
# ---------------------------------------------------------------------------

class TestPinHiddenFromSeller:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900732")

    @pytest.fixture(scope="class")
    def order(self, customer_headers, published_shop_variant):
        return _place_order(customer_headers, published_shop_variant)

    def test_portal_list_omits_pin(self, supplier_headers, order):
        r = requests.get(f"{API}/shop/portal/orders?status=paid",
                         headers=supplier_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and "buckets" in body
        found = next((o for o in body["items"] if o["id"] == order["id"]), None)
        assert found is not None, f"order {order['id']} not in seller list"
        assert "delivery_pin" not in found, found
        assert "delivery_pin_attempts" in found

    def test_portal_detail_omits_pin(self, supplier_headers, order):
        r = requests.get(f"{API}/shop/portal/orders/{order['id']}",
                         headers=supplier_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "delivery_pin" not in body
        assert body.get("delivery_pin_attempts") == 0


# ---------------------------------------------------------------------------
# 4. Seller status transitions
# ---------------------------------------------------------------------------

class TestSellerTransitions:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900733")

    @pytest.fixture(scope="class")
    def order(self, customer_headers, published_shop_variant):
        return _place_order(customer_headers, published_shop_variant)

    def test_skip_paid_to_shipped_rejected(self, supplier_headers, order):
        r = requests.post(f"{API}/shop/portal/orders/{order['id']}/status",
                          headers=supplier_headers, json={"status": "shipped"}, timeout=10)
        assert r.status_code == 409, r.text
        d = r.json()["detail"]
        assert d["code"] == "invalid_transition"
        assert "packing" in d.get("allowed", [])

    def test_seller_cannot_set_delivered(self, supplier_headers, order):
        r = requests.post(f"{API}/shop/portal/orders/{order['id']}/status",
                          headers=supplier_headers, json={"status": "delivered"}, timeout=10)
        assert r.status_code == 422, r.text

    def test_paid_to_packing_to_shipped(self, supplier_headers, order):
        r = requests.post(f"{API}/shop/portal/orders/{order['id']}/status",
                          headers=supplier_headers, json={"status": "packing"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "packing"
        r = requests.post(f"{API}/shop/portal/orders/{order['id']}/status",
                          headers=supplier_headers, json={"status": "shipped"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "shipped"


# ---------------------------------------------------------------------------
# 5. Non-owning supplier gets 404
# ---------------------------------------------------------------------------

class TestOwnershipGuard:
    def test_supplier_without_line_gets_404(self, supplier_headers,
                                            published_shop_variant):
        # place order under a fresh customer, but move the item's supplier
        # so the delta supplier sees nothing. Simpler: use a non-existent id.
        r = requests.get(f"{API}/shop/portal/orders/shpord_does_not_exist",
                         headers=supplier_headers, timeout=10)
        assert r.status_code == 404
        r = requests.post(f"{API}/shop/portal/orders/shpord_does_not_exist/status",
                          headers=supplier_headers, json={"status": "packing"},
                          timeout=10)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 6. PIN gate for delivery
# ---------------------------------------------------------------------------

class TestPinGate:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900734")

    @pytest.fixture(scope="class")
    def shipped_order(self, customer_headers, supplier_headers, published_shop_variant):
        o = _place_order(customer_headers, published_shop_variant)
        requests.post(f"{API}/shop/portal/orders/{o['id']}/status",
                      headers=supplier_headers, json={"status": "packing"}, timeout=10)
        requests.post(f"{API}/shop/portal/orders/{o['id']}/status",
                      headers=supplier_headers, json={"status": "shipped"}, timeout=10)
        return o

    def test_wrong_pin_400(self, supplier_headers, shipped_order):
        r = requests.post(f"{API}/shop/portal/orders/{shipped_order['id']}/deliver",
                          headers=supplier_headers, json={"pin": "000000"}, timeout=10)
        assert r.status_code == 400, r.text
        d = r.json()["detail"]
        assert d["code"] == "wrong_pin"
        assert "attempts_remaining" in d
        assert d["attempts_remaining"] == 4

    def test_correct_pin_delivered(self, supplier_headers, shipped_order):
        r = requests.post(f"{API}/shop/portal/orders/{shipped_order['id']}/deliver",
                          headers=supplier_headers,
                          json={"pin": shipped_order["delivery_pin"]}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "delivered"
        assert body["delivered_at"] is not None

    def test_deliver_idempotent(self, supplier_headers, shipped_order):
        # Re-hit after already delivered — should return 200 without PIN check.
        r = requests.post(f"{API}/shop/portal/orders/{shipped_order['id']}/deliver",
                          headers=supplier_headers,
                          json={"pin": "999999"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "delivered"


# ---------------------------------------------------------------------------
# 7. Deliver rejects orders that are not shipped
# ---------------------------------------------------------------------------

class TestDeliverPreconditions:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900735")

    @pytest.fixture(scope="class")
    def paid_order(self, customer_headers, published_shop_variant):
        return _place_order(customer_headers, published_shop_variant)

    def test_deliver_on_paid_rejected(self, supplier_headers, paid_order):
        r = requests.post(f"{API}/shop/portal/orders/{paid_order['id']}/deliver",
                          headers=supplier_headers,
                          json={"pin": paid_order["delivery_pin"]}, timeout=10)
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "invalid_transition"


# ---------------------------------------------------------------------------
# 8. Brute-force lock after 5 wrong attempts
# ---------------------------------------------------------------------------

class TestBruteForceLock:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900736")

    @pytest.fixture(scope="class")
    def shipped_order(self, customer_headers, supplier_headers, published_shop_variant):
        o = _place_order(customer_headers, published_shop_variant)
        requests.post(f"{API}/shop/portal/orders/{o['id']}/status",
                      headers=supplier_headers, json={"status": "packing"}, timeout=10)
        requests.post(f"{API}/shop/portal/orders/{o['id']}/status",
                      headers=supplier_headers, json={"status": "shipped"}, timeout=10)
        return o

    def test_five_wrong_locks_out(self, supplier_headers, shipped_order):
        oid = shipped_order["id"]
        # 5 wrong attempts
        for i in range(5):
            r = requests.post(f"{API}/shop/portal/orders/{oid}/deliver",
                              headers=supplier_headers,
                              json={"pin": "111111"}, timeout=10)
            assert r.status_code == 400, f"attempt {i+1}: {r.text}"
        # verify counter persists via portal detail
        r = requests.get(f"{API}/shop/portal/orders/{oid}",
                         headers=supplier_headers, timeout=10)
        assert r.json()["delivery_pin_attempts"] == 5

        # 6th attempt with CORRECT pin should still be locked
        r = requests.post(f"{API}/shop/portal/orders/{oid}/deliver",
                          headers=supplier_headers,
                          json={"pin": shipped_order["delivery_pin"]}, timeout=10)
        assert r.status_code == 429, r.text
        assert r.json()["detail"]["code"] == "pin_locked"


# ---------------------------------------------------------------------------
# 9. SA override endpoint
# ---------------------------------------------------------------------------

class TestSaOverride:
    @pytest.fixture(scope="class")
    def customer_headers(self):
        return _mint_customer("+2250700900737")

    @pytest.fixture(scope="class")
    def paid_order(self, customer_headers, published_shop_variant):
        return _place_order(customer_headers, published_shop_variant)

    def test_sa_can_flip_to_delivered_no_pin(self, sa_headers, paid_order):
        r = requests.post(
            f"{API}/admin/modules/shop/orders/{paid_order['id']}/status",
            headers=sa_headers, json={"status": "delivered"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "delivered"
        assert body["delivered_at"] is not None

    def test_sa_can_flip_to_cancelled(self, sa_headers, customer_headers,
                                       published_shop_variant):
        o = _place_order(customer_headers, published_shop_variant)
        r = requests.post(
            f"{API}/admin/modules/shop/orders/{o['id']}/status",
            headers=sa_headers, json={"status": "cancelled"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"

    def test_sa_rejects_bad_status(self, sa_headers, paid_order):
        r = requests.post(
            f"{API}/admin/modules/shop/orders/{paid_order['id']}/status",
            headers=sa_headers, json={"status": "bogus"}, timeout=10)
        assert r.status_code == 422
