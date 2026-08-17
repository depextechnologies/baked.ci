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
from core.models import AdminUser, MartCategory, Partner, Supplier
from core.models.base import Base, new_id


CATEGORY_REQUEST_STATUSES = ("pending", "approved", "rejected")
CATEGORY_REQUEST_KINDS    = ("partner", "supplier")


class MartCategoryRequest(Base):
    __tablename__ = "mart_category_requests"
    __table_args__ = (
        Index("ix_cat_req_status", "status", "created_at"),
        Index("ix_cat_req_partner", "partner_id"),
        Index("ix_cat_req_supplier", "supplier_id"),
        Index("ix_cat_req_kind", "requester_kind", "status"),
        CheckConstraint(
            f"status IN ({','.join(repr(s) for s in CATEGORY_REQUEST_STATUSES)})",
            name="ck_cat_req_status",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("catreq"))
    # Either partner_id OR supplier_id is set (nullable to accommodate the other kind)
    partner_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("partners.id"), nullable=True)
    supplier_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("suppliers.id"), nullable=True)
    requester_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="partner", server_default="partner")
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

def _req_dict(r: MartCategoryRequest, partner: Optional[Partner] = None,
              supplier: Optional[Supplier] = None) -> dict:
    requester_name = None
    if r.requester_kind == "partner" and partner:
        requester_name = partner.business_name
    elif r.requester_kind == "supplier" and supplier:
        requester_name = supplier.business_name
    return {
        "id": r.id,
        "requester_kind": r.requester_kind,
        "partner_id": r.partner_id, "supplier_id": r.supplier_id,
        "partner_name": partner.business_name if partner else None,
        "supplier_name": supplier.business_name if supplier else None,
        "requester_name": requester_name,
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
        requester_kind="partner",
        name=payload.name, slug_hint=slug,
        parent_category_id=payload.parent_category_id,
        reason=payload.reason,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _req_dict(row, partner=partner)


@partner_router.get("/category-requests")
async def list_my_category_requests(
    session: AsyncSession = Depends(get_session),
    partner: Partner = Depends(__import__("modules.mart_partner.routes", fromlist=["get_current_partner"]).get_current_partner),
):
    rows = (await session.execute(
        select(MartCategoryRequest).where(MartCategoryRequest.partner_id == partner.id)
        .order_by(MartCategoryRequest.created_at.desc())
    )).scalars().all()
    return {"items": [_req_dict(r, partner=partner) for r in rows]}


# ============================================================================
#                              SUPPLIER routes (P2)
# ============================================================================

supplier_router = APIRouter(prefix="/supplier/me", tags=["supplier-category-requests"])


@supplier_router.post("/category-requests", status_code=201)
async def supplier_submit_category_request(
    payload: CategoryRequestIn,
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(__import__("shared.suppliers.portal_routes", fromlist=["get_current_supplier"]).get_current_supplier),
):
    slug = payload.name.strip().lower().replace(" ", "-")
    row = MartCategoryRequest(
        supplier_id=supplier.id, country=supplier.country,
        requester_kind="supplier",
        name=payload.name, slug_hint=slug,
        parent_category_id=payload.parent_category_id,
        reason=payload.reason,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _req_dict(row, supplier=supplier)


@supplier_router.get("/category-requests")
async def supplier_list_category_requests(
    session: AsyncSession = Depends(get_session),
    supplier: Supplier = Depends(__import__("shared.suppliers.portal_routes", fromlist=["get_current_supplier"]).get_current_supplier),
):
    rows = (await session.execute(
        select(MartCategoryRequest).where(MartCategoryRequest.supplier_id == supplier.id)
        .order_by(MartCategoryRequest.created_at.desc())
    )).scalars().all()
    return {"items": [_req_dict(r, supplier=supplier) for r in rows]}


# ============================================================================
#                                ADMIN routes
# ============================================================================

admin_router = APIRouter(prefix="/admin/mart/category-requests", tags=["admin-category-requests"])


@admin_router.get("")
async def admin_list_requests(
    status: Optional[str] = Query(None),
    country: Optional[str] = None,
    kind: Optional[str] = Query(None, description="partner|supplier"),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(__import__("shared.admin.routes", fromlist=["get_current_admin"]).get_current_admin),
):
    stmt = select(MartCategoryRequest).order_by(MartCategoryRequest.created_at.desc())
    if status:  stmt = stmt.where(MartCategoryRequest.status == status)
    if country: stmt = stmt.where(MartCategoryRequest.country == country.upper())
    if kind:    stmt = stmt.where(MartCategoryRequest.requester_kind == kind)
    rows = (await session.execute(stmt)).scalars().all()
    partner_ids  = [r.partner_id  for r in rows if r.partner_id]
    supplier_ids = [r.supplier_id for r in rows if r.supplier_id]
    partners = {p.id: p for p in (await session.execute(
        select(Partner).where(Partner.id.in_(partner_ids))
    )).scalars().all()} if partner_ids else {}
    suppliers = {s.id: s for s in (await session.execute(
        select(Supplier).where(Supplier.id.in_(supplier_ids))
    )).scalars().all()} if supplier_ids else {}

    # Bucket counts
    bstmt = select(MartCategoryRequest.status, func.count(MartCategoryRequest.id)).group_by(MartCategoryRequest.status)
    if country:
        bstmt = bstmt.where(MartCategoryRequest.country == country.upper())
    if kind:
        bstmt = bstmt.where(MartCategoryRequest.requester_kind == kind)
    brows = (await session.execute(bstmt)).all()
    buckets = {"pending": 0, "approved": 0, "rejected": 0}
    for s, c in brows: buckets[s] = c

    return {"items": [_req_dict(r,
                                partner=partners.get(r.partner_id) if r.partner_id else None,
                                supplier=suppliers.get(r.supplier_id) if r.supplier_id else None)
                      for r in rows], "buckets": buckets}


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

    # P2 — feedback loop: ping the supplier if they submitted the request
    if r.requester_kind == "supplier" and r.supplier_id:
        supplier = await session.get(Supplier, r.supplier_id)
        if supplier:
            from shared.notifications.routes import notify as inapp_notify
            await inapp_notify(
                session,
                recipient_kind="supplier", recipient_id=supplier.id,
                kind="category_request_approved",
                title=f"Category '{r.name}' approved",
                body=f"You can now propose products under {r.name}.",
                link=f"/martbaked/{supplier.seller_slug or 'sellers'}/portal/product-requests",
                entity_kind="mart_category_request", entity_id=r.id,
                actor_label=admin.email,
            )
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

    # P2 — feedback loop: ping the supplier with the reviewer's reason
    if r.requester_kind == "supplier" and r.supplier_id:
        supplier = await session.get(Supplier, r.supplier_id)
        if supplier:
            from shared.notifications.routes import notify as inapp_notify
            await inapp_notify(
                session,
                recipient_kind="supplier", recipient_id=supplier.id,
                kind="category_request_rejected",
                title=f"Category '{r.name}' declined",
                body=payload.notes,
                link=f"/martbaked/{supplier.seller_slug or 'sellers'}/portal/product-requests",
                entity_kind="mart_category_request", entity_id=r.id,
                actor_label=admin.email,
            )
    await session.commit()
    await session.refresh(r)
    return _req_dict(r)
