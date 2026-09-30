"""FOODbakēd — Unified discovery search.

  GET /api/food/search?q=&mode=&country=&limit=

Returns 4 grouped buckets:
  - restaurants  : name / slug ILIKE q OR cuisines JSONB contains q
  - dishes       : menu items name / description / tags ILIKE q
                   (only from `is_available=TRUE` items on active restaurants)
  - cuisines     : cuisine strings matched from an in-memory canonical list
                   (kept small – purely for the dropdown group header)
  - reservations : restaurants where reservations_enabled AND reservation_public
                   AND (query matches name/slug OR user picked mode=dine_in)

Mode semantics:
  * `delivery` — default; no filter (delivery eligibility is done client-side
     against the global location later — MVP: same set as base)
  * `pickup`   — same result set for now (server has no pickup flag yet).
  * `dine_in`  — restaurants bucket is filtered to reservation_public=true
                 and the `reservations` bucket ranks higher.

Everything is case-insensitive, tenant-aware (country param when supplied),
and parameterised — no raw string interpolation into SQL.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session


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


@public_router.get("/search")
async def search(
    q:       str = Query(..., min_length=1, max_length=64),
    mode:    Optional[str] = Query(None, pattern="^(delivery|pickup|dine_in)$"),
    country: Optional[str] = Query(None, max_length=4),
    limit:   int = Query(8, ge=1, le=25),
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

    # -----------------------------------------------------------------
    # RESTAURANTS bucket
    # -----------------------------------------------------------------
    rest_filters = ["r.status = 'active'"]
    rest_params: dict[str, Any] = {"q": q_like, "qlow": q_lower, "lim": limit}
    if country:
        rest_filters.append("r.country = :country")
        rest_params["country"] = country.upper()

    # Build a variable OR clause for cuisine expansions.
    cuisine_or = ""
    for i, code in enumerate(cuisine_expansions):
        key = f"cx{i}"
        rest_params[key] = f"%{code}%"
        cuisine_or += f" OR LOWER(r.cuisines::text) LIKE :{key}"

    rest_filters.append(
        "(r.name ILIKE :q OR r.slug ILIKE :q "
        " OR LOWER(r.cuisines::text) LIKE '%' || :qlow || '%'"
        f"{cuisine_or})"
    )
    where = " AND ".join(rest_filters)

    restaurants_rows = (await session.execute(text(f"""
        SELECT id, slug, name, image, country, cuisines, rating, review_count,
               is_open, reservations_enabled, reservation_public
          FROM food_restaurants r
         WHERE {where}
         ORDER BY featured DESC NULLS LAST, rating DESC NULLS LAST, sort_order ASC
         LIMIT :lim
    """), rest_params)).fetchall()

    def _rest_card(r: Any) -> dict:
        return {
            "id": r.id, "slug": r.slug, "name": r.name,
            "image": r.image, "country": r.country,
            "cuisines": r.cuisines or [],
            "rating":   float(r.rating or 0),
            "review_count": int(r.review_count or 0),
            "is_open":  bool(r.is_open),
            "reservable": bool(r.reservations_enabled and r.reservation_public),
        }

    restaurants = [_rest_card(r) for r in restaurants_rows]

    # -----------------------------------------------------------------
    # DISHES bucket
    # -----------------------------------------------------------------
    dish_filters = ["i.is_available = TRUE", "r.status = 'active'"]
    dish_params: dict[str, Any] = {"q": q_like, "qlow": q_lower, "lim": limit}
    if country:
        dish_filters.append("r.country = :country")
        dish_params["country"] = country.upper()
    dish_filters.append(
        "(i.name ILIKE :q OR COALESCE(i.description,'') ILIKE :q "
        " OR LOWER(i.tags::text) LIKE '%' || :qlow || '%')"
    )
    dishes_rows = (await session.execute(text(f"""
        SELECT i.id, i.restaurant_id, i.name, i.description, i.image,
               i.base_price, i.currency, i.is_veg, i.tags,
               r.name AS restaurant_name, r.slug AS restaurant_slug,
               r.rating AS restaurant_rating
          FROM food_menu_items i
          JOIN food_restaurants r ON r.id = i.restaurant_id
         WHERE {" AND ".join(dish_filters)}
         ORDER BY r.rating DESC NULLS LAST, r.featured DESC NULLS LAST
         LIMIT :lim
    """), dish_params)).fetchall()

    dishes = [{
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
    } for d in dishes_rows]

    # -----------------------------------------------------------------
    # CUISINES bucket (in-memory canonical list)
    # -----------------------------------------------------------------
    cuisines = _match_cuisines(q_stripped)[:limit]

    # -----------------------------------------------------------------
    # RESERVATIONS bucket — restaurants where reservation_public=true
    # -----------------------------------------------------------------
    reservations: list[dict] = []
    is_reservation_query = q_lower in {
        "table", "tables", "réserver", "reserver", "reserve", "reservation", "réservation",
        "book", "booking", "dine-in", "dinein", "dine in",
    }
    if is_reservation_query or mode == "dine_in":
        # If the query is a pure reservation keyword: return all publicly-reservable.
        res_filters = ["r.status = 'active'", "r.reservations_enabled = TRUE", "r.reservation_public = TRUE"]
        res_params: dict[str, Any] = {"lim": limit}
        if country:
            res_filters.append("r.country = :country")
            res_params["country"] = country.upper()
        if not is_reservation_query:
            # Filter by the query when mode=dine_in and it's not a reservation keyword.
            res_filters.append("(r.name ILIKE :q OR r.slug ILIKE :q OR LOWER(r.cuisines::text) LIKE '%' || :qlow || '%')")
            res_params["q"] = q_like
            res_params["qlow"] = q_lower
        res_rows = (await session.execute(text(f"""
            SELECT id, slug, name, image, country, cuisines, rating
              FROM food_restaurants r
             WHERE {" AND ".join(res_filters)}
             ORDER BY featured DESC NULLS LAST, rating DESC NULLS LAST
             LIMIT :lim
        """), res_params)).fetchall()
        reservations = [{
            "id": r.id, "slug": r.slug, "name": r.name, "image": r.image,
            "country": r.country, "cuisines": r.cuisines or [],
            "rating":  float(r.rating or 0),
        } for r in res_rows]
    else:
        # For general queries, if any of the matched restaurants are reservable,
        # surface them as a small hint (max 3).
        reservations = [{
            "id": r["id"], "slug": r["slug"], "name": r["name"],
            "image": r["image"], "cuisines": r["cuisines"],
            "rating": r["rating"], "country": r["country"],
        } for r in restaurants if r["reservable"]][:3]

    # In dine_in mode, prefer reservable restaurants at the top.
    if mode == "dine_in":
        restaurants.sort(key=lambda r: (not r["reservable"], -r["rating"]))

    return {
        "query":        q_stripped,
        "mode":         mode,
        "restaurants":  restaurants,
        "dishes":       dishes,
        "cuisines":     cuisines,
        "reservations": reservations,
    }
