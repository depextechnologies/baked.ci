# Phase D milestone 1 — mobile SHOP cart/checkout + SEND parcel/multi-stop booking + customer WS
import asyncio
import json
import os
import random

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
WS = API.replace("https://", "wss://").replace("http://", "ws://")
PRODUCT = "shpprd_demo_pieces-accessoires-moto"
PICKUP = {"line1": "Cocody", "latitude": 5.35, "longitude": -4.0, "formatted_address": "Cocody, Abidjan", "city": "Abidjan", "country": "CI"}
DROP1 = {"line1": "Plateau", "latitude": 5.32, "longitude": -4.02, "formatted_address": "Plateau, Abidjan", "city": "Abidjan", "country": "CI"}
DROP2 = {"line1": "Marcory", "latitude": 5.30, "longitude": -3.98, "formatted_address": "Marcory, Abidjan", "city": "Abidjan", "country": "CI"}
ll = lambda a: {"lat": a["latitude"], "lng": a["longitude"]}


def _login(phone):
    r = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": phone})
    assert r.status_code == 200, r.text
    d = r.json()
    v = requests.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


@pytest.fixture(scope="module")
def token():
    return _login("0700000001")


@pytest.fixture(scope="module")
def other_token():
    return _login("07" + str(random.randint(10000000, 99999999)))


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- SHOP ----------
class TestShop:
    def test_product_variants(self):
        r = requests.get(f"{API}/shop/products/{PRODUCT}")
        assert r.status_code == 200
        d = r.json()
        prices = sorted(v["price"] for v in d["variants"])
        assert 9900 in prices and 14900 in prices, prices

    def test_cart_add_and_checkout(self, h):
        # clear cart first
        for it in requests.get(f"{API}/shop/cart/me", headers=h).json().get("items", []):
            requests.delete(f"{API}/shop/cart/items/{it['id']}", headers=h)
        var = requests.get(f"{API}/shop/products/{PRODUCT}").json()["variants"][0]
        r = requests.post(f"{API}/shop/cart/items", headers=h, json={"variant_id": var["id"], "quantity": 2})
        assert r.status_code == 201, r.text
        c = requests.get(f"{API}/shop/cart/me", headers=h).json()
        line = [i for i in c["items"] if i["variant"]["id"] == var["id"]]
        assert line and line[0]["quantity"] == 2
        co = requests.post(f"{API}/shop/checkout", headers=h, json={"payment_method": "cash_on_delivery", "delivery_address": PICKUP})
        assert co.status_code == 201, co.text
        o = co.json()
        oid = o.get("id") or o.get("order", {}).get("id")
        assert oid
        g = requests.get(f"{API}/shop/orders/{oid}", headers=h)
        assert g.status_code == 200, g.text
        mine = requests.get(f"{API}/shop/orders/me", headers=h).json()
        ids = [x["id"] for x in (mine.get("items") if isinstance(mine, dict) else mine)]
        assert oid in ids
        assert requests.get(f"{API}/shop/cart/me", headers=h).json()["items"] == []


# ---------- SEND quotes + booking ----------
class TestSend:
    def test_vehicles_filtered(self):
        r = requests.get(f"{API}/express/vehicles?country=CI&service_type=fresh_products")
        codes = [v["code"] for v in r.json()]
        assert codes and all(c.startswith("ref_") for c in codes), codes

    def test_parcel_quote(self):
        r = requests.post(f"{API}/express/quote/parcel", json={"country": "CI", "vehicle_code": "bike", "pickup_lat": 5.35, "pickup_lng": -4.0, "drop_lat": 5.32, "drop_lng": -4.02})
        assert r.status_code == 200
        assert r.json()["total"] > 0

    def test_multi_stop_quote(self):
        legs = [{"pickup": ll(PICKUP), "drop": ll(DROP1)}, {"pickup": ll(DROP1), "drop": ll(DROP2)}]
        r = requests.post(f"{API}/express/quote/multi_stop", json={"country": "CI", "vehicle_code": "bike", "stops": legs})
        assert r.status_code == 200, r.text
        assert "extra_stop_surcharge" in json.dumps(r.json())

    def test_single_booking_total_matches_quote(self, h):
        q = requests.post(f"{API}/express/quote/parcel", json={"country": "CI", "vehicle_code": "bike", "pickup_lat": 5.35, "pickup_lng": -4.0, "drop_lat": 5.32, "drop_lng": -4.02}).json()
        b = requests.post(f"{API}/express/bookings/parcel", headers=h, json={
            "country": "CI", "vehicle_code": "bike", "service_type": "moto", "pickup": PICKUP, "drop": DROP1,
            "receiver": {"name": "TEST_Recv", "phone": "+22507123456", "preferences": []}, "payment_method": "cod"})
        assert b.status_code == 200, b.text
        bd = b.json()
        assert abs(float(bd["total"]) - float(q["total"])) < 1
        assert bd["status"] == "searching"
        pytest.booking_id = bd["id"]

    # Replicates exactly the mobile payload for moto + 2 drops (book.tsx)
    def _mobile_multi_payload(self, service):
        legs = [{"pickup": {**PICKUP, **ll(PICKUP)}, "drop": {**DROP1, **ll(DROP1), "receiver_name": "TEST_R", "receiver_phone": "+22507123456"}},
                {"pickup": {**DROP1, **ll(DROP1)}, "drop": {**DROP2, **ll(DROP2), "receiver_name": "TEST_R", "receiver_phone": "+22507123456"}}]
        return {"country": "CI", "vehicle_code": "bike", "service_type": service, "pickup": PICKUP, "drop": DROP2, "stops": legs,
                "receiver": {"name": "TEST_R", "phone": "+22507123456", "preferences": []}, "payment_method": "cod"}

    def test_mobile_multi_moto_booking(self, h):
        legs = [{"pickup": ll(PICKUP), "drop": ll(DROP1)}, {"pickup": ll(DROP1), "drop": ll(DROP2)}]
        mq = requests.post(f"{API}/express/quote/multi_stop", json={"country": "CI", "vehicle_code": "bike", "stops": legs}).json()
        b = requests.post(f"{API}/express/bookings/parcel", headers=h, json=self._mobile_multi_payload("moto"))
        assert b.status_code == 200, b.text
        bd = b.json()
        print("multi moto total", bd["total"], "quote", mq["total"], "stops", bd.get("stops") and len(bd["stops"]))
        assert bd.get("stops") and len(bd["stops"]) == 2, "stops[] not persisted for service moto"
        assert abs(float(bd["total"]) - float(mq["total"])) < 1, "booking total != multi_stop quote shown on mobile"

    def test_mobile_multi_multiple_shipments_booking(self, h):
        b = requests.post(f"{API}/express/bookings/parcel", headers=h, json=self._mobile_multi_payload("multiple_shipments"))
        assert b.status_code == 200, b.text
        assert len(b.json()["stops"]) == 2

    def test_bookings_mine(self, h):
        r = requests.get(f"{API}/express/bookings/mine", headers=h)
        assert r.status_code == 200
        d = r.json()
        rows = d if isinstance(d, list) else d.get("items", d.get("bookings", []))
        assert any(x["id"] == pytest.booking_id for x in rows)


# ---------- WS ----------
async def _ws(url, send_ping=True):
    async with websockets.connect(url, open_timeout=10) as ws:
        first = json.loads(await asyncio.wait_for(ws.recv(), 10))
        pong = None
        if send_ping:
            await ws.send("ping")
            pong = json.loads(await asyncio.wait_for(ws.recv(), 10))
        return first, pong


class TestWS:
    def test_snapshot_and_pong(self, token):
        first, pong = asyncio.run(_ws(f"{WS}/express/ws/customer/bookings/{pytest.booking_id}?token={token}"))
        assert first["type"] == "snapshot" and first.get("status") == "searching"
        assert pong == {"type": "pong"}

    @pytest.mark.parametrize("tok", ["", "bad.token.x", "OTHER"])
    def test_rejected(self, tok, other_token):
        t = other_token if tok == "OTHER" else tok
        with pytest.raises(Exception) as e:
            asyncio.run(_ws(f"{WS}/express/ws/customer/bookings/{pytest.booking_id}?token={t}", send_ping=False))
        print("rejected:", repr(e.value)[:150])
        assert "403" in str(e.value) or "4403" in str(e.value)

    def test_legacy_socket_unchanged(self):
        first, _ = asyncio.run(_ws(f"{WS}/express/ws/bookings/{pytest.booking_id}", send_ping=False))
        assert isinstance(first, dict)


class TestCancel:
    def test_cancel(self, h):
        r = requests.post(f"{API}/express/bookings/{pytest.booking_id}/cancel", headers=h, json={})
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/express/bookings/{pytest.booking_id}", headers=h).json()
        assert g["status"] == "cancelled"

    def test_other_customer_cannot_read(self, other_token):
        r = requests.get(f"{API}/express/bookings/{pytest.booking_id}", headers={"Authorization": f"Bearer {other_token}"})
        assert r.status_code in (403, 404)
