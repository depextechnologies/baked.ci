"""P2 acceptance tests — Product-request approval feedback loop + Supplier
category-request submission end-to-end.

Coverage:
  - Supplier login -> POST/GET /api/supplier/me/category-requests
  - PATCH /api/supplier/me/product-requests/{id}: only on rejected
  - Admin list category-requests filters by kind=supplier, shows supplier_name
  - Admin approve category-request creates MartCategory + supplier notification
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SUPPLIER_EMAIL = "demo-delta-supplier@test.example"
SUPPLIER_PASSWORD = "Supplier1234!"
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def supplier_headers():
    r = requests.post(f"{BASE_URL}/api/martbaked/sellers/login",
                      json={"email": SUPPLIER_EMAIL, "password": SUPPLIER_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def supplier_id(supplier_headers):
    r = requests.get(f"{BASE_URL}/api/supplier/me", headers=supplier_headers)
    assert r.status_code == 200
    return r.json()["id"]


# ---------------------------------------------------------------- category req
class TestSupplierCategoryRequests:
    def test_create_category_request(self, supplier_headers):
        name = f"TEST_CatReq_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/supplier/me/category-requests",
                          headers=supplier_headers,
                          json={"name": name, "reason": "Automation test"})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["name"] == name
        assert d["requester_kind"] == "supplier"
        assert d["supplier_id"] is not None
        assert d["partner_id"] is None
        assert d["status"] == "pending"
        pytest.cat_req_id = d["id"]
        pytest.cat_req_name = name

    def test_list_returns_only_supplier_own(self, supplier_headers):
        r = requests.get(f"{BASE_URL}/api/supplier/me/category-requests",
                         headers=supplier_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["id"] == pytest.cat_req_id for i in items)
        # All must be supplier-kind
        assert all(i["requester_kind"] == "supplier" for i in items)

    def test_admin_sees_supplier_request(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/mart/category-requests",
            headers=admin_headers,
            params={"status": "pending", "kind": "supplier"},
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        match = next((i for i in items if i["id"] == pytest.cat_req_id), None)
        assert match is not None, "Supplier request not visible to admin"
        assert match["requester_kind"] == "supplier"
        assert match["supplier_name"]  # populated

    def test_admin_approve_creates_category_and_notifies(self, admin_headers, supplier_headers, supplier_id):
        r = requests.post(
            f"{BASE_URL}/api/admin/mart/category-requests/{pytest.cat_req_id}/approve",
            headers=admin_headers, json={})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        assert d["approved_category_id"]
        # Supplier notification
        time.sleep(0.5)
        rn = requests.get(f"{BASE_URL}/api/supplier/me/notifications",
                          headers=supplier_headers)
        assert rn.status_code == 200
        notifs = rn.json().get("items", rn.json() if isinstance(rn.json(), list) else [])
        assert any(n.get("kind") == "category_request_approved"
                   and n.get("entity_id") == pytest.cat_req_id
                   for n in notifs), f"category_request_approved notification not found: {notifs[:3]}"


# ------------------------------------------------------- product-request PATCH
class TestProductRequestResubmit:
    def test_setup_create_and_reject(self, supplier_headers, admin_headers):
        # Create
        name = f"TEST_ProdReq_P2_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/supplier/me/product-requests",
                          headers=supplier_headers,
                          json={"proposed_name": name,
                                "proposed_cost_price": 100.0,
                                "proposed_moq": 5,
                                "proposed_lead_time_days": 2})
        assert r.status_code == 201, r.text
        pytest.pr_id = r.json()["id"]

        # Admin rejects
        rj = requests.post(
            f"{BASE_URL}/api/admin/modules/mart/suppliers/product-requests/{pytest.pr_id}/reject",
            headers=admin_headers, json={"notes": "Please add EAN and pack size."})
        assert rj.status_code == 200, rj.text
        assert rj.json()["status"] == "rejected"

    def test_patch_only_works_on_rejected(self, supplier_headers):
        r = requests.patch(
            f"{BASE_URL}/api/supplier/me/product-requests/{pytest.pr_id}",
            headers=supplier_headers,
            json={"proposed_name": "TEST_Revised", "proposed_ean_upc": "1234567890123",
                  "proposed_pack_size": "6x330ml", "proposed_cost_price": 110.0,
                  "proposed_moq": 5, "proposed_lead_time_days": 2})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        assert d["review_notes"] is None
        assert d["reviewed_at"] is None
        assert d["proposed_ean_upc"] == "1234567890123"

    def test_patch_on_pending_returns_409(self, supplier_headers):
        # It is now pending — second PATCH should 409
        r = requests.patch(
            f"{BASE_URL}/api/supplier/me/product-requests/{pytest.pr_id}",
            headers=supplier_headers,
            json={"proposed_name": "TEST_Revised_2"})
        assert r.status_code == 409, r.text

    def test_get_reflects_pending(self, supplier_headers):
        r = requests.get(f"{BASE_URL}/api/supplier/me/product-requests",
                         headers=supplier_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        m = next((i for i in items if i["id"] == pytest.pr_id), None)
        assert m and m["status"] == "pending" and m["review_notes"] is None
