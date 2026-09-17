"""SHOPbakēd — seller portal HTTP routes (Slice 4, 2026-02).

Endpoints (all require an approved supplier who has 'SHOP' in
`suppliers.modules`):
  * GET    /api/shop/portal/catalogue                        — list my SHOP products
  * POST   /api/shop/portal/products                         — create new product (draft/pending_review)
  * GET    /api/shop/portal/products/{pid}                   — fetch one (with variants)
  * PATCH  /api/shop/portal/products/{pid}                   — update parent metadata + shared attrs
  * POST   /api/shop/portal/products/{pid}/variants          — add variant
  * PATCH  /api/shop/portal/products/{pid}/variants/{vid}    — edit variant
  * DELETE /api/shop/portal/products/{pid}/variants/{vid}    — remove variant

Guardrails:
  * Supplier module gate — 403 if `SHOP` not in `supplier.modules`.
  * Ownership enforced on every product / variant fetch.
  * On create, product status defaults to `pending_review`; Slice 5 will
    add the admin approval drawer that flips it to `active`.
"""
from __future__ import annotations
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.i18n import t as _t, current_lang
from core.models import (
    ShopCategory, ShopOrder, ShopOrderItem, ShopProduct, ShopSubcategory,
    ShopVariant, Supplier, new_id,
)
from modules.shop.attributes_resolver import resolve_shop_attributes
from shared.suppliers.portal_routes import get_current_supplier


router = APIRouter(prefix="/shop/portal", tags=["shop-portal-seller"])


# ---------------------------------------------------------------------------
# Module gate — supplier must have SHOP in their `modules` array.
# ---------------------------------------------------------------------------

async def get_shop_supplier(supplier: Supplier = Depends(get_current_supplier)) -> Supplier:
    modules = supplier.modules or []
    if "SHOP" not in modules:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "shop_not_enabled",
                "message": _t("errors.shop.shop_not_enabled", current_lang()),
            },
        )
    return supplier


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------

def _variant_dict(v: ShopVariant) -> dict:
    return {
        "id": v.id, "product_id": v.product_id, "sku": v.sku,
        "title_suffix": v.title_suffix,
        "price": float(v.price) if v.price is not None else 0.0,
        "compare_at_price": float(v.compare_at_price) if v.compare_at_price is not None else None,
        "currency": v.currency, "stock_qty": v.stock_qty,
        "condition": v.condition, "attributes": v.attributes or {},
        "images": v.images or [], "is_active": v.is_active,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
    }


def _product_dict(p: ShopProduct, variants: List[ShopVariant] | None = None) -> dict:
    d = {
        "id": p.id, "title": p.title, "title_fr": p.title_fr, "slug": p.slug,
        "country": p.country, "module": p.module,
        "supplier_id": p.supplier_id, "brand_id": p.brand_id,
        "category_id": p.category_id, "subcategory_id": p.subcategory_id,
        "description": p.description, "description_fr": p.description_fr,
        "images": p.images or [],
        "attributes": p.attributes or {}, "status": p.status,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }
    if variants is not None:
        d["variants"] = [_variant_dict(v) for v in variants]
    return d


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

class ProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., min_length=2, max_length=400)
    title_fr: Optional[str] = Field(None, max_length=400)
    category_id: str = Field(..., min_length=2)
    subcategory_id: Optional[str] = None
    brand_id: Optional[str] = None
    description: Optional[str] = None
    description_fr: Optional[str] = None
    images: Optional[List[str]] = None
    attributes: Optional[dict] = None


class ProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Optional[str] = Field(None, min_length=2, max_length=400)
    title_fr: Optional[str] = Field(None, max_length=400)
    subcategory_id: Optional[str] = None
    brand_id: Optional[str] = None
    description: Optional[str] = None
    description_fr: Optional[str] = None
    images: Optional[List[str]] = None
    attributes: Optional[dict] = None


class VariantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(..., min_length=1, max_length=120)
    title_suffix: Optional[str] = Field(None, max_length=200)
    price: float = Field(..., ge=0)
    compare_at_price: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=8)
    stock_qty: int = Field(0, ge=0)
    condition: str = "new"
    attributes: Optional[dict] = None
    images: Optional[List[str]] = None


class VariantPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: Optional[str] = Field(None, min_length=1, max_length=120)
    title_suffix: Optional[str] = Field(None, max_length=200)
    price: Optional[float] = Field(None, ge=0)
    compare_at_price: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=8)
    stock_qty: Optional[int] = Field(None, ge=0)
    condition: Optional[str] = None
    attributes: Optional[dict] = None
    images: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Product-level endpoints
# ---------------------------------------------------------------------------

@router.get("/catalogue")
async def list_my_products(
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(ShopProduct)
            .where(
                ShopProduct.supplier_id == supplier.id,
                ShopProduct.deleted_at.is_(None),
            )
            .order_by(ShopProduct.created_at.desc())
        )
    ).scalars().all()
    return {"items": [_product_dict(p) for p in rows]}


async def _load_category(session: AsyncSession, category_id: str) -> ShopCategory:
    cat = await session.get(ShopCategory, category_id)
    if not cat or cat.deleted_at is not None:
        raise HTTPException(404, _t("errors.shop.category_not_found", current_lang()))
    return cat


async def _load_subcategory(session: AsyncSession, subcategory_id: str,
                            expected_category_id: str) -> ShopSubcategory:
    sub = await session.get(ShopSubcategory, subcategory_id)
    if not sub:
        raise HTTPException(404, _t("errors.shop.subcategory_not_found", current_lang()))
    if sub.category_id != expected_category_id:
        raise HTTPException(400, _t("errors.shop.subcategory_not_in_category", current_lang()))
    return sub


@router.post("/products", status_code=201)
async def create_product(
    payload: ProductIn,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    cat = await _load_category(session, payload.category_id)
    if cat.country != supplier.country:
        raise HTTPException(400, _t("errors.shop.category_country_mismatch", current_lang()))
    if payload.subcategory_id:
        await _load_subcategory(session, payload.subcategory_id, cat.id)

    prod = ShopProduct(
        id=new_id("shpprd"),
        title=payload.title,
        title_fr=payload.title_fr,
        country=supplier.country,
        module="shop",
        supplier_id=supplier.id,
        brand_id=payload.brand_id,
        category_id=payload.category_id,
        subcategory_id=payload.subcategory_id,
        description=payload.description,
        description_fr=payload.description_fr,
        images=payload.images or [],
        attributes=payload.attributes or {},
        status="pending_review",
    )
    session.add(prod)
    await session.commit()
    await session.refresh(prod)
    return _product_dict(prod, variants=[])


async def _load_owned_product(session: AsyncSession, product_id: str,
                              supplier: Supplier) -> ShopProduct:
    prod = await session.get(ShopProduct, product_id)
    if not prod or prod.deleted_at is not None:
        raise HTTPException(404, _t("errors.shop.product_not_found", current_lang()))
    if prod.supplier_id != supplier.id:
        raise HTTPException(403, _t("errors.shop.not_owner_of_product", current_lang()))
    return prod


@router.get("/products/{pid}")
async def get_product(
    pid: str,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    prod = await _load_owned_product(session, pid, supplier)
    variants = (
        await session.execute(
            select(ShopVariant).where(ShopVariant.product_id == prod.id)
            .order_by(ShopVariant.created_at)
        )
    ).scalars().all()

    # Resolved attribute schema for the seller form (Slice 4 UX).
    schema = []
    if prod.category_id:
        schema = await resolve_shop_attributes(
            session, category_id=prod.category_id,
            subcategory_id=prod.subcategory_id,
        )
    return {**_product_dict(prod, variants=list(variants)), "attribute_schema": schema}


@router.patch("/products/{pid}")
async def patch_product(
    pid: str, payload: ProductPatch,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    prod = await _load_owned_product(session, pid, supplier)
    updates = payload.model_dump(exclude_unset=True)
    if "subcategory_id" in updates and updates["subcategory_id"]:
        await _load_subcategory(session, updates["subcategory_id"], prod.category_id)
    for k, v in updates.items():
        setattr(prod, k, v)
    # Any edit re-enters review.
    if prod.status == "active":
        prod.status = "pending_review"
    await session.commit()
    await session.refresh(prod)
    return _product_dict(prod)


# ---------------------------------------------------------------------------
# Variant endpoints
# ---------------------------------------------------------------------------

@router.post("/products/{pid}/variants", status_code=201)
async def create_variant(
    pid: str, payload: VariantIn,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    prod = await _load_owned_product(session, pid, supplier)
    # SKU uniqueness within a product is enforced by the DB unique index.
    dup = (
        await session.execute(
            select(ShopVariant).where(
                ShopVariant.product_id == prod.id, ShopVariant.sku == payload.sku,
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(409, {"code": "sku_taken", "message": _t("errors.shop.sku_taken", current_lang())})
    v = ShopVariant(
        id=new_id("shpvar"),
        product_id=prod.id,
        sku=payload.sku,
        title_suffix=payload.title_suffix,
        price=payload.price,
        compare_at_price=payload.compare_at_price,
        currency=payload.currency or supplier.default_currency or "XOF",
        stock_qty=payload.stock_qty,
        condition=payload.condition or "new",
        attributes=payload.attributes or {},
        images=payload.images or [],
        is_active=True,
    )
    session.add(v)
    if prod.status == "active":
        prod.status = "pending_review"
    await session.commit()
    await session.refresh(v)
    return _variant_dict(v)


async def _load_variant(session: AsyncSession, vid: str, product_id: str) -> ShopVariant:
    v = await session.get(ShopVariant, vid)
    if not v or v.product_id != product_id:
        raise HTTPException(404, _t("errors.shop.variant_not_found", current_lang()))
    return v


@router.patch("/products/{pid}/variants/{vid}")
async def patch_variant(
    pid: str, vid: str, payload: VariantPatch,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    prod = await _load_owned_product(session, pid, supplier)
    v = await _load_variant(session, vid, prod.id)
    updates = payload.model_dump(exclude_unset=True)
    for k, val in updates.items():
        setattr(v, k, val)
    if prod.status == "active":
        prod.status = "pending_review"
    await session.commit()
    await session.refresh(v)
    return _variant_dict(v)


@router.delete("/products/{pid}/variants/{vid}", status_code=204)
async def delete_variant(
    pid: str, vid: str,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    prod = await _load_owned_product(session, pid, supplier)
    v = await _load_variant(session, vid, prod.id)
    await session.delete(v)
    if prod.status == "active":
        prod.status = "pending_review"
    await session.commit()
    return


# ---------------------------------------------------------------------------
# Seller-facing SHOP order fulfilment (Fixing_Prompt v4).
# The seller drives status paid → packing → shipped; the PIN gate blocks
# `delivered` from being set until the customer's PIN is entered at the door.
# ---------------------------------------------------------------------------

# Forward status graph the seller may traverse. `delivered` is intentionally
# NOT here — only the PIN-validated deliver endpoint can set it.
_SELLER_TRANSITIONS = {
    "paid": {"packing"},
    "packing": {"shipped"},
}


async def _order_owned_by(session: AsyncSession, order_id: str, supplier_id: str) -> Optional[ShopOrder]:
    """Return the order iff it contains at least one line owned by supplier.

    SHOP orders can technically span suppliers (marketplace). For v1 any
    supplier with a line on the order can drive the transitions — the PIN
    gate still protects final delivery.
    """
    o = await session.get(ShopOrder, order_id)
    if not o:
        return None
    row = await session.execute(
        select(ShopOrderItem.id).where(
            ShopOrderItem.order_id == o.id,
            ShopOrderItem.supplier_id == supplier_id,
        ).limit(1)
    )
    return o if row.scalar_one_or_none() else None


def _seller_order_dict(o: ShopOrder) -> dict:
    """Serialiser — never surfaces the delivery PIN to the seller/portal."""
    return {
        "id": o.id, "number": o.number, "status": o.status,
        "customer_id": o.customer_id, "country": o.country,
        "subtotal": float(o.subtotal), "delivery_fee": float(o.delivery_fee),
        "total": float(o.total), "currency": o.currency,
        "payment_status": o.payment_status, "payment_provider": o.payment_provider,
        "delivery_address": o.delivery_address, "instructions": o.instructions,
        "snapshot": o.snapshot or {},
        "placed_at": o.placed_at.isoformat() if o.placed_at else None,
        "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "delivery_pin_attempts": o.delivery_pin_attempts or 0,
    }


@router.get("/orders")
async def seller_list_shop_orders(
    status: Optional[str] = Query(None, description="Filter by order status"),
    limit: int = Query(50, ge=1, le=200),
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    """List SHOP orders that include at least one line from this supplier."""
    stmt = (
        select(ShopOrder).join(ShopOrderItem, ShopOrderItem.order_id == ShopOrder.id)
        .where(ShopOrderItem.supplier_id == supplier.id)
        .order_by(ShopOrder.created_at.desc()).limit(limit)
    )
    if status:
        stmt = stmt.where(ShopOrder.status == status)
    rows = (await session.execute(stmt)).scalars().unique().all()

    # Per-status counters for the bucket bar (matches PortalOrders MART UX).
    bucket_rows = (
        await session.execute(
            select(ShopOrder.status, func.count(ShopOrder.id.distinct()))
            .join(ShopOrderItem, ShopOrderItem.order_id == ShopOrder.id)
            .where(ShopOrderItem.supplier_id == supplier.id)
            .group_by(ShopOrder.status)
        )
    ).all()
    buckets = {s: n for s, n in bucket_rows}

    return {"items": [_seller_order_dict(o) for o in rows], "buckets": buckets}


@router.get("/orders/{order_id}")
async def seller_get_shop_order(
    order_id: str,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    o = await _order_owned_by(session, order_id, supplier.id)
    if not o:
        raise HTTPException(404, _t("errors.shop.order_not_found", current_lang()))
    items = (
        await session.execute(
            select(ShopOrderItem).where(ShopOrderItem.order_id == o.id)
            .order_by(ShopOrderItem.created_at)
        )
    ).scalars().all()
    return {
        **_seller_order_dict(o),
        "items": [
            {
                "id": it.id, "sku": it.sku, "title": it.title,
                "attributes": it.attributes or {},
                "unit_price": float(it.unit_price), "quantity": it.quantity,
                "line_total": float(it.line_total), "currency": it.currency,
                "variant_id": it.variant_id, "product_id": it.product_id,
                "supplier_id": it.supplier_id,
                "is_mine": it.supplier_id == supplier.id,
            } for it in items
        ],
    }


class _StatusPayload(BaseModel):
    status: str = Field(pattern="^(packing|shipped)$")


@router.post("/orders/{order_id}/status")
async def seller_update_shop_order_status(
    order_id: str,
    payload: _StatusPayload,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    """Seller portal — `paid → packing → shipped`. `delivered` is PIN-gated."""
    o = await _order_owned_by(session, order_id, supplier.id)
    if not o:
        raise HTTPException(404, _t("errors.shop.order_not_found", current_lang()))
    allowed = _SELLER_TRANSITIONS.get(o.status, set())
    if payload.status not in allowed:
        raise HTTPException(409, {
            "code": "invalid_transition",
            "message": _t("errors.shop.invalid_transition", current_lang(), current=o.status, target=payload.status),
            "allowed": sorted(allowed),
        })
    o.status = payload.status
    await session.commit()
    await session.refresh(o)
    return _seller_order_dict(o)


class _DeliverPayload(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


@router.post("/orders/{order_id}/deliver")
async def seller_deliver_shop_order(
    order_id: str,
    payload: _DeliverPayload,
    supplier: Supplier = Depends(get_shop_supplier),
    session: AsyncSession = Depends(get_session),
):
    """Final delivery confirmation — seller enters the customer's PIN.

    * Rate-limited to 5 wrong attempts per order.
    * Idempotent: if already delivered we return 200 without incrementing.
    * On success: order.status='delivered', delivered_at=now().
    """
    o = await _order_owned_by(session, order_id, supplier.id)
    if not o:
        raise HTTPException(404, _t("errors.shop.order_not_found", current_lang()))
    if o.status == "delivered":
        return _seller_order_dict(o)
    if o.status != "shipped":
        raise HTTPException(409, {
            "code": "invalid_transition",
            "message": _t("errors.shop.mark_shipped_first", current_lang(), current=o.status),
        })
    if (o.delivery_pin_attempts or 0) >= 5:
        raise HTTPException(429, {
            "code": "pin_locked",
            "message": _t("errors.shop.pin_locked", current_lang()),
        })
    if not o.delivery_pin or not secrets.compare_digest(payload.pin, o.delivery_pin):
        o.delivery_pin_attempts = (o.delivery_pin_attempts or 0) + 1
        await session.commit()
        remaining = max(0, 5 - o.delivery_pin_attempts)
        raise HTTPException(400, {
            "code": "wrong_pin",
            "message": _t("errors.shop.wrong_pin", current_lang()),
            "attempts_remaining": remaining,
        })
    o.status = "delivered"
    o.delivered_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(o)
    return _seller_order_dict(o)
