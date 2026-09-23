"""FOODbakēd — Phase 1 public + admin routes.

Public endpoints power the customer FoodHome (`/food`):
    * GET /api/food/home          — everything the FoodHome page needs in one call
    * GET /api/food/categories    — 12 chip categories
    * GET /api/food/cuisines      — 8 cuisine tiles
    * GET /api/food/restaurants   — featured/paginated restaurant list

Admin endpoints (super-admin gated via `require_admin`) drive the FOOD
workspace under `/admin/modules/food`:
    * GET/POST/PATCH /api/admin/food/restaurants
    * GET/POST/PATCH /api/admin/food/categories
    * GET/POST/PATCH /api/admin/food/cuisines

Phase 1 is intentionally read-heavy on the customer side and admin CRUD
is minimal (list + toggle featured / is_open / is_active). Phase 2 will
add restaurant menu items, cart wiring and the SENDbakēd driver bridge.
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from shared.admin.routes import get_current_admin


router = APIRouter(tags=["food"])
admin_router = APIRouter(prefix="/admin/food", tags=["food-admin"])


# ---------------------------------------------------------------------------
# Row-to-dict helpers — keep the wire format flat so the client can render
# without any additional shaping.
# ---------------------------------------------------------------------------


def _category_row(r) -> dict:
    return {"code": r.code, "name_en": r.name_en, "name_fr": r.name_fr,
            "image": r.image, "sort_order": r.sort_order, "is_active": r.is_active}


def _cuisine_row(r) -> dict:
    return {"code": r.code, "name_en": r.name_en, "name_fr": r.name_fr,
            "image": r.image, "sort_order": r.sort_order, "is_active": r.is_active}


def _restaurant_row(r) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "slug": r.slug,
        "country": r.country,
        "cuisines": r.cuisines,
        "rating": float(r.rating or 0),
        "review_count": r.review_count,
        "prep_time_min": r.prep_time_min,
        "prep_time_max": r.prep_time_max,
        "delivery_fee": r.delivery_fee,
        "is_open": r.is_open,
        "featured": r.featured,
        "sort_order": r.sort_order,
        "image": r.image,
        "status": r.status,
    }


# ---------------------------------------------------------------------------
# Customer surfaces
# ---------------------------------------------------------------------------


@router.get("/categories")
async def list_categories(session: AsyncSession = Depends(get_session)):
    res = await session.execute(text(
        "SELECT * FROM food_categories WHERE is_active = TRUE ORDER BY sort_order, code"
    ))
    return [_category_row(r) for r in res.fetchall()]


@router.get("/cuisines")
async def list_cuisines(session: AsyncSession = Depends(get_session)):
    res = await session.execute(text(
        "SELECT * FROM food_cuisines WHERE is_active = TRUE ORDER BY sort_order, code"
    ))
    return [_cuisine_row(r) for r in res.fetchall()]


@router.get("/restaurants")
async def list_restaurants(
    country: str = Query(..., min_length=2, max_length=4),
    featured: Optional[bool] = Query(None),
    cuisine: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    where = ["country = :country", "status = 'active'"]
    params = {"country": country.upper(), "limit": limit}
    if featured is not None:
        where.append("featured = :featured")
        params["featured"] = featured
    if cuisine:
        # `cuisines` is JSONB array — use the `?` operator (contains string element).
        where.append("cuisines ? :cuisine")
        params["cuisine"] = cuisine
    if category and category != "all":
        # Categories map 1-to-1 with cuisine codes at Phase 1 (Burgers, Pizza…)
        where.append("cuisines ? :category")
        params["category"] = category

    q = f"SELECT * FROM food_restaurants WHERE {' AND '.join(where)} ORDER BY sort_order, name LIMIT :limit"
    res = await session.execute(text(q), params)
    return [_restaurant_row(r) for r in res.fetchall()]


@router.get("/home")
async def food_home(
    country: str = Query(..., min_length=2, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    """One-shot payload for the FoodHome page (categories + cuisines + featured)."""
    cats  = await session.execute(text("SELECT * FROM food_categories WHERE is_active = TRUE ORDER BY sort_order"))
    cuis  = await session.execute(text("SELECT * FROM food_cuisines   WHERE is_active = TRUE ORDER BY sort_order"))
    feat  = await session.execute(text(
        "SELECT * FROM food_restaurants WHERE country = :country AND featured = TRUE AND status = 'active' "
        "ORDER BY sort_order, name LIMIT 12"
    ), {"country": country.upper()})
    return {
        "categories":          [_category_row(r) for r in cats.fetchall()],
        "cuisines":            [_cuisine_row(r) for r in cuis.fetchall()],
        "featured_restaurants":[_restaurant_row(r) for r in feat.fetchall()],
    }


# ---------------------------------------------------------------------------
# Restaurant detail + menu (Phase 2)
# ---------------------------------------------------------------------------


@router.get("/restaurants/{slug_or_id}")
async def get_restaurant(
    slug_or_id: str,
    country: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Fetch a single restaurant by slug (preferred) or ID.

    Slug is not globally unique in the seed (Burger Hub exists in both CI +
    IN with the same slug), so callers should pass `?country=XX` to
    disambiguate. Falls back to the first match if country is omitted.
    """
    params = {"key": slug_or_id}
    where = "(slug = :key OR id = :key)"
    if country:
        where += " AND country = :country"
        params["country"] = country.upper()
    res = await session.execute(text(
        f"SELECT * FROM food_restaurants WHERE {where} AND status = 'active' LIMIT 1"
    ), params)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    return _restaurant_row(row)


@router.get("/restaurants/{slug_or_id}/menu")
async def get_restaurant_menu(
    slug_or_id: str,
    country: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Return the full menu (sections → items → variants + addons) for a
    restaurant. One call per detail page — the frontend needs everything to
    build the sticky category tabs + item modal.
    """
    # Resolve restaurant first.
    params = {"key": slug_or_id}
    where = "(slug = :key OR id = :key)"
    if country:
        where += " AND country = :country"
        params["country"] = country.upper()
    res = await session.execute(text(f"SELECT * FROM food_restaurants WHERE {where} AND status = 'active' LIMIT 1"), params)
    r = res.fetchone()
    if not r:
        raise HTTPException(404, "Restaurant not found")
    rid = r.id

    # Sections + items in one hop each (menus are small — no need to page).
    secs = (await session.execute(text(
        "SELECT * FROM food_menu_sections WHERE restaurant_id = :rid ORDER BY sort_order, id"
    ), {"rid": rid})).fetchall()

    items = (await session.execute(text(
        "SELECT * FROM food_menu_items WHERE restaurant_id = :rid AND is_available = TRUE "
        "ORDER BY section_id, sort_order, name"
    ), {"rid": rid})).fetchall()

    item_ids = [it.id for it in items]
    variants = []
    addons = []
    if item_ids:
        # Convert to IN list — safe because IDs are internal strings.
        placeholders = ",".join(f":i{n}" for n in range(len(item_ids)))
        params_ids = {f"i{n}": i for n, i in enumerate(item_ids)}
        variants = (await session.execute(text(
            f"SELECT * FROM food_item_variants WHERE item_id IN ({placeholders}) ORDER BY item_id, sort_order"
        ), params_ids)).fetchall()
        addons = (await session.execute(text(
            f"SELECT * FROM food_item_addons WHERE item_id IN ({placeholders}) ORDER BY item_id, sort_order"
        ), params_ids)).fetchall()

    variants_by_item = {}
    for v in variants:
        variants_by_item.setdefault(v.item_id, []).append({
            "id": v.id, "name_en": v.name_en, "name_fr": v.name_fr,
            "price_delta": float(v.price_delta or 0), "is_default": v.is_default,
        })
    addons_by_item = {}
    for a in addons:
        addons_by_item.setdefault(a.item_id, []).append({
            "id": a.id, "name_en": a.name_en, "name_fr": a.name_fr,
            "price": float(a.price or 0),
        })

    items_by_section = {}
    for it in items:
        items_by_section.setdefault(it.section_id, []).append({
            "id": it.id,
            "name": it.name,
            "description": it.description,
            "image": it.image,
            "base_price": float(it.base_price or 0),
            "currency": it.currency,
            "is_veg": it.is_veg,
            "spice_level": it.spice_level,
            "tags": it.tags or [],
            "variants": variants_by_item.get(it.id, []),
            "addons": addons_by_item.get(it.id, []),
        })

    return {
        "restaurant": _restaurant_row(r),
        "sections": [
            {"id": s.id, "name_en": s.name_en, "name_fr": s.name_fr,
             "items": items_by_section.get(s.id, [])}
            for s in secs
        ],
    }


# ---------------------------------------------------------------------------
# Admin surfaces
# ---------------------------------------------------------------------------


class RestaurantPatch(BaseModel):
    is_open: Optional[bool] = None
    featured: Optional[bool] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None


@admin_router.get("/restaurants")
async def admin_list_restaurants(
    country: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    if country:
        res = await session.execute(text(
            "SELECT * FROM food_restaurants WHERE country = :c ORDER BY country, sort_order, name"
        ), {"c": country.upper()})
    else:
        res = await session.execute(text("SELECT * FROM food_restaurants ORDER BY country, sort_order, name"))
    return [_restaurant_row(r) for r in res.fetchall()]


@admin_router.patch("/restaurants/{rid}")
async def admin_patch_restaurant(
    rid: str,
    patch: RestaurantPatch,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["rid"] = rid
    res = await session.execute(text(f"UPDATE food_restaurants SET {sets}, updated_at = now() WHERE id = :rid RETURNING *"), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    await session.commit()
    return _restaurant_row(row)


@admin_router.get("/categories")
async def admin_list_categories(session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin)):
    res = await session.execute(text("SELECT * FROM food_categories ORDER BY sort_order, code"))
    return [_category_row(r) for r in res.fetchall()]


@admin_router.get("/cuisines")
async def admin_list_cuisines(session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin)):
    res = await session.execute(text("SELECT * FROM food_cuisines ORDER BY sort_order, code"))
    return [_cuisine_row(r) for r in res.fetchall()]
