"""FOODbakēd — Unified discovery search.

  GET /api/food/search?q=&mode=&country=&lat=&lng=&radius_km=...

Returns 4 grouped buckets:
  - restaurants  : name / slug ILIKE q OR cuisines JSONB contains q
                   OR dish-name ILIKE q (so "burgers" surfaces every
                   venue serving burgers, matching the category page UX).
  - dishes       : menu items name / description / tags ILIKE q
                   (only from `is_available=TRUE` items on active
                   restaurants that are themselves mode-eligible).
  - cuisines     : cuisine strings matched from an in-memory canonical list
                   (kept small – purely for the dropdown group header)
  - reservations : restaurants where reservations_enabled AND reservation_public
                   AND (query matches name/slug OR user picked mode=dine_in)

Location & eligibility semantics (same as the category Discovery page):
  * Flat 15 km radius when the customer has coordinates.
  * ``delivery`` mode — rows inside 15 km stay in the response but each one
    carries ``delivery_eligible`` so the UI can dim non-deliverable cards and
    show "Delivery unavailable at your address".
  * ``pickup`` / ``dine_in`` — only eligible rows are returned.

Filter params mirror ``/api/food/restaurants/discover`` so the two pages
share one truth: ``sort``, ``cuisines``, ``min_rating``, ``min_price``,
``max_price``, ``vegetarian``, ``open_now``.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from modules.food.discovery import (
    haversine_km, compute_eta_minutes, DEFAULT_RADIUS_KM, PICKUP_DISCOVERY_KM,
)


public_router = APIRouter(prefix="/food", tags=["food-search"])


# Canonical cuisine list (also used as dropdown group). Order matters for
# ranking so keep the popular ones first.
CUISINES = [
    ("burgers",     {"fr": "Burgers",     "en": "Burgers"}),
    ("pizza",       {"fr": "Pizza",       "en": "Pizza"}),
    ("indian",      {"fr": "Indien",      "en": "Indian"}),
    ("italian",     {"fr": "Italien",     "en": "Italian"}),
    ("chinese",     {"fr": "Chinois",     "en": "Chinese"}),
    ("japanese",    {"fr": "Japonais",    "en": "Japanese"}),
    ("sushi",       {"fr": "Sushi",       "en": "Sushi"}),
    ("mexican",     {"fr": "Mexicain",    "en": "Mexican"}),
    ("french",      {"fr": "Français",    "en": "French"}),
    ("african",     {"fr": "Africain",    "en": "African"}),
    ("ivorian",     {"fr": "Ivoirien",    "en": "Ivorian"}),
    ("thai",        {"fr": "Thaï",        "en": "Thai"}),
    ("vegan",       {"fr": "Végétalien",  "en": "Vegan"}),
    ("vegetarian",  {"fr": "Végétarien",  "en": "Vegetarian"}),
    ("bbq",         {"fr": "BBQ",         "en": "BBQ"}),
    ("seafood",     {"fr": "Fruits de mer","en": "Seafood"}),
    ("fast_food",   {"fr": "Fast Food",   "en": "Fast Food"}),
    ("desserts",    {"fr": "Desserts",    "en": "Desserts"}),
]
_CUISINE_INDEX = {c[0]: c[1] for c in CUISINES}

DISCOVERY_RADIUS_KM = 15.0   # Same flat radius as /food/restaurants/discover


def _match_cuisines(q: str) -> list[dict]:
    """Return cuisine cards where the query matches the code or either label."""
    ql = q.lower().strip()
    if not ql:
        return []
    out: list[dict] = []
    for code, labels in CUISINES:
        hay = f"{code} {labels['fr']} {labels['en']}".lower()
        if ql in hay:
            out.append({
                "code":     code,
                "label_fr": labels["fr"],
                "label_en": labels["en"],
            })
    return out


def _matched_cuisine_codes(q: str) -> list[str]:
    """Return canonical cuisine codes whose FR/EN label contains q — enables
    cross-language DB search (e.g. FR user typing 'indien' matches the DB
    row `cuisines=["indian"]`)."""
    ql = q.lower().strip()
    if not ql:
        return []
    return [
        code for code, labels in CUISINES
        if ql in f"{code} {labels['fr']} {labels['en']}".lower()
    ]


def _like(q: str) -> str:
    # Escape SQL LIKE wildcards then wrap.
    safe = re.sub(r"[%_\\]", lambda m: "\\" + m.group(0), q)
    return f"%{safe}%"


def _apply_eligibility(row, lat, lng, mode: str) -> dict:
    """Attach distance / ETA / per-mode eligibility to a restaurant row.

    Same math as ``discovery._serialize`` but local so we can slim the
    payload returned by the search endpoint.
    """
    r_lat = float(row.latitude)  if row.latitude  is not None else None
    r_lng = float(row.longitude) if row.longitude is not None else None
    distance = None
    if lat is not None and lng is not None and r_lat is not None and r_lng is not None:
        distance = round(haversine_km(lat, lng, r_lat, r_lng), 2)

    own_radius = (float(row.delivery_radius_km)
                  if row.delivery_radius_km is not None else DEFAULT_RADIUS_KM)
    is_open   = bool(row.is_open)
    is_active = row.status == "active"

    delivery_eligible = (
        bool(row.delivery_enabled) and is_open and is_active
        and (distance is None or distance <= own_radius)
    )
    pickup_eligible = (
        bool(row.pickup_enabled) and is_open and is_active
        and (distance is None or distance <= PICKUP_DISCOVERY_KM)
    )
    reservation_eligible = (
        bool(row.reservations_enabled) and bool(row.reservation_public)
        and is_active
    )

    mode_eligible = {
        "delivery":    delivery_eligible,
        "pickup":      pickup_eligible,
        "reservation": reservation_eligible,
        "dine_in":     reservation_eligible,
    }.get(mode or "delivery", delivery_eligible)

    eta_min, eta_max = compute_eta_minutes(distance, row.prep_time_min, row.prep_time_max)

    return {
        "distance_km":       distance,
        "eta_min":           eta_min,
        "eta_max":           eta_max,
        "delivery_eligible": delivery_eligible,
        "pickup_eligible":   pickup_eligible,
        "reservation_eligible": reservation_eligible,
        "mode_eligible":     mode_eligible,
        "delivery_unavailable_reason": (
            None if delivery_eligible else
            ("outside_zone" if distance is not None and distance > own_radius else
             "closed"       if not is_open else
             "disabled")
        ),
    }


@public_router.get("/search")
async def search(
    q:       str = Query(..., min_length=1, max_length=64),
    mode:    Optional[str] = Query(None, pattern="^(delivery|pickup|dine_in)$"),
    country: Optional[str] = Query(None, max_length=4),
    lat:     Optional[float] = Query(None, ge=-90, le=90),
    lng:     Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(DISCOVERY_RADIUS_KM, ge=1, le=50,
                             description="Flat discovery radius in km when lat/lng supplied"),
    only_eligible: bool = Query(False,
        description="When true + lat/lng, out-of-zone rows (per mode) are hidden"),
    # ---- filter params (mirror /food/restaurants/discover) --------------
    sort: str = Query("popularity",
        pattern="^(popularity|rating_desc|price_asc|price_desc|delivery_time_asc)$"),
    cuisines: Optional[str] = Query(None, description="comma-separated cuisine codes"),
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    min_price:  Optional[float] = Query(None, ge=0),
    max_price:  Optional[float] = Query(None, ge=0),
    vegetarian: Optional[str] = Query(None, pattern="^(all|veg_options|pure_veg)$"),
    open_now:   bool = Query(False),
    limit:   int = Query(24, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    q_stripped = q.strip()
    if not q_stripped:
        return {"restaurants": [], "dishes": [], "cuisines": [], "reservations": []}

    q_like = _like(q_stripped)
    q_lower = q_stripped.lower()
    # Cross-language cuisine expansion: "indien" → looks up EN canonical "indian"
    # so DB rows carrying only the English tag still match.
    cuisine_expansions = _matched_cuisine_codes(q_stripped)

    # Pre-parse cuisine filter list.
    cuisine_filter: list[str] = []
    if cuisines:
        cuisine_filter = [c.strip().lower() for c in cuisines.split(",") if c.strip()]

    # -----------------------------------------------------------------
    # RESTAURANTS bucket
    #   - name / slug / cuisines ILIKE q
    #   - OR a menu item name matches q (so "burgers" returns every
    #     restaurant that actually sells a burger, like the category page)
    # -----------------------------------------------------------------
    rest_filters = ["r.status = 'active'"]
    rest_params: dict[str, Any] = {"q": q_like, "qlow": q_lower, "lim": limit * 4}
    if country:
        rest_filters.append("r.country = :country")
        rest_params["country"] = country.upper()
    if min_rating is not None:
        rest_filters.append("r.rating >= :min_rating")
        rest_params["min_rating"] = min_rating
    if open_now:
        rest_filters.append("r.is_open = TRUE")
    if cuisine_filter:
        rest_filters.append("r.cuisines ?| :cuisine_filter")
        rest_params["cuisine_filter"] = cuisine_filter

    cuisine_or = ""
    for i, code in enumerate(cuisine_expansions):
        key = f"cx{i}"
        rest_params[key] = f"%{code}%"
        cuisine_or += f" OR LOWER(r.cuisines::text) LIKE :{key}"

    # Dish-match branch — restaurant qualifies if any available item name hits
    # the query. Also respect vegetarian=pure_veg for the dish branch.
    veg_dish_filter = " AND mi.is_veg = TRUE" if vegetarian == "pure_veg" else ""
    rest_filters.append(f"""
        (
          r.name ILIKE :q OR r.slug ILIKE :q
          OR LOWER(r.cuisines::text) LIKE '%' || :qlow || '%'
          {cuisine_or}
          OR EXISTS (
            SELECT 1 FROM food_menu_items mi
             WHERE mi.restaurant_id = r.id
               AND mi.is_available = TRUE{veg_dish_filter}
               AND (mi.name ILIKE :q OR COALESCE(mi.description,'') ILIKE :q)
          )
        )
    """)

    # Price-range filter — restaurant has at least one available dish inside range.
    price_join = ""
    if min_price is not None or max_price is not None:
        price_join = """
          LEFT JOIN LATERAL (
            SELECT MIN(base_price) AS min_price, MAX(base_price) AS max_price
              FROM food_menu_items mi3
             WHERE mi3.restaurant_id = r.id AND mi3.is_available = TRUE
          ) prices ON TRUE
        """
        if min_price is not None:
            rest_filters.append("COALESCE(prices.max_price, 0) >= :min_price")
            rest_params["min_price"] = min_price
        if max_price is not None:
            rest_filters.append("COALESCE(prices.min_price, 0) <= :max_price")
            rest_params["max_price"] = max_price

    order_sql = {
        "popularity":         "r.featured DESC NULLS LAST, r.review_count DESC NULLS LAST, r.rating DESC NULLS LAST",
        "rating_desc":        "r.rating DESC NULLS LAST",
        "price_asc":          "COALESCE((SELECT MIN(base_price) FROM food_menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_available = TRUE), 0) ASC",
        "price_desc":         "COALESCE((SELECT MAX(base_price) FROM food_menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_available = TRUE), 0) DESC",
        "delivery_time_asc":  "r.prep_time_min ASC NULLS LAST",
    }[sort]

    where = " AND ".join(rest_filters)
    restaurants_rows = (await session.execute(text(f"""
        SELECT r.id, r.slug, r.name, r.image, r.country, r.cuisines, r.rating, r.review_count,
               r.is_open, r.reservations_enabled, r.reservation_public,
               r.latitude, r.longitude, r.delivery_enabled, r.delivery_radius_km,
               r.pickup_enabled, r.prep_time_min, r.prep_time_max, r.delivery_fee,
               r.status, r.featured, r.sort_order,
               r.delivery_paused_until, r.pickup_paused_until
          FROM food_restaurants r
          {price_join}
         WHERE {where}
         ORDER BY {order_sql}, r.id
         LIMIT :lim
    """), rest_params)).fetchall()

    def _rest_card(r: Any) -> dict:
        card = {
            "id": r.id, "slug": r.slug, "name": r.name,
            "image": r.image, "country": r.country,
            "cuisines": r.cuisines or [],
            "rating":   float(r.rating or 0),
            "review_count": int(r.review_count or 0),
            "is_open":  bool(r.is_open),
            "reservable": bool(r.reservations_enabled and r.reservation_public),
            "delivery_fee": float(r.delivery_fee or 0),
            "prep_time_min": r.prep_time_min,
            "prep_time_max": r.prep_time_max,
            "latitude":  float(r.latitude)  if r.latitude  is not None else None,
            "longitude": float(r.longitude) if r.longitude is not None else None,
        }
        if lat is not None and lng is not None:
            card.update(_apply_eligibility(r, lat, lng, mode or "delivery"))
        return card

    restaurants = [_rest_card(r) for r in restaurants_rows]

    # Enforce 15 km discovery radius when coords supplied — same as the
    # category page. Delivery mode keeps rows inside the radius so the UI
    # can show "Delivery unavailable at your address" per spec §5.
    if lat is not None and lng is not None:
        restaurants = [
            r for r in restaurants
            if r.get("distance_km") is None or r["distance_km"] <= radius_km
        ]
        if (mode or "delivery") in ("pickup", "dine_in") or only_eligible:
            restaurants = [r for r in restaurants if r.get("mode_eligible")]

    # Build the id→card map AFTER filtering so the dishes bucket inherits
    # the exact same eligibility set.
    rest_by_id = {r["id"]: r for r in restaurants}

    # Clamp final payload to the requested limit.
    restaurants = restaurants[:limit]

    # -----------------------------------------------------------------
    # DISHES bucket
    # -----------------------------------------------------------------
    dish_filters = ["i.is_available = TRUE", "r.status = 'active'"]
    dish_params: dict[str, Any] = {"q": q_like, "qlow": q_lower, "lim": limit * 3}
    if country:
        dish_filters.append("r.country = :country")
        dish_params["country"] = country.upper()
    if min_rating is not None:
        dish_filters.append("r.rating >= :min_rating")
        dish_params["min_rating"] = min_rating
    if open_now:
        dish_filters.append("r.is_open = TRUE")
    if cuisine_filter:
        dish_filters.append("r.cuisines ?| :cuisine_filter")
        dish_params["cuisine_filter"] = cuisine_filter
    if vegetarian == "pure_veg":
        dish_filters.append("i.is_veg = TRUE")
    if min_price is not None:
        dish_filters.append("i.base_price >= :min_price")
        dish_params["min_price"] = min_price
    if max_price is not None:
        dish_filters.append("i.base_price <= :max_price")
        dish_params["max_price"] = max_price
    dish_filters.append(
        "(i.name ILIKE :q OR COALESCE(i.description,'') ILIKE :q "
        " OR LOWER(i.tags::text) LIKE '%' || :qlow || '%')"
    )
    dishes_rows = (await session.execute(text(f"""
        SELECT i.id, i.restaurant_id, i.name, i.description, i.image,
               i.base_price, i.currency, i.is_veg, i.tags,
               r.name AS restaurant_name, r.slug AS restaurant_slug,
               r.rating AS restaurant_rating,
               r.latitude, r.longitude, r.delivery_enabled, r.delivery_radius_km,
               r.pickup_enabled, r.reservations_enabled, r.reservation_public,
               r.is_open, r.status, r.prep_time_min, r.prep_time_max,
               r.delivery_paused_until, r.pickup_paused_until
          FROM food_menu_items i
          JOIN food_restaurants r ON r.id = i.restaurant_id
         WHERE {" AND ".join(dish_filters)}
         ORDER BY r.rating DESC NULLS LAST, r.featured DESC NULLS LAST
         LIMIT :lim
    """), dish_params)).fetchall()

    dishes: list[dict[str, Any]] = []
    for d in dishes_rows:
        base = {
            "id": d.id,
            "restaurant_id":     d.restaurant_id,
            "restaurant_name":   d.restaurant_name,
            "restaurant_slug":   d.restaurant_slug,
            "restaurant_rating": float(d.restaurant_rating or 0),
            "name": d.name, "description": d.description, "image": d.image,
            "price":    float(d.base_price or 0),
            "currency": d.currency or "XOF",
            "is_veg":   bool(d.is_veg),
            "tags":     d.tags or [],
        }
        if lat is not None and lng is not None:
            elig = _apply_eligibility(d, lat, lng, mode or "delivery")
            # Enforce 15 km discovery radius on dishes too.
            if elig["distance_km"] is not None and elig["distance_km"] > radius_km:
                continue
            # When in pickup/dine_in or only_eligible, drop ineligible rows.
            if ((mode or "delivery") in ("pickup", "dine_in") or only_eligible) \
                    and not elig["mode_eligible"]:
                continue
            base.update(elig)
        dishes.append(base)
    dishes = dishes[:limit]

    # -----------------------------------------------------------------
    # CUISINES bucket (in-memory canonical list)
    # -----------------------------------------------------------------
    cuisines_hits = _match_cuisines(q_stripped)[:limit]

    # -----------------------------------------------------------------
    # RESERVATIONS bucket — restaurants where reservation_public=true
    # -----------------------------------------------------------------
    reservations: list[dict] = []
    is_reservation_query = q_lower in {
        "table", "tables", "réserver", "reserver", "reserve", "reservation", "réservation",
        "book", "booking", "dine-in", "dinein", "dine in",
    }
    if is_reservation_query or mode == "dine_in":
        res_filters = ["r.status = 'active'", "r.reservations_enabled = TRUE", "r.reservation_public = TRUE"]
        res_params: dict[str, Any] = {"lim": limit}
        if country:
            res_filters.append("r.country = :country")
            res_params["country"] = country.upper()
        if not is_reservation_query:
            res_filters.append("(r.name ILIKE :q OR r.slug ILIKE :q OR LOWER(r.cuisines::text) LIKE '%' || :qlow || '%')")
            res_params["q"] = q_like
            res_params["qlow"] = q_lower
        res_rows = (await session.execute(text(f"""
            SELECT id, slug, name, image, country, cuisines, rating,
                   latitude, longitude, delivery_enabled, delivery_radius_km,
                   pickup_enabled, reservations_enabled, reservation_public,
                   is_open, status, prep_time_min, prep_time_max,
                   delivery_paused_until, pickup_paused_until
              FROM food_restaurants r
             WHERE {" AND ".join(res_filters)}
             ORDER BY featured DESC NULLS LAST, rating DESC NULLS LAST
             LIMIT :lim
        """), res_params)).fetchall()
        for r in res_rows:
            card = {
                "id": r.id, "slug": r.slug, "name": r.name, "image": r.image,
                "country": r.country, "cuisines": r.cuisines or [],
                "rating":  float(r.rating or 0),
            }
            if lat is not None and lng is not None:
                elig = _apply_eligibility(r, lat, lng, "reservation")
                if elig["distance_km"] is not None and elig["distance_km"] > radius_km:
                    continue
                card.update(elig)
            reservations.append(card)
    else:
        reservations = [{
            "id": r["id"], "slug": r["slug"], "name": r["name"],
            "image": r["image"], "cuisines": r["cuisines"],
            "rating": r["rating"], "country": r["country"],
        } for r in restaurants if r.get("reservable")][:3]

    # In dine_in mode, prefer reservable restaurants at the top of the
    # restaurants bucket.
    if mode == "dine_in":
        restaurants.sort(key=lambda r: (not r["reservable"], -r["rating"]))

    return {
        "query":        q_stripped,
        "mode":         mode,
        "radius_km":    radius_km,
        "has_customer_coords": lat is not None and lng is not None,
        "restaurants":  restaurants,
        "dishes":       dishes,
        "cuisines":     cuisines_hits,
        "reservations": reservations,
    }
