"""Unified cart quote — single pricing engine for FOOD + MART + SHOP.

Lives above the three per-module carts so Mobile and Desktop (and later
checkout + payment) all read identical numbers from the same authoritative
source. The frontend NEVER adds its own delivery fee or applies its own
min-order gate — it POSTs the current cart lines here and renders the
response.

Shape:
    POST /api/cart/quote
    body = {
        "items": [
            {"module": "food", "restaurant_id": "...", "menu_item_id": "...", "quantity": 2},
            {"module": "mart", "product_id": "...", "quantity": 1},
            {"module": "shop", "variant_id": "...", "quantity": 1},
        ],
        "country":          "CI",
        "mode":             "delivery",            # delivery | pickup | dine_in
        "delivery_address": {"lat": 5.3484, "lng": -4.0017},
    }

    → {
        "currency": "XOF",
        "subtotal": 4780,
        "delivery_fee_total": 500,
        "total": 5280,
        "food": {
          "subtotal": 4780, "delivery_fee": 500,
          "groups": [{"restaurant_id": "...", "name": "...",
                      "subtotal": 4780, "delivery_fee": 500,
                      "eligible": true, "unavailable_item_ids": []}]
        },
        "mart": {"subtotal": 0, "delivery_fee": 0, "min_order": 0, "shortfall": 0, "eligible": true},
        "shop": {"subtotal": 0, "delivery_fee": null},
      }

Design notes
------------
* The backend NEVER trusts client-submitted prices. Each line is repriced
  from `food_menu_items.base_price` / `mart_products.price` /
  `shop_variants.price`. Missing or unavailable items are returned under
  `unavailable_item_ids` and excluded from the subtotal — so the UI can
  show a "no longer available" chip without accidentally charging for them.
* FOOD delivery fee is `food_restaurants.delivery_fee` per restaurant, but
  only when the vendor is eligible for the customer address (reusing the
  P0 discovery eligibility check). Multiple restaurants in one basket →
  the fees are summed; each shows up as a `food.groups[]` row.
* MART min-order and MART delivery fee come from the per-country config
  (`country_cart_rules`) if present; else sensible defaults.
* Mart has an explicit `eligible` flag — frontend hides the min-order
  banner entirely when mart items are absent (fixing the ghost-₹170 banner
  users reported).
* No minimum-order block for FOOD or SHOP — only MART, matching the
  product rule.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from modules.food.discovery import haversine_km, DEFAULT_RADIUS_KM


router = APIRouter(prefix="/cart", tags=["cart-quote"])


def _d(x) -> Decimal:
    """Safe decimal cast — financial math never floats."""
    return Decimal(str(x or 0))


def _r(x: Decimal) -> float:
    """Round to 2 dp, return float for JSON. Use at the leaves only."""
    return float(x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class QuoteItemIn(BaseModel):
    module: Literal["food", "mart", "shop"]
    quantity: int = Field(ge=1, le=99)
    # Union of ID shapes — only the module-relevant one is required.
    product_id:    Optional[str] = None   # mart product OR food menu-item id (legacy frontends)
    menu_item_id:  Optional[str] = None   # food
    restaurant_id: Optional[str] = None   # food
    variant_id:    Optional[str] = None   # shop

    def food_item_id(self) -> Optional[str]:
        return self.menu_item_id or self.product_id


class DeliveryAddressIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class QuoteIn(BaseModel):
    items: list[QuoteItemIn] = Field(default_factory=list)
    country: str = "CI"
    mode: Literal["delivery", "pickup", "dine_in"] = "delivery"
    delivery_address: Optional[DeliveryAddressIn] = None


# ---------------------------------------------------------------------------
# FOOD pricing
# ---------------------------------------------------------------------------
async def _price_food(
    session: AsyncSession, items: list[QuoteItemIn], mode: str,
    addr: Optional[DeliveryAddressIn],
) -> dict[str, Any]:
    """Group by restaurant → price every line from `food_menu_items.base_price`
    → add `food_restaurants.delivery_fee` once per restaurant (delivery only)
    when the vendor is eligible for the customer coordinates."""
    rows_by_rid: dict[str, list[QuoteItemIn]] = {}
    for it in items:
        rid = it.restaurant_id
        if not rid or not it.food_item_id():
            continue
        rows_by_rid.setdefault(rid, []).append(it)
    if not rows_by_rid:
        return {"subtotal": 0.0, "delivery_fee": 0.0, "groups": [], "currency": None}

    rids = list(rows_by_rid.keys())
    rests = {r.id: r for r in (await session.execute(text("""
        SELECT fr.id, fr.name, fr.country, fr.status, fr.is_open,
               fr.latitude, fr.longitude, fr.delivery_fee, fr.delivery_enabled,
               fr.delivery_radius_km, fr.pickup_enabled,
               fr.reservations_enabled, fr.reservation_public,
               fr.delivery_paused_until, fr.pickup_paused_until,
               c.currency AS currency
          FROM food_restaurants fr
     LEFT JOIN countries c ON c.code = fr.country
         WHERE fr.id = ANY(:ids)
    """), {"ids": rids})).fetchall()}

    # One query for all menu items referenced in the cart.
    all_item_ids = [it.food_item_id() for its in rows_by_rid.values() for it in its]
    menu = {m.id: m for m in (await session.execute(text("""
        SELECT id, restaurant_id, base_price, currency, is_available, name
          FROM food_menu_items WHERE id = ANY(:ids)
    """), {"ids": all_item_ids})).fetchall()}

    groups: list[dict[str, Any]] = []
    total_sub = Decimal("0")
    total_fee = Decimal("0")
    chosen_currency: Optional[str] = None

    for rid, its in rows_by_rid.items():
        rest = rests.get(rid)
        sub = Decimal("0")
        unavailable: list[str] = []
        for it in its:
            fid = it.food_item_id()
            m = menu.get(fid)
            if not m or m.restaurant_id != rid or not m.is_available:
                unavailable.append(fid)
                continue
            sub += _d(m.base_price) * it.quantity

        # Eligibility: delivery → coord check within radius; pickup → wider
        # radius; dine_in → reservations enabled & public.
        eligible = False
        distance_km: Optional[float] = None
        if rest and rest.status == "active" and rest.is_open:
            r_lat, r_lng = (float(rest.latitude) if rest.latitude is not None else None,
                            float(rest.longitude) if rest.longitude is not None else None)
            if addr and addr.lat is not None and addr.lng is not None and r_lat is not None and r_lng is not None:
                distance_km = round(haversine_km(addr.lat, addr.lng, r_lat, r_lng), 2)
            if mode == "delivery":
                radius = float(rest.delivery_radius_km) if rest.delivery_radius_km is not None else DEFAULT_RADIUS_KM
                if bool(rest.delivery_enabled):
                    eligible = (distance_km is None) or (distance_km <= radius)
            elif mode == "pickup":
                if bool(rest.pickup_enabled):
                    eligible = (distance_km is None) or (distance_km <= 25.0)
            elif mode == "dine_in":
                eligible = bool(rest.reservations_enabled and rest.reservation_public)

        # Per-restaurant delivery fee — applied once (NOT per line) and only
        # for delivery mode. Pickup / dine-in have no delivery charge.
        delivery_fee = Decimal("0")
        if rest and mode == "delivery" and sub > 0 and eligible:
            delivery_fee = _d(rest.delivery_fee)

        currency = (rest.currency if rest else None) or "XOF"
        chosen_currency = chosen_currency or currency
        groups.append({
            "restaurant_id": rid,
            "name":          rest.name if rest else "",
            "currency":      currency,
            "subtotal":      _r(sub),
            "delivery_fee":  _r(delivery_fee),
            "eligible":      eligible,
            "mode":          mode,
            "distance_km":   distance_km,
            "unavailable_item_ids": unavailable,
        })
        total_sub += sub
        total_fee += delivery_fee

    return {
        "subtotal":     _r(total_sub),
        "delivery_fee": _r(total_fee),
        "groups":       groups,
        "currency":     chosen_currency or "XOF",
    }


# ---------------------------------------------------------------------------
# MART pricing — reuses existing `mart_products` + per-country rules
# ---------------------------------------------------------------------------
async def _price_mart(
    session: AsyncSession, items: list[QuoteItemIn], country: str,
) -> dict[str, Any]:
    pids = [it.product_id for it in items if it.product_id]
    if not pids:
        return {"subtotal": 0.0, "delivery_fee": 0.0, "min_order": 0.0,
                "shortfall": 0.0, "eligible": True, "currency": None,
                "unavailable_item_ids": []}

    products = {p.id: p for p in (await session.execute(text("""
        SELECT id, price, currency, (status = 'active') AS is_available
          FROM mart_products WHERE id = ANY(:ids)
    """), {"ids": pids})).fetchall()}

    sub = Decimal("0")
    unavailable: list[str] = []
    currency: Optional[str] = None
    for it in items:
        p = products.get(it.product_id)
        if not p or not p.is_available:
            if it.product_id:
                unavailable.append(it.product_id)
            continue
        sub += _d(p.price) * it.quantity
        currency = currency or (p.currency or None)

    # Country rules — reads the same `countries` columns the frontend
    # `checkOrderEligibility` reads so Mobile, Desktop and the quote stay
    # bit-for-bit in sync. BAKĒD v1.1 removed the minimum-order rule, so
    # `eligible` is always TRUE (the fields stay in the response for shape
    # compatibility with legacy callers).
    rules = (await session.execute(text("""
        SELECT min_order, delivery_fee, free_delivery_over, currency
          FROM countries WHERE code = :c
    """), {"c": country.upper()})).fetchone()
    min_order    = _d(rules.min_order    if rules else 0)
    delivery_fee = _d(rules.delivery_fee if rules else 0)
    free_over    = _d(rules.free_delivery_over if rules else 0)
    rule_ccy     = (rules.currency if rules else None)

    # Free-delivery threshold reached? Charge 0 instead of the base fee.
    if sub > 0 and free_over > 0 and sub >= free_over:
        delivery_fee = Decimal("0")

    eligible  = True           # minimum-order rule removed in v1.1
    shortfall = Decimal("0")

    return {
        "subtotal":     _r(sub),
        "delivery_fee": _r(delivery_fee) if sub > 0 else 0.0,
        "min_order":    _r(min_order),
        "shortfall":    _r(shortfall),
        "eligible":     eligible,
        "currency":     currency or rule_ccy or "XOF",
        "unavailable_item_ids": unavailable,
    }


# ---------------------------------------------------------------------------
# SHOP pricing — ships from seller; fee is seller-set and computed later
# ---------------------------------------------------------------------------
async def _price_shop(
    session: AsyncSession, items: list[QuoteItemIn],
) -> dict[str, Any]:
    vids = [it.variant_id for it in items if it.variant_id]
    if not vids:
        return {"subtotal": 0.0, "delivery_fee": None, "currency": None,
                "unavailable_item_ids": []}
    variants = {v.id: v for v in (await session.execute(text("""
        SELECT id, price, currency, is_active FROM shop_variants
         WHERE id = ANY(:ids)
    """), {"ids": vids})).fetchall()}
    sub = Decimal("0")
    unavailable: list[str] = []
    currency: Optional[str] = None
    for it in items:
        v = variants.get(it.variant_id)
        if not v or not v.is_active:
            if it.variant_id: unavailable.append(it.variant_id)
            continue
        sub += _d(v.price) * it.quantity
        currency = currency or (v.currency or None)
    return {
        "subtotal":     _r(sub),
        "delivery_fee": None,              # computed per-seller at checkout
        "currency":     currency or "XOF",
        "unavailable_item_ids": unavailable,
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/quote")
async def quote(
    payload: QuoteIn,
    session: AsyncSession = Depends(get_session),
):
    food_items = [it for it in payload.items if it.module == "food"]
    mart_items = [it for it in payload.items if it.module == "mart"]
    shop_items = [it for it in payload.items if it.module == "shop"]

    food = await _price_food(session, food_items, payload.mode, payload.delivery_address)
    mart = await _price_mart(session, mart_items, payload.country)
    shop = await _price_shop(session, shop_items)

    # Pick a top-level currency: prefer FOOD's currency when present (that's
    # the main launch market), else MART, else SHOP, else XOF. Mixed
    # currencies are flagged so the UI can surface a warning.
    currency_candidates = [c for c in (food.get("currency"), mart.get("currency"), shop.get("currency")) if c]
    currency = currency_candidates[0] if currency_candidates else "XOF"
    mixed_currency = len(set(currency_candidates)) > 1

    subtotal     = _d(food["subtotal"])     + _d(mart["subtotal"])     + _d(shop["subtotal"])
    # SHOP's `delivery_fee` is None (seller-set, calc'd later at checkout);
    # don't include it in the running total.
    delivery_fee = _d(food["delivery_fee"]) + _d(mart["delivery_fee"] or 0)
    total        = subtotal + delivery_fee

    return {
        "currency":           currency,
        "mixed_currency":     mixed_currency,
        "subtotal":           _r(subtotal),
        "delivery_fee_total": _r(delivery_fee),
        "total":              _r(total),
        "food": food,
        "mart": mart,
        "shop": shop,
    }
