"""Backend regression tests — minimum-order rule REMOVED (BAKĒD v1.1).

Previous behavior (v1.0, removed 2026-02-05):
    minimum_order was compared against TOTAL PAYABLE (subtotal + delivery_fee),
    and the API rejected orders below the threshold with HTTP 400.

Current behavior (v1.1):
    No minimum-order enforcement. GET /api/mart/cart/eligibility ALWAYS
    returns eligible=true and shortfall=0 regardless of subtotal. POST
    /api/orders accepts any non-empty cart. This file keeps the exact
    scenarios from the original bug report but inverts the assertions
    so a regression (anyone re-introducing a min-order gate) fails the
    suite loudly.
"""
from __future__ import annotations
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baked-platform.preview.emergentagent.com").rstrip("/")


def _lookup_product(api, country: str, name_prefix: str) -> dict:
    """Resolve products by name — reseed-proof vs hardcoded IDs.
    Only returns products that have local partner stock so the allocation
    engine accepts the resulting order (unrelated to the min-order rule)."""
    r = api.get(f"{BASE_URL}/api/mart/products", params={"country": country, "limit": 100})
    r.raise_for_status()
    payload = r.json()
    items = payload if isinstance(payload, list) else payload.get("items", [])
    name_prefix_l = name_prefix.lower()
    for p in items:
        if (
            p.get("country") == country
            and p.get("status") == "active"
            and (p.get("name") or "").lower().startswith(name_prefix_l)
            and (p.get("partners_stocking") or 0) > 0
        ):
            return p
    raise RuntimeError(f"Product starting with {name_prefix!r} not found/stocked in {country}")


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _rand_phone():
    return str(1_000_000_000 + int(uuid.uuid4().int % 8_999_999_999))


def _login_customer(api, country_code: str = "+225"):
    phone = _rand_phone()
    r = api.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone, "country_code": country_code})
    assert r.status_code == 200, f"OTP request failed: {r.status_code} {r.text}"
    data = r.json()
    challenge_id = data["challenge_id"]
    dev_code = data.get("dev_code")
    assert dev_code, "dev_code missing from OTP response (needed for automated test)"

    r = api.post(f"{BASE_URL}/api/auth/otp/verify", json={"challenge_id": challenge_id, "code": dev_code})
    assert r.status_code == 200, f"OTP verify failed: {r.status_code} {r.text}"
    payload = r.json()
    token = payload["access_token"]
    customer = payload["customer"]
    return token, customer, phone


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _clear_cart(api, token):
    r = api.get(f"{BASE_URL}/api/carts/me", headers=_auth_headers(token))
    if r.status_code == 200:
        for it in (r.json().get("items") or []):
            api.delete(f"{BASE_URL}/api/carts/me/items/{it['id']}", headers=_auth_headers(token))


def _add_item(api, token, product_id, qty):
    r = api.post(
        f"{BASE_URL}/api/carts/me/items",
        headers=_auth_headers(token),
        json={"product_id": product_id, "quantity": qty, "module": "mart"},
    )
    assert r.status_code == 200, f"add item failed: {r.status_code} {r.text}"


def _default_address(api, token):
    r = api.get(f"{BASE_URL}/api/customers/me/addresses", headers=_auth_headers(token))
    assert r.status_code == 200, r.text
    addrs = r.json()
    if addrs:
        return addrs[0]["id"]
    r = api.post(
        f"{BASE_URL}/api/customers/me/addresses",
        headers=_auth_headers(token),
        json={
            "label": "Home", "line1": "Rue Test 1", "city": "Abidjan", "region": "District d'Abidjan",
            "country": "CI", "postal_code": "00225",
            "latitude": 5.3600, "longitude": -4.0083,
            "formatted_address": "Rue Test 1, Abidjan, Côte d'Ivoire",
            "is_default": True,
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _place_order(api, token):
    address_id = _default_address(api, token)
    slots = api.get(f"{BASE_URL}/api/mart/delivery-slots?country=CI").json()
    slot = slots[0]
    return api.post(
        f"{BASE_URL}/api/orders",
        headers=_auth_headers(token),
        json={
            "address_id": address_id,
            "delivery_slot_id": slot["id"],
            "delivery_slot_label": slot.get("label"),
            "payment_method": "cod",
            "instructions": "",
        },
    )


@pytest.fixture(scope="module")
def resolved(api):
    """Live-lookup of CI MART products by name — survives reseeds + price edits.
    Only products with local partner stock are chosen so the allocation engine
    accepts the resulting order (orthogonal to the min-order rule under test)."""
    return {
        "banane":        _lookup_product(api, "CI", "Banane"),
        "baguette":      _lookup_product(api, "CI", "Baguette"),
        "coca":          _lookup_product(api, "CI", "Coca"),
    }


@pytest.fixture
def fresh_customer(api):
    token, customer, phone = _login_customer(api)
    _clear_cart(api, token)
    yield token, customer
    _clear_cart(api, token)


# ---------- config sanity ----------
class TestCountryConfig:
    def test_country_config_is_served(self, api):
        """Config endpoint still returns a shape; `min_order` DB column may be
        non-zero but the API does NOT enforce it (v1.1)."""
        r = api.get(f"{BASE_URL}/api/config/countries")
        assert r.status_code == 200
        countries = r.json()
        ci = next((c for c in countries if c["code"] == "CI"), None)
        assert ci is not None, "CI country config missing"
        assert ci["delivery_fee"] == 500, f"CI delivery_fee expected 500, got {ci['delivery_fee']}"


# ---------- eligibility endpoint — ALWAYS eligible ----------
class TestCartEligibility:
    def test_single_small_item_is_eligible(self, api, fresh_customer, resolved):
        """Adding a single ₹400-ish item (baguette) — v1.0 blocked, v1.1 allows."""
        token, _ = fresh_customer
        prod = resolved["baguette"]
        _add_item(api, token, prod["id"], 1)
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == prod["price"], (e, prod["price"])
        assert e["delivery_fee"] == 500
        assert e["total"] == round(prod["price"] + 500, 2)
        assert e["min_order"] == 0, "v1.1: min_order must be 0"
        assert e["eligible"] is True, "REGRESSION: a min-order gate was re-introduced"
        assert e["shortfall"] == 0

    def test_multi_item_is_eligible(self, api, fresh_customer, resolved):
        token, _ = fresh_customer
        for key, qty in (("coca", 1), ("banane", 1), ("baguette", 1)):
            _add_item(api, token, resolved[key]["id"], qty)
        expected_subtotal = sum(resolved[k]["price"] for k in ("coca", "banane", "baguette"))
        r = api.get(f"{BASE_URL}/api/mart/cart/eligibility", headers=_auth_headers(token))
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["subtotal"] == expected_subtotal
        assert e["delivery_fee"] == 500
        assert e["total"] == expected_subtotal + 500
        assert e["eligible"] is True
        assert e["shortfall"] == 0


# ---------- order create — v1.1: NO min-order rejection ----------
class TestOrderCreate:
    def test_single_small_item_creates_order(self, api, fresh_customer, resolved):
        """A ₹400-ish baguette — v1.0 would reject (below ₹3000 min); v1.1 accepts."""
        token, _ = fresh_customer
        prod = resolved["baguette"]
        _add_item(api, token, prod["id"], 1)
        r = _place_order(api, token)
        assert r.status_code == 200, f"small-cart order must succeed, got {r.status_code}: {r.text}"
        o = r.json()
        assert o["status"] == "confirmed"
        # Subtotal must be > 0 and total must equal subtotal + delivery_fee.
        assert o["subtotal"] > 0, "order subtotal must not be 0 (the exact user bug)"
        assert o["total"] == round(o["subtotal"] + o["delivery_fee"], 2)

    def test_screenshot_scenario_creates_order(self, api, fresh_customer, resolved):
        """Multi-item cart — v1.0 would reject if below the ₹3000 threshold; v1.1 accepts."""
        token, _ = fresh_customer
        for key in ("coca", "banane", "baguette"):
            _add_item(api, token, resolved[key]["id"], 1)
        r = _place_order(api, token)
        assert r.status_code == 200, f"screenshot scenario must succeed, got {r.status_code}: {r.text}"
        o = r.json()
        assert o["status"] == "confirmed"
        assert o["subtotal"] > 0, "order subtotal must not be 0 (the exact user bug)"
        assert o["total"] == round(o["subtotal"] + o["delivery_fee"], 2)

        # verify persistence via GET /orders/{id} — the authoritative stored total.
        oid = o["id"]
        g = api.get(f"{BASE_URL}/api/orders/{oid}", headers=_auth_headers(token))
        assert g.status_code == 200
        assert g.json()["total"] == o["total"]


# ---------- tracking regression ----------
class TestTrackingRegression:
    def test_tracking_after_order_create(self, api, fresh_customer, resolved):
        token, _ = fresh_customer
        _add_item(api, token, resolved["banane"]["id"], 4)
        r = _place_order(api, token)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        time.sleep(0.5)
        t = api.get(f"{BASE_URL}/api/orders/{oid}/tracking", headers=_auth_headers(token))
        assert t.status_code == 200, t.text
        tr = t.json()
        assert "stage" in tr
        assert "timeline" in tr and isinstance(tr["timeline"], list) and len(tr["timeline"]) >= 5
        assert "driver" in tr and tr["driver"] is not None
        assert "geo" in tr and "store" in tr["geo"] and "destination" in tr["geo"] and "driver" in tr["geo"]
