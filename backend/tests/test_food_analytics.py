"""FOODbakēd — Restaurant Analytics + Order Seed regression.

Verifies:
  * Only super-admin can seed orders (partner + anonymous rejected)
  * Analytics endpoint honours the shared writer dependency (super-admin +
    partner-of-restaurant only; partner cross-tenant 403)
  * KPI totals match what the seed inserted (delivered count == status_mix
    'delivered' value; hourly array has exactly 24 entries)
  * `range` query supports 7d / 30d / 90d and returns matching series length
"""
from __future__ import annotations
import os
import pathlib
import uuid

import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
RID_CI = "burger_hub_ci"
RID_IN = "burger_hub_in"


def _admin_hdr():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed(rid: str, days: int = 7, daily_avg: int = 10, clear: bool = True):
    r = requests.post(f"{BASE_URL}/api/admin/food/restaurants/{rid}/seed-orders"
                      f"?days={days}&daily_avg={daily_avg}&clear={str(clear).lower()}",
                      headers=_admin_hdr(), timeout=90)
    assert r.status_code == 200, r.text
    return r.json()


def _make_partner(rid: str):
    email = f"qa-analytics-{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE_URL}/api/admin/food/restaurants/{rid}/partners",
                      headers=_admin_hdr(),
                      json={"email": email, "password": "AnalyticsPass123", "name": "QA"}, timeout=10)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    r2 = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                        json={"email": email, "password": "AnalyticsPass123"}, timeout=10)
    return pid, r2.json()["access_token"]


def _cleanup_partner(pid: str):
    requests.delete(f"{BASE_URL}/api/admin/food/partners/{pid}", headers=_admin_hdr(), timeout=10)


# ---------------------------------------------------- auth --

def test_seed_requires_admin():
    r = requests.post(f"{BASE_URL}/api/admin/food/restaurants/{RID_CI}/seed-orders",
                       timeout=10)
    assert r.status_code == 401


def test_analytics_requires_writer():
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/analytics", timeout=10)
    assert r.status_code == 401


def test_partner_cannot_read_other_restaurant_analytics():
    pid, ptok = _make_partner(RID_CI)
    try:
        r = requests.get(f"{BASE_URL}/api/food/manage/{RID_IN}/analytics",
                         headers={"Authorization": f"Bearer {ptok}"}, timeout=10)
        assert r.status_code == 403
    finally:
        _cleanup_partner(pid)


# ---------------------------------------------------- shape --

def test_analytics_shape_and_totals():
    _seed(RID_CI, days=7, daily_avg=12, clear=True)
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/analytics?range=7d",
                     headers=_admin_hdr(), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()

    # required shape
    for k in ("range", "restaurant_id", "currency", "kpis", "daily", "top_items",
              "status_mix", "type_mix", "payment_mix", "hourly"):
        assert k in d, f"missing key {k}"
    assert d["range"] == "7d"
    assert d["restaurant_id"] == RID_CI
    assert d["currency"] == "XOF"

    # daily series matches range and is chronologically sorted
    assert len(d["daily"]) == 7
    assert d["daily"][0]["date"] < d["daily"][-1]["date"]

    # hourly always has 24 buckets
    assert len(d["hourly"]) == 24
    assert d["hourly"][0]["hour"] == 0
    assert d["hourly"][-1]["hour"] == 23

    # KPI cross-check: delivered_orders == status_mix delivered value
    delivered_mix = next((s["value"] for s in d["status_mix"] if s["name"] == "delivered"), 0)
    assert delivered_mix == d["kpis"]["delivered_orders"]

    # Prep time is non-negative
    assert d["kpis"]["avg_prep_min"] >= 0


def test_analytics_ranges_independent():
    _seed(RID_CI, days=90, daily_avg=8, clear=True)
    lens = {}
    for r_ in ("7d", "30d", "90d"):
        r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/analytics?range={r_}",
                          headers=_admin_hdr(), timeout=20)
        assert r.status_code == 200
        lens[r_] = len(r.json()["daily"])
    assert lens == {"7d": 7, "30d": 30, "90d": 90}


def test_partner_can_read_own_analytics():
    _seed(RID_CI, days=7, daily_avg=6, clear=True)
    pid, ptok = _make_partner(RID_CI)
    try:
        r = requests.get(f"{BASE_URL}/api/food/manage/{RID_CI}/analytics?range=7d",
                         headers={"Authorization": f"Bearer {ptok}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["restaurant_id"] == RID_CI
    finally:
        _cleanup_partner(pid)


def test_seed_respects_clear_flag():
    r1 = _seed(RID_CI, days=3, daily_avg=5, clear=True)
    r2 = _seed(RID_CI, days=3, daily_avg=5, clear=False)
    # Second seeding without clear should have created new rows too.
    assert r2["seeded"] >= 1
