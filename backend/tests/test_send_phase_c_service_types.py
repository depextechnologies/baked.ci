"""SENDbakēd Phase C — service_type + service-vehicle eligibility regression.

Coverage:
- GET /api/express/services returns the full service → vehicle catalogue.
- GET /api/express/vehicles?service_type=… filters correctly for each of
  the five SEND service types.
- GET /api/express/vehicles?service_type=<bad> → 400 with allow-list.
- POST /api/express/bookings/parcel with a mismatched (service_type,
  vehicle_code) pair is rejected with `vehicle_not_eligible`.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"


SERVICE_TYPES = ("moto", "cargo", "fresh_products", "between_cities", "multiple_shipments")

# What the seed guarantees per service. Test uses subset assertions so ops
# adding a new eligible vehicle later doesn't break these guards.
EXPECTED = {
    "moto":               {"bike", "three_wheeler", "mini_truck", "truck"},
    "cargo":              {"three_wheeler", "mini_truck", "truck"},
    "fresh_products":     {"ref_tricycle",  "ref_utility", "ref_truck"},
    "between_cities":     {"mini_truck", "truck"},
    "multiple_shipments": {"bike", "three_wheeler", "mini_truck", "truck"},
}


class TestServiceCatalogueEndpoint:
    def test_lists_all_five_services(self):
        r = requests.get(f"{API}/express/services", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body["service_types"]) == set(SERVICE_TYPES)
        for stype, expected_codes in EXPECTED.items():
            codes = {row["vehicle_code"] for row in body["services"].get(stype, [])}
            assert expected_codes <= codes, f"{stype}: expected {expected_codes}, got {codes}"

    def test_no_cross_contamination(self):
        r = requests.get(f"{API}/express/services", timeout=15)
        body = r.json()
        # Fresh Products may only advertise refrigerated codes.
        fresh = {row["vehicle_code"] for row in body["services"]["fresh_products"]}
        assert all(c.startswith("ref_") for c in fresh), fresh
        # CARGO must not include any refrigerated code.
        cargo = {row["vehicle_code"] for row in body["services"]["cargo"]}
        assert not any(c.startswith("ref_") for c in cargo), cargo


class TestVehicleFilterEndpoint:
    @pytest.mark.parametrize("stype,expected", list(EXPECTED.items()))
    def test_vehicles_filtered_by_service_type(self, stype, expected):
        r = requests.get(f"{API}/express/vehicles?country=CI&service_type={stype}", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        codes = {row["code"] for row in rows}
        assert expected <= codes, f"{stype}: expected {expected}, got {codes}"
        if stype == "fresh_products":
            assert all(row["is_refrigerated"] is True for row in rows)
        if stype == "cargo":
            assert all(row["is_refrigerated"] is False for row in rows)

    def test_unfiltered_returns_full_catalogue(self):
        r = requests.get(f"{API}/express/vehicles?country=CI", timeout=15)
        codes = {row["code"] for row in r.json()}
        # All 8 seed codes must be present.
        assert codes >= {
            "bike", "scooter", "three_wheeler", "mini_truck", "truck",
            "ref_tricycle", "ref_utility", "ref_truck",
        }

    def test_unknown_service_type_400(self):
        r = requests.get(f"{API}/express/vehicles?country=CI&service_type=spaceship", timeout=15)
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert detail["code"] == "unknown_service_type"
        assert set(detail["allowed"]) == set(SERVICE_TYPES)


class TestBookingCreationValidation:
    """Booking-endpoint enforces the service → vehicle mapping so a compromised
    client can't submit `service_type=fresh_products` + `vehicle_code=bike`."""

    def _register_customer(self):
        """Register a customer via the OTP flow (dev returns the code inline)."""
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

    def test_mismatched_service_and_vehicle_is_rejected(self):
        tok = self._register_customer()
        payload = {
            "country": "CI",
            "vehicle_code": "bike",             # not eligible for fresh_products
            "service_type": "fresh_products",
            "pickup": {"line1": "A", "latitude": 5.35, "longitude": -4.02, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.36, "longitude": -4.03, "formatted_address": "B"},
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=15,
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "vehicle_not_eligible"
        assert "bike" in detail["message"]
        assert set(detail["eligible_vehicle_codes"]) == EXPECTED["fresh_products"]

    def test_unknown_service_type_is_rejected(self):
        tok = self._register_customer()
        payload = {
            "country": "CI",
            "vehicle_code": "bike",
            "service_type": "not_a_service",
            "pickup": {"line1": "A", "latitude": 5.35, "longitude": -4.02, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.36, "longitude": -4.03, "formatted_address": "B"},
            "receiver": {"name": "R", "phone": "+2250700000000"},
            "payment_method": "cod",
        }
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload, timeout=15,
        )
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "unknown_service_type"
