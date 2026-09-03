"""SHOPbaked admin Phase 2 backend tests — catalog, attributes, approvals, products."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PW = "baked@2026#!$@"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------------- Catalog ----------------
class TestCatalog:
    def test_list_categories(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories?country=CI")
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert len(items) >= 19, f"expected >=19 categories, got {len(items)}"

    def test_category_crud_roundtrip(self, admin_session):
        # Create
        payload = {"slug": "qa-test-cat", "country": "CI", "name_en": "QA Test Cat", "order": 99}
        r = admin_session.post(f"{BASE_URL}/api/admin/modules/shop/categories", json=payload)
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        assert r.json()["slug"] == "qa-test-cat"

        # GET verify persisted
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories?country=CI")
        assert any(c["id"] == cid for c in r.json()["items"])

        # Patch
        r = admin_session.patch(f"{BASE_URL}/api/admin/modules/shop/categories/{cid}",
                                json={"name_en": "QA Renamed"})
        assert r.status_code == 200
        assert r.json()["name_en"] == "QA Renamed"

        # Sub-cat create
        sub_payload = {"slug": "qa-test-sub", "category_id": cid, "country": "CI", "name_en": "QA Sub", "order": 0}
        r = admin_session.post(f"{BASE_URL}/api/admin/modules/shop/subcategories", json=sub_payload)
        assert r.status_code == 201, r.text
        sid = r.json()["id"]

        # Sub-cat patch
        r = admin_session.patch(f"{BASE_URL}/api/admin/modules/shop/subcategories/{sid}",
                                json={"name_en": "QA Sub Renamed"})
        assert r.status_code == 200
        assert r.json()["name_en"] == "QA Sub Renamed"

        # Sub-cat delete
        r = admin_session.delete(f"{BASE_URL}/api/admin/modules/shop/subcategories/{sid}")
        assert r.status_code == 204

        # Delete category
        r = admin_session.delete(f"{BASE_URL}/api/admin/modules/shop/categories/{cid}")
        assert r.status_code == 204

    def test_delete_category_in_use_returns_409(self, admin_session):
        # mode-femme has products
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories?country=CI")
        target = next((c for c in r.json()["items"] if c["slug"] == "mode-femme"), None)
        assert target is not None, "mode-femme category not found"
        r = admin_session.delete(f"{BASE_URL}/api/admin/modules/shop/categories/{target['id']}")
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        detail = r.json().get("detail")
        # detail can be dict or string
        msg = detail.get("message") if isinstance(detail, dict) else str(detail)
        assert "product" in msg.lower()


# ---------------- Attributes ----------------
class TestAttributes:
    def test_list_shop_attributes(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mart/attributes?module=shop")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        keys = {a.get("key") for a in items}
        expected = {"colour", "size", "storage", "ram", "warranty", "condition"}
        assert expected.issubset(keys), f"missing SHOP attrs. Got: {keys}"

    def test_mode_femme_has_colour_size_assignments(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories?country=CI")
        cid = next(c["id"] for c in r.json()["items"] if c["slug"] == "mode-femme")
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories/{cid}/attributes")
        assert r.status_code == 200
        keys = {a["attribute"]["key"] for a in r.json()["assignments"] if a.get("attribute")}
        assert "colour" in keys and "size" in keys, f"expected colour+size in mode-femme; got {keys}"

    def test_attribute_create_and_soft_delete(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/mart/attributes",
                               json={"name": "QA Attr Test", "type": "short_text", "module": "shop"})
        assert r.status_code in (200, 201), r.text
        aid = r.json()["id"]
        r = admin_session.delete(f"{BASE_URL}/api/admin/mart/attributes/{aid}")
        assert r.status_code in (200, 204)

    def test_assignment_toggle_roundtrip(self, admin_session):
        # pick mode-femme
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories?country=CI")
        cid = next(c["id"] for c in r.json()["items"] if c["slug"] == "mode-femme")
        # find an unassigned shop attr
        r_attrs = admin_session.get(f"{BASE_URL}/api/admin/mart/attributes?module=shop").json()
        attrs = r_attrs if isinstance(r_attrs, list) else r_attrs.get("items", [])
        r_asg = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/categories/{cid}/attributes").json()
        assigned_ids = {a["attribute_id"] for a in r_asg["assignments"]}
        candidate = next((a for a in attrs if a["id"] not in assigned_ids), None)
        if not candidate:
            pytest.skip("no unassigned attribute for mode-femme")
        # Assign
        r = admin_session.post(f"{BASE_URL}/api/admin/modules/shop/categories/{cid}/attributes",
                               json={"attribute_id": candidate["id"], "is_required": False,
                                     "customer_visible": True, "supplier_editable": True, "sort_order": 99})
        assert r.status_code == 201, r.text
        assignment_id = r.json()["id"]
        # Patch toggle
        r = admin_session.patch(f"{BASE_URL}/api/admin/modules/shop/assignments/{assignment_id}",
                                json={"is_required": True})
        assert r.status_code == 200
        assert r.json()["is_required"] is True
        # Unassign
        r = admin_session.delete(f"{BASE_URL}/api/admin/modules/shop/assignments/{assignment_id}")
        assert r.status_code == 204


# ---------------- Approvals ----------------
class TestApprovals:
    def test_buckets_and_approved_count(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/product-requests?bucket=approved&country=CI&limit=500")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "buckets" in data and "items" in data
        # Approved count check
        approved_count = data["buckets"].get("approved", 0)
        assert approved_count >= 100, f"expected many approved, got {approved_count}"
        assert len(data["items"]) > 0

    def test_detail_drawer_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/product-requests?bucket=approved&country=CI&limit=1")
        pid = r.json()["items"][0]["id"]
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/product-requests/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == pid
        assert "variants" in d
        assert isinstance(d.get("images"), list)


# ---------------- Products browser ----------------
class TestProducts:
    def test_admin_products_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/shop/products?country=CI&limit=10")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- MART regression ----------------
class TestMartRegression:
    def test_mart_attributes_still_lists(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mart/attributes")
        assert r.status_code == 200

    def test_mart_categories_still_lists(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/mart/categories")
        # some deployments return 200 with list or dict
        assert r.status_code == 200, r.text

    def test_mart_product_requests_still_lists(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/product-requests?bucket=pending&country=CI")
        assert r.status_code == 200
