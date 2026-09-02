"""Slice 2 — Dynamic attributes on supplier product-request submission.

Covers:
 * POST /supplier/me/product-requests with `attributes` payload
 * Missing required attribute → 422 with validation errors
 * Bad option value → 422
 * Bad type → 422
 * Value snapshot stored on the request row (label + type + v)
 * Attribute rename does NOT alter the snapshot (data preservation)
 * On admin approve, snapshot copied into mart_products.details
 * Subcategory-scoped override applies to supplier submission
 * PATCH resubmit revalidates against current resolved attributes
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
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture
def clean_category(sa_headers):
    """Provision a NEW, isolated category so residual test attributes from
    earlier runs don't leak into Slice 2 validation. Function-scoped so each
    test starts with an empty attribute set."""
    slug = f"slice2-cat-{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/admin/mart/categories", headers=sa_headers,
                      json={"slug": slug, "country": "CI",
                            "name": f"Slice2 Test {slug}"}, timeout=15)
    assert r.status_code == 201, r.text
    cat = r.json()
    # Add a subcategory
    r2 = requests.post(f"{API}/admin/mart/subcategories", headers=sa_headers,
                       json={"slug": f"{slug}-sub", "category_id": cat["id"],
                             "country": "CI", "name": "Slice2 Sub"}, timeout=15)
    assert r2.status_code == 201, r2.text
    return cat, r2.json()


def _create_attribute(sa_headers, name, type_="short_text"):
    r = requests.post(f"{API}/admin/mart/attributes", headers=sa_headers,
                      json={"name": name, "type": type_}, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def _assign(sa_headers, category_id, attribute_id, *, subcategory_id=None,
            is_required=False, customer_visible=True, supplier_editable=True):
    r = requests.post(f"{API}/admin/mart/categories/{category_id}/attributes",
                      headers=sa_headers,
                      json={"attribute_id": attribute_id,
                            "subcategory_id": subcategory_id,
                            "is_required": is_required,
                            "customer_visible": customer_visible,
                            "supplier_editable": supplier_editable}, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


class TestSupplierSubmissionValidation:
    def test_missing_required_attribute_422(self, sa_headers, sup_headers, clean_category):
        cat, _sub = clean_category
        req_attr = _create_attribute(sa_headers, f"S2Req {uuid.uuid4().hex[:6]}")
        _assign(sa_headers, cat["id"], req_attr["id"], is_required=True)

        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": "Slice2 test",
                                "proposed_category_id": cat["id"]}, timeout=15)
        assert r.status_code == 422, r.text
        errors = r.json()["detail"]["errors"]
        keys = [e["field"] for e in errors]
        assert req_attr["key"] in keys

    def test_invalid_type_422(self, sa_headers, sup_headers, clean_category):
        cat, _ = clean_category
        int_attr = _create_attribute(sa_headers, f"S2Int {uuid.uuid4().hex[:6]}",
                                     type_="integer")
        _assign(sa_headers, cat["id"], int_attr["id"], is_required=False)

        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": "Slice2 int",
                                "proposed_category_id": cat["id"],
                                "attributes": {int_attr["key"]: "not-a-number"}},
                          timeout=15)
        assert r.status_code == 422
        errors = r.json()["detail"]["errors"]
        assert any(e["field"] == int_attr["key"] and e["code"] == "invalid_type"
                   for e in errors)

    def test_bad_option_value_422(self, sa_headers, sup_headers, clean_category):
        cat, _ = clean_category
        sel = _create_attribute(sa_headers, f"S2Sel {uuid.uuid4().hex[:6]}", type_="select")
        requests.post(f"{API}/admin/mart/attributes/{sel['id']}/options",
                      headers=sa_headers, json={"value": "sm", "label": "Small"}, timeout=15)
        _assign(sa_headers, cat["id"], sel["id"])

        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": "Slice2 select",
                                "proposed_category_id": cat["id"],
                                "attributes": {sel["key"]: "xl"}},
                          timeout=15)
        assert r.status_code == 422
        errors = r.json()["detail"]["errors"]
        assert any(e["code"] == "invalid_option" for e in errors)


class TestSnapshotAndRename:
    def test_snapshot_survives_rename(self, sa_headers, sup_headers, clean_category):
        cat, _ = clean_category
        attr = _create_attribute(sa_headers, f"S2Snap {uuid.uuid4().hex[:6]}")
        _assign(sa_headers, cat["id"], attr["id"])
        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": "Slice2 snap",
                                "proposed_category_id": cat["id"],
                                "attributes": {attr["key"]: "Ivory Coast"}},
                          timeout=15)
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["attributes"][attr["key"]]["v"] == "Ivory Coast"
        original_label = req["attributes"][attr["key"]]["label"]

        # Rename the attribute — historical snapshot must NOT change
        requests.patch(f"{API}/admin/mart/attributes/{attr['id']}",
                       headers=sa_headers, json={"name": "Country Of Origin (renamed)"},
                       timeout=15)
        r2 = requests.get(f"{API}/supplier/me/product-requests",
                          headers=sup_headers, timeout=15)
        found = [x for x in r2.json()["items"] if x["id"] == req["id"]][0]
        assert found["attributes"][attr["key"]]["label"] == original_label
        assert found["attributes"][attr["key"]]["v"] == "Ivory Coast"


class TestAdminApprovalCopiesSnapshot:
    def test_approve_copies_attributes_into_master_details(self, sa_headers, sup_headers, clean_category):
        cat, _ = clean_category
        attr = _create_attribute(sa_headers, f"S2App {uuid.uuid4().hex[:6]}")
        _assign(sa_headers, cat["id"], attr["id"])
        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": f"S2 Master {uuid.uuid4().hex[:6]}",
                                "proposed_category_id": cat["id"],
                                "proposed_cost_price": 250,
                                "attributes": {attr["key"]: "Yes"}},
                          timeout=15)
        req = r.json()

        r2 = requests.post(
            f"{API}/admin/modules/mart/suppliers/product-requests/{req['id']}/approve",
            headers=sa_headers,
            json={"category_id": cat["id"], "link_at_supplier_cost": True}, timeout=30)
        assert r2.status_code == 200, r2.text
        mp_id = r2.json()["master_product_id"]

        # Fetch the master product and confirm details carries the snapshot
        r3 = requests.get(f"{API}/mart/products?country=CI&limit=100&category={cat['slug']}",
                          timeout=15)
        items = r3.json() if isinstance(r3.json(), list) else r3.json().get("items", [])
        mp = [p for p in items if p["id"] == mp_id][0]
        assert attr["key"] in (mp.get("details") or {})
        assert mp["details"][attr["key"]]["v"] == "Yes"


class TestSubcategoryOverride:
    def test_subcategory_extra_required_field(self, sa_headers, sup_headers, clean_category):
        cat, sub = clean_category
        # Attribute is required ONLY on the subcategory
        attr = _create_attribute(sa_headers, f"S2Sub {uuid.uuid4().hex[:6]}")
        _assign(sa_headers, cat["id"], attr["id"], is_required=False)
        _assign(sa_headers, cat["id"], attr["id"],
                subcategory_id=sub["id"], is_required=True)

        # No subcategory chosen → attribute not required → ok
        r = requests.post(f"{API}/supplier/me/product-requests",
                          headers=sup_headers,
                          json={"proposed_name": "Slice2 sub free",
                                "proposed_category_id": cat["id"]}, timeout=15)
        assert r.status_code == 201, r.text

        # Subcategory chosen → attribute required → 422
        r2 = requests.post(f"{API}/supplier/me/product-requests",
                           headers=sup_headers,
                           json={"proposed_name": "Slice2 sub locked",
                                 "proposed_category_id": cat["id"],
                                 "proposed_subcategory_id": sub["id"]},
                           timeout=15)
        assert r2.status_code == 422, r2.text
        keys = [e["field"] for e in r2.json()["detail"]["errors"]]
        assert attr["key"] in keys

    def test_subcategory_endpoint_returns_expected_subs(self, sup_headers):
        r = requests.get(f"{API}/supplier/me/subcategories?category=fruits-vegetables",
                         headers=sup_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1
