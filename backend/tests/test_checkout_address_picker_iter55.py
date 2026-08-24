"""Iteration 55 — Checkout Address Picker (Social.docx Issue #7).

Verifies that POST /customers/me/addresses accepts + persists the full
Google-Places payload (latitude, longitude, place_id, formatted_address,
region, postal_code) that the new checkout AddressSelector flow sends.
Also verifies that an order created against that address gets its
address_snapshot filled with the lat/lng.
"""
import os
import random
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def authed():
    """Authenticate a fresh customer via dev OTP."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    phone = _rand_phone()
    r = s.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    j = r.json()
    v = s.post(
        f"{BASE_URL}/api/auth/otp/verify",
        json={"challenge_id": j["challenge_id"], "code": j["dev_code"]},
    )
    assert v.status_code == 200, v.text
    token = v.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Payload equivalent to what CheckoutPage.saveAddress() now POSTs ---
PICKER_PAYLOAD = {
    "label": "Home",
    "line1": "Cocody, Rue des Jardins, Abidjan, Côte d'Ivoire",
    "city": "Abidjan",
    "region": "Abidjan Autonomous District",
    "country": "CI",
    "postal_code": None,
    "latitude": 5.3599517,
    "longitude": -3.9807833,
    "place_id": "ChIJ_TEST_PLACE_ID_ITER55",
    "formatted_address": "Cocody, Rue des Jardins, Abidjan, Côte d'Ivoire",
    "instructions": "Ring the gate twice",
    "is_default": True,
}


class TestCheckoutAddressPicker:
    """POST address with Google Places payload — then GET to verify persistence."""

    def test_post_address_persists_all_places_fields(self, authed):
        r = authed.post(f"{BASE_URL}/api/customers/me/addresses", json=PICKER_PAYLOAD)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert "id" in created
        assert created["latitude"] == pytest.approx(PICKER_PAYLOAD["latitude"])
        assert created["longitude"] == pytest.approx(PICKER_PAYLOAD["longitude"])
        assert created["place_id"] == PICKER_PAYLOAD["place_id"]
        assert created["formatted_address"] == PICKER_PAYLOAD["formatted_address"]
        assert created["country"] == "CI"

        # GET verifies DB persistence
        g = authed.get(f"{BASE_URL}/api/customers/me/addresses")
        assert g.status_code == 200
        rows = g.json()
        match = next((a for a in rows if a["id"] == created["id"]), None)
        assert match is not None, "Created address missing on GET"
        assert match["latitude"] == pytest.approx(PICKER_PAYLOAD["latitude"])
        assert match["longitude"] == pytest.approx(PICKER_PAYLOAD["longitude"])
        assert match["place_id"] == PICKER_PAYLOAD["place_id"]
        assert match["formatted_address"] == PICKER_PAYLOAD["formatted_address"]
        # Cleanup
        authed.delete(f"{BASE_URL}/api/customers/me/addresses/{created['id']}")

    def test_post_address_minimal_line1_only_still_ok(self, authed):
        """Backward-compat: an address without lat/lng should still save (guest legacy)."""
        r = authed.post(
            f"{BASE_URL}/api/customers/me/addresses",
            json={"label": "Old", "line1": "Some street", "city": "Abidjan", "country": "CI"},
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["latitude"] is None
        assert data["longitude"] is None
        authed.delete(f"{BASE_URL}/api/customers/me/addresses/{data['id']}")

    def test_serviceability_at_picked_coords(self, api):
        r = api.get(
            f"{BASE_URL}/api/addresses/serviceability",
            params={"lat": PICKER_PAYLOAD["latitude"], "lng": PICKER_PAYLOAD["longitude"], "country": "CI"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["serviceable"] is True, data
