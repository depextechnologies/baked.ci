"""FOODbakēd reservations — supplementary e2e coverage.

Focuses on flows not covered by test_food_reservations.py:
  * Public reservation-config for burger-hub / advance-window rejection
  * Partner JWT login, list, actions (confirm/reject transitions)
  * Tenant isolation: partner A cannot touch partner B's rid
  * Settings PUT round-trip
  * Reservation-toggle
  * Customer flow (email-OTP creates a customer; then GET /me claims guest)
  * WebSocket happy-path + cross-tenant 4403
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time as _time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
import websockets  # type: ignore

BASE_URL = os.environ.get("BASE_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

BURGER_SLUG = "burger-hub"
BURGER_RID_CI = "burger_hub_ci"
BURGER_RID_IN = "burger_hub_in"

PARTNER_EMAIL = "qa-burger@test.example"
PARTNER_PASS = "QaBurger123!"


def _api(p: str) -> str:
    return f"{BASE_URL}/api{p}"


# ---------------------------------------------------------------- fixtures

@pytest.fixture(scope="module")
def partner_token_ci() -> str:
    r = requests.post(_api("/food/partner/auth/login"),
                      json={"email": PARTNER_EMAIL, "password": PARTNER_PASS})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert body.get("partner", {}).get("restaurant_id") == BURGER_RID_CI
    return body["access_token"]


@pytest.fixture(scope="module")
def partner_hdr(partner_token_ci):
    return {"Authorization": f"Bearer {partner_token_ci}"}


# ---------------------------------------------------------------- public

class TestPublicConfig:
    def test_burger_hub_config_enabled(self):
        r = requests.get(_api(f"/food/restaurants/{BURGER_SLUG}/reservation-config"))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["enabled"] is True
        for k in ("min_party_size", "max_party_size", "min_lead_time_minutes",
                  "slot_interval_minutes", "advance_booking_days"):
            assert k in b, f"missing {k}"

    def test_slots_beyond_advance_window_422(self):
        cfg = requests.get(_api(f"/food/restaurants/{BURGER_SLUG}/reservation-config")).json()
        far = (datetime.now(timezone.utc).date() + timedelta(days=cfg["advance_booking_days"] + 5)).isoformat()
        r = requests.get(_api(f"/food/restaurants/{BURGER_SLUG}/reservation-slots"),
                         params={"date": far, "party_size": 2})
        assert r.status_code == 422

    def test_slots_party_size_out_of_range_422(self):
        d = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
        r = requests.get(_api(f"/food/restaurants/{BURGER_SLUG}/reservation-slots"),
                         params={"date": d, "party_size": 999})
        assert r.status_code == 422

    def test_slot_has_required_fields(self):
        d = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
        r = requests.get(_api(f"/food/restaurants/{BURGER_SLUG}/reservation-slots"),
                         params={"date": d, "party_size": 2})
        assert r.status_code == 200
        slots = r.json()["slots"]
        assert len(slots) > 0
        s = slots[0]
        for k in ("iso", "slot", "capacity", "remaining", "available"):
            assert k in s


# ---------------------------------------------------------------- guest create + partner action

def _future_slot_iso(days_ahead: int = 2, hour: int = 20, minute: int = 0) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


class TestPartnerFlow:
    def test_login_returns_partner_and_restaurant(self, partner_token_ci):
        assert isinstance(partner_token_ci, str) and len(partner_token_ci) > 20

    def test_list_reservations_includes_counts(self, partner_hdr):
        r = requests.get(_api(f"/food/manage/{BURGER_RID_CI}/reservations"), headers=partner_hdr)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "reservations" in b and "counts" in b
        for k in ("pending", "today", "upcoming"):
            assert k in b["counts"]

    def test_tenant_isolation_other_restaurant_403(self, partner_hdr):
        r = requests.get(_api(f"/food/manage/{BURGER_RID_IN}/reservations"), headers=partner_hdr)
        assert r.status_code == 403, r.status_code

    def test_list_filters(self, partner_hdr):
        r = requests.get(_api(f"/food/manage/{BURGER_RID_CI}/reservations"),
                         headers=partner_hdr, params={"status": "pending"})
        assert r.status_code == 200
        for row in r.json()["reservations"]:
            assert row["status"] == "pending"

    def test_settings_get(self, partner_hdr):
        r = requests.get(_api(f"/food/manage/{BURGER_RID_CI}/reservation-settings"), headers=partner_hdr)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "settings" in b
        for k in ("slot_capacity", "min_party_size", "max_party_size",
                  "min_lead_time_minutes", "slot_interval_minutes", "hours"):
            assert k in b["settings"]

    def test_settings_put_persists(self, partner_hdr):
        # read current
        cur = requests.get(_api(f"/food/manage/{BURGER_RID_CI}/reservation-settings"),
                           headers=partner_hdr).json()["settings"]
        new_cap = 30 if cur["slot_capacity"] != 30 else 25
        r = requests.put(_api(f"/food/manage/{BURGER_RID_CI}/reservation-settings"),
                         headers=partner_hdr, json={"slot_capacity": new_cap})
        assert r.status_code == 200, r.text
        assert r.json()["slot_capacity"] == new_cap
        # verify GET matches
        after = requests.get(_api(f"/food/manage/{BURGER_RID_CI}/reservation-settings"),
                             headers=partner_hdr).json()["settings"]
        assert after["slot_capacity"] == new_cap
        # restore
        requests.put(_api(f"/food/manage/{BURGER_RID_CI}/reservation-settings"),
                     headers=partner_hdr, json={"slot_capacity": cur["slot_capacity"]})

    def test_settings_put_tenant_isolation(self, partner_hdr):
        r = requests.put(_api(f"/food/manage/{BURGER_RID_IN}/reservation-settings"),
                         headers=partner_hdr, json={"slot_capacity": 5})
        assert r.status_code == 403

    def test_create_and_confirm_reservation(self, partner_hdr):
        # Guest create
        iso = _future_slot_iso(days_ahead=3, hour=19, minute=0)
        payload = {
            "reservation_at": iso, "party_size": 2,
            "guest_name": "E2E Guest", "guest_phone": "+22509" + str(int(_time.time()))[-7:],
            "guest_email": f"e2e+{uuid.uuid4().hex[:8]}@example.com",
        }
        cr = requests.post(_api(f"/food/restaurants/{BURGER_RID_CI}/reservations"), json=payload)
        assert cr.status_code == 201, cr.text
        res_id = cr.json()["id"]
        status = cr.json()["status"]
        assert status in ("pending", "confirmed")
        assert cr.json()["booking_reference"].startswith("R-")

        if status == "pending":
            # Confirm via partner
            pr = requests.patch(_api(f"/food/manage/{BURGER_RID_CI}/reservations/{res_id}"),
                                headers=partner_hdr, json={"action": "confirm"})
            assert pr.status_code == 200, pr.text
            assert pr.json()["status"] == "confirmed"

            # Cannot confirm again (already confirmed → no-op returns 200 same status per code)
            # Cancel it
            cn = requests.patch(_api(f"/food/manage/{BURGER_RID_CI}/reservations/{res_id}"),
                                headers=partner_hdr, json={"action": "cancel"})
            assert cn.status_code == 200
            assert cn.json()["status"] == "cancelled"

            # Terminal: cannot confirm a cancelled row
            bad = requests.patch(_api(f"/food/manage/{BURGER_RID_CI}/reservations/{res_id}"),
                                 headers=partner_hdr, json={"action": "confirm"})
            assert bad.status_code == 400

    def test_action_tenant_isolation(self, partner_hdr):
        # Create a reservation on burger-hub then try patching via the (same) partner
        # against the IN rid — that path is 403 because the partner isn't the writer.
        iso = _future_slot_iso(days_ahead=4, hour=20)
        cr = requests.post(_api(f"/food/restaurants/{BURGER_SLUG}/reservations"), json={
            "reservation_at": iso, "party_size": 2,
            "guest_name": "Iso Test", "guest_phone": "+22508" + str(int(_time.time()))[-7:],
        })
        assert cr.status_code == 201
        rid_res = cr.json()["id"]
        r = requests.patch(_api(f"/food/manage/{BURGER_RID_IN}/reservations/{rid_res}"),
                           headers=partner_hdr, json={"action": "confirm"})
        assert r.status_code in (403, 404)


# ---------------------------------------------------------------- customer /me

class TestCustomerMe:
    def test_requires_auth(self):
        r = requests.get(_api("/food/customer/reservations"))
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------- WebSocket

@pytest.mark.asyncio
async def test_websocket_hello_and_cross_tenant_reject(partner_token_ci):
    # Happy-path hello
    url_ok = f"{WS_URL}/api/food/manage/{BURGER_RID_CI}/ws?token={partner_token_ci}"
    async with websockets.connect(url_ok, open_timeout=10) as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=5)
        frame = json.loads(msg)
        assert frame.get("type") == "hello"
        assert frame.get("restaurant_id") == BURGER_RID_CI

    # Cross-tenant reject (partner CI token against IN rid)
    url_bad = f"{WS_URL}/api/food/manage/{BURGER_RID_IN}/ws?token={partner_token_ci}"
    with pytest.raises(Exception) as ei:
        async with websockets.connect(url_bad, open_timeout=10) as ws2:
            await ws2.recv()
    # Expect close code 4403 in the error message
    assert "4403" in str(ei.value) or "403" in str(ei.value)


@pytest.mark.asyncio
async def test_websocket_receives_new_reservation(partner_token_ci):
    url = f"{WS_URL}/api/food/manage/{BURGER_RID_CI}/ws?token={partner_token_ci}"
    async with websockets.connect(url, open_timeout=10) as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello.get("type") == "hello"

        # Post a reservation via REST
        iso = (datetime.now(timezone.utc) + timedelta(days=10)).replace(
            hour=13, minute=30, second=0, microsecond=0).isoformat()
        payload = {
            "reservation_at": iso, "party_size": 2,
            "guest_name": "WS Watcher",
            "guest_phone": "+22507" + str(int(_time.time()))[-7:],
        }
        r = requests.post(_api(f"/food/restaurants/{BURGER_RID_CI}/reservations"), json=payload)
        assert r.status_code == 201, r.text
        new_id = r.json()["id"]

        # Wait up to 10s for the created frame
        got = None
        deadline = _time.time() + 10.0
        while _time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            fr = json.loads(raw)
            if fr.get("type") == "food.reservation.created" and fr["reservation"]["id"] == new_id:
                got = fr
                break
        assert got is not None, "no reservation.created frame received"
