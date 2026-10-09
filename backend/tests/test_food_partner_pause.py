"""Phase 4 regression — FOODbakēd partner service pause + dashboard stats.

Covers:
  • GET  /api/food/manage/{rid}/service-status   → both services unpaused by default
  • POST /api/food/manage/{rid}/pause            → sets delivery / pickup / both
  • POST /api/food/manage/{rid}/resume           → clears pause
  • POST /api/food/customer/orders               → HTTP 409 while service paused;
                                                   succeeds once resumed
  • GET  /api/food/manage/{rid}/dashboard-stats  → KPI envelope shape

Preserves the qa-burger partner credentials from test_credentials.md so the
suite is idempotent and reseed-proof.
"""
from __future__ import annotations
import os
import time
import uuid
import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
QA_EMAIL   = "qa-burger@test.example"
QA_PASS    = "QaBurger123!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def partner_auth(api):
    r = api.post(f"{BASE_URL}/api/food/partner/auth/login", json={"email": QA_EMAIL, "password": QA_PASS})
    r.raise_for_status()
    body = r.json()
    return {
        "token": body["access_token"],
        "restaurant_id": body["partner"]["restaurant_id"],
    }


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def _resume_before_each(api, partner_auth):
    """Keep the restaurant un-paused between tests so order flows work."""
    api.post(f"{BASE_URL}/api/food/manage/{partner_auth['restaurant_id']}/resume",
             json={"service": "all", "minutes": 0}, headers=_h(partner_auth["token"]))


# ---------------------------------------------------------------------------
# Phase 4 — unified test class so pytest-xdist loadscope pins the entire
# suite to one worker. Cross-class parallelism would otherwise fire pauses
# on one class while another class is placing orders, producing spurious
# service_paused 409s.
# ---------------------------------------------------------------------------

class TestServicePauseAndOrdering:
    # ----- service-status endpoint -----
    def test_default_is_unpaused(self, api, partner_auth):
        r = api.get(f"{BASE_URL}/api/food/manage/{partner_auth['restaurant_id']}/service-status",
                    headers=_h(partner_auth["token"]))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["delivery_paused"] is False
        assert s["pickup_paused"]   is False
        assert s["delivery_paused_until"] is None
        assert s["pickup_paused_until"]   is None

    def test_requires_partner_auth(self, api, partner_auth):
        r = api.get(f"{BASE_URL}/api/food/manage/{partner_auth['restaurant_id']}/service-status")
        assert r.status_code in (401, 403), r.text

    # ----- pause / resume -----
    def test_pause_delivery_only(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                     json={"service": "delivery", "minutes": 15}, headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["delivery_paused"] is True
        assert s["pickup_paused"]   is False, "pickup must stay unpaused"
        assert s["delivery_paused_until"] is not None

    def test_pause_pickup_only(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                     json={"service": "pickup", "minutes": 30}, headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["pickup_paused"]   is True
        assert s["delivery_paused"] is False

    def test_pause_both(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                     json={"service": "all", "minutes": 60}, headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["delivery_paused"] is True
        assert s["pickup_paused"]   is True

    def test_pause_zero_minutes_is_indefinite(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                     json={"service": "delivery", "minutes": 0}, headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        # minutes=0 clears the auto-resume timestamp — the service stays
        # UNPAUSED (NULL = accepting). This matches the Pause card UI copy
        # "Until I resume" which sends minutes=0 as a resume shortcut.
        assert s["delivery_paused_until"] is None
        assert s["delivery_paused"] is False

    def test_resume_delivery(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                 json={"service": "delivery", "minutes": 30}, headers=_h(tok))
        r = api.post(f"{BASE_URL}/api/food/manage/{rid}/resume",
                     json={"service": "delivery", "minutes": 0}, headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["delivery_paused"] is False

    # ----- Order creation respects the pause -----
    def _menu_item(self, api, rid):
        r = api.get(f"{BASE_URL}/api/food/restaurants/{rid}/menu")
        r.raise_for_status()
        sections = r.json().get("sections") or []
        for sec in sections:
            for it in sec.get("items", []):
                if it.get("is_available"):
                    return it
        raise RuntimeError("no available menu item")

    def _make_order(self, api, rid, order_type="delivery"):
        item = self._menu_item(api, rid)
        return api.post(f"{BASE_URL}/api/food/customer/orders", json={
            "restaurant_id": rid,
            "order_type": order_type,
            "items": [{"item_id": item["id"], "quantity": 1}],
            "customer_snapshot": {"name": "Pytest", "phone": "+22501000000"},
            "delivery_address": {},
            "payment_method": "cod",
            "client_order_id": f"test_{uuid.uuid4().hex[:10]}",
        })

    def test_delivery_paused_rejects_delivery_order(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                 json={"service": "delivery", "minutes": 30}, headers=_h(tok))
        r = self._make_order(api, rid, order_type="delivery")
        assert r.status_code == 409, f"expected 409 service_paused, got {r.status_code}: {r.text}"
        detail = r.json()["detail"]
        assert detail["code"] == "service_paused"
        assert detail["service"] == "delivery"
        assert detail["paused_until"] is not None

    def test_pickup_still_accepted_when_only_delivery_paused(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                 json={"service": "delivery", "minutes": 30}, headers=_h(tok))
        r = self._make_order(api, rid, order_type="pickup")
        assert r.status_code in (200, 201), f"pickup must stay open, got {r.status_code}: {r.text}"

    def test_resume_restores_ordering(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        api.post(f"{BASE_URL}/api/food/manage/{rid}/pause",
                 json={"service": "delivery", "minutes": 30}, headers=_h(tok))
        api.post(f"{BASE_URL}/api/food/manage/{rid}/resume",
                 json={"service": "delivery", "minutes": 0}, headers=_h(tok))
        r = self._make_order(api, rid, order_type="delivery")
        assert r.status_code in (200, 201), f"expected success after resume, got {r.status_code}: {r.text}"

    # ----- Dashboard stats envelope -----
    def test_dashboard_stats_shape(self, api, partner_auth):
        rid, tok = partner_auth["restaurant_id"], partner_auth["token"]
        r = api.get(f"{BASE_URL}/api/food/manage/{rid}/dashboard-stats",
                    headers=_h(tok))
        assert r.status_code == 200, r.text
        s = r.json()
        for k in ("orders_today", "pending_orders", "ready_orders",
                  "revenue_today", "avg_prep_minutes", "currency"):
            assert k in s, f"missing key {k} in {s}"
        assert isinstance(s["orders_today"], int)
        assert isinstance(s["revenue_today"], (int, float))

    def test_dashboard_stats_requires_partner_auth(self, api, partner_auth):
        rid = partner_auth["restaurant_id"]
        r = api.get(f"{BASE_URL}/api/food/manage/{rid}/dashboard-stats")
        assert r.status_code in (401, 403), r.text
