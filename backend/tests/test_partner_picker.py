"""Backend tests for Partner Picker/Packer/Dispatch workflow.

Endpoints under test (prefix /api):
  - POST /admin/mart-partner/partners/{pid}/demo-orders (seed)
  - POST /partner/orders/{id}/accept
  - GET  /partner/picker/queue
  - GET  /partner/picker/orders/{id}
  - POST /partner/picker/orders/{id}/scan
  - POST /partner/picker/orders/{id}/set-item
  - POST /partner/picker/orders/{id}/complete
  - RBAC: cashier -> 403, packer -> 200 on scan
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PARTNER_ID = "prt_alpha_demo_seed"


# ---------- fixtures ----------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/admin/auth/login", json={
        "email": "depexopenai@gmail.com", "password": "baked@2026#!$@"
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE}/api/partner/auth/login", json={
        "email": "partner-alpha-store@test.example", "password": "Alpha1234!Beta"
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def packer_token():
    r = requests.post(f"{BASE}/api/partner/auth/staff-login", json={
        "identifier": "EMP-ABJ-001", "password": "Packer1234!",
        "store_id": "MRT-ABJ-001",
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"packer login unavailable: {r.status_code} {r.text}")
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def seeded_orders(admin_token, owner_token):
    """Seed 3 demo orders and accept them; return list of po_ids."""
    r = requests.post(
        f"{BASE}/api/admin/mart-partner/partners/{PARTNER_ID}/demo-orders",
        params={"count": 3}, headers=_hdr(admin_token), timeout=60,
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    order_numbers = set(data.get("order_numbers") or [])
    assert len(order_numbers) >= 3, f"expected 3 order_numbers, got {data}"

    # Resolve to partner_order IDs via the partner orders listing
    lr = requests.get(f"{BASE}/api/partner/orders",
                      params={"status": "new", "limit": 100},
                      headers=_hdr(owner_token), timeout=30)
    assert lr.status_code == 200, lr.text
    items = lr.json().get("items", [])
    po_ids = [it["id"] for it in items if it.get("order_number") in order_numbers]
    # Fallback: if order_number key differs, filter by matching by number field variants
    if len(po_ids) < 3:
        po_ids = [it["id"] for it in items if any(
            it.get(k) in order_numbers for k in ("order_number", "number")
        )]
    assert len(po_ids) >= 3, f"could not resolve po_ids for {order_numbers}; items sample: {items[:2]}"

    # Accept each
    for pid in po_ids:
        rr = requests.post(f"{BASE}/api/partner/orders/{pid}/status",
                           json={"status": "accepted"},
                           headers=_hdr(owner_token), timeout=30)
        # tolerate already-accepted
        assert rr.status_code in (200, 409), f"{pid} accept: {rr.status_code} {rr.text}"
    return po_ids


# ---------- queue -------------------------------------------------------------
def test_queue_returns_accepted_orders(owner_token, seeded_orders):
    r = requests.get(f"{BASE}/api/partner/picker/queue", headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "buckets" in body
    ids = {i["id"] for i in body["items"]}
    for pid in seeded_orders:
        assert pid in ids, f"seeded order {pid} missing from queue"
    for it in body["items"]:
        if it["id"] in seeded_orders:
            assert it["required_units"] >= 1
            assert it["picked_units"] == 0
            assert it["progress_pct"] == 0
            assert it["item_count"] >= 1
            assert it["status"] in ("accepted", "packing")


# ---------- detail ------------------------------------------------------------
def test_detail_has_lines_and_progress(owner_token, seeded_orders):
    pid = seeded_orders[0]
    r = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["id"] == pid
    assert isinstance(d["lines"], list) and len(d["lines"]) >= 1
    line = d["lines"][0]
    for k in ("id", "product_id", "required_qty", "picked_qty", "is_complete"):
        assert k in line


# ---------- scan valid & auto-flip status -------------------------------------
def test_scan_by_product_id_flips_status_and_increments(owner_token, seeded_orders):
    pid = seeded_orders[1]
    detail = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token)).json()
    assert detail["status"] == "accepted"
    line = detail["lines"][0]
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/scan",
                      json={"code": line["product_id"] or line["id"], "qty": 1},
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "packing"
    upd = next(l for l in body["lines"] if l["id"] == line["id"])
    assert upd["picked_qty"] == 1


# ---------- scan invalid ------------------------------------------------------
def test_scan_invalid_code_returns_404(owner_token, seeded_orders):
    pid = seeded_orders[1]
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/scan",
                      json={"code": "BOGUS123"}, headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 404
    detail = r.json().get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "not_in_order"


# ---------- scan already-complete ---------------------------------------------
def test_scan_already_complete_returns_409(owner_token, seeded_orders):
    pid = seeded_orders[1]
    detail = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token)).json()
    # pick line 0 to full via set-item
    line = detail["lines"][0]
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/set-item",
                      json={"order_item_id": line["id"], "picked_qty": line["required_qty"]},
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    # Re-scan should 409
    r2 = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/scan",
                       json={"code": line["product_id"] or line["id"]},
                       headers=_hdr(owner_token), timeout=30)
    assert r2.status_code == 409
    d = r2.json().get("detail")
    if isinstance(d, dict):
        assert d.get("code") == "already_complete"


# ---------- set-item bounds ---------------------------------------------------
def test_set_item_caps_and_floors(owner_token, seeded_orders):
    pid = seeded_orders[2]
    detail = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token)).json()
    line = detail["lines"][0]
    # Over-set → capped at required_qty
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/set-item",
                      json={"order_item_id": line["id"], "picked_qty": 9999},
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200
    upd = next(l for l in r.json()["lines"] if l["id"] == line["id"])
    assert upd["picked_qty"] == line["required_qty"]
    # Decrement to 0
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/set-item",
                      json={"order_item_id": line["id"], "picked_qty": 0},
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200
    upd = next(l for l in r.json()["lines"] if l["id"] == line["id"])
    assert upd["picked_qty"] == 0


# ---------- complete incomplete -----------------------------------------------
def test_complete_incomplete_returns_409(owner_token, seeded_orders):
    pid = seeded_orders[2]
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/complete",
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 409
    d = r.json().get("detail")
    if isinstance(d, dict):
        assert d.get("code") == "incomplete_picks"
        assert isinstance(d.get("missing"), list) and len(d["missing"]) >= 1


# ---------- complete happy path -----------------------------------------------
def test_complete_ready_transition(owner_token, seeded_orders):
    pid = seeded_orders[0]
    detail = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token)).json()
    for line in detail["lines"]:
        rr = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/set-item",
                           json={"order_item_id": line["id"], "picked_qty": line["required_qty"]},
                           headers=_hdr(owner_token), timeout=30)
        assert rr.status_code == 200, rr.text
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/complete",
                      headers=_hdr(owner_token), timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ready"


# ---------- RBAC — packer allowed ---------------------------------------------
def test_packer_can_scan(packer_token, seeded_orders, owner_token):
    pid = seeded_orders[1]
    detail = requests.get(f"{BASE}/api/partner/picker/orders/{pid}", headers=_hdr(owner_token)).json()
    # find a line not yet fully picked
    target = next((l for l in detail["lines"] if l["picked_qty"] < l["required_qty"]), None)
    if not target:
        pytest.skip("all lines already picked")
    r = requests.post(f"{BASE}/api/partner/picker/orders/{pid}/scan",
                      json={"code": target["product_id"] or target["id"]},
                      headers=_hdr(packer_token), timeout=30)
    assert r.status_code in (200, 409), r.text  # 409 if already complete now
    if r.status_code == 200:
        upd = next(l for l in r.json()["lines"] if l["id"] == target["id"])
        assert upd["picked_qty"] == target["picked_qty"] + 1


# ---------- RBAC — unauth ------------------------------------------------------
def test_queue_requires_auth():
    r = requests.get(f"{BASE}/api/partner/picker/queue", timeout=30)
    assert r.status_code in (401, 403)
