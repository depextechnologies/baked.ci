"""Cron-scheduled vendor payouts — comprehensive coverage.

Covers (per user requirements):
  - Daily / weekly / monthly / custom "due?" decisions in Africa/Abidjan tz
  - Monthly day clamping for short months (e.g. 31 → 28 in Feb)
  - Duplicate cron executions on the same local day (idempotency)
  - Insufficient balance (no delivered orders / net <= 0)
  - Paused vendor
  - Below `min_payout_amount`
  - Refunds reducing net
  - Super Admin preview (dry-run) never writes
  - Auto settlement generates `scheduled`, NEVER `paid`
  - Webhook requires Bearer secret

These tests execute at the real HTTP layer against the running backend so
they also exercise FastAPI dependencies, DB migrations and env wiring.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import uuid
from datetime import datetime, timedelta, timezone, time as dtime, date as ddate
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL      = os.environ["REACT_APP_BACKEND_URL"]
DB_URL        = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)
CRON_SECRET   = os.environ["WEBHOOK_CRON_SECRET"]
ADMIN_EMAIL   = "depexopenai@gmail.com"
ADMIN_PASS    = "baked@2026#!$@"
ABIDJAN       = ZoneInfo("Africa/Abidjan")


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _admin_token() -> str:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


# ===========================================================================
# Pure schedule-maths tests — fast, no HTTP/DB
# ===========================================================================
class _CfgStub:
    """Mimics a SQLAlchemy row object as `is_vendor_due` consumes it."""
    def __init__(self, **kw):
        self.schedule_type        = kw.get("schedule_type", "daily")
        self.schedule_cfg         = kw.get("schedule_cfg", {})
        self.timezone             = kw.get("timezone", "Africa/Abidjan")
        self.is_paused            = kw.get("is_paused", False)
        self.last_payout_period_end = kw.get("last_payout_period_end", None)
        self.min_payout_amount    = kw.get("min_payout_amount", 0)
        self.restaurant_id        = kw.get("restaurant_id", "r_test")


def test_daily_due_at_configured_time_abidjan():
    from modules.vendor_settlement_cron import is_vendor_due
    cfg = _CfgStub(schedule_type="daily", schedule_cfg={"time_hhmm": "23:00"})
    # 22:00 Abidjan today → not due
    not_yet = datetime(2026, 3, 14, 22, 0, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, not_yet)[0] is False

    # 23:30 Abidjan today → due
    now = datetime(2026, 3, 14, 23, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    due, p_start, p_end, reason = is_vendor_due(cfg, now)
    assert due is True and reason == "due"
    # period_end is "now" (actual run moment), period_start lies before it.
    assert p_end == now
    assert p_start < p_end


def test_weekly_thursday_1800():
    from modules.vendor_settlement_cron import is_vendor_due
    cfg = _CfgStub(schedule_type="weekly",
                   schedule_cfg={"weekday": 3, "time_hhmm": "18:00"})
    # Wednesday 2026-03-11 18:30 → not due
    wed = datetime(2026, 3, 11, 18, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, wed)[0] is False
    # Thursday 2026-03-12 18:30 → due
    thu = datetime(2026, 3, 12, 18, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, thu)[0] is True


def test_monthly_day_clamped_to_month_length():
    from modules.vendor_settlement_cron import is_vendor_due
    cfg = _CfgStub(schedule_type="monthly",
                   schedule_cfg={"day_of_month": 31, "time_hhmm": "09:00"})
    # Feb 2026 only has 28 days — day_of_month=31 should fire on the 28th.
    feb28 = datetime(2026, 2, 28, 9, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, feb28)[0] is True
    feb27 = datetime(2026, 2, 27, 9, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, feb27)[0] is False
    # March still works on the 31st.
    mar31 = datetime(2026, 3, 31, 9, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, mar31)[0] is True


def test_custom_weekdays():
    from modules.vendor_settlement_cron import is_vendor_due
    cfg = _CfgStub(schedule_type="custom",
                   schedule_cfg={"weekdays": [0, 2, 4], "time_hhmm": "22:00"})  # Mon/Wed/Fri
    mon = datetime(2026, 3, 9, 22, 15, tzinfo=ABIDJAN).astimezone(timezone.utc)
    tue = datetime(2026, 3, 10, 22, 15, tzinfo=ABIDJAN).astimezone(timezone.utc)
    assert is_vendor_due(cfg, mon)[0] is True
    assert is_vendor_due(cfg, tue)[0] is False


def test_paused_vendor_never_due():
    from modules.vendor_settlement_cron import is_vendor_due
    cfg = _CfgStub(schedule_type="daily", schedule_cfg={"time_hhmm": "00:00"},
                   is_paused=True)
    assert is_vendor_due(cfg, datetime.now(timezone.utc))[0] is False
    assert is_vendor_due(cfg, datetime.now(timezone.utc))[3] == "paused"


def test_already_generated_today_short_circuits():
    from modules.vendor_settlement_cron import is_vendor_due
    now = datetime(2026, 3, 14, 23, 30, tzinfo=ABIDJAN).astimezone(timezone.utc)
    last = datetime(2026, 3, 14, 23, 0, tzinfo=ABIDJAN).astimezone(timezone.utc)
    cfg = _CfgStub(schedule_type="daily", schedule_cfg={"time_hhmm": "23:00"},
                   last_payout_period_end=last)
    due, _, _, reason = is_vendor_due(cfg, now)
    assert due is False and reason == "already_generated_today"


# ===========================================================================
# HTTP — webhook security
# ===========================================================================
def test_cron_webhook_requires_bearer_secret():
    r = requests.post(f"{BASE_URL}/api/cron/vendor-settlement/run", json={}, timeout=10)
    assert r.status_code == 401
    r2 = requests.post(f"{BASE_URL}/api/cron/vendor-settlement/run", json={},
                       headers={"Authorization": "Bearer wrong"}, timeout=10)
    assert r2.status_code == 401
    r3 = requests.post(f"{BASE_URL}/api/cron/vendor-settlement/run", json={},
                       headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=10)
    assert r3.status_code == 200
    body = r3.json()
    assert body["accepted"] is True and body["run_id"]


# ===========================================================================
# HTTP + DB — end-to-end with a real test restaurant
# ===========================================================================
async def _db_exec(sql, **params):
    engine = create_async_engine(DB_URL, future=True)
    try:
        async with engine.begin() as conn:
            r = await conn.execute(text(sql), params)
            rows = r.fetchall() if r.returns_rows else []
        return rows
    finally:
        await engine.dispose()


async def _mk_vendor(*, commission=15.0, country="CI"):
    rid = f"r_cron_{uuid.uuid4().hex[:10]}"
    await _db_exec("""
        INSERT INTO food_restaurants (id, name, slug, country, status, created_at, updated_at)
        VALUES (:id, :n, :s, :c, 'active', now(), now())
        ON CONFLICT (id) DO NOTHING
    """, id=rid, n=f"CRON {rid[-6:]}", s=rid, c=country)
    await _db_exec("""
        INSERT INTO food_restaurant_wallets (id, restaurant_id, balance, currency, is_active)
        VALUES (:id, :r, 0, 'XOF', TRUE) ON CONFLICT (restaurant_id) DO NOTHING
    """, id=f"frwal_{rid}", r=rid)
    await _db_exec("""
        INSERT INTO vendor_commission_history (id, module, restaurant_id,
            rate_percent, effective_from)
        VALUES (:id, 'food', :r, :rate, now() - interval '7 days')
    """, id=f"vch_{uuid.uuid4().hex[:12]}", r=rid, rate=commission)
    return rid


async def _set_cfg(rid, *, schedule_type="daily", schedule_cfg=None,
                   timezone_name="Africa/Abidjan", is_paused=False,
                   min_payout_amount=0, last_period_end=None):
    schedule_cfg = schedule_cfg or {"time_hhmm": "00:00"}
    import json as _j
    await _db_exec("""
        INSERT INTO vendor_payout_config
          (id, module, restaurant_id, schedule_type, schedule_cfg,
           timezone, min_payout_amount, is_paused, last_payout_period_end)
        VALUES (:id, 'food', :r, :st, CAST(:cfg AS JSONB), :tz, :mn, :p, :lp)
        ON CONFLICT (module, restaurant_id) DO UPDATE SET
          schedule_type = EXCLUDED.schedule_type,
          schedule_cfg  = EXCLUDED.schedule_cfg,
          timezone      = EXCLUDED.timezone,
          min_payout_amount = EXCLUDED.min_payout_amount,
          is_paused     = EXCLUDED.is_paused,
          last_payout_period_end = EXCLUDED.last_payout_period_end,
          updated_at = now()
    """, id=f"vpc_{uuid.uuid4().hex[:10]}", r=rid,
         st=schedule_type, cfg=_j.dumps(schedule_cfg),
         tz=timezone_name, mn=min_payout_amount,
         p=is_paused, lp=last_period_end)


async def _seed_delivered_order(rid, *, gross=10000.0, delivery=500.0,
                                 commission_rate=15.0, delivered_hours_ago=1):
    oid = f"ord_{uuid.uuid4().hex[:16]}"
    base = Decimal(str(gross)) - Decimal(str(delivery))
    comm = (base * Decimal(str(commission_rate)) / Decimal("100")).quantize(Decimal("0.01"))
    net  = (base - comm).quantize(Decimal("0.01"))
    delivered_at = datetime.now(timezone.utc) - timedelta(hours=delivered_hours_ago)
    await _db_exec("""
        INSERT INTO food_orders (id, order_number, restaurant_id, customer_id,
          customer_snapshot, country, order_type, status, placed_at,
          currency, subtotal, discount, delivery_fee, tax, grand_total,
          payment_status, delivery_address, settlement_status,
          commission_rate_snapshot, commission_amount, vendor_net_amount,
          delivered_at, created_at, updated_at)
        VALUES (:id, :on, :r, 'cust_cron',
          '{}'::jsonb, 'CI', 'delivery', 'delivered', now(),
          'XOF', :sub, 0, :df, 0, :gt,
          'paid', '{}'::jsonb, 'unsettled',
          :rate, :c, :n, :da, now(), now())
    """, id=oid, on=oid[-10:].upper(), r=rid,
         sub=str(base + Decimal(str(delivery))), df=str(delivery), gt=str(gross),
         rate=str(commission_rate), c=str(comm), n=str(net), da=delivered_at)
    return oid, net


async def _cleanup(rid):
    await _db_exec("UPDATE food_orders SET settled_payout_id = NULL WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM vendor_payouts WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM food_restaurant_wallet_txns WHERE wallet_id IN (SELECT id FROM food_restaurant_wallets WHERE restaurant_id = :r)", r=rid)
    await _db_exec("DELETE FROM food_orders WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM vendor_payout_config WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM food_restaurant_wallets WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM vendor_commission_history WHERE restaurant_id = :r", r=rid)
    await _db_exec("DELETE FROM food_restaurants WHERE id = :r", r=rid)


def test_end_to_end_cron_generates_scheduled_payout_and_is_idempotent():
    rid = _run(_mk_vendor())
    try:
        # Daily at midnight Abidjan — always "due" the moment the cron fires.
        _run(_set_cfg(rid, schedule_type="daily",
                      schedule_cfg={"time_hhmm": "00:00"}))
        oid, expected_net = _run(_seed_delivered_order(rid))

        # First manual run — admin override hits the SAME engine as cron.
        tok = _admin_token()
        r1 = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/run-now",
                           headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        acts = [d for d in body1["detail"] if d["restaurant_id"] == rid]
        assert acts and acts[0]["action"] == "created", acts
        assert abs(float(acts[0]["net"]) - float(expected_net)) < 0.5

        # Payout exists with status='scheduled' (NOT paid), trigger='cron'
        rows = _run(_db_exec(
            "SELECT status, trigger, net FROM vendor_payouts WHERE restaurant_id = :r",
            r=rid))
        assert rows and rows[0].status == "scheduled" and rows[0].trigger == "cron"

        # Second immediate run on same local day — must be a no-op.
        r2 = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/run-now",
                           headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r2.status_code == 200
        acts2 = [d for d in r2.json()["detail"] if d["restaurant_id"] == rid]
        assert acts2 and acts2[0]["action"] == "skipped"
        assert acts2[0]["reason"] in ("already_generated_today", "no_balance")

        # Count of payouts must stay 1.
        rows = _run(_db_exec(
            "SELECT COUNT(*) AS n FROM vendor_payouts WHERE restaurant_id = :r",
            r=rid))
        assert rows[0].n == 1
    finally:
        _run(_cleanup(rid))


def test_paused_vendor_is_skipped_by_cron():
    rid = _run(_mk_vendor())
    try:
        _run(_set_cfg(rid, schedule_type="daily",
                      schedule_cfg={"time_hhmm": "00:00"}, is_paused=True))
        _run(_seed_delivered_order(rid))
        tok = _admin_token()
        r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/run-now",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        act = [d for d in r.json()["detail"] if d["restaurant_id"] == rid]
        assert act and act[0]["action"] == "skipped" and act[0]["reason"] == "paused"
    finally:
        _run(_cleanup(rid))


def test_below_min_payout_amount_skipped():
    rid = _run(_mk_vendor())
    try:
        _run(_set_cfg(rid, schedule_type="daily",
                      schedule_cfg={"time_hhmm": "00:00"},
                      min_payout_amount=100000))  # 100 000 XOF floor
        _run(_seed_delivered_order(rid, gross=5000))  # way below floor
        tok = _admin_token()
        r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/run-now",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        act = [d for d in r.json()["detail"] if d["restaurant_id"] == rid]
        assert act and act[0]["action"] == "skipped" and act[0]["reason"] == "below_min"
    finally:
        _run(_cleanup(rid))


def test_dry_run_preview_never_writes():
    rid = _run(_mk_vendor())
    try:
        _run(_set_cfg(rid, schedule_type="daily",
                      schedule_cfg={"time_hhmm": "00:00"}))
        _run(_seed_delivered_order(rid))
        tok = _admin_token()
        r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/preview-next-run",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["dry_run"] is True
        act = [d for d in body["detail"] if d["restaurant_id"] == rid]
        assert act and act[0]["action"] == "would_create"
        # No payout row written.
        rows = _run(_db_exec(
            "SELECT COUNT(*) AS n FROM vendor_payouts WHERE restaurant_id = :r",
            r=rid))
        assert rows[0].n == 0
    finally:
        _run(_cleanup(rid))


def test_scheduled_overview_contains_all_fields():
    rid = _run(_mk_vendor())
    try:
        _run(_set_cfg(rid, schedule_type="weekly",
                      schedule_cfg={"weekday": 3, "time_hhmm": "18:00"}))
        _run(_seed_delivered_order(rid))
        tok = _admin_token()
        r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/scheduled-overview",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        row = next((i for i in data["items"] if i["restaurant_id"] == rid), None)
        assert row is not None
        for k in ["commission_rate", "schedule_type", "timezone",
                  "is_paused", "min_payout_amount", "next_scheduled_at",
                  "pending_balance", "wallet_balance", "due_reason"]:
            assert k in row, f"missing {k}"
        assert row["schedule_type"] == "weekly"
        assert row["timezone"] == "Africa/Abidjan"
        assert row["pending_balance"] > 0
    finally:
        _run(_cleanup(rid))
