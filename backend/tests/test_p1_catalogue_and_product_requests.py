"""P1 tests — categories endpoint, master-products search, product-request happy path,
   and admin approval flow."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

SUPPLIER_EMAIL = "demo-delta-supplier@test.example"
SUPPLIER_PASSWORD = "Supplier1234!"
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def supplier_token():
    r = requests.post(
        f"{BASE_URL}/api/martbaked/sellers/login",
        json={"email": SUPPLIER_EMAIL, "password": SUPPLIER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Supplier login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No admin token: {data}"
    return tok


def _sh(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Categories endpoint ----------

class TestCategoriesEndpoint:
    def test_unauth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/supplier/me/categories", timeout=15)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text[:200]}"

    def test_categories_returns_items_with_slug(self, supplier_token):
        r = requests.get(f"{BASE_URL}/api/supplier/me/categories", headers=_sh(supplier_token), timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "items" in data
        items = data["items"]
        assert isinstance(items, list) and len(items) >= 3, f"Expected >=3 categories, got {len(items)}"
        for it in items:
            assert {"id", "name", "slug"}.issubset(it.keys()), f"Missing keys: {it}"
        slugs = {it["slug"] for it in items}
        # CI supplier — expect at least these known slugs from seed
        expected_any = {"beverages", "bakery", "dairy-eggs"}
        assert expected_any & slugs, f"Expected one of {expected_any} in {slugs}"


# ---------- Master products search ----------

class TestMasterProductsSearch:
    def test_unauth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/supplier/me/catalogue/master-products?q=lait", timeout=15)
        assert r.status_code == 401

    def test_search_lait_case_insensitive(self, supplier_token):
        r = requests.get(
            f"{BASE_URL}/api/supplier/me/catalogue/master-products",
            params={"q": "lait"},
            headers=_sh(supplier_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        items = r.json().get("items", [])
        assert isinstance(items, list)
        # Every returned item name/sku should contain "lait" ci
        if items:
            for it in items:
                hay = f"{it.get('name','')} {it.get('sku','')}".lower()
                assert "lait" in hay, f"Row does not match 'lait': {it}"

        # Case-insensitive check
        r2 = requests.get(
            f"{BASE_URL}/api/supplier/me/catalogue/master-products",
            params={"q": "LAIT"},
            headers=_sh(supplier_token),
            timeout=15,
        )
        assert r2.status_code == 200
        assert len(r2.json().get("items", [])) == len(items), "Case-insensitive search mismatch"


# ---------- Product request happy path + admin approve ----------

class TestProductRequestFlow:
    def test_create_and_admin_approve(self, supplier_token, admin_token):
        # Get a category for supplier's country
        rc = requests.get(f"{BASE_URL}/api/supplier/me/categories", headers=_sh(supplier_token), timeout=15)
        assert rc.status_code == 200
        cats = rc.json()["items"]
        assert cats, "No categories to pick from"
        cat = cats[0]

        unique = uuid.uuid4().hex[:8].upper()
        payload = {
            "proposed_name": f"TEST_ProdReq_{unique}",
            "proposed_category_id": cat["id"],
            "proposed_ean_upc": f"999{unique[:10]}",
            "proposed_manufacturer": "TEST Manufacturer",
            "proposed_pack_size": "12x500ml",
            "proposed_cost_price": 1234.56,
            "proposed_currency": "XOF",
            "proposed_moq": 5,
            "proposed_lead_time_days": 3,
            "notes": "pytest submission",
        }
        r = requests.post(
            f"{BASE_URL}/api/supplier/me/product-requests",
            json=payload, headers=_sh(supplier_token), timeout=20,
        )
        assert r.status_code == 201, f"Create failed: {r.status_code} {r.text[:300]}"
        req = r.json()
        assert req["status"] == "pending"
        assert req["proposed_name"] == payload["proposed_name"]
        req_id = req["id"]

        # Verify supplier sees it in list
        rl = requests.get(f"{BASE_URL}/api/supplier/me/product-requests", headers=_sh(supplier_token), timeout=15)
        assert rl.status_code == 200
        ids = {i["id"] for i in rl.json()["items"]}
        assert req_id in ids

        # Admin list — should include the new request
        ra = requests.get(
            f"{BASE_URL}/api/admin/modules/mart/suppliers/product-requests",
            params={"status": "pending"},
            headers=_sh(admin_token), timeout=20,
        )
        assert ra.status_code == 200, ra.text[:300]
        adata = ra.json()
        aids = {i["id"] for i in adata["items"]}
        assert req_id in aids, f"Admin does not see new request {req_id}"
        assert "buckets" in adata

        # Admin approve — this creates a master product + auto-links supplier
        approve_payload = {
            "name": payload["proposed_name"],
            "category_id": cat["id"],
            "manufacturer": payload["proposed_manufacturer"],
            "ean_upc": payload["proposed_ean_upc"],
            "pack_size": payload["proposed_pack_size"],
            "mrp": 1999.99,
            "tax_pct": 18,
            "link_at_supplier_cost": True,
            "notes": "pytest approval",
        }
        rap = requests.post(
            f"{BASE_URL}/api/admin/modules/mart/suppliers/product-requests/{req_id}/approve",
            json=approve_payload, headers=_sh(admin_token), timeout=30,
        )
        assert rap.status_code == 200, f"Approve failed: {rap.status_code} {rap.text[:400]}"
        result = rap.json()
        assert "master_product_id" in result
        assert result["request"]["status"] == "approved"

        # Verify supplier list shows approved status
        rl2 = requests.get(f"{BASE_URL}/api/supplier/me/product-requests", headers=_sh(supplier_token), timeout=15)
        assert rl2.status_code == 200
        row = next((i for i in rl2.json()["items"] if i["id"] == req_id), None)
        assert row is not None
        assert row["status"] == "approved"
        assert row.get("created_master_product_id") == result["master_product_id"]

    def test_admin_reject_flow(self, supplier_token, admin_token):
        # Create a second one to reject
        rc = requests.get(f"{BASE_URL}/api/supplier/me/categories", headers=_sh(supplier_token), timeout=15)
        cat = rc.json()["items"][0]
        payload = {
            "proposed_name": f"TEST_Reject_{uuid.uuid4().hex[:6]}",
            "proposed_category_id": cat["id"],
            "proposed_cost_price": 10.0,
        }
        r = requests.post(f"{BASE_URL}/api/supplier/me/product-requests",
                          json=payload, headers=_sh(supplier_token), timeout=15)
        assert r.status_code == 201
        req_id = r.json()["id"]

        rr = requests.post(
            f"{BASE_URL}/api/admin/modules/mart/suppliers/product-requests/{req_id}/reject",
            json={"notes": "pytest rejection reason"},
            headers=_sh(admin_token), timeout=15,
        )
        assert rr.status_code == 200, rr.text[:300]
        assert rr.json()["status"] == "rejected"
