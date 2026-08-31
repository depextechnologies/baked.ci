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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    ShopBrand, ShopCategory, ShopProduct, ShopSubcategory, ShopVariant, Supplier,
)
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
    return [
        {
            "id": r.id, "title": r.title, "slug": r.slug,
            "brand_id": r.brand_id, "category_id": r.category_id,
            "subcategory_id": r.subcategory_id, "images": r.images or [],
            "status": r.status,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Seller portal — /api/shop/portal/* (requires the caller to have SHOP in
# their supplier.modules array). Full portal handlers land in Slice 4.
# ---------------------------------------------------------------------------
portal_router = APIRouter(prefix="/shop/portal", tags=["shop-portal"])


@portal_router.get("/health")
async def portal_health():
    """Liveness probe — Slice 4 will replace this with the portal dashboard."""
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
