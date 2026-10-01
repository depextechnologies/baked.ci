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

import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import jwt as _jwt

from core.db import get_session
from core.providers import object_storage
from core.security import (
    create_access_token, decode_token, hash_password, verify_password,
)
from shared.admin.routes import get_current_admin


router = APIRouter(tags=["food"])
admin_router = APIRouter(prefix="/admin/food", tags=["food-admin"])
partner_router = APIRouter(prefix="/food/partner", tags=["food-partner"])
manage_router = APIRouter(prefix="/food/manage", tags=["food-manage"])  # menu CRUD (super-admin OR partner-of)


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "item"


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
            "is_available": it.is_available,
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
# Admin surfaces — full CRUD (Phase 2 — Feb 2026)
# ---------------------------------------------------------------------------


# ---------- Reusable image upload ------------------------------------------
# Used by every FOOD asset: restaurant logo/cover/gallery, category & cuisine
# icons, menu section thumbnails, menu-item images, promo banners. Storage
# handled by the shared object_storage provider; DB stores only the served
# URL (/api/food/uploads/<key>).

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB — reasonable for pre-optimised imagery
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"}


@admin_router.post("/uploads")
async def admin_food_upload(
    file: UploadFile = File(...),
    kind: str = Query("misc", description="asset kind — restaurant_logo|restaurant_cover|gallery|category|cuisine|menu_item|banner|misc"),
    _admin=Depends(get_current_admin),
):
    """Reusable image upload for every FOODbakēd asset (Admin & Restaurant
    Partner portals). Returns a permanent served URL to store in the DB.
    """
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "File must be an image (png / jpg / webp / gif / svg)")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large ({MAX_UPLOAD_BYTES // 1024 // 1024} MB max)")
    if len(content) < 32:
        raise HTTPException(400, "File is empty or too small")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() or "png"
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    safe_kind = re.sub(r"[^a-z0-9_-]", "", kind.lower()) or "misc"
    key = f"{object_storage.APP_NAME}/food/{safe_kind}/{ts}.{ext}"
    try:
        object_storage.put_object(key, content, ct)
    except Exception as e:
        raise HTTPException(502, f"Upload failed: {e}")
    return {"file_url": f"/api/food/uploads/{key}", "size": len(content), "content_type": ct, "kind": safe_kind}


@router.get("/uploads/{key:path}")
async def food_upload_serve(key: str):
    """Public serve for uploaded FOOD images."""
    try:
        content, ct = object_storage.get_object(key)
    except Exception:
        raise HTTPException(404, "Upload not found")
    return Response(content=content, media_type=ct)


# ---------- Restaurants CRUD -----------------------------------------------


class RestaurantIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    slug: Optional[str] = None
    country: str = Field(..., min_length=2, max_length=4)
    cuisines: List[str] = Field(default_factory=list)
    rating: float = 0.0
    review_count: int = 0
    prep_time_min: int = 15
    prep_time_max: int = 30
    delivery_fee: int = 0
    is_open: bool = True
    featured: bool = False
    sort_order: int = 0
    image: Optional[str] = None
    status: str = "active"


class RestaurantPatch(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    country: Optional[str] = None
    cuisines: Optional[List[str]] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    prep_time_min: Optional[int] = None
    prep_time_max: Optional[int] = None
    delivery_fee: Optional[int] = None
    is_open: Optional[bool] = None
    featured: Optional[bool] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None
    image: Optional[str] = None


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


@admin_router.post("/restaurants")
async def admin_create_restaurant(
    payload: RestaurantIn,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    slug = _slugify(payload.slug or payload.name)
    country = payload.country.upper()
    # Deterministic id: <slug>_<country_lower>
    rid = f"{re.sub(r'[^a-z0-9]+', '_', slug)}_{country.lower()}"

    # Enforce uniqueness of id
    exists = await session.execute(text("SELECT 1 FROM food_restaurants WHERE id = :id"), {"id": rid})
    if exists.fetchone():
        raise HTTPException(409, f"Restaurant '{rid}' already exists")

    await session.execute(text("""
        INSERT INTO food_restaurants (
            id, name, slug, country, cuisines, rating, review_count,
            prep_time_min, prep_time_max, delivery_fee, is_open, featured,
            sort_order, image, status
        ) VALUES (
            :id, :name, :slug, :country, CAST(:cuisines AS JSONB), :rating, :review_count,
            :prep_time_min, :prep_time_max, :delivery_fee, :is_open, :featured,
            :sort_order, :image, :status
        )
    """), {
        "id": rid, "name": payload.name, "slug": slug, "country": country,
        "cuisines": _json_dump(payload.cuisines), "rating": payload.rating,
        "review_count": payload.review_count, "prep_time_min": payload.prep_time_min,
        "prep_time_max": payload.prep_time_max, "delivery_fee": payload.delivery_fee,
        "is_open": payload.is_open, "featured": payload.featured,
        "sort_order": payload.sort_order, "image": payload.image, "status": payload.status,
    })
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
    return _restaurant_row(row)


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

    # Normalise country + slug
    if "country" in fields:
        fields["country"] = fields["country"].upper()
    if "slug" in fields:
        fields["slug"] = _slugify(fields["slug"])

    # JSONB serialisation for cuisines
    set_parts = []
    params = {"rid": rid}
    for k, v in fields.items():
        if k == "cuisines":
            set_parts.append(f"cuisines = CAST(:{k} AS JSONB)")
            params[k] = _json_dump(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v
    sets = ", ".join(set_parts)
    res = await session.execute(text(
        f"UPDATE food_restaurants SET {sets}, updated_at = now() WHERE id = :rid RETURNING *"
    ), params)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    await session.commit()
    return _restaurant_row(row)


@admin_router.delete("/restaurants/{rid}")
async def admin_delete_restaurant(
    rid: str,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    res = await session.execute(text("DELETE FROM food_restaurants WHERE id = :rid RETURNING id"), {"rid": rid})
    if not res.fetchone():
        raise HTTPException(404, "Restaurant not found")
    await session.commit()
    return {"deleted": rid}


# ---------- Categories CRUD -------------------------------------------------


class CategoryIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name_en: str = Field(..., min_length=1, max_length=64)
    name_fr: str = Field(..., min_length=1, max_length=64)
    image: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class CategoryPatch(BaseModel):
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@admin_router.get("/categories")
async def admin_list_categories(session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin)):
    res = await session.execute(text("SELECT * FROM food_categories ORDER BY sort_order, code"))
    return [_category_row(r) for r in res.fetchall()]


@admin_router.post("/categories")
async def admin_create_category(
    payload: CategoryIn,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    code = _slugify(payload.code)
    exists = await session.execute(text("SELECT 1 FROM food_categories WHERE code = :code"), {"code": code})
    if exists.fetchone():
        raise HTTPException(409, f"Category '{code}' already exists")
    await session.execute(text("""
        INSERT INTO food_categories (code, name_en, name_fr, image, sort_order, is_active)
        VALUES (:code, :name_en, :name_fr, :image, :sort_order, :is_active)
    """), {"code": code, **payload.model_dump(exclude={"code"})})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_categories WHERE code = :code"), {"code": code})).fetchone()
    return _category_row(row)


@admin_router.patch("/categories/{code}")
async def admin_patch_category(
    code: str,
    patch: CategoryPatch,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["code"] = code
    res = await session.execute(text(
        f"UPDATE food_categories SET {sets}, updated_at = now() WHERE code = :code RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Category not found")
    await session.commit()
    return _category_row(row)


@admin_router.delete("/categories/{code}")
async def admin_delete_category(
    code: str,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    res = await session.execute(text("DELETE FROM food_categories WHERE code = :code RETURNING code"), {"code": code})
    if not res.fetchone():
        raise HTTPException(404, "Category not found")
    await session.commit()
    return {"deleted": code}


# ---------- Cuisines CRUD ---------------------------------------------------


class CuisineIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name_en: str = Field(..., min_length=1, max_length=64)
    name_fr: str = Field(..., min_length=1, max_length=64)
    image: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class CuisinePatch(BaseModel):
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@admin_router.get("/cuisines")
async def admin_list_cuisines(session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin)):
    res = await session.execute(text("SELECT * FROM food_cuisines ORDER BY sort_order, code"))
    return [_cuisine_row(r) for r in res.fetchall()]


@admin_router.post("/cuisines")
async def admin_create_cuisine(
    payload: CuisineIn,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    code = _slugify(payload.code)
    exists = await session.execute(text("SELECT 1 FROM food_cuisines WHERE code = :code"), {"code": code})
    if exists.fetchone():
        raise HTTPException(409, f"Cuisine '{code}' already exists")
    await session.execute(text("""
        INSERT INTO food_cuisines (code, name_en, name_fr, image, sort_order, is_active)
        VALUES (:code, :name_en, :name_fr, :image, :sort_order, :is_active)
    """), {"code": code, **payload.model_dump(exclude={"code"})})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_cuisines WHERE code = :code"), {"code": code})).fetchone()
    return _cuisine_row(row)


@admin_router.patch("/cuisines/{code}")
async def admin_patch_cuisine(
    code: str,
    patch: CuisinePatch,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["code"] = code
    res = await session.execute(text(
        f"UPDATE food_cuisines SET {sets}, updated_at = now() WHERE code = :code RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Cuisine not found")
    await session.commit()
    return _cuisine_row(row)


@admin_router.delete("/cuisines/{code}")
async def admin_delete_cuisine(
    code: str,
    session: AsyncSession = Depends(get_session),
    _admin=Depends(get_current_admin),
):
    res = await session.execute(text("DELETE FROM food_cuisines WHERE code = :code RETURNING code"), {"code": code})
    if not res.fetchone():
        raise HTTPException(404, "Cuisine not found")
    await session.commit()
    return {"deleted": code}


# ---------- JSON serialisation helper --------------------------------------


def _json_dump(value) -> str:
    import json
    return json.dumps(value or [])


# ===========================================================================
# Restaurant Partner Portal — auth + menu CRUD (Feb 2026)
# ===========================================================================
#
# Two writer surfaces exist for menu / partner data:
#   • Super-admin JWT (`role in ("admin","super_admin")`) — can touch any
#     restaurant.
#   • Food-partner JWT (`role == "food_partner"`) — can only touch the
#     restaurant whose `restaurant_id` is embedded in the token claim.
#
# `_get_menu_writer(rid)` resolves either identity and enforces isolation;
# all menu-management endpoints depend on it.
# ---------------------------------------------------------------------------


def _partner_row(r) -> dict:
    return {
        "id": r.id,
        "restaurant_id": r.restaurant_id,
        "email": r.email,
        "name": r.name,
        "is_active": r.is_active,
        "last_login_at": r.last_login_at.isoformat() if r.last_login_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


async def _load_partner_from_token(request: Request, session: AsyncSession):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = decode_token(auth[7:])
    except _jwt.PyJWTError:
        return None
    if payload.get("role") != "food_partner":
        return None
    partner = (await session.execute(text(
        "SELECT * FROM food_restaurant_partners WHERE id = :id AND is_active = TRUE"
    ), {"id": payload.get("sub")})).fetchone()
    return partner


async def get_current_food_partner(request: Request, session: AsyncSession = Depends(get_session)):
    partner = await _load_partner_from_token(request, session)
    if not partner:
        raise HTTPException(401, "Not authenticated as restaurant partner")
    return partner


async def _get_menu_writer(rid: str, request: Request, session: AsyncSession):
    """Allow super-admin OR partner of `rid`. Return (kind, actor)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(auth[7:])
    except _jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    role = payload.get("role")
    if role in ("admin", "super_admin"):
        # Confirm the restaurant exists.
        r = (await session.execute(text("SELECT id FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
        if not r:
            raise HTTPException(404, "Restaurant not found")
        return ("admin", payload.get("sub"))
    if role == "food_partner":
        partner = (await session.execute(text(
            "SELECT * FROM food_restaurant_partners WHERE id = :id AND is_active = TRUE"
        ), {"id": payload.get("sub")})).fetchone()
        if not partner:
            raise HTTPException(401, "Partner not found or disabled")
        if partner.restaurant_id != rid:
            raise HTTPException(403, "You can only manage your own restaurant")
        return ("partner", partner.id)
    raise HTTPException(403, "Not allowed to manage this restaurant")


# ---------- Partner login + me ---------------------------------------------

class PartnerLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


@partner_router.post("/auth/login")
async def partner_login(payload: PartnerLoginIn, session: AsyncSession = Depends(get_session)):
    row = (await session.execute(text(
        "SELECT * FROM food_restaurant_partners WHERE LOWER(email) = :email"
    ), {"email": payload.email.lower()})).fetchone()
    if not row or not verify_password(payload.password, row.password_hash or ""):
        raise HTTPException(401, "Invalid credentials")
    if not row.is_active:
        raise HTTPException(403, "Account disabled — contact support")
    token = create_access_token(row.id, role="food_partner", extra={
        "email": row.email, "restaurant_id": row.restaurant_id,
    })
    await session.execute(text(
        "UPDATE food_restaurant_partners SET last_login_at = now() WHERE id = :id"
    ), {"id": row.id})
    await session.commit()
    return {
        "access_token": token, "token_type": "bearer",
        "partner": _partner_row(row),
    }


@partner_router.get("/auth/me")
async def partner_me(partner=Depends(get_current_food_partner), session: AsyncSession = Depends(get_session)):
    # Include the restaurant summary for the portal shell.
    rest = (await session.execute(text(
        "SELECT * FROM food_restaurants WHERE id = :id"
    ), {"id": partner.restaurant_id})).fetchone()
    return {"partner": _partner_row(partner), "restaurant": _restaurant_row(rest) if rest else None}


# ---------- Super-admin: partner accounts management -----------------------

class PartnerCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: Optional[str] = Field(None, max_length=128)


class PartnerPatch(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)


@admin_router.get("/restaurants/{rid}/partners")
async def admin_list_partners(rid: str, session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin)):
    res = await session.execute(text(
        "SELECT * FROM food_restaurant_partners WHERE restaurant_id = :rid ORDER BY created_at DESC"
    ), {"rid": rid})
    return [_partner_row(r) for r in res.fetchall()]


@admin_router.post("/restaurants/{rid}/partners")
async def admin_create_partner(
    rid: str, payload: PartnerCreateIn,
    session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin),
):
    # Verify restaurant exists
    r = (await session.execute(text("SELECT id FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
    if not r:
        raise HTTPException(404, "Restaurant not found")
    # Reject duplicate email
    dup = (await session.execute(text(
        "SELECT id FROM food_restaurant_partners WHERE LOWER(email) = :email"
    ), {"email": payload.email.lower()})).fetchone()
    if dup:
        raise HTTPException(409, "Email already registered")
    pid = f"fp_{uuid.uuid4().hex[:16]}"
    await session.execute(text("""
        INSERT INTO food_restaurant_partners (id, restaurant_id, email, password_hash, name, is_active)
        VALUES (:id, :rid, :email, :ph, :name, TRUE)
    """), {
        "id": pid, "rid": rid, "email": payload.email.lower(),
        "ph": hash_password(payload.password), "name": payload.name,
    })
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_restaurant_partners WHERE id = :id"), {"id": pid})).fetchone()
    return _partner_row(row)


@admin_router.patch("/partners/{pid}")
async def admin_patch_partner(
    pid: str, patch: PartnerPatch,
    session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin),
):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    if "password" in fields:
        fields["password_hash"] = hash_password(fields.pop("password"))
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = pid
    res = await session.execute(text(
        f"UPDATE food_restaurant_partners SET {sets}, updated_at = now() WHERE id = :id RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Partner not found")
    await session.commit()
    return _partner_row(row)


@admin_router.delete("/partners/{pid}")
async def admin_delete_partner(
    pid: str, session: AsyncSession = Depends(get_session), _admin=Depends(get_current_admin),
):
    res = await session.execute(text(
        "DELETE FROM food_restaurant_partners WHERE id = :id RETURNING id"
    ), {"id": pid})
    if not res.fetchone():
        raise HTTPException(404, "Partner not found")
    await session.commit()
    return {"deleted": pid}


# ===========================================================================
# Menu CRUD (shared surface — super-admin OR partner of the restaurant)
# ===========================================================================


class SectionIn(BaseModel):
    name_en: str = Field(..., min_length=1, max_length=64)
    name_fr: str = Field(..., min_length=1, max_length=64)
    sort_order: int = 0


class SectionPatch(BaseModel):
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    sort_order: Optional[int] = None


class ItemIn(BaseModel):
    section_id: str
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    image: Optional[str] = None
    base_price: float = 0.0
    currency: str = "XOF"
    is_veg: bool = False
    spice_level: int = 0
    tags: List[str] = Field(default_factory=list)
    is_available: bool = True
    sort_order: int = 0


class ItemPatch(BaseModel):
    section_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    base_price: Optional[float] = None
    currency: Optional[str] = None
    is_veg: Optional[bool] = None
    spice_level: Optional[int] = None
    tags: Optional[List[str]] = None
    is_available: Optional[bool] = None
    sort_order: Optional[int] = None


class VariantIn(BaseModel):
    name_en: str
    name_fr: str
    price_delta: float = 0.0
    is_default: bool = False
    sort_order: int = 0


class VariantPatch(BaseModel):
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    price_delta: Optional[float] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class AddonIn(BaseModel):
    name_en: str
    name_fr: str
    price: float = 0.0
    sort_order: int = 0


class AddonPatch(BaseModel):
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    price: Optional[float] = None
    sort_order: Optional[int] = None


def _mk_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


async def _item_belongs_to(rid: str, item_id: str, session: AsyncSession) -> bool:
    r = (await session.execute(text(
        "SELECT 1 FROM food_menu_items WHERE id = :id AND restaurant_id = :rid"
    ), {"id": item_id, "rid": rid})).fetchone()
    return r is not None


# ---------- Full menu (read) ----------------------------------------------


@manage_router.get("/{rid}/menu")
async def manage_get_menu(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    """Return the full menu tree for an authorized writer.

    Unlike the customer route this also includes disabled items so partners
    can bring them back online.
    """
    await _get_menu_writer(rid, request, session)

    secs = (await session.execute(text(
        "SELECT * FROM food_menu_sections WHERE restaurant_id = :rid ORDER BY sort_order, id"
    ), {"rid": rid})).fetchall()

    items = (await session.execute(text(
        "SELECT * FROM food_menu_items WHERE restaurant_id = :rid ORDER BY section_id, sort_order, id"
    ), {"rid": rid})).fetchall()

    item_ids = [i.id for i in items]
    variants_by_item: dict = {}
    addons_by_item: dict = {}
    if item_ids:
        placeholders = ",".join(f":i{i}" for i in range(len(item_ids)))
        params_ids = {f"i{i}": v for i, v in enumerate(item_ids)}
        vrows = (await session.execute(text(
            f"SELECT * FROM food_item_variants WHERE item_id IN ({placeholders}) ORDER BY item_id, sort_order"
        ), params_ids)).fetchall()
        arows = (await session.execute(text(
            f"SELECT * FROM food_item_addons WHERE item_id IN ({placeholders}) ORDER BY item_id, sort_order"
        ), params_ids)).fetchall()
        for v in vrows:
            variants_by_item.setdefault(v.item_id, []).append({
                "id": v.id, "name_en": v.name_en, "name_fr": v.name_fr,
                "price_delta": float(v.price_delta or 0), "is_default": v.is_default,
                "sort_order": v.sort_order,
            })
        for a in arows:
            addons_by_item.setdefault(a.item_id, []).append({
                "id": a.id, "name_en": a.name_en, "name_fr": a.name_fr,
                "price": float(a.price or 0), "sort_order": a.sort_order,
            })

    items_by_section: dict = {}
    for it in items:
        items_by_section.setdefault(it.section_id, []).append({
            "id": it.id, "section_id": it.section_id, "name": it.name,
            "description": it.description, "image": it.image,
            "base_price": float(it.base_price or 0), "currency": it.currency,
            "is_veg": it.is_veg, "spice_level": it.spice_level,
            "tags": it.tags or [], "is_available": it.is_available,
            "sort_order": it.sort_order,
            "variants": variants_by_item.get(it.id, []),
            "addons":   addons_by_item.get(it.id, []),
        })
    return {
        "sections": [
            {"id": s.id, "name_en": s.name_en, "name_fr": s.name_fr, "sort_order": s.sort_order,
             "items": items_by_section.get(s.id, [])}
            for s in secs
        ],
    }


# ---------- Sections CRUD --------------------------------------------------


@manage_router.post("/{rid}/sections")
async def manage_create_section(
    rid: str, payload: SectionIn, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    sid = _mk_id("fms")
    await session.execute(text("""
        INSERT INTO food_menu_sections (id, restaurant_id, name_en, name_fr, sort_order)
        VALUES (:id, :rid, :name_en, :name_fr, :sort_order)
    """), {"id": sid, "rid": rid, **payload.model_dump()})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_menu_sections WHERE id = :id"), {"id": sid})).fetchone()
    return {"id": row.id, "restaurant_id": row.restaurant_id, "name_en": row.name_en, "name_fr": row.name_fr, "sort_order": row.sort_order}


@manage_router.patch("/{rid}/sections/{sid}")
async def manage_patch_section(
    rid: str, sid: str, patch: SectionPatch, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["sid"] = sid; fields["rid"] = rid
    res = await session.execute(text(
        f"UPDATE food_menu_sections SET {sets} WHERE id = :sid AND restaurant_id = :rid RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Section not found")
    await session.commit()
    return {"id": row.id, "name_en": row.name_en, "name_fr": row.name_fr, "sort_order": row.sort_order}


@manage_router.delete("/{rid}/sections/{sid}")
async def manage_delete_section(
    rid: str, sid: str, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    res = await session.execute(text(
        "DELETE FROM food_menu_sections WHERE id = :sid AND restaurant_id = :rid RETURNING id"
    ), {"sid": sid, "rid": rid})
    if not res.fetchone():
        raise HTTPException(404, "Section not found")
    await session.commit()
    return {"deleted": sid}


# ---------- Items CRUD -----------------------------------------------------


@manage_router.post("/{rid}/items")
async def manage_create_item(
    rid: str, payload: ItemIn, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    # Ensure section belongs to this restaurant
    ok = (await session.execute(text(
        "SELECT 1 FROM food_menu_sections WHERE id = :sid AND restaurant_id = :rid"
    ), {"sid": payload.section_id, "rid": rid})).fetchone()
    if not ok:
        raise HTTPException(400, "section_id does not belong to this restaurant")
    iid = _mk_id("fmi")
    body = payload.model_dump()
    body["tags"] = _json_dump(body.get("tags") or [])
    await session.execute(text("""
        INSERT INTO food_menu_items (
            id, restaurant_id, section_id, name, description, image,
            base_price, currency, is_veg, spice_level, tags,
            is_available, sort_order
        ) VALUES (
            :id, :rid, :section_id, :name, :description, :image,
            :base_price, :currency, :is_veg, :spice_level, CAST(:tags AS JSONB),
            :is_available, :sort_order
        )
    """), {"id": iid, "rid": rid, **body})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_menu_items WHERE id = :id"), {"id": iid})).fetchone()
    return _item_json(row)


@manage_router.patch("/{rid}/items/{iid}")
async def manage_patch_item(
    rid: str, iid: str, patch: ItemPatch, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    if "section_id" in fields:
        ok = (await session.execute(text(
            "SELECT 1 FROM food_menu_sections WHERE id = :sid AND restaurant_id = :rid"
        ), {"sid": fields["section_id"], "rid": rid})).fetchone()
        if not ok:
            raise HTTPException(400, "section_id does not belong to this restaurant")
    parts = []
    params = {"iid": iid, "rid": rid}
    for k, v in fields.items():
        if k == "tags":
            parts.append("tags = CAST(:tags AS JSONB)")
            params["tags"] = _json_dump(v)
        else:
            parts.append(f"{k} = :{k}")
            params[k] = v
    sets = ", ".join(parts)
    res = await session.execute(text(
        f"UPDATE food_menu_items SET {sets}, updated_at = now() WHERE id = :iid AND restaurant_id = :rid RETURNING *"
    ), params)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Item not found")
    await session.commit()
    return _item_json(row)


@manage_router.delete("/{rid}/items/{iid}")
async def manage_delete_item(
    rid: str, iid: str, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    res = await session.execute(text(
        "DELETE FROM food_menu_items WHERE id = :iid AND restaurant_id = :rid RETURNING id"
    ), {"iid": iid, "rid": rid})
    if not res.fetchone():
        raise HTTPException(404, "Item not found")
    await session.commit()
    return {"deleted": iid}


# ---------- Variants + Add-ons ---------------------------------------------


@manage_router.post("/{rid}/items/{iid}/variants")
async def manage_create_variant(
    rid: str, iid: str, payload: VariantIn, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    vid = _mk_id("fmv")
    if payload.is_default:
        await session.execute(text("UPDATE food_item_variants SET is_default = FALSE WHERE item_id = :iid"), {"iid": iid})
    await session.execute(text("""
        INSERT INTO food_item_variants (id, item_id, name_en, name_fr, price_delta, is_default, sort_order)
        VALUES (:id, :iid, :name_en, :name_fr, :price_delta, :is_default, :sort_order)
    """), {"id": vid, "iid": iid, **payload.model_dump()})
    await session.commit()
    return {"id": vid, "item_id": iid, **payload.model_dump()}


@manage_router.patch("/{rid}/items/{iid}/variants/{vid}")
async def manage_patch_variant(
    rid: str, iid: str, vid: str, patch: VariantPatch, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    if fields.get("is_default") is True:
        await session.execute(text("UPDATE food_item_variants SET is_default = FALSE WHERE item_id = :iid"), {"iid": iid})
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["vid"] = vid; fields["iid"] = iid
    res = await session.execute(text(
        f"UPDATE food_item_variants SET {sets} WHERE id = :vid AND item_id = :iid RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Variant not found")
    await session.commit()
    return {
        "id": row.id, "item_id": row.item_id, "name_en": row.name_en, "name_fr": row.name_fr,
        "price_delta": float(row.price_delta or 0), "is_default": row.is_default, "sort_order": row.sort_order,
    }


@manage_router.delete("/{rid}/items/{iid}/variants/{vid}")
async def manage_delete_variant(
    rid: str, iid: str, vid: str, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    res = await session.execute(text(
        "DELETE FROM food_item_variants WHERE id = :vid AND item_id = :iid RETURNING id"
    ), {"vid": vid, "iid": iid})
    if not res.fetchone():
        raise HTTPException(404, "Variant not found")
    await session.commit()
    return {"deleted": vid}


@manage_router.post("/{rid}/items/{iid}/addons")
async def manage_create_addon(
    rid: str, iid: str, payload: AddonIn, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    aid = _mk_id("fma")
    await session.execute(text("""
        INSERT INTO food_item_addons (id, item_id, name_en, name_fr, price, sort_order)
        VALUES (:id, :iid, :name_en, :name_fr, :price, :sort_order)
    """), {"id": aid, "iid": iid, **payload.model_dump()})
    await session.commit()
    return {"id": aid, "item_id": iid, **payload.model_dump()}


@manage_router.patch("/{rid}/items/{iid}/addons/{aid}")
async def manage_patch_addon(
    rid: str, iid: str, aid: str, patch: AddonPatch, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["aid"] = aid; fields["iid"] = iid
    res = await session.execute(text(
        f"UPDATE food_item_addons SET {sets} WHERE id = :aid AND item_id = :iid RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Add-on not found")
    await session.commit()
    return {
        "id": row.id, "item_id": row.item_id, "name_en": row.name_en, "name_fr": row.name_fr,
        "price": float(row.price or 0), "sort_order": row.sort_order,
    }


@manage_router.delete("/{rid}/items/{iid}/addons/{aid}")
async def manage_delete_addon(
    rid: str, iid: str, aid: str, request: Request,
    session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if not await _item_belongs_to(rid, iid, session):
        raise HTTPException(404, "Item not found")
    res = await session.execute(text(
        "DELETE FROM food_item_addons WHERE id = :aid AND item_id = :iid RETURNING id"
    ), {"aid": aid, "iid": iid})
    if not res.fetchone():
        raise HTTPException(404, "Add-on not found")
    await session.commit()
    return {"deleted": aid}


# ---------- Partner restaurant self-service --------------------------------


class PartnerRestaurantPatch(BaseModel):
    # Partners may only edit a narrow allow-list. Everything else needs admin.
    is_open: Optional[bool] = None
    prep_time_min: Optional[int] = None
    prep_time_max: Optional[int] = None
    image: Optional[str] = None


@partner_router.patch("/restaurant")
async def partner_patch_restaurant(
    patch: PartnerRestaurantPatch,
    partner=Depends(get_current_food_partner),
    session: AsyncSession = Depends(get_session),
):
    fields = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = :{k}" for k in fields)
    fields["rid"] = partner.restaurant_id
    res = await session.execute(text(
        f"UPDATE food_restaurants SET {sets}, updated_at = now() WHERE id = :rid RETURNING *"
    ), fields)
    row = res.fetchone()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    await session.commit()
    return _restaurant_row(row)


# ---------- shared item serialiser ----------------------------------------


def _item_json(row) -> dict:
    return {
        "id": row.id, "section_id": row.section_id, "name": row.name,
        "description": row.description, "image": row.image,
        "base_price": float(row.base_price or 0), "currency": row.currency,
        "is_veg": row.is_veg, "spice_level": row.spice_level,
        "tags": row.tags or [], "is_available": row.is_available,
        "sort_order": row.sort_order,
    }
