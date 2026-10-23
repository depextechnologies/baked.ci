# SEND live driver markers — GET /api/express/drivers/nearby (public) + driver online/offline flow
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PHONE = "+919990001234"
NEARBY = f"{BASE_URL}/api/express/drivers/nearby"
DELHI = {"country": "IN", "lat": 28.6139, "lng": 77.209}


@pytest.fixture(scope="module")
def driver_token():
    r = requests.post(f"{BASE_URL}/api/driver/auth/request-otp", json={"phone_e164": PHONE, "country": "IN"})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_hint")
    assert code, r.text
    r = requests.post(f"{BASE_URL}/api/driver/auth/verify-otp", json={"phone_e164": PHONE, "code": code})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    yield tok
    # teardown: set offline
    requests.post(f"{BASE_URL}/api/driver/me/online", json={"is_online": False},
                  headers={"Authorization": f"Bearer {tok}"})


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# --- validation ---
class TestValidation:
    def test_missing_params(self):
        assert requests.get(NEARBY).status_code == 422

    @pytest.mark.parametrize("params", [
        {"country": "IN", "lat": 91, "lng": 0},
        {"country": "IN", "lat": 0, "lng": 181},
        {"country": "IND", "lat": 0, "lng": 0},
        {"country": "I", "lat": 0, "lng": 0},
        {"country": "IN", "lat": 0, "lng": 0, "radius_km": 16},
        {"country": "IN", "lat": 0, "lng": 0, "radius_km": 0},
        {"country": "IN", "lat": "abc", "lng": 0},
    ])
    def test_invalid(self, params):
        assert requests.get(NEARBY, params=params).status_code == 422

    def test_shape_ci(self):
        r = requests.get(NEARBY, params={"country": "CI", "lat": 5.36, "lng": -4.0})
        assert r.status_code == 200
        d = r.json()
        assert set(d.keys()) >= {"radius_km", "count", "drivers", "stale_after_s", "as_of"}
        assert d["radius_km"] == 5.0
        assert d["stale_after_s"] == 60
        assert d["count"] == len(d["drivers"])


# --- live flow ---
class TestLiveFlow:
    def test_online_then_visible(self, driver_token):
        r = requests.post(f"{BASE_URL}/api/driver/me/online",
                          json={"is_online": True, "lat": 28.6139, "lng": 77.209}, headers=_h(driver_token))
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/api/driver/me/location", json={"lat": 28.616, "lng": 77.211},
                          headers=_h(driver_token))
        assert r.status_code == 200, r.text
        d = requests.get(NEARBY, params=DELHI).json()
        assert d["count"] >= 1, d
        drv = d["drivers"][0]
        assert set(drv.keys()) == {"vehicle_type", "lat", "lng", "distance_km"}
        assert drv["lat"] == 28.616 and drv["lng"] == 77.211
        assert 0 < drv["distance_km"] <= 5
        # lowercase country
        assert requests.get(NEARBY, params={**DELHI, "country": "in"}).json()["count"] == d["count"]

    def test_far_origin_zero(self, driver_token):
        d = requests.get(NEARBY, params={"country": "IN", "lat": 19.07, "lng": 72.87}).json()
        assert d["count"] == 0

    def test_other_country_zero(self, driver_token):
        d = requests.get(NEARBY, params={**DELHI, "country": "CI"}).json()
        assert d["count"] == 0

    def test_radius_edges(self, driver_token):
        # driver ~0.3 km away; radius 0.1 excludes, 15 includes
        assert requests.get(NEARBY, params={**DELHI, "radius_km": 0.1}).json()["count"] == 0
        d = requests.get(NEARBY, params={**DELHI, "radius_km": 15}).json()
        assert d["count"] >= 1 and d["radius_km"] == 15

    def test_no_identity_in_payload(self, driver_token):
        txt = requests.get(NEARBY, params=DELHI).text
        assert "drv_" not in txt and "9990001234" not in txt and '"id"' not in txt

    def test_offline_then_hidden(self, driver_token):
        r = requests.post(f"{BASE_URL}/api/driver/me/online", json={"is_online": False}, headers=_h(driver_token))
        assert r.status_code == 200, r.text
        assert requests.get(NEARBY, params=DELHI).json()["count"] == 0

    def test_stale_after_60s(self, driver_token):
        requests.post(f"{BASE_URL}/api/driver/me/online",
                      json={"is_online": True, "lat": 28.616, "lng": 77.211}, headers=_h(driver_token))
        assert requests.get(NEARBY, params=DELHI).json()["count"] >= 1
        time.sleep(63)
        assert requests.get(NEARBY, params=DELHI).json()["count"] == 0
