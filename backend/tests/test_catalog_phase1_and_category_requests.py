"""Phase 1 — Catalogue completion + Category Request workflow + Reservation lock invariant.

Backend regression for iteration 24.

Covers:
 * Extended MartProduct fields (mrp, cost_price, tax_pct, tax_hsn_code,
   batch_tracking, temperature_class ...) — create + verify persistence
 * tax_pct validation (400 on 150)
 * Existing product APIs still work (list / patch price)
 * Partner submit category request (POST /api/partner/catalog/category-requests)
 * Partner GET /api/partner/catalog/category-requests (mine list)
 * SA GET /api/admin/mart/category-requests with buckets
 * SA approve → merges into mart_categories, moves bucket, 409 on re-approve
 * SA reject without notes → 400, with notes → 200 & rejected bucket
 * Reservation locking invariant — two concurrent allocate() tasks on a
   1-unit synthetic PartnerInventory: exactly one wins, invariant holds,
   `reserve` movement written with before_qty populated.
 * Sanity: /api/admin/inventory/kpis + /api/partner/inventory still return 200.
"""
from __future__ import annotations
import asyncio
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SA_EMAIL = "depexopenai@gmail.com"
SA_PASSWORD = "baked@2026#!$@"
PARTNER_EMAIL = "partner-alpha-store@test.example"
PARTNER_PASSWORD = "Alpha1234!Beta"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"SA login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def partner_token():
    r = requests.post(f"{API}/partner/auth/login",
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Partner login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def sa_headers(sa_token):
    return {"Authorization": f"Bearer {sa_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def partner_headers(partner_token):
    return {"Authorization": f"Bearer {partner_token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Product extended fields
# ---------------------------------------------------------------------------

class TestProductExtendedFields:

    def test_create_product_with_all_phase1_fields(self, sa_headers):
        payload = {
            "name": f"TEST_Phase1_Product_{uuid.uuid4().hex[:6]}",
            "country": "CI",
            "module": "mart",
            "price": 1200.0,
            "currency": "XOF",
            "manufacturer": "TEST Manuf",
            "short_description": "test short desc",
            "product_type": "grocery",
            "tags": ["frozen", "test"],
            "ean_upc": "1234567890123",
            "tax_hsn_code": "190531",
            "batch_tracking": True,
            "expiry_tracking": True,
            "pack_size": "500g",
            "net_qty": 500.0,
            "gross_qty": 550.0,
            "mrp": 1500.0,
            "cost_price": 800.0,
            "tax_pct": 18.0,
            "storage_requirement": "keep cold",
            "temperature_class": "chilled",
        }
        r = requests.post(f"{API}/admin/mart/products", headers=sa_headers, json=payload, timeout=30)
        assert r.status_code == 201, f"{r.status_code} {r.text}"
        data = r.json()
        pid = data["id"]
        # Verify all fields persist
        assert data["mrp"] == 1500.0
        assert data["cost_price"] == 800.0
        assert data["tax_pct"] == 18.0
        assert data["tax_hsn_code"] == "190531"
        assert data["batch_tracking"] is True
        assert data["temperature_class"] == "chilled"
        assert data["manufacturer"] == "TEST Manuf"
        assert data["short_description"] == "test short desc"
        assert data["pack_size"] == "500g"
        assert data["net_qty"] == 500.0
        assert data["ean_upc"] == "1234567890123"

        # GET to verify persistence via list
        g = requests.get(f"{API}/admin/mart/products?q=TEST_Phase1_Product", headers=sa_headers, timeout=30)
        assert g.status_code == 200
        items = g.json().get("items", [])
        matched = [i for i in items if i["id"] == pid]
        assert matched, "Created product not found in list"
        fetched = matched[0]
        assert fetched["mrp"] == 1500.0
        assert fetched["batch_tracking"] is True
        assert fetched["temperature_class"] == "chilled"

        # Sanity: PATCH price on this product still works (existing API regression)
        u = requests.patch(f"{API}/admin/mart/products/{pid}", headers=sa_headers,
                           json={"price": 1250.0}, timeout=30)
        assert u.status_code == 200
        assert u.json()["price"] == 1250.0

    def test_tax_pct_150_rejected(self, sa_headers):
        payload = {
            "name": f"TEST_BadTax_{uuid.uuid4().hex[:6]}",
            "country": "CI",
            "price": 100.0,
            "currency": "XOF",
            "tax_pct": 150.0,
        }
        r = requests.post(f"{API}/admin/mart/products", headers=sa_headers, json=payload, timeout=30)
        assert r.status_code in (400, 422), f"Expected 4xx, got {r.status_code}: {r.text}"

    def test_list_products_existing_still_works(self, sa_headers):
        r = requests.get(f"{API}/admin/mart/products?country=CI&limit=5", headers=sa_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body


# ---------------------------------------------------------------------------
# Category Requests workflow
# ---------------------------------------------------------------------------

class TestCategoryRequests:
    """Full partner→admin flow: submit, approve, reject, re-approve conflict."""

    _created_ids: list[str] = []

    def test_partner_submit_request(self, partner_headers):
        name = f"TEST_ReqCat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/partner/catalog/category-requests",
                          headers=partner_headers,
                          json={"name": name, "reason": "test"}, timeout=30)
        assert r.status_code == 201, f"{r.status_code} {r.text}"
        data = r.json()
        assert data["status"] == "pending"
        assert data["name"] == name
        TestCategoryRequests._created_ids.append(data["id"])

        # Partner mine list must include the row
        m = requests.get(f"{API}/partner/catalog/category-requests",
                         headers=partner_headers, timeout=30)
        assert m.status_code == 200
        ids = [i["id"] for i in m.json()["items"]]
        assert data["id"] in ids

    def test_sa_pending_bucket_shows_request(self, sa_headers):
        r = requests.get(f"{API}/admin/mart/category-requests?status=pending&country=CI",
                         headers=sa_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "buckets" in body
        assert body["buckets"].get("pending", 0) >= 1
        # Verify at least one of our created ids is in the pending items
        ids = [i["id"] for i in body["items"]]
        assert any(rid in ids for rid in TestCategoryRequests._created_ids)

    def test_sa_approve_creates_category(self, sa_headers, partner_headers):
        # Create a fresh request to approve
        name = f"TEST_ApprCat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/partner/catalog/category-requests",
                          headers=partner_headers,
                          json={"name": name, "reason": "approve me"}, timeout=30)
        assert r.status_code == 201
        req_id = r.json()["id"]
        TestCategoryRequests._created_ids.append(req_id)

        cats_before = requests.get(f"{API}/admin/mart/categories?country=CI",
                                   headers=sa_headers, timeout=30).json()
        n_before = len(cats_before)

        # Approve with icon
        a = requests.post(f"{API}/admin/mart/category-requests/{req_id}/approve",
                          headers=sa_headers, json={"icon": "Snowflake"}, timeout=30)
        assert a.status_code == 200, f"{a.status_code} {a.text}"
        body = a.json()
        assert body["status"] == "approved"
        assert body["approved_category_id"]

        # New mart_categories row exists
        cats_after = requests.get(f"{API}/admin/mart/categories?country=CI",
                                  headers=sa_headers, timeout=30).json()
        assert len(cats_after) == n_before + 1
        new_cat = [c for c in cats_after if c["id"] == body["approved_category_id"]]
        assert new_cat, "Approved category id not present in categories list"
        assert new_cat[0]["icon"] == "Snowflake"

        # Re-approving must 409
        again = requests.post(f"{API}/admin/mart/category-requests/{req_id}/approve",
                              headers=sa_headers, json={}, timeout=30)
        assert again.status_code == 409

    def test_sa_reject_without_notes_400_with_notes_200(self, sa_headers, partner_headers):
        name = f"TEST_RejCat_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/partner/catalog/category-requests",
                          headers=partner_headers,
                          json={"name": name, "reason": "reject me"}, timeout=30)
        assert r.status_code == 201
        req_id = r.json()["id"]
        TestCategoryRequests._created_ids.append(req_id)

        # No notes → 400 (server-side rule)
        bad = requests.post(f"{API}/admin/mart/category-requests/{req_id}/reject",
                            headers=sa_headers, json={}, timeout=30)
        assert bad.status_code == 400, f"Expected 400, got {bad.status_code} {bad.text}"

        # With notes → 200, moves to rejected
        good = requests.post(f"{API}/admin/mart/category-requests/{req_id}/reject",
                             headers=sa_headers, json={"notes": "duplicate of frozen foods"}, timeout=30)
        assert good.status_code == 200
        assert good.json()["status"] == "rejected"

        # Bucket check
        rej = requests.get(f"{API}/admin/mart/category-requests?status=rejected&country=CI",
                          headers=sa_headers, timeout=30).json()
        ids = [i["id"] for i in rej["items"]]
        assert req_id in ids


# ---------------------------------------------------------------------------
# Sanity — inventory endpoints
# ---------------------------------------------------------------------------

class TestInventorySanity:

    def test_admin_inventory_kpis(self, sa_headers):
        r = requests.get(f"{API}/admin/inventory/kpis", headers=sa_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_partner_inventory_list(self, partner_headers):
        r = requests.get(f"{API}/partner/inventory", headers=partner_headers, timeout=30)
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Reservation locking — direct DB / allocate() concurrency
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reservation_race_last_unit_invariant():
    """Two parallel allocate() calls on a 1-unit synthetic PartnerInventory
    must yield exactly one success and one `insufficient_stock` ValueError.
    Post-condition: available_qty >= 0 and available+reserved <= sellable (=1).
    A `reserve` movement with before_qty populated must exist for the winner.
    """
    import sys
    sys.path.insert(0, "/app/backend")

    from sqlalchemy import select, update
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    db_url = (os.environ.get("DATABASE_URL")
              or os.environ.get("SUPABASE_DB_URL")
              or os.environ.get("POSTGRES_URL"))
    if not db_url:
        # Try loading from backend/.env
        try:
            from dotenv import dotenv_values
            env = dotenv_values("/app/backend/.env")
            db_url = env.get("DATABASE_URL") or env.get("SUPABASE_DB_URL") or env.get("POSTGRES_URL")
        except Exception:
            pass
    if not db_url:
        pytest.skip("No DB URL available")

    # asyncpg driver
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(db_url, future=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    from core.models import PartnerInventory, PartnerProduct, PartnerStockMovement
    from modules.mart_partner.allocation import allocate

    # Find an inventory row with a partner_product that has a valid master + warehouse
    async with Session() as s:
        row = (await s.execute(
            select(PartnerInventory).where(PartnerInventory.available_qty >= 1).limit(1)
        )).scalar_one_or_none()
        if not row:
            pytest.skip("No PartnerInventory to test with")
        pp_id = row.partner_product_id
        wh_id = row.warehouse_id
        pp = await s.get(PartnerProduct, pp_id)
        master_id = pp.master_product_id
        # Get partner country
        from core.models import Partner
        partner = await s.get(Partner, pp.partner_id)
        country_code = partner.country
        # Force target row to exactly 1 available, 0 reserved
        await s.execute(update(PartnerInventory).where(PartnerInventory.id == row.id)
                        .values(available_qty=1, reserved_qty=0))
        await s.execute(update(PartnerProduct).where(PartnerProduct.id == pp_id)
                        .values(stock_qty=1))
        # Force ALL OTHER PartnerProduct rows serving the same master to zero
        # stock so both racers must contend on this single unit (real race).
        await s.execute(update(PartnerProduct).where(
            PartnerProduct.master_product_id == master_id,
            PartnerProduct.id != pp_id,
        ).values(stock_qty=0))
        # Also zero their inventory rows so allocation can't pick them via the
        # PartnerInventory re-read either.
        other_pp_ids = (await s.execute(
            select(PartnerProduct.id).where(
                PartnerProduct.master_product_id == master_id,
                PartnerProduct.id != pp_id,
            )
        )).scalars().all()
        if other_pp_ids:
            await s.execute(update(PartnerInventory).where(
                PartnerInventory.partner_product_id.in_(other_pp_ids),
            ).values(available_qty=0, reserved_qty=0))
        await s.commit()

    # Two concurrent tasks each opening their own session
    async def one_alloc():
        async with Session() as sess:
            try:
                plan = await allocate(
                    sess,
                    cart_lines=[{"master_product_id": master_id, "quantity": 1}],
                    country=country_code,
                    module="mart",
                    lock_stock=True,
                )
                await sess.commit()
                return ("ok", plan.fulfillable, None)
            except ValueError as e:
                await sess.rollback()
                return ("value_error", None, str(e))
            except Exception as e:
                await sess.rollback()
                return ("other", None, f"{type(e).__name__}:{e}")

    results = await asyncio.gather(one_alloc(), one_alloc(), return_exceptions=True)
    print("RACE RESULTS:", results)

    # Analyse
    ok_count = 0
    stock_err_count = 0
    for res in results:
        if isinstance(res, tuple):
            kind, fulfil, err = res
            if kind == "ok" and fulfil:
                ok_count += 1
            elif kind == "ok" and fulfil is False:
                # Fulfillable=False means allocate returned unfulfillable —
                # counts as a "loser" (didn't grab the unit)
                stock_err_count += 1
            elif kind == "value_error" and err and "insufficient_stock" in err:
                stock_err_count += 1
            else:
                print("Unexpected outcome:", res)

    assert ok_count == 1, f"Expected exactly 1 winner, got {ok_count} (results={results})"
    assert stock_err_count == 1, f"Expected exactly 1 loser, got {stock_err_count} (results={results})"

    # Invariant + movement check
    async with Session() as s:
        inv = (await s.execute(
            select(PartnerInventory).where(PartnerInventory.id == row.id)
        )).scalar_one()
        assert inv.available_qty >= 0, f"available_qty went negative: {inv.available_qty}"
        assert inv.available_qty + inv.reserved_qty <= 1, (
            f"invariant violated: available={inv.available_qty} reserved={inv.reserved_qty}"
        )
        # reserve movement written with before_qty populated
        movs = (await s.execute(
            select(PartnerStockMovement).where(
                PartnerStockMovement.partner_product_id == pp_id,
                PartnerStockMovement.kind == "reserve",
            ).order_by(PartnerStockMovement.created_at.desc()).limit(3)
        )).scalars().all()
        assert movs, "No reserve movement recorded for winning allocation"
        latest = movs[0]
        assert latest.delta_qty == -1
        assert latest.before_qty is not None
        assert latest.before_qty == 1

    await engine.dispose()
