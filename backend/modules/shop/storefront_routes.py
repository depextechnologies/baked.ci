"""SHOPbakēd — customer storefront endpoints (Slice 6, 2026-02).

Adds:
  * `GET  /api/shop/products/{pid}`       — PDP payload (product + variants + attribute schema)
  * `GET  /api/shop/cart/me`              — hydrated SHOP items in the customer's cart
  * `POST /api/shop/cart/items`           — add a variant
  * `PATCH /api/shop/cart/items/{id}`     — update quantity
  * `DELETE /api/shop/cart/items/{id}`    — remove

Cart is auth-required (`get_current_customer`). Guest carts continue to
live in the client (Slice 6 UX prompts sign-in on add-to-cart if needed).
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import (
    Cart, Customer, ShopCartItem, ShopProduct, ShopVariant, new_id,
)
from modules.shop.attributes_resolver import resolve_shop_attributes


router = APIRouter(prefix="/shop", tags=["shop-storefront"])


# ---------------------------------------------------------------------------
# Product detail (public)
# ---------------------------------------------------------------------------

def _variant_public(v: ShopVariant) -> dict:
    return {
        "id": v.id, "sku": v.sku, "title_suffix": v.title_suffix,
        "price": float(v.price) if v.price is not None else 0.0,
        "compare_at_price": float(v.compare_at_price) if v.compare_at_price is not None else None,
        "currency": v.currency, "stock_qty": v.stock_qty,
        "condition": v.condition, "attributes": v.attributes or {},
        "images": v.images or [], "is_active": v.is_active,
    }


@router.get("/products/{pid}")
async def public_product_detail(
    pid: str,
    only_customer_visible: bool = Query(True),
    session: AsyncSession = Depends(get_session),
):
    """PDP payload — product + published variants + attribute schema.

    Only exposes products in status `active`. Variant list is filtered to
    active variants with `stock_qty >= 0` (0-stock still visible so we can
    show "out of stock" to the customer).
    """
    p = await session.get(ShopProduct, pid)
    if not p or p.deleted_at is not None or p.status != "active":
        raise HTTPException(404, "SHOP product not found")

    variants = (
        await session.execute(
            select(ShopVariant)
            .where(ShopVariant.product_id == p.id, ShopVariant.is_active.is_(True))
            .order_by(ShopVariant.price)
        )
    ).scalars().all()

    schema = []
    if p.category_id:
        schema = await resolve_shop_attributes(
            session, category_id=p.category_id, subcategory_id=p.subcategory_id,
            only_customer_visible=only_customer_visible,
        )

    price_min = min((float(v.price) for v in variants), default=None)
    price_max = max((float(v.price) for v in variants), default=None)

    return {
        "id": p.id, "title": p.title, "slug": p.slug, "country": p.country,
        "brand_id": p.brand_id, "category_id": p.category_id,
        "subcategory_id": p.subcategory_id,
        "description": p.description, "images": p.images or [],
        "attributes": p.attributes or {}, "status": p.status,
        "price_min": price_min, "price_max": price_max,
        "variants": [_variant_public(v) for v in variants],
        "attribute_schema": schema,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    }


# ---------------------------------------------------------------------------
# Cart
# ---------------------------------------------------------------------------

class CartAddIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variant_id: str = Field(..., min_length=2)
    quantity: int = Field(1, ge=1, le=99)


class CartPatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quantity: int = Field(..., ge=1, le=99)


async def _active_cart(session: AsyncSession, customer_id: str) -> Cart:
    cart = (
        await session.execute(
            select(Cart).where(Cart.customer_id == customer_id, Cart.status == "active")
        )
    ).scalar_one_or_none()
    if cart:
        return cart
    cart = Cart(id=new_id("cart"), customer_id=customer_id, status="active")
    session.add(cart)
    await session.commit()
    await session.refresh(cart)
    return cart


async def _hydrate_shop_cart(session: AsyncSession, cart: Cart) -> dict:
    items = (
        await session.execute(
            select(ShopCartItem).where(ShopCartItem.cart_id == cart.id)
            .order_by(ShopCartItem.added_at)
        )
    ).scalars().all()

    variant_ids = [it.variant_id for it in items]
    variants: dict[str, ShopVariant] = {}
    products: dict[str, ShopProduct] = {}
    if variant_ids:
        rows = (
            await session.execute(
                select(ShopVariant).where(ShopVariant.id.in_(variant_ids))
            )
        ).scalars().all()
        variants = {v.id: v for v in rows}
        pids = list({v.product_id for v in rows})
        prows = (
            await session.execute(select(ShopProduct).where(ShopProduct.id.in_(pids)))
        ).scalars().all()
        products = {p.id: p for p in prows}

    hydrated, subtotal, count = [], 0.0, 0
    for it in items:
        v = variants.get(it.variant_id)
        if not v:
            continue
        p = products.get(v.product_id)
        line_total = round(float(v.price) * it.quantity, 2)
        subtotal += line_total; count += it.quantity
        hydrated.append({
            "id": it.id, "cart_id": it.cart_id, "quantity": it.quantity,
            "added_at": it.added_at.isoformat() if it.added_at else None,
            "variant": _variant_public(v),
            "product": None if not p else {
                "id": p.id, "title": p.title, "slug": p.slug,
                "images": p.images or [], "status": p.status,
            },
            "line_total": line_total,
        })
    return {
        "cart_id": cart.id, "module": "shop", "currency": "XOF",
        "items": hydrated,
        "subtotal": round(subtotal, 2),
        "item_count": count,
    }


@router.get("/cart/me")
async def get_shop_cart(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    cart = await _active_cart(session, customer.id)
    return await _hydrate_shop_cart(session, cart)


@router.post("/cart/items", status_code=201)
async def add_shop_cart_item(
    payload: CartAddIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    v = await session.get(ShopVariant, payload.variant_id)
    if not v or not v.is_active:
        raise HTTPException(404, "Variant not found or inactive")
    # Ownership check: variant must belong to an active SHOP product.
    p = await session.get(ShopProduct, v.product_id)
    if not p or p.status != "active" or p.deleted_at is not None:
        raise HTTPException(400, "Variant's parent product is not published")

    cart = await _active_cart(session, customer.id)

    # Upsert: increment quantity if variant already in the cart.
    existing = (
        await session.execute(
            select(ShopCartItem).where(
                ShopCartItem.cart_id == cart.id,
                ShopCartItem.variant_id == payload.variant_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(ShopCartItem(
            id=new_id("shpci"),
            cart_id=cart.id, variant_id=payload.variant_id,
            quantity=payload.quantity,
        ))
    else:
        existing.quantity = min(99, existing.quantity + payload.quantity)

    await session.commit()
    return await _hydrate_shop_cart(session, cart)


@router.patch("/cart/items/{item_id}")
async def patch_shop_cart_item(
    item_id: str, payload: CartPatchIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    cart = await _active_cart(session, customer.id)
    it = await session.get(ShopCartItem, item_id)
    if not it or it.cart_id != cart.id:
        raise HTTPException(404, "Cart item not found")
    it.quantity = payload.quantity
    await session.commit()
    return await _hydrate_shop_cart(session, cart)


@router.delete("/cart/items/{item_id}", status_code=204)
async def delete_shop_cart_item(
    item_id: str,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    cart = await _active_cart(session, customer.id)
    it = await session.get(ShopCartItem, item_id)
    if not it or it.cart_id != cart.id:
        raise HTTPException(404, "Cart item not found")
    await session.delete(it)
    await session.commit()
    return
