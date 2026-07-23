"""EXPRESSbakēd — Phase 1 backend tests.

Covers customer-facing Express endpoints:
    - vehicles / package-types / weight-tiers per country
    - parcel & movers quote engine (config-driven, Haversine distance)
    - movers taxonomy (categories, items, move-types, time-slots)
    - authenticated bookings (parcel + movers) with GET-verify persistence
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


# ---------- helpers ----------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="module")
def authed(api):
    """Authenticate a fresh customer via dev OTP."""
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    j = r.json()
    v = api.post(f"{BASE_URL}/api/auth/otp/verify",
                 json={"challenge_id": j["challenge_id"], "code": j["dev_code"]})
    assert v.status_code == 200, v.text
    token = v.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------- Config: vehicles ----------
class TestVehicles:
    def test_vehicles_ci_returns_five(self, api):
        r = api.get(f"{BASE_URL}/api/express/vehicles", params={"country": "CI"})
        assert r.status_code == 200, r.text
        docs = r.json()
        codes = sorted(d["code"] for d in docs)
        assert codes == sorted(["bike", "scooter", "three_wheeler", "mini_truck", "truck"]), codes
        by = {d["code"]: d for d in docs}
        # CI (XOF) expected base prices
        assert by["bike"]["base_price"] == 1500
        assert by["scooter"]["base_price"] == 2500
        assert by["three_wheeler"]["base_price"] == 5000
        assert by["mini_truck"]["base_price"] == 12000
        assert by["truck"]["base_price"] == 25000
        # Required numeric fields present
        for d in docs:
            assert isinstance(d["base_price"], (int, float))
            assert isinstance(d["eta_min_min"], (int, float))
            assert isinstance(d["eta_min_max"], (int, float))
            assert isinstance(d["max_weight_kg"], (int, float))

    def test_vehicles_lr_returns_lrd_prices(self, api):
        r = api.get(f"{BASE_URL}/api/express/vehicles", params={"country": "LR"})
        assert r.status_code == 200, r.text
        docs = r.json()
        by = {d["code"]: d for d in docs}
        assert set(by.keys()) == {"bike", "scooter", "three_wheeler", "mini_truck", "truck"}
        assert by["bike"]["base_price"] == 500
        assert by["scooter"]["base_price"] == 800
        assert by["three_wheeler"]["base_price"] == 1500
        assert by["mini_truck"]["base_price"] == 4000
        assert by["truck"]["base_price"] == 8000


class TestPackageTypesAndWeights:
    def test_package_types(self, api):
        r = api.get(f"{BASE_URL}/api/express/package-types")
        assert r.status_code == 200, r.text
        codes = sorted(d["code"] for d in r.json())
        expected = sorted(["documents", "food", "electronics", "fragile", "furniture", "general"])
        assert codes == expected, codes

    def test_weight_tiers(self, api):
        r = api.get(f"{BASE_URL}/api/express/weight-tiers")
        assert r.status_code == 200, r.text
        tiers = r.json()
        assert len(tiers) == 4
        codes = sorted(t["code"] for t in tiers)
        assert codes == sorted(["wt_upto_5", "wt_5_15", "wt_15_30", "wt_30_plus"])


# ---------- Parcel quote engine ----------
class TestParcelQuote:
    # Plateau ~ (5.36, -4.00), Marcory-ish ~ (5.32, -4.02)
    P1 = {"pickup_lat": 5.36, "pickup_lng": -4.00, "drop_lat": 5.32, "drop_lng": -4.02}

    def test_parcel_quote_bike_ci(self, api):
        payload = {"country": "CI", "vehicle_code": "bike", **self.P1}
        r = api.post(f"{BASE_URL}/api/express/quote/parcel", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        # required breakdown fields
        for k in ("total", "distance_km", "duration_min", "base_fare", "distance_fare",
                  "time_fare", "service_fee", "insurance", "currency", "currency_symbol"):
            assert k in q, f"missing field: {k}"
        assert isinstance(q["total"], (int, float)) and q["total"] > 0
        # Distance approx ~5km (haversine 5.36,-4.0 -> 5.32,-4.02 ≈ 4.9km)
        assert 3 <= q["distance_km"] <= 7, q["distance_km"]
        assert q["duration_min"] >= 5
        assert q["currency"] == "XOF"

    def test_parcel_quote_truck_higher_than_bike(self, api):
        p_bike = {"country": "CI", "vehicle_code": "bike", **self.P1}
        p_truck = {"country": "CI", "vehicle_code": "truck", **self.P1}
        rb = api.post(f"{BASE_URL}/api/express/quote/parcel", json=p_bike).json()
        rt = api.post(f"{BASE_URL}/api/express/quote/parcel", json=p_truck).json()
        assert rt["total"] > rb["total"], (rb["total"], rt["total"])

    def test_parcel_quote_lr_currency(self, api):
        payload = {"country": "LR", "vehicle_code": "bike", **self.P1}
        r = api.post(f"{BASE_URL}/api/express/quote/parcel", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["currency"] == "LRD"
        assert q["total"] > 0


# ---------- Movers config + quote ----------
class TestMovers:
    def test_categories(self, api):
        r = api.get(f"{BASE_URL}/api/express/movers/categories")
        assert r.status_code == 200
        cats = r.json()
        codes = sorted(c["code"] for c in cats)
        assert codes == sorted(["living_room", "bedroom", "kitchen", "office", "outdoor", "others"])

    def test_move_types(self, api):
        r = api.get(f"{BASE_URL}/api/express/movers/move-types")
        assert r.status_code == 200
        types = r.json()
        assert len(types) == 4
        codes = sorted(t["code"] for t in types)
        assert codes == sorted(["house", "office", "mini_labour", "single_item"])

    def test_time_slots_ci(self, api):
        r = api.get(f"{BASE_URL}/api/express/movers/time-slots", params={"country": "CI"})
        assert r.status_code == 200
        slots = r.json()
        assert len(slots) == 4
        by = {s["code"]: s for s in slots}
        assert by["early_morning"]["surcharge"] == 0
        assert by["evening"]["surcharge"] == 900

    def test_items_all_countries_and_seed_count(self, api):
        # No country filter shouldn't error; but endpoint requires country param w/ default CI.
        r_ci = api.get(f"{BASE_URL}/api/express/movers/items", params={"country": "CI"})
        r_lr = api.get(f"{BASE_URL}/api/express/movers/items", params={"country": "LR"})
        assert r_ci.status_code == 200 and r_lr.status_code == 200
        ci_items = r_ci.json()
        lr_items = r_lr.json()
        # Seed file has 27 items — assert >= 25 per country
        assert len(ci_items) >= 25, f"CI items: {len(ci_items)}"
        assert len(lr_items) >= 25, f"LR items: {len(lr_items)}"

    def test_movers_quote_smoke(self, api):
        # Grab first sofa in living_room CI
        r = api.get(f"{BASE_URL}/api/express/movers/items", params={"country": "CI", "category": "living_room"})
        assert r.status_code == 200
        items = r.json()
        assert items, "expected some living_room items"
        item = items[0]
        payload = {
            "country": "CI",
            "pickup_lat": 5.36, "pickup_lng": -4.00,
            "drop_lat": 5.32, "drop_lng": -4.02,
            "items": [{"item_id": item["id"], "qty": 1}],
            "labour_movers": 2,
        }
        q = api.post(f"{BASE_URL}/api/express/quote/movers", json=payload)
        assert q.status_code == 200, q.text
        j = q.json()
        for k in ("total", "transportation", "packing", "loading_unloading",
                  "labour", "insurance", "advance", "remaining", "currency"):
            assert k in j, f"missing {k}"
        assert isinstance(j["total"], (int, float)) and j["total"] > 0
        assert j["advance"] + j["remaining"] == pytest.approx(j["total"], abs=1)


# ---------- Bookings ----------
class TestBookings:
    def _pickup_drop(self):
        return {
            "pickup": {"line1": "Plateau", "latitude": 5.36, "longitude": -4.00,
                       "city": "Abidjan", "country": "CI"},
            "drop": {"line1": "Marcory", "latitude": 5.32, "longitude": -4.02,
                     "city": "Abidjan", "country": "CI"},
        }

    def test_parcel_booking_create_and_fetch(self, authed):
        pd = self._pickup_drop()
        payload = {
            "country": "CI",
            "vehicle_code": "bike",
            **pd,
            "receiver": {"name": "TEST Receiver", "phone": "0100000000",
                         "preferences": ["call_before"]},
            "package_type": "general",
            "package_weight_range": "wt_upto_5",
            "payment_method": "cod",
        }
        r = authed.post(f"{BASE_URL}/api/express/bookings/parcel", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "searching"
        assert doc["ref"].startswith("EXP")
        assert len(doc["ref"]) == 11  # EXP + 8 digits
        assert doc["booking_type"] == "parcel"
        assert isinstance(doc["total"], (int, float)) and doc["total"] > 0
        assert doc["currency"] == "XOF"
        booking_id = doc["id"]

        # GET /bookings/mine
        mine = authed.get(f"{BASE_URL}/api/express/bookings/mine")
        assert mine.status_code == 200
        rows = mine.json()
        ids = [b["id"] for b in rows]
        assert booking_id in ids

        # GET /bookings/{id}
        one = authed.get(f"{BASE_URL}/api/express/bookings/{booking_id}")
        assert one.status_code == 200
        assert one.json()["id"] == booking_id
        assert one.json()["ref"] == doc["ref"]

    def test_parcel_booking_requires_auth(self, api):
        pd = self._pickup_drop()
        payload = {
            "country": "CI", "vehicle_code": "bike", **pd,
            "receiver": {"name": "x", "phone": "y"}, "payment_method": "cod",
        }
        r = api.post(f"{BASE_URL}/api/express/bookings/parcel", json=payload)
        # 401 (unauthorized) or 403 (forbidden) both acceptable — must NOT be 200
        assert r.status_code in (401, 403), r.status_code

    def test_movers_booking_create(self, api, authed):
        r = api.get(f"{BASE_URL}/api/express/movers/items",
                    params={"country": "CI", "category": "living_room"})
        items = r.json()
        assert items
        payload = {
            "country": "CI",
            "move_type": "house",
            "pickup": {"line1": "Plateau", "latitude": 5.36, "longitude": -4.00,
                       "city": "Abidjan", "country": "CI"},
            "drop": {"line1": "Marcory", "latitude": 5.32, "longitude": -4.02,
                     "city": "Abidjan", "country": "CI"},
            "pickup_building": {"floor": 1, "stairs": False},
            "drop_building": {"floor": 0, "stairs": False},
            "items": [{"item_id": items[0]["id"], "qty": 1}],
            "labour_movers": 2,
            "time_slot_code": "early_morning",
            "scheduled_date": "2026-12-01",
            "payment_method": "cod",
        }
        r = authed.post(f"{BASE_URL}/api/express/bookings/movers", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["booking_type"] == "movers"
        assert doc["move_type"] == "house"
        assert doc["ref"].startswith("EXPMV")
        assert isinstance(doc["advance"], (int, float)) and doc["advance"] > 0
        assert isinstance(doc["remaining"], (int, float)) and doc["remaining"] >= 0
        assert doc["advance"] + doc["remaining"] == pytest.approx(doc["total"], abs=1)
        # persistence
        one = authed.get(f"{BASE_URL}/api/express/bookings/{doc['id']}")
        assert one.status_code == 200
        assert one.json()["booking_type"] == "movers"
