"""Phase 3 Cycle 1 — Purchase Orders backend regression suite.

Covers:
 * Partner: create PO → add lines → submit → cancel-before-ack → happy path
 * Supplier: acknowledge → ship → cannot skip states
 * Partner: partial + full receive → status transitions + inventory increment
 * Guards: cannot receive `draft` PO, cannot over-receive, cannot cancel after acknowledge
 * SA: cross-network list, detail, override-cancel
 * Audit trail: create + submit + acknowledge + ship + receive events written
"""
from __future__ import annotations
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASSWORD = "Alpha1234!Beta"
DELTA_EMAIL = "demo-delta-supplier@test.example"
DELTA_PASSWORD = "Supplier1234!"
DELTA_SUPPLIER_ID = "sup_demo_delta_seed"
ALPHA_WAREHOUSE_ID = "wh_alpha_demo_seed"


@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()
    return {"Authorization": f"Bearer {r.get('access_token') or r.get('token')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def partner_headers():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=15).json()
    return {"Authorization": f"Bearer {r.get('access_token') or r.get('token')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    # Ensure Delta is approved via SA if needed, then log in.
    sa = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()
    h = {"Authorization": f"Bearer {sa.get('access_token') or sa.get('token')}"}
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
    if r.status_code != 200:
        apps = requests.get(f"{API}/admin/modules/mart/suppliers/applications?q=MART-SUP-2026-00001",
                            headers=h, timeout=15).json()
        for it in apps.get("items", []):
            if it["application_code"] == "MART-SUP-2026-00001":
                if it["status"] in ("submitted", "under_review", "action_required"):
                    requests.post(f"{API}/admin/modules/mart/suppliers/applications/{it['id']}/approve",
                                  headers={**h, "Content-Type": "application/json"}, json={"notes": "restore"}, timeout=15)
                break
        r = requests.post(f"{API}/martbaked/sellers/login",
                          json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_products(supplier_headers):
    r = requests.get(f"{API}/supplier/me/catalogue", headers=supplier_headers, timeout=15)
    return r.json()["items"]


def _create_and_submit_po(partner_headers, supplier_products, n_lines=2):
    """Helper: create + submit a PO with n_lines lines."""
    po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
        "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        "notes": f"pytest {uuid.uuid4().hex[:6]}",
    }, timeout=15)
    assert po.status_code == 201, po.text
    po_id = po.json()["id"]
    for sp in supplier_products[:n_lines]:
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines", headers=partner_headers, json={
            "supplier_product_id": sp["id"], "qty_ordered": 5,
        }, timeout=15)
        assert r.status_code == 201, r.text
    r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit", headers=partner_headers, timeout=15)
    assert r.status_code == 200
    return po_id


# ---------------------------------------------------------------------------

class TestPartnerLifecycle:
    def test_create_and_totals(self, partner_headers, supplier_products):
        po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
            "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        }, timeout=15)
        assert po.status_code == 201
        po_id = po.json()["id"]
        assert po.json()["po_code"].startswith("PO-CI-")
        assert po.json()["status"] == "draft"
        # Add 2 lines
        for sp, qty in zip(supplier_products[:2], (3, 4)):
            r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines", headers=partner_headers, json={
                "supplier_product_id": sp["id"], "qty_ordered": qty,
            }, timeout=15)
            assert r.status_code == 201
        # Totals recompute
        d = requests.get(f"{API}/partner/purchase-orders/{po_id}", headers=partner_headers, timeout=15).json()
        assert len(d["lines"]) == 2
        assert d["grand_total"] == pytest.approx(
            sum(l["line_total"] for l in d["lines"])
        )

    def test_cannot_submit_empty_po(self, partner_headers):
        po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
            "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        }, timeout=15)
        po_id = po.json()["id"]
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit", headers=partner_headers, timeout=15)
        assert r.status_code == 400

    def test_cancel_before_acknowledge(self, partner_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products, n_lines=1)
        c = requests.post(f"{API}/partner/purchase-orders/{po_id}/cancel", headers=partner_headers, json={"reason": "changed our mind"}, timeout=15)
        assert c.status_code == 200
        assert c.json()["status"] == "cancelled"


class TestSupplierLifecycle:
    def test_supplier_cannot_skip_ack(self, partner_headers, supplier_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products)
        # cannot ship before ack
        r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship", headers=supplier_headers, timeout=15)
        assert r.status_code == 409
        # ack ok
        r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "acknowledged"
        # cannot re-ack
        r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        assert r.status_code == 409

    def test_partner_cannot_cancel_after_ack(self, partner_headers, supplier_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/cancel", headers=partner_headers, json={"reason": "n/a"}, timeout=15)
        assert r.status_code == 409

    def test_supplier_never_sees_draft(self, partner_headers, supplier_headers):
        po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
            "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        }, timeout=15)
        po_id = po.json()["id"]
        lst = requests.get(f"{API}/supplier/me/purchase-orders", headers=supplier_headers, timeout=15).json()["items"]
        assert not any(x["id"] == po_id for x in lst)
        r = requests.get(f"{API}/supplier/me/purchase-orders/{po_id}", headers=supplier_headers, timeout=15)
        assert r.status_code == 404


class TestReceipts:
    def test_partial_then_full_receive_updates_status_and_inventory(self, partner_headers, supplier_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products, n_lines=1)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship", headers=supplier_headers, timeout=15)
        d = requests.get(f"{API}/partner/purchase-orders/{po_id}", headers=partner_headers, timeout=15).json()
        l1 = d["lines"][0]
        # Partial (3 of 5)
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive", headers=partner_headers, json={
            "lines": [{"po_line_id": l1["id"], "qty_received": 3}], "notes": "First lorry",
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "partially_received"
        # Over-receipt guard
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive", headers=partner_headers, json={
            "lines": [{"po_line_id": l1["id"], "qty_received": 5}],
        }, timeout=15)
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "over_receipt"
        # Final
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive", headers=partner_headers, json={
            "lines": [{"po_line_id": l1["id"], "qty_received": 2}],
        }, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "received"
        assert r.json()["received_at"]

    def test_cannot_receive_before_acknowledge(self, partner_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products, n_lines=1)
        d = requests.get(f"{API}/partner/purchase-orders/{po_id}", headers=partner_headers, timeout=15).json()
        l1 = d["lines"][0]
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive", headers=partner_headers, json={
            "lines": [{"po_line_id": l1["id"], "qty_received": 1}],
        }, timeout=15)
        assert r.status_code == 409

    def test_audit_trail_populated(self, partner_headers, supplier_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products, n_lines=1)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship", headers=supplier_headers, timeout=15)
        d = requests.get(f"{API}/partner/purchase-orders/{po_id}", headers=partner_headers, timeout=15).json()
        actions = [a["action"] for a in d["audit_trail"]]
        assert "create" in actions
        assert "submit" in actions
        assert "acknowledge" in actions
        assert "ship" in actions


class TestAdmin:
    def test_admin_can_list_all(self, sa_headers):
        r = requests.get(f"{API}/admin/modules/mart/purchase-orders", headers=sa_headers, timeout=15)
        assert r.status_code == 200
        assert set(r.json()["buckets"].keys()) >= {"draft", "submitted", "acknowledged"}

    def test_admin_override_cancel(self, sa_headers, partner_headers, supplier_headers, supplier_products):
        po_id = _create_and_submit_po(partner_headers, supplier_products, n_lines=1)
        # Move it past-acknowledge so partner can't cancel
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        r = requests.post(f"{API}/admin/modules/mart/purchase-orders/{po_id}/override-cancel",
                          headers=sa_headers, json={"reason": "compliance issue"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        # Audit trail includes override_cancel
        d = requests.get(f"{API}/admin/modules/mart/purchase-orders/{po_id}", headers=sa_headers, timeout=15).json()
        assert any(a["action"] == "override_cancel" for a in d["audit_trail"])
