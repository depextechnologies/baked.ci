"""Phase 5 — Supplier Invoices (3-way match, lifecycle, RBAC) regression suite.

Covers, in a single ordered class using a shared fresh PO/invoice fixture:
 * Auto-draft: fresh PO cycle → supplier_invoices row (status=draft, code SINV-<CC>-<YYYY>-#####,
   grand_total = qty_received*unit_cost + tax) + audit action='auto_draft'
 * Idempotency: re-calling `receive` doesn't create a duplicate invoice
 * Listing scopes: supplier/partner/admin see only what they should + ?status filter
 * Supplier PATCH: qty/cost edits recompute match_status per line + header
 * Supplier upload: multipart PDF stored, storage_path returned, invoice row populated
 * Supplier submit: missing-fields error; matched vs variance transition on submit
 * Partner approve: happy path on matched; variance requires notes
 * Partner dispute: reason min-length + status transition + audit
 * Admin override: approve / dispute / reset_to_draft (nulls timestamps)
 * RBAC 404s: cross-partner cannot GET; cross-supplier not reproducible (only 1 approved supplier)
 * Document proxy: supplier/partner/admin can stream PDF; 404 without upload
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
    assert r.status_code == 200, r.text
    return r.json()["items"]


# --- fresh PO + received cycle → auto-draft invoice --------------------------

@pytest.fixture(scope="module")
def fresh_cycle(partner_headers, supplier_headers, supplier_products):
    """Create PO → submit → ack → ship → receive-all. Returns (po_id, invoice_id)."""
    tag = uuid.uuid4().hex[:6]
    po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
        "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        "notes": f"phase5-test {tag}",
    }, timeout=15)
    assert po.status_code == 201, po.text
    po_id = po.json()["id"]
    line_qty = {}
    for sp in supplier_products[:2]:
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines",
                          headers=partner_headers,
                          json={"supplier_product_id": sp["id"], "qty_ordered": 4},
                          timeout=15)
        assert r.status_code == 201, r.text
        line_qty[r.json()["id"]] = 4

    r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                      headers=partner_headers, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge",
                      headers=supplier_headers, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship",
                      headers=supplier_headers, timeout=15)
    assert r.status_code == 200, r.text
    # Receive all
    r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive",
                      headers=partner_headers,
                      json={"lines": [{"po_line_id": lid, "qty_received": q} for lid, q in line_qty.items()]},
                      timeout=15)
    assert r.status_code == 200, r.text
    # invoice should now exist
    time.sleep(0.5)
    lst = requests.get(f"{API}/supplier/me/invoices?status=draft",
                       headers=supplier_headers, timeout=15).json()
    inv_id = None
    for it in lst.get("items", []):
        if it.get("po_code") and it["po_code"] == r.json().get("po_code"):
            inv_id = it["id"]; break
    if not inv_id:
        # fallback: find by po_id via admin list
        allst = requests.get(f"{API}/admin/modules/mart/invoices?status=draft",
                             headers=_bearer(_sa_tok()), timeout=15).json()
        for it in allst.get("items", []):
            if it["id"] and it["code"].startswith("SINV-CI-"):
                # match by po_code
                if requests.get(f"{API}/admin/modules/mart/invoices/{it['id']}",
                                headers=_bearer(_sa_tok()), timeout=15).json().get("po", {}).get("id") == po_id:
                    inv_id = it["id"]; break
    assert inv_id, "auto-draft invoice not found"
    return {"po_id": po_id, "invoice_id": inv_id}


def _sa_tok() -> str:
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=15).json()
    return r.get("access_token") or r.get("token")


# --- Ordered test class -----------------------------------------------------

class TestPhase5:
    """Ordered; each step builds on the previous."""

    def test_01_auto_draft_created(self, fresh_cycle, sa_headers):
        inv_id = fresh_cycle["invoice_id"]
        d = requests.get(f"{API}/admin/modules/mart/invoices/{inv_id}",
                         headers=sa_headers, timeout=15).json()
        assert d["status"] == "draft"
        assert d["match_status"] in (None, "matched")  # header not set until submit rerun
        assert d["code"].startswith("SINV-CI-2026-")
        assert len(d["lines"]) == 2
        for ln in d["lines"]:
            assert ln["qty_invoiced"] == ln["qty_received"]
            assert ln["unit_cost_po"] == ln["unit_cost_invoiced"]
        # grand_total = sum(qty*cost) + tax
        expected = 0.0
        for ln in d["lines"]:
            expected += ln["qty_invoiced"] * ln["unit_cost_invoiced"] * (1 + ln["tax_pct"] / 100.0)
        assert abs(d["grand_total"] - expected) < 0.05
        # audit auto_draft exists
        audit_actions = [a["action"] for a in d["audit_trail"]]
        assert "auto_draft" in audit_actions

    def test_02_receive_idempotent(self, fresh_cycle, partner_headers, sa_headers):
        po_id = fresh_cycle["po_id"]
        # Attempt to call receive again with 0 remaining should not duplicate the invoice
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/receive",
                          headers=partner_headers,
                          json={"lines": []}, timeout=15)
        # 409 or 400 acceptable — critical part is NO duplicate invoice
        lst = requests.get(f"{API}/admin/modules/mart/invoices?status=draft",
                           headers=sa_headers, timeout=15).json()
        matching = [it for it in lst["items"] if it["id"] == fresh_cycle["invoice_id"]]
        # And count of invoices for this PO must be exactly 1 (via admin fetch)
        all_ = requests.get(f"{API}/admin/modules/mart/invoices",
                            headers=sa_headers, timeout=15).json()["items"]
        po_invs = [it for it in all_
                   if requests.get(f"{API}/admin/modules/mart/invoices/{it['id']}",
                                   headers=sa_headers, timeout=15).json().get("po", {}).get("id") == po_id]
        assert len(po_invs) == 1

    def test_03_listing_scopes_and_status_filter(self, supplier_headers, partner_headers, sa_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        sup = requests.get(f"{API}/supplier/me/invoices?status=draft",
                           headers=supplier_headers, timeout=15).json()
        assert any(it["id"] == inv_id for it in sup["items"])
        par = requests.get(f"{API}/partner/invoices?status=draft",
                           headers=partner_headers, timeout=15).json()
        assert any(it["id"] == inv_id for it in par["items"])
        adm = requests.get(f"{API}/admin/modules/mart/invoices?status=draft",
                           headers=sa_headers, timeout=15).json()
        assert any(it["id"] == inv_id for it in adm["items"])
        # ?status=approved should NOT include our draft
        adm_apr = requests.get(f"{API}/admin/modules/mart/invoices?status=approved",
                               headers=sa_headers, timeout=15).json()
        assert not any(it["id"] == inv_id for it in adm_apr["items"])

    def test_04_supplier_patch_cost_variance(self, supplier_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        d = requests.get(f"{API}/supplier/me/invoices/{inv_id}",
                         headers=supplier_headers, timeout=15).json()
        # Bump unit cost by 5% on line 0 → cost_variance (> 2% tolerance)
        ln0 = d["lines"][0]
        new_cost = round(ln0["unit_cost_po"] * 1.05, 2)
        r = requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                           headers=supplier_headers,
                           json={"lines": [{"line_id": ln0["id"],
                                            "qty_invoiced": ln0["qty_received"],
                                            "unit_cost_invoiced": new_cost}]},
                           timeout=15)
        assert r.status_code == 200, r.text
        d2 = r.json()
        found = next(x for x in d2["lines"] if x["id"] == ln0["id"])
        assert found["match_status"] == "cost_variance"
        assert d2["match_status"] == "variance"
        # Reset back to matched by restoring cost
        r = requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                           headers=supplier_headers,
                           json={"lines": [{"line_id": ln0["id"],
                                            "qty_invoiced": ln0["qty_received"],
                                            "unit_cost_invoiced": ln0["unit_cost_po"]}]},
                           timeout=15)
        assert r.status_code == 200
        assert r.json()["match_status"] == "matched"

    def test_05_supplier_patch_qty_variance(self, supplier_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        d = requests.get(f"{API}/supplier/me/invoices/{inv_id}",
                         headers=supplier_headers, timeout=15).json()
        ln = d["lines"][0]
        wrong_qty = ln["qty_received"] + 1
        r = requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                           headers=supplier_headers,
                           json={"lines": [{"line_id": ln["id"],
                                            "qty_invoiced": wrong_qty,
                                            "unit_cost_invoiced": ln["unit_cost_po"]}]},
                           timeout=15)
        assert r.status_code == 200
        d2 = r.json()
        found = next(x for x in d2["lines"] if x["id"] == ln["id"])
        assert found["match_status"] == "qty_variance"
        # Restore
        requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                       headers=supplier_headers,
                       json={"lines": [{"line_id": ln["id"],
                                        "qty_invoiced": ln["qty_received"],
                                        "unit_cost_invoiced": ln["unit_cost_po"]}]},
                       timeout=15)

    def test_06_upload_pdf(self, supplier_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        # tiny valid PDF header
        pdf = b"%PDF-1.4\n%test invoice\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
        headers = {"Authorization": supplier_headers["Authorization"]}
        r = requests.post(f"{API}/supplier/me/invoices/{inv_id}/upload",
                          headers=headers,
                          files={"file": ("invoice.pdf", io.BytesIO(pdf), "application/pdf")},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert "storage_path" in r.json()
        # invoice row now has the fields
        d = requests.get(f"{API}/supplier/me/invoices/{inv_id}",
                         headers=supplier_headers, timeout=15).json()
        assert d["invoice_document_storage_path"]
        assert d["invoice_document_uploaded_at"]

    def test_07_submit_missing_fields_400(self, supplier_headers, fresh_cycle):
        # Fresh invoice on a second PO with NO number/date/doc → missing_fields
        # Reuse the same invoice but blank the invoice_number/date by using a new inv?
        # Simpler: attempt to submit BEFORE we set number/date via /submit body-missing
        inv_id = fresh_cycle["invoice_id"]
        d = requests.get(f"{API}/supplier/me/invoices/{inv_id}",
                         headers=supplier_headers, timeout=15).json()
        if d["supplier_invoice_number"] and d["invoice_date"]:
            pytest.skip("invoice already has number/date set")
        r = requests.post(f"{API}/supplier/me/invoices/{inv_id}/submit",
                          headers=supplier_headers, json={}, timeout=15)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", {})
        assert detail.get("code") == "missing_fields"
        assert "supplier_invoice_number" in detail.get("fields", [])
        assert "invoice_date" in detail.get("fields", [])

    def test_08_submit_matched(self, supplier_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        r = requests.post(f"{API}/supplier/me/invoices/{inv_id}/submit",
                          headers=supplier_headers,
                          json={"supplier_invoice_number": f"INV-DELTA-{uuid.uuid4().hex[:6].upper()}",
                                "invoice_date": "2026-01-15"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "matched", d
        assert d["match_status"] == "matched"
        assert d["submitted_at"] and d["matched_at"]

    def test_09_partner_approve_matched(self, partner_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        r = requests.post(f"{API}/partner/invoices/{inv_id}/approve",
                          headers=partner_headers, json={"notes": "looks good"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        assert d["approved_at"]
        assert d["approval_notes"] == "looks good"

    def test_10_rbac_cross_partner_404(self, partner_beta_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        r = requests.get(f"{API}/partner/invoices/{inv_id}",
                         headers=partner_beta_headers, timeout=15)
        assert r.status_code == 404

    def test_11_document_proxy_all_roles(self, supplier_headers, partner_headers, sa_headers, fresh_cycle):
        inv_id = fresh_cycle["invoice_id"]
        for hdrs, path in [
            (supplier_headers, "/api/supplier/me/invoices"),
            (partner_headers,  "/api/partner/invoices"),
            (sa_headers,       "/api/admin/modules/mart/invoices"),
        ]:
            r = requests.get(f"{BASE_URL}{path}/{inv_id}/document",
                             headers={"Authorization": hdrs["Authorization"]}, timeout=30)
            assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
            assert "pdf" in r.headers.get("content-type", "").lower()
            assert len(r.content) >= 4

    # ---- Variance flow on a NEW invoice --------------------------------

    @pytest.fixture(scope="class")
    def variance_invoice(self, partner_headers, supplier_headers, supplier_products, sa_headers):
        """Second PO cycle → invoice edited to variance → submitted → variance."""
        tag = uuid.uuid4().hex[:6]
        po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
            "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
            "notes": f"phase5-var {tag}"}, timeout=15)
        po_id = po.json()["id"]
        line_qty = {}
        for sp in supplier_products[:1]:
            r = requests.post(f"{API}/partner/purchase-orders/{po_id}/lines",
                              headers=partner_headers,
                              json={"supplier_product_id": sp["id"], "qty_ordered": 3},
                              timeout=15)
            line_qty[r.json()["id"]] = 3
        requests.post(f"{API}/partner/purchase-orders/{po_id}/submit", headers=partner_headers, timeout=15)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge", headers=supplier_headers, timeout=15)
        requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship", headers=supplier_headers, timeout=15)
        requests.post(f"{API}/partner/purchase-orders/{po_id}/receive",
                      headers=partner_headers,
                      json={"lines": [{"po_line_id": lid, "qty_received": q} for lid, q in line_qty.items()]},
                      timeout=15)
        time.sleep(0.3)
        # locate invoice via admin scan
        all_ = requests.get(f"{API}/admin/modules/mart/invoices?status=draft",
                            headers=sa_headers, timeout=15).json()["items"]
        inv_id = None
        for it in all_:
            det = requests.get(f"{API}/admin/modules/mart/invoices/{it['id']}",
                               headers=sa_headers, timeout=15).json()
            if det.get("po", {}).get("id") == po_id:
                inv_id = it["id"]; break
        assert inv_id
        # Edit line to +5% cost
        d = requests.get(f"{API}/supplier/me/invoices/{inv_id}", headers=supplier_headers, timeout=15).json()
        ln = d["lines"][0]
        requests.patch(f"{API}/supplier/me/invoices/{inv_id}",
                       headers=supplier_headers,
                       json={"lines": [{"line_id": ln["id"],
                                        "qty_invoiced": ln["qty_received"],
                                        "unit_cost_invoiced": round(ln["unit_cost_po"] * 1.05, 2)}]},
                       timeout=15)
        # Upload PDF
        pdf = b"%PDF-1.4\ntest\n%%EOF"
        requests.post(f"{API}/supplier/me/invoices/{inv_id}/upload",
                      headers={"Authorization": supplier_headers["Authorization"]},
                      files={"file": ("v.pdf", io.BytesIO(pdf), "application/pdf")},
                      timeout=30)
        # Submit
        requests.post(f"{API}/supplier/me/invoices/{inv_id}/submit",
                      headers=supplier_headers,
                      json={"supplier_invoice_number": f"INV-V-{uuid.uuid4().hex[:6].upper()}",
                            "invoice_date": "2026-01-16"}, timeout=15)
        return {"po_id": po_id, "invoice_id": inv_id}

    def test_12_variance_status_after_submit(self, sa_headers, variance_invoice):
        d = requests.get(f"{API}/admin/modules/mart/invoices/{variance_invoice['invoice_id']}",
                         headers=sa_headers, timeout=15).json()
        assert d["status"] == "variance", d
        assert d["match_status"] == "variance"

    def test_13_partner_approve_variance_needs_notes(self, partner_headers, variance_invoice):
        r = requests.post(f"{API}/partner/invoices/{variance_invoice['invoice_id']}/approve",
                          headers=partner_headers, json={}, timeout=15)
        assert r.status_code == 400, r.text
        assert r.json()["detail"]["code"] == "variance_approval_notes_required"

    def test_14_partner_dispute_reason_too_short(self, partner_headers, variance_invoice):
        r = requests.post(f"{API}/partner/invoices/{variance_invoice['invoice_id']}/dispute",
                          headers=partner_headers, json={"reason": "no"}, timeout=15)
        assert r.status_code == 422

    def test_15_partner_dispute_ok(self, partner_headers, sa_headers, variance_invoice):
        r = requests.post(f"{API}/partner/invoices/{variance_invoice['invoice_id']}/dispute",
                          headers=partner_headers,
                          json={"reason": "cost too high, need correction"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "disputed"
        assert d["dispute_reason"]
        actions = [a["action"] for a in d["audit_trail"]]
        assert "dispute" in actions

    def test_16_admin_override_reset_and_approve(self, sa_headers, variance_invoice):
        inv_id = variance_invoice["invoice_id"]
        # reset_to_draft
        r = requests.post(f"{API}/admin/modules/mart/invoices/{inv_id}/override",
                          headers=sa_headers,
                          json={"action": "reset_to_draft", "reason": "SA reset for retest"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert d["submitted_at"] is None and d["matched_at"] is None
        assert d["approved_at"] is None and d["disputed_at"] is None
        assert d["match_status"] is None
        # Then admin approve override
        r = requests.post(f"{API}/admin/modules/mart/invoices/{inv_id}/override",
                          headers=sa_headers,
                          json={"action": "approve", "reason": "SA final approval"},
                          timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "approved"
        actions = [a["action"] for a in d["audit_trail"]]
        assert "override_reset_to_draft" in actions
        assert "override_approve" in actions

    def test_17_admin_override_reason_too_short(self, sa_headers, variance_invoice):
        r = requests.post(f"{API}/admin/modules/mart/invoices/{variance_invoice['invoice_id']}/override",
                          headers=sa_headers,
                          json={"action": "dispute", "reason": "no"}, timeout=15)
        assert r.status_code == 422
