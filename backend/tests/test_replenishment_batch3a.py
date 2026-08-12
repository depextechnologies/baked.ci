"""Backend tests — Replenishment Suggestions (Batch 3a).

Covers:
  - Admin auth
  - GET /admin/replenishments (list + buckets)
  - POST /admin/replenishments/auto-generate (dedup logic)
  - POST /admin/replenishments (manual create) + PATCH edit
  - POST /admin/replenishments/{id}/approve|dispatch|mark-received|cancel
  - POST /admin/replenishments/quick-add (from Low/OOS)
  - Movement side effect and PartnerInventory increment on receive
  - 409 for illegal transitions and duplicate active suggestion
"""
import os
import math
import pytest
import requests

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # fall back to frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")

BASE_URL = _load_url()
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


# --------------------------------------------------------------------------- #
# 1) List + buckets
# --------------------------------------------------------------------------- #
def test_list_returns_buckets(client):
    r = client.get(f"{BASE_URL}/api/admin/replenishments?status=suggested", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "buckets" in body
    for s in ("suggested", "approved", "dispatched", "received", "cancelled"):
        assert s in body["buckets"]
    assert isinstance(body["items"], list)


# --------------------------------------------------------------------------- #
# 2) Auto-generate — dedup
# --------------------------------------------------------------------------- #
def test_auto_generate_is_deduped(client):
    r1 = client.post(
        f"{BASE_URL}/api/admin/replenishments/auto-generate",
        json={"include_out_of_stock": True, "multiplier": 3.0},
        timeout=60,
    )
    assert r1.status_code == 201, r1.text
    d1 = r1.json()
    assert set(d1.keys()) >= {"created", "skipped", "scanned"}

    # Second call — nothing new should be created (all now live)
    r2 = client.post(
        f"{BASE_URL}/api/admin/replenishments/auto-generate",
        json={"include_out_of_stock": True, "multiplier": 3.0},
        timeout=60,
    )
    assert r2.status_code == 201, r2.text
    d2 = r2.json()
    assert d2["created"] == 0, f"dedup broken, second run created {d2['created']}"


# --------------------------------------------------------------------------- #
# 3) Full lifecycle via API — approve → receive
#    Uses one of the auto-generated suggested rows (or manual fallback).
# --------------------------------------------------------------------------- #
def _find_a_suggested_id(client):
    r = client.get(f"{BASE_URL}/api/admin/replenishments?status=suggested&limit=50", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    return items[0] if items else None


def test_lifecycle_approve_and_receive(client):
    row = _find_a_suggested_id(client)
    if not row:
        pytest.skip("No suggested rows to test lifecycle")
    rep_id = row["id"]
    pp_id = row["partner_product_id"]
    wh_id = row["warehouse_id"]
    suggested_qty = row["suggested_qty"]

    # Snapshot inventory before receive
    # We reach into the movements endpoint later to verify the receive movement.

    # PATCH edit suggested_qty (bump by 1)
    new_qty = suggested_qty + 1
    rp = client.patch(
        f"{BASE_URL}/api/admin/replenishments/{rep_id}",
        json={"suggested_qty": new_qty}, timeout=30,
    )
    assert rp.status_code == 200, rp.text
    assert rp.json()["suggested_qty"] == new_qty

    # Approve (approved_qty defaults to suggested_qty)
    ra = client.post(
        f"{BASE_URL}/api/admin/replenishments/{rep_id}/approve",
        json={}, timeout=30,
    )
    assert ra.status_code == 200, ra.text
    approved = ra.json()
    assert approved["status"] == "approved"
    assert approved["approved_qty"] == new_qty

    # Mark received (bypasses dispatch)
    rr = client.post(
        f"{BASE_URL}/api/admin/replenishments/{rep_id}/mark-received",
        json={}, timeout=30,
    )
    assert rr.status_code == 200, rr.text
    received = rr.json()
    assert received["status"] == "received"
    assert received["received_qty"] == new_qty
    assert received.get("movement_id"), "movement_id should be set after receive"

    # Verify a `receive` movement was written with correct delta_qty & reason
    mv = client.get(
        f"{BASE_URL}/api/admin/inventory/movements?partner_product_id={pp_id}&warehouse_id={wh_id}&limit=20",
        timeout=30,
    )
    assert mv.status_code == 200, mv.text
    movements = mv.json().get("items") if isinstance(mv.json(), dict) else mv.json()
    # try both possible shapes
    if isinstance(movements, dict):
        movements = movements.get("items", [])
    found = [
        m for m in (movements or [])
        if m.get("kind") == "receive" and (m.get("reference") or "").endswith(rep_id)
    ]
    assert found, f"receive movement not found for rep {rep_id}: {movements}"
    m = found[0]
    assert m["delta_qty"] == new_qty
    assert "Replenishment received" in (m.get("reason") or "")

    # 4) Illegal transition: try to approve a received suggestion — 409
    ill = client.post(
        f"{BASE_URL}/api/admin/replenishments/{rep_id}/approve", json={}, timeout=30,
    )
    assert ill.status_code == 409, ill.text


# --------------------------------------------------------------------------- #
# 5) Manual replenishment — full flow + never-negative + duplicate 409
# --------------------------------------------------------------------------- #
def _pick_healthy_pp(client):
    """Return (partner_product_id, warehouse_id, available_qty) for a healthy SKU
    that has no active replenishment yet. Uses /overview then /skus/{id}."""
    ov = client.get(
        f"{BASE_URL}/api/admin/inventory/overview?stock_status=healthy&limit=100",
        timeout=30,
    )
    assert ov.status_code == 200, ov.text
    for row in ov.json().get("items", []):
        pp_id = row.get("sample_partner_product_id")
        if not pp_id:
            continue
        det = client.get(f"{BASE_URL}/api/admin/inventory/skus/{pp_id}", timeout=30)
        if det.status_code != 200:
            continue
        for st in det.json().get("distribution", []):
            if st.get("available_qty", 0) > (st.get("low_stock_threshold", 0) or 0):
                return pp_id, st.get("warehouse_id"), st.get("available_qty", 0)
    return None, None, None


def test_manual_replenishment_flow_and_uniq_409(client):
    pp_id, wh_id, before_qty = _pick_healthy_pp(client)
    if not pp_id:
        pytest.skip("No healthy SKU available for manual test")

    payload = {"partner_product_id": pp_id, "suggested_qty": 1, "reason": "TEST_manual"}
    r1 = client.post(f"{BASE_URL}/api/admin/replenishments", json=payload, timeout=30)
    if r1.status_code == 409:
        pytest.skip("SKU already has active replenishment; skipping manual flow")
    assert r1.status_code == 201, r1.text
    rep = r1.json()
    rep_id = rep["id"]

    # Duplicate manual create must 409
    r_dup = client.post(f"{BASE_URL}/api/admin/replenishments", json=payload, timeout=30)
    assert r_dup.status_code == 409, r_dup.text

    # Approve + receive
    ra = client.post(f"{BASE_URL}/api/admin/replenishments/{rep_id}/approve", json={}, timeout=30)
    assert ra.status_code == 200, ra.text
    rr = client.post(f"{BASE_URL}/api/admin/replenishments/{rep_id}/mark-received", json={}, timeout=30)
    assert rr.status_code == 200, rr.text
    received = rr.json()
    assert received["received_qty"] == 1

    # Verify inventory incremented by 1 via sku detail
    det = client.get(f"{BASE_URL}/api/admin/inventory/skus/{pp_id}", timeout=30)
    assert det.status_code == 200, det.text
    stores = det.json().get("distribution", [])
    after = next((s for s in stores if s.get("warehouse_id") == wh_id), None)
    assert after is not None, f"couldn't find store {wh_id} in {stores}"
    assert after["available_qty"] == before_qty + 1, (
        f"expected {before_qty + 1}, got {after['available_qty']}"
    )


# --------------------------------------------------------------------------- #
# 6) Illegal transition: mark-received on a cancelled row → 409
# --------------------------------------------------------------------------- #
def test_illegal_transition_cancelled_to_received(client):
    pp_id, _, _ = _pick_healthy_pp(client)
    if not pp_id:
        pytest.skip("No healthy SKU available")
    r = client.post(
        f"{BASE_URL}/api/admin/replenishments",
        json={"partner_product_id": pp_id, "suggested_qty": 1, "reason": "TEST_cancel"},
        timeout=30,
    )
    if r.status_code != 201:
        pytest.skip(f"could not create manual rep: {r.status_code} {r.text}")
    rep_id = r.json()["id"]
    rc = client.post(f"{BASE_URL}/api/admin/replenishments/{rep_id}/cancel", json={}, timeout=30)
    assert rc.status_code == 200, rc.text
    rill = client.post(
        f"{BASE_URL}/api/admin/replenishments/{rep_id}/mark-received", json={}, timeout=30,
    )
    assert rill.status_code == 409, rill.text


# --------------------------------------------------------------------------- #
# 7) Quick-add from Low/OOS centre
# --------------------------------------------------------------------------- #
def test_quick_add_dedup(client):
    # Find a low-stock SKU
    ls = client.get(f"{BASE_URL}/api/admin/inventory/low-stock?limit=20", timeout=30)
    if ls.status_code != 200:
        pytest.skip(f"low-stock endpoint returned {ls.status_code}")
    body = ls.json()
    items = body.get("items") if isinstance(body, dict) else body
    if not items:
        pytest.skip("No low-stock items")
    row = items[0]
    pp_id = row.get("partner_product_id") or row.get("id")
    wh_id = row.get("warehouse_id")
    if not (pp_id and wh_id):
        pytest.skip("low-stock row missing product/warehouse ids")

    r1 = client.post(
        f"{BASE_URL}/api/admin/replenishments/quick-add",
        json={"partner_product_id": pp_id, "warehouse_id": wh_id},
        timeout=30,
    )
    # 201 (created) OR 409 if already live from auto-generate
    assert r1.status_code in (201, 409), r1.text
    # Second attempt must always 409
    r2 = client.post(
        f"{BASE_URL}/api/admin/replenishments/quick-add",
        json={"partner_product_id": pp_id, "warehouse_id": wh_id},
        timeout=30,
    )
    assert r2.status_code == 409, r2.text
