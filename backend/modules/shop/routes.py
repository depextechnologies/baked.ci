"""SHOPbakēd — HTTP routes (Slice 1 Foundation).

Three router surfaces:
  * public_router  — /api/shop/*                    (customer storefront)
  * portal_router  — /api/shop/portal/*             (authenticated seller)
  * admin_router   — /api/admin/modules/shop/*      (super-admin governance)

All three are wired up here as bare stubs so Slice 2 (catalogue seed),
Slice 3 (dynamic attributes), Slice 4 (seller portal) and beyond can
attach handlers without server.py churn.

Isolation contract: every SHOP endpoint queries `shop_*` tables exclusively
and never reads from `mart_*`. Suppliers are shared (see `suppliers.modules`
JSONB) but their catalogue is strictly per-module.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.i18n import t as _t, current_lang
from core.models import (
    ShopBrand, ShopCategory, ShopOrder, ShopProduct, ShopSubcategory, ShopVariant, Supplier,
)
from modules.shop.attributes_resolver import resolve_shop_attributes
from shared.admin.routes import get_current_admin


# ---------------------------------------------------------------------------
# Public — customer storefront (unauthenticated for browse endpoints)
# ---------------------------------------------------------------------------
public_router = APIRouter(prefix="/shop", tags=["shop"])


@public_router.get("/health")
async def shop_health(session: AsyncSession = Depends(get_session)):
    """Liveness probe for the SHOP module.

    Verifies the shop tables are reachable and reports table cardinality —
    Slice 2 will exercise this when running the idempotent catalogue seed.
    """
    counts = {
        "brands": (await session.execute(select(func.count(ShopBrand.id)))).scalar_one(),
        "categories": (await session.execute(select(func.count(ShopCategory.id)))).scalar_one(),
        "subcategories": (await session.execute(select(func.count(ShopSubcategory.id)))).scalar_one(),
        "products": (await session.execute(select(func.count(ShopProduct.id)))).scalar_one(),
        "variants": (await session.execute(select(func.count(ShopVariant.id)))).scalar_one(),
    }
    return {"module": "shop", "status": "ok", "counts": counts}


@public_router.get("/categories")
async def shop_list_categories(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    """List active SHOP categories for a country.

    Slice 2 will populate this via the categories seed script; for now it
    just returns whatever rows the migrations left behind (empty).
    """
    rows = (
        (
            await session.execute(
                select(ShopCategory)
                .where(ShopCategory.country == country.upper(), ShopCategory.deleted_at.is_(None))
                .order_by(ShopCategory.order)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "slug": r.slug,
            "name_en": r.name_en,
            "name_fr": r.name_fr,
            "icon": r.icon,
            "image": r.image,
            "order": r.order,
        }
        for r in rows
    ]


@public_router.get("/subcategories")
async def shop_list_subcategories(
    country: str = Query("CI"),
    category: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        (
            await session.execute(
                select(ShopSubcategory)
                .join(ShopCategory, ShopCategory.id == ShopSubcategory.category_id)
                .where(
                    ShopSubcategory.country == country.upper(),
                    ShopCategory.slug == category,
                )
                .order_by(ShopSubcategory.order)
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id, "slug": r.slug, "category_id": r.category_id,
            "name_en": r.name_en, "name_fr": r.name_fr,
            "image": r.image, "order": r.order,
        }
        for r in rows
    ]


@public_router.get("/catalogue")
async def shop_catalogue_tree(country: str = Query("CI"),
                              session: AsyncSession = Depends(get_session)):
    """Full SHOP category tree (category → subcategories) in one call.

    Powers the seller-portal category picker (Slice 4) and the customer
    storefront home rail (Slice 6). Only active categories are returned;
    subcategories are ordered by their `order` column.
    """
    cats = (
        (
            await session.execute(
                select(ShopCategory)
                .where(ShopCategory.country == country.upper(),
                       ShopCategory.deleted_at.is_(None))
                .order_by(ShopCategory.order)
            )
        )
        .scalars()
        .all()
    )
    if not cats:
        return []
    cat_ids = [c.id for c in cats]
    subs = (
        (
            await session.execute(
                select(ShopSubcategory)
                .where(ShopSubcategory.category_id.in_(cat_ids))
                .order_by(ShopSubcategory.category_id, ShopSubcategory.order)
            )
        )
        .scalars()
        .all()
    )
    subs_by_cat: dict[str, list] = {}
    for s in subs:
        subs_by_cat.setdefault(s.category_id, []).append({
            "id": s.id, "slug": s.slug,
            "name_en": s.name_en, "name_fr": s.name_fr,
            "image": s.image, "order": s.order,
        })
    return [
        {
            "id": c.id, "slug": c.slug,
            "name_en": c.name_en, "name_fr": c.name_fr,
            "icon": c.icon, "image": c.image, "order": c.order,
            "subcategories": subs_by_cat.get(c.id, []),
        }
        for c in cats
    ]


@public_router.get("/categories/{category_id}/attributes")
async def shop_resolved_attributes(
    category_id: str,
    subcategory_id: Optional[str] = Query(None),
    customer_visible_only: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """Resolve SHOP attributes for (category, subcategory).

    Accepts either an id OR slug for both category_id and subcategory_id so
    the seller portal and PDP can call this with URL-friendly slugs.
    """
    cat = await session.get(ShopCategory, category_id)
    if not cat:
        cat = (
            await session.execute(
                select(ShopCategory).where(ShopCategory.slug == category_id).limit(1)
            )
        ).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, _t("errors.shop.category_not_found", current_lang()))

    sid = subcategory_id
    if sid:
        sub = await session.get(ShopSubcategory, sid)
        if not sub:
            sub = (
                await session.execute(
                    select(ShopSubcategory).where(
                        ShopSubcategory.slug == sid,
                        ShopSubcategory.category_id == cat.id,
                    ).limit(1)
                )
            ).scalar_one_or_none()
        sid = sub.id if sub else None

    resolved = await resolve_shop_attributes(
        session, category_id=cat.id, subcategory_id=sid,
        only_customer_visible=customer_visible_only,
    )
    return {
        "category": {"id": cat.id, "slug": cat.slug,
                     "name_en": cat.name_en, "name_fr": cat.name_fr},
        "subcategory_id": sid,
        "attributes": resolved,
    }


@public_router.get("/products")
async def shop_list_products(
    country: str = Query("CI"),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    limit: int = Query(24, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """List published SHOP products.

    Slice 6 will add filtering, sort, pagination and the customer-facing
    variant summary shape. For Slice 1 this just returns published rows.
    """
    q = (
        select(ShopProduct)
        .where(
            ShopProduct.country == country.upper(),
            ShopProduct.status == "active",
            ShopProduct.deleted_at.is_(None),
        )
        .order_by(ShopProduct.published_at.desc().nullslast(), ShopProduct.created_at.desc())
        .limit(limit)
    )
    if category:
        cat = (
            (await session.execute(
                select(ShopCategory.id).where(ShopCategory.slug == category,
                                              ShopCategory.country == country.upper())
            )).scalar_one_or_none()
        )
        if not cat:
            return []
        q = q.where(ShopProduct.category_id == cat)
    if subcategory:
        sub = (
            (await session.execute(
                select(ShopSubcategory.id).where(ShopSubcategory.slug == subcategory,
                                                 ShopSubcategory.country == country.upper())
            )).scalar_one_or_none()
        )
        if not sub:
            return []
        q = q.where(ShopProduct.subcategory_id == sub)
    rows = (await session.execute(q)).scalars().all()
    if not rows:
        return []
    # Load the cheapest active variant per product so the customer card can
    # show a price + one-tap add-to-cart button (MART parity).
    from core.models import ShopVariant  # local import — avoids cycle at module load
    variants_by_pid: dict[str, list] = {}
    var_rows = (await session.execute(
        select(ShopVariant)
        .where(ShopVariant.product_id.in_([r.id for r in rows]),
               ShopVariant.is_active.is_(True))
        .order_by(ShopVariant.price.asc())
    )).scalars().all()
    for v in var_rows:
        variants_by_pid.setdefault(v.product_id, []).append(v)
    out = []
    for r in rows:
        vs = variants_by_pid.get(r.id, [])
        cheapest = vs[0] if vs else None
        out.append({
            "id": r.id, "title": r.title, "slug": r.slug,
            "brand_id": r.brand_id, "category_id": r.category_id,
            "subcategory_id": r.subcategory_id, "images": r.images or [],
            "status": r.status,
            "min_price": float(cheapest.price) if cheapest else None,
            "compare_at_price": float(cheapest.compare_at_price) if cheapest and cheapest.compare_at_price else None,
            "currency": cheapest.currency if cheapest else "XOF",
            "first_variant_id": cheapest.id if cheapest else None,
            "variant_attributes": cheapest.attributes if cheapest else {},
            "variant_count": len(vs),
        })
    return out


# ---------------------------------------------------------------------------
# Seller portal — /api/shop/portal/* (requires the caller to have SHOP in
# their supplier.modules array). Real handlers live in
# `modules.shop.portal_routes` (Slice 4). The stub below stays as a
# public-ish liveness probe with the same prefix.
# ---------------------------------------------------------------------------
portal_router = APIRouter(prefix="/shop/portal", tags=["shop-portal"])


@portal_router.get("/health")
async def portal_health():
    """Liveness probe — Slice 4 exposes the real seller endpoints via
    `modules.shop.portal_routes.router`."""
    return {"module": "shop", "surface": "seller_portal", "status": "ok"}


# ---------------------------------------------------------------------------
# Admin — /api/admin/modules/shop/*
# Bare read-only stubs so Slice 5 can layer the approval drawer on top.
# ---------------------------------------------------------------------------
admin_router = APIRouter(prefix="/admin/modules/shop", tags=["admin-shop"],
                          dependencies=[Depends(get_current_admin)])


@admin_router.get("/health")
async def admin_health(session: AsyncSession = Depends(get_session)):
    """Governance liveness — reports SHOP-enabled supplier count."""
    total = (await session.execute(select(func.count(Supplier.id)))).scalar_one()
    shop_enabled = (
        await session.execute(
            select(func.count(Supplier.id)).where(Supplier.modules.contains(["SHOP"]))
        )
    ).scalar_one()
    return {
        "module": "shop", "surface": "admin",
        "suppliers_total": total, "suppliers_with_shop": shop_enabled,
    }


# ---------------------------------------------------------------------------
# SHOP Catalog Editor — Categories + Sub-categories CRUD (2026-03 Phase 2).
# Countries are scoped per request; slugs must stay unique within a country.
# Sub-category slugs are unique within their parent category (see DB uq_).
# ---------------------------------------------------------------------------
class CategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=120)
    country: str = Field(..., min_length=2, max_length=2)
    name_en: Optional[str] = Field(None, max_length=200)
    name_fr: Optional[str] = Field(None, max_length=200)
    icon: Optional[str] = Field(None, max_length=200)
    image: Optional[str] = Field(None, max_length=600)
    order: int = 0


class CategoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name_en: Optional[str] = Field(None, max_length=200)
    name_fr: Optional[str] = Field(None, max_length=200)
    icon: Optional[str] = Field(None, max_length=200)
    image: Optional[str] = Field(None, max_length=600)
    order: Optional[int] = None


class SubcategoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=120)
    category_id: str = Field(..., min_length=1)
    country: str = Field(..., min_length=2, max_length=2)
    name_en: Optional[str] = Field(None, max_length=200)
    name_fr: Optional[str] = Field(None, max_length=200)
    image: Optional[str] = Field(None, max_length=600)
    order: int = 0


class SubcategoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name_en: Optional[str] = Field(None, max_length=200)
    name_fr: Optional[str] = Field(None, max_length=200)
    image: Optional[str] = Field(None, max_length=600)
    order: Optional[int] = None


def _cat_dict(c: ShopCategory, sub_count: int = 0) -> dict:
    return {
        "id": c.id, "slug": c.slug, "country": c.country,
        "name_en": c.name_en, "name_fr": c.name_fr,
        "icon": c.icon, "image": c.image, "order": c.order,
        "subcategory_count": sub_count,
    }


def _sub_dict(s: ShopSubcategory) -> dict:
    return {
        "id": s.id, "slug": s.slug, "category_id": s.category_id,
        "country": s.country, "name_en": s.name_en, "name_fr": s.name_fr,
        "image": s.image, "order": s.order,
    }


@admin_router.get("/categories")
async def admin_list_categories(
    country: str = Query("CI"),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(ShopCategory)
            .where(ShopCategory.country == country.upper())
            .order_by(ShopCategory.order, ShopCategory.slug)
        )
    ).scalars().all()
    if not rows:
        return {"items": []}
    # Sub-count preload — one round-trip.
    ids = [r.id for r in rows]
    sc_rows = (
        await session.execute(
            select(ShopSubcategory.category_id, func.count(ShopSubcategory.id))
            .where(ShopSubcategory.category_id.in_(ids))
            .group_by(ShopSubcategory.category_id)
        )
    ).all()
    counts = {cid: n for cid, n in sc_rows}
    return {"items": [_cat_dict(r, counts.get(r.id, 0)) for r in rows]}


@admin_router.post("/categories", status_code=201)
async def admin_create_category(
    payload: CategoryIn,
    session: AsyncSession = Depends(get_session),
):
    country = payload.country.upper()
    slug = payload.slug.strip().lower()
    existing = (
        await session.execute(
            select(ShopCategory.id).where(
                ShopCategory.country == country, ShopCategory.slug == slug
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, {"code": "slug_conflict",
                                  "message": _t("errors.shop.slug_conflict", current_lang())})
    row = ShopCategory(
        slug=slug, country=country,
        name_en=payload.name_en, name_fr=payload.name_fr,
        icon=payload.icon, image=payload.image, order=payload.order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _cat_dict(row)


@admin_router.patch("/categories/{cat_id}")
async def admin_update_category(
    cat_id: str, payload: CategoryPatch,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopCategory, cat_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.category_not_found", current_lang()))
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return _cat_dict(row)


@admin_router.delete("/categories/{cat_id}", status_code=204)
async def admin_delete_category(
    cat_id: str,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopCategory, cat_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.category_not_found", current_lang()))
    # Hard-block: refuse deletion if any product still points at this category.
    used = (
        await session.execute(
            select(func.count(ShopProduct.id)).where(
                ShopProduct.category_id == cat_id, ShopProduct.deleted_at.is_(None)
            )
        )
    ).scalar_one()
    if used:
        raise HTTPException(409, {"code": "category_in_use",
                                  "message": _t("errors.shop.category_in_use", current_lang())})
    await session.delete(row)
    await session.commit()


@admin_router.get("/subcategories")
async def admin_list_subcategories(
    category_id: Optional[str] = Query(None),
    country: str = Query("CI"),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(ShopSubcategory)
        .where(ShopSubcategory.country == country.upper())
        .order_by(ShopSubcategory.order, ShopSubcategory.slug)
    )
    if category_id:
        stmt = stmt.where(ShopSubcategory.category_id == category_id)
    rows = (await session.execute(stmt)).scalars().all()
    return {"items": [_sub_dict(r) for r in rows]}


@admin_router.post("/subcategories", status_code=201)
async def admin_create_subcategory(
    payload: SubcategoryIn,
    session: AsyncSession = Depends(get_session),
):
    parent = await session.get(ShopCategory, payload.category_id)
    if not parent:
        raise HTTPException(404, _t("errors.shop.parent_category_not_found", current_lang()))
    slug = payload.slug.strip().lower()
    existing = (
        await session.execute(
            select(ShopSubcategory.id).where(
                ShopSubcategory.category_id == payload.category_id,
                ShopSubcategory.slug == slug,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, {"code": "slug_conflict",
                                  "message": _t("errors.shop.slug_conflict", current_lang())})
    row = ShopSubcategory(
        slug=slug, category_id=payload.category_id,
        country=payload.country.upper(),
        name_en=payload.name_en, name_fr=payload.name_fr,
        image=payload.image, order=payload.order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _sub_dict(row)


@admin_router.patch("/subcategories/{sub_id}")
async def admin_update_subcategory(
    sub_id: str, payload: SubcategoryPatch,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopSubcategory, sub_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.subcategory_not_found", current_lang()))
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return _sub_dict(row)


@admin_router.delete("/subcategories/{sub_id}", status_code=204)
async def admin_delete_subcategory(
    sub_id: str,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopSubcategory, sub_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.subcategory_not_found", current_lang()))
    used = (
        await session.execute(
            select(func.count(ShopProduct.id)).where(
                ShopProduct.subcategory_id == sub_id, ShopProduct.deleted_at.is_(None)
            )
        )
    ).scalar_one()
    if used:
        raise HTTPException(409, {"code": "subcategory_in_use",
                                  "message": _t("errors.shop.subcategory_in_use", current_lang())})
    await session.delete(row)
    await session.commit()


# ---------------------------------------------------------------------------
# SHOP Attribute Assignments — assign definitions (from mart_attributes with
# module="shop") to shop_categories / shop_subcategories.
# Backed by `shop_category_attributes` (see core/models/shop.py).
# ---------------------------------------------------------------------------
from core.models import ShopCategoryAttribute, MartAttribute  # noqa: E402


class ShopAssignmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attribute_id: str = Field(..., min_length=1)
    subcategory_id: Optional[str] = None
    is_required: bool = False
    customer_visible: bool = True
    supplier_editable: bool = True
    sort_order: int = 0


class ShopAssignmentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_required: Optional[bool] = None
    customer_visible: Optional[bool] = None
    supplier_editable: Optional[bool] = None
    sort_order: Optional[int] = None


def _assignment_dict(a: ShopCategoryAttribute, attr: Optional[MartAttribute] = None) -> dict:
    return {
        "id": a.id, "category_id": a.category_id, "subcategory_id": a.subcategory_id,
        "attribute_id": a.attribute_id,
        "is_required": a.is_required, "customer_visible": a.customer_visible,
        "supplier_editable": a.supplier_editable, "sort_order": a.sort_order,
        "attribute": None if not attr else {
            "id": attr.id, "key": attr.key, "name": attr.name,
            "type": attr.type, "unit": attr.unit, "module": attr.module,
        },
    }


@admin_router.get("/categories/{cat_id}/attributes")
async def admin_list_shop_assignments(
    cat_id: str,
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(ShopCategoryAttribute, MartAttribute)
            .join(MartAttribute, MartAttribute.id == ShopCategoryAttribute.attribute_id)
            .where(ShopCategoryAttribute.category_id == cat_id)
            .order_by(ShopCategoryAttribute.sort_order, MartAttribute.name)
        )
    ).all()
    return {"assignments": [_assignment_dict(a, attr) for a, attr in rows]}


@admin_router.post("/categories/{cat_id}/attributes", status_code=201)
async def admin_create_shop_assignment(
    cat_id: str, payload: ShopAssignmentIn,
    session: AsyncSession = Depends(get_session),
):
    cat = await session.get(ShopCategory, cat_id)
    if not cat:
        raise HTTPException(404, _t("errors.shop.category_not_found", current_lang()))
    attr = await session.get(MartAttribute, payload.attribute_id)
    if not attr:
        raise HTTPException(404, _t("errors.shop.attribute_not_found", current_lang()))
    if attr.module != "shop":
        raise HTTPException(400, _t("errors.shop.attribute_wrong_module", current_lang(), module=attr.module))
    if payload.subcategory_id:
        sub = await session.get(ShopSubcategory, payload.subcategory_id)
        if not sub or sub.category_id != cat_id:
            raise HTTPException(400, _t("errors.shop.sub_not_in_category", current_lang()))

    # Reject duplicate (same category+subcategory+attribute).
    dup_stmt = select(ShopCategoryAttribute.id).where(
        ShopCategoryAttribute.category_id == cat_id,
        ShopCategoryAttribute.attribute_id == payload.attribute_id,
    )
    if payload.subcategory_id is None:
        dup_stmt = dup_stmt.where(ShopCategoryAttribute.subcategory_id.is_(None))
    else:
        dup_stmt = dup_stmt.where(ShopCategoryAttribute.subcategory_id == payload.subcategory_id)
    dup = (await session.execute(dup_stmt)).scalar_one_or_none()
    if dup:
        raise HTTPException(409, {"code": "assignment_exists",
                                  "message": _t("errors.shop.assignment_exists", current_lang())})

    row = ShopCategoryAttribute(
        category_id=cat_id, subcategory_id=payload.subcategory_id,
        attribute_id=payload.attribute_id,
        is_required=payload.is_required, customer_visible=payload.customer_visible,
        supplier_editable=payload.supplier_editable, sort_order=payload.sort_order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _assignment_dict(row, attr)


@admin_router.patch("/assignments/{assignment_id}")
async def admin_update_shop_assignment(
    assignment_id: str, payload: ShopAssignmentPatch,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopCategoryAttribute, assignment_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.assignment_not_found", current_lang()))
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    attr = await session.get(MartAttribute, row.attribute_id)
    return _assignment_dict(row, attr)


@admin_router.delete("/assignments/{assignment_id}", status_code=204)
async def admin_delete_shop_assignment(
    assignment_id: str,
    session: AsyncSession = Depends(get_session),
):
    row = await session.get(ShopCategoryAttribute, assignment_id)
    if not row:
        raise HTTPException(404, _t("errors.shop.assignment_not_found", current_lang()))
    await session.delete(row)
    await session.commit()


@admin_router.get("/products")
async def admin_list_products(
    country: str = Query("CI"),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    q = (
        select(ShopProduct)
        .where(ShopProduct.country == country.upper(), ShopProduct.deleted_at.is_(None))
        .order_by(ShopProduct.created_at.desc())
        .limit(limit)
    )
    if status:
        q = q.where(ShopProduct.status == status)
    rows = (await session.execute(q)).scalars().all()
    return [
        {
            "id": r.id, "title": r.title, "supplier_id": r.supplier_id,
            "status": r.status, "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Slice 5 — SHOP product approval queue (mirrors MART product-requests)
# ---------------------------------------------------------------------------


class ApprovalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = Field(None, max_length=800)


class BulkIdsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: List[str] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=800)


def _admin_product_dict(p: ShopProduct, variant_count: int = 0) -> dict:
    return {
        "id": p.id, "title": p.title, "country": p.country,
        "supplier_id": p.supplier_id, "category_id": p.category_id,
        "subcategory_id": p.subcategory_id, "status": p.status,
        "images": p.images or [], "attributes": p.attributes or {},
        "description": p.description,
        "variant_count": variant_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    }


@admin_router.get("/product-requests")
async def admin_list_product_requests(
    bucket: str = Query("pending", pattern="^(pending|approved|rejected|all)$"),
    country: str = Query("CI"),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    """List SHOP products by review bucket.

    * `pending`   → status = pending_review
    * `approved`  → status = active
    * `rejected`  → status = rejected
    * `all`       → all buckets
    """
    q = (
        select(ShopProduct)
        .where(ShopProduct.country == country.upper(),
               ShopProduct.deleted_at.is_(None))
        .order_by(ShopProduct.created_at.desc())
        .limit(limit)
    )
    status_map = {"pending": "pending_review", "approved": "active", "rejected": "rejected"}
    if bucket != "all":
        q = q.where(ShopProduct.status == status_map[bucket])
    rows = (await session.execute(q)).scalars().all()

    # Bucket counts (unbounded — small in practice, cheap enough).
    counts_rows = (
        await session.execute(
            select(ShopProduct.status, func.count(ShopProduct.id))
            .where(ShopProduct.country == country.upper(),
                   ShopProduct.deleted_at.is_(None))
            .group_by(ShopProduct.status)
        )
    ).all()
    counts_by_status = {s: c for s, c in counts_rows}

    # Variant counts for the rows returned.
    variant_counts = {}
    if rows:
        pid_list = [r.id for r in rows]
        vrows = (
            await session.execute(
                select(ShopVariant.product_id, func.count(ShopVariant.id))
                .where(ShopVariant.product_id.in_(pid_list))
                .group_by(ShopVariant.product_id)
            )
        ).all()
        variant_counts = {pid: c for pid, c in vrows}

    return {
        "buckets": {
            "pending": counts_by_status.get("pending_review", 0),
            "approved": counts_by_status.get("active", 0),
            "rejected": counts_by_status.get("rejected", 0),
        },
        "items": [_admin_product_dict(r, variant_counts.get(r.id, 0)) for r in rows],
    }


async def _load_product_for_review(session: AsyncSession, pid: str) -> ShopProduct:
    p = await session.get(ShopProduct, pid)
    if not p or p.deleted_at is not None:
        raise HTTPException(404, _t("errors.shop.product_not_found", current_lang()))
    return p


@admin_router.get("/product-requests/{pid}")
async def admin_product_detail(
    pid: str,
    session: AsyncSession = Depends(get_session),
):
    p = await _load_product_for_review(session, pid)
    variants = (
        await session.execute(
            select(ShopVariant).where(ShopVariant.product_id == p.id)
            .order_by(ShopVariant.created_at)
        )
    ).scalars().all()
    return {
        **_admin_product_dict(p, len(variants)),
        "variants": [
            {
                "id": v.id, "sku": v.sku, "title_suffix": v.title_suffix,
                "price": float(v.price) if v.price is not None else 0.0,
                "compare_at_price": float(v.compare_at_price) if v.compare_at_price is not None else None,
                "currency": v.currency, "stock_qty": v.stock_qty,
                "condition": v.condition, "attributes": v.attributes or {},
                "images": v.images or [], "is_active": v.is_active,
            } for v in variants
        ],
    }


@admin_router.post("/product-requests/{pid}/approve")
async def admin_approve_product(
    pid: str, payload: ApprovalIn,
    session: AsyncSession = Depends(get_session),
):
    p = await _load_product_for_review(session, pid)
    if p.status not in ("pending_review", "rejected"):
        raise HTTPException(400, _t("errors.shop.cannot_approve_status", current_lang(), status=p.status))
    p.status = "active"
    if p.published_at is None:
        p.published_at = datetime.now(timezone.utc)
    await session.commit()
    return {"id": p.id, "status": p.status,
            "published_at": p.published_at.isoformat() if p.published_at else None}


@admin_router.post("/product-requests/{pid}/reject")
async def admin_reject_product(
    pid: str, payload: ApprovalIn,
    session: AsyncSession = Depends(get_session),
):
    p = await _load_product_for_review(session, pid)
    if p.status not in ("pending_review", "active"):
        raise HTTPException(400, _t("errors.shop.cannot_reject_status", current_lang(), status=p.status))
    p.status = "rejected"
    await session.commit()
    return {"id": p.id, "status": p.status}


@admin_router.post("/product-requests/bulk-approve")
async def admin_bulk_approve(
    payload: BulkIdsIn,
    session: AsyncSession = Depends(get_session),
):
    approved, blocked = [], []
    for pid in payload.ids:
        p = await session.get(ShopProduct, pid)
        if not p or p.deleted_at is not None:
            blocked.append({"id": pid, "reason": "not_found"})
            continue
        if p.status not in ("pending_review", "rejected"):
            blocked.append({"id": pid, "reason": f"bad_status:{p.status}"})
            continue
        p.status = "active"
        if p.published_at is None:
            p.published_at = datetime.now(timezone.utc)
        approved.append(pid)
    await session.commit()
    return {"approved": approved, "blocked": blocked}


@admin_router.post("/product-requests/bulk-reject")
async def admin_bulk_reject(
    payload: BulkIdsIn,
    session: AsyncSession = Depends(get_session),
):
    rejected, blocked = [], []
    for pid in payload.ids:
        p = await session.get(ShopProduct, pid)
        if not p or p.deleted_at is not None:
            blocked.append({"id": pid, "reason": "not_found"})
            continue
        if p.status not in ("pending_review", "active"):
            blocked.append({"id": pid, "reason": f"bad_status:{p.status}"})
            continue
        p.status = "rejected"
        rejected.append(pid)
    await session.commit()
    return {"rejected": rejected, "blocked": blocked}


# ---------------------------------------------------------------------------
# SA order-status override (Fixing_Prompt v4). Lets Super Admin force any
# status transition when a seller or the PIN flow gets stuck (lost PIN,
# support case). Bypasses the linear graph — audited by the caller.
# ---------------------------------------------------------------------------
class _AdminOrderStatusIn(BaseModel):
    status: str = Field(pattern="^(pending_payment|paid|packing|shipped|delivered|cancelled|refunded)$")


@admin_router.post("/orders/{order_id}/status")
async def admin_override_shop_order_status(
    order_id: str,
    payload: _AdminOrderStatusIn,
    session: AsyncSession = Depends(get_session),
):
    o = await session.get(ShopOrder, order_id)
    if not o:
        raise HTTPException(404, _t("errors.shop.order_not_found", current_lang()))
    o.status = payload.status
    if payload.status == "delivered" and o.delivered_at is None:
        o.delivered_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(o)
    return {
        "id": o.id, "number": o.number, "status": o.status,
        "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
    }
