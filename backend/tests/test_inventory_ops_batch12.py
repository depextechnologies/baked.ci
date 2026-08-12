"""Batches 1 + 2: Inventory Control Tower + DS Receiving/Put-away/Stock Counts.

Covers:
  * Super Admin Control Tower: /admin/inventory/{kpis,overview,skus,stores,low-stock,out-of-stock,movements}
  * Partner Receiving: create → verify → put-away flow + guardrails (409s)
  * Partner Stock Counts: create → record → apply flow + never-negative + movement recorded
  * Partner dashboard-kpis (pending_receiving / pending_put_away / pending_counts)
"""
from __future__ import annotations
import os
import pathlib
import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("depexopenai@gmail.com", "baked@2026#!$@")
PARTNER = ("partner-alpha-store@test.example", "Alpha1234!Beta")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def partner_h():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER[0], "password": PARTNER[1]}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def a_partner_product(partner_h):
    """Grab an existing partner product to use in receipts."""
    r = requests.get(f"{API}/partner/inventory", headers=partner_h, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items") or r.json()
    assert items, "no inventory rows found on partner alpha store"
    return items[0]


# =============== Super Admin: Control Tower ===============
class TestControlTower:
    def test_kpis(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/kpis", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["total_skus", "active_skus", "available_units", "reserved_units",
                  "damaged_units", "expired_units", "low_stock_skus",
                  "out_of_stock_skus", "inventory_value", "stores", "pending_approvals"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["total_skus"], int)
        assert d["stores"] >= 1
        assert d["total_skus"] >= 1

    def test_overview(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/overview", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert isinstance(d["items"], list)

    def test_overview_search(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/overview?q=z_no_such_sku_xyz",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_overview_stock_status_filter(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/overview?stock_status=out_of_stock",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["stock_status"] == "out_of_stock"

    def test_sku_drilldown(self, admin_h):
        ov = requests.get(f"{API}/admin/inventory/overview?limit=10",
                          headers=admin_h, timeout=15).json()
        if not ov["items"]:
            pytest.skip("no SKUs to drill into")
        pp_id = ov["items"][0]["sample_partner_product_id"]
        assert pp_id
        r = requests.get(f"{API}/admin/inventory/skus/{pp_id}", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "product" in d and "network_totals" in d and "distribution" in d
        assert isinstance(d["distribution"], list)

    def test_stores(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/stores", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert isinstance(items, list) and len(items) >= 1
        first = items[0]
        for k in ["warehouse_id", "warehouse_code", "sku_count", "available",
                  "reserved", "damaged", "low_stock", "out_of_stock"]:
            assert k in first

    def test_store_detail(self, admin_h):
        stores = requests.get(f"{API}/admin/inventory/stores",
                              headers=admin_h, timeout=15).json()["items"]
        wh_id = stores[0]["warehouse_id"]
        r = requests.get(f"{API}/admin/inventory/stores/{wh_id}",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "warehouse" in d and "items" in d and "totals" in d

    def test_low_and_oos(self, admin_h):
        r1 = requests.get(f"{API}/admin/inventory/low-stock", headers=admin_h, timeout=15)
        r2 = requests.get(f"{API}/admin/inventory/out-of-stock", headers=admin_h, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        assert "items" in r1.json() and "items" in r2.json()

    def test_movements(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/movements?limit=20",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        assert "items" in r.json()


# =============== Partner: Receiving flow ===============
class TestReceiving:
    receipt_id = None
    item_id = None
    starting_available = None

    def test_dashboard_kpis(self, partner_h):
        r = requests.get(f"{API}/partner/inventory/dashboard-kpis",
                         headers=partner_h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["pending_receiving", "pending_put_away", "pending_counts"]:
            assert k in d

    def test_create_receipt(self, partner_h, a_partner_product):
        TestReceiving.starting_available = a_partner_product.get("available_qty", 0)
        payload = {
            "source_type": "purchase",
            "supplier_name": "TEST Supplier",
            "notes": "TEST receipt batch12",
            "items": [{
                "partner_product_id": a_partner_product["partner_product_id"]
                    if "partner_product_id" in a_partner_product else a_partner_product.get("id"),
                "expected_qty": 50,
                "received_qty": 48,
            }],
        }
        r = requests.post(f"{API}/partner/inventory/receipts",
                          headers=partner_h, json=payload, timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert d["code"].startswith("RCPT-")
        assert len(d["items"]) == 1
        assert d["items"][0]["expected_qty"] == 50
        assert d["items"][0]["received_qty"] == 48
        TestReceiving.receipt_id = d["id"]
        TestReceiving.item_id = d["items"][0]["id"]

    def test_verify_receipt(self, partner_h):
        rid = TestReceiving.receipt_id
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/verify",
                          headers=partner_h, json={}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "verified"

    def test_verify_twice_conflict(self, partner_h):
        rid = TestReceiving.receipt_id
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/verify",
                          headers=partner_h, json={}, timeout=15)
        assert r.status_code == 409, r.text

    def test_put_away_over_conflict(self, partner_h):
        rid = TestReceiving.receipt_id
        payload = {"lines": [{"item_id": TestReceiving.item_id, "put_away_qty": 999}]}
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/put-away",
                          headers=partner_h, json=payload, timeout=15)
        assert r.status_code == 409, r.text

    def test_put_away_success(self, partner_h, a_partner_product):
        rid = TestReceiving.receipt_id
        payload = {"lines": [{"item_id": TestReceiving.item_id, "put_away_qty": 48}]}
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/put-away",
                          headers=partner_h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        assert d["items"][0]["put_away_qty"] == 48

        # Verify inventory available_qty increased by 48
        inv = requests.get(f"{API}/partner/inventory", headers=partner_h, timeout=15).json()
        items = inv.get("items") or inv
        pp_id = a_partner_product.get("partner_product_id") or a_partner_product.get("id")
        row = next((x for x in items if (x.get("partner_product_id") or x.get("id")) == pp_id), None)
        assert row is not None
        assert row["available_qty"] >= (TestReceiving.starting_available + 48), \
            f"expected +48, was {TestReceiving.starting_available} → {row['available_qty']}"

    def test_cancel_completed_conflict(self, partner_h):
        """Cancelling a completed receipt should 409."""
        rid = TestReceiving.receipt_id
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/cancel",
                          headers=partner_h, json={}, timeout=15)
        assert r.status_code == 409, r.text

    def test_cancel_receipt_with_putaway_conflict(self, partner_h, a_partner_product):
        """Create a fresh receipt, verify+partial put-away, then cancel → 409."""
        pp_id = a_partner_product.get("partner_product_id") or a_partner_product.get("id")
        payload = {
            "source_type": "purchase", "notes": "TEST cancel-guard",
            "items": [{"partner_product_id": pp_id, "expected_qty": 10, "received_qty": 10}],
        }
        rcpt = requests.post(f"{API}/partner/inventory/receipts",
                             headers=partner_h, json=payload, timeout=15).json()
        rid = rcpt["id"]
        item_id = rcpt["items"][0]["id"]
        requests.post(f"{API}/partner/inventory/receipts/{rid}/verify",
                      headers=partner_h, json={}, timeout=15)
        requests.post(f"{API}/partner/inventory/receipts/{rid}/put-away",
                      headers=partner_h,
                      json={"lines": [{"item_id": item_id, "put_away_qty": 1}]},
                      timeout=15)
        r = requests.post(f"{API}/partner/inventory/receipts/{rid}/cancel",
                          headers=partner_h, json={}, timeout=15)
        assert r.status_code == 409, r.text


# =============== Partner: Stock Counts ===============
class TestStockCounts:
    count_id = None
    target_line_id = None
    target_pp_id = None
    expected_before = None

    def test_create_full_count(self, partner_h):
        r = requests.post(f"{API}/partner/inventory/counts",
                          headers=partner_h,
                          json={"scope": "full", "notes": "TEST full count"},
                          timeout=15)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["scope"] == "full"
        assert d["status"] == "counting"
        assert d["code"].startswith("CNT-")
        assert len(d["lines"]) >= 1
        # Pick a line whose expected_qty > 0 so we can decrement it
        candidate = next((l for l in d["lines"] if l["expected_qty"] > 0), d["lines"][0])
        TestStockCounts.count_id = d["id"]
        TestStockCounts.target_line_id = candidate["id"]
        TestStockCounts.target_pp_id = candidate["partner_product_id"]
        TestStockCounts.expected_before = candidate["expected_qty"]
        # Snapshot must equal current available (variance = 0)
        assert candidate["counted_qty"] == candidate["expected_qty"]
        assert candidate["variance"] == 0

    def test_apply_before_reconcile_conflict(self, partner_h):
        r = requests.post(
            f"{API}/partner/inventory/counts/{TestStockCounts.count_id}/apply",
            headers=partner_h, json={}, timeout=15)
        assert r.status_code == 409, r.text

    def test_record_variance(self, partner_h):
        new_count = max(0, TestStockCounts.expected_before - 1)
        r = requests.post(
            f"{API}/partner/inventory/counts/{TestStockCounts.count_id}/record",
            headers=partner_h,
            json={"lines": [{"line_id": TestStockCounts.target_line_id,
                             "counted_qty": new_count}]},
            timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "reconciling"

    def test_apply(self, partner_h):
        r = requests.post(
            f"{API}/partner/inventory/counts/{TestStockCounts.count_id}/apply",
            headers=partner_h, json={}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        # A movement should have been created for the varied line
        varied = next(l for l in d["lines"] if l["id"] == TestStockCounts.target_line_id)
        if TestStockCounts.expected_before > 0:
            assert varied["adjustment_created"] is True
            assert varied["movement_id"]

    def test_movement_appears_in_network_ledger(self, admin_h):
        r = requests.get(f"{API}/admin/inventory/movements?kind=stock_count&limit=20",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert any(m["kind"] == "stock_count" for m in items), \
            "expected a stock_count movement in the network ledger"

    def test_apply_again_conflict(self, partner_h):
        r = requests.post(
            f"{API}/partner/inventory/counts/{TestStockCounts.count_id}/apply",
            headers=partner_h, json={}, timeout=15)
        assert r.status_code == 409, r.text

    def test_never_negative(self, partner_h):
        """counted_qty=0 → available_qty goes to 0, no negative."""
        # Create new count, set the same product line to 0
        c = requests.post(f"{API}/partner/inventory/counts",
                          headers=partner_h,
                          json={"scope": "full", "notes": "TEST zero count"},
                          timeout=15).json()
        line = next(l for l in c["lines"] if l["partner_product_id"] == TestStockCounts.target_pp_id)
        requests.post(f"{API}/partner/inventory/counts/{c['id']}/record",
                      headers=partner_h,
                      json={"lines": [{"line_id": line["id"], "counted_qty": 0}]},
                      timeout=15)
        r = requests.post(f"{API}/partner/inventory/counts/{c['id']}/apply",
                          headers=partner_h, json={}, timeout=15)
        assert r.status_code == 200, r.text
        # Verify inventory row is 0 (not negative)
        inv = requests.get(f"{API}/partner/inventory", headers=partner_h, timeout=15).json()
        items = inv.get("items") or inv
        row = next(x for x in items if (x.get("partner_product_id") or x.get("id"))
                   == TestStockCounts.target_pp_id)
        assert row["available_qty"] == 0
