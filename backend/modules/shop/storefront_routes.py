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
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.deps import get_current_customer
from core.i18n import t as _t, current_lang
from core.models import (
    Cart, Customer, ShopCartItem, ShopProduct, ShopVariant, new_id,
)
from core.providers.sms_provider import send_sms
from modules.shop.attributes_resolver import resolve_shop_attributes

logger = logging.getLogger("baked.shop")


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
        raise HTTPException(404, _t("errors.shop.product_not_found", current_lang()))

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
        "id": p.id, "title": p.title, "title_fr": p.title_fr,
        "slug": p.slug, "country": p.country,
        "brand_id": p.brand_id, "category_id": p.category_id,
        "subcategory_id": p.subcategory_id,
        "description": p.description, "description_fr": p.description_fr,
        "images": p.images or [],
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
                "id": p.id, "title": p.title, "title_fr": p.title_fr, "slug": p.slug,
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
        raise HTTPException(404, _t("errors.shop.variant_inactive", current_lang()))
    # Ownership check: variant must belong to an active SHOP product.
    p = await session.get(ShopProduct, v.product_id)
    if not p or p.status != "active" or p.deleted_at is not None:
        raise HTTPException(400, _t("errors.shop.product_not_published", current_lang()))

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
        raise HTTPException(404, _t("errors.shop.cart_item_not_found", current_lang()))
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
        raise HTTPException(404, _t("errors.shop.cart_item_not_found", current_lang()))
    await session.delete(it)
    await session.commit()
    return


# ---------------------------------------------------------------------------
# Checkout snapshot (Slice 8 primitive) — freezes the current cart state
# so downstream flows (Stripe intent, delivery quote, receipt PDF) work off
# a stable payload. Slice 9 will consume this and mint a real Order.
# ---------------------------------------------------------------------------

@router.post("/cart/checkout-snapshot")
async def shop_checkout_snapshot(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    cart = await _active_cart(session, customer.id)
    hydrated = await _hydrate_shop_cart(session, cart)
    if not hydrated["items"]:
        raise HTTPException(400, {"code": "empty_cart", "message": _t("errors.shop.cart_empty", current_lang())})
    # Aggregate line details for the snapshot — everything downstream needs
    # is baked in here so no extra lookups are required to render a receipt.
    lines = [
        {
            "sku": it["variant"]["sku"], "quantity": it["quantity"],
            "unit_price": it["variant"]["price"],
            "currency": it["variant"]["currency"],
            "line_total": it["line_total"],
            "product_id": it["product"]["id"] if it["product"] else None,
            "product_title": it["product"]["title"] if it["product"] else None,
            "variant_id": it["variant"]["id"],
            "attributes": it["variant"]["attributes"] or {},
        }
        for it in hydrated["items"]
    ]
    return {
        "cart_id": cart.id,
        "customer_id": customer.id,
        "module": "shop",
        "currency": hydrated["currency"],
        "subtotal": hydrated["subtotal"],
        "item_count": hydrated["item_count"],
        "line_count": len(lines),
        "lines": lines,
    }

# ---------------------------------------------------------------------------
# Checkout engine (Slice 9) — consume the snapshot, mint per-module orders,
# deduct stock, clear the cart. Foundation for Phase 8 Stripe integration.
# ---------------------------------------------------------------------------

from datetime import datetime, timezone
from core.models import ShopOrder, ShopOrderItem


class CheckoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_method: str = Field("cash_on_delivery", pattern="^(cash_on_delivery|stripe|wallet)$")
    delivery_address: Optional[dict] = None
    instructions: Optional[str] = Field(None, max_length=400)


async def _next_shop_order_number(session: AsyncSession) -> str:
    """SHOP-CI-YYYY-NNNNN — monotonically increasing within a year.

    Guarded by the UNIQUE index on `number`; on race, the DB rejects and
    we bubble a 409 up so the client can retry (Slice 9 clients are
    non-concurrent so the naive count-based approach is fine).
    """
    year = datetime.now(timezone.utc).year
    prefix = f"SHOP-CI-{year}-"
    count = (
        await session.execute(
            select(func.count(ShopOrder.id)).where(ShopOrder.number.like(f"{prefix}%"))
        )
    ).scalar_one()
    return f"{prefix}{count + 1:05d}"


@router.post("/checkout", status_code=201)
async def shop_checkout(
    payload: CheckoutIn,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    """Consume the current SHOP cart → mint one ShopOrder + N line items.

    Contract:
      * Snapshot is generated inline (same shape as /cart/checkout-snapshot).
      * Every variant's stock_qty is deducted atomically; insufficient stock
        aborts the whole checkout with 409.
      * SHOP cart items are cleared on success.
      * Cash-on-delivery orders land in `paid` status immediately for MVP
        (no Stripe wiring yet); other methods land `pending_payment`.
    """
    cart = await _active_cart(session, customer.id)
    hydrated = await _hydrate_shop_cart(session, cart)
    if not hydrated["items"]:
        raise HTTPException(400, {"code": "empty_cart", "message": _t("errors.shop.cart_empty", current_lang())})

    # Stock check + reservation.
    variant_rows = (
        await session.execute(
            select(ShopVariant).where(
                ShopVariant.id.in_([it["variant"]["id"] for it in hydrated["items"]])
            )
        )
    ).scalars().all()
    variants_by_id = {v.id: v for v in variant_rows}
    for it in hydrated["items"]:
        v = variants_by_id.get(it["variant"]["id"])
        if not v or not v.is_active:
            raise HTTPException(409, {
                "code": "variant_unavailable",
                "message": _t("errors.shop.variant_unavailable", current_lang(), sku=it['variant']['sku']),
            })
        if v.stock_qty < it["quantity"]:
            raise HTTPException(409, {
                "code": "insufficient_stock",
                "message": _t("errors.shop.only_left_in_stock", current_lang(), n=v.stock_qty, sku=v.sku),
            })

    # Build order + items.
    product_rows = (
        await session.execute(
            select(ShopProduct).where(
                ShopProduct.id.in_([v.product_id for v in variant_rows])
            )
        )
    ).scalars().all()
    products_by_id = {p.id: p for p in product_rows}

    number = await _next_shop_order_number(session)
    now = datetime.now(timezone.utc)
    is_cod = payload.payment_method == "cash_on_delivery"
    # Delivery PIN — cryptographically random 6 digits shared with the
    # CUSTOMER only. Delivery person enters it at handoff to move the
    # order to `delivered` (see POST /shop/orders/{id}/deliver).
    delivery_pin = f"{secrets.randbelow(1_000_000):06d}"

    order = ShopOrder(
        id=new_id("shpord"), number=number,
        customer_id=customer.id, country="CI", module="shop",
        status="paid" if is_cod else "pending_payment",
        subtotal=hydrated["subtotal"],
        delivery_fee=0,
        total=hydrated["subtotal"],
        currency=hydrated["currency"],
        payment_status="paid" if is_cod else "pending",
        payment_provider=payload.payment_method,
        delivery_pin=delivery_pin,
        snapshot={
            "cart_id": cart.id, "module": "shop",
            "subtotal": hydrated["subtotal"], "item_count": hydrated["item_count"],
            "currency": hydrated["currency"],
            "lines": [
                {
                    "sku": it["variant"]["sku"], "quantity": it["quantity"],
                    "unit_price": it["variant"]["price"],
                    "line_total": it["line_total"],
                    "variant_id": it["variant"]["id"],
                    "attributes": it["variant"]["attributes"] or {},
                    "product_title": it["product"]["title"] if it["product"] else None,
                } for it in hydrated["items"]
            ],
        },
        delivery_address=payload.delivery_address,
        instructions=payload.instructions,
        placed_at=now,
    )
    session.add(order)

    for it in hydrated["items"]:
        v = variants_by_id[it["variant"]["id"]]
        p = products_by_id[v.product_id]
        session.add(ShopOrderItem(
            id=new_id("shpoi"), order_id=order.id,
            variant_id=v.id, product_id=p.id, supplier_id=p.supplier_id,
            sku=v.sku, title=p.title, attributes=v.attributes or {},
            unit_price=float(v.price), quantity=it["quantity"],
            line_total=it["line_total"], currency=hydrated["currency"],
        ))
        # Deduct stock.
        v.stock_qty = v.stock_qty - it["quantity"]

    # Clear the cart items (parent cart row survives for MART use).
    for it in hydrated["items"]:
        db_it = await session.get(ShopCartItem, it["id"])
        if db_it:
            await session.delete(db_it)

    await session.commit()
    await session.refresh(order)

    # Fire-and-forget PIN SMS. `send_sms` swallows errors and returns a
    # status dict — the checkout response must NEVER fail because Twilio
    # hiccupped. The PIN also stays visible in the customer's order pages
    # (/shop/orders/{id}) so SMS is a nice-to-have, not the source of truth.
    sms_status = {"attempted": False}
    if customer.phone:
        try:
            body = (
                f"BAKĒD SHOP · Order {order.number}\n"
                f"Your delivery PIN is {delivery_pin}\n"
                f"Share it with the delivery person at the door. Do not share otherwise."
            )
            sms_status = await send_sms(customer.phone, body, tag="shop_delivery_pin")
            sms_status["attempted"] = True
        except Exception as e:  # noqa: BLE001
            logger.exception("shop.checkout.sms_failed order=%s err=%s", order.id, e)
            sms_status = {"attempted": True, "delivered": False, "error": str(e)}

    payload_out = _order_dict(order, expose_pin=True)
    payload_out["delivery_pin_sms"] = {
        "attempted": sms_status.get("attempted", False),
        "delivered": bool(sms_status.get("delivered")),
        "channel": sms_status.get("channel"),
        # Never leak the PIN body via SMS status in production; the dev
        # provider echoes it back so tests can assert.
        "phone": customer.phone,
    }
    return payload_out


def _order_dict(o: ShopOrder, *, expose_pin: bool = False) -> dict:
    d = {
        "id": o.id, "number": o.number,
        "customer_id": o.customer_id, "country": o.country, "module": o.module,
        "status": o.status, "subtotal": float(o.subtotal),
        "delivery_fee": float(o.delivery_fee), "total": float(o.total),
        "currency": o.currency,
        "payment_status": o.payment_status, "payment_provider": o.payment_provider,
        "payment_provider_ref": o.payment_provider_ref,
        "snapshot": o.snapshot or {},
        "delivery_address": o.delivery_address,
        "instructions": o.instructions,
        "placed_at": o.placed_at.isoformat() if o.placed_at else None,
        "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }
    if expose_pin:
        # Only surface the delivery PIN in the CUSTOMER's own responses.
        # Sellers / drivers never receive it — they must enter it manually.
        d["delivery_pin"] = o.delivery_pin
    return d


@router.get("/orders/me")
async def list_my_shop_orders(
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(ShopOrder).where(ShopOrder.customer_id == customer.id)
            .order_by(ShopOrder.created_at.desc())
        )
    ).scalars().all()
    return {"items": [_order_dict(o, expose_pin=True) for o in rows]}


@router.get("/orders/{order_id}")
async def get_my_shop_order(
    order_id: str,
    customer: Customer = Depends(get_current_customer),
    session: AsyncSession = Depends(get_session),
):
    o = await session.get(ShopOrder, order_id)
    if not o or o.customer_id != customer.id:
        raise HTTPException(404, _t("errors.shop.order_not_found", current_lang()))
    items = (
        await session.execute(
            select(ShopOrderItem).where(ShopOrderItem.order_id == o.id)
            .order_by(ShopOrderItem.created_at)
        )
    ).scalars().all()
    return {
        **_order_dict(o, expose_pin=True),
        "items": [
            {
                "id": it.id, "sku": it.sku, "title": it.title,
                "attributes": it.attributes or {},
                "unit_price": float(it.unit_price), "quantity": it.quantity,
                "line_total": float(it.line_total), "currency": it.currency,
                "variant_id": it.variant_id, "product_id": it.product_id,
            } for it in items
        ],
    }


# ---------------------------------------------------------------------------
# Delivery lifecycle (Fixing_Prompt v4)
#
# Status graph (linear):
#   pending_payment → paid → packing → shipped → delivered
#                                                  ▲
#                                     PIN validated here only
#
# Actors:
#   * Seller/Supplier: paid → packing → shipped   (portal_routes.py)
#   * Seller/Supplier: shipped → delivered        (portal_routes.py — PIN gate)
#   * Super Admin: override any transition        (routes.py admin_router)
#
# The customer receives their PIN via GET /shop/orders/me + /shop/orders/{id}
# and reads it aloud at the door. See `expose_pin` in `_order_dict`.
# ---------------------------------------------------------------------------

