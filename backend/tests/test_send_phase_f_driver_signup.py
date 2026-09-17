"""SENDbakēd Phase F — Driver multi-vehicle signup regression.

Guards:
- The KYC vehicle step now accepts SEND-primary codes (`three_wheeler`,
  `truck`, `ref_*`) so a new driver picking a refrigerated primary
  during onboarding doesn't hit the legacy allow-list.
- Calling `PUT /me/capabilities` then `PATCH /me/kyc` mirrors the primary
  onto `Driver.vehicle_type` consistently.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://baked-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _register_driver():
    email = f"qa.phasef+{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}@baked.dev"
    r = requests.post(
        f"{API}/driver/auth/email-register",
        json={"email": email, "password": "PhaseF1234!", "country": "CI"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return email, r.json()["access_token"]


def _advance_to_vehicle(tok, email):
    """Walk the KYC wizard up to the `vehicle` step. Returns the current step."""
    headers = {"Authorization": f"Bearer {tok}"}
    steps = [
        ("personal", {"name": "Phase F QA", "email": email}),
        ("id",       {"gov_id_type": "national_id", "gov_id_number": "NAT12345"}),
        ("licence",  {"licence_number": "LIC12345", "licence_expiry": "2030-12-31"}),
        ("selfie",   {}),
    ]
    for step, data in steps:
        r = requests.patch(f"{API}/driver/me/kyc", headers=headers,
                           json={"step": step, "data": data}, timeout=15)
        assert r.status_code == 200, f"{step}: {r.text}"
    me = requests.get(f"{API}/driver/me", headers=headers, timeout=15).json()
    assert me["kyc_step"] == "vehicle", me
    return me


@pytest.mark.parametrize("primary", ["three_wheeler", "truck", "ref_tricycle", "ref_utility", "ref_truck"])
def test_kyc_vehicle_accepts_send_primary_codes(primary):
    """The legacy allow-list was `bike/scooter/tricycle/mini_truck/big_truck`.
    Phase F widens it so a driver picking a SEND primary code (e.g. a
    refrigerated variant) doesn't get 400'd on the vehicle KYC step."""
    email, tok = _register_driver()
    _advance_to_vehicle(tok, email)
    headers = {"Authorization": f"Bearer {tok}"}
    r = requests.patch(
        f"{API}/driver/me/kyc",
        headers=headers,
        json={"step": "vehicle", "data": {"vehicle_type": primary, "vehicle_plate": "CI 0000 ZZ"}},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["vehicle_type"] == primary
    assert body["vehicle_plate"] == "CI 0000 ZZ"


def test_capabilities_and_kyc_stay_consistent():
    """The signup UI calls PUT /me/capabilities then PATCH /me/kyc. Both
    must agree on `Driver.vehicle_type` == primary capability code."""
    email, tok = _register_driver()
    _advance_to_vehicle(tok, email)
    headers = {"Authorization": f"Bearer {tok}"}
    # 1) Capability write.
    r = requests.put(
        f"{API}/driver/me/capabilities",
        headers=headers,
        json={"codes": ["bike", "three_wheeler", "ref_truck"], "primary": "ref_truck"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["primary_vehicle_type"] == "ref_truck"
    # 2) KYC write should agree.
    r = requests.patch(
        f"{API}/driver/me/kyc",
        headers=headers,
        json={"step": "vehicle", "data": {"vehicle_type": "ref_truck", "vehicle_plate": "CI 1234 XY"}},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    me = requests.get(f"{API}/driver/me", headers=headers, timeout=15).json()
    assert me["vehicle_type"] == "ref_truck"
    assert me["vehicle_plate"] == "CI 1234 XY"
    # 3) Capabilities row set still intact (not blown away by the KYC step).
    caps = requests.get(f"{API}/driver/me/capabilities", headers=headers, timeout=15).json()
    codes = {c["vehicle_code"] for c in caps["capabilities"]}
    assert codes == {"bike", "three_wheeler", "ref_truck"}
    primaries = [c for c in caps["capabilities"] if c["is_primary"]]
    assert len(primaries) == 1 and primaries[0]["vehicle_code"] == "ref_truck"
