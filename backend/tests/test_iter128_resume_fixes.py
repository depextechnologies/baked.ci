# Iter128: emergent/session error mapping (401/503) + SEND quote endpoints used by native resume flows
import os
import sys
import asyncio
import pytest
import requests
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
sys.path.insert(0, "/app/backend")


# Emergent session: invalid → 401 (public), network failure → 503 (unit, httpx patched)
class TestEmergentSessionErrors:
    def test_invalid_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/emergent/session", json={"session_id": "TEST_invalid_session_abcdef123"})
        assert r.status_code == 401, r.text
        assert isinstance(r.json().get("detail"), str)

    def test_network_failure_503(self, monkeypatch):
        from fastapi import HTTPException
        from shared.auth import routes

        class Boom:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, *a, **k): raise httpx.ConnectError("down")

        monkeypatch.setattr(routes.httpx, "AsyncClient", Boom)
        payload = routes.EmergentSessionIn(session_id="TEST_session_network_fail")
        with pytest.raises(HTTPException) as ei:
            asyncio.run(routes.emergent_google_session(payload, session=None))
        assert ei.value.status_code == 503

    def test_timeout_503(self, monkeypatch):
        from fastapi import HTTPException
        from shared.auth import routes

        class Slow:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, *a, **k): raise httpx.ReadTimeout("slow")

        monkeypatch.setattr(routes.httpx, "AsyncClient", Slow)
        with pytest.raises(HTTPException) as ei:
            asyncio.run(routes.emergent_google_session(routes.EmergentSessionIn(session_id="TEST_session_timeout"), session=None))
        assert ei.value.status_code == 503


# Parcel quotes return the country currency (used for ₹ / CFA display on vehicle step)
@pytest.mark.parametrize("cc,lat,lng,dlat,dlng,cur", [
    ("IN", 28.5706, 77.3272, 28.6315, 77.2167, "INR"),
    ("CI", 5.3600, -4.0083, 5.3200, -4.0200, "XOF"),
])
def test_parcel_quote_currency(cc, lat, lng, dlat, dlng, cur):
    vs = requests.get(f"{BASE_URL}/api/express/vehicles?country={cc}&service_type=moto").json()
    assert isinstance(vs, list) and vs, f"no moto vehicles for {cc}"
    for v in vs:
        r = requests.post(f"{BASE_URL}/api/express/quote/parcel", json={"country": cc, "vehicle_code": v["code"], "pickup_lat": lat, "pickup_lng": lng, "drop_lat": dlat, "drop_lng": dlng})
        assert r.status_code == 200, f"{cc}/{v['code']}: {r.text[:200]}"
        q = r.json()
        assert q["currency"] == cur
        assert q["total"] > 0


# Movers browsable without login: catalogue + quote are public (CI; IN has no movers items - data gap)
def test_movers_public_quote():
    assert requests.get(f"{BASE_URL}/api/express/movers/move-types").status_code == 200
    items = requests.get(f"{BASE_URL}/api/express/movers/items?country=CI").json()
    assert items
    r = requests.post(f"{BASE_URL}/api/express/quote/movers", json={
        "country": "CI", "pickup_lat": 5.36, "pickup_lng": -4.0083, "drop_lat": 5.32, "drop_lng": -4.02,
        "items": [{"item_id": items[0]["id"], "qty": 2}], "labour_movers": 2, "floors_pickup": 1, "floors_drop": 0,
        "stairs_pickup": True, "stairs_drop": False, "time_slot_surcharge": 0})
    assert r.status_code == 200, r.text
    q = r.json()
    assert q.get("currency") == "XOF"
    assert q.get("advance") is not None
