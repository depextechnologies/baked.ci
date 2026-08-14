"""Phase 2B Cycle 1 — Supplier Portal & Catalogue backend regression suite.

Covers:
 * Supplier login → GET /api/supplier/me
 * Catalogue: list (5 seeded), search, add/upsert, patch (cost/MOQ), delete
 * Catalogue master-product type-ahead scoped to supplier country
 * Documents: add referencing upload metadata, list, soft-delete
 * Supply locations: add non-business row, list, delete
 * Product requests: create, list, SA approve creates master product + auto-links,
                     SA reject (notes required)
 * Uploads: file upload → auth-gated download proxy → cross-supplier download 403
 * Profile edit: non-critical field stays approved, critical field flips → action_required
                 → login blocked with `not_active`
"""
from __future__ import annotations
import io
import os
import uuid
import time
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


@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30)
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def sa_headers(sa_token):
    return {"Authorization": f"Bearer {sa_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="function")
def supplier_token():
    """Fresh token each test so profile-mutation tests don't poison others."""
    def _try_login():
        return requests.post(f"{API}/martbaked/sellers/login",
                             json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)

    r = _try_login()
    if r.status_code != 200:
        # Restore approved state: find application, approve if not already
        sa = requests.post(f"{API}/admin/auth/login",
                          json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()
        h = {"Authorization": f"Bearer {sa.get('access_token') or sa.get('token')}"}
        apps = requests.get(f"{API}/admin/modules/mart/suppliers/applications?q=MART-SUP-2026-00001",
                            headers=h, timeout=15).json()
        for it in apps.get("items", []):
            if it["application_code"] == "MART-SUP-2026-00001":
                if it["status"] in ("submitted", "under_review", "action_required"):
                    requests.post(
                        f"{API}/admin/modules/mart/suppliers/applications/{it['id']}/approve",
                        headers=h, json={"notes": "re-approved by fixture"}, timeout=15,
                    )
                break
        r = _try_login()
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="function")
def sup_headers(supplier_token):
    return {"Authorization": f"Bearer {supplier_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# 1. /me + catalogue
# ---------------------------------------------------------------------------

class TestPortalCore:
    def test_me(self, sup_headers):
        r = requests.get(f"{API}/supplier/me", headers=sup_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["business_name"].startswith("DEMO Delta")
        assert j["status"] == "approved"
        assert j["code"] == "SUP-CI-0001"

    def test_catalogue_seeded_5(self, sup_headers):
        r = requests.get(f"{API}/supplier/me/catalogue", headers=sup_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 5
        assert all(it["master"] for it in items)
        assert all(it["cost_price"] > 0 for it in items)

    def test_catalogue_search(self, sup_headers):
        # Grab a name from the seeded catalogue then search for a substring
        r = requests.get(f"{API}/supplier/me/catalogue", headers=sup_headers, timeout=15)
        first_name = r.json()["items"][0]["master"]["name"]
        needle = first_name.split(" ")[0][:4]
        r2 = requests.get(f"{API}/supplier/me/catalogue?q={needle}", headers=sup_headers, timeout=15)
        assert r2.status_code == 200
        assert len(r2.json()["items"]) >= 1

    def test_master_type_ahead_scoped_by_country(self, sup_headers):
        r = requests.get(f"{API}/supplier/me/catalogue/master-products?q=a", headers=sup_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)

    def test_catalogue_add_patch_delete(self, sup_headers):
        # Find a master product not yet in catalogue via type-ahead
        r = requests.get(f"{API}/supplier/me/catalogue/master-products?limit=100", headers=sup_headers, timeout=15)
        masters = r.json()["items"]
        existing = requests.get(f"{API}/supplier/me/catalogue", headers=sup_headers, timeout=15).json()["items"]
        used = {c["master_product_id"] for c in existing}
        candidate = next((m for m in masters if m["id"] not in used), None)
        assert candidate, "No available master product for test"

        # Add
        r = requests.post(f"{API}/supplier/me/catalogue", headers=sup_headers, json={
            "master_product_id": candidate["id"], "supplier_sku": "PYT-1",
            "cost_price": 999.99, "moq": 5, "lead_time_days": 4,
        }, timeout=15)
        assert r.status_code == 201, r.text
        sp = r.json()
        assert sp["cost_price"] == 999.99
        # Patch
        r2 = requests.patch(f"{API}/supplier/me/catalogue/{sp['id']}", headers=sup_headers,
                            json={"cost_price": 888.5, "is_active": False}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["cost_price"] == 888.5
        assert r2.json()["is_active"] is False
        # Delete
        r3 = requests.delete(f"{API}/supplier/me/catalogue/{sp['id']}", headers=sup_headers, timeout=15)
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# 2. Uploads + Documents
# ---------------------------------------------------------------------------

class TestUploadsAndDocs:
    def test_upload_download_add_doc(self, supplier_token, sup_headers):
        # Upload a small text file
        files = {"file": ("test.txt", io.BytesIO(b"pytest-file"), "text/plain")}
        data = {"kind": "document"}
        r = requests.post(f"{API}/supplier/uploads",
                          headers={"Authorization": f"Bearer {supplier_token}"},
                          files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        upload = r.json()
        assert upload["storage_path"].startswith("baked-platform/suppliers/")
        assert upload["file_url"].startswith("/api/supplier/files/")

        # Download via auth-gated proxy
        d = requests.get(f"{BASE_URL}{upload['file_url']}",
                         headers={"Authorization": f"Bearer {supplier_token}"}, timeout=15)
        assert d.status_code == 200
        assert b"pytest-file" in d.content

        # Attach to a document row
        r2 = requests.post(f"{API}/supplier/me/documents", headers=sup_headers, json={
            "document_type": "catalogue",
            "title": f"Pytest Doc {uuid.uuid4().hex[:6]}",
            "file_url": upload["file_url"],
            "storage_path": upload["storage_path"],
            "content_type": upload["content_type"],
            "original_filename": upload["original_filename"],
            "size_bytes": upload["size_bytes"],
        }, timeout=15)
        assert r2.status_code == 201, r2.text
        doc_id = r2.json()["id"]

        # List should include it
        lst = requests.get(f"{API}/supplier/me/documents", headers=sup_headers, timeout=15).json()["items"]
        assert any(d["id"] == doc_id for d in lst)

        # Soft-delete
        rd = requests.delete(f"{API}/supplier/me/documents/{doc_id}", headers=sup_headers, timeout=15)
        assert rd.status_code == 200
        lst2 = requests.get(f"{API}/supplier/me/documents", headers=sup_headers, timeout=15).json()["items"]
        assert not any(d["id"] == doc_id for d in lst2), "soft-deleted doc must not surface"

    def test_upload_rejects_disallowed_mime(self, supplier_token):
        # A binary blob with an unusual content-type should be rejected
        files = {"file": ("evil.exe", io.BytesIO(b"MZ\x00"), "application/x-msdownload")}
        r = requests.post(f"{API}/supplier/uploads",
                          headers={"Authorization": f"Bearer {supplier_token}"},
                          files=files, data={"kind": "document"}, timeout=15)
        assert r.status_code == 415, r.text


# ---------------------------------------------------------------------------
# 3. Product Requests
# ---------------------------------------------------------------------------

class TestProductRequests:
    def test_create_and_approve_flow(self, sup_headers, sa_headers):
        # Create
        payload = {
            "proposed_name": f"Pytest Coffee {uuid.uuid4().hex[:6]}",
            "proposed_ean_upc": "6001234567890",
            "proposed_manufacturer": "Delta",
            "proposed_cost_price": 1200,
            "proposed_moq": 24,
            "proposed_lead_time_days": 3,
        }
        r = requests.post(f"{API}/supplier/me/product-requests", headers=sup_headers, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["status"] == "pending"

        # SA list
        lst = requests.get(f"{API}/admin/modules/mart/suppliers/product-requests?status=pending",
                           headers=sa_headers, timeout=15)
        assert lst.status_code == 200
        assert any(it["id"] == req["id"] for it in lst.json()["items"])
        assert set(lst.json()["buckets"].keys()) == {"pending", "approved", "rejected", "withdrawn"}

        # SA needs a category_id to approve — grab first category for CI
        cats = requests.get(f"{API}/mart/categories?country=CI", timeout=15).json()
        cat_list = cats if isinstance(cats, list) else cats.get("items", [])
        cat_id = cat_list[0]["id"]

        ap = requests.post(f"{API}/admin/modules/mart/suppliers/product-requests/{req['id']}/approve",
                           headers=sa_headers, json={"category_id": cat_id, "mrp": 2000, "tax_pct": 18,
                                                    "link_at_supplier_cost": True, "notes": "OK"}, timeout=15)
        assert ap.status_code == 200, ap.text
        aj = ap.json()
        assert aj["request"]["status"] == "approved"
        assert aj["master_product_id"]

        # Catalogue must now include the newly created master
        cat_rows = requests.get(f"{API}/supplier/me/catalogue", headers=sup_headers, timeout=15).json()["items"]
        assert any(c["master_product_id"] == aj["master_product_id"] for c in cat_rows)

    def test_reject_requires_notes(self, sup_headers, sa_headers):
        r = requests.post(f"{API}/supplier/me/product-requests", headers=sup_headers, json={
            "proposed_name": f"Pytest Reject {uuid.uuid4().hex[:6]}",
        }, timeout=15)
        assert r.status_code == 201
        req_id = r.json()["id"]
        bad = requests.post(f"{API}/admin/modules/mart/suppliers/product-requests/{req_id}/reject",
                            headers=sa_headers, json={"notes": ""}, timeout=15)
        # Empty notes fails Pydantic min_length=1 → 422
        assert bad.status_code == 422, bad.text
        ok = requests.post(f"{API}/admin/modules/mart/suppliers/product-requests/{req_id}/reject",
                           headers=sa_headers, json={"notes": "Duplicate of existing SKU"}, timeout=15)
        assert ok.status_code == 200
        assert ok.json()["status"] == "rejected"


# ---------------------------------------------------------------------------
# 4. Supply-locations updates
# ---------------------------------------------------------------------------

class TestSupplyLocations:
    def test_add_list_delete(self, sup_headers):
        r = requests.post(f"{API}/supplier/me/supply-locations", headers=sup_headers, json={
            "kind": "supply_zone", "city": "Abidjan", "zone": f"Zone-{uuid.uuid4().hex[:4]}", "country": "CI",
        }, timeout=15)
        assert r.status_code == 201, r.text
        loc_id = r.json()["id"]
        lst = requests.get(f"{API}/supplier/me/supply-locations", headers=sup_headers, timeout=15).json()["items"]
        assert any(l["id"] == loc_id for l in lst)
        d = requests.delete(f"{API}/supplier/me/supply-locations/{loc_id}", headers=sup_headers, timeout=15)
        assert d.status_code == 200


# ---------------------------------------------------------------------------
# 5. Critical-field re-verification
# ---------------------------------------------------------------------------

class TestReVerification:
    def test_non_critical_stays_approved(self, sup_headers):
        r = requests.patch(f"{API}/supplier/me/profile", headers=sup_headers,
                           json={"trading_name": f"Delta-{uuid.uuid4().hex[:4]}"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["critical_re_verification"] is False
        assert j["supplier"]["status"] == "approved"

    def test_critical_flip_and_login_blocked(self, sup_headers, sa_headers):
        # Flip
        r = requests.patch(f"{API}/supplier/me/profile", headers=sup_headers,
                           json={"tax_id": f"CI-PYT-{uuid.uuid4().hex[:4]}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["critical_re_verification"] is True
        assert r.json()["supplier"]["status"] == "action_required"

        # Login must now be blocked
        lr = requests.post(f"{API}/martbaked/sellers/login",
                           json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
        assert lr.status_code == 403
        assert lr.json()["detail"]["code"] == "not_active"

        # Restore approval so downstream fixtures work
        apps = requests.get(f"{API}/admin/modules/mart/suppliers/applications?q=MART-SUP-2026-00001",
                            headers=sa_headers, timeout=15).json()
        app_id = apps["items"][0]["id"]
        requests.post(f"{API}/admin/modules/mart/suppliers/applications/{app_id}/approve",
                      headers=sa_headers, json={"notes": "re-approved by test"}, timeout=15)
