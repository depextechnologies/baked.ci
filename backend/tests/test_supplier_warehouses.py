"""Social.docx Issue #9 — Supplier ↔ Warehouse assignments (admin CRUD).

Endpoints under test:
  GET    /api/admin/modules/mart/suppliers/{sid}/warehouses
  POST   /api/admin/modules/mart/suppliers/{sid}/warehouses
  DELETE /api/admin/modules/mart/suppliers/{sid}/warehouses/{wh_id}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "depexopenai@gmail.com"
ADMIN_PASSWORD = "baked@2026#!$@"

SUPPLIER_ID = "sup_demo_delta_seed"
WH_ALPHA = "wh_alpha_demo_seed"      # MRT-ABJ-001 (CI)
# We'll discover the second CI warehouse dynamically


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
    }, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup(client):
    """Ensure baseline: unassign anything currently linked to the demo supplier."""
    r = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    if r.status_code == 200:
        for a in r.json().get("assignments", []):
            client.delete(
                f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses/{a['warehouse_id']}",
                timeout=20,
            )
    yield
    # Teardown
    r = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    if r.status_code == 200:
        for a in r.json().get("assignments", []):
            client.delete(
                f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses/{a['warehouse_id']}",
                timeout=20,
            )


@pytest.fixture(scope="module")
def second_wh_id(client):
    r = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    assert r.status_code == 200, r.text
    eligible = r.json().get("eligible", [])
    other = [w for w in eligible if w["id"] != WH_ALPHA]
    if not other:
        pytest.skip("No second CI warehouse available for one-primary test")
    return other[0]["id"]


def test_list_shape_and_eligible(client):
    r = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(["supplier", "assignments", "eligible"]).issubset(data.keys())
    assert data["supplier"]["id"] == SUPPLIER_ID
    assert data["supplier"]["country"] == "CI"
    assert isinstance(data["assignments"], list)
    assert isinstance(data["eligible"], list)
    # Every eligible row has is_assigned bool and belongs to CI (implied by country filter)
    for w in data["eligible"]:
        assert "is_assigned" in w and isinstance(w["is_assigned"], bool)
        assert "code" in w and "id" in w
    # Alpha wh should be in the eligible catalogue
    ids = [w["id"] for w in data["eligible"]]
    assert WH_ALPHA in ids


def test_assign_warehouse_creates_row(client):
    r = client.post(
        f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses",
        json={"warehouse_id": WH_ALPHA, "is_primary": False, "notes": "TEST_assign"},
        timeout=20,
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["supplier_id"] == SUPPLIER_ID
    assert d["warehouse_id"] == WH_ALPHA
    assert d["is_primary"] is False
    assert d["warehouse"]["code"] == "MRT-ABJ-001"

    # Verify via GET
    g = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    assert g.status_code == 200
    assigns = g.json()["assignments"]
    assert any(a["warehouse_id"] == WH_ALPHA for a in assigns)
    # is_assigned flag flipped in eligible list
    elig = {w["id"]: w for w in g.json()["eligible"]}
    assert elig[WH_ALPHA]["is_assigned"] is True


def test_idempotent_reassign_updates_row(client):
    # POST same pair again — should update (not 409)
    r = client.post(
        f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses",
        json={"warehouse_id": WH_ALPHA, "is_primary": True, "notes": "TEST_updated"},
        timeout=20,
    )
    assert r.status_code == 201, r.text
    assert r.json()["is_primary"] is True
    assert r.json()["notes"] == "TEST_updated"

    g = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    rows = [a for a in g.json()["assignments"] if a["warehouse_id"] == WH_ALPHA]
    assert len(rows) == 1  # no duplicate


def test_one_primary_rule(client, second_wh_id):
    # Alpha is currently primary (from previous test). Assign the second wh as primary.
    r = client.post(
        f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses",
        json={"warehouse_id": second_wh_id, "is_primary": True},
        timeout=20,
    )
    assert r.status_code == 201, r.text
    assert r.json()["is_primary"] is True

    g = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    assigns = g.json()["assignments"]
    primaries = [a for a in assigns if a["is_primary"]]
    assert len(primaries) == 1, f"Expected exactly 1 primary, got {len(primaries)}: {primaries}"
    assert primaries[0]["warehouse_id"] == second_wh_id


def test_cross_country_denied(client):
    # Seed a temporary non-CI warehouse directly via DB (no admin CRUD endpoint exposed).
    import os as _os
    from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    async def _run(sql, params=None):
        eng = create_async_engine(_os.environ["DATABASE_URL"])
        try:
            async with eng.begin() as conn:
                res = await conn.execute(text(sql), params or {})
                try:
                    return res.fetchall()
                except Exception:
                    return None
        finally:
            await eng.dispose()

    async def _seed():
        rows = await _run("SELECT partner_id FROM warehouses LIMIT 1")
        pid = rows[0][0]
        await _run(
            "INSERT INTO warehouses (id, partner_id, code, name, address_line, city, country, status, is_active) "
            "VALUES (:id,:pid,'TEST-XCO-001','TEST Cross-Country','1 test rd','Monrovia','LR','active',true) "
            "ON CONFLICT (id) DO NOTHING",
            {"id": "wh_test_xco", "pid": pid},
        )

    async def _cleanup():
        await _run("DELETE FROM warehouses WHERE id = :id", {"id": "wh_test_xco"})

    asyncio.run(_seed())
    non_ci = "wh_test_xco"
    try:
        r = client.post(
            f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses",
            json={"warehouse_id": non_ci, "is_primary": False},
            timeout=20,
        )
        assert r.status_code == 400, r.text
        body = r.json()
        detail = body.get("detail", body)
        assert detail.get("code") == "cross_country_denied", f"body={body}"
    finally:
        asyncio.run(_cleanup())


def test_unassign_returns_204_and_removes(client):
    r = client.delete(
        f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses/{WH_ALPHA}",
        timeout=20,
    )
    assert r.status_code == 204, r.text

    g = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses", timeout=20)
    ids = [a["warehouse_id"] for a in g.json()["assignments"]]
    assert WH_ALPHA not in ids


def test_unassign_missing_row_404(client):
    r = client.delete(
        f"{BASE_URL}/api/admin/modules/mart/suppliers/{SUPPLIER_ID}/warehouses/{WH_ALPHA}",
        timeout=20,
    )
    assert r.status_code == 404, r.text


def test_audit_trail_written(client, second_wh_id):
    # Fetch application detail — audit_trail lives there — via the supplier's app id.
    # Simpler: hit list applications and find our supplier.
    r = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/applications?q=Delta", timeout=20)
    assert r.status_code == 200, r.text
    app = next((it for it in r.json()["items"] if it["supplier_id"] == SUPPLIER_ID), None)
    assert app, "Demo Delta application not found"
    d = client.get(f"{BASE_URL}/api/admin/modules/mart/suppliers/applications/{app['id']}", timeout=20)
    assert d.status_code == 200
    actions = [a["action"] for a in d.json().get("audit_trail", [])]
    assert "warehouse_assigned" in actions, f"missing warehouse_assigned in {actions[:10]}"
    assert "warehouse_unassigned" in actions, f"missing warehouse_unassigned in {actions[:10]}"
