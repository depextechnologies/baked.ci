"""MARTbakēd module — Groceries & Daily Needs.

Owns only its business logic. Reuses shared foundation (auth, config, ai).
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.db import db
from core.deps import get_current_customer
from core.models_base import _now_iso, new_id
from core.events import event_bus, Events

router = APIRouter(tags=["mart"])


# ---------- MART browse ----------
@router.get("/mart/categories")
async def list_categories(country: str = Query("CI")):
    return await db.mart_categories.find(
        {"country": country.upper(), "deleted_at": None}, {"_id": 0}
    ).sort("order", 1).to_list(100)


@router.get("/mart/products")
async def list_products(
    country: str = Query("CI"),
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query("popularity"),
    limit: int = Query(48, le=100),
):
    q: dict = {"country": country.upper(), "module": "mart", "deleted_at": None}
    if category:
        q["category_slug"] = category
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
        ]
    sort_key = {"price_asc": ("price", 1), "price_desc": ("price", -1), "newest": ("created_at", -1)}.get(
        sort, ("popularity", -1)
    )
    return await db.mart_products.find(q, {"_id": 0}).sort(*sort_key).limit(limit).to_list(limit)


@router.get("/mart/products/{product_id}")
async def get_product(product_id: str):
    product = await db.mart_products.find_one({"id": product_id, "deleted_at": None}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.get("/mart/offers")
async def list_offers(country: str = Query("CI"), limit: int = Query(12, le=48)):
    return await db.mart_offers.find(
        {"country": country.upper(), "active": True}, {"_id": 0}
    ).sort("order", 1).limit(limit).to_list(limit)


@router.get("/mart/stores")
async def list_stores(country: str = Query("CI")):
    return await db.mart_stores.find(
        {"country": country.upper(), "deleted_at": None}, {"_id": 0}
    ).to_list(50)


# ---------- Cart (shared across all business modules — module field discriminates) ----------
class CartItemIn(BaseModel):
    product_id: str
    quantity: int = Field(1, ge=1, le=99)
    module: str = "mart"


class CartItemUpdate(BaseModel):
    quantity: int = Field(..., ge=1, le=99)


async def _cart_for(customer_id: str) -> dict:
    cart = await db.carts.find_one({"customer_id": customer_id, "status": "active"}, {"_id": 0})
    if cart:
        return cart
    doc = {
        "id": new_id("cart"),
        "customer_id": customer_id,
        "items": [],
        "status": "active",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "version": 1,
    }
    await db.carts.insert_one(doc)
    return doc


async def _hydrate_cart(cart: dict) -> dict:
    subtotal = 0.0
    hydrated_items = []
    for item in cart.get("items", []):
        p = await db.mart_products.find_one({"id": item["product_id"]}, {"_id": 0})
        if not p:
            continue
        line_total = round(p["price"] * item["quantity"], 2)
        subtotal += line_total
        hydrated_items.append({
            **item,
            "product": p,
            "line_total": line_total,
        })
    return {
        **cart,
        "items": hydrated_items,
        "subtotal": round(subtotal, 2),
        "item_count": sum(i["quantity"] for i in hydrated_items),
    }


@router.get("/carts/me")
async def get_cart(customer: dict = Depends(get_current_customer)):
    cart = await _cart_for(customer["id"])
    return await _hydrate_cart(cart)


@router.post("/carts/me/items")
async def add_cart_item(payload: CartItemIn, customer: dict = Depends(get_current_customer)):
    product = await db.mart_products.find_one({"id": payload.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    cart = await _cart_for(customer["id"])
    items = cart.get("items", [])
    for i in items:
        if i["product_id"] == payload.product_id and i.get("module", "mart") == payload.module:
            i["quantity"] = min(99, i["quantity"] + payload.quantity)
            break
    else:
        items.append({
            "id": new_id("ci"),
            "product_id": payload.product_id,
            "quantity": payload.quantity,
            "module": payload.module,
            "added_at": _now_iso(),
        })
    await db.carts.update_one(
        {"id": cart["id"]}, {"$set": {"items": items, "updated_at": _now_iso()}}
    )
    await event_bus.publish(Events.CART_UPDATED, {"customer_id": customer["id"], "action": "add"})
    return await _hydrate_cart({**cart, "items": items})


@router.patch("/carts/me/items/{item_id}")
async def update_cart_item(item_id: str, payload: CartItemUpdate, customer: dict = Depends(get_current_customer)):
    cart = await _cart_for(customer["id"])
    items = cart.get("items", [])
    found = False
    for i in items:
        if i["id"] == item_id:
            i["quantity"] = payload.quantity
            found = True
            break
    if not found:
        raise HTTPException(404, "Item not found")
    await db.carts.update_one({"id": cart["id"]}, {"$set": {"items": items, "updated_at": _now_iso()}})
    return await _hydrate_cart({**cart, "items": items})


@router.delete("/carts/me/items/{item_id}")
async def delete_cart_item(item_id: str, customer: dict = Depends(get_current_customer)):
    cart = await _cart_for(customer["id"])
    items = [i for i in cart.get("items", []) if i["id"] != item_id]
    await db.carts.update_one({"id": cart["id"]}, {"$set": {"items": items, "updated_at": _now_iso()}})
    return await _hydrate_cart({**cart, "items": items})


@router.delete("/carts/me")
async def clear_cart(customer: dict = Depends(get_current_customer)):
    cart = await _cart_for(customer["id"])
    await db.carts.update_one({"id": cart["id"]}, {"$set": {"items": [], "updated_at": _now_iso()}})
    return await _hydrate_cart({**cart, "items": []})
