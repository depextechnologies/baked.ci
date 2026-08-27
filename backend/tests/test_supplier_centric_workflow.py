"""Fixing_Prompt v5 — Supplier-centric admin workflow backend tests.

Covers:
 * GET  /api/admin/modules/mart/suppliers/{sid}                    — snapshot
 * GET  /api/admin/modules/mart/suppliers/{sid}/products           — filtered list
 * POST /api/admin/modules/mart/suppliers/product-requests/bulk-approve
 * POST /api/admin/modules/mart/suppliers/product-requests/bulk-reject
 * Homepage /api/mart/products?category=... — zero cross-category leakage
"""
from __future__ import annotations
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
DELTA_EMAIL = "demo-delta-supplier@test.example"
DELTA_PASSWORD = "Supplier1234!"
DELTA_ID = "sup_demo_delta_seed"


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30)
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sup_headers():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _pick_category(country="CI"):
    r = requests.get(f"{API}/mart/categories?country={country}", timeout=15).json()
    cats = r if isinstance(r, list) else r.get("items", [])
    return cats[0]  # {id, slug, name, ...}


# ---------------------------------------------------------------------------
# 1) Supplier detail endpoint
# ---------------------------------------------------------------------------

class TestSupplierDetail:
    def test_snapshot(self, sa_headers):
        r = requests.get(f"{API}/admin/modules/mart/suppliers/{DELTA_ID}",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # required top-level keys
        for k in ("supplier", "warehouse_assignments", "product_buckets", "audit_trail"):
            assert k in d
        assert d["supplier"]["id"] == DELTA_ID
        assert d["supplier"]["status"] == "approved"

    def test_snapshot_404(self, sa_headers):
        r = requests.get(f"{API}/admin/modules/mart/suppliers/sup_does_not_exist",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 404

    def test_snapshot_requires_admin(self):
        r = requests.get(f"{API}/admin/modules/mart/suppliers/{DELTA_ID}", timeout=15)
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2) Supplier products list with filters
# ---------------------------------------------------------------------------

class TestSupplierProducts:
    def test_empty_ok(self, sa_headers):
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/{DELTA_ID}/products?status=all",
            headers=sa_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "buckets" in d

    def test_seed_and_list(self, sa_headers, sup_headers):
        # Create a product request as the supplier
        cat = _pick_category("CI")
        payload = {
            "proposed_name": f"AUTOTEST-{uuid.uuid4().hex[:6]} Cola 33cl",
            "proposed_category_id": cat["id"],
            "proposed_manufacturer": "AutoBev",
            "proposed_pack_size": "33cl",
            "proposed_cost_price": 400,
            "proposed_currency": "XOF",
            "proposed_moq": 24,
            "proposed_lead_time_days": 2,
        }
        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        req_id = r.json()["id"]

        # It should appear under the supplier
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/{DELTA_ID}/products?status=pending",
            headers=sa_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        ids = [it["id"] for it in d["items"]]
        assert req_id in ids
        assert d["buckets"]["pending"] >= 1

        # Category filter should not drop it
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/{DELTA_ID}/products?category={cat['slug']}",
            headers=sa_headers, timeout=15)
        assert r.status_code == 200
        assert req_id in [it["id"] for it in r.json()["items"]]

        # Search filter
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/{DELTA_ID}/products?q=AutoBev",
            headers=sa_headers, timeout=15)
        assert r.status_code == 200
        assert req_id in [it["id"] for it in r.json()["items"]]

        # Cleanup: reject so we don't leave orphan pending
        requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/{req_id}/reject",
            headers=sa_headers, json={"notes": "autotest cleanup"}, timeout=15)


# ---------------------------------------------------------------------------
# 3) Bulk approve / reject
# ---------------------------------------------------------------------------

class TestBulkActions:
    def _create(self, sup_headers, name):
        cat = _pick_category("CI")
        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": name,
                                "proposed_category_id": cat["id"],
                                "proposed_cost_price": 100,
                                "proposed_currency": "XOF"},
                          timeout=15)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def test_bulk_reject(self, sa_headers, sup_headers):
        ids = [self._create(sup_headers, f"AUTOREJ-{uuid.uuid4().hex[:6]}")
               for _ in range(2)]
        r = requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/bulk-reject",
            headers=sa_headers,
            json={"request_ids": ids, "notes": "autotest bulk reject"},
            timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["rejected"]) == 2
        assert len(d["skipped"]) == 0

    def test_bulk_approve(self, sa_headers, sup_headers):
        ids = [self._create(sup_headers, f"AUTOAPP-{uuid.uuid4().hex[:6]} Item {i}")
               for i in range(2)]
        r = requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/bulk-approve",
            headers=sa_headers,
            json={"request_ids": ids, "notes": "autotest bulk approve",
                  "link_at_supplier_cost": True},
            timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["approved"]) == 2
        for row in d["approved"]:
            assert row["master_product_id"]

    def test_bulk_reject_skips_non_pending(self, sa_headers, sup_headers):
        rid = self._create(sup_headers, f"AUTOSKIP-{uuid.uuid4().hex[:6]}")
        # Reject once (status -> rejected)
        requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/bulk-reject",
            headers=sa_headers,
            json={"request_ids": [rid], "notes": "first"}, timeout=15)
        # Second call must skip
        r = requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/bulk-reject",
            headers=sa_headers,
            json={"request_ids": [rid], "notes": "second"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["rejected"]) == 0
        assert len(d["skipped"]) == 1
        assert d["skipped"][0]["reason"] == "not_pending"


# ---------------------------------------------------------------------------
# 4) Homepage category filtering — zero cross-category leakage
# ---------------------------------------------------------------------------

class TestHomepageCategoryFilter:
    def test_products_scoped_to_category(self):
        r = requests.get(f"{API}/mart/categories?country=CI", timeout=15)
        cats = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert len(cats) >= 2
        for cat in cats[:3]:
            slug = cat["slug"]
            r = requests.get(
                f"{API}/mart/products?country=CI&category={slug}&limit=20", timeout=15)
            assert r.status_code == 200
            items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
            for p in items:
                # Every product returned MUST belong to the requested category.
                assert p.get("category_slug") == slug, (
                    f"Cross-category leak: requested={slug} got={p.get('category_slug')} name={p.get('name')}"
                )
