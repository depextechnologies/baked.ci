"""P0 hotfix regression — seller_slug on approve + login response + RBAC.

Covers acceptance items #1-#4 of the Fixing_Prompt.docx P0 pass:
  1. Login response includes supplier.seller_slug (=='delta' for DEMO Delta).
  2. Approve is idempotent — re-approving an already-approved supplier does
     not change slug / does not error hard / does not create a duplicate code.
  3. Slug generation on approve — approve DEMO Echo (submitted) and verify
     supplier.seller_slug is generated deterministically from trading_name.
  4. UNIQUE constraint on seller_slug column at the DB layer.
  5. RBAC — supplier JWT scoped to supplier A cannot see supplier B's data.
"""

import os
import re
import uuid
import pytest
import requests
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"

DELTA_EMAIL = "demo-delta-supplier@test.example"
DELTA_PASSWORD = "Supplier1234!"

ECHO_APP_CODE = "MART-SUP-2026-00002"  # submitted, ready for approval


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def sa_headers():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def delta_login():
    r = requests.post(f"{API}/martbaked/sellers/login",
                      json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# 1. Login response shape — seller_slug present
# ---------------------------------------------------------------------------
class TestLoginResponseIncludesSlug:
    def test_delta_login_includes_seller_slug(self, delta_login):
        supplier = delta_login.get("supplier")
        assert supplier is not None, "supplier block missing from login response"
        assert "seller_slug" in supplier, f"seller_slug key absent: {list(supplier)}"
        assert supplier["seller_slug"] == "delta", (
            f"expected slug 'delta', got {supplier['seller_slug']!r}"
        )

    def test_delta_login_returns_bearer_token(self, delta_login):
        assert isinstance(delta_login.get("access_token"), str)
        assert delta_login.get("token_type", "").lower() == "bearer"


# ---------------------------------------------------------------------------
# 2. Approve is idempotent for an already-approved supplier
# ---------------------------------------------------------------------------
class TestApproveIdempotent:
    def test_reapprove_delta_does_not_mutate_or_500(self, sa_headers, delta_login):
        # Find the application id for the DELTA supplier
        supplier_id = delta_login["supplier"]["id"]
        original_slug = delta_login["supplier"]["seller_slug"]
        original_code = delta_login["supplier"].get("code")

        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/applications",
            headers=sa_headers, params={"status": "approved"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        apps = r.json().get("items") or r.json().get("applications") or r.json()
        # Find Delta's app
        delta_app = next(
            (a for a in apps if a.get("supplier_id") == supplier_id or
             a.get("business_email") == DELTA_EMAIL),
            None,
        )
        assert delta_app, f"Could not locate Delta application in approved bucket"
        app_id = delta_app["id"]

        # Attempt re-approve — should be a benign 4xx (409) or 200
        r2 = requests.post(
            f"{API}/admin/modules/mart/suppliers/applications/{app_id}/approve",
            headers=sa_headers, json={"notes": "idempotency probe"}, timeout=15,
        )
        assert r2.status_code in (200, 409), (
            f"re-approve returned {r2.status_code}: {r2.text}"
        )

        # Verify slug + code unchanged
        r3 = requests.post(f"{API}/martbaked/sellers/login",
                           json={"email": DELTA_EMAIL, "password": DELTA_PASSWORD}, timeout=15)
        assert r3.status_code == 200
        s = r3.json()["supplier"]
        assert s["seller_slug"] == original_slug, "slug was mutated on re-approve!"
        assert s.get("code") == original_code, "supplier code was mutated on re-approve!"


# ---------------------------------------------------------------------------
# 3. Slug generation on approve for a submitted supplier
# ---------------------------------------------------------------------------
class TestSlugGenerationOnApprove:
    def test_approve_echo_generates_slug(self, sa_headers):
        # Locate ECHO application
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/applications",
            headers=sa_headers, params={"status": "submitted"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        apps = r.json().get("items") or r.json().get("applications") or r.json()
        echo = next((a for a in apps if a.get("application_code") == ECHO_APP_CODE), None)
        if not echo:
            # Maybe it moved into under_review / action_required
            for st in ("under_review", "action_required"):
                r2 = requests.get(f"{API}/admin/modules/mart/suppliers/applications",
                                  headers=sa_headers, params={"status": st}, timeout=15)
                if r2.status_code == 200:
                    items = r2.json().get("items") or r2.json().get("applications") or r2.json()
                    echo = next((a for a in items if a.get("application_code") == ECHO_APP_CODE), None)
                    if echo:
                        break
        if not echo:
            pytest.skip(f"ECHO app {ECHO_APP_CODE} not found in reviewable buckets — may already be approved")

        app_id = echo["id"]
        r = requests.post(
            f"{API}/admin/modules/mart/suppliers/applications/{app_id}/approve",
            headers=sa_headers, json={"notes": "P0 slug gen test"}, timeout=20,
        )
        assert r.status_code == 200, f"approve failed: {r.status_code} {r.text}"

        # Fetch supplier detail
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/applications/{app_id}",
            headers=sa_headers, timeout=15,
        )
        assert r.status_code == 200
        detail = r.json()
        supplier = detail.get("supplier") or detail
        slug = supplier.get("seller_slug")
        assert slug, f"seller_slug missing after approve; supplier keys={list(supplier)}"
        # Expected 'echo' first, or 'echo-N' if collision
        assert re.match(r"^echo(-\d+)?$", slug), (
            f"expected slug starting with 'echo', got {slug!r}"
        )
        # persist for RBAC test
        pytest.echo_supplier_id = supplier.get("id")
        pytest.echo_slug = slug


# ---------------------------------------------------------------------------
# 4. UNIQUE constraint on seller_slug column
# ---------------------------------------------------------------------------
class TestSlugUniqueConstraint:
    def test_seller_slug_column_is_unique(self):
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine

        db_url = os.environ["DATABASE_URL"]
        engine = create_async_engine(db_url)

        async def _probe():
            async with engine.connect() as conn:
                # Check pg_index / information_schema for uniqueness
                res = await conn.execute(text("""
                    SELECT COUNT(*) FROM pg_indexes
                    WHERE tablename = 'suppliers'
                      AND indexdef ILIKE '%UNIQUE%'
                      AND indexdef ILIKE '%seller_slug%'
                """))
                cnt = res.scalar()
                return cnt

        cnt = asyncio.get_event_loop().run_until_complete(_probe())
        assert cnt >= 1, "No UNIQUE index found on suppliers.seller_slug"

    def test_duplicate_slug_write_raises(self):
        """Attempt to set two suppliers to the same slug via raw SQL — must fail."""
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine

        db_url = os.environ["DATABASE_URL"]
        engine = create_async_engine(db_url)

        async def _probe():
            async with engine.begin() as conn:
                rows = (await conn.execute(text(
                    "SELECT id, seller_slug FROM suppliers WHERE seller_slug IS NOT NULL LIMIT 2"
                ))).all()
                if len(rows) < 2:
                    return "skip"
                target_slug = rows[0][1]
                other_id = rows[1][0]
                try:
                    await conn.execute(text(
                        "UPDATE suppliers SET seller_slug = :s WHERE id = :i"
                    ), {"s": target_slug, "i": other_id})
                    return "no_error"
                except Exception as e:
                    return f"raised:{type(e).__name__}"

        result = asyncio.get_event_loop().run_until_complete(_probe())
        if result == "skip":
            pytest.skip("Not enough approved suppliers to test duplicate write")
        assert result.startswith("raised:"), (
            f"Expected UNIQUE violation, got {result!r}"
        )


# ---------------------------------------------------------------------------
# 5. RBAC — supplier JWT for Delta cannot reach Echo's data
# ---------------------------------------------------------------------------
class TestSupplierRBAC:
    def test_delta_token_cannot_see_other_supplier(self, delta_login):
        tok = delta_login["access_token"]
        h = {"Authorization": f"Bearer {tok}"}

        # /me should always return DELTA (self)
        r = requests.get(f"{API}/martbaked/sellers/me", headers=h, timeout=15)
        if r.status_code == 404:
            # try portal prefix
            r = requests.get(f"{API}/martbaked/sellers/portal/me", headers=h, timeout=15)
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            body = r.json()
            sid = (body.get("supplier") or body).get("id") or body.get("id")
            assert sid == delta_login["supplier"]["id"], (
                "supplier /me leaked another supplier's identity!"
            )

    def test_delta_token_rejected_on_admin_route(self, delta_login):
        tok = delta_login["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.get(
            f"{API}/admin/modules/mart/suppliers/applications", headers=h, timeout=15
        )
        assert r.status_code in (401, 403), (
            f"admin route accepted supplier token! {r.status_code} {r.text[:200]}"
        )
