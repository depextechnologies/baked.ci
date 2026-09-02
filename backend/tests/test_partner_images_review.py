"""Phase 3 — Supplier gallery review queue (Fixing_Prompt.docx v4).

Flow under test:
  1. Supplier uploads image on a LINKED product → images_review_status='pending'
  2. Admin lists pending queue → sees the row
  3. Admin approves → MartProduct.images mirrors + status='approved'
  4. Supplier uploads again → back to 'pending' → admin rejects with note
  5. Reject without note → 400 note_required
  6. Approve/reject a non-pending row → 409 not_pending
  7. Approve when master link missing → 400 not_linked
"""
from __future__ import annotations
import io, os, pathlib, struct, uuid, pytest, requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PW    = "Alpha1234!Beta"
ADMIN_EMAIL   = "depexopenai@gmail.com"
ADMIN_PW      = "baked@2026#!$@"


def _short(): return uuid.uuid4().hex[:8]


def _png() -> bytes:
    return (b"\x89PNG\r\n\x1a\n"
            b"\x00\x00\x00\rIHDR" + struct.pack(">II", 1, 1) + b"\x08\x02\x00\x00\x00\x90wS\xde"
            b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x1e\xdaG\xff"
            b"\x00\x00\x00\x00IEND\xaeB`\x82")


@pytest.fixture(scope="module")
def partner_auth():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_auth():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def linked_product(partner_auth):
    """Grab any partner product where master_product_id is set (Alpha seed has these)."""
    r = requests.get(f"{BASE_URL}/api/partner/products?limit=50", headers=partner_auth, timeout=15)
    assert r.status_code == 200, r.text
    linked = [p for p in r.json()["items"] if p.get("master_product_id")]
    assert linked, "Seed missing a master-linked product"
    return linked[0]["id"]


def _upload(partner_auth, pid):
    return requests.post(
        f"{BASE_URL}/api/partner/products/{pid}/images/upload",
        headers=partner_auth,
        files={"file": ("t.png", io.BytesIO(_png()), "image/png")},
        timeout=20,
    )


def _fetch_pp(partner_auth, pid):
    """Locate the same product back in the list — the images_review_status
    field is exposed through the list serializer."""
    r = requests.get(f"{BASE_URL}/api/partner/products?limit=100", headers=partner_auth, timeout=15)
    for p in r.json()["items"]:
        if p["id"] == pid: return p
    raise AssertionError(f"product {pid} not in list")


class TestReviewLifecycle:
    def test_upload_flags_pending(self, partner_auth, linked_product):
        r = _upload(partner_auth, linked_product); assert r.status_code == 200, r.text
        p = _fetch_pp(partner_auth, linked_product)
        assert p["images_review_status"] == "pending"

    def test_admin_queue_shows_pending(self, partner_auth, admin_auth, linked_product):
        _upload(partner_auth, linked_product)
        r = requests.get(f"{BASE_URL}/api/admin/mart-partner/partner-products/pending-images",
                         headers=admin_auth, timeout=15)
        assert r.status_code == 200, r.text
        ids = [it["partner_product_id"] for it in r.json()["items"]]
        assert linked_product in ids

    def test_approve_mirrors_to_master(self, partner_auth, admin_auth, linked_product):
        _upload(partner_auth, linked_product)
        r = requests.post(f"{BASE_URL}/api/admin/mart-partner/partner-products/"
                          f"{linked_product}/images/approve", headers=admin_auth, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        assert isinstance(d["master_images"], list) and len(d["master_images"]) >= 1
        # Fetch the master via public endpoint to confirm the sync landed
        mp = d["master_product_id"]
        r2 = requests.get(f"{BASE_URL}/api/mart/products/{mp}", timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("images", []) == d["master_images"]

    def test_reject_requires_note(self, partner_auth, admin_auth, linked_product):
        _upload(partner_auth, linked_product)     # back to pending
        r = requests.post(f"{BASE_URL}/api/admin/mart-partner/partner-products/"
                          f"{linked_product}/images/reject",
                          headers=admin_auth, json={"note": None}, timeout=15)
        assert r.status_code == 400, r.text
        assert "note_required" in r.text

    def test_reject_persists_note(self, partner_auth, admin_auth, linked_product):
        _upload(partner_auth, linked_product)     # ensure pending
        r = requests.post(f"{BASE_URL}/api/admin/mart-partner/partner-products/"
                          f"{linked_product}/images/reject",
                          headers=admin_auth, json={"note": "Image is blurry, please re-shoot"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "rejected" and "blurry" in d["note"]

    def test_double_action_is_409(self, admin_auth, linked_product):
        # Product is now 'rejected' from previous test → approve/reject should 409
        for path in ("approve", "reject"):
            r = requests.post(f"{BASE_URL}/api/admin/mart-partner/partner-products/"
                              f"{linked_product}/images/{path}",
                              headers=admin_auth, json={"note": "n/a"}, timeout=15)
            assert r.status_code == 409, f"{path}: {r.text}"
            assert "not_pending" in r.text
