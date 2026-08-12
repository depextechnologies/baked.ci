"""MASTER COMPLETION PROGRAM Phase 2 — Catalog + Inventory + Approvals

Backend regression for:
  * Admin CRUD: /admin/mart/{categories,subcategories,brands,products}
  * Partner Product Approval queue + approve/reject/request-changes
  * Partner Inventory list + Adjust + Movements ledger
  * Guardrails: never-negative stock, dup approval → 409, category-with-subs → 409
"""
from __future__ import annotations
import os
import pathlib
import uuid
import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASS  = "baked@2026#!$@"
PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASS  = "Alpha1234!Beta"


# ------------------- fixtures -------------------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def partner_headers():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def suffix():
    return uuid.uuid4().hex[:8]


# ------------------- Admin: Categories -------------------
class TestAdminCategories:
    created_id = None
    child_sub_id = None

    def test_list_categories(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/mart/categories?country=CI",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_category(self, admin_headers, suffix):
        payload = {"slug": f"test-cat-{suffix}", "country": "CI",
                   "name": "TEST Category", "order": 99}
        r = requests.post(f"{BASE_URL}/api/admin/mart/categories",
                          headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["slug"] == payload["slug"]
        assert j["country"] == "CI"
        TestAdminCategories.created_id = j["id"]

    def test_patch_category(self, admin_headers):
        cid = TestAdminCategories.created_id
        assert cid
        r = requests.patch(f"{BASE_URL}/api/admin/mart/categories/{cid}",
                           headers=admin_headers,
                           json={"name": "TEST Category (updated)"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST Category (updated)"

    def test_create_subcategory_under_category(self, admin_headers, suffix):
        cid = TestAdminCategories.created_id
        assert cid
        payload = {"slug": f"test-sub-{suffix}", "category_id": cid,
                   "country": "CI", "name": "TEST Sub"}
        r = requests.post(f"{BASE_URL}/api/admin/mart/subcategories",
                          headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        TestAdminCategories.child_sub_id = r.json()["id"]

    def test_delete_category_with_subs_returns_409(self, admin_headers):
        cid = TestAdminCategories.created_id
        r = requests.delete(f"{BASE_URL}/api/admin/mart/categories/{cid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 409, r.text

    def test_delete_subcategory(self, admin_headers):
        sid = TestAdminCategories.child_sub_id
        r = requests.delete(f"{BASE_URL}/api/admin/mart/subcategories/{sid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 204

    def test_delete_category_after_sub_removed(self, admin_headers):
        cid = TestAdminCategories.created_id
        r = requests.delete(f"{BASE_URL}/api/admin/mart/categories/{cid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 204


# ------------------- Admin: Brands -------------------
class TestAdminBrands:
    created_id = None

    def test_create_brand(self, admin_headers, suffix):
        payload = {"slug": f"test-brand-{suffix}", "name": "TEST Brand",
                   "country": "CI", "is_active": True}
        r = requests.post(f"{BASE_URL}/api/admin/mart/brands",
                          headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        TestAdminBrands.created_id = r.json()["id"]

    def test_list_brands(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/mart/brands?country=CI",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert any(b["id"] == TestAdminBrands.created_id for b in r.json())

    def test_patch_brand(self, admin_headers):
        r = requests.patch(f"{BASE_URL}/api/admin/mart/brands/{TestAdminBrands.created_id}",
                           headers=admin_headers,
                           json={"description": "updated"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["description"] == "updated"

    def test_delete_brand(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/mart/brands/{TestAdminBrands.created_id}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 204


# ------------------- Admin: Products (master catalog) -------------------
class TestAdminProducts:
    created_id = None

    def test_create_product(self, admin_headers, suffix):
        payload = {
            "name": f"TEST Master Product {suffix}",
            "country": "CI",
            "price": 1250,
            "currency": "XOF",
            "sku_code": f"TEST-SKU-{suffix}",
            "barcode": f"BAR{suffix}",
            "status": "active",
        }
        r = requests.post(f"{BASE_URL}/api/admin/mart/products",
                          headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["sku_code"] == payload["sku_code"]
        TestAdminProducts.created_id = j["id"]

    def test_search_by_sku(self, admin_headers, suffix):
        r = requests.get(f"{BASE_URL}/api/admin/mart/products",
                         headers=admin_headers,
                         params={"q": f"TEST-SKU-{suffix}"}, timeout=15)
        assert r.status_code == 200
        assert any(i["id"] == TestAdminProducts.created_id for i in r.json()["items"])

    def test_patch_product(self, admin_headers):
        r = requests.patch(f"{BASE_URL}/api/admin/mart/products/{TestAdminProducts.created_id}",
                           headers=admin_headers,
                           json={"price": 1500}, timeout=15)
        assert r.status_code == 200
        assert float(r.json()["price"]) == 1500

    def test_soft_delete_product(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/mart/products/{TestAdminProducts.created_id}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 204


# ------------------- Partner Inventory + Movements -------------------
class TestPartnerInventoryAndApproval:
    partner_product_id = None
    initial_available = None
    custom_pp_id = None

    def test_list_inventory(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/partner/inventory",
                         headers=partner_headers, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "items" in j and "summary" in j
        for key in ("total", "low", "out_of_stock", "total_available", "total_reserved"):
            assert key in j["summary"]
        if j["items"]:
            first = j["items"][0]
            for k in ("available_qty", "reserved_qty", "damaged_qty", "expired_qty"):
                assert k in first
            TestPartnerInventoryAndApproval.partner_product_id = first["partner_product_id"]
            TestPartnerInventoryAndApproval.initial_available  = first["available_qty"]

    def test_adjust_receive_10(self, partner_headers):
        pp = TestPartnerInventoryAndApproval.partner_product_id
        if not pp:
            pytest.skip("no partner product for adjust test")
        r = requests.post(f"{BASE_URL}/api/partner/inventory/{pp}/adjust",
                          headers=partner_headers,
                          json={"kind": "receive", "delta_qty": 10,
                                "reason": "TEST receive +10"}, timeout=15)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j["movement"]["kind"] == "receive"
        assert j["movement"]["delta_qty"] == 10
        assert j["inventory"]["available_qty"] == TestPartnerInventoryAndApproval.initial_available + 10
        assert j["movement"]["balance_after"] == j["inventory"]["available_qty"]

    def test_movements_shows_receive(self, partner_headers):
        pp = TestPartnerInventoryAndApproval.partner_product_id
        r = requests.get(f"{BASE_URL}/api/partner/inventory/movements",
                         headers=partner_headers,
                         params={"partner_product_id": pp}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["items"], "movement not persisted"
        latest = j["items"][0]
        assert latest["kind"] == "receive"
        assert latest["delta_qty"] == 10

    def test_adjust_remove_more_than_available_returns_409(self, partner_headers):
        pp = TestPartnerInventoryAndApproval.partner_product_id
        r = requests.post(f"{BASE_URL}/api/partner/inventory/{pp}/adjust",
                          headers=partner_headers,
                          json={"kind": "adjustment_remove",
                                "delta_qty": 10_000_000,
                                "reason": "TEST over-remove"}, timeout=15)
        assert r.status_code == 409, r.text

    def test_by_location_report(self, partner_headers):
        r = requests.get(f"{BASE_URL}/api/partner/inventory/by-location",
                         headers=partner_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "locations" in j and "counts" in j

    # ---- Approval workflow ----
    def test_partner_creates_custom_pending(self, partner_headers, suffix):
        payload = {
            "name": f"TEST_Custom Phase2 {suffix}",
            "brand": "TEST Brand",
            "unit": "pcs",
            "partner_price": 500,
            "stock_qty": 5,
        }
        r = requests.post(f"{BASE_URL}/api/partner/products/custom",
                          headers=partner_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        j = r.json()
        assert j.get("approval_status") == "pending", f"expected pending, got {j.get('approval_status')}"
        assert j.get("is_active") is False, "custom SKU must be inactive until approval"
        TestPartnerInventoryAndApproval.custom_pp_id = j["id"]

    def test_admin_sees_pending_product(self, admin_headers):
        pp_id = TestPartnerInventoryAndApproval.custom_pp_id
        r = requests.get(f"{BASE_URL}/api/admin/mart/partner-products",
                         headers=admin_headers,
                         params={"status": "pending"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "buckets" in j and "pending" in j["buckets"]
        assert any(i["id"] == pp_id for i in j["items"])

    def test_reject_without_notes_returns_400(self, admin_headers):
        pp_id = TestPartnerInventoryAndApproval.custom_pp_id
        r = requests.post(f"{BASE_URL}/api/admin/mart/partner-products/{pp_id}/reject",
                          headers=admin_headers, json={}, timeout=15)
        assert r.status_code == 400, r.text

    def test_approve_partner_product(self, admin_headers):
        pp_id = TestPartnerInventoryAndApproval.custom_pp_id
        r = requests.post(f"{BASE_URL}/api/admin/mart/partner-products/{pp_id}/approve",
                          headers=admin_headers,
                          json={"notes": "LGTM"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["approval_status"] == "approved"
        assert j["is_active"] is True

    def test_double_approve_returns_409(self, admin_headers):
        pp_id = TestPartnerInventoryAndApproval.custom_pp_id
        r = requests.post(f"{BASE_URL}/api/admin/mart/partner-products/{pp_id}/approve",
                          headers=admin_headers,
                          json={"notes": "again"}, timeout=15)
        assert r.status_code == 409, r.text

    def test_cleanup_delete_custom_product(self, partner_headers):
        pp_id = TestPartnerInventoryAndApproval.custom_pp_id
        if not pp_id:
            return
        r = requests.delete(f"{BASE_URL}/api/partner/products/{pp_id}",
                            headers=partner_headers, timeout=15)
        assert r.status_code in (204, 404, 409)
