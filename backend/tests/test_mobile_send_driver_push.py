# Phase D — optional: real driver accepts a CI booking, pushes GPS → customer WS receives snapshot with driver_location
import asyncio
import json
import os
import time

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
WS = API.replace("https://", "wss://")
DRV_PHONE = "+919990001234"


def _cust_token():
    d = requests.post(f"{API}/auth/otp/request", json={"country_code": "+225", "phone": "0700000001"}).json()
    return requests.post(f"{API}/auth/otp/verify", json={"challenge_id": d["challenge_id"], "code": d["dev_code"]}).json()["access_token"]


def _drv_token():
    r = requests.post(f"{API}/driver/auth/request-otp", json={"phone_e164": DRV_PHONE, "country": "IN"})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_hint")
    v = requests.post(f"{API}/driver/auth/verify-otp", json={"phone_e164": DRV_PHONE, "code": code})
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


def test_driver_push_reaches_customer_ws():
    ct, dt = _cust_token(), _drv_token()
    ch, dh = {"Authorization": f"Bearer {ct}"}, {"Authorization": f"Bearer {dt}"}
    print("online", requests.post(f"{API}/driver/me/online", headers=dh, json={"is_online": True}).status_code)
    print("loc", requests.post(f"{API}/driver/me/location", headers=dh, json={"lat": 28.6139, "lng": 77.2090}).text[:200])
    b = requests.post(f"{API}/express/bookings/parcel", headers=ch, json={
        "country": "IN", "vehicle_code": "bike",
        "pickup": {"line1": "Cocody", "latitude": 28.614, "longitude": 77.209},
        "drop": {"line1": "Plateau", "latitude": 28.63, "longitude": 77.22},
        "receiver": {"name": "TEST_Drv", "phone": "+22507123456"}, "payment_method": "cod"}).json()
    bid = b["id"]
    print("booking", bid, b["status"])
    offer = None
    for _ in range(6):
        o = requests.get(f"{API}/driver/me/offers/current", headers=dh)
        print("offer", o.status_code, o.text[:200])
        if o.status_code == 200 and o.json() and bid in o.text:
            offer = o.json(); break
        time.sleep(2)
    if not offer:
        requests.post(f"{API}/express/bookings/{bid}/cancel", headers=ch, json={})
        pytest.skip("IN test driver not offered the CI booking — cannot test live push")
    a = requests.post(f"{API}/driver/me/offers/{bid}/accept", headers=dh, json={})
    print("accept", a.status_code, a.text[:200])

    async def go():
        async with websockets.connect(f"{WS}/express/ws/customer/bookings/{bid}?token={ct}") as ws:
            first = json.loads(await asyncio.wait_for(ws.recv(), 10))
            print("first", first.get("status"), first.get("driver_location"))
            await asyncio.sleep(0.5)
            await asyncio.to_thread(requests.post, f"{API}/driver/me/location", headers=dh, json={"lat": 28.62, "lng": 77.215})
            frame = json.loads(await asyncio.wait_for(ws.recv(), 10))
            return frame
    try:
        frame = asyncio.run(go())
        print("pushed", frame.get("type"), frame.get("driver_location"))
        assert frame["type"] == "snapshot"
        loc = frame.get("driver_location") or {}
        assert abs((loc.get("lat") or loc.get("latitude")) - 28.62) < 1e-3
    finally:
        requests.post(f"{API}/express/bookings/{bid}/cancel", headers=ch, json={})
