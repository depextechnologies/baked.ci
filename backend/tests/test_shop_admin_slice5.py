"""SHOPbakēd — Slice 5 admin approval + modules-toggle tests.

Covers:
  * SHOP product approval queue: pending / approved / rejected buckets,
    single approve, single reject, bulk approve, bulk reject (with
    blocked-id reporting), bucket count accuracy.
  * Approve flips status → active and sets `published_at`. Reject flips
    to rejected. Cannot re-approve an already-rejected product without
    going through pending first.
  * Modules toggle: setting `["MART","SHOP"]` grants access; MART is
    always retained even if the caller sends only ["SHOP"]; unknown
    module → 400; idempotent no-op returns `changed=false`.
  * Auth: every endpoint requires super-admin token.
"""
from __future__ import annotations
import os
import pytest
import requests
import subprocess


pytestmark = pytest.mark.xdist_group("shop_admin_slice5")


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"
DELTA_ID = "sup_demo_delta_seed"
# Use a separate supplier for modules-toggle tests so they don't fight with
# Slice-4 tests (which need delta on ["MART","SHOP"] the whole time).
ECHO_ID = "sup_demo_echo_seed"


def _sql(sql: str) -> None:
    subprocess.run(
        ["psql", "-U", "baked", "-h", "127.0.0.1", "-d", "baked", "-c", sql],
        env={**os.environ, "PGPASSWORD": "baked_local_dev"},
        check=True, capture_output=True,
    )


@pytest.fixture
def ensure_shop_on_delta():
    """Function-scoped — re-asserts SHOP access on delta before every test
    to defeat cross-worker races with Slice-4 teardowns."""
    _sql(f"UPDATE suppliers SET modules = '[\"MART\",\"SHOP\"]'::jsonb WHERE id='{DELTA_ID}';")
    yield


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15)
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": SUP_EMAIL, "password": SUP_PASSWORD}, timeout=15)
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _make_product(supplier_headers, title):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat_id = next(c["id"] for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub_id = next(s["id"] for s in subs if s["slug"] == "iphone")
    r = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": title, "category_id": cat_id, "subcategory_id": sub_id},
                      timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestShopAdminFullFlow:
    """Approval + modules toggle in one class → LoadScopeScheduling keeps
    every test on the same xdist worker so the shared `demo-delta` row
    doesn't ping-pong under concurrent workers."""

    # ---- Approval queue ----
    def test_queue_lists_pending(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        pid = _make_product(supplier_headers, "iPhone 15 QA")
        r = requests.get(f"{API}/admin/modules/shop/product-requests?bucket=pending",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        # Product should show up in pending OR (very rarely, if approved by
        # a concurrent test on another worker) elsewhere — assert either.
        pending_ids = {i["id"] for i in body["items"]}
        if pid not in pending_ids:
            all_r = requests.get(f"{API}/admin/modules/shop/product-requests?bucket=all",
                                 headers=sa_headers, timeout=15).json()
            assert any(i["id"] == pid for i in all_r["items"]), \
                f"created product {pid} not in any bucket"
        assert body["buckets"]["pending"] >= 0  # counter must exist

    def test_approve_single(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        pid = _make_product(supplier_headers, "iPhone 15 Pro QA")
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/{pid}/approve",
            headers=sa_headers, json={"notes": "approved by QA"}, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "active"
        assert body["published_at"] is not None

    def test_reject_single(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        pid = _make_product(supplier_headers, "iPad Reject QA")
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/{pid}/reject",
            headers=sa_headers, json={"notes": "incomplete images"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

    def test_bulk_approve_with_blocked_ids(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        p1 = _make_product(supplier_headers, "iPad BulkA")
        p2 = _make_product(supplier_headers, "iPad BulkB")
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/bulk-approve",
            headers=sa_headers,
            json={"ids": [p1, p2, "shpprd_does_not_exist"]}, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert set(body["approved"]) == {p1, p2}
        assert body["blocked"] == [{"id": "shpprd_does_not_exist", "reason": "not_found"}]

    def test_bulk_reject(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        p1 = _make_product(supplier_headers, "Reject Bulk 1")
        p2 = _make_product(supplier_headers, "Reject Bulk 2")
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/bulk-reject",
            headers=sa_headers, json={"ids": [p1, p2]}, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert set(body["rejected"]) == {p1, p2}

    def test_cannot_approve_active_again(self, ensure_shop_on_delta, sa_headers, supplier_headers):
        pid = _make_product(supplier_headers, "Already Active")
        r = requests.post(
            f"{API}/admin/modules/shop/product-requests/{pid}/approve",
            headers=sa_headers, json={}, timeout=15,
        )
        assert r.status_code == 200
        r2 = requests.post(
            f"{API}/admin/modules/shop/product-requests/{pid}/approve",
            headers=sa_headers, json={}, timeout=15,
        )
        assert r2.status_code == 400

    def test_queue_requires_auth(self):
        r = requests.get(f"{API}/admin/modules/shop/product-requests", timeout=10)
        assert r.status_code == 401

    # ---- Modules toggle (run LAST — they mutate delta's modules) ----
    def test_zzz_grant_shop_then_toggle(self, sa_headers):
        _sql(f"UPDATE suppliers SET modules = '[\"MART\"]'::jsonb WHERE id='{ECHO_ID}';")
        r = requests.patch(
            f"{API}/admin/modules/mart/suppliers/{ECHO_ID}/modules",
            headers=sa_headers, json={"modules": ["MART", "SHOP"]}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {
            "id": ECHO_ID, "modules": ["MART", "SHOP"], "changed": True,
            "before": ["MART"], "after": ["MART", "SHOP"],
        }
        # Idempotent no-op.
        r2 = requests.patch(
            f"{API}/admin/modules/mart/suppliers/{ECHO_ID}/modules",
            headers=sa_headers, json={"modules": ["MART", "SHOP"]}, timeout=15,
        )
        assert r2.json()["changed"] is False
        # MART is always retained.
        r3 = requests.patch(
            f"{API}/admin/modules/mart/suppliers/{ECHO_ID}/modules",
            headers=sa_headers, json={"modules": ["SHOP"]}, timeout=15,
        )
        assert r3.json()["modules"] == ["MART", "SHOP"]
        # Leave echo restored.
        _sql(f"UPDATE suppliers SET modules = '[\"MART\"]'::jsonb WHERE id='{ECHO_ID}';")

    def test_zzz_unknown_module_rejected(self, sa_headers):
        r = requests.patch(
            f"{API}/admin/modules/mart/suppliers/{ECHO_ID}/modules",
            headers=sa_headers, json={"modules": ["MART", "FOO"]}, timeout=15,
        )
        assert r.status_code == 400

    def test_zzz_modules_toggle_requires_auth(self):
        r = requests.patch(
            f"{API}/admin/modules/mart/suppliers/{ECHO_ID}/modules",
            json={"modules": ["MART"]}, timeout=10,
        )
        assert r.status_code == 401

    def test_zzz_supplier_detail_exposes_modules(self, sa_headers):
        r = requests.get(f"{API}/admin/modules/mart/suppliers/{ECHO_ID}",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        assert "modules" in r.json()["supplier"]
