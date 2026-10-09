"""FOODbakēd — Customer Favourites (Phase 3).

Server-side only (requires customer JWT). One table (`food_favourites`)
holds both restaurant and dish favourites so the "Mes Favoris" page can
hydrate them in a single read.

Endpoints:
  * POST /api/food/customer/favourites/toggle   {target_type, target_id}
      → adds if missing, removes if present. Returns {"favourited": bool}.
  * GET  /api/food/customer/favourites
      → {"restaurants": [...], "dishes": [...]} — each item embeds
        enough fields to render a card without a second call.
  * GET  /api/food/customer/favourites/ids
      → {"restaurants": [id,...], "dishes": [id,...]} — lightweight set
        for pre-populating heart icon state on listings/microsites.

Design:
  * Dish rows carry a snapshot-free view — if the item or its restaurant
    becomes unavailable we simply skip it in the list response (the row
    stays in DB for analytics). The customer can un-favourite then.
  * Everything is scoped by `customer_id` from the JWT — never a URL
    param. Prevents cross-tenant leaks.
"""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import Customer


customer_router = APIRouter(prefix="/food/customer", tags=["food-favourites"])


TargetType = Literal["restaurant", "dish"]


class ToggleIn(BaseModel):
    target_type: TargetType
    target_id: str = Field(..., min_length=1, max_length=128)


@customer_router.post("/favourites/toggle")
async def toggle_favourite(
    payload: ToggleIn,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    """Add → remove toggle. Validates the target exists first.

    Returns {"favourited": true|false}.
    """
    # Validate target existence so we don't accumulate rows for deleted
    # restaurants/items.
    if payload.target_type == "restaurant":
        row = (await session.execute(
            text("SELECT 1 FROM food_restaurants WHERE id = :id LIMIT 1"),
            {"id": payload.target_id},
        )).fetchone()
    else:
        row = (await session.execute(
            text("SELECT 1 FROM food_menu_items WHERE id = :id LIMIT 1"),
            {"id": payload.target_id},
        )).fetchone()
    if not row:
        raise HTTPException(404, f"{payload.target_type} not found")

    existing = (await session.execute(text(
        "SELECT id FROM food_favourites "
        "WHERE customer_id = :cid AND target_type = :tt AND target_id = :tid"
    ), {"cid": customer.id, "tt": payload.target_type, "tid": payload.target_id})).fetchone()

    if existing:
        await session.execute(text("DELETE FROM food_favourites WHERE id = :id"),
                              {"id": existing.id})
        await session.commit()
        return {"favourited": False}

    await session.execute(text(
        "INSERT INTO food_favourites (id, customer_id, target_type, target_id) "
        "VALUES (:id, :cid, :tt, :tid)"
    ), {
        "id": f"fav_{uuid.uuid4().hex[:16]}",
        "cid": customer.id,
        "tt": payload.target_type,
        "tid": payload.target_id,
    })
    await session.commit()
    return {"favourited": True}


@customer_router.get("/favourites/ids")
async def list_favourite_ids(
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    """Light-weight sets used by cards to pre-populate heart state."""
    rows = (await session.execute(text(
        "SELECT target_type, target_id FROM food_favourites WHERE customer_id = :cid"
    ), {"cid": customer.id})).fetchall()
    out = {"restaurants": [], "dishes": []}
    for r in rows:
        key = "restaurants" if r.target_type == "restaurant" else "dishes"
        out[key].append(r.target_id)
    return out


@customer_router.get("/favourites")
async def list_favourites(
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    """Full favourites list with enough embedded data to render cards."""
    # Restaurants ------------------------------------------------------------
    rest_rows = (await session.execute(text("""
        SELECT r.*, f.created_at AS fav_created_at
          FROM food_favourites f
          JOIN food_restaurants r ON r.id = f.target_id
         WHERE f.customer_id = :cid
           AND f.target_type = 'restaurant'
           AND r.status = 'active'
         ORDER BY f.created_at DESC
         LIMIT 200
    """), {"cid": customer.id})).fetchall()

    restaurants = [{
        "id": r.id,
        "slug": r.slug,
        "name": r.name,
        "country": r.country,
        "cuisines": r.cuisines or [],
        "rating": float(r.rating or 0),
        "review_count": r.review_count,
        "prep_time_min": r.prep_time_min,
        "prep_time_max": r.prep_time_max,
        "delivery_fee": r.delivery_fee,
        "image": r.image,
        "is_open": r.is_open,
    } for r in rest_rows]

    # Dishes -----------------------------------------------------------------
    dish_rows = (await session.execute(text("""
        SELECT it.id      AS item_id,
               it.name    AS item_name,
               it.description AS item_description,
               it.image   AS item_image,
               it.base_price,
               it.currency,
               it.is_available,
               r.id       AS restaurant_id,
               r.slug     AS restaurant_slug,
               r.name     AS restaurant_name,
               r.image    AS restaurant_image,
               r.is_open  AS restaurant_is_open,
               f.created_at AS fav_created_at
          FROM food_favourites f
          JOIN food_menu_items it   ON it.id = f.target_id
          JOIN food_restaurants r   ON r.id = it.restaurant_id
         WHERE f.customer_id = :cid
           AND f.target_type = 'dish'
           AND r.status = 'active'
         ORDER BY f.created_at DESC
         LIMIT 200
    """), {"cid": customer.id})).fetchall()

    dishes = [{
        "id": d.item_id,
        "name": d.item_name,
        "description": d.item_description,
        "image": d.item_image,
        "base_price": float(d.base_price or 0),
        "currency": d.currency,
        "is_available": bool(d.is_available),
        "restaurant": {
            "id": d.restaurant_id,
            "slug": d.restaurant_slug,
            "name": d.restaurant_name,
            "image": d.restaurant_image,
            "is_open": bool(d.restaurant_is_open),
        },
    } for d in dish_rows]

    return {"restaurants": restaurants, "dishes": dishes}
