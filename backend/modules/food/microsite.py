"""FOODbakēd — Restaurant Microsite endpoints.

Public reads for the Overview/Photos/Menu/Reviews tabs, plus partner
CRUD for restaurant photos, profile fields, and menu documents. Offers
CRUD + review submission ship in the follow-up pass (schemas already
exist).

Endpoint surface
----------------
Public:
  GET  /api/food/restaurants/{slug_or_id}/microsite?country=…
  GET  /api/food/restaurants/{slug_or_id}/photos?category=…

Partner or super-admin (per `_get_menu_writer` — tenant isolated):
  PATCH /api/food/manage/{rid}/profile
  GET   /api/food/manage/{rid}/photos
  POST  /api/food/manage/{rid}/photos
  PATCH /api/food/manage/{rid}/photos/{photo_id}
  DELETE /api/food/manage/{rid}/photos/{photo_id}
  POST  /api/food/manage/{rid}/photos/reorder
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, EmailStr, Field, constr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.providers import object_storage
from core.db import get_session
from modules.food.routes import _get_menu_writer, _restaurant_row  # type: ignore
from modules.food.reservations import _resolve_restaurant  # reuse the country-aware lookup


public_router  = APIRouter(prefix="/food", tags=["food-microsite"])
manage_router  = APIRouter(prefix="/food/manage", tags=["food-microsite"])


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------

def _iso(v: Any) -> Optional[str]:
    if not v: return None
    if isinstance(v, str): return v
    if isinstance(v, datetime) and v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


def _photo(r: Any) -> dict:
    return {
        "id": r.id, "restaurant_id": r.restaurant_id, "url": r.url,
        "category": r.category, "caption": r.caption, "is_cover": r.is_cover,
        "sort_order": r.sort_order,
    }


def _offer(r: Any) -> dict:
    return {
        "id": r.id, "title_fr": r.title_fr, "title_en": r.title_en,
        "description_fr": r.description_fr, "description_en": r.description_en,
        "discount_type": r.discount_type, "discount_value": float(r.discount_value or 0),
        "valid_from": _iso(r.valid_from), "valid_until": _iso(r.valid_until),
        "is_active": r.is_active, "sort_order": r.sort_order,
    }


def _menu_doc(r: Any) -> dict:
    return {"id": r.id, "label_fr": r.label_fr, "label_en": r.label_en, "url": r.url, "sort_order": r.sort_order}


def _review(r: Any) -> dict:
    # Seed rows encode the intended display name in moderation_notes.
    note = getattr(r, "moderation_notes", None) or ""
    seed_name = note.split("=", 1)[1].strip() if note.startswith("seed_author=") else None
    return {
        "id": r.id, "rating": r.rating, "text": r.text,
        "food_rating": r.food_rating, "service_rating": r.service_rating,
        "ambience_rating": r.ambience_rating, "value_rating": r.value_rating,
        "partner_response": r.partner_response,
        "partner_response_at": _iso(r.partner_response_at),
        "created_at": _iso(r.created_at),
        "customer": {"id": r.customer_id, "name": seed_name or getattr(r, "customer_name", None)},
    }


def _restaurant_profile(r: Any) -> dict:
    return {
        "id": r.id, "slug": r.slug, "name": r.name, "country": r.country,
        "image": r.image, "cuisines": r.cuisines or [], "rating": float(r.rating or 0),
        "review_count": r.review_count, "is_open": r.is_open,
        "prep_time_min": r.prep_time_min, "prep_time_max": r.prep_time_max,
        "delivery_fee": float(r.delivery_fee or 0),
        "description": r.description,
        "price_range": r.price_range,
        "address": r.address,
        "latitude":  float(r.latitude) if r.latitude is not None else None,
        "longitude": float(r.longitude) if r.longitude is not None else None,
        "opening_hours": r.opening_hours or {},
        "facilities": r.facilities or [],
        "highlights": r.highlights or [],
        "contact_phone": r.contact_phone,
        "contact_email": r.contact_email,
        "reservations_enabled": bool(r.reservations_enabled),
        "reservation_public":   bool(getattr(r, "reservation_public", False)),
    }


# ---------------------------------------------------------------------------
# Public — microsite one-shot
# ---------------------------------------------------------------------------

@public_router.get("/restaurants/{slug_or_id}/microsite")
async def get_microsite(
    slug_or_id: str,
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    r = await _resolve_restaurant(session, slug_or_id, country)

    photos = (await session.execute(text(
        "SELECT * FROM food_restaurant_photos WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": r.id})).fetchall()
    offers = (await session.execute(text("""
        SELECT * FROM food_restaurant_offers
         WHERE restaurant_id = :rid AND is_active = TRUE
           AND (valid_from IS NULL OR valid_from <= now())
           AND (valid_until IS NULL OR valid_until >= now())
         ORDER BY sort_order ASC, created_at DESC
    """), {"rid": r.id})).fetchall()
    menu_docs = (await session.execute(text(
        "SELECT * FROM food_restaurant_menu_docs WHERE restaurant_id = :rid ORDER BY sort_order ASC"
    ), {"rid": r.id})).fetchall()

    # Reviews summary — real aggregates via GROUP BY.
    dist_row = (await session.execute(text("""
        SELECT rating, COUNT(*) AS n FROM food_reviews
         WHERE restaurant_id = :rid AND status = 'published'
         GROUP BY rating
    """), {"rid": r.id})).fetchall()
    dist = {i: 0 for i in range(1, 6)}
    for row in dist_row:
        dist[int(row.rating)] = int(row.n)
    total_reviews = sum(dist.values())
    avg = 0.0
    if total_reviews > 0:
        avg = round(sum(k * v for k, v in dist.items()) / total_reviews, 2)

    recent = (await session.execute(text("""
        SELECT * FROM food_reviews
         WHERE restaurant_id = :rid AND status = 'published'
         ORDER BY created_at DESC LIMIT 3
    """), {"rid": r.id})).fetchall()

    return {
        "restaurant":  _restaurant_profile(r),
        "photos":      [_photo(p) for p in photos],
        "offers":      [_offer(o) for o in offers],
        "menu_docs":   [_menu_doc(d) for d in menu_docs],
        "reviews_summary": {
            "count":        total_reviews,
            "average":      avg,
            "distribution": dist,
            "recent":       [_review(rv) for rv in recent],
        },
    }


@public_router.get("/restaurants/{slug_or_id}/photos")
async def list_public_photos(
    slug_or_id: str,
    category: Optional[str] = Query(None),
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    r = await _resolve_restaurant(session, slug_or_id, country)
    conds = ["restaurant_id = :rid"]
    params: dict[str, Any] = {"rid": r.id}
    if category:
        conds.append("category = :cat")
        params["cat"] = category
    rows = (await session.execute(text(
        f"SELECT * FROM food_restaurant_photos WHERE {' AND '.join(conds)} ORDER BY sort_order ASC, created_at ASC"
    ), params)).fetchall()
    return {"photos": [_photo(p) for p in rows]}


# ---------------------------------------------------------------------------
# Partner — profile
# ---------------------------------------------------------------------------

class ProfilePatch(BaseModel):
    description:    Optional[constr(strip_whitespace=True, max_length=4000)] = None
    price_range:    Optional[str] = Field(None, pattern=r"^\$+$")
    address:        Optional[constr(strip_whitespace=True, max_length=255)] = None
    latitude:       Optional[float] = Field(None, ge=-90, le=90)
    longitude:      Optional[float] = Field(None, ge=-180, le=180)
    opening_hours:  Optional[dict] = None
    facilities:     Optional[list[str]] = None
    highlights:     Optional[list[str]] = None
    contact_phone:  Optional[constr(strip_whitespace=True, max_length=32)] = None
    contact_email:  Optional[EmailStr] = None


@manage_router.patch("/{rid}/profile")
async def update_profile(
    rid: str, payload: ProfilePatch,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    import json as _json
    fields = payload.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(422, "Nothing to update")
    sets, params = [], {"rid": rid}
    for k, v in fields.items():
        if k in ("opening_hours", "facilities", "highlights"):
            sets.append(f"{k} = CAST(:{k} AS JSONB)")
            params[k] = _json.dumps(v)
        else:
            sets.append(f"{k} = :{k}")
            params[k] = v
    sets.append("updated_at = now()")
    await session.execute(text(
        f"UPDATE food_restaurants SET {', '.join(sets)} WHERE id = :rid"
    ), params)
    await session.commit()
    r = (await session.execute(text("SELECT * FROM food_restaurants WHERE id = :id"), {"id": rid})).fetchone()
    return _restaurant_profile(r)


# ---------------------------------------------------------------------------
# Partner — photos CRUD
# ---------------------------------------------------------------------------

class PhotoIn(BaseModel):
    url:       constr(strip_whitespace=True, min_length=1, max_length=2000)
    category:  str = Field("food")
    caption:   Optional[constr(max_length=255)] = None
    is_cover:  bool = False


class PhotoPatch(BaseModel):
    category:  Optional[str] = None
    caption:   Optional[str] = None
    is_cover:  Optional[bool] = None
    sort_order: Optional[int] = None


class PhotoReorderIn(BaseModel):
    order: list[str]


@manage_router.get("/{rid}/photos")
async def list_photos(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    rows = (await session.execute(text(
        "SELECT * FROM food_restaurant_photos WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": rid})).fetchall()
    return {"photos": [_photo(p) for p in rows]}


@manage_router.post("/{rid}/photos", status_code=201)
async def add_photo(
    rid: str, payload: PhotoIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    if payload.category not in ("food", "ambience", "interior", "exterior", "menu"):
        raise HTTPException(422, "Invalid category")
    # Next sort_order
    max_order = (await session.execute(text(
        "SELECT COALESCE(MAX(sort_order), -1) AS m FROM food_restaurant_photos WHERE restaurant_id = :rid"
    ), {"rid": rid})).scalar()
    pid = f"foto_{uuid.uuid4().hex[:16]}"
    # If is_cover, unset current cover first.
    if payload.is_cover:
        await session.execute(text(
            "UPDATE food_restaurant_photos SET is_cover = FALSE WHERE restaurant_id = :rid"
        ), {"rid": rid})
    await session.execute(text("""
        INSERT INTO food_restaurant_photos
            (id, restaurant_id, url, category, caption, is_cover, sort_order)
        VALUES (:id, :rid, :url, :cat, :cap, :cov, :ord)
    """), {"id": pid, "rid": rid, "url": payload.url, "cat": payload.category,
           "cap": payload.caption, "cov": payload.is_cover, "ord": int(max_order) + 1})
    await session.commit()
    r = (await session.execute(text("SELECT * FROM food_restaurant_photos WHERE id = :id"), {"id": pid})).fetchone()
    return _photo(r)


@manage_router.patch("/{rid}/photos/{photo_id}")
async def patch_photo(
    rid: str, photo_id: str, payload: PhotoPatch,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text(
        "SELECT * FROM food_restaurant_photos WHERE id = :id AND restaurant_id = :rid"
    ), {"id": photo_id, "rid": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Photo not found")
    fields = payload.model_dump(exclude_none=True)
    if not fields: return _photo(row)
    if fields.get("is_cover"):
        await session.execute(text(
            "UPDATE food_restaurant_photos SET is_cover = FALSE WHERE restaurant_id = :rid AND id != :id"
        ), {"rid": rid, "id": photo_id})
    sets, params = [], {"id": photo_id}
    for k, v in fields.items():
        sets.append(f"{k} = :{k}")
        params[k] = v
    sets.append("updated_at = now()")
    await session.execute(text(
        f"UPDATE food_restaurant_photos SET {', '.join(sets)} WHERE id = :id"
    ), params)
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_restaurant_photos WHERE id = :id"), {"id": photo_id})).fetchone()
    return _photo(row)


@manage_router.delete("/{rid}/photos/{photo_id}", status_code=204)
async def delete_photo(
    rid: str, photo_id: str,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    r = await session.execute(text(
        "DELETE FROM food_restaurant_photos WHERE id = :id AND restaurant_id = :rid"
    ), {"id": photo_id, "rid": rid})
    await session.commit()
    if r.rowcount == 0:
        raise HTTPException(404, "Photo not found")


@manage_router.post("/{rid}/photos/reorder")
async def reorder_photos(
    rid: str, payload: PhotoReorderIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    for idx, pid in enumerate(payload.order):
        await session.execute(text("""
            UPDATE food_restaurant_photos
               SET sort_order = :ord, updated_at = now()
             WHERE id = :id AND restaurant_id = :rid
        """), {"ord": idx, "id": pid, "rid": rid})
    await session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Partner — menu documents (PDF or image)
#
# Uses the same Emergent Object Storage backing as photos. Doc uploads
# route through `/food/manage/{rid}/uploads/doc` because the existing
# admin uploads endpoint is admin-only and image-only; this one accepts
# both admin and food_partner tokens (via `_get_menu_writer`) and both
# PDF and image content-types.
# ---------------------------------------------------------------------------

MENU_DOC_MAX_BYTES = 15 * 1024 * 1024  # 15 MB — allows a full multi-page PDF
MENU_DOC_ALLOWED = {
    "application/pdf",
    "image/png", "image/jpeg", "image/jpg", "image/webp",
}


@manage_router.post("/{rid}/uploads/doc")
async def upload_menu_doc_file(
    rid: str, request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    """Upload a PDF or image and return `{file_url}`. Partner-scoped."""
    await _get_menu_writer(rid, request, session)
    ct = (file.content_type or "").lower()
    if ct not in MENU_DOC_ALLOWED:
        raise HTTPException(400, "File must be a PDF or an image")
    content = await file.read()
    if len(content) > MENU_DOC_MAX_BYTES:
        raise HTTPException(413, f"File too large ({MENU_DOC_MAX_BYTES // 1024 // 1024} MB max)")
    if len(content) < 32:
        raise HTTPException(400, "File is empty or too small")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() or ("pdf" if ct == "application/pdf" else "bin")
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    safe_rid = re.sub(r"[^a-zA-Z0-9_-]", "", rid)
    key = f"{object_storage.APP_NAME}/food/menu_docs/{safe_rid}/{ts}.{ext}"
    try:
        object_storage.put_object(key, content, ct)
    except Exception as e:
        raise HTTPException(502, f"Upload failed: {e}")
    return {"file_url": f"/api/food/uploads/{key}", "content_type": ct, "size": len(content)}


class MenuDocIn(BaseModel):
    label_fr: constr(strip_whitespace=True, min_length=1, max_length=120)
    label_en: Optional[constr(strip_whitespace=True, max_length=120)] = None
    url:      constr(strip_whitespace=True, min_length=1, max_length=2000)


class MenuDocPatch(BaseModel):
    label_fr:   Optional[constr(strip_whitespace=True, max_length=120)] = None
    label_en:   Optional[constr(strip_whitespace=True, max_length=120)] = None
    sort_order: Optional[int] = None


@manage_router.get("/{rid}/menu-docs")
async def list_menu_docs(rid: str, request: Request, session: AsyncSession = Depends(get_session)):
    await _get_menu_writer(rid, request, session)
    rows = (await session.execute(text(
        "SELECT * FROM food_restaurant_menu_docs WHERE restaurant_id = :rid ORDER BY sort_order ASC, created_at ASC"
    ), {"rid": rid})).fetchall()
    return {"menu_docs": [_menu_doc(r) for r in rows]}


@manage_router.post("/{rid}/menu-docs", status_code=201)
async def add_menu_doc(
    rid: str, payload: MenuDocIn,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    next_order = (await session.execute(text(
        "SELECT COALESCE(MAX(sort_order), -1) FROM food_restaurant_menu_docs WHERE restaurant_id = :rid"
    ), {"rid": rid})).scalar()
    did = f"doc_{uuid.uuid4().hex[:16]}"
    await session.execute(text("""
        INSERT INTO food_restaurant_menu_docs
            (id, restaurant_id, label_fr, label_en, url, sort_order)
        VALUES (:id, :rid, :fr, :en, :url, :ord)
    """), {"id": did, "rid": rid, "fr": payload.label_fr,
           "en": payload.label_en, "url": payload.url, "ord": int(next_order) + 1})
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_restaurant_menu_docs WHERE id = :id"), {"id": did})).fetchone()
    return _menu_doc(row)


@manage_router.patch("/{rid}/menu-docs/{doc_id}")
async def patch_menu_doc(
    rid: str, doc_id: str, payload: MenuDocPatch,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    row = (await session.execute(text(
        "SELECT * FROM food_restaurant_menu_docs WHERE id = :id AND restaurant_id = :rid"
    ), {"id": doc_id, "rid": rid})).fetchone()
    if not row:
        raise HTTPException(404, "Menu document not found")
    fields = payload.model_dump(exclude_none=True)
    if not fields: return _menu_doc(row)
    sets, params = [], {"id": doc_id}
    for k, v in fields.items():
        sets.append(f"{k} = :{k}")
        params[k] = v
    await session.execute(text(
        f"UPDATE food_restaurant_menu_docs SET {', '.join(sets)} WHERE id = :id"
    ), params)
    await session.commit()
    row = (await session.execute(text("SELECT * FROM food_restaurant_menu_docs WHERE id = :id"), {"id": doc_id})).fetchone()
    return _menu_doc(row)


@manage_router.delete("/{rid}/menu-docs/{doc_id}", status_code=204)
async def delete_menu_doc(
    rid: str, doc_id: str,
    request: Request, session: AsyncSession = Depends(get_session),
):
    await _get_menu_writer(rid, request, session)
    r = await session.execute(text(
        "DELETE FROM food_restaurant_menu_docs WHERE id = :id AND restaurant_id = :rid"
    ), {"id": doc_id, "rid": rid})
    await session.commit()
    if r.rowcount == 0:
        raise HTTPException(404, "Menu document not found")

