"""Vendor commission + payout settlement (Phase P0 Partner Wallet).

Covers:
  * Super Admin sets a per-vendor commission rate; history row is created and
    becomes the "current" row.
  * A delivered order snapshots the active rate and credits the restaurant
    wallet with the vendor net.
  * Commission rate changes do NOT recalculate historical orders.
  * Super Admin configures the payout schedule, pauses + resumes.
  * Payout generation bundles unsettled orders; mark-paid debits the wallet
    and flips order rows to settlement_status='paid'.
  * Partner can read summary / transactions / payouts but has no admin
    endpoints exposed.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import uuid

import pytest
import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
DB_URL   = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _admin():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"},
                      timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _partner_token():
    r = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                      json={"email": "qa-burger@test.example", "password": "QaBurger123!"},
                      timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _db_exec(sql, **params):
    engine = create_async_engine(DB_URL, future=True)
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), params)
        rows = r.fetchall() if r.returns_rows else []
    await engine.dispose()
    return rows


async def _seed_delivered_order(restaurant_id: str, grand_total: float,
                                 delivery_fee: float = 0, tax: float = 0) -> str:
    oid = f"ford_{uuid.uuid4().hex[:12]}"
    await _db_exec("""
        INSERT INTO food_orders (id, order_number, restaurant_id, country,
            order_type, status, placed_at, delivered_at, currency,
            subtotal, delivery_fee, tax, grand_total, payment_method, payment_status)
        VALUES (:id, :n, :rid, 'CI', 'delivery', 'delivered',
                now() - interval '30 minutes', now() - interval '1 minute',
                'XOF', :sub, :df, :t, :gt, 'cod', 'paid')
    """, id=oid, n=f"TST{uuid.uuid4().hex[:6].upper()}", rid=restaurant_id,
         sub=grand_total - delivery_fee - tax, df=delivery_fee, t=tax, gt=grand_total)
    return oid


# ---------------------------------------------------------------------------
# Commission editor
# ---------------------------------------------------------------------------
def test_admin_sets_and_reads_commission_history():
    atok = _admin()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                      headers=h, json={"rate_percent": 12.5, "note": "Opening deal"}, timeout=10)
    assert r.status_code == 200, r.text

    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                     headers=h, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["current"]["rate_percent"] in (12.5, "12.500", 12.500)
    assert body["history"]
    # Second update closes the first row and adds a new current.
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                      headers=h, json={"rate_percent": 15, "note": "Renegotiated"}, timeout=10)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                     headers=h, timeout=10)
    body = r.json()
    assert float(body["current"]["rate_percent"]) == 15
    assert len(body["history"]) >= 2


# ---------------------------------------------------------------------------
# Order delivery → wallet credit, rate snapshot preserved on later change
# ---------------------------------------------------------------------------
def test_delivery_credits_wallet_and_snapshots_rate():
    atok = _admin()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}
    # Ensure a known rate
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                  headers=h, json={"rate_percent": 10}, timeout=10)

    # Call the settlement hook directly on a freshly-seeded order.
    async def _run_hook():
        from modules.vendor_settlement import settle_order_on_delivery
        from core.db import SessionLocal
        oid = await _seed_delivered_order("burger_hub_ci", 5000, delivery_fee=500)
        async with SessionLocal() as s:
            r = await settle_order_on_delivery(s, oid)
            await s.commit()
        return oid, r
    oid, res = _run(_run_hook())
    assert res["ok"]
    # Commissionable = 4500, 10% commission = 450, net = 4050
    assert res["commission"] == 450
    assert res["vendor_net"] == 4050

    # Now change the rate — the already-delivered order must NOT recalculate.
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                  headers=h, json={"rate_percent": 25}, timeout=10)
    rows = _run(_db_exec(
        "SELECT commission_rate_snapshot, commission_amount, vendor_net_amount "
        "FROM food_orders WHERE id = :id", id=oid))
    assert float(rows[0].commission_rate_snapshot) == 10
    assert float(rows[0].commission_amount) == 450


# ---------------------------------------------------------------------------
# Partner read-only summary
# ---------------------------------------------------------------------------
def test_partner_summary_shows_commission_and_schedule():
    atok = _admin()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                  headers=h, json={"rate_percent": 14}, timeout=10)
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/payout-config",
                  headers=h, json={"schedule_type": "weekly",
                                   "schedule_cfg": {"weekday": 3, "time_hhmm": "19:00"},
                                   "min_payout_amount": 10000}, timeout=10)
    ptok = _partner_token()
    r = requests.get(f"{BASE_URL}/api/food/partner/wallet/summary",
                     headers={"Authorization": f"Bearer {ptok}"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["commission_rate"] == 14
    assert body["payout_schedule"]["type"] == "weekly"
    assert body["payout_schedule"]["is_paused"] is False


# ---------------------------------------------------------------------------
# Pause / resume
# ---------------------------------------------------------------------------
def test_pause_and_resume_payouts():
    atok = _admin()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/payouts/pause",
                  headers=h, json={"reason": "KYC review"}, timeout=10)
    ptok = _partner_token()
    r = requests.get(f"{BASE_URL}/api/food/partner/wallet/summary",
                     headers={"Authorization": f"Bearer {ptok}"}, timeout=10).json()
    assert r["payout_schedule"]["is_paused"] is True

    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/payouts/resume",
                  headers=h, timeout=10)
    r = requests.get(f"{BASE_URL}/api/food/partner/wallet/summary",
                     headers={"Authorization": f"Bearer {ptok}"}, timeout=10).json()
    assert r["payout_schedule"]["is_paused"] is False


# ---------------------------------------------------------------------------
# Payout generation + mark-paid
# ---------------------------------------------------------------------------
def test_generate_and_pay_a_payout():
    atok = _admin()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                  headers=h, json={"rate_percent": 10}, timeout=10)

    async def _seed_and_settle():
        from modules.vendor_settlement import settle_order_on_delivery
        engine = create_async_engine(DB_URL, future=True)
        oid = f"ford_{uuid.uuid4().hex[:12]}"
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO food_orders (id, order_number, restaurant_id, country,
                    order_type, status, placed_at, delivered_at, currency,
                    subtotal, delivery_fee, tax, grand_total, payment_method, payment_status)
                VALUES (:id, :n, 'burger_hub_ci', 'CI', 'delivery', 'delivered',
                        now() - interval '30 minutes', now() - interval '1 minute',
                        'XOF', 3000, 0, 0, 3000, 'cod', 'paid')
            """), {"id": oid, "n": f"TST{uuid.uuid4().hex[:6].upper()}"})
        from sqlalchemy.ext.asyncio import async_sessionmaker
        SessionFactory = async_sessionmaker(engine, expire_on_commit=False)
        async with SessionFactory() as s:
            await settle_order_on_delivery(s, oid)
            await s.commit()
        async with engine.begin() as conn:
            row = (await conn.execute(text(
                "SELECT settlement_status FROM food_orders WHERE id = :id"
            ), {"id": oid})).fetchone()
        await engine.dispose()
        return oid, row.settlement_status
    oid, after_settle = _run(_seed_and_settle())
    assert after_settle == "unsettled"

    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/payouts/generate",
                      headers=h, json={}, timeout=10)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert float(r.json()["gross"]) >= 3000

    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/payouts",
                     headers=h, params={"restaurant_id": "burger_hub_ci",
                                        "status": "scheduled"}, timeout=10).json()
    assert any(p["id"] == pid for p in r["items"])

    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/payouts/{pid}/mark-paid",
                      headers=h, json={"reference": "MOMO-TEST-1"}, timeout=10)
    assert r.status_code == 200 and r.json()["status"] == "paid"

    rows = _run(_db_exec(
        "SELECT settlement_status FROM food_orders WHERE id = :id", id=oid))
    assert rows[0].settlement_status == "paid"


# ---------------------------------------------------------------------------
# Partner cannot hit admin endpoints
# ---------------------------------------------------------------------------
def test_partner_cannot_change_commission():
    ptok = _partner_token()
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/burger_hub_ci/commission",
                      headers={"Authorization": f"Bearer {ptok}"},
                      json={"rate_percent": 1}, timeout=10)
    assert r.status_code in (401, 403)
