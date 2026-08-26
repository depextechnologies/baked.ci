"""Backend tests for Homepage CMS (Phase B uploads + Phase C public API)."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ----- Public GET /api/homepage -----
class TestPublicHomepage:
    def test_get_homepage_ci(self):
        r = requests.get(f"{BASE_URL}/api/homepage", params={"country": "CI"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["country"] == "CI"
        assert isinstance(data["sections"], list)
        # seed says 10 sections
        assert len(data["sections"]) >= 1, "CI should be seeded with at least 1 section"
        for s in data["sections"]:
            assert "id" in s and "section_type" in s and "config" in s
            assert s["is_enabled"] is True

    def test_get_homepage_in(self):
        r = requests.get(f"{BASE_URL}/api/homepage", params={"country": "IN"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["country"] == "IN"
        assert isinstance(data["sections"], list)  # may be empty

    def test_missing_country_400(self):
        r = requests.get(f"{BASE_URL}/api/homepage", timeout=15)
        assert r.status_code in (400, 422)


# ----- Admin list -----
class TestAdminList:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/homepage-sections", params={"country": "CI"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_ci(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/homepage-sections",
                         params={"country": "CI"}, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "section_types" in data
        assert data["country"] == "CI"


# ----- Uploads -----
def _png_bytes():
    # tiny 1x1 red PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000D49444154789C63F8CFC000000003000100"  # not full but ok
        "00000000496D0B7A0000000049454E44AE426082"
    )


class TestUploads:
    def test_upload_requires_auth(self):
        files = {"file": ("test.png", io.BytesIO(b"fake"), "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/homepage-sections/uploads",
                          files=files, timeout=15)
        assert r.status_code in (401, 403)

    def test_upload_rejects_non_image(self, admin_token):
        files = {"file": ("hack.txt", io.BytesIO(b"hello world"), "text/plain")}
        r = requests.post(
            f"{BASE_URL}/api/admin/homepage-sections/uploads",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_upload_and_serve_image(self, admin_token):
        payload = _png_bytes()
        files = {"file": ("t.png", io.BytesIO(payload), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/admin/homepage-sections/uploads",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}, timeout=30,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        data = r.json()
        assert "file_url" in data
        url = data["file_url"]
        assert url.startswith("/api/homepage/uploads/"), f"unexpected url: {url}"
        # Fetch back
        full = f"{BASE_URL}{url}"
        g = requests.get(full, timeout=15)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("image/")
        assert g.content == payload, "returned bytes must match uploaded bytes"


# ----- CRUD roundtrip -----
class TestSectionCRUD:
    def test_create_update_delete_section(self, admin_headers):
        payload = {
            "country": "CI",
            "section_type": "promotional_banner",
            "title": "TEST_PromoBanner",
            "subtitle": "regression test banner",
            "config": {"badge": "TEST", "cta_label": "Shop", "link": "/products"},
            "display_order": 999,
            "is_enabled": False,
        }
        r = requests.post(f"{BASE_URL}/api/admin/homepage-sections",
                          json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 201, f"create failed: {r.status_code} {r.text}"
        sec = r.json()
        sid = sec["id"]
        assert sec["title"] == "TEST_PromoBanner"
        try:
            # PATCH
            r2 = requests.patch(f"{BASE_URL}/api/admin/homepage-sections/{sid}",
                                json={"title": "TEST_Updated", "is_enabled": True},
                                headers=admin_headers, timeout=15)
            assert r2.status_code == 200
            assert r2.json()["title"] == "TEST_Updated"
            assert r2.json()["is_enabled"] is True

            # Verify appears in public GET (enabled now)
            g = requests.get(f"{BASE_URL}/api/homepage", params={"country": "CI"}, timeout=15)
            ids = [s["id"] for s in g.json()["sections"]]
            assert sid in ids
        finally:
            d = requests.delete(f"{BASE_URL}/api/admin/homepage-sections/{sid}",
                                headers=admin_headers, timeout=15)
            assert d.status_code in (200, 204)
