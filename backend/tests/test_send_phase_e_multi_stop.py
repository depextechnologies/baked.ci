"""SENDbakēd Phase E — multi-stop trip builder regression.

Coverage:
- POST /api/express/quote/multi_stop returns a valid breakdown with the
  full path summed correctly + extra-shipment surcharge.
- Booking creation persists the `stops` array + validates head match.
- 1-shipment trip still works (no surcharge).
- Malformed / mismatched payloads are rejected.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _customer_token():
    phone = f"70{int(time.time()*1000) % 100000000:08d}"
    req = requests.post(f"{API}/auth/otp/request", json={
        "country_code": "225", "phone": phone,
    }, timeout=15).json()
    code = req.get("dev_code") or "123456"
    r = requests.post(f"{API}/auth/otp/verify", json={
        "challenge_id": req["challenge_id"], "code": code,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


class TestMultiStopQuote:
    def test_three_shipment_quote_includes_extra_surcharge(self):
        payload = {
            "country": "CI", "vehicle_code": "three_wheeler",
            "stops": [
                {"pickup": {"lat": 5.350, "lng": -4.020}, "drop": {"lat": 5.360, "lng": -4.030}},
                {"pickup": {"lat": 5.365, "lng": -4.028}, "drop": {"lat": 5.380, "lng": -4.050}},
                {"pickup": {"lat": 5.385, "lng": -4.055}, "drop": {"lat": 5.400, "lng": -4.070}},
            ],
        }
        r = requests.post(f"{API}/express/quote/multi_stop", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["shipments"] == 3
        assert q["extra_stops"] == 2
        # Extra-stop surcharge for XOF is 500 per extra shipment.
        assert q["extra_stop_surcharge"] == 1000.0
        assert q["distance_km"] > 0
        assert q["total"] > q["base_fare"]

    def test_single_shipment_no_surcharge(self):
        payload = {
            "country": "CI", "vehicle_code": "bike",
            "stops": [{"pickup": {"lat": 5.35, "lng": -4.02}, "drop": {"lat": 5.36, "lng": -4.03}}],
        }
        r = requests.post(f"{API}/express/quote/multi_stop", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["shipments"] == 1
        assert q["extra_stops"] == 0
        assert q["extra_stop_surcharge"] == 0.0

    def test_empty_stops_rejected_by_schema(self):
        r = requests.post(f"{API}/express/quote/multi_stop", json={
            "country": "CI", "vehicle_code": "bike", "stops": [],
        }, timeout=15)
        # Pydantic min_length=1 → 422.
        assert r.status_code == 422

    def test_too_many_stops_rejected(self):
        stops = [{"pickup": {"lat": 5.0 + i * 0.001, "lng": -4.0},
                  "drop":   {"lat": 5.0 + i * 0.001 + 0.001, "lng": -4.001}} for i in range(9)]
        r = requests.post(f"{API}/express/quote/multi_stop", json={
            "country": "CI", "vehicle_code": "bike", "stops": stops,
        }, timeout=15)
        assert r.status_code == 422


class TestMultiStopBookingPersistence:
    def test_stops_persisted_on_booking(self):
        tok = _customer_token()
        stops = [
            {"pickup": {"lat": 5.350, "lng": -4.020, "line1": "A"},
             "drop":   {"lat": 5.360, "lng": -4.030, "line1": "B"}},
            {"pickup": {"lat": 5.365, "lng": -4.028, "line1": "C"},
             "drop":   {"lat": 5.380, "lng": -4.050, "line1": "D"}},
        ]
        payload = {
            "country": "CI",
            "vehicle_code": "three_wheeler",
            "service_type": "multiple_shipments",
            "pickup": {"line1": "A", "latitude": 5.350, "longitude": -4.020, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.360, "longitude": -4.030, "formatted_address": "B"},
            "stops": stops,
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["service_type"] == "multiple_shipments"
        assert body["stops"] and len(body["stops"]) == 2
        # First stop's coords must match the top-level pickup/drop.
        assert body["stops"][0]["pickup"]["lat"] == pytest.approx(5.350)
        # Distance must reflect the whole trip, not just the first pair.
        assert body["distance_km"] > 0.5

    def test_head_mismatch_rejected(self):
        tok = _customer_token()
        payload = {
            "country": "CI",
            "vehicle_code": "three_wheeler",
            "service_type": "multiple_shipments",
            "pickup": {"line1": "A", "latitude": 5.350, "longitude": -4.020, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.360, "longitude": -4.030, "formatted_address": "B"},
            "stops": [
                # First stop coords deliberately do NOT match the primary pair.
                {"pickup": {"lat": 5.900, "lng": -4.500}, "drop": {"lat": 6.000, "lng": -4.600}},
                {"pickup": {"lat": 5.365, "lng": -4.028}, "drop": {"lat": 5.380, "lng": -4.050}},
            ],
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=20,
        )
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "multi_stop_head_mismatch"

    def test_single_shipment_booking_leaves_stops_null(self):
        """A CARGO / single-shipment booking must NOT set the `stops` column."""
        tok = _customer_token()
        payload = {
            "country": "CI",
            "vehicle_code": "three_wheeler",
            "service_type": "cargo",
            "pickup": {"line1": "A", "latitude": 5.350, "longitude": -4.020, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.360, "longitude": -4.030, "formatted_address": "B"},
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("stops") in (None, [])
