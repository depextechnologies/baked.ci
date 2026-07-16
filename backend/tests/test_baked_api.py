"""
BAKĒD Platform — Backend API integration tests.
Uses the public REACT_APP_BACKEND_URL. Tests config/mart/auth-otp/cart/ai flows.
"""
import os
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env for REACT_APP_BACKEND_URL
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ---------- Config ----------
class TestConfig:
    def test_countries(self, api):
        r = api.get(f"{BASE_URL}/api/config/countries")
        assert r.status_code == 200
        data = r.json()
        codes = {c["code"]: c for c in data}
        assert "CI" in codes and "GB" in codes
        ci = codes["CI"]
        assert ci["currency"] == "XOF"
        assert ci["locale"] == "fr-CI"
        assert ci["phone_code"] == "+225"
        gb = codes["GB"]
        assert gb["currency"] == "GBP"
        assert gb["locale"] == "en-GB"
        assert gb["phone_code"] == "+44"

    def test_modules_ci_colors(self, api):
        r = api.get(f"{BASE_URL}/api/config/modules?country=CI")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 6
        by_code = {m["code"]: m for m in data}
        assert by_code["mart"]["color"] == "#77BC1F"
        assert by_code["food"]["color"] == "#77BC1F"
        assert by_code["shop"]["color"] == "#FCC44C"
        assert by_code["express"]["color"] == "#FCC44C"
        assert by_code["auto"]["color"] == "#FF4C52"
        assert by_code["immo"]["color"] == "#A659FF"
        assert by_code["mart"]["status"] == "active"
        for k in ["food", "shop", "express", "auto", "immo"]:
            assert by_code[k]["status"] == "coming_soon"


# ---------- MART ----------
class TestMart:
    def test_categories_ci_french(self, api):
        r = api.get(f"{BASE_URL}/api/mart/categories?country=CI")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 9
        names = [c["name"] for c in cats]
        assert "Fruits & Légumes" in names
        assert "Produits Laitiers & Œufs" in names
        assert "Boulangerie" in names

    def test_categories_gb_english(self, api):
        r = api.get(f"{BASE_URL}/api/mart/categories?country=GB")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 9
        names = [c["name"] for c in cats]
        assert "Fruits & Vegetables" in names
        assert "Dairy & Eggs" in names

    def test_products_ci_xof(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=10")
        assert r.status_code == 200
        products = r.json()
        assert len(products) == 10
        for p in products:
            assert p["currency"] == "XOF"
            assert p["currency_symbol"] == "CFA"
            assert isinstance(p["price"], (int, float))
            assert "id" in p and "_id" not in p

    def test_products_by_category(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products?country=CI&category=fruits-vegetables")
        assert r.status_code == 200
        products = r.json()
        assert len(products) > 0
        for p in products:
            assert p["category_slug"] == "fruits-vegetables"

    def test_products_sort_price_asc(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products?country=CI&sort=price_asc&limit=20")
        prices = [p["price"] for p in r.json()]
        assert prices == sorted(prices)

    def test_products_sort_price_desc(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products?country=CI&sort=price_desc&limit=20")
        prices = [p["price"] for p in r.json()]
        assert prices == sorted(prices, reverse=True)

    def test_product_detail(self, api):
        listing = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=1").json()
        assert len(listing) == 1
        pid = listing[0]["id"]
        r = api.get(f"{BASE_URL}/api/mart/products/{pid}")
        assert r.status_code == 200
        p = r.json()
        assert p["id"] == pid
        assert p["name"] == listing[0]["name"]

    def test_product_detail_404(self, api):
        r = api.get(f"{BASE_URL}/api/mart/products/does-not-exist")
        assert r.status_code == 404

    def test_offers_ci(self, api):
        r = api.get(f"{BASE_URL}/api/mart/offers?country=CI")
        assert r.status_code == 200
        offers = r.json()
        assert len(offers) >= 3
        for o in offers:
            assert o["active"] is True


# ---------- Auth OTP ----------
def _request_otp(api, cc="+225", phone="0102030405"):
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": cc, "phone": phone})
    assert r.status_code == 200, r.text
    return r.json()


class TestAuthOtp:
    def test_otp_request_shape(self, api):
        data = _request_otp(api)
        assert "challenge_id" in data
        assert data["expires_in"] == 180
        assert "masked_phone" in data
        assert data["masked_phone"].endswith("****")
        assert "dev_code" in data
        assert len(data["dev_code"]) == 6

    def test_otp_verify_then_me(self, api):
        data = _request_otp(api, phone="0100000001")
        v = api.post(f"{BASE_URL}/api/auth/otp/verify", json={
            "challenge_id": data["challenge_id"],
            "code": data["dev_code"],
        })
        assert v.status_code == 200, v.text
        body = v.json()
        assert "access_token" in body
        cust = body["customer"]
        assert cust["role"] == "customer"
        assert cust["verified"] is True
        assert cust["phone"] == "+2251000000001" or cust["phone"].startswith("+225")

        # /auth/me
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["id"] == cust["id"]

    def test_otp_wrong_code_400_increments(self, api):
        data = _request_otp(api, phone="0100000002")
        r = api.post(f"{BASE_URL}/api/auth/otp/verify", json={
            "challenge_id": data["challenge_id"],
            "code": "000000" if data["dev_code"] != "000000" else "111111",
        })
        assert r.status_code == 400

    def test_otp_rate_limit_after_5(self, api):
        data = _request_otp(api, phone="0100000003")
        # 5 wrong tries
        wrong = "999999" if data["dev_code"] != "999999" else "111111"
        for _ in range(5):
            api.post(f"{BASE_URL}/api/auth/otp/verify", json={
                "challenge_id": data["challenge_id"], "code": wrong,
            })
        r = api.post(f"{BASE_URL}/api/auth/otp/verify", json={
            "challenge_id": data["challenge_id"], "code": wrong,
        })
        assert r.status_code == 429

    def test_auth_me_requires_bearer(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)


# ---------- Cart ----------
@pytest.fixture(scope="module")
def authed_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": "+225", "phone": "0199999999"})
    j = r.json()
    v = s.post(f"{BASE_URL}/api/auth/otp/verify", json={"challenge_id": j["challenge_id"], "code": j["dev_code"]})
    token = v.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    # clear cart to start fresh
    s.delete(f"{BASE_URL}/api/carts/me")
    return s


class TestCart:
    def test_add_get_merges_and_hydrates(self, api, authed_client):
        prods = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=2").json()
        p1, p2 = prods[0], prods[1]

        r = authed_client.post(f"{BASE_URL}/api/carts/me/items", json={"product_id": p1["id"], "quantity": 2})
        assert r.status_code == 200
        cart = r.json()
        assert cart["item_count"] == 2
        assert len(cart["items"]) == 1
        item = cart["items"][0]
        assert item["product"]["id"] == p1["id"]
        assert item["line_total"] == round(p1["price"] * 2, 2)
        assert cart["subtotal"] == round(p1["price"] * 2, 2)

        # add another product
        r2 = authed_client.post(f"{BASE_URL}/api/carts/me/items", json={"product_id": p2["id"], "quantity": 1})
        cart2 = r2.json()
        assert len(cart2["items"]) == 2
        assert cart2["item_count"] == 3

        # re-add p1 → merge quantity, no duplicate
        r3 = authed_client.post(f"{BASE_URL}/api/carts/me/items", json={"product_id": p1["id"], "quantity": 1})
        cart3 = r3.json()
        assert len(cart3["items"]) == 2
        p1_item = next(i for i in cart3["items"] if i["product_id"] == p1["id"])
        assert p1_item["quantity"] == 3

        # GET verifies persistence
        g = authed_client.get(f"{BASE_URL}/api/carts/me")
        assert g.status_code == 200
        assert g.json()["item_count"] == 4

    def test_update_and_delete_items(self, api, authed_client):
        # start with a fresh cart
        authed_client.delete(f"{BASE_URL}/api/carts/me")
        prods = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=1").json()
        p = prods[0]
        r = authed_client.post(f"{BASE_URL}/api/carts/me/items", json={"product_id": p["id"], "quantity": 1})
        item_id = r.json()["items"][0]["id"]

        u = authed_client.patch(f"{BASE_URL}/api/carts/me/items/{item_id}", json={"quantity": 5})
        assert u.status_code == 200
        assert u.json()["items"][0]["quantity"] == 5
        assert u.json()["item_count"] == 5

        d = authed_client.delete(f"{BASE_URL}/api/carts/me/items/{item_id}")
        assert d.status_code == 200
        assert d.json()["item_count"] == 0

    def test_clear_cart(self, api, authed_client):
        prods = api.get(f"{BASE_URL}/api/mart/products?country=CI&limit=1").json()
        authed_client.post(f"{BASE_URL}/api/carts/me/items", json={"product_id": prods[0]["id"], "quantity": 2})
        r = authed_client.delete(f"{BASE_URL}/api/carts/me")
        assert r.status_code == 200
        assert r.json()["item_count"] == 0

    def test_cart_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/carts/me")
        assert r.status_code in (401, 403)


# ---------- AI ----------
class TestAI:
    def test_ai_search_returns_products(self, api):
        r = api.post(f"{BASE_URL}/api/ai/search", json={
            "query": "petit-déjeuner rapide",
            "country": "CI",
            "module": "mart",
        }, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "filters" in data and "products" in data
        assert isinstance(data["products"], list)
        # products may be empty if AI didn't return matches, but keys must exist
        f = data["filters"]
        assert set(["intent", "categories", "keywords", "summary"]).issubset(f.keys())

    def test_ai_insights_requires_admin(self, api, authed_client):
        r = authed_client.post(f"{BASE_URL}/api/ai/insights", json={"country": "CI"})
        assert r.status_code == 403
