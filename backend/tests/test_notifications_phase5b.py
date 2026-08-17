"""Phase 5b — In-app Notifications regression suite.

Covers:
 * Auth: 401 on all list/read endpoints without token
 * List response shape + unread filter + unread_count
 * Dispatch on PO submit / acknowledge / ship (supplier & partner queues)
 * Dispatch on auto-invoice-draft (PO receive) → supplier queue
 * Dispatch on invoice submit / approve / dispute
 * Single-read + read-all (verifies is_read + read_at persistence via GET)
 * Cross-tenant isolation (Alpha partner ≠ Beta partner)
 * Atomic dispatch: failing state transition (double-submit → 409) creates
   NO new notification row
"""
from __future__ import annotations
import io
import os
import time
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
PARTNER_BETA_EMAIL = "partner-beta-store@test.example"
PARTNER_BETA_PASSWORD = "Alpha1234!Beta"
DELTA_EMAIL = "demo-delta-supplier@test.example"
DELTA_PASSWORD = "Supplier1234!"
DELTA_SUPPLIER_ID = "sup_demo_delta_seed"
ALPHA_WAREHOUSE_ID = "wh_alpha_demo_seed"


def _bearer(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---- shared fixtures --------------------------------------------------------

@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()
    return _bearer(r.get("access_token") or r.get("token"))


@pytest.fixture(scope="module")
def partner_headers():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=15).json()
    return _bearer(r.get("access_token") or r.get("token"))


@pytest.fixture(scope="module")
def partner_beta_headers():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER_BETA_EMAIL, "password": PARTNER_BETA_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip("beta partner not seeded")
    j = r.json()
    return _bearer(j.get("access_token") or j.get("token"))


@pytest.fixture(scope="module")
def supplier_headers():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return _bearer(r.json()["access_token"])


@pytest.fixture(scope="module")
def supplier_products(supplier_headers):
    r = requests.get(f"{API}/supplier/me/catalogue", headers=supplier_headers, timeout=15)
    assert r.status_code == 200
    return r.json()["items"]


# helpers -------------------------------------------------------------------

def _list_supplier(supplier_headers, unread=0):
    return requests.get(f"{API}/supplier/me/notifications", headers=supplier_headers,
                        params={"unread": unread}, timeout=15).json()


def _list_partner(partner_headers, unread=0):
    return requests.get(f"{API}/partner/notifications", headers=partner_headers,
                        params={"unread": unread}, timeout=15).json()


def _list_admin(sa_headers, unread=0):
    return requests.get(f"{API}/admin/notifications", headers=sa_headers,
                        params={"unread": unread}, timeout=15).json()


# ---- Test 01: Auth 401 -----------------------------------------------------

class TestAuth:
    def test_supplier_notifs_requires_auth(self):
        r = requests.get(f"{API}/supplier/me/notifications", timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_partner_notifs_requires_auth(self):
        r = requests.get(f"{API}/partner/notifications", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_notifs_requires_auth(self):
        r = requests.get(f"{API}/admin/notifications", timeout=15)
        assert r.status_code in (401, 403)

    def test_supplier_read_requires_auth(self):
        r = requests.post(f"{API}/supplier/me/notifications/notif_fake/read", timeout=15)
        assert r.status_code in (401, 403)


# ---- Fresh cycle: PO submit → ack → ship → receive → auto-draft ----------

@pytest.fixture(scope="module")
def cycle(partner_headers, supplier_headers, supplier_products, sa_headers):
    """Run a full PO cycle so we can inspect all dispatched notifications."""
    tag = uuid.uuid4().hex[:6]
    po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
        "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        "notes": f"phase5b-notif {tag}",
    }, timeout=20)
    assert po.status_code == 201, po.text
    po_id = po.json()["id"]
    po_code = po.json()["po_code"]
    line_qty = {}
    for sp in supplier_products[:1]:
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines",
                          headers=partner_headers,
                          json={"supplier_product_id": sp["id"], "qty_ordered": 2},
                          timeout=15)
        assert r.status_code == 201
        line_qty[r.json()["id"]] = 2

    # SUBMIT
    r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                      headers=partner_headers, timeout=15)
    assert r.status_code == 200
    time.sleep(0.4)

    # ACK
    r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge",
                      headers=supplier_headers, timeout=15)
    assert r.status_code == 200
    time.sleep(0.4)

    # SHIP
    r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship",
                      headers=supplier_headers, timeout=15)
    assert r.status_code == 200
    time.sleep(0.4)

    # RECEIVE (auto-draft)
    r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive",
                      headers=partner_headers,
                      json={"lines": [{"po_line_id": lid, "qty_received": q} for lid, q in line_qty.items()]},
                      timeout=15)
    assert r.status_code == 200
    time.sleep(0.6)

    # find auto-draft invoice
    lst = requests.get(f"{API}/supplier/me/invoices?status=draft",
                       headers=supplier_headers, timeout=15).json()
    inv_id = None; inv_code = None
    for it in lst["items"]:
        det = requests.get(f"{API}/supplier/me/invoices/{it['id']}",
                           headers=supplier_headers, timeout=15).json()
        if det.get("po", {}).get("id") == po_id:
            inv_id = it["id"]; inv_code = det["code"]; break
    assert inv_id, "auto-draft invoice not found"

    return {"po_id": po_id, "po_code": po_code, "invoice_id": inv_id, "invoice_code": inv_code,
            "line_qty": line_qty}


# ---- Test 02: PO submit → supplier notification --------------------------

class TestDispatch:
    def test_po_submit_notifies_supplier(self, cycle, supplier_headers):
        d = _list_supplier(supplier_headers)
        matches = [n for n in d["items"]
                   if n["kind"] == "po_submitted" and cycle["po_code"] in n["title"]]
        assert matches, f"no po_submitted for {cycle['po_code']} in {[n['title'] for n in d['items'][:5]]}"
        n = matches[0]
        assert n["entity_kind"] == "purchase_order"
        assert n["entity_id"] == cycle["po_id"]
        assert n["link"] == "/martbaked/sellers/portal/orders"
        assert n["is_read"] is False
        assert n["created_at"]

    def test_po_ack_notifies_partner(self, cycle, partner_headers):
        d = _list_partner(partner_headers)
        matches = [n for n in d["items"]
                   if n["kind"] == "po_acknowledged" and cycle["po_code"] in n["title"]]
        assert matches, f"no po_acknowledged for {cycle['po_code']}"

    def test_po_ship_notifies_partner(self, cycle, partner_headers):
        d = _list_partner(partner_headers)
        matches = [n for n in d["items"]
                   if n["kind"] == "po_shipped" and cycle["po_code"] in n["title"]]
        assert matches, f"no po_shipped for {cycle['po_code']}"

    def test_auto_draft_notifies_supplier(self, cycle, supplier_headers):
        d = _list_supplier(supplier_headers)
        matches = [n for n in d["items"]
                   if n["kind"] == "invoice_draft_ready" and cycle["invoice_code"] in n["title"]]
        assert matches, f"no invoice_draft_ready for {cycle['invoice_code']}"
        n = matches[0]
        assert n["link"] == "/martbaked/sellers/portal/invoices"


# ---- Test 03: List response shape ----------------------------------------

class TestListShape:
    def test_list_items_shape(self, supplier_headers, cycle):
        d = _list_supplier(supplier_headers)
        assert isinstance(d["items"], list)
        assert isinstance(d["unread_count"], int)
        assert len(d["items"]) >= 2  # at minimum po_submitted + invoice_draft_ready
        it = d["items"][0]
        for k in ("id", "kind", "title", "body", "link", "entity_kind",
                  "entity_id", "actor_label", "is_read", "created_at"):
            assert k in it

    def test_unread_filter_returns_only_unread(self, supplier_headers):
        # First: mark ALL as read
        r = requests.post(f"{API}/supplier/me/notifications/read-all",
                          headers=supplier_headers, timeout=15)
        assert r.status_code == 200 and r.json() == {"ok": True}
        d = _list_supplier(supplier_headers, unread=1)
        assert d["unread_count"] == 0
        assert d["items"] == []


# ---- Test 04: Invoice submit / approve / dispute dispatch ----------------

@pytest.fixture(scope="module")
def submit_invoice(cycle, supplier_headers):
    """Complete the invoice: upload doc + submit."""
    inv_id = cycle["invoice_id"]
    pdf = b"%PDF-1.4\ntest\n%%EOF"
    requests.post(f"{API}/supplier/me/invoices/{inv_id}/upload",
                  headers={"Authorization": supplier_headers["Authorization"]},
                  files={"file": ("v.pdf", io.BytesIO(pdf), "application/pdf")},
                  timeout=30)
    r = requests.post(f"{API}/supplier/me/invoices/{inv_id}/submit",
                      headers=supplier_headers,
                      json={"supplier_invoice_number": f"INV-N-{uuid.uuid4().hex[:6].upper()}",
                            "invoice_date": "2026-01-16"}, timeout=15)
    assert r.status_code == 200, r.text
    time.sleep(0.4)
    return {"invoice_id": inv_id, "invoice_code": cycle["invoice_code"],
            "status": r.json()["status"]}


class TestInvoiceDispatch:
    def test_invoice_submit_notifies_partner(self, submit_invoice, partner_headers):
        d = _list_partner(partner_headers)
        code = submit_invoice["invoice_code"]
        matches = [n for n in d["items"]
                   if n["kind"] == "invoice_submitted" and code in n["title"]]
        assert matches, f"no invoice_submitted for {code}"
        n = matches[0]
        # body should surface match_status token
        assert n.get("body") and any(tok in n["body"].lower()
                                     for tok in ("matched", "variance"))

    def test_invoice_approve_notifies_supplier(self, submit_invoice, partner_headers, supplier_headers):
        inv_id = submit_invoice["invoice_id"]
        # Approve (should be matched)
        r = requests.post(f"{API}/partner/invoices/{inv_id}/approve",
                          headers=partner_headers, json={"notes": "ok"}, timeout=15)
        # If the invoice landed in variance state, approve requires notes; provided.
        assert r.status_code == 200, r.text
        time.sleep(0.4)
        d = _list_supplier(supplier_headers)
        code = submit_invoice["invoice_code"]
        matches = [n for n in d["items"]
                   if n["kind"] == "invoice_approved" and code in n["title"]]
        assert matches, f"no invoice_approved for {code}"


# ---- Test 05: Dispute → supplier notification ---------------------------

@pytest.fixture(scope="module")
def dispute_cycle(partner_headers, supplier_headers, supplier_products):
    """Second full cycle → variance → dispute."""
    tag = uuid.uuid4().hex[:6]
    po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
        "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        "notes": f"phase5b-dispute {tag}"}, timeout=15).json()
    po_id = po["id"]
    lqty = {}
    for sp in supplier_products[:1]:
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines",
                          headers=partner_headers,
                          json={"supplier_product_id": sp["id"], "qty_ordered": 3},
                          timeout=15)
        lqty[r.json()["id"]] = 3
    requests.post(f"{API}/partner/purchase-orders/{po_id}/submit", headers=partner_headers, timeout=15)
    requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
    requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship", headers=supplier_headers, timeout=15)
    requests.post(f"{API}/partner/purchase-orders/{po_id}/receive",
                  headers=partner_headers,
                  json={"lines": [{"po_line_id": lid, "qty_received": q} for lid, q in lqty.items()]},
                  timeout=15)
    time.sleep(0.4)
    lst = requests.get(f"{API}/supplier/me/invoices?status=draft",
                       headers=supplier_headers, timeout=15).json()
    inv_id = None; inv_code = None
    for it in lst["items"]:
        det = requests.get(f"{API}/supplier/me/invoices/{it['id']}",
                           headers=supplier_headers, timeout=15).json()
        if det.get("po", {}).get("id") == po_id:
            inv_id = it["id"]; inv_code = det["code"]; break
    assert inv_id
    # edit → cost variance
    d = requests.get(f"{API}/supplier/me/invoices/{inv_id}", headers=supplier_headers, timeout=15).json()
    ln = d["lines"][0]
    requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                   headers=supplier_headers,
                   json={"lines": [{"line_id": ln["id"],
                                    "qty_invoiced": ln["qty_received"],
                                    "unit_cost_invoiced": round(ln["unit_cost_po"] * 1.05, 2)}]},
                   timeout=15)
    pdf = b"%PDF-1.4\ntest\n%%EOF"
    requests.post(f"{API}/supplier/me/invoices/{inv_id}/upload",
                  headers={"Authorization": supplier_headers["Authorization"]},
                  files={"file": ("v.pdf", io.BytesIO(pdf), "application/pdf")},
                  timeout=30)
    requests.post(f"{API}/supplier/me/invoices/{inv_id}/submit",
                  headers=supplier_headers,
                  json={"supplier_invoice_number": f"INV-D-{uuid.uuid4().hex[:6].upper()}",
                        "invoice_date": "2026-01-17"}, timeout=15)
    return {"invoice_id": inv_id, "invoice_code": inv_code}


class TestDispute:
    def test_dispute_notifies_supplier(self, dispute_cycle, partner_headers, supplier_headers):
        inv_id = dispute_cycle["invoice_id"]
        r = requests.post(f"{API}/partner/invoices/{inv_id}/dispute",
                          headers=partner_headers,
                          json={"reason": "cost too high, please correct"}, timeout=15)
        assert r.status_code == 200, r.text
        time.sleep(0.4)
        d = _list_supplier(supplier_headers)
        code = dispute_cycle["invoice_code"]
        matches = [n for n in d["items"]
                   if n["kind"] == "invoice_disputed" and code in n["title"]]
        assert matches, f"no invoice_disputed for {code}"
        n = matches[0]
        assert n.get("body")
        assert "cost too high" in n["body"].lower() or "correct" in n["body"].lower()


# ---- Test 06: Single-read + read-all persistence ------------------------

class TestReadPersistence:
    def test_single_read_persists(self, supplier_headers):
        # Ensure there's at least one unread
        # Trigger by clearing then... alternatively pick a read one and confirm is_read
        d = _list_supplier(supplier_headers)
        assert d["items"]
        target = d["items"][0]
        r = requests.post(f"{API}/supplier/me/notifications/{target['id']}/read",
                          headers=supplier_headers, timeout=15)
        assert r.status_code == 200 and r.json() == {"ok": True}
        # verify persisted
        d2 = _list_supplier(supplier_headers)
        row = next((n for n in d2["items"] if n["id"] == target["id"]), None)
        assert row is not None
        assert row["is_read"] is True
        assert row["read_at"] is not None

    def test_read_all_clears_unread_count(self, supplier_headers):
        r = requests.post(f"{API}/supplier/me/notifications/read-all",
                          headers=supplier_headers, timeout=15)
        assert r.status_code == 200
        d = _list_supplier(supplier_headers)
        assert d["unread_count"] == 0
        # verify every item is_read=True
        assert all(n["is_read"] for n in d["items"])


# ---- Test 07: Cross-tenant isolation ------------------------------------

class TestIsolation:
    def test_beta_partner_does_not_see_alpha_notifications(self, partner_beta_headers, cycle):
        d = _list_partner(partner_beta_headers)
        # beta partner must not see alpha's po_code in any row
        for n in d["items"]:
            assert cycle["po_code"] not in (n.get("title") or "")
            assert cycle["po_id"] != n.get("entity_id")


# ---- Test 08: Atomic dispatch (409 on double-submit → no new row) -------

class TestAtomic:
    def test_double_submit_creates_no_extra_notification(self, cycle, supplier_headers, partner_headers):
        # count po_submitted rows for this po_code
        before = _list_supplier(supplier_headers)
        before_count = sum(
            1 for n in before["items"]
            if n["kind"] == "po_submitted" and cycle["po_code"] in (n["title"] or "")
        )
        # Attempt to re-submit an already-submitted PO — expect non-2xx (409/400)
        r = requests.post(f"{API}/partner/purchase-orders/{cycle['po_id']}/submit",
                          headers=partner_headers, timeout=15)
        assert r.status_code >= 400, f"expected failure, got {r.status_code}"
        time.sleep(0.3)
        after = _list_supplier(supplier_headers)
        after_count = sum(
            1 for n in after["items"]
            if n["kind"] == "po_submitted" and cycle["po_code"] in (n["title"] or "")
        )
        assert after_count == before_count, (
            f"notification count changed on failed submit: {before_count} → {after_count}"
        )


# ---- Test 09: unread=1 filter after new dispatch ------------------------

class TestUnreadFilter:
    def test_new_dispatch_shows_up_as_unread(self, partner_headers, supplier_headers, supplier_products):
        # mark all supplier read (baseline — but other xdist workers may
        # dispatch concurrently, so we compare relative counts)
        requests.post(f"{API}/supplier/me/notifications/read-all",
                      headers=supplier_headers, timeout=15)
        base = _list_supplier(supplier_headers)["unread_count"]
        # New PO submit → supplier should have >= base+1 unread
        po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
            "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
            "notes": "phase5b-unread"}, timeout=15).json()
        po_id = po["id"]; po_code = po["po_code"]
        sp = supplier_products[0]
        requests.post(f"{API}/partner/purchase-orders/{po_id}/lines",
                      headers=partner_headers,
                      json={"supplier_product_id": sp["id"], "qty_ordered": 1},
                      timeout=15)
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                          headers=partner_headers, timeout=15)
        assert r.status_code == 200
        time.sleep(0.4)
        d = _list_supplier(supplier_headers, unread=1)
        assert d["unread_count"] >= base + 1
        matches = [n for n in d["items"] if n["kind"] == "po_submitted" and po_code in (n["title"] or "")]
        assert matches
        assert all(not n["is_read"] for n in d["items"])
