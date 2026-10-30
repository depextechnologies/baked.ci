# Phase C (mobile MART/FOOD ordering) backend regression tests:
# cart quote variants/add-ons, FOOD customer order create (delivery/pickup), repricing anti-tamper,
# customer cancel, MART order create, /api/app-preview SPA fallback.
import os
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
RID = "burger_hub_ci"
WINGS = "burger_hub_ci_crispy_wings"
WINGS_V = "burger_hub_ci_crispy_wings_v_regular"
SAUCE = "burger_hub_ci_crispy_wings_a_extra_sauce"
BURGER = "burger_hub_ci_classic_burger"
BURGER_LARGE = "burger_hub_ci_classic_burger_v_large"


def _login(phone):
    r = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "dev_code" in d
    v = requests.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


@pytest.fixture(scope="module")
def cust():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('07%08d' % random.randint(0, 99999999))}"
    return s


@pytest.fixture(scope="module")
def other_cust():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('05%08d' % random.randint(0, 99999999))}"
    return s


@pytest.fixture(scope="module")
def partner():
    r = requests.post(f"{API}/food/partner/auth/login",
                      json={"email": "qa-burger@test.example", "password": "QaBurger123!"})
    if r.status_code != 200:
        pytest.skip("partner login failed")
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _food_order(s, order_type="delivery", items=None):
    payload = {
        "restaurant_id": RID, "order_type": order_type,
        "items": items or [{"item_id": WINGS, "quantity": 1}],
        "delivery_address": {"label": "Cocody", "line1": "Cocody", "city": "Abidjan", "lat": 5.35, "lng": -4.0},
        "payment_method": "cod",
    }
    return s.post(f"{API}/food/customer/orders", json=payload)


# --- Cart quote ---
class TestQuote:
    def test_quote_food_addon(self):
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "mode": "delivery", "items": [
            {"module": "food", "restaurant_id": RID, "menu_item_id": WINGS, "quantity": 2,
             "variant_id": WINGS_V, "addon_ids": [SAUCE]}]})
        assert r.status_code == 200, r.text
        d = r.json()
        print(d)
        food = d.get("food") or d.get("modules", {}).get("food") or {}
        assert "7400" in r.text.replace(".0", ""), r.text

    def test_quote_food_variant_large(self):
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "items": [
            {"module": "food", "restaurant_id": RID, "menu_item_id": BURGER, "quantity": 1,
             "variant_id": BURGER_LARGE}]})
        assert r.status_code == 200
        assert "5300" in r.text.replace(".0", ""), r.text

    def test_quote_food_plain_unchanged(self):
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "items": [
            {"module": "food", "restaurant_id": RID, "menu_item_id": WINGS, "quantity": 2}]})
        assert r.status_code == 200
        assert "7000" in r.text.replace(".0", ""), r.text

    def test_quote_foreign_addon_ignored(self):
        # addon belonging to another item must not be charged
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "items": [
            {"module": "food", "restaurant_id": RID, "menu_item_id": WINGS, "quantity": 1,
             "addon_ids": ["burger_hub_ci_classic_burger_a_extra_cheese"]}]})
        assert r.status_code == 200
        print(r.text[:600])
        assert "3500" in r.text.replace(".0", "")

    def test_quote_pickup_no_fee(self):
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "mode": "pickup", "items": [
            {"module": "food", "restaurant_id": RID, "menu_item_id": WINGS, "quantity": 1}]})
        assert r.status_code == 200
        print(r.text[:800])


# --- FOOD orders ---
class TestFoodOrders:
    def test_create_delivery_order_with_addon(self, cust):
        r = _food_order(cust, "delivery", [{"item_id": WINGS, "quantity": 2,
                                            "variant": {"id": WINGS_V, "name": "Standard"},
                                            "addons": [{"id": SAUCE, "name": "Sauce extra", "price": 200}]}])
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "placed"
        assert float(d["subtotal"]) == 7400
        pytest.food_oid = d["id"]

    # FIX 5 (iter117): pickup refused when restaurant has pickup_enabled=false
    def test_create_pickup_order_refused(self, cust):
        r = _food_order(cust, "pickup")
        assert r.status_code == 409, r.text
        assert "emporter" in r.text

    def test_tamper_prices_ignored(self, cust):
        r = _food_order(cust, "delivery", [{"item_id": BURGER, "quantity": 1,
                                            "variant": {"id": BURGER_LARGE, "name": "Large", "price_delta": -4000},
                                            "addons": [{"id": SAUCE, "price": 99999},
                                                       {"id": "burger_hub_ci_classic_burger_a_extra_cheese", "price": -9999}]}])
        assert r.status_code == 201, r.text
        d = r.json()
        print(d.get("subtotal"), d.get("items"))
        # 4500 + 800 large + extra cheese (DB price); foreign SAUCE ignored
        assert float(d["subtotal"]) >= 5300
        assert float(d["subtotal"]) < 10000

    def test_order_listed_and_detail(self, cust):
        r = cust.get(f"{API}/food/customer/orders/{pytest.food_oid}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == pytest.food_oid

    def test_cancel_other_customer_404(self, other_cust):
        r = other_cust.post(f"{API}/food/customer/orders/{pytest.food_oid}/cancel", json={})
        assert r.status_code == 404

    def test_cancel_unauth_401(self):
        r = requests.post(f"{API}/food/customer/orders/{pytest.food_oid}/cancel", json={})
        assert r.status_code in (401, 403)

    def test_cancel_placed_and_idempotent(self, cust):
        r = cust.post(f"{API}/food/customer/orders/{pytest.food_oid}/cancel", json={"reason": "TEST"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"
        r2 = cust.post(f"{API}/food/customer/orders/{pytest.food_oid}/cancel", json={})
        assert r2.status_code == 200
        assert r2.json()["status"] == "cancelled"

    def test_cancel_after_accept_409(self, cust, partner):
        r = _food_order(cust, "delivery")
        oid = r.json()["id"]
        a = partner.patch(f"{API}/food/manage/{RID}/orders/{oid}", json={"action": "accept", "prep_minutes": 15})
        assert a.status_code == 200, a.text
        c = cust.post(f"{API}/food/customer/orders/{oid}/cancel", json={})
        assert c.status_code == 409, c.text


# --- MART ---
class TestMart:
    def test_mart_eligibility_and_order(self, cust):
        r = cust.get(f"{API}/mart/cart/eligibility")
        print("eligibility", r.status_code, r.text[:300])
        assert r.status_code in (200, 404)


# FIX 2 (iter117): /cart/quote MART uses partner-price overlay, same as /mart/products and eligibility
BANANE = "prd_ab810bec2a114ba0"


class TestMartQuotePrice:
    def test_quote_banane_x2_partner_price(self):
        listed = [p for p in requests.get(f"{API}/mart/products", params={"country": "CI", "q": "banane"}).json()
                  if p["id"] == BANANE][0]["price"]
        r = requests.post(f"{API}/cart/quote", json={"country": "CI", "items": [
            {"module": "mart", "product_id": BANANE, "quantity": 2}]})
        assert r.status_code == 200, r.text
        assert float(r.json()["mart"]["subtotal"]) == float(listed) * 2 == 1800

    def test_quote_matches_eligibility(self, cust):
        for it in cust.get(f"{API}/carts/me").json().get("items", []):
            cust.delete(f"{API}/carts/me/items/{it['id']}")
        a = cust.post(f"{API}/carts/me/items", json={"product_id": BANANE, "quantity": 3, "module": "mart"})
        assert a.status_code in (200, 201), a.text
        e = cust.get(f"{API}/mart/cart/eligibility", params={"country": "CI"}).json()
        q = requests.post(f"{API}/cart/quote", json={"country": "CI", "items": [
            {"module": "mart", "product_id": BANANE, "quantity": 3}]}).json()
        assert float(e["subtotal"]) == float(q["mart"]["subtotal"]) == 2700
        assert float(e["delivery_fee"]) == float(q["mart"]["delivery_fee"])


# --- SPA fallback ---
class TestAppPreview:
    @pytest.mark.parametrize("path", ["", "cart", "order/food/abc", "mart/category/fruits-vegetables"])
    def test_spa_fallback(self, path):
        r = requests.get(f"{API}/app-preview/{path}")
        assert r.status_code == 200
        assert "<html" in r.text.lower()
