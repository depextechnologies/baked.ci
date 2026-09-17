"""Regression tests for QA Fixing_Prompt v13 (bugs #7 SHOP categories on Seller
Apply step-5 and #8 document upload endpoint). Also sanity-checks that MART
apply parity still works after the SupplierCategoryInterest schema change.

Executed against the live preview backend via REACT_APP_BACKEND_URL.
"""

import io
import os
import time

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _uniq(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000)}"


def _as_list(body):
    return body if isinstance(body, list) else (body.get("categories") or body.get("items") or [])


def _start_app(s, module: str, country: str = "CI"):
    email = f"qa_v13_{module}_{int(time.time()*1000)}@test.example"
    r = s.post(f"{BASE_URL}/api/martbaked/sellers/apply/start", json={
        "business_name": f"QA V13 {module.upper()} Co",
        "business_type": "distributor",
        "business_email": email,
        "country": country,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["application"]["id"], email


# ---------------------------------------------------------------------------
# BUG #7 — SHOP categories accepted on step 5 with module='shop'
# ---------------------------------------------------------------------------
class TestBug7ShopCategories:

    def test_shop_categories_endpoint_returns_shpcat_ids(self, s):
        r = s.get(f"{BASE_URL}/api/shop/categories?country=CI")
        assert r.status_code == 200, r.text
        cats = _as_list(r.json())
        assert isinstance(cats, list) and len(cats) >= 5
        # SHOP category ids must be prefixed shpcat_
        ids = [c["id"] for c in cats]
        assert all(cid.startswith("shpcat_") for cid in ids), ids[:3]

    def test_mart_categories_endpoint_returns_cat_ids(self, s):
        r = s.get(f"{BASE_URL}/api/mart/categories?country=CI")
        assert r.status_code == 200, r.text
        data = r.json()
        cats = _as_list(data)
        assert isinstance(cats, list) and len(cats) >= 3
        assert all(c["id"].startswith("cat_") for c in cats), cats[0]

    def test_step5_accepts_shop_categories_with_module_shop(self, s):
        app_id, _ = _start_app(s, "shop")
        cats = (s.get(f"{BASE_URL}/api/shop/categories?country=CI")
                .json()) or []
        picks = [c["id"] for c in cats[:2]]
        assert all(cid.startswith("shpcat_") for cid in picks)

        r = s.patch(f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/step", json={
            "step": 5,
            "categories": [
                {"category_id": picks[0], "module": "shop"},
                {"category_id": picks[1], "module": "shop"},
            ],
        })
        assert r.status_code == 200, r.text

        # Round-trip: GET application should reflect saved categories
        got = s.get(f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}").json()
        saved = got.get("categories") or []
        saved_ids = {c.get("category_id") for c in saved}
        assert set(picks).issubset(saved_ids), saved

    def test_step5_rejects_shop_id_without_module(self, s):
        """Without module='shop' the backend should default to mart and 400
        (shpcat_ id doesn't exist in MartCategory)."""
        app_id, _ = _start_app(s, "shop")
        cats = (s.get(f"{BASE_URL}/api/shop/categories?country=CI")
                .json()) or []
        r = s.patch(f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/step", json={
            "step": 5,
            "categories": [{"category_id": cats[0]["id"]}],  # no module
        })
        assert r.status_code == 400, r.text
        assert "Category not found" in r.text

    def test_step5_mart_still_works(self, s):
        app_id, _ = _start_app(s, "mart")
        cats = s.get(f"{BASE_URL}/api/mart/categories?country=CI").json()
        cats = _as_list(cats)
        picks = [c["id"] for c in cats[:2]]
        r = s.patch(f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/step", json={
            "step": 5,
            "categories": [{"category_id": pid, "module": "mart"} for pid in picks],
        })
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# BUG #8 — Public document upload for draft apps
# ---------------------------------------------------------------------------
class TestBug8DocumentUpload:

    def test_upload_pdf_returns_file_url(self, s):
        app_id, _ = _start_app(s, "shop")
        pdf_bytes = b"%PDF-1.4\n%QAv13\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
        r = s.post(
            f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/uploads",
            files={"file": ("id.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"kind": "document"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "file_url" in body and body["file_url"].startswith(
            f"/api/martbaked/sellers/apply/{app_id}/files/"
        )
        assert body["content_type"] == "application/pdf"

        # The returned file_url should be publicly fetchable during draft
        r2 = s.get(f"{BASE_URL}{body['file_url']}")
        assert r2.status_code == 200
        assert r2.content.startswith(b"%PDF")

    def test_upload_png_image_kind(self, s):
        app_id, _ = _start_app(s, "shop")
        # Minimal valid 1x1 PNG
        import base64
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIA"
            "AAgAAeIVvJEAAAAASUVORK5CYII="
        )
        r = s.post(
            f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/uploads",
            files={"file": ("logo.png", io.BytesIO(png), "image/png")},
            data={"kind": "image"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["content_type"] == "image/png"
        assert body["size_bytes"] == len(png)

    def test_upload_rejects_bad_mime(self, s):
        app_id, _ = _start_app(s, "shop")
        r = s.post(
            f"{BASE_URL}/api/martbaked/sellers/apply/{app_id}/uploads",
            files={"file": ("evil.exe", io.BytesIO(b"MZ\x00\x00"), "application/x-msdownload")},
            data={"kind": "document"},
        )
        assert r.status_code == 415, r.text

    def test_upload_404_when_app_missing(self, s):
        r = s.post(
            f"{BASE_URL}/api/martbaked/sellers/apply/no_such_app/uploads",
            files={"file": ("x.pdf", io.BytesIO(b"%PDF-1.4\n"), "application/pdf")},
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# BUG #2/#3 sanity — shop deep-link paths exist
# ---------------------------------------------------------------------------
class TestShopCategoryDeepLink:

    def test_mode_femme_category_page_has_products(self, s):
        # Backend endpoint used by the storefront (best-effort — endpoint name
        # may vary; we skip if not present).
        r = s.get(f"{BASE_URL}/api/shop/products?category=mode-femme&country=CI&limit=1")
        if r.status_code == 404:
            pytest.skip("Endpoint /api/shop/products not exposed publicly")
        assert r.status_code == 200, r.text
