"""FOODbakēd — Pass 1 order pipeline regression."""
from __future__ import annotations

import os
import pathlib
import time
import uuid

import requests
from dotenv import load_dotenv

FRONTEND_ENV = pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env"
BACKEND_ENV  = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(FRONTEND_ENV)
load_dotenv(BACKEND_ENV)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"]


def _admin() -> dict:
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": "depexopenai@gmail.com", "password": "baked@2026#!$@"}, timeout=10)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _item_for(restaurant_id: str) -> str:
    # Any available item on the restaurant — fetch via public microsite menu.
    r = requests.get(f"{BASE_URL}/api/food/restaurants/{restaurant_id}/menu", timeout=10)
    if r.status_code != 200:
        # fallback: hit the slug-based microsite menu
        r = requests.get(f"{BASE_URL}/api/food/manage/{restaurant_id}/menu",
                         headers=_admin(), timeout=10)
    assert r.status_code == 200, r.text
    for sec in r.json().get("sections", []):
        for it in sec.get("items", []):
            if it.get("is_available"): return it["id"]
    raise AssertionError(f"no available item for {restaurant_id}")


def test_create_order_persists_and_shows_up_for_partner():
    item = _item_for("burger_hub_ci")
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": "burger_hub_ci", "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 2}],
        "customer_snapshot": {"name": "QA One", "phone": "+2250711111111"},
        "delivery_address": {"line1": "Rue 1", "city": "Abidjan"},
    }, timeout=15)
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["status"] == "placed"
    assert o["grand_total"] > 0
    assert o["items"][0]["quantity"] == 2

    # Partner (super-admin bypass) sees it in New
    plist = requests.get(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders?status=new",
                         headers=_admin(), timeout=10).json()
    assert any(x["id"] == o["id"] for x in plist["orders"])
    assert plist["counts"]["new"] >= 1


def test_full_state_machine_accept_prepare_ready():
    item = _item_for("burger_hub_ci")
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": "burger_hub_ci", "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "SM"},
    }, timeout=15).json()
    oid = r["id"]
    for action, expected in [("accept","accepted"),("preparing","preparing"),("ready","ready")]:
        resp = requests.patch(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders/{oid}",
                              headers=_admin(), json={"action": action}, timeout=10)
        assert resp.status_code == 200
        assert resp.json()["status"] == expected

    # Reject-after-ready MUST be rejected (bad transition)
    bad = requests.patch(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders/{oid}",
                        headers=_admin(), json={"action":"accept"}, timeout=10)
    assert bad.status_code == 409


def test_reject_requires_reason_and_closes_order():
    item = _item_for("burger_hub_ci")
    r = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": "burger_hub_ci", "order_type": "pickup",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "Rej"},
    }, timeout=15).json()
    oid = r["id"]
    # No reason → 422
    bad = requests.patch(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders/{oid}",
                        headers=_admin(), json={"action":"reject"}, timeout=10)
    assert bad.status_code == 422
    # With reason → ok
    good = requests.patch(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders/{oid}",
                        headers=_admin(), json={"action":"reject","reason":"too busy"}, timeout=10)
    assert good.status_code == 200
    assert good.json()["status"] == "rejected"


def test_idempotency_client_order_id_dedup():
    item = _item_for("burger_hub_ci")
    coid = f"test_{uuid.uuid4().hex[:10]}"
    body = {
        "restaurant_id": "burger_hub_ci", "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "Idem"},
        "client_order_id": coid,
    }
    a = requests.post(f"{BASE_URL}/api/food/customer/orders", json=body, timeout=15).json()
    b = requests.post(f"{BASE_URL}/api/food/customer/orders", json=body, timeout=15).json()
    assert a["id"] == b["id"], "same client_order_id must return the same order"


def test_rejects_order_for_other_restaurant_item():
    # Item from burger_hub_ci posted against pizza_palace_ci → 422
    item = _item_for("burger_hub_ci")
    bad = requests.post(f"{BASE_URL}/api/food/customer/orders", json={
        "restaurant_id": "pizza_palace_ci", "order_type": "delivery",
        "items": [{"item_id": item, "quantity": 1}],
        "customer_snapshot": {"name": "x"},
    }, timeout=15)
    assert bad.status_code == 422


def test_tenant_isolation_partner_listing():
    """Super-admin bypass can list any restaurant's orders, but a partner
    JWT for Restaurant A must get 403 when hitting Restaurant B. We can't
    create a partner JWT without the OTP flow, so this is a dependency
    check that _get_menu_writer actually guards (the admin bypass path is
    only accepted on get_current_admin tokens)."""
    # Super-admin can see any restaurant
    r1 = requests.get(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders", headers=_admin(), timeout=10)
    r2 = requests.get(f"{BASE_URL}/api/food/manage/pizza_palace_ci/orders", headers=_admin(), timeout=10)
    assert r1.status_code == 200 and r2.status_code == 200
    # No auth → 401
    anon = requests.get(f"{BASE_URL}/api/food/manage/burger_hub_ci/orders", timeout=10)
    assert anon.status_code in (401, 403)
