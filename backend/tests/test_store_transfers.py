"""Backend tests — Store Transfers (Super Admin).

Covers:
  - GET /admin/transfers (buckets + list, existing TR-000001 in received)
  - GET /admin/transfers/lookups/warehouses + source-inventory
  - Full lifecycle: create → approve → dispatch → receive
  - Negative: same source/dest 400, foreign product 400
  - Over-dispatch: 409 + rollback
  - Approve/receive on wrong status → 409
  - Cancel mid-flight: units returned to source + transfer_in movement
  - Auto-link: new destination partner_product row for master SKU
"""
import os
import time
import pytest
import requests


def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    return v.rstrip("/")


BASE_URL = _load_url()
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def c(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def warehouses(c):
    r = c.get(f"{BASE_URL}/api/admin/transfers/lookups/warehouses", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    by_code = {w["warehouse_code"]: w for w in items}
    assert "MRT-ABJ-001" in by_code and "MRT-ABJ-002" in by_code, by_code
    return by_code


@pytest.fixture(scope="module")
def alpha(warehouses):
    return warehouses["MRT-ABJ-001"]


@pytest.fixture(scope="module")
def beta(warehouses):
    return warehouses["MRT-ABJ-002"]


# --------------------------------------------------------------------------- #
# 1) List + buckets + existing TR-000001
# --------------------------------------------------------------------------- #
def test_list_and_buckets(c):
    r = c.get(f"{BASE_URL}/api/admin/transfers", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("draft", "requested", "approved", "in_transit", "received", "cancelled"):
        assert k in body["buckets"]
    codes = [t["code"] for t in body["items"]]
    assert "TR-000001" in codes, f"TR-000001 missing; got {codes}"


# --------------------------------------------------------------------------- #
# 2) Source inventory lookup
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def alpha_inv(c, alpha):
    r = c.get(f"{BASE_URL}/api/admin/transfers/lookups/source-inventory/{alpha['warehouse_id']}", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 1, "no products at alpha"
    return items


def test_source_inventory_names_not_untitled(alpha_inv):
    for it in alpha_inv:
        assert it["name"] and it["name"] != "Untitled", it


# --------------------------------------------------------------------------- #
# 3) Negative A: same source/dest → 400
# --------------------------------------------------------------------------- #
def test_same_src_dst_rejected(c, alpha, alpha_inv):
    r = c.post(f"{BASE_URL}/api/admin/transfers", json={
        "from_warehouse_id": alpha["warehouse_id"],
        "to_warehouse_id": alpha["warehouse_id"],
        "items": [{"from_partner_product_id": alpha_inv[0]["partner_product_id"], "quantity": 1}],
    }, timeout=30)
    assert r.status_code == 400, r.text
    assert "differ" in r.text.lower()


# --------------------------------------------------------------------------- #
# 4) Negative B: product from wrong partner
# --------------------------------------------------------------------------- #
def test_foreign_product_rejected(c, alpha, beta):
    # Grab a product owned by beta
    r = c.get(f"{BASE_URL}/api/admin/transfers/lookups/source-inventory/{beta['warehouse_id']}", timeout=30)
    assert r.status_code == 200, r.text
    beta_items = r.json()["items"]
    if not beta_items:
        pytest.skip("Beta has no inventory to use as a foreign product")
    r = c.post(f"{BASE_URL}/api/admin/transfers", json={
        "from_warehouse_id": alpha["warehouse_id"],
        "to_warehouse_id": beta["warehouse_id"],
        "items": [{"from_partner_product_id": beta_items[0]["partner_product_id"], "quantity": 1}],
    }, timeout=30)
    assert r.status_code == 400, r.text
    assert "does not belong" in r.text.lower() or "source store" in r.text.lower()


# --------------------------------------------------------------------------- #
# 5) Full lifecycle: create → approve → dispatch → receive
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def created_transfer(c, alpha, beta, alpha_inv):
    """Create TR with a small qty on the FIRST alpha SKU."""
    src = alpha_inv[0]
    qty = 1
    r = c.post(f"{BASE_URL}/api/admin/transfers", json={
        "from_warehouse_id": alpha["warehouse_id"],
        "to_warehouse_id": beta["warehouse_id"],
        "reason": "TEST_lifecycle",
        "items": [{"from_partner_product_id": src["partner_product_id"], "quantity": qty}],
    }, timeout=30)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "requested"
    assert body["code"].startswith("TR-")
    return {"transfer": body, "src_pp": src["partner_product_id"], "src_avail_before": src["available_qty"], "qty": qty}


def test_created_appears_in_requested(c, created_transfer):
    r = c.get(f"{BASE_URL}/api/admin/transfers?status=requested", timeout=30)
    assert r.status_code == 200
    codes = [t["code"] for t in r.json()["items"]]
    assert created_transfer["transfer"]["code"] in codes


def test_approve(c, created_transfer):
    tid = created_transfer["transfer"]["id"]
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/approve", json={}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_double_approve_rejected(c, created_transfer):
    tid = created_transfer["transfer"]["id"]
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/approve", json={}, timeout=30)
    assert r.status_code == 409, r.text


def test_receive_before_dispatch_rejected(c, created_transfer):
    tid = created_transfer["transfer"]["id"]
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/receive", json={}, timeout=30)
    assert r.status_code == 409, r.text


def _store_inv(c, wh_id):
    r = c.get(f"{BASE_URL}/api/admin/inventory/stores/{wh_id}", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_dispatch(c, created_transfer, alpha):
    tid = created_transfer["transfer"]["id"]
    src_pp = created_transfer["src_pp"]
    qty = created_transfer["qty"]

    # Snapshot source available_qty just before dispatch
    inv_before = _store_inv(c, alpha["warehouse_id"])
    before = _find_sku_avail(inv_before, src_pp)

    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/dispatch", json={}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_transit"

    inv_after = _store_inv(c, alpha["warehouse_id"])
    after = _find_sku_avail(inv_after, src_pp)
    assert after == before - qty, f"source not decremented: {before} -> {after}"


def _find_sku_avail(inv_payload, pp_id):
    for it in inv_payload.get("items", []):
        if it.get("partner_product_id") == pp_id:
            return it.get("available_qty")
    return None


def test_receive_and_destination_incremented(c, created_transfer, beta):
    tid = created_transfer["transfer"]["id"]
    qty = created_transfer["qty"]
    # Snapshot beta before
    inv_before = _store_inv(c, beta["warehouse_id"])

    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/receive", json={}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "received"

    # Destination items must show the transferred SKU with a real name (not 'Untitled')
    inv_after = _store_inv(c, beta["warehouse_id"])
    items = inv_after.get("items", [])
    to_pp_id = body["items"][0]["to_product"]["id"]
    matched = [it for it in items if it.get("partner_product_id") == to_pp_id]
    assert matched, f"destination SKU {to_pp_id} not present at beta"
    row = matched[0]
    name = row.get("name") or row.get("product_name")
    assert name and name != "Untitled", f"destination name is Untitled: {row}"

    # Delta: destination available_qty should be old+qty (or created new at qty)
    before_qty = _find_sku_avail(inv_before, to_pp_id) or 0
    assert row.get("available_qty") == before_qty + qty


def test_movements_written(c, created_transfer):
    tid = created_transfer["transfer"]["id"]
    r = c.get(f"{BASE_URL}/api/admin/inventory/movements?limit=50", timeout=30)
    assert r.status_code == 200, r.text
    movs = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
    if isinstance(movs, dict):
        movs = movs.get("items", [])
    # Filter for our transfer id
    ours = [m for m in movs if (m.get("reference") or "").startswith(f"transfer:{tid}:")]
    kinds = {m.get("kind") for m in ours}
    assert "transfer_out" in kinds, f"transfer_out missing: {ours}"
    assert "transfer_in" in kinds, f"transfer_in missing: {ours}"


def test_approve_already_received_rejected(c, created_transfer):
    tid = created_transfer["transfer"]["id"]
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/approve", json={}, timeout=30)
    assert r.status_code == 409


# --------------------------------------------------------------------------- #
# 6) Negative C: over-dispatch → 409 + rollback (status still approved)
# --------------------------------------------------------------------------- #
def test_over_dispatch_rolls_back(c, alpha, beta, alpha_inv):
    src = alpha_inv[0]
    r = c.post(f"{BASE_URL}/api/admin/transfers", json={
        "from_warehouse_id": alpha["warehouse_id"],
        "to_warehouse_id": beta["warehouse_id"],
        "reason": "TEST_over",
        "items": [{"from_partner_product_id": src["partner_product_id"], "quantity": 999999}],
    }, timeout=30)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/approve", json={}, timeout=30)
    assert r.status_code == 200
    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/dispatch", json={}, timeout=30)
    assert r.status_code == 409, r.text
    assert "insufficient" in r.text.lower()
    # Status still approved
    r = c.get(f"{BASE_URL}/api/admin/transfers/{tid}", timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    # Cleanup
    c.post(f"{BASE_URL}/api/admin/transfers/{tid}/cancel", json={}, timeout=30)


# --------------------------------------------------------------------------- #
# 7) Cancel-mid-flight: returns units to source
# --------------------------------------------------------------------------- #
def test_cancel_in_transit_returns_stock(c, alpha, beta, alpha_inv):
    src = alpha_inv[0]
    qty = 1
    r = c.post(f"{BASE_URL}/api/admin/transfers", json={
        "from_warehouse_id": alpha["warehouse_id"],
        "to_warehouse_id": beta["warehouse_id"],
        "reason": "TEST_cancel_midflight",
        "items": [{"from_partner_product_id": src["partner_product_id"], "quantity": qty}],
    }, timeout=30)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]

    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/approve", json={}, timeout=30)
    assert r.status_code == 200

    inv_before = _store_inv(c, alpha["warehouse_id"])
    before = _find_sku_avail(inv_before, src["partner_product_id"])

    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/dispatch", json={}, timeout=30)
    assert r.status_code == 200

    inv_mid = _store_inv(c, alpha["warehouse_id"])
    mid = _find_sku_avail(inv_mid, src["partner_product_id"])
    assert mid == before - qty

    r = c.post(f"{BASE_URL}/api/admin/transfers/{tid}/cancel", json={}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"

    inv_after = _store_inv(c, alpha["warehouse_id"])
    after = _find_sku_avail(inv_after, src["partner_product_id"])
    assert after == before, f"stock not returned to source: before={before} after={after}"

    # Look for the return movement
    r = c.get(f"{BASE_URL}/api/admin/inventory/movements?limit=100", timeout=30)
    movs = r.json()
    if isinstance(movs, dict):
        movs = movs.get("items", [])
    returns = [m for m in movs if (m.get("reference") or "").startswith(f"transfer:{tid}:") and m.get("kind") == "transfer_in"]
    assert returns, "return transfer_in movement missing"
    assert "cancelled" in (returns[0].get("reason") or "").lower()
