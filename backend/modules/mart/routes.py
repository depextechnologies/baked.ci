"""MARTbakēd module — Groceries & Daily Needs.

Owns only its business logic. Reuses shared foundation (auth, config, ai).
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.models import Cart, CartItem, Customer, MartCategory, MartOffer, MartProduct, MartStore, MartSubcategory
from core.serializers import row_to_dict
from core.events import event_bus, Events

router = APIRouter(tags=["mart"])


# ---------- MART browse ----------
@router.get("/mart/categories")
async def list_categories(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(MartCategory)
                .where(MartCategory.country == country.upper(), MartCategory.deleted_at.is_(None))
                .order_by(MartCategory.order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/mart/subcategories")
async def list_subcategories(
    country: str = Query("CI"), category: str = Query(...), session: AsyncSession = Depends(get_session)
):
    # `MartSubcategory` links to its parent by `category_id`, not by a
    # denormalised slug — we join through `MartCategory` and filter on the
    # parent slug the caller sent (`?category=fruits-vegetables`).
    rows = (
        (
            await session.execute(
                select(MartSubcategory)
                .join(MartCategory, MartCategory.id == MartSubcategory.category_id)
                .where(
                    MartSubcategory.country == country.upper(),
                    MartCategory.slug == category,
                )
                .order_by(MartSubcategory.order)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/mart/products")
async def list_products(
    country: str = Query("CI"),
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query("popularity"),
    limit: int = Query(48, le=100),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(MartProduct).where(
        MartProduct.country == country.upper(), MartProduct.module == "mart", MartProduct.deleted_at.is_(None)
    )
    if category:
        stmt = stmt.where(MartProduct.category_slug == category)
    if subcategory:
        stmt = stmt.where(MartProduct.subcategory_slug == subcategory)
    if search:
        pat = f"%{search}%"
        stmt = stmt.where(or_(MartProduct.name.ilike(pat), MartProduct.brand.ilike(pat)))
    sort_col = {
        "price_asc": MartProduct.price.asc(),
        "price_desc": MartProduct.price.desc(),
        "newest": MartProduct.created_at.desc(),
    }.get(sort, MartProduct.popularity.desc())
    rows = (await session.execute(stmt.order_by(sort_col).limit(limit))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.get("/mart/products/{product_id}")
async def get_product(product_id: str, session: AsyncSession = Depends(get_session)):
    product = await session.get(MartProduct, product_id)
    if not product or product.deleted_at is not None:
        raise HTTPException(404, "Product not found")
    return row_to_dict(product)


@router.get("/mart/offers")
async def list_offers(
    country: str = Query("CI"), limit: int = Query(12, le=48), session: AsyncSession = Depends(get_session)
):
    rows = (
        (
            await session.execute(
                select(MartOffer)
                .where(MartOffer.country == country.upper(), MartOffer.active.is_(True))
                .order_by(MartOffer.order)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


@router.get("/mart/stores")
async def list_stores(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(MartStore).where(MartStore.country == country.upper(), MartStore.deleted_at.is_(None))
            )
        )
        .scalars()
        .all()
    )
    return [row_to_dict(r) for r in rows]


# ---------- Cart (shared across all business modules — module field discriminates) ----------
class CartItemIn(BaseModel):
    product_id: str
    quantity: int = Field(1, ge=1, le=99)
    module: str = "mart"


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=1, le=99)


async def _cart_for(session: AsyncSession, customer_id: str) -> Cart:
    cart = (
        await session.execute(select(Cart).where(Cart.customer_id == customer_id, Cart.status == "active"))
    ).scalar_one_or_none()
    if cart:
        return cart
    cart = Cart(customer_id=customer_id, status="active")
    session.add(cart)
    await session.commit()
    return cart


async def _hydrate_cart(session: AsyncSession, cart: Cart) -> dict:
    items = (await session.execute(select(CartItem).where(CartItem.cart_id == cart.id))).scalars().all()
    subtotal = 0.0
    hydrated_items = []
    for item in items:
        p = await session.get(MartProduct, item.product_id)
        if not p:
            continue
        line_total = round(float(p.price) * item.quantity, 2)
        subtotal += line_total
        hydrated_items.append({
            **row_to_dict(item),
            "product": row_to_dict(p),
            "line_total": line_total,
        })
    data = row_to_dict(cart)
    data["items"] = hydrated_items
    data["subtotal"] = round(subtotal, 2)
    data["item_count"] = sum(i["quantity"] for i in hydrated_items)
    return data


@router.get("/carts/me")
async def get_cart(customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)):
    cart = await _cart_for(session, customer.id)
    return await _hydrate_cart(session, cart)


@router.post("/carts/me/items")
async def add_cart_item(
    payload: CartItemIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    product = await session.get(MartProduct, payload.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    cart = await _cart_for(session, customer.id)
    stmt = pg_insert(CartItem).values(
        cart_id=cart.id, product_id=payload.product_id, quantity=payload.quantity, module=payload.module
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["cart_id", "product_id", "module"],
        set_={"quantity": func.least(99, CartItem.quantity + stmt.excluded.quantity)},
    )
    await session.execute(stmt)
    await session.commit()
    await event_bus.publish(Events.CART_UPDATED, {"customer_id": customer.id, "action": "add"})
    return await _hydrate_cart(session, cart)


@router.patch("/carts/me/items/{item_id}")
async def update_cart_item(
    item_id: str,
    payload: CartItemUpdate,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    cart = await _cart_for(session, customer.id)
    item = await session.get(CartItem, item_id)
    if not item or item.cart_id != cart.id:
        raise HTTPException(404, "Item not found")
    item.quantity = payload.quantity
    await session.commit()
    return await _hydrate_cart(session, cart)


@router.delete("/carts/me/items/{item_id}")
async def delete_cart_item(
    item_id: str, customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    cart = await _cart_for(session, customer.id)
    await session.execute(delete(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart.id))
    await session.commit()
    return await _hydrate_cart(session, cart)


@router.delete("/carts/me")
async def clear_cart(
    customer: Customer = Depends(get_current_customer), session: AsyncSession = Depends(get_session)
):
    cart = await _cart_for(session, customer.id)
    await session.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    await session.commit()
    return await _hydrate_cart(session, cart)
