"""Admin — MART catalogue management.

MASTER COMPLETION PROGRAM Phase 2 CRUD for the Super Admin to manage the
shared MARTbakēd catalog: Categories, Subcategories, Brands, and Products
(the master catalog partners link to). Plus the Partner Product Approval
queue — every partner-submitted custom SKU must be reviewed here before
it goes live.

Routes:
    GET/POST/PATCH/DELETE /admin/mart/categories
    GET/POST/PATCH/DELETE /admin/mart/subcategories
    GET/POST/PATCH/DELETE /admin/mart/brands
    GET/POST/PATCH/DELETE /admin/mart/products
    GET                   /admin/mart/partner-products           (approval queue)
    POST                  /admin/mart/partner-products/{id}/approve
    POST                  /admin/mart/partner-products/{id}/reject
    POST                  /admin/mart/partner-products/{id}/request-changes
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser,
    MartBrand,
    MartCategory,
    MartProduct,
    MartSubcategory,
    Partner,
    PartnerProduct,
)
from core.serializers import row_to_dict
from .routes import get_current_admin, _audit


router = APIRouter(prefix="/admin/mart", tags=["admin-mart-catalog"])


# ============================================================================
#                           CATEGORIES
# ============================================================================

class CategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=80)
    country: str = Field(..., min_length=2, max_length=2)
    name: Optional[str] = None
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    order: int = 0
    module: str = "mart"


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    icon: Optional[str] = None
    image: Optional[str] = None
    order: Optional[int] = None


@router.get("/categories")
async def list_categories(
    country: Optional[str] = None,
    module: str = "mart",
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MartCategory).where(MartCategory.module == module).order_by(MartCategory.order, MartCategory.slug)
    if country:
        stmt = stmt.where(MartCategory.country == country.upper())
    rows = (await session.execute(stmt)).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/categories", status_code=201)
async def create_category(
    payload: CategoryIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = MartCategory(**payload.model_dump(), created_by=admin.id)
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "A category with that slug already exists in this country")
    await session.refresh(row)
    await _audit(session, admin, "mart.category.create", row.id)
    return row_to_dict(row)


@router.patch("/categories/{cat_id}")
async def update_category(
    cat_id: str, payload: CategoryUpdate,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartCategory, cat_id)
    if not row:
        raise HTTPException(404, "Category not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_by = admin.id
    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, "mart.category.update", cat_id)
    return row_to_dict(row)


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartCategory, cat_id)
    if not row:
        raise HTTPException(404, "Category not found")
    # Guard: refuse if subcategories still reference it
    sub_count = await session.scalar(select(func.count(MartSubcategory.id)).where(MartSubcategory.category_id == cat_id))
    if sub_count:
        raise HTTPException(409, f"Delete {sub_count} subcategory(ies) first")
    await session.delete(row)
    await session.commit()
    await _audit(session, admin, "mart.category.delete", cat_id)


# ============================================================================
#                           SUBCATEGORIES
# ============================================================================

class SubcategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=80)
    category_id: str
    country: str = Field(..., min_length=2, max_length=2)
    name: Optional[str] = None
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    image: Optional[str] = None
    order: int = 0
    module: str = "mart"


class SubcategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    name_en: Optional[str] = None
    name_fr: Optional[str] = None
    image: Optional[str] = None
    order: Optional[int] = None


@router.get("/subcategories")
async def list_subcategories(
    category_id: Optional[str] = None,
    country: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MartSubcategory).order_by(MartSubcategory.order, MartSubcategory.slug)
    if category_id:
        stmt = stmt.where(MartSubcategory.category_id == category_id)
    if country:
        stmt = stmt.where(MartSubcategory.country == country.upper())
    rows = (await session.execute(stmt)).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/subcategories", status_code=201)
async def create_subcategory(
    payload: SubcategoryIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    parent = await session.get(MartCategory, payload.category_id)
    if not parent:
        raise HTTPException(404, "Parent category not found")
    row = MartSubcategory(**payload.model_dump())
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "A subcategory with that slug already exists under this category")
    await session.refresh(row)
    await _audit(session, admin, "mart.subcategory.create", row.id)
    return row_to_dict(row)


@router.patch("/subcategories/{sub_id}")
async def update_subcategory(
    sub_id: str, payload: SubcategoryUpdate,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartSubcategory, sub_id)
    if not row:
        raise HTTPException(404, "Subcategory not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, "mart.subcategory.update", sub_id)
    return row_to_dict(row)


@router.delete("/subcategories/{sub_id}", status_code=204)
async def delete_subcategory(
    sub_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartSubcategory, sub_id)
    if not row:
        raise HTTPException(404, "Subcategory not found")
    await session.delete(row)
    await session.commit()
    await _audit(session, admin, "mart.subcategory.delete", sub_id)


# ============================================================================
#                           BRANDS
# ============================================================================

class BrandIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=200)
    country: str = Field(..., min_length=2, max_length=2)
    logo: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class BrandUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    logo: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/brands")
async def list_brands(
    country: Optional[str] = None,
    q: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MartBrand).order_by(MartBrand.name)
    if country:
        stmt = stmt.where(MartBrand.country == country.upper())
    if q:
        stmt = stmt.where(MartBrand.name.ilike(f"%{q}%"))
    rows = (await session.execute(stmt)).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/brands", status_code=201)
async def create_brand(
    payload: BrandIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = MartBrand(**payload.model_dump())
    session.add(row)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise HTTPException(409, "A brand with that slug already exists in this country")
    await session.refresh(row)
    await _audit(session, admin, "mart.brand.create", row.id)
    return row_to_dict(row)


@router.patch("/brands/{brand_id}")
async def update_brand(
    brand_id: str, payload: BrandUpdate,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartBrand, brand_id)
    if not row:
        raise HTTPException(404, "Brand not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, "mart.brand.update", brand_id)
    return row_to_dict(row)


@router.delete("/brands/{brand_id}", status_code=204)
async def delete_brand(
    brand_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartBrand, brand_id)
    if not row:
        raise HTTPException(404, "Brand not found")
    # Unlink from any product using it (soft cleanup)
    await session.execute(
        MartProduct.__table__.update().where(MartProduct.brand_id == brand_id).values(brand_id=None)
    )
    await session.delete(row)
    await session.commit()
    await _audit(session, admin, "mart.brand.delete", brand_id)


# ============================================================================
#                       PRODUCTS (master catalog)
# ============================================================================

class ProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=200)
    country: str = Field(..., min_length=2, max_length=2)
    module: str = "mart"
    brand: Optional[str] = None
    brand_id: Optional[str] = None
    category_slug: Optional[str] = None
    subcategory_slug: Optional[str] = None
    unit: Optional[str] = None
    price: float = Field(..., gt=0)
    was_price: Optional[float] = None
    currency: str = Field(..., min_length=3, max_length=3)
    currency_symbol: Optional[str] = None
    image: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    badge: Optional[str] = None
    in_stock: bool = True
    description: Optional[str] = None
    sku_code: Optional[str] = None
    barcode: Optional[str] = None
    variants: list = Field(default_factory=list)
    status: str = Field("active", pattern="^(active|draft|archived)$")
    # Phase 1 additions
    manufacturer: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=280)
    product_type: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    ean_upc: Optional[str] = None
    tax_hsn_code: Optional[str] = None
    batch_tracking: bool = False
    expiry_tracking: bool = False
    pack_size: Optional[str] = None
    net_qty: Optional[float] = Field(None, ge=0)
    gross_qty: Optional[float] = Field(None, ge=0)
    mrp: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    tax_pct: Optional[float] = Field(None, ge=0, le=100)
    storage_requirement: Optional[str] = None
    temperature_class: Optional[str] = Field(None, pattern="^(ambient|chilled|frozen|hot)$")


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    brand: Optional[str] = None
    brand_id: Optional[str] = None
    category_slug: Optional[str] = None
    subcategory_slug: Optional[str] = None
    unit: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    was_price: Optional[float] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    currency_symbol: Optional[str] = None
    image: Optional[str] = None
    images: Optional[list[str]] = None
    badge: Optional[str] = None
    in_stock: Optional[bool] = None
    description: Optional[str] = None
    sku_code: Optional[str] = None
    barcode: Optional[str] = None
    variants: Optional[list] = None
    status: Optional[str] = Field(None, pattern="^(active|draft|archived)$")
    manufacturer: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=280)
    product_type: Optional[str] = None
    tags: Optional[list[str]] = None
    ean_upc: Optional[str] = None
    tax_hsn_code: Optional[str] = None
    batch_tracking: Optional[bool] = None
    expiry_tracking: Optional[bool] = None
    pack_size: Optional[str] = None
    net_qty: Optional[float] = Field(None, ge=0)
    gross_qty: Optional[float] = Field(None, ge=0)
    mrp: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    tax_pct: Optional[float] = Field(None, ge=0, le=100)
    storage_requirement: Optional[str] = None
    temperature_class: Optional[str] = Field(None, pattern="^(ambient|chilled|frozen|hot)$")


@router.get("/products")
async def list_products(
    q: Optional[str] = None,
    country: Optional[str] = None,
    category: Optional[str] = None,
    brand_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MartProduct).where(MartProduct.deleted_at.is_(None))
    if country:
        stmt = stmt.where(MartProduct.country == country.upper())
    if category:
        stmt = stmt.where(MartProduct.category_slug == category)
    if brand_id:
        stmt = stmt.where(MartProduct.brand_id == brand_id)
    if status:
        stmt = stmt.where(MartProduct.status == status)
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(
            MartProduct.name.ilike(pat),
            MartProduct.brand.ilike(pat),
            MartProduct.sku_code.ilike(pat),
            MartProduct.barcode.ilike(pat),
        ))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await session.execute(stmt.order_by(MartProduct.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"items": [row_to_dict(r) for r in rows], "total": total or 0}


@router.post("/products", status_code=201)
async def create_product(
    payload: ProductIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if payload.brand_id:
        b = await session.get(MartBrand, payload.brand_id)
        if not b:
            raise HTTPException(400, "brand_id does not exist")
    row = MartProduct(**payload.model_dump(), created_by=admin.id)
    session.add(row)
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(409, f"Failed to create product: {e}")
    await session.refresh(row)
    await _audit(session, admin, "mart.product.create", row.id)
    return row_to_dict(row)


@router.patch("/products/{prod_id}")
async def update_product(
    prod_id: str, payload: ProductUpdate,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(MartProduct, prod_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "Product not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_by = admin.id
    await session.commit()
    await session.refresh(row)
    await _audit(session, admin, "mart.product.update", prod_id)
    return row_to_dict(row)


@router.delete("/products/{prod_id}", status_code=204)
async def delete_product(
    prod_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Soft-delete — sets deleted_at, preserves historical order references."""
    row = await session.get(MartProduct, prod_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "Product not found")
    row.deleted_at = datetime.now(timezone.utc)
    row.status = "archived"
    row.updated_by = admin.id
    await session.commit()
    await _audit(session, admin, "mart.product.delete", prod_id)


# ============================================================================
#                     PARTNER PRODUCT APPROVAL QUEUE
# ============================================================================

class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = Field(None, max_length=1000)


def _pp_dict(pp: PartnerProduct, partner: Optional[Partner]) -> dict:
    return {
        "id": pp.id,
        "partner_id": pp.partner_id,
        "partner_name": partner.business_name if partner else None,
        "partner_country": partner.country if partner else None,
        "source": pp.source,
        "master_product_id": pp.master_product_id,
        "name": pp.name,
        "brand": pp.brand,
        "unit": pp.unit,
        "image": pp.image,
        "category_slug": pp.category_slug,
        "subcategory_slug": pp.subcategory_slug,
        "sku_code": pp.sku_code,
        "partner_price": float(pp.partner_price),
        "currency": pp.currency,
        "stock_qty": pp.stock_qty,
        "is_active": pp.is_active,
        "approval_status": pp.approval_status,
        "review_notes": pp.review_notes,
        "submitted_at": pp.submitted_at.isoformat() if pp.submitted_at else None,
        "reviewed_at": pp.reviewed_at.isoformat() if pp.reviewed_at else None,
        "reviewed_by_admin_id": pp.reviewed_by_admin_id,
        "created_at": pp.created_at.isoformat() if pp.created_at else None,
    }


@router.get("/partner-products")
async def list_partner_products_for_review(
    status: Optional[str] = Query(None, description="pending|approved|rejected|changes_requested"),
    partner_id: Optional[str] = None,
    country: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Admin approval queue — defaults to `pending` if no filter provided."""
    stmt = select(PartnerProduct).order_by(PartnerProduct.submitted_at.desc().nulls_last(), PartnerProduct.created_at.desc())
    if status:
        stmt = stmt.where(PartnerProduct.approval_status == status)
    if partner_id:
        stmt = stmt.where(PartnerProduct.partner_id == partner_id)
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(PartnerProduct.name.ilike(pat), PartnerProduct.brand.ilike(pat), PartnerProduct.sku_code.ilike(pat)))
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()

    # Fetch partners in one hop
    partner_ids = list({r.partner_id for r in rows})
    partners: dict[str, Partner] = {}
    if partner_ids:
        prs = (await session.execute(select(Partner).where(Partner.id.in_(partner_ids)))).scalars().all()
        partners = {p.id: p for p in prs}
        if country:
            allowed = {p.id for p in prs if p.country == country.upper()}
            rows = [r for r in rows if r.partner_id in allowed]

    # Bucket counts
    buckets_stmt = (
        select(PartnerProduct.approval_status, func.count(PartnerProduct.id))
        .group_by(PartnerProduct.approval_status)
    )
    bucket_rows = (await session.execute(buckets_stmt)).all()
    buckets = {s: 0 for s in ("draft", "pending", "approved", "rejected", "changes_requested")}
    for s, c in bucket_rows:
        buckets[s] = c

    return {
        "items": [_pp_dict(r, partners.get(r.partner_id)) for r in rows],
        "buckets": buckets,
    }


async def _transition_pp(session: AsyncSession, admin: AdminUser, pp_id: str, new_status: str, notes: Optional[str]) -> dict:
    pp = await session.get(PartnerProduct, pp_id)
    if not pp:
        raise HTTPException(404, "Partner product not found")
    if pp.approval_status not in ("pending", "changes_requested", "draft"):
        raise HTTPException(409, f"Cannot transition from {pp.approval_status} → {new_status}")
    pp.approval_status = new_status
    pp.review_notes = notes
    pp.reviewed_at = datetime.now(timezone.utc)
    pp.reviewed_by_admin_id = admin.id
    if new_status == "rejected":
        pp.is_active = False
    if new_status == "approved":
        pp.is_active = True
    await session.commit()
    await session.refresh(pp)
    partner = await session.get(Partner, pp.partner_id)
    await _audit(session, admin, f"partner_product.{new_status}", pp.id)
    return _pp_dict(pp, partner)


@router.post("/partner-products/{pp_id}/approve")
async def approve_partner_product(
    pp_id: str, payload: ReviewIn = ReviewIn(),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    return await _transition_pp(session, admin, pp_id, "approved", payload.notes)


@router.post("/partner-products/{pp_id}/reject")
async def reject_partner_product(
    pp_id: str, payload: ReviewIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if not payload.notes:
        raise HTTPException(400, "Rejection notes are required")
    return await _transition_pp(session, admin, pp_id, "rejected", payload.notes)


@router.post("/partner-products/{pp_id}/request-changes")
async def request_changes_partner_product(
    pp_id: str, payload: ReviewIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    if not payload.notes:
        raise HTTPException(400, "Notes describing the requested changes are required")
    return await _transition_pp(session, admin, pp_id, "changes_requested", payload.notes)
