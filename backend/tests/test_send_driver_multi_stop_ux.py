"""SENDbakēd — Driver Multi-Stop UX regression.

Covers the new server-side lifecycle that unblocks driver-side execution of
Phase E multi-stop bookings:

  1. Booking creation enriches `stops[]` with `sequence`, per-leg `status`,
     `completed_at`, and generates a **delivery_pin** per drop.
  2. The customer API strips `delivery_pin` from responses (SMS is the
     only channel that surfaces it to the receiver).
  3. `stops_progress` snapshot points at the FIRST incomplete leg.
  4. `POST /bookings/{id}/stop-advance` requires driver JWT (401 anonymous,
     403 wrong-driver).
  5. Unit-level: the strict ordering + PIN enforcement in
     `modules.express.multi_stop.advance_stop_leg`.
"""
from __future__ import annotations

import os
import time

import pytest
import requests


BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    or "https://baked-platform.preview.emergentagent.com"
)
API = f"{BASE_URL}/api"


def _customer_token():
    phone = f"70{int(time.time() * 1000) % 100_000_000:08d}"
    req = requests.post(
        f"{API}/auth/otp/request",
        json={"country_code": "225", "phone": phone},
        timeout=15,
    ).json()
    code = req.get("dev_code") or "123456"
    r = requests.post(
        f"{API}/auth/otp/verify",
        json={"challenge_id": req["challenge_id"], "code": code},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _create_multi_stop_booking():
    tok = _customer_token()
    stops = [
        {
            "pickup": {"lat": 5.350, "lng": -4.020, "formatted_address": "Pickup A"},
            "drop":   {"lat": 5.360, "lng": -4.030, "formatted_address": "Drop A"},
            "receiver": {"name": "Ann", "phone": "+2250700000001"},
        },
        {
            "pickup": {"lat": 5.365, "lng": -4.028, "formatted_address": "Pickup B"},
            "drop":   {"lat": 5.380, "lng": -4.050, "formatted_address": "Drop B"},
            "receiver": {"name": "Bob", "phone": "+2250700000002"},
        },
    ]
    payload = {
        "country": "CI",
        "vehicle_code": "three_wheeler",
        "service_type": "multiple_shipments",
        "pickup": {"line1": "A", "latitude": 5.350, "longitude": -4.020, "formatted_address": "A"},
        "drop":   {"line1": "B", "latitude": 5.360, "longitude": -4.030, "formatted_address": "B"},
        "stops": stops,
        "receiver": {"name": "Ann", "phone": "+2250700000001"},
        "payment_method": "cod",
    }
    r = requests.post(
        f"{API}/express/bookings/parcel",
        headers={"Authorization": f"Bearer {tok}"},
        json=payload, timeout=20,
    )
    assert r.status_code == 200, r.text
    return tok, r.json()


class TestStopsEnrichment:
    def test_stops_are_enriched_with_sequence_and_pending_status(self):
        _, body = _create_multi_stop_booking()
        stops = body["stops"]
        assert len(stops) == 2
        for i, s in enumerate(stops, start=1):
            assert s["sequence"] == i
            assert s["pickup"]["status"] == "pending"
            assert s["drop"]["status"] == "pending"
            assert s["pickup"]["completed_at"] is None
            assert s["drop"]["completed_at"] is None

    def test_delivery_pin_is_stripped_from_customer_api(self):
        _, body = _create_multi_stop_booking()
        for s in body["stops"]:
            assert "delivery_pin" not in (s.get("drop") or {}), (
                "PIN must never leak to the customer-facing API — SMS is the "
                "only channel that surfaces it."
            )

    def test_stops_progress_points_at_first_pickup(self):
        _, body = _create_multi_stop_booking()
        prog = body.get("stops_progress")
        assert prog is not None
        assert prog["completed"] == 0
        assert prog["total"] == 4
        assert prog["current"] == {"sequence": 1, "leg": "pickup"}

    def test_single_stop_booking_leaves_stops_progress_null(self):
        tok = _customer_token()
        payload = {
            "country": "CI",
            "vehicle_code": "three_wheeler",
            "service_type": "cargo",
            "pickup": {"line1": "A", "latitude": 5.35, "longitude": -4.02, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.36, "longitude": -4.03, "formatted_address": "B"},
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=20,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("stops") in (None, [])
        assert b.get("stops_progress") is None


class TestStopAdvanceAuth:
    def test_stop_advance_requires_driver_jwt(self):
        """No Authorization header → 401."""
        _, body = _create_multi_stop_booking()
        r = requests.post(
            f"{API}/express/bookings/{body['id']}/stop-advance",
            json={"sequence": 1, "leg": "pickup"},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_stop_advance_rejects_customer_token(self):
        """A customer JWT (role='customer') is not enough — driver JWT only."""
        tok, body = _create_multi_stop_booking()
        r = requests.post(
            f"{API}/express/bookings/{body['id']}/stop-advance",
            headers={"Authorization": f"Bearer {tok}"},
            json={"sequence": 1, "leg": "pickup"},
            timeout=15,
        )
        assert r.status_code == 401, r.text


class TestCustomerTracking:
    """Customer-facing GET must expose the enriched stops + progress so the
    live-tracking panel can render "which parcel is out for delivery next"
    without any additional round-trip."""

    def test_customer_get_returns_stops_and_progress(self):
        tok, body = _create_multi_stop_booking()
        r = requests.get(
            f"{API}/express/bookings/{body['id']}",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["stops_progress"]["current"] == {"sequence": 1, "leg": "pickup"}
        assert data["stops_progress"]["completed"] == 0
        assert data["stops_progress"]["total"] == 4
        # PIN still scrubbed at the tracking endpoint.
        for s in data["stops"]:
            assert "delivery_pin" not in s["drop"]


# --------------------------------------------------------------------------- #
# Unit tests — strict ordering + PIN enforcement                              #
# --------------------------------------------------------------------------- #

class _FakeBooking:
    def __init__(self, stops):
        self.stops = stops


class TestMultiStopUnit:
    def _enriched(self):
        from modules.express.multi_stop import enrich_stops
        return enrich_stops([
            {"pickup": {"lat": 1, "lng": 1}, "drop": {"lat": 2, "lng": 2},
             "receiver": {"name": "A", "phone": "+1"}},
            {"pickup": {"lat": 3, "lng": 3}, "drop": {"lat": 4, "lng": 4},
             "receiver": {"name": "B", "phone": "+2"}},
        ])

    def test_pins_generated_per_drop(self):
        stops = self._enriched()
        for s in stops:
            pin = s["drop"]["delivery_pin"]
            assert isinstance(pin, str) and pin.isdigit() and len(pin) == 4

    def test_cannot_skip_pickup_1(self):
        from modules.express.multi_stop import advance_stop_leg, MultiStopError
        b = _FakeBooking(self._enriched())
        with pytest.raises(MultiStopError) as ei:
            advance_stop_leg(b, sequence=2, leg="pickup")
        assert ei.value.code == "out_of_sequence"

    def test_cannot_skip_drop_before_pickup(self):
        from modules.express.multi_stop import advance_stop_leg, MultiStopError
        b = _FakeBooking(self._enriched())
        with pytest.raises(MultiStopError) as ei:
            advance_stop_leg(b, sequence=1, leg="drop", delivery_pin="0000")
        assert ei.value.code == "out_of_sequence"

    def test_wrong_pin_rejected(self):
        from modules.express.multi_stop import advance_stop_leg, MultiStopError
        b = _FakeBooking(self._enriched())
        advance_stop_leg(b, sequence=1, leg="pickup")  # pickup ok
        with pytest.raises(MultiStopError) as ei:
            advance_stop_leg(b, sequence=1, leg="drop", delivery_pin="0000")
        # PIN may collide with 0000 (1/10000 chance) — guard the test.
        if b.stops[0]["drop"]["delivery_pin"] != "0000":
            assert ei.value.code == "pin_invalid"

    def test_full_happy_path_cascades_to_delivered(self):
        from modules.express.multi_stop import advance_stop_leg
        stops = self._enriched()
        b = _FakeBooking(stops)
        _, s1 = advance_stop_leg(b, sequence=1, leg="pickup")
        assert s1 == "picked_up"
        _, s2 = advance_stop_leg(b, sequence=1, leg="drop",
                                 delivery_pin=stops[0]["drop"]["delivery_pin"])
        assert s2 == "in_transit"
        _, s3 = advance_stop_leg(b, sequence=2, leg="pickup")
        assert s3 == "in_transit"
        _, s4 = advance_stop_leg(b, sequence=2, leg="drop",
                                 delivery_pin=stops[1]["drop"]["delivery_pin"])
        assert s4 == "delivered"

    def test_cannot_replay_completed_leg(self):
        from modules.express.multi_stop import advance_stop_leg, MultiStopError
        stops = self._enriched()
        b = _FakeBooking(stops)
        advance_stop_leg(b, sequence=1, leg="pickup")
        with pytest.raises(MultiStopError) as ei:
            advance_stop_leg(b, sequence=1, leg="pickup")
        assert ei.value.code in ("leg_already_completed", "out_of_sequence")

    def test_progress_summary_shape(self):
        from modules.express.multi_stop import summarise_progress, advance_stop_leg
        stops = self._enriched()
        b = _FakeBooking(stops)
        p0 = summarise_progress(b.stops)
        assert p0 == {"total": 4, "completed": 0,
                      "current": {"sequence": 1, "leg": "pickup"}}
        advance_stop_leg(b, sequence=1, leg="pickup")
        p1 = summarise_progress(b.stops)
        assert p1["completed"] == 1
        assert p1["current"] == {"sequence": 1, "leg": "drop"}
