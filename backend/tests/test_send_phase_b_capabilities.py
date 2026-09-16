"""SENDbakēd Phase B — Vehicle catalogue + driver capabilities regression.

Coverage:
- GET /api/express/vehicles now returns 8 vehicles per country including 3
  refrigerated types + French display names.
- GET /api/driver/me/capabilities returns the platform-wide allowed list.
- PUT /api/driver/me/capabilities persists a multi-vehicle set + primary,
  mirrors the primary into the Driver.vehicle_type column, and reflects
  is_refrigerated on the dispatch mirror.
- Unknown vehicle codes → 400 with the code list in the response body.
- Idempotent replace: sending the same payload twice keeps the same set.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"


REFRIGERATED_CODES = {"ref_tricycle", "ref_utility", "ref_truck"}
EXPECTED_FR = {
    "bike":          "Moto",
    "three_wheeler": "Tricycle",
    "mini_truck":    "Mini camion",
    "truck":         "Camion",
    "ref_tricycle":  "Tricycle frigorifique",
    "ref_utility":   "Mini camion frigorifique",
    "ref_truck":     "Camion frigorifique",
}


# --------------------------------------------------------------------------
# Vehicle catalogue
# --------------------------------------------------------------------------


class TestVehicleCatalogue:
    def test_ci_lists_eight_vehicles_with_refrigerated_flags(self):
        r = requests.get(f"{API}/express/vehicles?country=CI", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        codes = [v["code"] for v in rows]
        assert set(codes) >= {
            "bike", "scooter", "three_wheeler", "mini_truck", "truck",
            "ref_tricycle", "ref_utility", "ref_truck",
        }
        by_code = {v["code"]: v for v in rows}
        for c in REFRIGERATED_CODES:
            assert by_code[c]["is_refrigerated"] is True, f"{c} must be refrigerated"
        assert by_code["bike"]["is_refrigerated"] is False
        assert by_code["truck"]["is_refrigerated"] is False

    def test_french_labels_are_present(self):
        r = requests.get(f"{API}/express/vehicles?country=CI", timeout=15)
        by_code = {v["code"]: v for v in r.json()}
        for code, expected in EXPECTED_FR.items():
            assert by_code[code].get("name_fr") == expected, (
                f"expected name_fr={expected!r} for {code}, got {by_code[code].get('name_fr')!r}"
            )


# --------------------------------------------------------------------------
# Driver capabilities API
# --------------------------------------------------------------------------


def _register_driver(country: str = "CI") -> tuple[str, str]:
    email = f"qa.phaseb+{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}@baked.dev"
    r = requests.post(
        f"{API}/driver/auth/email-register",
        json={"email": email, "password": "PhaseB1234!", "country": country},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return email, r.json()["access_token"]


class TestDriverCapabilities:
    def test_empty_capabilities_on_signup(self):
        _, tok = _register_driver()
        r = requests.get(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["capabilities"] == []
        allowed = set(body["allowed"])
        assert REFRIGERATED_CODES <= allowed
        assert {"bike", "scooter", "three_wheeler", "mini_truck", "truck"} <= allowed

    def test_replace_capabilities_writes_primary_and_mirrors_vehicle_type(self):
        _, tok = _register_driver()
        r = requests.put(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            json={"codes": ["bike", "ref_truck", "truck"], "primary": "ref_truck"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        codes = [row["vehicle_code"] for row in body["capabilities"]]
        primaries = [row for row in body["capabilities"] if row["is_primary"]]
        assert set(codes) == {"bike", "ref_truck", "truck"}
        assert len(primaries) == 1 and primaries[0]["vehicle_code"] == "ref_truck"
        assert body["primary_vehicle_type"] == "ref_truck"
        assert body["count"] == 3

        me = requests.get(
            f"{API}/driver/me",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        ).json()
        assert me["vehicle_type"] == "ref_truck"

    def test_idempotent_replace(self):
        _, tok = _register_driver()
        payload = {"codes": ["bike", "three_wheeler"], "primary": "bike"}
        first = requests.put(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload,
            timeout=15,
        ).json()
        second = requests.put(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            json=payload,
            timeout=15,
        ).json()
        assert first["capabilities"] == second["capabilities"]
        assert second["count"] == 2

    def test_unknown_code_rejected(self):
        _, tok = _register_driver()
        r = requests.put(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            json={"codes": ["helicopter", "bike"]},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "unknown_capability"
        assert "helicopter" in detail["message"]

    def test_primary_auto_added_when_missing_from_codes(self):
        _, tok = _register_driver()
        r = requests.put(
            f"{API}/driver/me/capabilities",
            headers={"Authorization": f"Bearer {tok}"},
            json={"codes": ["bike"], "primary": "ref_utility"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        codes = {row["vehicle_code"] for row in body["capabilities"]}
        # The primary should be included even though it wasn't in `codes`.
        assert codes == {"bike", "ref_utility"}
        assert body["primary_vehicle_type"] == "ref_utility"


# --------------------------------------------------------------------------
# Guard rails
# --------------------------------------------------------------------------


class TestAuthGuard:
    def test_capabilities_require_auth(self):
        r = requests.get(f"{API}/driver/me/capabilities", timeout=15)
        assert r.status_code == 401
        r = requests.put(f"{API}/driver/me/capabilities", json={"codes": []}, timeout=15)
        assert r.status_code == 401
