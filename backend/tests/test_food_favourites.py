"""FOODbakēd — Phase 3 Customer Favourites.

Tests the /food/customer/favourites toggle + list + ids endpoints.
Server-side only (login-required). Reuses the dev OTP auth path used
elsewhere in the FOOD test suite.
"""
from __future__ import annotations

import os
import pathlib
import random

import pytest
import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]


def _rand_phone():
    return "0" + "".join(str(random.randint(0, 9)) for _ in range(9))


def _fresh_customer():
    """Create a brand-new customer via dev OTP and return a bearer token."""
    phone = _rand_phone()
    r = requests.post(f"{BASE_URL}/api/auth/otp/request",
                      json={"country_code": "+225", "phone": phone}, timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"challenge_id": j["challenge_id"], "code": j["dev_code"]},
                      timeout=10)
    assert v.status_code == 200, v.text
    return v.json()["access_token"]


def _menu_item_id(slug: str = "burger-hub") -> str:
    """Resolve a real menu item ID from the seeded demo restaurant."""
    r = requests.get(f"{BASE_URL}/api/food/restaurants/{slug}/menu?country=CI", timeout=10)
    assert r.status_code == 200, r.text
    for s in r.json().get("sections", []):
        if s.get("items"):
            return s["items"][0]["id"]
    pytest.fail("No menu items available for favourites test")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}",
            "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------

def test_favourites_require_bearer_token():
    r1 = requests.get(f"{BASE_URL}/api/food/customer/favourites", timeout=10)
    r2 = requests.get(f"{BASE_URL}/api/food/customer/favourites/ids", timeout=10)
    r3 = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                       json={"target_type": "restaurant", "target_id": "x"}, timeout=10)
    assert r1.status_code in (401, 403)
    assert r2.status_code in (401, 403)
    assert r3.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Toggle add/remove
# ---------------------------------------------------------------------------

def test_toggle_restaurant_add_then_remove():
    tok = _fresh_customer()
    body = {"target_type": "restaurant", "target_id": "burger_hub_ci"}

    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok), json=body, timeout=10)
    assert r.status_code == 200
    assert r.json() == {"favourited": True}

    r = requests.get(f"{BASE_URL}/api/food/customer/favourites/ids",
                     headers=_auth(tok), timeout=10)
    assert "burger_hub_ci" in r.json()["restaurants"]

    # Toggle again → removed.
    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok), json=body, timeout=10)
    assert r.json() == {"favourited": False}

    r = requests.get(f"{BASE_URL}/api/food/customer/favourites/ids",
                     headers=_auth(tok), timeout=10)
    assert r.json()["restaurants"] == []


def test_toggle_dish_persists_and_appears_in_list():
    tok = _fresh_customer()
    item_id = _menu_item_id()

    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok),
                      json={"target_type": "dish", "target_id": item_id}, timeout=10)
    assert r.json() == {"favourited": True}

    r = requests.get(f"{BASE_URL}/api/food/customer/favourites",
                     headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["dishes"], list) and len(body["dishes"]) == 1
    dish = body["dishes"][0]
    assert dish["id"] == item_id
    assert "name" in dish and "base_price" in dish
    assert dish["restaurant"]["slug"] == "burger-hub"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_toggle_rejects_unknown_target_404():
    tok = _fresh_customer()
    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok),
                      json={"target_type": "restaurant", "target_id": "ghost_xx"}, timeout=10)
    assert r.status_code == 404

    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok),
                      json={"target_type": "dish", "target_id": "ghost_item"}, timeout=10)
    assert r.status_code == 404


def test_toggle_rejects_invalid_target_type():
    tok = _fresh_customer()
    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok),
                      json={"target_type": "something", "target_id": "x"}, timeout=10)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Tenant isolation — a customer sees only their own favourites.
# ---------------------------------------------------------------------------

def test_favourites_are_scoped_per_customer():
    tok_a = _fresh_customer()
    tok_b = _fresh_customer()

    r = requests.post(f"{BASE_URL}/api/food/customer/favourites/toggle",
                      headers=_auth(tok_a),
                      json={"target_type": "restaurant", "target_id": "burger_hub_ci"}, timeout=10)
    assert r.json() == {"favourited": True}

    ids_a = requests.get(f"{BASE_URL}/api/food/customer/favourites/ids",
                        headers=_auth(tok_a), timeout=10).json()
    ids_b = requests.get(f"{BASE_URL}/api/food/customer/favourites/ids",
                        headers=_auth(tok_b), timeout=10).json()
    assert "burger_hub_ci" in ids_a["restaurants"]
    assert ids_b["restaurants"] == []
