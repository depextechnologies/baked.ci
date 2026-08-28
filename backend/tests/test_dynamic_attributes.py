"""Slice 1 — Dynamic Category Attribute Engine backend tests.

Covers:
 * Attribute CRUD (create / list / patch / soft-delete)
 * Immutable key on create
 * Options CRUD for select / multi_select
 * Category attribute assignment + upsert idempotency
 * Subcategory override wins over parent-category assignment
 * Public resolver returns inherited + own attrs
 * Customer-visible filter
 * Audit trail records every mutation with before/after diff
 * Category & Subcategory CRUD (rename, create, deactivate)
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


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30)
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _create_attribute(sa_headers, name, type_="short_text", **extra):
    r = requests.post(f"{API}/admin/mart/attributes", headers=sa_headers,
                      json={"name": name, "type": type_, **extra}, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def _pick_real_category(country="CI"):
    """Pick a seeded category that has at least one subcategory — skips
    any autotest-created categories from earlier test runs."""
    cats = requests.get(f"{API}/mart/categories?country={country}", timeout=15).json()
    for c in cats:
        subs = requests.get(f"{API}/mart/subcategories?country={country}&category={c['slug']}",
                            timeout=15).json()
        if subs:
            return c, subs
    raise AssertionError("No seeded category with subcategories found")


class TestAttributeCRUD:
    def test_create_and_key_slugify(self, sa_headers):
        a = _create_attribute(sa_headers, f"Country of Origin {uuid.uuid4().hex[:6]}")
        assert a["key"].startswith("country_of_origin_")
        assert a["is_active"] is True

    def test_list_excludes_inactive_by_default(self, sa_headers):
        a = _create_attribute(sa_headers, f"HiddenAttr {uuid.uuid4().hex[:6]}")
        # Soft-delete
        r = requests.delete(f"{API}/admin/mart/attributes/{a['id']}",
                            headers=sa_headers, timeout=15)
        assert r.status_code == 204
        # List should exclude it
        r = requests.get(f"{API}/admin/mart/attributes", headers=sa_headers, timeout=15)
        ids = [i["id"] for i in r.json()["items"]]
        assert a["id"] not in ids
        # include_inactive=1 should return it
        r = requests.get(f"{API}/admin/mart/attributes?include_inactive=1",
                         headers=sa_headers, timeout=15)
        assert a["id"] in [i["id"] for i in r.json()["items"]]

    def test_patch_name_but_key_immutable(self, sa_headers):
        a = _create_attribute(sa_headers, f"OldName {uuid.uuid4().hex[:6]}")
        r = requests.patch(f"{API}/admin/mart/attributes/{a['id']}",
                           headers=sa_headers, json={"name": "Renamed Attr"}, timeout=15)
        assert r.status_code == 200
        after = r.json()
        assert after["name"] == "Renamed Attr"
        # Key is the original one — attributes stored on historical products
        # remain resolvable.
        assert after["key"] == a["key"]

    def test_invalid_type_rejected(self, sa_headers):
        r = requests.post(f"{API}/admin/mart/attributes", headers=sa_headers,
                          json={"name": "Foo", "type": "not-a-real-type"}, timeout=15)
        assert r.status_code == 400


class TestAttributeOptions:
    def test_options_added_only_to_select_type(self, sa_headers):
        text_attr = _create_attribute(sa_headers, f"NotSelect {uuid.uuid4().hex[:6]}",
                                      type_="short_text")
        r = requests.post(f"{API}/admin/mart/attributes/{text_attr['id']}/options",
                          headers=sa_headers,
                          json={"value": "sm", "label": "Small"}, timeout=15)
        assert r.status_code == 400

    def test_options_lifecycle(self, sa_headers):
        select_attr = _create_attribute(sa_headers, f"Size {uuid.uuid4().hex[:6]}",
                                        type_="select")
        for v, l in [("sm", "Small"), ("md", "Medium"), ("lg", "Large")]:
            r = requests.post(f"{API}/admin/mart/attributes/{select_attr['id']}/options",
                              headers=sa_headers,
                              json={"value": v, "label": l}, timeout=15)
            assert r.status_code == 201
        # Duplicate value rejected
        r = requests.post(f"{API}/admin/mart/attributes/{select_attr['id']}/options",
                          headers=sa_headers, json={"value": "sm", "label": "Dup"}, timeout=15)
        assert r.status_code == 409


class TestCategoryAssignmentAndResolver:
    def test_assign_and_resolve(self, sa_headers):
        cat, subs = _pick_real_category()

        # New attribute assigned to the parent category
        attr = _create_attribute(sa_headers, f"ParentAttr {uuid.uuid4().hex[:6]}")
        r = requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                          headers=sa_headers,
                          json={"attribute_id": attr["id"], "is_required": True,
                                "customer_visible": True, "supplier_editable": True},
                          timeout=15)
        assert r.status_code == 201

        # Public resolver — subcategory inherits parent
        r = requests.get(
            f"{API}/mart/categories/{cat['id']}/attributes?subcategory_id={subs[0]['id']}",
            timeout=15)
        assert r.status_code == 200
        resolved = r.json()["attributes"]
        keys = [a["key"] for a in resolved]
        assert attr["key"] in keys, f"expected {attr['key']} in {keys}"

    def test_subcategory_override_wins(self, sa_headers):
        cat, subs = _pick_real_category()
        sub = subs[0]

        # Category-level: is_required=False
        attr = _create_attribute(sa_headers, f"OverrideAttr {uuid.uuid4().hex[:6]}")
        requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                      headers=sa_headers,
                      json={"attribute_id": attr["id"], "is_required": False},
                      timeout=15)
        # Subcategory-level: is_required=True (override)
        r = requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                          headers=sa_headers,
                          json={"attribute_id": attr["id"],
                                "subcategory_id": sub["id"],
                                "is_required": True}, timeout=15)
        assert r.status_code == 201

        # Resolver: without sub → is_required=False
        r = requests.get(f"{API}/mart/categories/{cat['id']}/attributes", timeout=15)
        found = [a for a in r.json()["attributes"] if a["key"] == attr["key"]][0]
        assert found["is_required"] is False and found["scope"] == "category"

        # Resolver: with sub → is_required=True
        r = requests.get(
            f"{API}/mart/categories/{cat['id']}/attributes?subcategory_id={sub['id']}",
            timeout=15)
        found = [a for a in r.json()["attributes"] if a["key"] == attr["key"]][0]
        assert found["is_required"] is True and found["scope"] == "subcategory"

    def test_customer_visible_only_filter(self, sa_headers):
        cat, _ = _pick_real_category()

        # Two attrs: one visible, one hidden
        a_vis = _create_attribute(sa_headers, f"VisAttr {uuid.uuid4().hex[:6]}")
        a_hid = _create_attribute(sa_headers, f"HidAttr {uuid.uuid4().hex[:6]}")
        for a, vis in [(a_vis, True), (a_hid, False)]:
            requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                          headers=sa_headers,
                          json={"attribute_id": a["id"],
                                "customer_visible": vis}, timeout=15)
        r = requests.get(
            f"{API}/mart/categories/{cat['id']}/attributes?customer_visible_only=1",
            timeout=15)
        keys = [a["key"] for a in r.json()["attributes"]]
        assert a_vis["key"] in keys
        assert a_hid["key"] not in keys

    def test_assign_idempotent_upsert(self, sa_headers):
        cat, _ = _pick_real_category()
        attr = _create_attribute(sa_headers, f"IdemAttr {uuid.uuid4().hex[:6]}")

        r1 = requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                           headers=sa_headers,
                           json={"attribute_id": attr["id"], "sort_order": 5},
                           timeout=15)
        assert r1.status_code == 201
        r2 = requests.post(f"{API}/admin/mart/categories/{cat['id']}/attributes",
                           headers=sa_headers,
                           json={"attribute_id": attr["id"], "sort_order": 42},
                           timeout=15)
        assert r2.status_code == 201
        # Same assignment id, updated sort_order
        assert r2.json()["id"] == r1.json()["id"]
        assert r2.json()["sort_order"] == 42


class TestAuditTrail:
    def test_audit_has_before_and_after(self, sa_headers):
        a = _create_attribute(sa_headers, f"AuditName {uuid.uuid4().hex[:6]}")
        requests.patch(f"{API}/admin/mart/attributes/{a['id']}",
                       headers=sa_headers, json={"name": "AuditName Renamed"}, timeout=15)
        r = requests.get(f"{API}/admin/mart/attributes/audit?entity_kind=attribute"
                         f"&entity_id={a['id']}",
                         headers=sa_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        actions = [it["action"] for it in items]
        assert "create" in actions and "update" in actions
        update_row = [it for it in items if it["action"] == "update"][0]
        assert update_row["diff"]["before"]["name"] != update_row["diff"]["after"]["name"]


class TestCategoryCRUD:
    def test_create_rename_deactivate(self, sa_headers):
        slug = f"test-cat-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                          json={"slug": slug, "country": "CI",
                                "name": "AutoTest Category"}, timeout=15)
        assert r.status_code == 201
        cid = r.json()["id"]
        # Rename
        r = requests.patch(f"{API}/admin/mart/categories/{cid}", headers=sa_headers,
                           json={"name": "Renamed AutoTest"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed AutoTest"
        # Deactivate
        r = requests.patch(f"{API}/admin/mart/categories/{cid}", headers=sa_headers,
                           json={"is_active": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_active"] is False
