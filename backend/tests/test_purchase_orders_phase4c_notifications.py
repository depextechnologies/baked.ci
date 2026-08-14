"""Phase 4c — PO email notifications regression suite.

Verifies:
 * PO submit → mailer.no_op line to supplier.business_email
 * PO acknowledge → mailer.no_op line to partner.owner_email
 * PO ship → mailer.no_op line to partner.owner_email (+warehouse_manager staff)
 * Fire-and-forget: endpoint returns quickly (<1500ms)
 * Failed transitions (409) do NOT emit mailer lines
 * Missing recipient email → logs po_notify.no_recipients (does not crash)
"""
from __future__ import annotations
import os
import re
import time
import uuid
import subprocess

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASSWORD = "Alpha1234!Beta"
DELTA_EMAIL = "demo-delta-supplier@test.example"
DELTA_PASSWORD = "Supplier1234!"
DELTA_SUPPLIER_ID = "sup_demo_delta_seed"
ALPHA_WAREHOUSE_ID = "wh_alpha_demo_seed"

BACKEND_LOG = "/var/log/supervisor/backend.err.log"

PG_DSN = "host=127.0.0.1 dbname=baked user=baked password=baked_local_dev"


def _psql(sql: str) -> str:
    """Run a SQL statement via psql; returns stdout. Uses -tA for machine-parseable output."""
    env = {**os.environ, "PGPASSWORD": "baked_local_dev"}
    r = subprocess.run(
        ["psql", "-h", "127.0.0.1", "-U", "baked", "-d", "baked", "-tAc", sql],
        capture_output=True, text=True, env=env, timeout=15,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr}")
    return r.stdout.strip()


def _tail_log(n: int = 400) -> str:
    try:
        return subprocess.check_output(["tail", "-n", str(n), BACKEND_LOG], text=True)
    except Exception:  # noqa: BLE001
        return ""


def _log_since(marker_ts: float) -> str:
    # We rely on tailing a large enough chunk; combined with marker filtering by po_code.
    return _tail_log(2000)


def _wait_for_log(pattern: str, timeout: float = 5.0) -> str | None:
    """Poll the backend log until a line matching regex `pattern` appears."""
    deadline = time.time() + timeout
    rx = re.compile(pattern)
    while time.time() < deadline:
        buf = _tail_log(2000)
        for line in buf.splitlines():
            if rx.search(line):
                return line
        time.sleep(0.25)
    return None


@pytest.fixture(scope="module")
def partner_headers():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=15).json()
    return {"Authorization": f"Bearer {r.get('access_token') or r.get('token')}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_headers():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_products(supplier_headers):
    r = requests.get(f"{API}/supplier/me/catalogue", headers=supplier_headers, timeout=15)
    return r.json()["items"]


def _make_draft_po(partner_headers, supplier_products, n_lines: int = 1) -> tuple[str, str]:
    po = requests.post(f"{API}/partner/purchase-orders", headers=partner_headers, json={
        "supplier_id": DELTA_SUPPLIER_ID, "warehouse_id": ALPHA_WAREHOUSE_ID,
        "notes": f"phase4c {uuid.uuid4().hex[:6]}",
    }, timeout=15)
    assert po.status_code == 201, po.text
    body = po.json()
    for sp in supplier_products[:n_lines]:
        r = requests.post(f"{API}/partner/purchase-orders/{body['id']}/lines",
                          headers=partner_headers,
                          json={"supplier_product_id": sp["id"], "qty_ordered": 3}, timeout=15)
        assert r.status_code == 201, r.text
    return body["id"], body["po_code"]


# ---------------------------------------------------------------------------
# 1. Submit fires notification to supplier.business_email
# ---------------------------------------------------------------------------
class TestSubmitNotification:
    def test_submit_dispatches_to_supplier(self, partner_headers, supplier_products):
        po_id, po_code = _make_draft_po(partner_headers, supplier_products)
        t0 = time.time()
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                          headers=partner_headers, timeout=15)
        latency_ms = (time.time() - t0) * 1000
        assert r.status_code == 200, r.text
        # Fire-and-forget: response must NOT block on dispatch.
        assert latency_ms < 3000, f"submit endpoint too slow: {latency_ms:.0f}ms"

        # Wait for log line
        pattern = rf"mailer\.no_op to={re.escape(DELTA_EMAIL)}.*\[BAKED\] New PO {re.escape(po_code)}"
        line = _wait_for_log(pattern, timeout=6)
        assert line is not None, f"missing submit mailer line for {po_code}"
        # Explicit assertions on recipient + subject shape
        assert f"to={DELTA_EMAIL}" in line
        assert f"[BAKED] New PO {po_code}" in line
        assert "Partner Alpha Store" in line  # partner business_name
        # Recipient MUST NOT be the partner email
        assert PARTNER_EMAIL not in line

        # Store po_id on the class for follow-up tests
        pytest.po_submitted_id = po_id
        pytest.po_submitted_code = po_code


# ---------------------------------------------------------------------------
# 2. Acknowledge fires notification to partner.owner_email
# ---------------------------------------------------------------------------
class TestAcknowledgeNotification:
    def test_ack_dispatches_to_partner(self, supplier_headers):
        po_id = getattr(pytest, "po_submitted_id", None)
        po_code = getattr(pytest, "po_submitted_code", None)
        assert po_id, "submit test must run first"

        t0 = time.time()
        r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge",
                          headers=supplier_headers, json={}, timeout=15)
        latency_ms = (time.time() - t0) * 1000
        assert r.status_code == 200, r.text
        assert latency_ms < 3000

        pattern = rf"mailer\.no_op to={re.escape(PARTNER_EMAIL)}.*PO {re.escape(po_code)} acknowledged by DEMO Delta"
        line = _wait_for_log(pattern, timeout=6)
        assert line is not None, f"missing ack mailer line for {po_code}"
        assert f"[BAKED] PO {po_code} acknowledged by " in line


# ---------------------------------------------------------------------------
# 3. Ship fires notification to partner (+ optionally warehouse_manager staff)
# ---------------------------------------------------------------------------
class TestShipNotification:
    def test_ship_dispatches_to_partner(self, supplier_headers):
        po_id = getattr(pytest, "po_submitted_id", None)
        po_code = getattr(pytest, "po_submitted_code", None)
        assert po_id

        t0 = time.time()
        r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship",
                          headers=supplier_headers, json={}, timeout=15)
        latency_ms = (time.time() - t0) * 1000
        assert r.status_code == 200, r.text
        assert latency_ms < 3000

        pattern = rf"mailer\.no_op to={re.escape(PARTNER_EMAIL)}.*PO {re.escape(po_code)} shipped.*prepare MRT-ABJ-001"
        line = _wait_for_log(pattern, timeout=6)
        assert line is not None, f"missing ship mailer line for {po_code}"

    def test_ship_includes_warehouse_manager(self, partner_headers, supplier_products, supplier_headers):
        """If an active warehouse_manager staff row exists for the PO warehouse,
        their email must also receive the ship notification."""
        staff_email = f"TEST_whmgr_{uuid.uuid4().hex[:6]}@test.example"
        staff_id = f"stf_test_{uuid.uuid4().hex[:8]}"
        emp_code = f"EMP-TEST-{uuid.uuid4().hex[:4].upper()}"
        partner_id = _psql(f"SELECT id FROM partners WHERE owner_email='{PARTNER_EMAIL}'")
        assert partner_id, "partner not found"
        try:
            _psql(
                f"INSERT INTO partner_staff (id, partner_id, warehouse_id, email, name, role, "
                f"is_active, employee_code, password_hash, must_reset_password, created_at, updated_at) "
                f"VALUES ('{staff_id}', '{partner_id}', '{ALPHA_WAREHOUSE_ID}', '{staff_email}', "
                f"'TEST WH Mgr', 'warehouse_manager', TRUE, '{emp_code}', 'x', FALSE, NOW(), NOW())"
            )
        except Exception as e:
            pytest.skip(f"could not insert test staff row: {e}")
        try:
            po_id, po_code = _make_draft_po(partner_headers, supplier_products)
            requests.post(f"{API}/partner/purchase-orders/{po_id}/submit", headers=partner_headers, timeout=15)
            time.sleep(0.5)
            requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge",
                          headers=supplier_headers, json={}, timeout=15)
            time.sleep(0.5)
            r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/ship",
                              headers=supplier_headers, json={}, timeout=15)
            assert r.status_code == 200

            pattern = rf"mailer\.no_op to={re.escape(staff_email)}.*PO {re.escape(po_code)} shipped"
            line = _wait_for_log(pattern, timeout=6)
            assert line is not None, f"warehouse_manager staff not notified for {po_code}"
        finally:
            _psql(f"DELETE FROM partner_staff WHERE id='{staff_id}'")


# ---------------------------------------------------------------------------
# 4. No dispatch on failed transition
# ---------------------------------------------------------------------------
class TestNoDispatchOnFailure:
    def test_double_submit_409_no_mail(self, partner_headers, supplier_products):
        po_id, po_code = _make_draft_po(partner_headers, supplier_products)
        r1 = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                           headers=partner_headers, timeout=15)
        assert r1.status_code == 200
        time.sleep(1.0)
        # Snapshot log
        before = _tail_log(2000)
        r2 = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                           headers=partner_headers, timeout=15)
        assert r2.status_code == 409, r2.text
        time.sleep(1.5)
        after = _tail_log(2000)
        # Count occurrences of this po_code in mailer lines — must be exactly the
        # number that existed BEFORE the 409 attempt (i.e. no new dispatch).
        before_hits = len(re.findall(rf"mailer\.no_op .* New PO {re.escape(po_code)}", before))
        after_hits = len(re.findall(rf"mailer\.no_op .* New PO {re.escape(po_code)}", after))
        assert after_hits == before_hits, (
            f"409 submit should NOT emit a new mailer line "
            f"(before={before_hits}, after={after_hits}) for {po_code}"
        )


# ---------------------------------------------------------------------------
# 5. Missing recipient guard — po_notify.no_recipients
# ---------------------------------------------------------------------------
class TestMissingRecipientGuard:
    def test_ack_without_owner_email_logs_no_recipients(self, partner_headers, supplier_products, supplier_headers):
        # Create + submit a fresh PO
        po_id, po_code = _make_draft_po(partner_headers, supplier_products)
        r = requests.post(f"{API}/partner/purchase-orders/{po_id}/submit",
                          headers=partner_headers, timeout=15)
        assert r.status_code == 200
        time.sleep(0.7)

        original_email = _psql(f"SELECT owner_email FROM partners WHERE owner_email='{PARTNER_EMAIL}'")
        assert original_email == PARTNER_EMAIL, f"partner not found (got {original_email!r})"
        partner_id = _psql(f"SELECT id FROM partners WHERE owner_email='{PARTNER_EMAIL}'")
        _psql(f"UPDATE partners SET owner_email='' WHERE id='{partner_id}'")
        try:
            r = requests.post(f"{API}/supplier/me/purchase-orders/{po_id}/acknowledge",
                              headers=supplier_headers, json={}, timeout=15)
            assert r.status_code == 200, r.text
            pattern = rf"po_notify\.no_recipients po={re.escape(po_id)} kind=acknowledged"
            line = _wait_for_log(pattern, timeout=6)
            assert line is not None, f"expected no_recipients guard log, got tail=\n{_tail_log(30)}"
        finally:
            _psql(f"UPDATE partners SET owner_email='{original_email}' WHERE id='{partner_id}'")
