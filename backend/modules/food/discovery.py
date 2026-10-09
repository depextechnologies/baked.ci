"""Location-aware FOODbakēd discovery (P0 Core Discovery).

Single source of truth for "is this restaurant deliverable / pickable /
reservable for THIS customer right now?". Everything the homepage, search,
Top Brands carousel and checkout call lives here so eligibility is enforced
in exactly one place.

Shape of the eligibility logic
------------------------------
1. **Delivery** (default): restaurant must have `delivery_enabled`, must
   have real coordinates, and the great-circle distance from the customer
   to the restaurant must be ≤ `delivery_radius_km` (default 5 km,
   confirmed with product). Admin-paused delivery hides the row.
2. **Pickup**: `pickup_enabled` + customer within a wider discovery radius
   (`PICKUP_DISCOVERY_KM`, hardcoded at 25 km — distance just orders the
   results, nobody is turned away for being 6 km from a pickup spot).
3. **Reservation**: `reservations_enabled` + `reservation_public` + any
   distance. Reservation is a destination activity so we don't filter by
   kilometres — we only sort.

Fallbacks
---------
* No customer coordinates → fall back to country-match only, same as the
  pre-location behaviour. The UI shows a "Please set your delivery address"
  banner on top of these results.
* No restaurant coordinates → the row is deliverable within its country but
  distance / ETA are not computed; a `"needs_coords"` flag is surfaced so
  the admin UI can display a "Set address" warning on the vendor row.

ETA
---
`compute_eta_minutes(distance_km, prep_min, prep_max)` returns the (min, max)
window a card displays. Formula is intentionally simple and reusable:
`prep + distance / AVG_SPEED_KMH * 60`, clamped to a 5-minute minimum
travel component. Google Maps routing is deliberately NOT called inline —
it would blow up the API bill on carousels; the dispatch bridge can refine
ETAs when an order is actually placed.

Endpoints
---------
* GET /api/food/discovery        — the generic list the FoodHome, cuisine
                                   filters and category chips consume
* GET /api/food/brands/top       — the "Top Brands for You" carousel feed,
                                   grouped by brand name (nearest branch
                                   wins per product confirmation)
* GET /api/food/discovery/check  — single-restaurant eligibility probe,
                                   reused by the restaurant microsite +
                                   the checkout validator
"""
from __future__ import annotations

import math
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session


router = APIRouter(prefix="/food", tags=["food-discovery"])

DEFAULT_RADIUS_KM   = 5.0      # product-confirmed default when partner hasn't set one
PICKUP_DISCOVERY_KM = 25.0     # pickup search radius (soft cap, used for sorting)
AVG_SPEED_KMH       = 25.0     # urban Abidjan — rounds to realistic 2-min/km
EARTH_KM            = 6371.0


# ---------------------------------------------------------------------------
# Geo helpers — pure, dependency-free
# ---------------------------------------------------------------------------
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two WGS84 points in kilometres."""
    rlat1, rlng1, rlat2, rlng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    dlat, dlng = rlat2 - rlat1, rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def compute_eta_minutes(distance_km: Optional[float], prep_min: int, prep_max: int) -> tuple[Optional[int], Optional[int]]:
    """ETA window shown on cards. ``None`` when distance is unknown so the UI
    can fall back to the configured prep window alone."""
    if distance_km is None:
        return (prep_min or None, prep_max or None)
    travel = max(5.0, (distance_km / AVG_SPEED_KMH) * 60.0)
    return (int(round(prep_min + travel)), int(round(prep_max + travel)))


# ---------------------------------------------------------------------------
# Serialiser — same keys as _restaurant_row + distance/eta/eligibility
# ---------------------------------------------------------------------------
def _serialize(row, *, lat: Optional[float], lng: Optional[float], mode: str) -> dict[str, Any]:
    # "dine_in" is the UI label used by the hero toggle; map it to the
    # canonical "reservation" mode used by the eligibility logic.
    if mode == "dine_in":
        mode = "reservation"
    r_lat = float(row.latitude)  if row.latitude  is not None else None
    r_lng = float(row.longitude) if row.longitude is not None else None
    distance = (haversine_km(lat, lng, r_lat, r_lng)
                if (lat is not None and lng is not None and r_lat is not None and r_lng is not None)
                else None)
    radius = (float(row.delivery_radius_km) if row.delivery_radius_km is not None else DEFAULT_RADIUS_KM)

    delivery_eligible = False
    pickup_eligible   = False
    reservation_eligible = False

    if row.status == "active" and row.is_open:
        if bool(row.delivery_enabled) and not _paused(row, "delivery_paused_until"):
            # If we have both coord sets, enforce radius; otherwise accept country match.
            if distance is not None:
                delivery_eligible = distance <= radius
            else:
                delivery_eligible = True   # country fallback — bannered on frontend
        if bool(row.pickup_enabled) and not _paused(row, "pickup_paused_until"):
            if distance is not None:
                pickup_eligible = distance <= PICKUP_DISCOVERY_KM
            else:
                pickup_eligible = True
        if bool(row.reservations_enabled) and bool(row.reservation_public):
            reservation_eligible = True

    mode_eligible = {
        "delivery":    delivery_eligible,
        "pickup":      pickup_eligible,
        "reservation": reservation_eligible,
    }.get(mode, delivery_eligible)

    eta_min, eta_max = compute_eta_minutes(distance, row.prep_time_min, row.prep_time_max)

    return {
        "id":            row.id,
        "name":          row.name,
        "slug":          row.slug,
        "country":       row.country,
        "cuisines":      row.cuisines,
        "rating":        float(row.rating or 0),
        "review_count":  row.review_count,
        "prep_time_min": row.prep_time_min,
        "prep_time_max": row.prep_time_max,
        "delivery_fee":  row.delivery_fee,
        "is_open":       row.is_open,
        "featured":      row.featured,
        "image":         row.image,
        "status":        row.status,
        # Location-aware additions
        "latitude":              r_lat,
        "longitude":             r_lng,
        "has_coords":            r_lat is not None and r_lng is not None,
        "distance_km":           round(distance, 2) if distance is not None else None,
        "delivery_enabled":      bool(row.delivery_enabled),
        "delivery_radius_km":    radius,
        "pickup_enabled":        bool(row.pickup_enabled),
        "reservations_enabled":  bool(row.reservations_enabled),
        "mode_eligible":         mode_eligible,
        "delivery_eligible":     delivery_eligible,
        "pickup_eligible":       pickup_eligible,
        "reservation_eligible":  reservation_eligible,
        "eta_min":               eta_min,
        "eta_max":               eta_max,
        # Admin signal — vendor hasn't filled coords, surface a "Set address"
        # warning on their row in /admin/food/restaurants.
        "needs_coords":          r_lat is None or r_lng is None,
    }


def _paused(row, attr: str) -> bool:
    from datetime import datetime, timezone
    ts = getattr(row, attr, None)
    return bool(ts and ts > datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Core query — filter + sort by distance when coords available
# ---------------------------------------------------------------------------
async def _fetch_candidates(
    session: AsyncSession, *, country: str,
    cuisine: Optional[str] = None, limit: int = 50,
) -> list:
    where = ["country = :c", "status = 'active'"]
    params: dict[str, Any] = {"c": country.upper(), "limit": limit}
    if cuisine and cuisine != "all":
        where.append("cuisines ? :cu")
        params["cu"] = cuisine
    sql = f"""
        SELECT * FROM food_restaurants
         WHERE {' AND '.join(where)}
         ORDER BY featured DESC, sort_order ASC, name ASC
         LIMIT :limit
    """
    return (await session.execute(text(sql), params)).fetchall()


# ---------------------------------------------------------------------------
# /food/discovery — the generic list every FoodHome rail uses
# ---------------------------------------------------------------------------
@router.get("/discovery")
async def discovery(
    country: str = Query(..., min_length=2, max_length=4),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    mode: str = Query("delivery", pattern="^(delivery|pickup|reservation|dine_in)$"),
    cuisine: Optional[str] = Query(None),
    featured: Optional[bool] = Query(None),
    only_eligible: bool = Query(True, description="Set FALSE to see out-of-zone rows too"),
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Location-aware restaurant list. Falls back to country match when the
    customer hasn't picked an address yet (``lat`` / ``lng`` omitted)."""
    rows = await _fetch_candidates(session, country=country, cuisine=cuisine, limit=limit * 3)
    items = [_serialize(r, lat=lat, lng=lng, mode=mode) for r in rows]
    if featured is not None:
        items = [i for i in items if i["featured"] == featured]
    if only_eligible:
        items = [i for i in items if i["mode_eligible"]]
    # Distance-sort when we have coords, otherwise keep CMS sort_order.
    if lat is not None and lng is not None:
        items.sort(key=lambda i: (
            0 if i["distance_km"] is not None else 1,
            i["distance_km"] if i["distance_km"] is not None else 0,
            -i["rating"],
        ))
    return {
        "items": items[:limit],
        "mode": mode,
        "has_customer_coords": lat is not None and lng is not None,
        "default_radius_km": DEFAULT_RADIUS_KM,
    }


# ---------------------------------------------------------------------------
# /food/brands/top — Top Brands for You carousel feed
# ---------------------------------------------------------------------------
@router.get("/brands/top")
async def top_brands(
    country: str = Query(..., min_length=2, max_length=4),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    mode: str = Query("delivery", pattern="^(delivery|pickup|reservation|dine_in)$"),
    limit: int = Query(10, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
):
    """One card per brand (grouped by ``name``), nearest open eligible branch
    wins per product confirmation. Never returns a brand with zero eligible
    branches — the carousel disappears cleanly when nothing nearby serves
    the selected address."""
    rows = await _fetch_candidates(session, country=country, limit=200)
    serialized = [_serialize(r, lat=lat, lng=lng, mode=mode) for r in rows]
    # Only consider branches eligible under the requested mode.
    eligible = [s for s in serialized if s["mode_eligible"]]

    best: dict[str, dict[str, Any]] = {}
    for s in eligible:
        # Normalise brand key: trim + case-insensitive. "Burger Hub" and
        # "burger hub" collapse to the same brand card.
        key = (s["name"] or "").strip().lower()
        if not key:
            continue
        current = best.get(key)
        if current is None:
            best[key] = s
            continue
        # "Nearest open" tie-break: distance (None last) → rating desc.
        a_d = current["distance_km"] if current["distance_km"] is not None else float("inf")
        b_d = s["distance_km"]       if s["distance_km"]       is not None else float("inf")
        if b_d < a_d or (b_d == a_d and s["rating"] > current["rating"]):
            best[key] = s

    brands = list(best.values())
    brands.sort(key=lambda i: (
        0 if i["distance_km"] is not None else 1,
        i["distance_km"] if i["distance_km"] is not None else 0,
        -i["rating"],
    ))
    return {
        "items": [
            {
                "brand":              s["name"],
                "restaurant_id":      s["id"],
                "slug":                s["slug"],
                "image":               s["image"],
                "country":             s["country"],
                "cuisines":            s["cuisines"],
                "rating":              s["rating"],
                "distance_km":         s["distance_km"],
                "eta_min":             s["eta_min"],
                "eta_max":             s["eta_max"],
                "delivery_fee":        s["delivery_fee"],
                "mode_eligible":       s["mode_eligible"],
            } for s in brands[:limit]
        ],
        "mode": mode,
        "has_customer_coords": lat is not None and lng is not None,
    }


# ---------------------------------------------------------------------------
# /food/discovery/check — single restaurant probe, reused at checkout
# ---------------------------------------------------------------------------
@router.get("/discovery/check")
async def check_eligibility(
    restaurant_id: str = Query(...),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    mode: str = Query("delivery", pattern="^(delivery|pickup|reservation|dine_in)$"),
    session: AsyncSession = Depends(get_session),
):
    row = (await session.execute(text(
        "SELECT * FROM food_restaurants WHERE id = :r AND status = 'active'"
    ), {"r": restaurant_id})).fetchone()
    if not row:
        raise HTTPException(404, "restaurant_not_found")
    return _serialize(row, lat=lat, lng=lng, mode=mode)
