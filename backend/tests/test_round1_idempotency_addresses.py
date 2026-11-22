# Round 1 stabilization: MART/SHOP checkout idempotency + saved address book
import os
import random
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
LAT, LNG = 5.35, -3.99


def _login(phone):
    s = requests.Session()
    r = s.post(f"{API}/auth/otp/request", json={"country_code": "CI", "phone": phone}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    v = s.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]}, timeout=30)
    assert v.status_code == 200, v.text
    vd = v.json()
    tok = vd.get("token") or vd.get("session_token") or vd.get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cust():
    # fresh TEST customer so we never touch the shared account's book
    phone = f"070129{random.randint(1000, 9999)}"
    return _login(phone)


def _addr(label, **kw):
    b = {"label": label, "line1": f"TEST_{label} street", "city": "Abidjan", "country": "CI",
         "latitude": LAT, "longitude": LNG}
    b.update(kw)
    return b


def _mart_product(s):
    r = s.get(f"{API}/mart/products?country=CI&limit=20", timeout=30)
    prods = [p for p in r.json() if p.get("in_stock")]
    assert prods
    return prods


def _fill_mart_cart(s):
    s.delete(f"{API}/carts/me", timeout=30)
    for p in _mart_product(s)[:1]:
        r = s.post(f"{API}/carts/me/items", json={"product_id": p["id"], "quantity": 1}, timeout=30)
        assert r.status_code == 200, r.text


# ---------- Address book ----------
class TestAddressBook:
    def test_first_default_recipient_and_ordering(self, cust):
        r = cust.post(f"{API}/customers/me/addresses", json=_addr("Home", recipient_name="TEST_Awa", recipient_phone="+2250711111111"), timeout=30)
        assert r.status_code == 200, r.text
        home = r.json()
        assert home["is_default"] is True
        assert home["recipient_name"] == "TEST_Awa" and home["recipient_phone"] == "+2250711111111"
        o = cust.post(f"{API}/customers/me/addresses", json=_addr("Office"), timeout=30).json()
        assert o["is_default"] is False
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert lst[0]["id"] == home["id"]
        assert sum(a["is_default"] for a in lst) == 1
        # create with is_default=true unsets others
        x = cust.post(f"{API}/customers/me/addresses", json=_addr("Other", is_default=True), timeout=30).json()
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert lst[0]["id"] == x["id"] and sum(a["is_default"] for a in lst) == 1
        # patch home default
        p = cust.patch(f"{API}/customers/me/addresses/{home['id']}", json={**_addr("Home", recipient_name="TEST_Awa2"), "is_default": True}, timeout=30)
        assert p.status_code == 200 and p.json()["recipient_name"] == "TEST_Awa2"
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert lst[0]["id"] == home["id"] and lst[0]["recipient_name"] == "TEST_Awa2"
        assert sum(a["is_default"] for a in lst) == 1
        # delete default promotes another
        d = cust.delete(f"{API}/customers/me/addresses/{home['id']}", timeout=30)
        assert d.status_code == 200
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert home["id"] not in [a["id"] for a in lst]
        assert len(lst) == 2 and sum(a["is_default"] for a in lst) == 1
        # delete foreign / unknown id -> 404
        assert cust.delete(f"{API}/customers/me/addresses/addr_nope", timeout=30).status_code == 404

    def test_delete_already_deleted_is_404(self, cust):
        a = cust.post(f"{API}/customers/me/addresses", json=_addr("TEST_tmp"), timeout=30).json()
        assert cust.delete(f"{API}/customers/me/addresses/{a['id']}", timeout=30).status_code == 200
        r = cust.delete(f"{API}/customers/me/addresses/{a['id']}", timeout=30)
        assert r.status_code == 404, f"second delete returned {r.status_code}"


# ---------- MART idempotency + address_id ----------
class TestMartOrders:
    def test_idempotent_and_address_snapshot(self, cust):
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        non_default = [a for a in lst if not a["is_default"]][0]
        before = len(lst)
        _fill_mart_cart(cust)
        rid = f"TEST_{uuid.uuid4().hex}"
        body = {"address_id": non_default["id"], "payment_method": "cod", "delivery_slot": "express", "client_request_id": rid}
        r1 = cust.post(f"{API}/orders", json=body, timeout=60)
        assert r1.status_code == 200, r1.text
        oid = r1.json()["id"]
        r2 = cust.post(f"{API}/orders", json=body, timeout=60)
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == oid and r2.json().get("idempotent_replay") is True
        g = cust.get(f"{API}/orders/{oid}", timeout=30).json()
        g = g.get("order", g)
        assert g["address"]["id"] == non_default["id"]
        assert g["address"]["line1"] == non_default["line1"]
        mine = cust.get(f"{API}/orders/me", timeout=30).json()
        items = mine if isinstance(mine, list) else mine.get("items", mine.get("orders", []))
        assert sum(1 for o in items if o["id"] == oid) == 1
        # default unchanged
        lst2 = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert len(lst2) == before
        assert [a["id"] for a in lst2 if a["is_default"]] == [a["id"] for a in lst if a["is_default"]]
        pytest.mart_oid = oid

    def test_without_request_id_and_inline_address_not_in_book(self, cust):
        before = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        _fill_mart_cart(cust)
        body = {"address": {"label": "TEST_inline", "line1": "TEST inline rd", "city": "Abidjan", "country": "CI", "latitude": LAT, "longitude": LNG},
                "payment_method": "cod"}
        r = cust.post(f"{API}/orders", json=body, timeout=60)
        assert r.status_code == 200, r.text
        assert "idempotent_replay" not in r.json()
        after = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        assert len(after) == len(before)
        g = cust.get(f"{API}/orders/{r.json()['id']}", timeout=30).json()
        g = g.get("order", g)
        assert g["address"]["line1"] == "TEST inline rd"

    def test_failed_request_releases_key(self, cust):
        cust.delete(f"{API}/carts/me", timeout=30)
        rid = f"TEST_{uuid.uuid4().hex}"
        lst = cust.get(f"{API}/customers/me/addresses", timeout=30).json()
        body = {"address_id": lst[0]["id"], "payment_method": "cod", "client_request_id": rid}
        r = cust.post(f"{API}/orders", json=body, timeout=60)
        assert r.status_code == 400  # cart empty
        _fill_mart_cart(cust)
        r2 = cust.post(f"{API}/orders", json=body, timeout=60)
        assert r2.status_code == 200, r2.text
        assert "idempotent_replay" not in r2.json()

    def test_admin_sees_order(self):
        oid = getattr(pytest, "mart_oid", None)
        if not oid:
            pytest.skip("no order")
        s = requests.Session()
        r = s.post(f"{API}/admin/auth/login", json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}, timeout=30)
        if r.status_code != 200:
            pytest.skip(f"admin login {r.status_code}")
        tok = r.json().get("token") or r.json().get("access_token")
        if tok:
            s.headers.update({"Authorization": f"Bearer {tok}"})
        a = s.get(f"{API}/admin/modules/mart/orders?limit=50", timeout=30)
        assert a.status_code == 200, a.text
        assert oid in a.text


# ---------- SHOP idempotency ----------
class TestShopCheckout:
    def test_shop_idempotent(self, cust):
        prods = cust.get(f"{API}/shop/products?country=CI&limit=10", timeout=30).json()
        prods = prods if isinstance(prods, list) else prods.get("items", [])
        added = False
        for p in prods:
            r = cust.post(f"{API}/shop/cart/items", json={"variant_id": p["first_variant_id"], "quantity": 1}, timeout=30)
            if r.status_code in (200, 201):
                added = True
                break
        if not added:
            pytest.skip("no shop variant addable")
        rid = f"TEST_{uuid.uuid4().hex}"
        body = {"payment_method": "cash_on_delivery", "client_request_id": rid,
                "delivery_address": {"line1": "TEST shop rd", "city": "Abidjan", "country": "CI", "latitude": LAT, "longitude": LNG,
                                     "recipient_name": "TEST", "recipient_phone": "+2250700000001"}}
        r1 = cust.post(f"{API}/shop/checkout", json=body, timeout=60)
        assert r1.status_code == 201, r1.text
        oid = r1.json()["id"]
        r2 = cust.post(f"{API}/shop/checkout", json=body, timeout=60)
        assert r2.status_code in (200, 201), r2.text
        assert r2.json()["id"] == oid and r2.json().get("idempotent_replay") is True
        mine = cust.get(f"{API}/shop/orders/me", timeout=30).json()["items"]
        assert sum(1 for o in mine if o["id"] == oid) == 1


def test_health():
    r = requests.get(f"{API}/", timeout=30)
    assert r.status_code == 200


# ---------- concurrent duplicate submit (double tap / retry while first in flight) ----------
def test_concurrent_same_request_id_single_order():
    from concurrent.futures import ThreadPoolExecutor
    s = _login(f"070129{random.randint(1000, 9999)}")
    a = s.post(f"{API}/customers/me/addresses", json=_addr("Home"), timeout=30).json()
    _fill_mart_cart(s)
    body = {"address_id": a["id"], "payment_method": "cod", "client_request_id": f"TEST_{uuid.uuid4().hex}"}
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(lambda _: s.post(f"{API}/orders", json=body, timeout=90), range(3)))
    codes = [r.status_code for r in res]
    ids = {r.json()["id"] for r in res if r.status_code == 200}
    assert len(ids) == 1, f"codes={codes} ids={ids}"
    mine = s.get(f"{API}/orders/me", timeout=30).json()
    items = mine if isinstance(mine, list) else mine.get("items", mine.get("orders", []))
    assert len(items) == 1, f"{len(items)} orders created; codes={codes}"
