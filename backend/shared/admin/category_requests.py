"""MART Category Request — partner asks, Super Admin approves.

Migration 0011 created `mart_category_requests`. This module registers the
SQLAlchemy model and the partner + admin routes.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (
    TIMESTAMP, CheckConstraint, ForeignKey, Index, String, Text, func, select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from core.db import get_session
from core.models import AdminUser, MartCategory, Partner
from core.models.base import Base, new_id


CATEGORY_REQUEST_STATUSES = ("pending", "approved", "rejected")


class MartCategoryRequest(Base):
    __tablename__ = "mart_category_requests"
    __table_args__ = (
        Index("ix_cat_req_status", "status", "created_at"),
        Index("ix_cat_req_partner", "partner_id"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in CATEGORY_REQUEST_STATUSES)})",
            name="ck_cat_req_status",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("catreq"))
    partner_id: Mapped[str] = mapped_column(String, ForeignKey("partners.id"), nullable=False)
    country: Mapped[str] = mapped_column(String(2), ForeignKey("countries.code"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug_hint: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    parent_category_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_categories.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    reviewer_admin_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("admin_users.id"), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_category_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("mart_categories.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


# ============================================================================
#                                Serialisation
# ============================================================================

def _req_dict(r: MartCategoryRequest, partner: Optional[Partner] = None) -> dict:
    return {
        "id": r.id, "partner_id": r.partner_id,
        "partner_name": partner.business_name if partner else None,
        "country": r.country, "name": r.name, "slug_hint": r.slug_hint,
        "parent_category_id": r.parent_category_id, "reason": r.reason,
        "status": r.status, "review_notes": r.review_notes,
        "approved_category_id": r.approved_category_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    }


# ============================================================================
#                                PARTNER routes
# ============================================================================

partner_router = APIRouter(prefix="/partner/catalog", tags=["partner-catalog-requests"])


class CategoryRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=2, max_length=200)
    parent_category_id: Optional[str] = None
    reason: Optional[str] = Field(None, max_length=1000)


@partner_router.post("/category-requests", status_code=201)
async def submit_category_request(
    payload: CategoryRequestIn,
    session: AsyncSession = Depends(get_session),
    partner: Partner = Depends(__import__("modules.mart_partner.routes", fromlist=["get_current_partner"]).get_current_partner),
):
    slug = payload.name.strip().lower().replace(" ", "-")
    row = MartCategoryRequest(
        partner_id=partner.id, country=partner.country,
        name=payload.name, slug_hint=slug,
        parent_category_id=payload.parent_category_id,
        reason=payload.reason,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _req_dict(row, partner)


@partner_router.get("/category-requests")
async def list_my_category_requests(
    session: AsyncSession = Depends(get_session),
    partner: Partner = Depends(__import__("modules.mart_partner.routes", fromlist=["get_current_partner"]).get_current_partner),
):
    rows = (await session.execute(
        select(MartCategoryRequest).where(MartCategoryRequest.partner_id == partner.id)
        .order_by(MartCategoryRequest.created_at.desc())
    )).scalars().all()
    return {"items": [_req_dict(r, partner) for r in rows]}


# ============================================================================
#                                ADMIN routes
# ============================================================================

admin_router = APIRouter(prefix="/admin/mart/category-requests", tags=["admin-category-requests"])


@admin_router.get("")
async def admin_list_requests(
    status: Optional[str] = Query(None),
    country: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(__import__("shared.admin.routes", fromlist=["get_current_admin"]).get_current_admin),
):
    stmt = select(MartCategoryRequest).order_by(MartCategoryRequest.created_at.desc())
    if status:  stmt = stmt.where(MartCategoryRequest.status == status)
    if country: stmt = stmt.where(MartCategoryRequest.country == country.upper())
    rows = (await session.execute(stmt)).scalars().all()
    partners = {p.id: p for p in (await session.execute(
        select(Partner).where(Partner.id.in_([r.partner_id for r in rows]))
    )).scalars().all()}

    # Bucket counts
    bstmt = select(MartCategoryRequest.status, func.count(MartCategoryRequest.id)).group_by(MartCategoryRequest.status)
    if country:
        bstmt = bstmt.where(MartCategoryRequest.country == country.upper())
    brows = (await session.execute(bstmt)).all()
    buckets = {"pending": 0, "approved": 0, "rejected": 0}
    for s, c in brows: buckets[s] = c

    return {"items": [_req_dict(r, partners.get(r.partner_id)) for r in rows], "buckets": buckets}


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = Field(None, max_length=1000)
    icon: Optional[str] = None


@admin_router.post("/{req_id}/approve")
async def admin_approve_request(
    req_id: str, payload: ReviewIn = ReviewIn(),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(__import__("shared.admin.routes", fromlist=["get_current_admin"]).get_current_admin),
):
    r = await session.get(MartCategoryRequest, req_id)
    if not r: raise HTTPException(404, "Request not found")
    if r.status != "pending": raise HTTPException(409, f"Cannot approve a {r.status} request")

    # Ensure slug uniqueness within country
    base_slug = r.slug_hint or r.name.lower().replace(" ", "-")
    slug = base_slug
    n = 1
    while (await session.execute(select(MartCategory).where(
        MartCategory.slug == slug, MartCategory.country == r.country
    ))).scalar_one_or_none():
        n += 1
        slug = f"{base_slug}-{n}"

    order_val = ((await session.scalar(select(func.count(MartCategory.id)).where(
        MartCategory.country == r.country
    ))) or 0) + 1
    cat = MartCategory(
        slug=slug, country=r.country, module="mart",
        name=r.name, name_en=r.name, name_fr=r.name,
        icon=payload.icon, order=order_val,
        created_by=admin.id,
    )
    session.add(cat)
    await session.flush()
    r.status = "approved"
    r.reviewer_admin_id = admin.id
    r.review_notes = payload.notes
    r.approved_category_id = cat.id
    r.reviewed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(r)
    return _req_dict(r)


@admin_router.post("/{req_id}/reject")
async def admin_reject_request(
    req_id: str, payload: ReviewIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(__import__("shared.admin.routes", fromlist=["get_current_admin"]).get_current_admin),
):
    r = await session.get(MartCategoryRequest, req_id)
    if not r: raise HTTPException(404, "Request not found")
    if r.status != "pending": raise HTTPException(409, f"Cannot reject a {r.status} request")
    if not payload.notes:     raise HTTPException(400, "Rejection notes are required")
    r.status = "rejected"
    r.reviewer_admin_id = admin.id
    r.review_notes = payload.notes
    r.reviewed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(r)
    return _req_dict(r)
