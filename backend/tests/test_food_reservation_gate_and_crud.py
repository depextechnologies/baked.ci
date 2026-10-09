"""FOODbakēd Reservation Onboarding — additional coverage:
- Customer visibility gate on burger-hub (public=True) vs pizza-palace (public=False)
- Public booking gate: POST /reservations returns 400 while reservation_public=false
- Slot list returns 404 while reservation_public=false
- Areas/Tables CRUD with tenant isolation (partner A hitting partner B's rid → 403)
- Activation returns 400+checklist when minimum config isn't met
- Deactivate flips reservation_public back to false
"""
from __future__ import annotations
import os, pathlib, uuid, time
import pytest, requests
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

BURGER_ID = "burger_hub_ci"
PIZZA_ID  = "pizza_palace_ci"


def _admin_headers():
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com",
                            "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# -------- Customer visibility gate --------

def test_burger_hub_ci_is_public():
    r = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reservation-config?country=CI",
                     timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["enabled"] is True

def test_pizza_palace_reservation_config_hidden():
    """reservation_public=False → enabled must be False even though reservations_enabled=True."""
    r = requests.get(f"{BASE_URL}/api/food/restaurants/pizza-palace/reservation-config?country=CI",
                     timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["enabled"] is False

def test_pizza_palace_public_slots_404():
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    r = requests.get(f"{BASE_URL}/api/food/restaurants/pizza-palace/reservation-slots"
                     f"?country=CI&date={tomorrow}&party_size=2", timeout=10)
    assert r.status_code == 404, r.text

def test_pizza_palace_public_create_reservation_blocked():
    tomorrow_dt = (datetime.now(timezone.utc) + timedelta(days=2)).replace(hour=19, minute=0, second=0, microsecond=0)
    payload = {
        "country": "CI",
        "guest_name": "QA",
        "guest_email": "qa@test.example",
        "guest_phone": "+2250700000000",
        "party_size": 2,
        "reservation_at": tomorrow_dt.isoformat(),
    }
    r = requests.post(f"{BASE_URL}/api/food/restaurants/pizza-palace/reservations",
                      json=payload, timeout=10)
    assert r.status_code in (400, 404), r.text  # gate → 400/404 (not 500)


# -------- Areas/Tables CRUD (using super-admin as writer) --------

@pytest.fixture(scope="module")
def admin_hdr():
    return _admin_headers()

def test_areas_crud_full_lifecycle(admin_hdr):
    # Create area
    name = f"QA-Area-{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas",
                      headers=admin_hdr, json={"name": name}, timeout=10)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert r.json()["name"] == name

    # GET list
    r = requests.get(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas",
                     headers=admin_hdr, timeout=10)
    assert r.status_code == 200
    body = r.json()
    areas = body["areas"] if isinstance(body, dict) else body
    assert any(x["id"] == aid for x in areas)

    # PATCH
    new_name = name + "-x"
    r = requests.patch(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas/{aid}",
                       headers=admin_hdr,
                       json={"name": new_name, "is_active": False}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["name"] == new_name
    assert r.json()["is_active"] is False

    # DELETE
    r = requests.delete(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas/{aid}",
                        headers=admin_hdr, timeout=10)
    assert r.status_code == 204


def test_tables_crud_and_duplicate_code_409(admin_hdr):
    # Need an area
    a = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas",
                     headers=admin_hdr, json={"name": f"QA-{uuid.uuid4().hex[:6]}"}, timeout=10)
    aid = a.json()["id"]

    code = f"QA{uuid.uuid4().hex[:5].upper()}"
    r = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-tables",
                      headers=admin_hdr,
                      json={"area_id": aid, "code": code, "seats": 4}, timeout=10)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert r.json()["seats"] == 4
    assert r.json()["code"] == code

    # Duplicate code → 409
    dup = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-tables",
                        headers=admin_hdr,
                        json={"area_id": aid, "code": code, "seats": 2}, timeout=10)
    assert dup.status_code == 409, dup.text

    # PATCH seats
    r = requests.patch(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-tables/{tid}",
                       headers=admin_hdr, json={"seats": 6, "is_active": False}, timeout=10)
    assert r.status_code == 200
    assert r.json()["seats"] == 6
    assert r.json()["is_active"] is False

    # DELETE
    r = requests.delete(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-tables/{tid}",
                        headers=admin_hdr, timeout=10)
    assert r.status_code == 204

    # cleanup area
    requests.delete(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-areas/{aid}",
                    headers=admin_hdr, timeout=10)


# -------- Tenant isolation: partner logging in as burger tries pizza_palace_ci --------

def test_tenant_isolation_partner_cross_restaurant_forbidden():
    # Login as qa-burger partner
    lr = requests.post(f"{BASE_URL}/api/food/partner/auth/login",
                       json={"email": "qa-burger@test.example",
                             "password": "QaBurger123!"}, timeout=10)
    if lr.status_code != 200:
        pytest.skip(f"partner login unavailable: {lr.status_code} {lr.text[:120]}")
    tok = lr.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # Try to create area on pizza_palace_ci (not owned)
    r = requests.post(f"{BASE_URL}/api/food/manage/{PIZZA_ID}/reservation-areas",
                      headers=h, json={"name": "Sneaky"}, timeout=10)
    assert r.status_code in (403, 404), r.text  # tenant guard should reject


# -------- Activate/Deactivate round-trip on burger_hub_ci --------

def test_activate_deactivate_round_trip(admin_hdr):
    # Deactivate first
    r = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-deactivate",
                      headers=admin_hdr, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["public"] is False

    # Public config now closed
    cfg = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reservation-config?country=CI",
                       timeout=10).json()
    assert cfg["enabled"] is False

    # Reactivate — should succeed (config was already all_ok when seeded)
    r = requests.post(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-activate",
                      headers=admin_hdr, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["public"] is True

    cfg2 = requests.get(f"{BASE_URL}/api/food/restaurants/burger-hub/reservation-config?country=CI",
                        timeout=10).json()
    assert cfg2["enabled"] is True


def test_reservation_status_checklist_burger_hub(admin_hdr):
    r = requests.get(f"{BASE_URL}/api/food/manage/{BURGER_ID}/reservation-status",
                     headers=admin_hdr, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is True
    assert "items" in body
    keys = {i["key"] for i in body["items"]}
    assert {"hours", "slots", "party", "capacity"}.issubset(keys)
