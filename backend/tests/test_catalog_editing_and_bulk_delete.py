"""Fixing_Prompt v8 — Category/Subcategory editing + Bulk delete.

Covers:
  * PATCH /admin/mart/categories/{id} with only editable fields succeeds
  * PATCH still rejects unknown keys with 422 (strict backend DTO)
  * POST /admin/mart/categories/bulk-delete soft-deletes safe rows and
    reports blocked rows (has_subcategories / not_found)
  * POST /admin/mart/subcategories/bulk-delete hard-deletes safe rows
  * POST /admin/mart/attributes/bulk-delete soft-deactivates attributes
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


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=30)
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


class TestCategoryEditingFix:
    def test_patch_editable_only_ok(self, sa_headers):
        # Create isolated category
        slug = f"v8-cat-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                          json={"slug": slug, "country": "CI", "name": "v8"},
                          timeout=15)
        cid = r.json()["id"]
        # Editable-only PATCH — must succeed
        r2 = requests.patch(f"{API}/admin/mart/categories/{cid}",
                            headers=sa_headers,
                            json={"name_en": "v8 renamed", "order": 42, "is_active": True},
                            timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["name_en"] == "v8 renamed"
        assert r2.json()["order"] == 42
        assert r2.json()["is_active"] is True

    def test_patch_unknown_field_rejected(self, sa_headers):
        # System-managed fields must still be forbidden — the DTO stays strict
        r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                          json={"slug": f"v8-cat-{uuid.uuid4().hex[:6]}",
                                "country": "CI", "name": "x"}, timeout=15)
        cid = r.json()["id"]
        r2 = requests.patch(f"{API}/admin/mart/categories/{cid}",
                            headers=sa_headers,
                            json={"created_at": "2020-01-01", "version": 1},
                            timeout=15)
        assert r2.status_code == 422, r2.text
        # Reason must be extra_forbidden (per docx)
        detail = r2.json()["detail"]
        types = [x.get("type") for x in detail]
        assert any(t and "extra" in t.lower() for t in types)


class TestBulkDeleteCategories:
    def test_bulk_delete_soft_deletes_and_blocks(self, sa_headers):
        # 3 empty categories → all should be soft-deleted
        ids = []
        for _ in range(3):
            r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                              json={"slug": f"v8-cat-{uuid.uuid4().hex[:6]}",
                                    "country": "CI", "name": "v8 bulk"}, timeout=15)
            ids.append(r.json()["id"])
        # 1 category with a subcategory → should be blocked
        r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                          json={"slug": f"v8-parent-{uuid.uuid4().hex[:6]}",
                                "country": "CI", "name": "parent"}, timeout=15)
        parent_id = r.json()["id"]
        requests.post(f"{API}/admin/mart/subcategories", headers=sa_headers,
                      json={"slug": f"v8-sub-{uuid.uuid4().hex[:6]}",
                            "category_id": parent_id, "country": "CI",
                            "name": "child"}, timeout=15)
        ids.append(parent_id)

        r = requests.post(f"{API}/admin/mart/categories/bulk-delete",
                          headers=sa_headers, json={"ids": ids}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["deleted"]) == 3
        assert len(d["blocked"]) == 1
        assert d["blocked"][0]["reason"] == "has_subcategories"

    def test_bulk_delete_not_found_reason(self, sa_headers):
        r = requests.post(f"{API}/admin/mart/categories/bulk-delete",
                          headers=sa_headers,
                          json={"ids": ["cat_does_not_exist_123"]}, timeout=15)
        assert r.status_code == 200
        assert r.json()["blocked"] == [{"id": "cat_does_not_exist_123",
                                        "reason": "not_found"}]


class TestBulkDeleteSubcategories:
    def test_bulk_delete_subcategories(self, sa_headers):
        cat = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                            json={"slug": f"v8-parent-{uuid.uuid4().hex[:6]}",
                                  "country": "CI", "name": "parent"}, timeout=15).json()
        ids = []
        for _ in range(2):
            r = requests.post(f"{API}/admin/mart/subcategories", headers=sa_headers,
                              json={"slug": f"v8-sub-{uuid.uuid4().hex[:6]}",
                                    "category_id": cat["id"], "country": "CI",
                                    "name": "child"}, timeout=15)
            ids.append(r.json()["id"])
        r = requests.post(f"{API}/admin/mart/subcategories/bulk-delete",
                          headers=sa_headers, json={"ids": ids}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["deleted"]) == 2


class TestBulkDeleteAttributes:
    def test_bulk_deactivate_attributes(self, sa_headers):
        ids = []
        for _ in range(3):
            r = requests.post(f"{API}/admin/mart/attributes", headers=sa_headers,
                              json={"name": f"v8Attr {uuid.uuid4().hex[:6]}",
                                    "type": "short_text"}, timeout=15)
            ids.append(r.json()["id"])
        r = requests.post(f"{API}/admin/mart/attributes/bulk-delete",
                          headers=sa_headers, json={"ids": ids}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["deleted"]) == 3
        # Re-running is idempotent — already inactive → blocked
        r2 = requests.post(f"{API}/admin/mart/attributes/bulk-delete",
                           headers=sa_headers, json={"ids": ids}, timeout=15)
        assert len(r2.json()["blocked"]) == 3
        assert all(b["reason"] == "already_inactive" for b in r2.json()["blocked"])
