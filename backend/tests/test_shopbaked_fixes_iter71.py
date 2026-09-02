"""Iter71 — Fixing_Prompt v3 backend regression:
  §1 Homepage SHOP sections (list, enabled/disabled, reorder, banner_trio)
  §2 Homepage image upload + relative URL resolution back to bytes
  §4 Global cart independence — SHOP→MART→SHOP still keeps SHOP line
     (backend contract that lets the FE fix work).
"""
from __future__ import annotations
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
SUP_EMAIL = "demo-delta-supplier@test.example"
SUP_PASSWORD = "Supplier1234!"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": SUP_EMAIL, "password": SUP_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers():
    worker = os.environ.get("PYTEST_XDIST_WORKER", "gw0")
    suffix = "5" if worker == "gw0" else "6"
    phone = f"+225070090909{suffix}"
    otp = requests.post(f"{API}/auth/otp/request",
                        json={"country_code": "CI", "phone": phone}, timeout=15).json()
    ver = requests.post(f"{API}/auth/otp/verify",
                        json={"challenge_id": otp["challenge_id"],
                              "code": otp["dev_code"]}, timeout=15).json()
    return {"Authorization": f"Bearer {ver['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def published_shop_variant(supplier_headers, sa_headers):
    cats = requests.get(f"{API}/shop/categories?country=CI", timeout=10).json()
    cat = next(c for c in cats if c["slug"] == "apple")
    subs = requests.get(f"{API}/shop/subcategories?country=CI&category=apple", timeout=10).json()
    sub = next(s for s in subs if s["slug"] == "iphone")
    p = requests.post(f"{API}/shop/portal/products", headers=supplier_headers,
                      json={"title": "TEST_Iter71 iPhone",
                            "category_id": cat["id"], "subcategory_id": sub["id"]},
                      timeout=15).json()
    v = requests.post(f"{API}/shop/portal/products/{p['id']}/variants",
                      headers=supplier_headers,
                      json={"sku": "TEST-I71-256", "price": 1299, "stock_qty": 25,
                            "attributes": {"colour": "black", "storage": "256"}},
                      timeout=15).json()
    requests.post(f"{API}/admin/modules/shop/product-requests/{p['id']}/approve",
                  headers=sa_headers, json={}, timeout=15)
    return v["id"]


@pytest.fixture(scope="module")
def mart_product():
    r = requests.get(f"{API}/mart/products?country=CI&limit=50", timeout=15).json()
    products = r if isinstance(r, list) else r.get("items", [])
    products = [p for p in products if p.get("is_stocked_locally", True)]
    assert products
    return products[0]


def _clean_carts(headers):
    try:
        requests.delete(f"{API}/carts/me", headers=headers, timeout=10)
    except Exception:
        pass
    shop = requests.get(f"{API}/shop/cart/me", headers=headers, timeout=10).json()
    for it in shop.get("items", []):
        requests.delete(f"{API}/shop/cart/items/{it['id']}", headers=headers, timeout=10)


# =========================================================================
# §4 — Global cart independence permutations (SHOP then MART; MART then SHOP)
# =========================================================================
class TestGlobalCartPermutations:
    def test_shop_first_then_mart_both_persist(self, customer_headers, mart_product, published_shop_variant):
        _clean_carts(customer_headers)
        # 1) SHOP item
        r1 = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                           json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        assert r1.status_code in (200, 201), r1.text
        # 2) MART item
        r2 = requests.post(f"{API}/carts/me/items", headers=customer_headers,
                           json={"product_id": mart_product["id"], "quantity": 1, "module": "mart"},
                           timeout=15)
        assert r2.status_code in (200, 201), r2.text
        # Verify both endpoints retain their items
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart["item_count"] >= 1, mart
        assert shop["item_count"] >= 1, shop
        assert any(it["variant"]["id"] == published_shop_variant for it in shop["items"])

    def test_mart_first_then_shop_both_persist(self, customer_headers, mart_product, published_shop_variant):
        _clean_carts(customer_headers)
        r1 = requests.post(f"{API}/carts/me/items", headers=customer_headers,
                           json={"product_id": mart_product["id"], "quantity": 1, "module": "mart"},
                           timeout=15)
        assert r1.status_code in (200, 201)
        r2 = requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                           json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        assert r2.status_code in (200, 201)
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart["item_count"] >= 1
        assert shop["item_count"] >= 1

    def test_remove_shop_keeps_mart(self, customer_headers, mart_product, published_shop_variant):
        _clean_carts(customer_headers)
        requests.post(f"{API}/carts/me/items", headers=customer_headers,
                      json={"product_id": mart_product["id"], "quantity": 1, "module": "mart"}, timeout=15)
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        shop = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        shop_item_id = shop["items"][0]["id"]
        rd = requests.delete(f"{API}/shop/cart/items/{shop_item_id}", headers=customer_headers, timeout=10)
        assert rd.status_code in (200, 204)
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop_after = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart["item_count"] >= 1
        assert shop_after["item_count"] == 0

    def test_remove_mart_keeps_shop(self, customer_headers, mart_product, published_shop_variant):
        _clean_carts(customer_headers)
        requests.post(f"{API}/carts/me/items", headers=customer_headers,
                      json={"product_id": mart_product["id"], "quantity": 1, "module": "mart"}, timeout=15)
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": published_shop_variant, "quantity": 1}, timeout=15)
        mart = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        mart_item_id = mart["items"][0]["id"]
        rd = requests.delete(f"{API}/carts/me/items/{mart_item_id}", headers=customer_headers, timeout=10)
        assert rd.status_code in (200, 204)
        mart_after = requests.get(f"{API}/carts/me", headers=customer_headers, timeout=10).json()
        shop_after = requests.get(f"{API}/shop/cart/me", headers=customer_headers, timeout=10).json()
        assert mart_after["item_count"] == 0
        assert shop_after["item_count"] >= 1

    def test_hard_refresh_persistence(self, customer_headers, published_shop_variant):
        """New session (fresh Bearer usage) still finds SHOP item — server truth."""
        _clean_carts(customer_headers)
        requests.post(f"{API}/shop/cart/items", headers=customer_headers,
                      json={"variant_id": published_shop_variant, "quantity": 2}, timeout=15)
        # simulate hard-refresh: new requests session, same bearer
        s = requests.Session()
        s.headers.update(customer_headers)
        got = s.get(f"{API}/shop/cart/me", timeout=10).json()
        assert got["item_count"] == 2


# =========================================================================
# §1 — Homepage SHOP sections CMS-driven behaviour
# =========================================================================
class TestShopHomepageSections:
    def test_public_homepage_shop_returns_only_enabled(self, sa_headers):
        # Baseline snapshot
        body = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
        assert body["module"] == "shop"
        assert "sections" in body
        for s in body["sections"]:
            assert s.get("is_enabled") is None or s["is_enabled"] is True

    def test_admin_can_create_and_toggle_banner_trio(self, sa_headers):
        payload = {
            "country": "CI", "module": "shop", "section_type": "banner_trio",
            "title": "TEST_Iter71 Explore trio", "subtitle": "Iter71",
            "display_order": 500, "is_enabled": True,
            "config": {"banners": [
                {"eyebrow": "NEW", "label": "Tile 0", "link": "/shop"},
                {"eyebrow": "HOT", "label": "Tile 1", "link": "/shop"},
                {"eyebrow": "SALE", "label": "Tile 2", "link": "/shop"},
            ]},
        }
        r = requests.post(f"{API}/admin/homepage-sections", headers=sa_headers,
                          json=payload, timeout=15)
        assert r.status_code == 201, r.text
        section_id = r.json()["id"]
        try:
            # Appears in public list
            body = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            assert any(s["id"] == section_id for s in body["sections"])
            # Toggle off
            r2 = requests.patch(f"{API}/admin/homepage-sections/{section_id}",
                                headers=sa_headers, json={"is_enabled": False}, timeout=15)
            assert r2.status_code == 200
            body2 = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            assert not any(s["id"] == section_id for s in body2["sections"])
            # Toggle on again
            requests.patch(f"{API}/admin/homepage-sections/{section_id}",
                           headers=sa_headers, json={"is_enabled": True}, timeout=15)
            body3 = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            assert any(s["id"] == section_id for s in body3["sections"])
        finally:
            requests.delete(f"{API}/admin/homepage-sections/{section_id}",
                            headers=sa_headers, timeout=10)

    def test_reorder_changes_visible_order(self, sa_headers):
        # Create two temp sections
        p = lambda order, title: {
            "country": "CI", "module": "shop", "section_type": "promotional_banner",
            "title": title, "display_order": order, "is_enabled": True, "config": {}
        }
        a = requests.post(f"{API}/admin/homepage-sections", headers=sa_headers,
                          json=p(900, "TEST_I71_A"), timeout=15).json()
        b = requests.post(f"{API}/admin/homepage-sections", headers=sa_headers,
                          json=p(901, "TEST_I71_B"), timeout=15).json()
        try:
            body = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            ids_ordered = [s["id"] for s in body["sections"] if s["id"] in (a["id"], b["id"])]
            assert ids_ordered == [a["id"], b["id"]]
            # Swap
            r = requests.patch(f"{API}/admin/homepage-sections/reorder",
                               headers=sa_headers,
                               json={"items": [
                                   {"id": a["id"], "display_order": 901},
                                   {"id": b["id"], "display_order": 900},
                               ]}, timeout=15)
            assert r.status_code == 200, r.text
            body = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            ids_ordered = [s["id"] for s in body["sections"] if s["id"] in (a["id"], b["id"])]
            assert ids_ordered == [b["id"], a["id"]]
        finally:
            requests.delete(f"{API}/admin/homepage-sections/{a['id']}", headers=sa_headers, timeout=10)
            requests.delete(f"{API}/admin/homepage-sections/{b['id']}", headers=sa_headers, timeout=10)


# =========================================================================
# §2 — Image upload and relative URL resolution
# =========================================================================
class TestHomepageImageUpload:
    def test_upload_returns_relative_url_and_serves_bytes(self, sa_headers):
        # 1x1 transparent PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0"
            b"\x00\x00\x00\x03\x00\x01\xa1\xc1\xf3\x1c\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        headers = {"Authorization": sa_headers["Authorization"]}  # no Content-Type — requests picks multipart
        r = requests.post(f"{API}/admin/homepage-sections/uploads",
                          headers=headers,
                          files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
                          timeout=20)
        assert r.status_code == 200, r.text
        file_url = r.json()["file_url"]
        assert file_url.startswith("/api/homepage/uploads/"), file_url
        # Serve it back
        served = requests.get(f"{BASE_URL}{file_url}", timeout=10)
        assert served.status_code == 200
        assert served.headers.get("content-type", "").startswith("image/")
        assert len(served.content) == len(png_bytes)

    def test_uploaded_url_usable_in_section_config(self, sa_headers):
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
        # Use SA to upload (using a proper 1x1)
        r = requests.post(f"{API}/admin/homepage-sections/uploads",
                          headers={"Authorization": sa_headers["Authorization"]},
                          files={"file": ("x.png", io.BytesIO(png), "image/png")}, timeout=20)
        assert r.status_code == 200, r.text
        url = r.json()["file_url"]
        # Create hero using that URL
        payload = {
            "country": "CI", "module": "shop", "section_type": "hero",
            "title": "TEST_I71 Hero with image", "display_order": 700, "is_enabled": True,
            "config": {"background_image": url, "cta_label": "Shop", "cta_link": "/shop"},
        }
        r2 = requests.post(f"{API}/admin/homepage-sections", headers=sa_headers,
                           json=payload, timeout=15)
        assert r2.status_code == 201, r2.text
        sid = r2.json()["id"]
        try:
            body = requests.get(f"{API}/homepage?country=CI&module=shop", timeout=10).json()
            hero = next(s for s in body["sections"] if s["id"] == sid)
            assert hero["config"]["background_image"] == url
        finally:
            requests.delete(f"{API}/admin/homepage-sections/{sid}", headers=sa_headers, timeout=10)
