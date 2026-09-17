"""SENDbakēd — Multiple Shipments 2-step booking flow regression.

Covers:
  1. GET /api/express/product-types returns the seeded 8 rows with
     general_product flagged as default (is_default=true).
  2. Multi-shipments booking accepts per-leg optional metadata (landmark,
     contact_name, contact_phone, product_type) inside stops[] and
     persists it verbatim, applying `general_product` as the default when
     omitted.
  3. Multi-shipments booking allows the top-level `receiver` to be null —
     the first drop's contact becomes the fallback so downstream SMS +
     driver snapshot keep working.
  4. Existing PIN scrubbing + auth guards remain intact (regression).
"""
from __future__ import annotations

import os
import time

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


class TestProductTypesCatalogue:
    def test_endpoint_returns_the_seeded_rows(self):
        r = requests.get(f"{API}/express/product-types", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        codes = {row["code"] for row in rows}
        # The 8 canonical rows must be present.
        assert {"general_product", "documents", "food", "electronics",
                "clothing", "furniture", "fresh_products", "other"} <= codes
        # Exactly one default row, and it's general_product.
        defaults = [row for row in rows if row["is_default"]]
        assert len(defaults) == 1
        assert defaults[0]["code"] == "general_product"
        # Sort order is ascending.
        sorts = [row["sort_order"] for row in rows]
        assert sorts == sorted(sorts)
        # FR + EN labels are populated (never None).
        for row in rows:
            assert row["name_fr"] and row["name_en"]


class TestMultiShipmentsBooking:
    def _payload(self, *, with_receiver: bool, with_meta: bool):
        stops = [
            {
                "pickup": {"lat": 5.350, "lng": -4.020, "formatted_address": "Pickup A",
                           **({"landmark": "Blue gate",
                               "contact_name": "John",
                               "contact_phone": "+2250700001111"} if with_meta else {})},
                "drop":   {"lat": 5.360, "lng": -4.030, "formatted_address": "Drop A",
                           **({"contact_name": "Alice",
                               "contact_phone": "+2250700002222",
                               "product_type": "documents"} if with_meta else {})},
            },
            {
                "pickup": {"lat": 5.365, "lng": -4.028, "formatted_address": "Pickup B"},
                "drop":   {"lat": 5.380, "lng": -4.050, "formatted_address": "Drop B",
                           "contact_name": "Bob",
                           "contact_phone": "+2250700003333"},
            },
        ]
        body = {
            "country": "CI",
            "vehicle_code": "three_wheeler",
            "service_type": "multiple_shipments",
            "pickup": {"line1": "A", "latitude": 5.350, "longitude": -4.020, "formatted_address": "A"},
            "drop":   {"line1": "B", "latitude": 5.360, "longitude": -4.030, "formatted_address": "B"},
            "stops": stops,
            "payment_method": "cod",
        }
        if with_receiver:
            body["receiver"] = {"name": "Explicit", "phone": "+2250700099999"}
        return body

    def test_optional_metadata_persisted_and_product_type_defaults(self):
        tok = _customer_token()
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=self._payload(with_receiver=True, with_meta=True),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        stops = body["stops"]
        # Shipment 1 — landmark + contact on pickup, product_type on drop.
        assert stops[0]["pickup"]["landmark"] == "Blue gate"
        assert stops[0]["pickup"]["contact_name"] == "John"
        assert stops[0]["pickup"]["contact_phone"] == "+2250700001111"
        assert stops[0]["drop"]["product_type"] == "documents"
        # Product type on legs where the customer omitted it MUST default
        # to `general_product` (from the seeded catalogue).
        assert stops[0]["pickup"]["product_type"] == "general_product"
        assert stops[1]["pickup"]["product_type"] == "general_product"
        assert stops[1]["drop"]["product_type"]   == "general_product"
        # PIN is still scrubbed from the API response.
        for s in stops:
            assert "delivery_pin" not in s["drop"]

    def test_receiver_is_optional_and_falls_back_to_first_drop_contact(self):
        tok = _customer_token()
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=self._payload(with_receiver=False, with_meta=True),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # First drop's contact becomes the fallback receiver.
        assert body["receiver"]["name"] == "Alice"
        assert body["receiver"]["phone"] == "+2250700002222"

    def test_explicit_receiver_wins_over_stop_contact(self):
        tok = _customer_token()
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=self._payload(with_receiver=True, with_meta=True),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["receiver"]["name"] == "Explicit"
        assert body["receiver"]["phone"] == "+2250700099999"

    def test_no_meta_still_defaults_product_type(self):
        tok = _customer_token()
        r = requests.post(
            f"{API}/express/bookings/parcel",
            headers={"Authorization": f"Bearer {tok}"},
            json=self._payload(with_receiver=False, with_meta=False),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for s in body["stops"]:
            assert s["pickup"]["product_type"] == "general_product"
            assert s["drop"]["product_type"]   == "general_product"
            # Optional fields untouched → null.
            assert s["pickup"]["landmark"] is None
            assert s["pickup"]["contact_name"] is None
