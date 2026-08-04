"""Backend tests for MARTbakēd Partner Slices 5-7: Products, Orders, Wallet."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
PARTNER_EMAIL = "e2e-portal@test.example"
PARTNER_PASSWORD = "MyNewPortalPassword123!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def partner_token(api):
    r = api.post(f"{BASE_URL}/api/partner/auth/login",
                 json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth(api, partner_token):
    api.headers.update({"Authorization": f"Bearer {partner_token}"})
    return api


# -------------------------- AUTH GUARDS --------------------------
class TestAuthGuards:
    def test_products_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/partner/products")
        assert r.status_code == 401

    def test_orders_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/partner/orders")
        assert r.status_code == 401

    def test_wallet_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/partner/wallet")
        assert r.status_code == 401


# -------------------------- DASHBOARD --------------------------
class TestDashboard:
    def test_dashboard(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/dashboard")
        assert r.status_code == 200, r.text
        data = r.json()
        # non-zero-ish metrics keys expected
        assert "metrics" in data or "orders_today" in data or "products_live" in data, data
        print("Dashboard payload keys:", list(data.keys()))


# -------------------------- PRODUCTS --------------------------
class TestProducts:
    created_custom_id = None
    linked_master_id = None

    def test_list_products(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/products")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data and "live" in data
        print(f"Existing products: total={data['total']} live={data['live']}")

    def test_master_catalog_search(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/master-catalog", params={"limit": 10})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        print(f"Master catalog items: {len(data['items'])}")

    def test_link_master_and_verify(self, auth):
        # find an unlinked master product
        r = auth.get(f"{BASE_URL}/api/partner/master-catalog", params={"limit": 50})
        assert r.status_code == 200
        candidates = [m for m in r.json()["items"] if not m.get("already_linked")]
        if not candidates:
            pytest.skip("No unlinked master products available")
        m = candidates[0]
        payload = {
            "master_product_id": m["id"],
            "partner_price": 1500,
            "stock_qty": 25,
            "low_stock_threshold": 5,
        }
        rr = auth.post(f"{BASE_URL}/api/partner/products/link", json=payload)
        assert rr.status_code == 201, rr.text
        j = rr.json()
        assert j.get("source") == "master"
        assert float(j["partner_price"]) == 1500
        TestProducts.linked_master_id = j["id"]

        # GET verify
        gv = auth.get(f"{BASE_URL}/api/partner/products")
        assert any(i["id"] == j["id"] for i in gv.json()["items"])

    def test_link_master_duplicate_returns_409(self, auth):
        if not TestProducts.linked_master_id:
            pytest.skip("no linked master")
        # get the master_product_id back
        items = auth.get(f"{BASE_URL}/api/partner/products").json()["items"]
        row = next(i for i in items if i["id"] == TestProducts.linked_master_id)
        master_id = row.get("master_product_id")
        if not master_id:
            pytest.skip("row has no master_product_id")
        rr = auth.post(f"{BASE_URL}/api/partner/products/link",
                       json={"master_product_id": master_id, "partner_price": 999, "stock_qty": 1})
        assert rr.status_code == 409, rr.text

    def test_create_custom_and_verify(self, auth):
        payload = {
            "name": "TEST_Custom Baguette",
            "brand": "TEST Brand",
            "unit": "pcs",
            "partner_price": 500,
            "stock_qty": 40,
        }
        r = auth.post(f"{BASE_URL}/api/partner/products/custom", json=payload)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j.get("source") == "custom"
        assert j["name"] == "TEST_Custom Baguette"
        assert float(j["partner_price"]) == 500
        TestProducts.created_custom_id = j["id"]

    def test_update_product(self, auth):
        pid = TestProducts.created_custom_id
        if not pid:
            pytest.skip("no custom product")
        r = auth.patch(f"{BASE_URL}/api/partner/products/{pid}",
                       json={"partner_price": 700, "stock_qty": 12})
        assert r.status_code == 200, r.text
        j = r.json()
        assert float(j["partner_price"]) == 700
        assert j["stock_qty"] == 12

    def test_hide_product_via_is_active(self, auth):
        pid = TestProducts.created_custom_id
        if not pid:
            pytest.skip("no custom product")
        r = auth.patch(f"{BASE_URL}/api/partner/products/{pid}", json={"is_active": False})
        assert r.status_code == 200
        assert r.json()["is_active"] is False

    def test_delete_product(self, auth):
        pid = TestProducts.created_custom_id
        if not pid:
            pytest.skip("no custom product")
        r = auth.delete(f"{BASE_URL}/api/partner/products/{pid}")
        assert r.status_code == 204, r.text
        # verify gone
        items = auth.get(f"{BASE_URL}/api/partner/products").json()["items"]
        assert not any(i["id"] == pid for i in items)


# -------------------------- ORDERS --------------------------
class TestOrders:
    def test_list_orders_with_buckets(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/orders")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "buckets" in data
        for k in ("new", "accepted", "packing", "ready", "handed_off", "completed", "cancelled"):
            assert k in data["buckets"], f"Missing bucket {k}"
        print("Buckets:", data["buckets"])

    def test_invalid_status_filter(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/orders", params={"status": "invalid_x"})
        assert r.status_code == 400

    def test_get_order_detail(self, auth):
        lst = auth.get(f"{BASE_URL}/api/partner/orders").json()["items"]
        if not lst:
            pytest.skip("no orders in system")
        po_id = lst[0]["id"]
        r = auth.get(f"{BASE_URL}/api/partner/orders/{po_id}")
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "address" in j and "status" in j

    def test_state_machine_invalid_transition_409(self, auth):
        # Find an order in status=new
        r = auth.get(f"{BASE_URL}/api/partner/orders", params={"status": "new"})
        if r.status_code != 200 or not r.json()["items"]:
            pytest.skip("no 'new' order to test invalid transition")
        po_id = r.json()["items"][0]["id"]
        # new -> completed is invalid
        rr = auth.post(f"{BASE_URL}/api/partner/orders/{po_id}/status", json={"status": "completed"})
        assert rr.status_code == 409, rr.text

    def test_full_state_machine_and_wallet_credit(self, auth):
        # Locate a 'new' order
        r = auth.get(f"{BASE_URL}/api/partner/orders", params={"status": "new"})
        if r.status_code != 200 or not r.json()["items"]:
            pytest.skip("no 'new' order available for happy-path")
        po_id = r.json()["items"][0]["id"]

        # snapshot wallet balance before
        w0 = auth.get(f"{BASE_URL}/api/partner/wallet").json()["wallet"]["balance"]

        for status in ("accepted", "packing", "ready", "handed_off"):
            rr = auth.post(f"{BASE_URL}/api/partner/orders/{po_id}/status", json={"status": status})
            assert rr.status_code == 200, f"{status}: {rr.text}"
            assert rr.json()["status"] == status

        # wallet should be credited (net of 10%)
        w1 = auth.get(f"{BASE_URL}/api/partner/wallet").json()["wallet"]["balance"]
        assert float(w1) > float(w0), f"Wallet not credited: before={w0} after={w1}"
        print(f"Wallet credited on handoff: {w0} -> {w1}")

        # handed_off -> completed OK
        rr = auth.post(f"{BASE_URL}/api/partner/orders/{po_id}/status", json={"status": "completed"})
        assert rr.status_code == 200


# -------------------------- WALLET --------------------------
class TestWallet:
    def test_get_wallet(self, auth):
        r = auth.get(f"{BASE_URL}/api/partner/wallet")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "wallet" in j and "transactions" in j
        assert "balance" in j["wallet"]

    def test_topup(self, auth):
        before = auth.get(f"{BASE_URL}/api/partner/wallet").json()["wallet"]["balance"]
        r = auth.post(f"{BASE_URL}/api/partner/wallet/topup",
                      json={"amount": 5000, "method": "card"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("MOCKED") is True
        after = j["wallet"]["balance"]
        assert float(after) == pytest.approx(float(before) + 5000, rel=1e-3)

    def test_topup_invalid_method(self, auth):
        r = auth.post(f"{BASE_URL}/api/partner/wallet/topup",
                      json={"amount": 100, "method": "bitcoin"})
        assert r.status_code == 422

    def test_withdraw_success(self, auth):
        # top up first to guarantee balance
        auth.post(f"{BASE_URL}/api/partner/wallet/topup", json={"amount": 3000, "method": "card"})
        before = auth.get(f"{BASE_URL}/api/partner/wallet").json()["wallet"]["balance"]
        r = auth.post(f"{BASE_URL}/api/partner/wallet/withdraw",
                      json={"amount": 1000, "destination": "bank"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("MOCKED") is True
        after = j["wallet"]["balance"]
        assert float(after) == pytest.approx(float(before) - 1000, rel=1e-3)

    def test_withdraw_insufficient(self, auth):
        r = auth.post(f"{BASE_URL}/api/partner/wallet/withdraw",
                      json={"amount": 999_999_999, "destination": "bank"})
        assert r.status_code == 400


# -------------------------- WAREHOUSE REGRESSION --------------------------
class TestWarehouseRegression:
    def test_warehouse_tree_loads(self, auth):
        # Get partner me to find warehouse id
        me = auth.get(f"{BASE_URL}/api/partner/auth/me")
        assert me.status_code == 200, me.text
        dash = auth.get(f"{BASE_URL}/api/partner/dashboard").json()
        wh_id = None
        if isinstance(dash, dict):
            wh_id = (dash.get("warehouse") or {}).get("id") or dash.get("warehouse_id")
        if not wh_id:
            pytest.skip("no warehouse id available on dashboard")
        r = auth.get(f"{BASE_URL}/api/partner/warehouse/{wh_id}/tree")
        assert r.status_code == 200, r.text
