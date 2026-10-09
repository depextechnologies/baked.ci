"""Returns & Refunds — Phase 7B extra coverage (iteration 106).

Covers the gaps the main agent asked for:
  * Evidence rule (reasons that require photos)
  * Partner review via food-partner JWT (list + approve)
  * Admin inbox module/status filter
  * Policy delete protection for seeded `pol_default_*` rows
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
from sqlalchemy.ext.asyncio import create_async_engine

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
DB_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://", 1)


# ---------- helpers (copy of key utilities to keep this file self-contained) --
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


def _me_id(token: str) -> str:
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"}, timeout=10)
    return r.json()["id"]


def _admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    j = r.json()
    return j.get("access_token") or j.get("token")


def _food_partner_token():
    r = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                      json={"email": "qa-burger@test.example",
                            "password": "QaBurger123!"}, timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _seed_food_order(customer_id: str, total: float = 2500,
                           items=None, delivered_minutes_ago: int = 10):
    engine = create_async_engine(DB_URL, future=True)
    oid = f"ford_{uuid.uuid4().hex[:12]}"
    items = items or [("Burger", 1500, 1), ("Fries", 1000, 1)]
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


# ---------- Evidence rule ---------------------------------------------------
@pytest.mark.parametrize("reason_code", ["damaged", "poor_quality", "wrong_item"])
def test_evidence_required_without_photos(reason_code):
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=1500, items=[("Thing", 1500, 1)]))
    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": reason_code}, timeout=15)
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "evidence_required"


def test_evidence_present_allows_submission():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=1500, items=[("Dish", 1500, 1)]))
    r = requests.post(f"{BASE_URL}/api/returns",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"order_id": oid, "order_module": "food",
                            "reason_code": "damaged",
                            "evidence_urls": ["https://example.com/x.jpg"]},
                      timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] in ("refunded", "awaiting_partner", "awaiting_admin")


# ---------- Partner review flow via food-partner JWT -----------------------
def test_partner_lists_and_approves_pending_return():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000, items=[("Family", 5000, 1)]))
    created = requests.post(f"{BASE_URL}/api/returns",
                            headers={"Authorization": f"Bearer {tok}"},
                            json={"order_id": oid, "order_module": "food",
                                  "reason_code": "wrong_order"}, timeout=15).json()
    rid = created["id"]
    assert created["status"] == "awaiting_partner"

    ptok = _food_partner_token()
    pheads = {"Authorization": f"Bearer {ptok}"}

    # List pending for this partner's restaurant.
    r = requests.get(f"{BASE_URL}/api/returns/partner",
                     headers=pheads, params={"status": "awaiting_partner"}, timeout=10)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert any(it["id"] == rid for it in items)

    # Approve full refund.
    r = requests.post(f"{BASE_URL}/api/returns/partner/{rid}/decision",
                      headers=pheads, json={"decision": "approve"}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"


def test_partner_partial_requires_amount_and_reason():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000, items=[("A", 5000, 1)]))
    ret = requests.post(f"{BASE_URL}/api/returns",
                        headers={"Authorization": f"Bearer {tok}"},
                        json={"order_id": oid, "order_module": "food",
                              "reason_code": "wrong_order"}, timeout=10).json()
    rid = ret["id"]
    ptok = _food_partner_token()
    pheads = {"Authorization": f"Bearer {ptok}"}

    # Missing reason.
    r = requests.post(f"{BASE_URL}/api/returns/partner/{rid}/decision",
                      headers=pheads,
                      json={"decision": "partial", "approved_amount": 2000},
                      timeout=10)
    assert r.status_code == 400
    assert r.json()["detail"] == "reason_required"

    # Missing amount.
    r = requests.post(f"{BASE_URL}/api/returns/partner/{rid}/decision",
                      headers=pheads,
                      json={"decision": "partial", "reason": "half missing"},
                      timeout=10)
    assert r.status_code == 400
    assert r.json()["detail"] == "approved_amount_required"

    # Happy path.
    r = requests.post(f"{BASE_URL}/api/returns/partner/{rid}/decision",
                      headers=pheads,
                      json={"decision": "partial", "approved_amount": 2000,
                            "reason": "only one item missing"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "partial_approved"


def test_partner_dispute_routes_to_admin():
    tok = _customer()
    cid = _me_id(tok)
    oid, _ = _run(_seed_food_order(cid, total=5000, items=[("Big", 5000, 1)]))
    ret = requests.post(f"{BASE_URL}/api/returns",
                        headers={"Authorization": f"Bearer {tok}"},
                        json={"order_id": oid, "order_module": "food",
                              "reason_code": "wrong_order"}, timeout=10).json()
    rid = ret["id"]
    ptok = _food_partner_token()
    r = requests.post(f"{BASE_URL}/api/returns/partner/{rid}/decision",
                      headers={"Authorization": f"Bearer {ptok}"},
                      json={"decision": "dispute", "reason": "customer unreliable"},
                      timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "awaiting_admin"


# ---------- Admin inbox filters --------------------------------------------
def test_admin_list_supports_module_filter():
    atok = _admin_token()
    r = requests.get(f"{BASE_URL}/api/admin/returns",
                     headers={"Authorization": f"Bearer {atok}"},
                     params={"module": "food"}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    for it in body["items"]:
        assert it["order_module"] == "food"


# ---------- Policy protection ----------------------------------------------
def test_cannot_delete_seeded_default_policy():
    atok = _admin_token()
    aheads = {"Authorization": f"Bearer {atok}"}
    rows = requests.get(f"{BASE_URL}/api/admin/return-policies",
                        headers=aheads, timeout=10).json()["items"]
    defaults = [p for p in rows if str(p["id"]).startswith("pol_default_")]
    assert defaults, "expected seeded pol_default_* policies"
    pid = defaults[0]["id"]
    r = requests.delete(f"{BASE_URL}/api/admin/return-policies/{pid}",
                        headers=aheads, timeout=10)
    # Delete endpoint keeps default rows: either rejected or no-op.
    # Re-GET and ensure the row still exists.
    rows2 = requests.get(f"{BASE_URL}/api/admin/return-policies",
                         headers=aheads, timeout=10).json()["items"]
    assert any(p["id"] == pid for p in rows2), "default policy was deleted!"
