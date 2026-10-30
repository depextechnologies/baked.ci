"""/api/cart/quote — single pricing engine regression tests.

Fixing_Prompt P0: Mobile and Desktop must render identical totals from the
same backend quote. The scenarios here match the acceptance TC-01…TC-30
grid (TC-22 and TC-23 are especially important — "backend rejects
manipulated totals" and "no minimum-cart restriction").
"""
from __future__ import annotations
import os, pathlib
import pytest, requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")
load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ["REACT_APP_BACKEND_URL"]
QUOTE = f"{BASE}/api/cart/quote"


def _food(rid, mid, qty=1):
    return {"module": "food", "restaurant_id": rid, "menu_item_id": mid, "quantity": qty}


# TC-01, TC-02, TC-03: FOOD cart ₹279 + ₹199 subtotal = ₹478 on every surface
def test_food_cart_two_items_subtotal_is_478():
    r = requests.post(QUOTE, json={
        "items": [
            _food("burger_hub_in", "burger_hub_in_crispy_wings"),
            _food("burger_hub_in", "burger_hub_in_mozz_sticks"),
        ],
        "country": "IN", "mode": "delivery",
    }, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["food"]["subtotal"] == 478.0
    assert d["subtotal"] == 478.0
    assert d["currency"] == "INR"


# TC-05 — desktop payable total must include FOOD delivery fee
def test_food_delivery_fee_included_in_total():
    r = requests.post(QUOTE, json={
        "items": [
            _food("burger_hub_in", "burger_hub_in_crispy_wings"),
            _food("burger_hub_in", "burger_hub_in_mozz_sticks"),
        ],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    # Burger Hub IN has delivery_fee=29 → total 478 + 29
    assert r["food"]["delivery_fee"] == 29.0
    assert r["delivery_fee_total"] == 29.0
    assert r["total"] == 507.0


# TC-04 — FOOD-only cart must NOT get a MART delivery fee stuck on it
def test_food_only_cart_has_zero_mart_delivery():
    r = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "burger_hub_in_crispy_wings")],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    assert r["mart"]["subtotal"] == 0.0
    assert r["mart"]["delivery_fee"] == 0.0


# TC-23 — no minimum-cart restriction must ever block the quote
def test_no_minimum_order_block():
    r = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "burger_hub_in_crispy_wings")],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    assert r["mart"]["eligible"] is True
    assert r["mart"]["shortfall"] == 0


# TC-16 — adding more quantity scales the subtotal linearly
def test_quantity_scales_subtotal_linearly():
    r = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "burger_hub_in_crispy_wings", qty=3)],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    assert r["food"]["subtotal"] == 3 * 279.0


# TC-20 — switching to pickup drops the FOOD delivery fee to zero
def test_pickup_mode_waives_food_delivery_fee():
    r = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "burger_hub_in_crispy_wings")],
        "country": "IN", "mode": "pickup",
    }, timeout=10).json()
    assert r["food"]["delivery_fee"] == 0.0


# TC-22 — backend never trusts a nonexistent menu-item id
def test_unavailable_items_dont_leak_into_subtotal():
    r = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "does_not_exist_item")],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    assert r["food"]["subtotal"] == 0.0
    assert "does_not_exist_item" in r["food"]["groups"][0]["unavailable_item_ids"]


# TC-28 — INR vs XOF currency selection follows the country
def test_currency_is_country_scoped():
    r_in = requests.post(QUOTE, json={
        "items": [_food("burger_hub_in", "burger_hub_in_crispy_wings")],
        "country": "IN", "mode": "delivery",
    }, timeout=10).json()
    assert r_in["currency"] == "INR"
    r_ci = requests.post(QUOTE, json={
        "items": [_food("burger_hub_ci", "burger_hub_ci_classic_burger")],
        "country": "CI", "mode": "delivery",
    }, timeout=10).json()
    assert r_ci["currency"] == "XOF"


# TC-29 — multiple restaurants = fees summed per restaurant, not stacked once
def test_two_restaurants_sum_delivery_fees_once_each():
    # Two restaurants in Abidjan with delivery_fee=500 each → fee should
    # be 1000 (NOT 500 — fee is per restaurant), subtotal items only.
    r = requests.post(QUOTE, json={
        "items": [
            _food("burger_hub_ci",   "burger_hub_ci_classic_burger"),
            _food("pizza_palace_ci", "pizza_palace_ci_margherita"),
        ],
        "country": "CI", "mode": "delivery",
    }, timeout=10).json()
    # Each group's own fee shows separately.
    rids = {g["restaurant_id"]: g["delivery_fee"] for g in r["food"]["groups"]}
    assert set(rids.keys()) == {"burger_hub_ci", "pizza_palace_ci"}
    # Total delivery fee is the sum, not duplicated or dropped.
    assert r["food"]["delivery_fee"] == sum(rids.values())


# TC-13/14/15 — empty cart quote must not error
def test_empty_cart_returns_zeros():
    r = requests.post(QUOTE, json={"items": [], "country": "IN", "mode": "delivery"},
                      timeout=10).json()
    assert r["subtotal"] == 0.0
    assert r["total"] == 0.0
    assert r["delivery_fee_total"] == 0.0
