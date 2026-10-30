"""FOODbakēd category-based restaurant discovery (P0 Spec §2–§10).

Backed by ``food_menu_items`` + the trigram index on ``lower(name)`` so a
``?category=pizza`` click surfaces any restaurant with an available dish
whose name hits the Pizza synonym registry — regardless of the venue's
primary cuisine label.

Scope rules (from the approved plan):
  * Fixed **15 km** discovery radius from the customer's selected address.
  * Delivery-mode results flag each card with ``delivery_eligible``:
    - inside the restaurant's own ``delivery_radius_km`` → eligible
    - outside its zone → ``delivery_eligible=False`` + a reason, UI must
      disable the delivery CTA (customer sees "Delivery unavailable at your
      address" before picking a dish).
  * Pickup / dine_in use their own eligibility (reuses the existing
    discovery module).
  * Dedup by ``restaurant_id`` — a venue with 10 matching dishes appears
    once, with a tiny ``matched_items`` preview.

Endpoints
---------
  GET /api/food/restaurants/discover
  GET /api/food/categories            → FR+EN labels + synonyms for the UI
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from modules.food.discovery import (
    haversine_km, compute_eta_minutes, DEFAULT_RADIUS_KM, PICKUP_DISCOVERY_KM,
)
from modules.food.category_synonyms import (
    synonyms_for, cuisine_hints_for, all_categories,
)


router = APIRouter(prefix="/food", tags=["food-discovery-page"])

DISCOVERY_RADIUS_KM = 15.0       # Spec §5 — flat radius for browsing


# ---------------------------------------------------------------------------
# GET /food/restaurants/discover
# ---------------------------------------------------------------------------
@router.get("/restaurants/discover")
async def discover_restaurants(
    category: Optional[str] = Query(None, max_length=48),
    query:    Optional[str] = Query(None, max_length=96),
    lat:      Optional[float] = Query(None, ge=-90,  le=90),
    lng:      Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(DISCOVERY_RADIUS_KM, ge=1, le=50),
    country:  Optional[str] = Query(None, max_length=4),
    fulfillment_mode: str = Query("delivery", pattern="^(delivery|pickup|dine_in|reservation)$"),
    cuisines: Optional[str] = Query(None, description="comma-separated cuisine codes"),
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    min_price:  Optional[float] = Query(None, ge=0),
    max_price:  Optional[float] = Query(None, ge=0),
    vegetarian: Optional[str] = Query(None, pattern="^(all|veg_options|pure_veg)$"),
    open_now:   bool = Query(False),
    sort: str = Query("popularity",
        pattern="^(popularity|rating_desc|price_asc|price_desc|delivery_time_asc)$"),
    page: int = Query(1, ge=1, le=200),
    limit: int = Query(24, ge=1, le=48),
    session: AsyncSession = Depends(get_session),
):
    """Dedicated discovery query — menu-item centric, location-enforced.

    Response shape (per spec §10 — cards render without extra fetches):
        { "items": [{restaurant card with matched_items + delivery_eligible}],
          "page": 1, "total": N, "radius_km": 15, "has_customer_coords": true }
    """
    # Mode "reservation" is the canonical label for dine_in — carried through
    # from the hero toggle used by the home page.
    mode = "reservation" if fulfillment_mode == "dine_in" else fulfillment_mode

    tokens      = synonyms_for(category) if category else []
    cuisine_hts = cuisine_hints_for(category) if category else []

    where = ["r.status = 'active'"]
    params: dict[str, Any] = {}
    if country:
        where.append("r.country = :country")
        params["country"] = country.upper()
    if min_rating is not None:
        where.append("r.rating >= :min_rating")
        params["min_rating"] = min_rating
    if open_now:
        where.append("r.is_open = TRUE")
    if cuisines:
        cuisine_list = [c.strip().lower() for c in cuisines.split(",") if c.strip()]
        if cuisine_list:
            where.append("r.cuisines ?| :cuisine_list")
            params["cuisine_list"] = cuisine_list

    # Category match: EITHER the restaurant has an available menu item whose
    # name hits a synonym, OR its cuisines array overlaps the hint list.
    # Executed as a correlated EXISTS so dedup is natural (one row per
    # restaurant). We also build the matched_items preview in the same CTE.
    cat_cte = ""
    if tokens or cuisine_hts:
        params["tokens"]      = tokens or [""]
        params["cuisine_hts"] = cuisine_hts or [""]
        if vegetarian == "pure_veg":
            veg_filter = " AND mi.is_veg = TRUE"
        else:
            veg_filter = ""
        cat_cte = f"""
          AND (
            EXISTS (
              SELECT 1 FROM food_menu_items mi
               WHERE mi.restaurant_id = r.id
                 AND mi.is_available = TRUE{veg_filter}
                 AND lower(mi.name) ILIKE ANY (ARRAY(SELECT '%' || t || '%' FROM UNNEST(CAST(:tokens AS TEXT[])) t))
            )
            OR r.cuisines ?| :cuisine_hts
          )
        """

    # Free-text query (optional) — hits both restaurant name AND menu item
    # name for the "Searching Biryani" integration path (spec §12).
    if query:
        where.append("""
          (r.name ILIKE :q OR EXISTS (
             SELECT 1 FROM food_menu_items mi2 WHERE mi2.restaurant_id = r.id
              AND mi2.is_available = TRUE AND lower(mi2.name) ILIKE :q
          ))
        """)
        params["q"] = f"%{query.lower()}%"

    where_sql = " AND ".join(where) + cat_cte

    # Price-range filter — compare against the restaurant's cheapest available
    # dish so the chip means "I want restaurants with items in this range".
    price_join = ""
    price_where = ""
    if min_price is not None or max_price is not None:
        price_join = """
          LEFT JOIN LATERAL (
            SELECT MIN(base_price) AS min_price, MAX(base_price) AS max_price
              FROM food_menu_items mi3
             WHERE mi3.restaurant_id = r.id AND mi3.is_available = TRUE
          ) prices ON TRUE
        """
        if min_price is not None:
            price_where += " AND COALESCE(prices.max_price, 0) >= :min_price"
            params["min_price"] = min_price
        if max_price is not None:
            price_where += " AND COALESCE(prices.min_price, 0) <= :max_price"
            params["max_price"] = max_price

    order_sql = {
        "popularity":         "r.featured DESC NULLS LAST, r.review_count DESC NULLS LAST",
        "rating_desc":        "r.rating DESC NULLS LAST",
        "price_asc":          "COALESCE((SELECT MIN(base_price) FROM food_menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_available = TRUE), 0) ASC",
        "price_desc":         "COALESCE((SELECT MAX(base_price) FROM food_menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_available = TRUE), 0) DESC",
        "delivery_time_asc":  "r.prep_time_min ASC NULLS LAST",
    }[sort]

    # Fetch a wide window (3x the page) when coords are provided so we can
    # haversine-filter in Python without a second round-trip.
    fetch_window = max(limit * 4, 80) if (lat is not None and lng is not None) else limit
    offset = (page - 1) * limit
    params["offset"] = offset
    params["lim"]    = fetch_window

    sql = f"""
        SELECT r.*
          FROM food_restaurants r
          {price_join}
         WHERE {where_sql}{price_where}
         ORDER BY {order_sql}, r.id
         LIMIT :lim
    """
    rows = (await session.execute(text(sql), params)).fetchall()

    items: list[dict[str, Any]] = []
    for r in rows:
        r_lat = float(r.latitude)  if r.latitude  is not None else None
        r_lng = float(r.longitude) if r.longitude is not None else None
        distance = None
        if lat is not None and lng is not None and r_lat is not None and r_lng is not None:
            distance = round(haversine_km(lat, lng, r_lat, r_lng), 2)
            if distance > radius_km:
                continue

        # Delivery eligibility: inside own `delivery_radius_km` + delivery enabled.
        own_radius = (float(r.delivery_radius_km)
                      if r.delivery_radius_km is not None else DEFAULT_RADIUS_KM)
        delivery_eligible = (
            bool(r.delivery_enabled) and r.is_open and r.status == "active"
            and (distance is None or distance <= own_radius)
        )
        pickup_eligible = (
            bool(r.pickup_enabled) and r.is_open and r.status == "active"
            and (distance is None or distance <= PICKUP_DISCOVERY_KM)
        )
        reservation_eligible = (
            bool(r.reservations_enabled) and bool(r.reservation_public)
            and r.status == "active"
        )

        if mode == "delivery":
            mode_eligible = delivery_eligible
            # Spec: 15km discovery still shows the card but a non-deliverable
            # venue gets `delivery_eligible=False` so the UI can mark it
            # "Delivery unavailable at your address".
            include = True
        elif mode == "pickup":
            mode_eligible = pickup_eligible
            include = pickup_eligible
        else:
            mode_eligible = reservation_eligible
            include = reservation_eligible
        if not include:
            continue

        eta_min, eta_max = compute_eta_minutes(distance, r.prep_time_min, r.prep_time_max)

        # Matched items preview — up to 3 dish names + cheapest price for the card.
        if tokens:
            veg_sql = " AND is_veg = TRUE" if vegetarian == "pure_veg" else ""
            preview = (await session.execute(text(f"""
                SELECT id, name, base_price, image, is_veg
                  FROM food_menu_items
                 WHERE restaurant_id = :r AND is_available = TRUE{veg_sql}
                   AND lower(name) ILIKE ANY (ARRAY(SELECT '%' || t || '%'
                                                      FROM UNNEST(CAST(:toks AS TEXT[])) t))
                 ORDER BY base_price ASC
                 LIMIT 3
            """), {"r": r.id, "toks": tokens})).fetchall()
            matched = [{
                "id": m.id, "name": m.name,
                "price": float(m.base_price), "image": m.image, "is_veg": bool(m.is_veg),
            } for m in preview]
            starting_price = float(preview[0].base_price) if preview else None
        else:
            matched = []
            starting_price = None

        items.append({
            "id": r.id, "slug": r.slug, "name": r.name,
            "country": r.country, "cuisines": r.cuisines or [],
            "image": r.image,
            "rating": float(r.rating or 0),
            "review_count": int(r.review_count or 0),
            "prep_time_min": r.prep_time_min, "prep_time_max": r.prep_time_max,
            "delivery_fee": float(r.delivery_fee or 0),
            "is_open": bool(r.is_open),
            "featured": bool(r.featured),
            "latitude": r_lat, "longitude": r_lng,
            "distance_km": distance,
            "eta_min": eta_min, "eta_max": eta_max,
            # Eligibility signals — the frontend uses these to render the
            # "Delivery unavailable" banner and gate the delivery CTA.
            "delivery_eligible":    delivery_eligible,
            "pickup_eligible":      pickup_eligible,
            "reservation_eligible": reservation_eligible,
            "mode_eligible":        mode_eligible,
            "delivery_unavailable_reason":
                (None if delivery_eligible else
                 ("outside_zone" if distance and distance > own_radius else
                  "closed" if not r.is_open else "disabled")),
            # Discovery hits
            "matched_items":   matched,
            "starting_price":  starting_price,
        })

    # Distance-sort if the chosen sort doesn't already impose one.
    if sort == "popularity" and lat is not None and lng is not None:
        items.sort(key=lambda x: (
            -int(x["featured"]), x["distance_km"] if x["distance_km"] is not None else 1e9,
        ))

    paginated = items[offset:offset + limit] if lat is not None else items[:limit]
    return {
        "items": paginated,
        "page": page, "limit": limit, "total": len(items),
        "has_customer_coords": lat is not None and lng is not None,
        "radius_km": radius_km, "category": category,
        "fulfillment_mode": fulfillment_mode,
    }


# ---------------------------------------------------------------------------
# GET /food/categories — chip registry for the UI
# ---------------------------------------------------------------------------
@router.get("/categories")
async def food_categories(
    include_synonyms: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """FR+EN category labels + optional synonym list. The frontend chip bar
    and filter modal use this; keeping it a single endpoint means synonyms
    stay centrally managed (Admin-managed later is a drop-in replacement)."""
    rows = (await session.execute(text("""
        SELECT code, name_en, name_fr, image, sort_order
          FROM food_categories WHERE is_active = TRUE ORDER BY sort_order
    """))).fetchall()
    out = []
    for r in rows:
        row = {"code": r.code, "name_en": r.name_en, "name_fr": r.name_fr,
               "image": r.image, "sort_order": r.sort_order}
        if include_synonyms:
            row["synonyms"]      = synonyms_for(r.code)
            row["cuisine_hints"] = cuisine_hints_for(r.code)
        out.append(row)
    return {"items": out, "known_categories": all_categories()}
