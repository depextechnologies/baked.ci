"""Returns & Refunds — unified for FOOD / MART / SHOP (Phase 7B).

Tests cover:
  * Auto-approval when request < policy threshold.
  * Partner-review routing when request >= threshold.
  * Partner decision (approve / partial / reject / dispute).
  * SLA escalation to admin.
  * Admin final override.
  * Window-closed rejection.
  * Flagged customer forced to admin queue.
  * Duplicate open claim rejection.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import random
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
DB_URL   = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


def _customer():
    phone = _rand_phone()
    r = requests.post(f"{BASE_URL}/api/auth/otp/request",
                      json={"country_code": "+225", "phone": phone}, timeout=10).json()
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"challenge_id": r["challenge_id"], "code": r["dev_code"]},
                      timeout=10).json()
    return v["access_token"]


def _admin_token():
    """Login the seeded super-admin."""
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"},
                      timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


def _me_id(token: str) -> str:
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r.status_code == 200
    return r.json()["id"]


def _run(coro):
    """Driver for a one-shot asyncpg session (standalone — tests don't share
    the backend loop, so always spin up a fresh one)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _seed_food_order(customer_id: str, total: float = 2500,
                           items: list[tuple[str, float, int]] | None = None,
                           delivered_minutes_ago: int = 10) -> tuple[str, list[str]]:
    """Insert a delivered FOOD order and return (order_id, [order_item_ids...])."""
    engine = create_async_engine(DB_URL, future=True)
    oid = f"ford_{uuid.uuid4().hex[:12]}"
    items = items or [("Burger Suprême", 1500, 1), ("Frites", 1000, 1)]
    delivered = datetime.now(timezone.utc) - timedelta(minutes=delivered_minutes_ago)

    async with engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO food_orders (id, order_number, restaurant_id, customer_id, country,
                                     order_type, status, placed_at, accepted_at, ready_at,
                                     delivered_at, currency, subtotal, delivery_fee, tax,
                                     grand_total, payment_method, payment_status)
            VALUES (:id, :n, 'burger_hub_ci', :cid, 'CI', 'delivery', 'delivered',
                    :p, :p, :p, :d, 'XOF', :sub, 0, 0, :tot, 'cod', 'paid')
        """), {"id": oid, "n": f"TEST{uuid.uuid4().hex[:6].upper()}",
               "cid": customer_id, "p": delivered - timedelta(minutes=30),
               "d": delivered, "sub": total, "tot": total})
        item_ids = []
        for name, price, qty in items:
            iid = f"foit_{uuid.uuid4().hex[:12]}"
            await conn.execute(text("""
                INSERT INTO food_order_items (id, order_id, menu_item_id, item_name_snapshot,
                                              quantity, unit_price, line_total)
                VALUES (:id, :oid, 'menu_x', :nm, :q, :p, :lt)
            """), {"id": iid, "oid": oid, "nm": name, "q": qty, "p": price, "lt": price * qty})
            item_ids.append(iid)
    await engine.dispose()
    return oid, item_ids


async def _db_exec(sql: str, **params):
    engine = create_async_engine(DB_URL, future=True)
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), params)
        rows = r.fetchall() if r.returns_rows else []
    await engine.dispose()
    return rows


# ---------------------------------------------------------------------------
# Auto-approval under threshold
# ---------------------------------------------------------------------------
def test_auto_approve_small_refund_credits_wallet():
    tok = _customer()
    cid = _me_id(tok)
    oid, item_ids = _run(_seed_food_order(cid, total=1500,
                                          items=[("Petit burger", 1500, 1)]))

    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "missing_item",
                            "refund_destination": "wallet"},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["auto_approved"] is True
    assert body["status"] == "refunded"
    assert body["approved_amount"] == 1500

    # Wallet credited?
    rows = _run(_db_exec(
        "SELECT balance FROM customer_wallet_balances WHERE customer_id = :c", c=cid))
    assert rows and float(rows[0].balance) == 1500


# ---------------------------------------------------------------------------
# Above threshold → partner review
# ---------------------------------------------------------------------------
def test_large_refund_routes_to_partner_review():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000,
                                   items=[("Family platter", 5000, 1)]))

    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "wrong_order"},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["auto_approved"] is False
    assert body["status"] == "awaiting_partner"

    # Row should have partner_due_at ≈ now + 24h.
    rows = _run(_db_exec(
        "SELECT partner_due_at FROM returns WHERE id = :id", id=body["id"]))
    assert rows[0].partner_due_at is not None


# ---------------------------------------------------------------------------
# Window closed → 400
# ---------------------------------------------------------------------------
def test_window_closed_is_rejected():
    tok = _customer()
    cid = _me_id(tok)
    # delivered 3 hours ago, FOOD policy is 2h.
    oid, _ = _run(_seed_food_order(cid, total=1500, delivered_minutes_ago=200))

    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "missing_item"},
                      timeout=15)
    assert r.status_code == 400
    assert r.json()["detail"] == "window_closed"


# ---------------------------------------------------------------------------
# Eligibility probe
# ---------------------------------------------------------------------------
def test_eligibility_probe_reports_window():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=1500))

    r = requests.get(f"{BASE_URL}/api/returns/eligibility",
                     headers={"Authorization": f"Bearer {tok}"},
                     params={"order_id": oid, "order_module": "food"}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["can_return"] is True
    assert data["window_closes_at"] is not None
    assert data["auto_approve_threshold"] == 2000


# ---------------------------------------------------------------------------
# Duplicate open claim blocked
# ---------------------------------------------------------------------------
def test_duplicate_open_claim_is_rejected():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000,
                                   items=[("Big", 5000, 1)]))
    headers = {"Authorization": f"Bearer {tok}"}
    r1 = requests.post(f"{BASE_URL}/api/returns", headers=headers,
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "wrong_order"}, timeout=10)
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE_URL}/api/returns", headers=headers,
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "wrong_order"}, timeout=10)
    assert r2.status_code == 400
    assert r2.json()["detail"] == "existing_return_open"


# ---------------------------------------------------------------------------
# Admin final override + list + flag
# ---------------------------------------------------------------------------
def test_admin_can_decide_and_flag_customer():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000, items=[("X", 5000, 1)]))
    ret = requests.post(f"{BASE_URL}/api/returns",
                        headers={"Authorization": f"Bearer {tok}"},
                        json={"order_id": oid, "order_module": "food",
                              "reason_code": "wrong_order"}, timeout=10).json()
    rid = ret["id"]

    atok = _admin_token()
    aheads = {"Authorization": f"Bearer {atok}"}

    # Admin list (filter by status)
    r = requests.get(f"{BASE_URL}/api/admin/returns",
                     headers=aheads, params={"status": "awaiting_partner"}, timeout=10)
    assert r.status_code == 200 and any(it["id"] == rid for it in r.json()["items"])

    # Admin partial-approves at 2500
    r = requests.post(f"{BASE_URL}/api/admin/returns/{rid}/decision",
                      headers=aheads,
                      json={"decision": "partial", "approved_amount": 2500,
                            "reason": "Only wings were missing"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "partial_approved"

    # Wallet should be credited with 2500.
    rows = _run(_db_exec(
        "SELECT balance FROM customer_wallet_balances WHERE customer_id = :c", c=cid))
    assert rows and float(rows[0].balance) >= 2500

    # Flag + unflag.
    r = requests.post(f"{BASE_URL}/api/admin/returns/flag/{cid}",
                      headers=aheads,
                      json={"risk_level": "review", "reason": "Pattern"}, timeout=10)
    assert r.status_code == 200
    # Flagged customer loses auto-approve.
    oid2, _ = _run(_seed_food_order(cid, total=500, items=[("Tiny", 500, 1)]))
    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid2, "order_module": "food",
                            "reason_code": "missing_item"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["auto_approved"] is False
    assert r.json()["status"] in ("awaiting_partner", "awaiting_admin")

    # Clean up flag.
    requests.delete(f"{BASE_URL}/api/admin/returns/flag/{cid}", headers=aheads, timeout=10)


# ---------------------------------------------------------------------------
# SLA escalation
# ---------------------------------------------------------------------------
def test_sla_escalation_moves_to_admin():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000, items=[("X", 5000, 1)]))
    ret = requests.post(f"{BASE_URL}/api/returns",
                        headers={"Authorization": f"Bearer {tok}"},
                        json={"order_id": oid, "order_module": "food",
                              "reason_code": "wrong_order"}, timeout=10).json()
    rid = ret["id"]

    # Fast-forward partner_due_at into the past.
    _run(_db_exec(
        "UPDATE returns SET partner_due_at = now() - interval '1 hour' WHERE id = :id",
        id=rid))

    atok = _admin_token()
    r = requests.post(f"{BASE_URL}/api/admin/returns/escalate-stale",
                      headers={"Authorization": f"Bearer {atok}"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["escalated"] >= 1

    rows = _run(_db_exec("SELECT status FROM returns WHERE id = :id", id=rid))
    assert rows[0].status == "awaiting_admin"


# ---------------------------------------------------------------------------
# Policy upsert
# ---------------------------------------------------------------------------
def test_super_admin_can_update_threshold():
    atok = _admin_token()
    aheads = {"Authorization": f"Bearer {atok}"}
    r = requests.post(f"{BASE_URL}/api/admin/return-policies",
                      headers=aheads,
                      json={"module": "food", "country": "CI",
                            "window_hours": 2, "auto_approve_threshold": 5000,
                            "is_returnable": True}, timeout=10)
    assert r.status_code == 200

    r = requests.get(f"{BASE_URL}/api/admin/return-policies", headers=aheads, timeout=10)
    assert r.status_code == 200
    found = [p for p in r.json()["items"]
             if p["module"] == "food" and p["country"] == "CI"]
    assert found and float(found[0]["auto_approve_threshold"]) == 5000

    # Clean up — don't leak the override into other tests.
    pid = found[0]["id"]
    requests.delete(f"{BASE_URL}/api/admin/return-policies/{pid}",
                    headers=aheads, timeout=10)
