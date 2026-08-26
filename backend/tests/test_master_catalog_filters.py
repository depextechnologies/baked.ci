"""Social.docx Issue #2 — master-catalog category/subcategory filter tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASS = "Alpha1234!Beta"


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}"}


def test_mart_categories_ci_populated():
    r = requests.get(f"{BASE_URL}/api/mart/categories?country=CI", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "categories empty for CI"
    slugs = [c.get("slug") for c in data]
    assert "fruits-vegetables" in slugs, f"expected fruits-vegetables in {slugs}"
    for c in data:
        assert "slug" in c and "name" in c


def test_mart_subcategories_requires_category():
    r = requests.get(f"{BASE_URL}/api/mart/subcategories?country=CI", timeout=15)
    assert r.status_code == 422  # missing required `category`


def test_mart_subcategories_fruits_vegetables():
    r = requests.get(f"{BASE_URL}/api/mart/subcategories?country=CI&category=fruits-vegetables", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    slugs = [s.get("slug") for s in data]
    assert "fresh-fruits" in slugs, f"expected fresh-fruits in {slugs}"


def test_master_catalog_unfiltered(auth_headers):
    r = requests.get(f"{BASE_URL}/api/partner/master-catalog?limit=100", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    # Should span multiple categories
    cats = {i.get("category_slug") for i in items}
    assert len(cats) >= 2, f"expected multiple categories, got {cats}"


def test_master_catalog_category_filter(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/partner/master-catalog?category=fruits-vegetables&limit=100",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0, "no items for fruits-vegetables"
    for it in items:
        assert it["category_slug"] == "fruits-vegetables", it


def test_master_catalog_category_and_subcategory_filter(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/partner/master-catalog?category=fruits-vegetables&subcategory=fresh-fruits&limit=100",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0, "no items for fresh-fruits"
    for it in items:
        assert it["category_slug"] == "fruits-vegetables"
    names = " ".join(i["name"] for i in items).lower()
    # At least one recognisable fresh fruit should be present
    assert any(k in names for k in ["banane", "orange", "fraise", "raisin", "banana", "strawberr"]), names


def test_master_catalog_narrowing(auth_headers):
    r_all = requests.get(f"{BASE_URL}/api/partner/master-catalog?limit=100", headers=auth_headers, timeout=15).json()["items"]
    r_cat = requests.get(f"{BASE_URL}/api/partner/master-catalog?category=fruits-vegetables&limit=100",
                        headers=auth_headers, timeout=15).json()["items"]
    r_sub = requests.get(f"{BASE_URL}/api/partner/master-catalog?category=fruits-vegetables&subcategory=fresh-fruits&limit=100",
                        headers=auth_headers, timeout=15).json()["items"]
    assert len(r_cat) <= len(r_all)
    assert len(r_sub) <= len(r_cat)


def test_master_catalog_requires_auth():
    r = requests.get(f"{BASE_URL}/api/partner/master-catalog", timeout=15)
    assert r.status_code in (401, 403)
