"""Backend regression tests for the minimum-order eligibility bug fix.

Business rule: minimum_order is compared against TOTAL PAYABLE (subtotal + delivery_fee),
NOT against subtotal alone. Rule lives in /app/backend/modules/mart/cart_rules.py and
is used by POST /api/orders + GET /api/mart/cart/eligibility.
"""
from __future__ import annotations
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")

# Product ids from the CI seed (verified via /api/mart/products?country=CI)
PRD_BANANE = "prd_951e138789dd4128"      # 800 XOF
PRD_CHIPS_CLASSIC = "prd_0c1550b414244953"  # 500 XOF
PRD_COCA = "prd_b01b51d4dbed4c34"         # 900 XOF
PRD_BAGUETTE = "prd_5a66ea776e1948a1"     # 400 XOF
PRD_CHIPS_SEL = "prd_cf9fc9be3eb24692"    # 450 XOF


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _rand_phone():
    # 10-digit local number, unique per test run so each customer starts with fresh cart
    return str(1_000_000_000 + int(uuid.uuid4().int % 8_999_999_999))


def _login_customer(api, country_code: str = "+225"):
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone, "country_code": country_code})
    assert r.status_code == 200, f"OTP request failed: {r.status_code} {r.text}"
    data = r.json()
    challenge_id = data["challenge_id"]
    dev_code = data.get("dev_code")
    assert dev_code, "dev_code missing from OTP response (needed for automated test)"

    r = api.post(f"{BASE_URL}/api/auth/otp/verify", json={"challenge_id": challenge_id, "code": dev_code})
    assert r.status_code == 200, f"OTP verify failed: {r.status_code} {r.text}"
    payload = r.json()
    token = payload["access_token"]
    customer = payload["customer"]
    return token, customer, phone


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _clear_cart(api, token):
    """Remove all items from the customer's active cart so tests are hermetic."""
    r = api.get(f"{BASE_URL}/api/carts/me", headers=_auth_headers(token))
    if r.status_code != 200:
        return
    cart = r.json()
    for item in cart.get("items", []):
        api.delete(f"{BASE_URL}/api/carts/me/items/{item['id']}", headers=_auth_headers(token))


def _add_item(api, token, product_id: str, qty: int):
    r = api.post(
        f"{BASE_URL}/api/carts/me/items",
        headers=_auth_headers(token),
        json={"product_id": product_id, "quantity": qty, "module": "mart"},
    )
    assert r.status_code == 200, f"add item failed: {r.status_code} {r.text}"
    return r.json()


def _place_order(api, token):
    return api.post(
        f"{BASE_URL}/api/orders",
        headers=_auth_headers(token),
        json={
            "address": {
                "line1": "TEST_123 Test Street",
                "city": "Abidjan",
                "country": "CI",
            },
            "delivery_slot": "express",
            "payment_method": "cod",
        },
    )


@pytest.fixture
def fresh_customer(api):
    """Yield a fresh authenticated customer with empty cart."""
    token, customer, phone = _login_customer(api)
    _clear_cart(api, token)
    yield token, customer
    # cleanup: cart is cleared automatically on order-create; also clear any leftovers
    _clear_cart(api, token)


# ---------- config sanity ----------
class TestCountryConfig:
    def test_ci_min_order_is_3000(self, api):
        r = api.get(f"{BASE_URL}/api/config/countries")
        assert r.status_code == 200
        countries = r.json()
        ci = next((c for c in countries if c["code"] == "CI"), None)
        assert ci is not None, "CI country config missing"
        assert ci["min_order"] == 3000, f"CI min_order expected 3000, got {ci['min_order']}"
        assert ci["delivery_fee"] == 500, f"CI delivery_fee expected 500, got {ci['delivery_fee']}"


# ---------- eligibility endpoint ----------
class TestCartEligibility:
    def test_under_min_blocks(self, api, fresh_customer):
        """subtotal 2400 + delivery 500 = 2900 → eligible=false, shortfall=100."""
        token, _ = fresh_customer
        _add_item(api, token, PRD_BANANE, 3)  # 800 * 3 = 2400
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == 2400
        assert e["delivery_fee"] == 500
        assert e["total"] == 2900
        assert e["min_order"] == 3000
        assert e["eligible"] is False
        assert e["shortfall"] == 100

    def test_exactly_at_min_allows(self, api, fresh_customer):
        """subtotal 2500 + delivery 500 = 3000 → eligible=true, shortfall=0."""
        token, _ = fresh_customer
        _add_item(api, token, PRD_CHIPS_CLASSIC, 5)  # 500 * 5 = 2500
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == 2500
        assert e["total"] == 3000
        assert e["eligible"] is True
        assert e["shortfall"] == 0

    def test_over_min_allows(self, api, fresh_customer):
        """subtotal 3200 + delivery 500 = 3700 → eligible=true."""
        token, _ = fresh_customer
        _add_item(api, token, PRD_BANANE, 4)  # 800 * 4 = 3200
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == 3200
        assert e["total"] == 3700
        assert e["eligible"] is True

    def test_screenshot_scenario_now_allows(self, api, fresh_customer):
        """Original bug scenario: subtotal ~2600 + 500 = 3100 → eligible=true (was blocked).

        Combo: Coca (900) + Banane (800) + Baguette (400) + Chips Sel (450+50? no – use 1×450 gives 2550)
        Use Coca(900)+Banane(800)+Baguette(400)+ChipsClassic(1×500) = 2600 exactly.
        """
        token, _ = fresh_customer
        _add_item(api, token, PRD_COCA, 1)         # 900
        _add_item(api, token, PRD_BANANE, 1)       # 800
        _add_item(api, token, PRD_BAGUETTE, 1)     # 400
        _add_item(api, token, PRD_CHIPS_CLASSIC, 1)  # 500
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == 2600
        assert e["delivery_fee"] == 500
        assert e["total"] == 3100
        assert e["eligible"] is True, "REGRESSION: original screenshot bug still blocks!"


# ---------- order create integration ----------
class TestOrderCreate:
    def test_under_min_returns_400(self, api, fresh_customer):
        token, _ = fresh_customer
        _add_item(api, token, PRD_BANANE, 3)  # subtotal 2400, total 2900
        r = _place_order(api, token)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        # Assert helpful shortfall message
        assert "3000" in r.text or "Minimum" in r.text or "minimum" in r.text
        assert "100" in r.text, "shortfall value (100) should appear in error message"

    def test_exactly_at_min_creates_order(self, api, fresh_customer):
        token, _ = fresh_customer
        _add_item(api, token, PRD_CHIPS_CLASSIC, 5)  # 2500 subtotal, 3000 total
        r = _place_order(api, token)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        order = r.json()
        assert order["subtotal"] == 2500
        assert order["delivery_fee"] == 500
        assert order["total"] == 3000
        assert order["status"] == "confirmed", f"COD should auto-confirm, got {order['status']}"
        assert order.get("delivery_slot_label")
        assert "id" in order

        # verify persistence via GET /orders/{id}
        oid = order["id"]
        g = api.get(f"{BASE_URL}/api/orders/{oid}", headers=_auth_headers(token))
        assert g.status_code == 200
        assert g.json()["total"] == 3000

    def test_over_min_creates_order(self, api, fresh_customer):
        token, _ = fresh_customer
        _add_item(api, token, PRD_BANANE, 4)  # 3200 subtotal, 3700 total
        r = _place_order(api, token)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["total"] == 3700
        assert order["status"] == "confirmed"

    def test_screenshot_scenario_creates_order(self, api, fresh_customer):
        token, _ = fresh_customer
        _add_item(api, token, PRD_COCA, 1)
        _add_item(api, token, PRD_BANANE, 1)
        _add_item(api, token, PRD_BAGUETTE, 1)
        _add_item(api, token, PRD_CHIPS_CLASSIC, 1)
        r = _place_order(api, token)
        assert r.status_code == 200, f"screenshot scenario must now succeed, got {r.status_code}: {r.text}"
        order = r.json()
        assert order["subtotal"] == 2600
        assert order["total"] == 3100
        assert order["status"] == "confirmed"


# ---------- tracking regression ----------
class TestTrackingRegression:
    def test_tracking_after_order_create(self, api, fresh_customer):
        token, _ = fresh_customer
        _add_item(api, token, PRD_BANANE, 4)
        r = _place_order(api, token)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        # give the event bus a beat
        time.sleep(0.5)
        t = api.get(f"{BASE_URL}/api/orders/{oid}/tracking", headers=_auth_headers(token))
        assert t.status_code == 200, t.text
        tr = t.json()
        assert "stage" in tr
        assert "timeline" in tr and isinstance(tr["timeline"], list) and len(tr["timeline"]) >= 5
        assert "driver" in tr and tr["driver"] is not None
        assert "geo" in tr and "store" in tr["geo"] and "destination" in tr["geo"] and "driver" in tr["geo"]
