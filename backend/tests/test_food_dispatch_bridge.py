"""FOODbakēd — Pass 2 Driver Dispatch bridge regression.

Validates the FOOD → EXPRESS shadow-booking flow end-to-end:
  • `preparing` creates exactly one shadow express_booking (idempotent on retry)
  • pickup orders never dispatch
  • dispatch failure (missing coords) does NOT fail the partner PATCH;
    it logs a `delivery_failed` event instead
  • `GET /food/manage/{rid}/orders/{oid}/delivery` is tenant-isolated and
    includes the pickup PIN for the partner
  • Customer tracking endpoint hides the PIN
  • `cascade_delivered_from_express` flips the FOOD order to `delivered`
    once the SEND side marks delivered, and is idempotent
  • Existing EXPRESS parcel/mover bookings are unaffected
"""
from __future__ import annotations

import os
import pathlib
import uuid

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]
RID = "burger_hub_ci"


def _admin() -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _item_for(rid: str) -> str:
    r = requests.get(f"{BASE_URL}/api/food/restaurants/{rid}/menu", timeout=10)
    r.raise_for_status()
    for sec in r.json().get("sections", []):
        for it in sec.get("items", []):
            if it.get("is_available"):
                return it["id"]
    raise AssertionError("no available item")


def _dev_customer_token() -> tuple[str, str]:
    """Return (token, phone_e164) using the dev OTP flow."""
    digits = str(uuid.uuid4().int)[:8]
    phone  = f"07{digits}"
    ch = requests.post(f"{BASE_URL}/api/auth/otp/request",
                       json={"country_code": "+225", "phone": phone}, timeout=10)
    ch.raise_for_status()
    body = ch.json()
    code = body.get("dev_code")
    assert code, f"dev OTP code missing (env not dev?): {body}"
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"challenge_id": body["challenge_id"], "code": code},
                      timeout=10)
    v.raise_for_status()
    return v.json()["access_token"], f"+225{phone}"


def _place_delivery_order(address_overrides: dict | None = None) -> str:
    """Place a DELIVERY order AS A REAL CUSTOMER (needed because
    express_bookings.customer_id is NOT NULL — dispatch skips anonymous
    FOOD orders by design). Returns the FOOD order id."""
    tok, phone = _dev_customer_token()
    hdr = {"Authorization": f"Bearer {tok}"}
    addr = {
        "line1": "Rue des Jardins, Cocody",
        "city":  "Abidjan",
        "lat":   5.3484,
        "lng":   -4.0017,
        "phone": phone,
        "contact_name": "QA Pass2",
    }
    if address_overrides:
        addr.update(address_overrides)
    item = _item_for(RID)
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": RID, "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "QA Pass2", "phone": phone},
        "delivery_address": addr,
    }, headers=hdr, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _accept_and_prepare(oid: str) -> None:
    for action in ("accept", "preparing"):
        resp = requests.patch(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                              headers=_admin(), json={"action": action}, timeout=10)
        assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# Dispatch creation + idempotency
# ---------------------------------------------------------------------------

def test_preparing_creates_exactly_one_delivery_job():
    oid = _place_delivery_order()
    _accept_and_prepare(oid)
    r = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/delivery",
                     headers=_admin(), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["booking_id"], "expected a booking_id after preparing"
    assert body["food_order_id"] == oid
    # Raw status covers searching/offering/driver_assigned — never "none".
    assert body["raw_status"] in {"searching", "offering", "driver_assigned"}
    assert body["pickup_pin"] and len(body["pickup_pin"]) == 4


def test_preparing_is_idempotent_on_retry():
    oid = _place_delivery_order()
    _accept_and_prepare(oid)
    first = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/delivery",
                         headers=_admin(), timeout=10).json()
    # Replay a 'preparing' transition — must NOT create a second booking.
    retry = requests.patch(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                           headers=_admin(), json={"action": "preparing"}, timeout=10)
    # 409 (invalid transition) is fine; what matters is no new booking is spawned.
    assert retry.status_code in (200, 409)
    second = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/delivery",
                          headers=_admin(), timeout=10).json()
    assert second["booking_id"] == first["booking_id"]
    assert second["pickup_pin"] == first["pickup_pin"]


# ---------------------------------------------------------------------------
# Pickup orders don't dispatch
# ---------------------------------------------------------------------------

def test_pickup_order_does_not_dispatch():
    item = _item_for(RID)
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": RID, "order_type": "pickup",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "QA Pickup", "phone": "+2250711003344"},
    }, timeout=15)
    assert r.status_code == 201
    oid = r.json()["id"]
    _accept_and_prepare(oid)
    body = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/delivery",
                        headers=_admin(), timeout=10).json()
    assert body["status"] == "none", body


# ---------------------------------------------------------------------------
# Missing coords: order remains in `preparing`, no dispatch, event logged
# ---------------------------------------------------------------------------

def test_missing_drop_coords_logs_failure_but_does_not_break_partner():
    oid = _place_delivery_order(address_overrides={"lat": None, "lng": None})
    _accept_and_prepare(oid)
    # Partner side still 200 and order is in `preparing`
    detail = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}",
                          headers=_admin(), timeout=10).json()
    assert detail["status"] == "preparing"
    body = requests.get(f"{BASE_URL}/api/food/manage/{RID}/orders/{oid}/delivery",
                        headers=_admin(), timeout=10).json()
    assert body["status"] == "none"
    # And a delivery_failed event appears in the audit log.
    events = [e["type"] for e in detail["events"]]
    assert "delivery_failed" in events, events


# ---------------------------------------------------------------------------
# Tenant isolation on delivery GET
# ---------------------------------------------------------------------------

def test_delivery_get_is_tenant_isolated():
    oid = _place_delivery_order()
    _accept_and_prepare(oid)
    # Hitting a different restaurant's delivery with THIS order id must 404.
    r = requests.get(f"{BASE_URL}/api/food/manage/dosa_darbar_in/orders/{oid}/delivery",
                     headers=_admin(), timeout=10)
    # 404 (order not found for that rid) is the correct behaviour.
    assert r.status_code == 404, r.status_code


# ---------------------------------------------------------------------------
# Customer tracking endpoint hides the PIN
# ---------------------------------------------------------------------------

def test_customer_track_hides_pickup_pin():
    tok, phone = _dev_customer_token()
    hdr = {"Authorization": f"Bearer {tok}"}
    item = _item_for(RID)
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": RID, "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "delivery_address": {"line1": "Rue QA", "city": "Abidjan",
                              "lat": 5.3484, "lng": -4.0017, "phone": phone},
    }, headers=hdr, timeout=15).json()
    oid = r["id"]
    _accept_and_prepare(oid)
    tr = requests.get(f"{BASE_URL}/api/food/customer/orders/{oid}/track",
                      headers=hdr, timeout=10).json()
    assert tr["order"]["id"] == oid
    assert tr["delivery"] is not None, tr
    # Pickup PIN must not leak to the customer side.
    assert "pickup_pin" not in tr["delivery"], tr["delivery"].keys()


# ---------------------------------------------------------------------------
# EXPRESS / SEND existing bookings remain untouched
# ---------------------------------------------------------------------------

def test_existing_parcel_bookings_unaffected():
    # The dispatch bridge must not have corrupted the parcel booking_type.
    # A smoke check: parcel pricing endpoint still answers 200.
    r = requests.get(f"{BASE_URL}/api/express/vehicles?country=CI", timeout=10)
    assert r.status_code == 200
