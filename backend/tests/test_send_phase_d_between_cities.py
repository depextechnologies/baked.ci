"""SENDbakēd Phase D — Between-Cities eligibility regression.

Guards the seed reconciliation: after Phase D drops `three_wheeler` from
`between_cities`, the config table must expose ONLY mini_truck + truck for
that service, and the vehicle-filter endpoint must reflect the same.
"""
from __future__ import annotations

import os

import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"


BETWEEN_CITIES_ELIGIBLE = {"mini_truck", "truck"}


def test_services_catalogue_between_cities_is_two_vehicles_only():
    r = requests.get(f"{API}/express/services", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    codes = {row["vehicle_code"] for row in body["services"]["between_cities"]}
    assert codes == BETWEEN_CITIES_ELIGIBLE, codes
    # Explicit safety: no small-format vehicle should still be advertised.
    assert "three_wheeler" not in codes
    assert "bike" not in codes


def test_vehicles_endpoint_between_cities_filters_correctly():
    r = requests.get(f"{API}/express/vehicles?country=CI&service_type=between_cities", timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    codes = {v["code"] for v in rows}
    assert codes == BETWEEN_CITIES_ELIGIBLE, codes
    # Order matters — mini_truck should sort before truck per the seed.
    assert [v["code"] for v in rows] == ["mini_truck", "truck"]
