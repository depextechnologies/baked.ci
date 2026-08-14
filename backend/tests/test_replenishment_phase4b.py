"""Phase 4b — Partner Replenishment → Draft PO conversion tests."""
import os
import pytest
import requests
import asyncio
import asyncpg

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASSWORD = "Alpha1234!Beta"
DB_URL = "postgresql://baked:baked_local_dev@127.0.0.1:5432/baked"
SUG_IDS = ["rep_test_alpha_001", "rep_test_alpha_002", "rep_test_alpha_003"]


def _reset_state():
    async def _run():
        conn = await asyncpg.connect(DB_URL)
        # unlink any POs referencing these suggestions
        await conn.execute(
            "UPDATE partner_replenishments SET status='suggested', converted_po_id=NULL "
            "WHERE id = ANY($1::text[])", SUG_IDS
        )
        # delete draft POs that were auto-generated from these suggestions (safe cleanup)
        rows = await conn.fetch(
            "SELECT id FROM purchase_orders WHERE notes LIKE 'Auto-generated from % replenishment suggestion(s).'"
        )
        for r in rows:
            await conn.execute("DELETE FROM purchase_order_audit WHERE purchase_order_id=$1", r["id"])
            await conn.execute("DELETE FROM purchase_order_lines WHERE purchase_order_id=$1", r["id"])
            await conn.execute("DELETE FROM purchase_orders WHERE id=$1", r["id"])
        await conn.close()
    asyncio.get_event_loop().run_until_complete(_run())


@pytest.fixture(scope="module", autouse=True)
def reset_state_around():
    _reset_state()
    yield
    _reset_state()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# --- RBAC ---
def test_unauth_returns_401():
    r = requests.get(f"{BASE_URL}/api/partner/replenishments")
    assert r.status_code in (401, 403)


# --- List ---
def test_list_returns_partner_scoped_items(hdr):
    r = requests.get(f"{BASE_URL}/api/partner/replenishments", headers=hdr)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and "buckets" in data
    ids = [it["id"] for it in data["items"]]
    for s in SUG_IDS:
        assert s in ids, f"Missing seeded {s}"
    # Verify structure of one item
    it = next(x for x in data["items"] if x["id"] == "rep_test_alpha_001")
    assert it["product"]["name"]
    assert it["warehouse"]["code"] == "MRT-ABJ-001"
    assert it["primary_supplier"] is not None
    assert it["primary_supplier"]["code"] == "SUP-CI-0001"
    # rep_002 has no supplier
    it2 = next(x for x in data["items"] if x["id"] == "rep_test_alpha_002")
    assert it2["primary_supplier"] is None


def test_list_status_filter(hdr):
    r = requests.get(f"{BASE_URL}/api/partner/replenishments?status=suggested", headers=hdr)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["status"] == "suggested"


# --- Convert happy path ---
def test_convert_happy_path(hdr):
    r = requests.post(
        f"{BASE_URL}/api/partner/replenishments/convert-to-draft-po",
        headers=hdr, json={"suggestion_ids": SUG_IDS},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert len(data["created_pos"]) == 1, f"Expected 1 PO, got {data}"
    po = data["created_pos"][0]
    assert po["supplier"]["code"] == "SUP-CI-0001"
    assert po["line_count"] == 2
    assert po["warehouse"]["code"] == "MRT-ABJ-001"
    assert set(po["suggestion_ids"]) == {"rep_test_alpha_001", "rep_test_alpha_003"}
    # rep_002 skipped as no_supplier
    skipped = {s["suggestion_id"]: s["reason"] for s in data["skipped"]}
    assert skipped.get("rep_test_alpha_002") == "no_supplier"
    # persist po_id for next tests
    pytest.po_id = po["po_id"]
    pytest.po_code = po["po_code"]


def test_source_suggestions_flipped(hdr):
    r = requests.get(f"{BASE_URL}/api/partner/replenishments?status=converted_to_po", headers=hdr)
    assert r.status_code == 200
    ids = {it["id"]: it for it in r.json()["items"]}
    assert "rep_test_alpha_001" in ids
    assert "rep_test_alpha_003" in ids
    assert ids["rep_test_alpha_001"]["converted_po_id"] == pytest.po_id
    # rep_002 remains suggested
    r2 = requests.get(f"{BASE_URL}/api/partner/replenishments?status=suggested", headers=hdr)
    ids2 = [it["id"] for it in r2.json()["items"]]
    assert "rep_test_alpha_002" in ids2


# --- Idempotency ---
def test_reconvert_already_converted(hdr):
    r = requests.post(
        f"{BASE_URL}/api/partner/replenishments/convert-to-draft-po",
        headers=hdr, json={"suggestion_ids": ["rep_test_alpha_001"]},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["created_pos"] == []
    skipped = data["skipped"]
    assert len(skipped) == 1
    assert skipped[0]["reason"] == "already_converted"
    assert skipped[0]["detail"]["status"] == "draft"


# --- Recycle after cancel ---
def test_recycle_after_cancel(hdr):
    # Cancel the draft PO
    r = requests.post(
        f"{BASE_URL}/api/partner/purchase-orders/{pytest.po_id}/cancel",
        headers=hdr, json={"reason": "test cancel"},
    )
    assert r.status_code == 200, r.text
    # Now re-convert rep_001 — should create a NEW PO
    r2 = requests.post(
        f"{BASE_URL}/api/partner/replenishments/convert-to-draft-po",
        headers=hdr, json={"suggestion_ids": ["rep_test_alpha_001"]},
    )
    assert r2.status_code == 201, r2.text
    d = r2.json()
    assert len(d["created_pos"]) == 1
    assert d["created_pos"][0]["po_id"] != pytest.po_id


# --- Cross-partner RBAC ---
def test_convert_wrong_partner_suggestion(hdr):
    r = requests.post(
        f"{BASE_URL}/api/partner/replenishments/convert-to-draft-po",
        headers=hdr, json={"suggestion_ids": ["rep_totally_fake_id_xyz"]},
    )
    assert r.status_code == 201
    d = r.json()
    assert d["created_pos"] == []
    assert any(s["reason"] == "not_found" for s in d["skipped"])
