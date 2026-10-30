"""FOODbakēd — Customer Reviews (verified-order + verified-visit gated).

Endpoint surface:

  Public:
    GET  /api/food/restaurants/{slug_or_id}/reviews?page=&size=&sort=

  Customer (Bearer customer JWT):
    GET  /api/food/customer/reviews/eligible          — eligible orders + reservations still to review
    POST /api/food/customer/reviews                   — publish a new review

Design notes
------------
* A review MUST reference EITHER a delivered `food_orders.id` (Verified Order)
  OR a completed `food_reservations.id` (Verified Visit) owned by the caller.
  The response includes `verified_order` / `verified_visit` booleans so the UI
  can render the "Commande vérifiée" / "Visite vérifiée" pill.
* Automated moderation is a small, deterministic pass (URL/phone/email
  regex + a tiny profanity list). Suspect reviews are stored with
  `status='reported'` + a `flagged_reason` so super-admin can act — they
  are NOT shown in the public list. Genuine 1★ reviews are never hidden
  (per user directive).
* Reviewer name is normalised to "Prénom N." — safe default; the raw
  customer row is never leaked.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, constr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import Customer
from modules.food.reservations import _resolve_restaurant  # reuse country-aware resolver


log = logging.getLogger("baked.food.reviews")

public_router   = APIRouter(prefix="/food", tags=["food-reviews"])
customer_router = APIRouter(prefix="/food/customer", tags=["food-reviews"])


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------

def _iso(v: Any) -> Optional[str]:
    if not v:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, datetime) and v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


def _safe_author(full_name: Optional[str]) -> str:
    """Return "Prénom N." — falls back to "Client vérifié"."""
    if not full_name:
        return "Client vérifié"
    parts = [p for p in re.split(r"\s+", full_name.strip()) if p]
    if not parts:
        return "Client vérifié"
    first = parts[0]
    if len(parts) == 1:
        return first
    return f"{first} {parts[-1][0].upper()}."


def _review_public(r: Any, author_name: Optional[str]) -> dict:
    return {
        "id": r.id,
        "rating": int(r.rating),
        "text":   r.text,
        "food_rating":     r.food_rating,
        "service_rating":  r.service_rating,
        "ambience_rating": r.ambience_rating,
        "value_rating":    r.value_rating,
        "partner_response":     r.partner_response,
        "partner_response_at":  _iso(r.partner_response_at),
        "created_at":           _iso(r.created_at),
        "verified_order":       bool(getattr(r, "order_id", None)),
        "verified_visit":       bool(getattr(r, "reservation_id", None)),
        "author":               _safe_author(author_name),
    }


# ---------------------------------------------------------------------------
# Simple moderation
# ---------------------------------------------------------------------------

_URL_RE   = re.compile(r"https?://|www\.|\b\w+\.(?:com|org|net|shop|store|xyz)\b", re.I)
_PHONE_RE = re.compile(r"(?:\+?\d[\s\-]?){7,}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

# Deliberately small — this is not a content-moderation SLA, just a first
# line of defence. Real moderation happens via the super-admin queue.
_BANNED_WORDS = {
    # profanity / hate (fr + en, minimal seed)
    "fdp", "connard", "salope", "putain", "merde",
    "fuck", "shit", "asshole", "bitch",
    # spam markers
    "promo", "click here", "cliquez ici", "whatsapp", "telegram",
}
_BANNED_RE = re.compile(r"\b(?:" + "|".join(re.escape(w) for w in _BANNED_WORDS) + r")\b", re.I)


def _moderate(text_value: Optional[str]) -> Optional[str]:
    """Return a flag reason if the text is suspect, else None."""
    if not text_value:
        return None
    # Order matters: email is more specific than URL (both would match a bare domain).
    if _EMAIL_RE.search(text_value):
        return "contains_email"
    if _URL_RE.search(text_value):
        return "contains_link"
    if _PHONE_RE.search(text_value):
        return "contains_phone"
    if _BANNED_RE.search(text_value):
        return "prohibited_content"
    # Very short + shouty
    letters = re.sub(r"[^A-Za-z]", "", text_value)
    if letters and letters.upper() == letters and len(letters) >= 20:
        return "possible_shouting"
    return None


# ---------------------------------------------------------------------------
# Customer: eligibility
# ---------------------------------------------------------------------------

@customer_router.get("/reviews/eligible")
async def eligible_for_review(
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    """Return the customer's delivered orders + completed reservations
    that have not yet received a review — the frontend uses this to
    render the "Laisser un avis" prompts."""
    # Delivered orders without a review row from this customer.
    orders = (await session.execute(text("""
        SELECT o.id, o.restaurant_id, o.total, o.delivered_at, o.status, r.name AS restaurant_name, r.slug AS restaurant_slug, r.image AS restaurant_image
          FROM food_orders o
          JOIN food_restaurants r ON r.id = o.restaurant_id
          LEFT JOIN food_reviews rv
                 ON rv.order_id = o.id AND rv.customer_id = :cid
         WHERE o.customer_id = :cid
           AND o.status = 'delivered'
           AND rv.id IS NULL
         ORDER BY o.delivered_at DESC NULLS LAST
         LIMIT 50
    """), {"cid": customer.id})).fetchall()

    # Completed reservations without a review row from this customer.
    reservations = (await session.execute(text("""
        SELECT rs.id, rs.restaurant_id, rs.reservation_at, rs.party_size,
               r.name AS restaurant_name, r.slug AS restaurant_slug, r.image AS restaurant_image
          FROM food_reservations rs
          JOIN food_restaurants r ON r.id = rs.restaurant_id
          LEFT JOIN food_reviews rv
                 ON rv.reservation_id = rs.id AND rv.customer_id = :cid
         WHERE rs.customer_id = :cid
           AND rs.status = 'completed'
           AND rv.id IS NULL
         ORDER BY rs.reservation_at DESC
         LIMIT 50
    """), {"cid": customer.id})).fetchall()

    return {
        "orders": [
            {"id": o.id, "restaurant_id": o.restaurant_id,
             "restaurant_name": o.restaurant_name, "restaurant_slug": o.restaurant_slug,
             "restaurant_image": o.restaurant_image,
             "delivered_at": _iso(o.delivered_at),
             "total": float(o.total or 0)}
            for o in orders
        ],
        "reservations": [
            {"id": r.id, "restaurant_id": r.restaurant_id,
             "restaurant_name": r.restaurant_name, "restaurant_slug": r.restaurant_slug,
             "restaurant_image": r.restaurant_image,
             "reservation_at": _iso(r.reservation_at),
             "party_size": r.party_size}
            for r in reservations
        ],
    }


# ---------------------------------------------------------------------------
# Customer: publish a review
# ---------------------------------------------------------------------------

class ReviewIn(BaseModel):
    order_id:       Optional[constr(strip_whitespace=True, max_length=64)] = None
    reservation_id: Optional[constr(strip_whitespace=True, max_length=64)] = None
    rating:         int = Field(..., ge=1, le=5)
    text:           Optional[constr(strip_whitespace=True, max_length=1000)] = None
    food_rating:    Optional[int] = Field(None, ge=1, le=5)
    service_rating: Optional[int] = Field(None, ge=1, le=5)
    ambience_rating: Optional[int] = Field(None, ge=1, le=5)
    value_rating:   Optional[int] = Field(None, ge=1, le=5)


@customer_router.post("/reviews", status_code=201)
async def create_review(
    payload: ReviewIn,
    session: AsyncSession = Depends(get_session),
    customer: Customer = Depends(get_current_customer),
):
    if not payload.order_id and not payload.reservation_id:
        raise HTTPException(422, "order_id or reservation_id required")
    if payload.order_id and payload.reservation_id:
        raise HTTPException(422, "provide either order_id or reservation_id, not both")

    restaurant_id: Optional[str] = None

    # ---- Verified Order path
    if payload.order_id:
        row = (await session.execute(text(
            "SELECT id, customer_id, restaurant_id, status FROM food_orders WHERE id = :id"
        ), {"id": payload.order_id})).fetchone()
        if not row:
            raise HTTPException(404, "Order not found")
        if row.customer_id != customer.id:
            raise HTTPException(403, "Not your order")
        if row.status != "delivered":
            raise HTTPException(400, "You can only review a delivered order")
        restaurant_id = row.restaurant_id

    # ---- Verified Visit path
    if payload.reservation_id:
        row = (await session.execute(text(
            "SELECT id, customer_id, restaurant_id, status FROM food_reservations WHERE id = :id"
        ), {"id": payload.reservation_id})).fetchone()
        if not row:
            raise HTTPException(404, "Reservation not found")
        if row.customer_id != customer.id:
            raise HTTPException(403, "Not your reservation")
        if row.status != "completed":
            raise HTTPException(400, "You can only review a completed reservation")
        restaurant_id = row.restaurant_id

    assert restaurant_id  # for type-checkers

    # ---- Already reviewed?
    if payload.order_id:
        dup = (await session.execute(text(
            "SELECT id FROM food_reviews WHERE order_id = :oid AND customer_id = :cid"
        ), {"oid": payload.order_id, "cid": customer.id})).fetchone()
        if dup:
            raise HTTPException(409, "You have already reviewed this order")
    if payload.reservation_id:
        dup = (await session.execute(text(
            "SELECT id FROM food_reviews WHERE reservation_id = :rid AND customer_id = :cid"
        ), {"rid": payload.reservation_id, "cid": customer.id})).fetchone()
        if dup:
            raise HTTPException(409, "You have already reviewed this reservation")

    # ---- Moderation
    flag = _moderate(payload.text)
    status_v = "reported" if flag else "published"

    review_id = f"rvw_{uuid.uuid4().hex[:16]}"
    await session.execute(text("""
        INSERT INTO food_reviews
            (id, restaurant_id, customer_id, order_id, reservation_id,
             rating, text, food_rating, service_rating, ambience_rating, value_rating,
             status, flagged_reason)
        VALUES
            (:id, :rid, :cid, :oid, :res_id,
             :rating, :text, :fr, :sr, :ar, :vr,
             :status, :flag)
    """), {
        "id": review_id, "rid": restaurant_id, "cid": customer.id,
        "oid": payload.order_id, "res_id": payload.reservation_id,
        "rating": payload.rating, "text": payload.text,
        "fr": payload.food_rating, "sr": payload.service_rating,
        "ar": payload.ambience_rating, "vr": payload.value_rating,
        "status": status_v, "flag": flag,
    })

    # Recompute restaurant aggregates on published only.
    if status_v == "published":
        await session.execute(text("""
            UPDATE food_restaurants r
               SET review_count = sub.n,
                   rating       = sub.avg
              FROM (
                   SELECT COUNT(*)                  AS n,
                          COALESCE(AVG(rating), 0)  AS avg
                     FROM food_reviews
                    WHERE restaurant_id = :rid
                      AND status = 'published'
              ) AS sub
             WHERE r.id = :rid
        """), {"rid": restaurant_id})

    await session.commit()

    row = (await session.execute(text(
        "SELECT * FROM food_reviews WHERE id = :id"
    ), {"id": review_id})).fetchone()
    out = _review_public(row, customer.name)
    out["status"] = row.status
    if row.status == "reported":
        out["moderation_note_fr"] = "Votre avis est en cours de vérification par notre équipe."
        out["moderation_note_en"] = "Your review is under review by our team."
    return out


# ---------------------------------------------------------------------------
# Public: paginated reviews
# ---------------------------------------------------------------------------

@public_router.get("/restaurants/{slug_or_id}/reviews")
async def list_reviews(
    slug_or_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    sort: str = Query("recent", pattern="^(recent|top|low)$"),
    country: Optional[str] = Query(None, max_length=4),
    session: AsyncSession = Depends(get_session),
):
    r = await _resolve_restaurant(session, slug_or_id, country)
    order_by = {
        "recent": "created_at DESC",
        "top":    "rating DESC, created_at DESC",
        "low":    "rating ASC, created_at DESC",
    }[sort]
    offset = (page - 1) * size

    rows = (await session.execute(text(f"""
        SELECT rv.*, c.name AS customer_name
          FROM food_reviews rv
          LEFT JOIN customers c ON c.id = rv.customer_id
         WHERE rv.restaurant_id = :rid
           AND rv.status = 'published'
         ORDER BY {order_by}
         LIMIT :lim OFFSET :off
    """), {"rid": r.id, "lim": size, "off": offset})).fetchall()

    def _display_name(row) -> Optional[str]:
        # Seed rows encode the intended display name in moderation_notes for demo purposes.
        note = getattr(row, "moderation_notes", None) or ""
        if note.startswith("seed_author="):
            return note.split("=", 1)[1].strip() or None
        return row.customer_name

    total = (await session.execute(text(
        "SELECT COUNT(*) FROM food_reviews WHERE restaurant_id = :rid AND status = 'published'"
    ), {"rid": r.id})).scalar_one()

    dist_rows = (await session.execute(text("""
        SELECT rating, COUNT(*) AS n FROM food_reviews
         WHERE restaurant_id = :rid AND status = 'published'
         GROUP BY rating
    """), {"rid": r.id})).fetchall()
    dist = {i: 0 for i in range(1, 6)}
    for d in dist_rows:
        dist[int(d.rating)] = int(d.n)
    avg = 0.0
    if total:
        avg = round(sum(k * v for k, v in dist.items()) / total, 2)

    return {
        "reviews": [_review_public(row, _display_name(row)) for row in rows],
        "page":    page,
        "size":    size,
        "total":   int(total),
        "summary": {"count": int(total), "average": avg, "distribution": dist},
    }
