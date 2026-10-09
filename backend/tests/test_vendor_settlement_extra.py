"""Additional coverage for Phase P0 Partner Wallet.

Covers:
  * commission history row has effective_until closed on new rate (DB check).
  * payout-config upsert persists schedule_cfg JSON + method/destination/min.
  * Hold / Release transitions on vendor_payouts.
  * Partner read endpoints work with partner JWT.
  * Partner is forbidden on admin POST endpoints.
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
RID      = "burger_hub_ci"


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _admin_token():
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


async def _fetch(sql, **p):
    engine = create_async_engine(DB_URL, future=True)
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), p)
        rows = r.fetchall()
    await engine.dispose()
    return rows


# -----------------------------------------------------------------------
def test_commission_history_row_closes_previous_effective_until():
    atok = _admin_token()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

    # Set rate A, then rate B — the previous row must have effective_until set to new effective_from
    r1 = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/commission",
                       headers=h, json={"rate_percent": 11, "note": "first"}, timeout=10)
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/commission",
                       headers=h, json={"rate_percent": 13, "note": "second"}, timeout=10)
    assert r2.status_code == 200
    new_eff = r2.json()["effective_from"]

    # Pull the previous row (the 11% one) and check effective_until == new_eff
    rows = _run(_fetch(
        """SELECT rate_percent, effective_from, effective_until FROM vendor_commission_history
            WHERE module = 'food' AND restaurant_id = :r
            ORDER BY effective_from DESC""",
        r=RID))
    assert len(rows) >= 2
    # row[0] is the current (effective_until IS NULL)
    assert rows[0].effective_until is None
    # row[1] (previous) must have effective_until set and equal to new effective_from
    assert rows[1].effective_until is not None
    # tolerant comparison (both are datetimes in DB, ISO string in response)
    assert rows[1].effective_until.isoformat().startswith(new_eff[:19])


# -----------------------------------------------------------------------
def test_payout_config_upsert_persists_cfg_json_and_min():
    atok = _admin_token()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

    payload = {"schedule_type": "weekly",
               "schedule_cfg": {"weekday": 3, "time_hhmm": "19:00"},
               "payout_method": "momo",
               "payout_destination": "+2250700000000",
               "min_payout_amount": 15000}
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/payout-config",
                      headers=h, json=payload, timeout=10)
    assert r.status_code == 200, r.text

    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/payout-config",
                     headers=h, timeout=10)
    assert r.status_code == 200
    body = r.json()["config"]
    assert body["schedule_type"] == "weekly"
    cfg = body["schedule_cfg"]
    # schedule_cfg may be returned as dict or JSON string depending on serializer
    if isinstance(cfg, str):
        import json as _j
        cfg = _j.loads(cfg)
    assert cfg["weekday"] == 3
    assert cfg["time_hhmm"] == "19:00"
    assert body["payout_method"] == "momo"
    assert body["payout_destination"] == "+2250700000000"
    assert float(body["min_payout_amount"]) == 15000

    # Upsert again with different values — must UPDATE not duplicate
    payload2 = dict(payload, min_payout_amount=20000, payout_method="bank")
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/payout-config",
                      headers=h, json=payload2, timeout=10)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/payout-config",
                     headers=h, timeout=10).json()
    assert float(r["config"]["min_payout_amount"]) == 20000
    assert r["config"]["payout_method"] == "bank"


# -----------------------------------------------------------------------
def test_hold_and_release_payout_transitions():
    atok = _admin_token()
    h = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

    # seed a delivered order so we have something to bundle
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/commission",
                  headers=h, json={"rate_percent": 10}, timeout=10)

    async def _seed_and_settle():
        from modules.vendor_settlement import settle_order_on_delivery
        from sqlalchemy.ext.asyncio import async_sessionmaker
        engine = create_async_engine(DB_URL, future=True)
        oid = f"ford_{uuid.uuid4().hex[:12]}"
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO food_orders (id, order_number, restaurant_id, country,
                    order_type, status, placed_at, delivered_at, currency,
                    subtotal, delivery_fee, tax, grand_total, payment_method, payment_status)
                VALUES (:id, :n, :r, 'CI', 'delivery', 'delivered',
                        now() - interval '20 minutes', now() - interval '1 minute',
                        'XOF', 2000, 0, 0, 2000, 'cod', 'paid')
            """), {"id": oid, "n": f"TST{uuid.uuid4().hex[:6].upper()}", "r": RID})
        SF = async_sessionmaker(engine, expire_on_commit=False)
        async with SF() as s:
            await settle_order_on_delivery(s, oid)
            await s.commit()
        await engine.dispose()
        return oid
    _run(_seed_and_settle())

    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/payouts/generate",
                      headers=h, json={}, timeout=10)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    # HOLD
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/payouts/{pid}/hold",
                      headers=h, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "hold"

    # Verify it shows under status=hold
    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/payouts",
                     headers=h, params={"restaurant_id": RID, "status": "hold"}, timeout=10).json()
    assert any(p["id"] == pid for p in r["items"])

    # RELEASE back to scheduled
    r = requests.post(f"{BASE_URL}/api/admin/vendor-settlement/payouts/{pid}/release",
                      headers=h, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] in ("scheduled", "ok")
    r = requests.get(f"{BASE_URL}/api/admin/vendor-settlement/payouts",
                     headers=h, params={"restaurant_id": RID, "status": "scheduled"}, timeout=10).json()
    assert any(p["id"] == pid for p in r["items"])


# -----------------------------------------------------------------------
def test_partner_read_only_endpoints_with_jwt():
    ptok = _partner_token()
    h = {"Authorization": f"Bearer {ptok}"}
    for path in ["summary", "transactions", "payouts", "commission-history"]:
        r = requests.get(f"{BASE_URL}/api/food/partner/wallet/{path}", headers=h, timeout=10)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text}"


# -----------------------------------------------------------------------
def test_partner_forbidden_on_admin_endpoints():
    ptok = _partner_token()
    h = {"Authorization": f"Bearer {ptok}", "Content-Type": "application/json"}

    probes = [
        ("POST", f"/api/admin/vendor-settlement/food/{RID}/commission",
         {"rate_percent": 1}),
        ("POST", f"/api/admin/vendor-settlement/food/{RID}/payout-config",
         {"schedule_type": "daily", "schedule_cfg": {}}),
        ("POST", f"/api/admin/vendor-settlement/food/{RID}/payouts/pause", {}),
        ("POST", f"/api/admin/vendor-settlement/food/{RID}/payouts/resume", {}),
        ("POST", f"/api/admin/vendor-settlement/food/{RID}/payouts/generate", {}),
    ]
    for method, url, body in probes:
        r = requests.request(method, f"{BASE_URL}{url}", headers=h, json=body, timeout=10)
        assert r.status_code in (401, 403), f"{url} => {r.status_code}: {r.text[:200]}"


# -----------------------------------------------------------------------
def test_refund_debits_partner_wallet():
    """Create a FOOD order, submit a return < threshold → auto-approve + wallet refund"""
    atok = _admin_token()
    ptok = _partner_token()
    h_admin = {"Authorization": f"Bearer {atok}", "Content-Type": "application/json"}

    # Ensure rate is set
    requests.post(f"{BASE_URL}/api/admin/vendor-settlement/food/{RID}/commission",
                  headers=h_admin, json={"rate_percent": 10}, timeout=10)

    # dev-OTP customer (matches test_returns_refunds pattern)
    import random
    phone = "0" + "".join(str(random.randint(0, 9)) for _ in range(9))
    r = requests.post(f"{BASE_URL}/api/auth/otp/request",
                      json={"country_code": "+225", "phone": phone}, timeout=10).json()
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"challenge_id": r["challenge_id"], "code": r["dev_code"]},
                      timeout=10).json()
    ctok = v["access_token"]
    cuid = requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {ctok}"}, timeout=10).json()["id"]

    # Seed a recently delivered food order owned by this customer
    async def _seed():
        from datetime import datetime, timedelta, timezone
        engine = create_async_engine(DB_URL, future=True)
        oid = f"ford_{uuid.uuid4().hex[:12]}"
        iid = f"foit_{uuid.uuid4().hex[:12]}"
        delivered = datetime.now(timezone.utc) - timedelta(minutes=10)
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO food_orders (id, order_number, customer_id, restaurant_id, country,
                    order_type, status, placed_at, accepted_at, ready_at, delivered_at, currency,
                    subtotal, delivery_fee, tax, grand_total, payment_method, payment_status)
                VALUES (:id, :n, :cid, :r, 'CI', 'delivery', 'delivered',
                        :p, :p, :p, :d, 'XOF', 1500, 0, 0, 1500, 'cod', 'paid')
            """), {"id": oid, "n": f"TEST{uuid.uuid4().hex[:6].upper()}",
                   "cid": cuid, "r": RID,
                   "p": delivered - timedelta(minutes=30), "d": delivered})
            await conn.execute(text("""
                INSERT INTO food_order_items (id, order_id, menu_item_id, item_name_snapshot,
                                              quantity, unit_price, line_total)
                VALUES (:id, :oid, 'menu_x', 'Test dish', 1, 1500, 1500)
            """), {"id": iid, "oid": oid})
        await engine.dispose()
        return oid, iid
    oid, iid = _run(_seed())

    # Snapshot wallet balance before refund (via DB because API 'balance' may be eligible-net)
    async def _bal():
        rows = await _fetch(
            "SELECT COALESCE(balance,0) AS b FROM food_restaurant_wallets WHERE restaurant_id = :r",
            r=RID)
        return float(rows[0].b) if rows else 0.0
    before = _run(_bal())

    # Submit return — correct payload shape (matches test_returns_refunds)
    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {ctok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "missing_item",
                            "refund_destination": "wallet"},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    rid_ret = body.get("id") or body.get("return_id")
    status = body.get("status")
    assert body.get("auto_approved") is True, f"not auto-approved: {body}"
    assert status in ("approved", "refunded", "partial_approved"), body

    # Check partner wallet got a kind='refund' debit for the approved amount
    txns = requests.get(f"{BASE_URL}/api/food/partner/wallet/transactions",
                        headers={"Authorization": f"Bearer {ptok}"}, timeout=10).json()
    refund_txns = [t for t in txns["items"]
                   if t.get("kind") == "refund" and (
                       t.get("reference") == rid_ret or
                       rid_ret in (t.get("description") or ""))]
    assert refund_txns, f"No kind='refund' txn with ref {rid_ret}; recent: {txns['items'][:3]}"
    approved = float(body.get("approved_amount") or 1500)
    amt = abs(float(refund_txns[0]["amount"]))
    assert amt == approved, f"Expected {approved} debit, got {amt}"
    after = _run(_bal())
    assert round(before - after, 2) == approved, f"before={before} after={after}"
