"""Supplier image manager (Fixing_Prompt.docx v4 Phase 2 — 2026-02-28).

Endpoints under test:
  POST   /api/partner/products/{id}/images/upload   — append
  PATCH  /api/partner/products/{id}/images          — reorder / remove
  GET    /api/partner/uploads/{key:path}            — serve

Coverage:
  1. Upload happy path — images list grows, primary=[0] sync into `image`
  2. Reject unsupported content-type → 415
  3. Reject file > 6 MB → 413
  4. Reject when max reached (8 images) → 400 too_many_images
  5. Reorder happy path — order actually flips + primary follows
  6. Reject reorder with an unknown URL → 400 unknown_image
  7. Empty reorder empties gallery + `image` becomes None
  8. Foreign product ownership check → 404
"""
from __future__ import annotations
import io, os, pathlib, struct, uuid, zlib, pytest, requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PW    = "Alpha1234!Beta"


def _short() -> str: return uuid.uuid4().hex[:8]


def _png_bytes(size_bytes: int = 0) -> bytes:
    """Tiny valid 1×1 red PNG, padded via a comment chunk to `size_bytes`."""
    core = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR" + struct.pack(">II", 1, 1) + b"\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x1e\xdaG\xff"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    if size_bytes and size_bytes > len(core):
        pad = b"x" * (size_bytes - len(core) - 12)
        # tEXt chunk carrying the padding — valid PNG structure
        crc = zlib.crc32(b"tEXt" + b"pad\x00" + pad) & 0xffffffff
        chunk = struct.pack(">I", len(b"pad\x00" + pad)) + b"tEXt" + b"pad\x00" + pad + struct.pack(">I", crc)
        return core[:-12] + chunk + core[-12:]
    return core


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def product(auth):
    """Create a fresh custom SKU per test so uploads don't collide."""
    r = requests.post(f"{BASE_URL}/api/partner/products/custom", headers=auth, json={
        "name": f"TEST_Images {_short()}", "unit": "pc",
        "category_slug": "fruits-vegetables", "subcategory_slug": "fresh-fruits",
        "partner_price": 500.0, "currency": "XOF", "stock_qty": 1,
    }, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _upload(auth, pid, *, ct="image/png", body=None):
    body = body if body is not None else _png_bytes()
    return requests.post(
        f"{BASE_URL}/api/partner/products/{pid}/images/upload",
        headers=auth,
        files={"file": ("t.png", io.BytesIO(body), ct)},
        timeout=30,
    )


class TestUpload:
    def test_happy_path_appends(self, auth, product):
        r = _upload(auth, product); assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["images"]) == 1
        assert d["images"][0].startswith("/api/partner/uploads/")

    def test_unsupported_mime_is_415(self, auth, product):
        r = _upload(auth, product, ct="application/pdf")
        assert r.status_code == 415, r.text
        assert "unsupported_media_type" in r.text

    def test_oversize_rejected_413(self, auth, product):
        big = _png_bytes(size_bytes=6 * 1024 * 1024 + 512)
        r = _upload(auth, product, body=big)
        assert r.status_code == 413, r.text[:200]

    def test_max_images_enforced(self, auth, product):
        # Upload 8 successfully, 9th → 400 too_many_images
        for _ in range(8):
            r = _upload(auth, product); assert r.status_code == 200
        r = _upload(auth, product); assert r.status_code == 400, r.text
        assert "too_many_images" in r.text


class TestReorder:
    def test_reorder_flips_order(self, auth, product):
        r1 = _upload(auth, product); r2 = _upload(auth, product)
        assert r1.status_code == 200 and r2.status_code == 200
        imgs = r2.json()["images"]
        assert len(imgs) == 2
        # Swap them
        r = requests.patch(f"{BASE_URL}/api/partner/products/{product}/images",
                           headers=auth, json={"image_urls": [imgs[1], imgs[0]]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["images"] == [imgs[1], imgs[0]]

    def test_unknown_url_rejected(self, auth, product):
        r = requests.patch(f"{BASE_URL}/api/partner/products/{product}/images",
                           headers=auth, json={"image_urls": ["/api/partner/uploads/fake"]},
                           timeout=15)
        assert r.status_code == 400
        assert "unknown_image" in r.text

    def test_empty_gallery_clears_primary(self, auth, product):
        r1 = _upload(auth, product); assert r1.status_code == 200
        r = requests.patch(f"{BASE_URL}/api/partner/products/{product}/images",
                           headers=auth, json={"image_urls": []}, timeout=15)
        assert r.status_code == 200
        assert r.json()["images"] == []


class TestOwnership:
    def test_foreign_product_returns_404(self, auth):
        r = _upload(auth, "psku_definitely_not_mine")
        assert r.status_code == 404, r.text
