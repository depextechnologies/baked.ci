"""QA v15 backend tests — Workstream 1B & 1C."""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://baked-platform.preview.emergentagent.com"
API = f"{BASE}/api"


# ----------------------------- Workstream 1B: SHOP products?category=slug returns filtered list -----------------------------
def test_shop_products_category_filter():
    # First get a category slug from /shop/catalogue
    r = requests.get(f"{API}/shop/catalogue?country=CI", timeout=15)
    assert r.status_code == 200, r.text
    tree = r.json()
    assert isinstance(tree, list) and len(tree) > 0
    slug = tree[0]["slug"]
    # Query filtered products
    r2 = requests.get(f"{API}/shop/products", params={"country": "CI", "category": slug, "limit": 12}, timeout=15)
    assert r2.status_code == 200, r2.text
    items = r2.json()
    assert isinstance(items, list)
    # If products exist, they must belong to the requested slug
    for p in items:
        # tolerate different shapes
        cat_slug = p.get("category_slug") or (p.get("category") or {}).get("slug")
        if cat_slug is not None:
            assert cat_slug == slug, f"Product {p.get('id')} has slug {cat_slug} != {slug}"


# ----------------------------- Workstream 1C: SHOP supplier application appears in Admin -----------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/admin/auth/login",
        json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_apply_start_shop_creates_shop_supplier(admin_token):
    epoch = int(time.time())
    email = f"wk1c-shop-test-{epoch}@test.example"
    payload = {
        "business_email": email,
        "business_name": f"WK1C SHOP Test {epoch}",
        "business_type": "manufacturer",
        "country": "CI",
        "module": "shop",
    }
    r = requests.post(f"{API}/martbaked/sellers/apply/start", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    data = r.json()
    sup = data["supplier"]
    assert "SHOP" in (sup.get("modules") or []), f"Supplier.modules should contain SHOP: {sup}"
    app_code = data["application"]["application_code"]

    # Query admin Submitted tab filtered by module=SHOP
    r2 = requests.get(
        f"{API}/admin/modules/mart/suppliers/applications",
        params={"module": "SHOP"},
        headers=_hdr(admin_token),
        timeout=20,
    )
    assert r2.status_code == 200, r2.text
    items = r2.json()["items"]
    codes = [i["application_code"] for i in items]
    assert app_code in codes, f"New SHOP app {app_code} not found in admin SHOP list (got {len(codes)} items)"


def test_apply_start_default_is_mart(admin_token):
    epoch = int(time.time())
    email = f"wk1c-mart-legacy-{epoch}@test.example"
    payload = {
        "business_email": email,
        "business_name": f"WK1C MART Legacy {epoch}",
        "business_type": "manufacturer",
        "country": "CI",
        # no `module` — backwards compat: should default to MART
    }
    r = requests.post(f"{API}/martbaked/sellers/apply/start", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    sup = r.json()["supplier"]
    assert "MART" in (sup.get("modules") or []), f"Legacy start should create MART supplier: {sup}"
    assert "SHOP" not in (sup.get("modules") or [])


def test_apply_start_reuse_appends_module():
    """If a draft supplier already exists for email+country and module=shop is
    passed on the second call, SHOP must be appended without wiping MART."""
    epoch = int(time.time())
    email = f"wk1c-append-{epoch}@test.example"
    base = {
        "business_email": email,
        "business_name": f"WK1C Append {epoch}",
        "business_type": "manufacturer",
        "country": "CI",
    }
    # 1st — MART default
    r1 = requests.post(f"{API}/martbaked/sellers/apply/start", json=base, timeout=15)
    assert r1.status_code == 201, r1.text
    sup1 = r1.json()["supplier"]
    assert sup1["modules"] == ["MART"], sup1

    # 2nd — same email/country + module=shop → should reuse and append SHOP
    r2 = requests.post(f"{API}/martbaked/sellers/apply/start", json={**base, "module": "shop"}, timeout=15)
    assert r2.status_code == 201, r2.text
    sup2 = r2.json()["supplier"]
    mods = sup2.get("modules") or []
    assert "MART" in mods and "SHOP" in mods, f"Both modules expected, got {mods}"
