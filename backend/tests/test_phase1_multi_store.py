"""Phase 1 Multi-Store Foundation regression tests.

Covers Fixing_Prompt §7, §9, §14, §15, §16 acceptance criteria:
  * Store lifecycle: only `active` accepts logins
  * Login by employee_code OR email
  * Cross-store denial with 403 wrong_store
  * Backend enforcement of JWT-bound store_id on warehouse endpoints
  * Store-code + employee-code generators
"""
from __future__ import annotations
import asyncio
import pathlib
import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

import os
BASE_URL = os.environ["REACT_APP_BACKEND_URL"]

# Seed fixtures — see /app/memory/test_credentials.md
STORE_ALPHA = "MRT-ABJ-001"
STORE_BETA  = "MRT-ABJ-002"
STAFF_EMAIL = "picker1@example.com"
STAFF_CODE  = "EMP-ABJ-001"
STAFF_PW    = "Packer1234!"


def _run_sql(sql: str) -> None:
    """Sync helper using asyncpg with a FRESH event loop per call to
    avoid 'attached to a different loop' errors across tests."""
    import asyncpg
    async def _do():
        # Extract raw DSN for asyncpg (strip the +asyncpg driver marker)
        dsn = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(sql)
        finally:
            await conn.close()
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_do())
    finally:
        loop.close()


# ---------------------------------------------------------------------------
#   Login flow
# ---------------------------------------------------------------------------

def _login(payload: dict) -> requests.Response:
    return requests.post(f"{BASE_URL}/api/partner/auth/staff-login",
                         json=payload, timeout=10)


def test_login_by_email():
    r = _login({"store_id": STORE_ALPHA, "identifier": STAFF_EMAIL, "password": STAFF_PW})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["staff"]["email"] == STAFF_EMAIL
    assert body["staff"]["employee_code"] == STAFF_CODE
    assert body["store"]["code"] == STORE_ALPHA
    assert body["store"]["status"] == "active"


def test_login_by_employee_code():
    r = _login({"store_id": STORE_ALPHA, "identifier": STAFF_CODE, "password": STAFF_PW})
    assert r.status_code == 200, r.text
    assert r.json()["staff"]["employee_code"] == STAFF_CODE


def test_login_wrong_store_returns_401():
    r = _login({"store_id": "MRT-ABJ-999", "identifier": STAFF_EMAIL, "password": STAFF_PW})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid credentials"


def test_login_cross_store_returns_403():
    r = _login({"store_id": STORE_BETA, "identifier": STAFF_EMAIL, "password": STAFF_PW})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "wrong_store"


def test_login_wrong_password_uniform_401():
    """Password shorter than any policy still yields 401 (no 422 field-length leak)."""
    r = _login({"store_id": STORE_ALPHA, "identifier": STAFF_EMAIL, "password": "x"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid credentials"


# ---------------------------------------------------------------------------
#   Cross-store enforcement on protected endpoints (Fixing_Prompt §16)
# ---------------------------------------------------------------------------

def test_staff_cannot_access_sibling_store_warehouse_endpoint():
    """A staff member bound to Alpha attempts a warehouse endpoint on another
    same-partner warehouse — must return 403 cross_store_denied."""
    tok = _login({"store_id": STORE_ALPHA, "identifier": STAFF_CODE,
                  "password": STAFF_PW}).json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}

    _run_sql("""
        INSERT INTO warehouses
            (id, partner_id, code, name, address_line, city, country,
             service_area_km, status, is_active)
        VALUES
            ('wh_test_sibling','prt_alpha_demo_seed','MRT-ABJ-TST',
             'Alpha Test Sibling','1 Test','Abidjan','CI',7,'active',true)
        ON CONFLICT (id) DO NOTHING
    """)
    try:
        r = requests.get(f"{BASE_URL}/api/partner/warehouse/wh_test_sibling/tree",
                         headers=hdr, timeout=10)
        assert r.status_code == 403, r.text
        assert r.json()["detail"]["code"] == "cross_store_denied"
    finally:
        _run_sql("DELETE FROM warehouses WHERE id='wh_test_sibling'")


def test_owner_can_access_all_own_warehouses():
    """Owner tokens (no store_id claim) can operate across every warehouse
    they own — the staff-only lock does NOT apply."""
    tok = requests.post(f"{BASE_URL}/api/partner/auth/login",
                        json={"email": "partner-alpha-store@test.example",
                              "password": "Alpha1234!Beta"},
                        timeout=10).json()["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{BASE_URL}/api/partner/warehouse/wh_alpha_demo_seed/tree",
                     headers=hdr, timeout=10)
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
#   Code generators
# ---------------------------------------------------------------------------

def test_store_code_generator_bumps_sequence():
    from modules.mart_partner.codes import next_store_code, _city_code

    assert _city_code("Abidjan") == "ABJ"
    assert _city_code("Accra")   == "ACC"
    assert _city_code(None)      == "XXX"

    async def _run():
        # Use a fresh engine + session per call to avoid pytest event-loop
        # pollution from the sync _run_sql helper above.
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        e = create_async_engine(os.environ["DATABASE_URL"])
        SL = async_sessionmaker(e, expire_on_commit=False)
        async with SL() as session:
            code = await next_store_code(session, module="mart", city="Abidjan")
            assert code.startswith("MRT-ABJ-"), code
            seq = int(code.rsplit("-", 1)[1])
            assert seq >= 3, f"expected seq >=3 (seed has 001+002), got {code}"
        await e.dispose()
    asyncio.new_event_loop().run_until_complete(_run())


def test_employee_code_generator_per_partner():
    from modules.mart_partner.codes import next_employee_code

    async def _run():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        e = create_async_engine(os.environ["DATABASE_URL"])
        SL = async_sessionmaker(e, expire_on_commit=False)
        async with SL() as session:
            code = await next_employee_code(
                session, partner_id="prt_alpha_demo_seed", city="Abidjan")
            assert code.startswith("EMP-ABJ-"), code
            seq = int(code.rsplit("-", 1)[1])
            assert seq >= 3
        await e.dispose()
    asyncio.new_event_loop().run_until_complete(_run())


# ---------------------------------------------------------------------------
#   Lifecycle guard
# ---------------------------------------------------------------------------

def test_login_blocked_when_store_not_operational():
    """Warehouse.status != 'active' → login 403 store_not_operational."""
    _run_sql("UPDATE warehouses SET status='maintenance' WHERE code='MRT-ABJ-001'")
    try:
        r = _login({"store_id": STORE_ALPHA, "identifier": STAFF_EMAIL, "password": STAFF_PW})
        assert r.status_code == 403
        assert r.json()["detail"]["code"] == "store_not_operational"
    finally:
        _run_sql("UPDATE warehouses SET status='active' WHERE code='MRT-ABJ-001'")
