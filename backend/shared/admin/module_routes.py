"""Module-scoped Admin routes.

Per PRD §7 (Module-First Administration): each business module owns its
customers, vendors, drivers, products & orders admin. Platform Governance
does not manage these entities directly.

Endpoints (all require admin/super_admin):
- Vendors (Partner Stores):
    GET    /admin/modules/{mod}/vendors[?status=]
    POST   /admin/modules/{mod}/vendors
    PATCH  /admin/modules/{mod}/vendors/{vid}
    POST   /admin/modules/{mod}/vendors/{vid}/approve
    POST   /admin/modules/{mod}/vendors/{vid}/reject
    POST   /admin/modules/{mod}/vendors/{vid}/documents
- Customers (module-scoped: ≥1 order OR active cart with items in this module):
    GET    /admin/modules/{mod}/customers[?q=]
- Drivers:
    GET    /admin/modules/{mod}/drivers
    POST   /admin/modules/{mod}/drivers
    PATCH  /admin/modules/{mod}/drivers/{did}
- Products (MART):
    GET    /admin/modules/mart/products[?q=&limit=]
- Orders:
    GET    /admin/modules/{mod}/orders[?limit=]
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, EmailStr

from core.db import db
from core.models_base import _now_iso, new_id
from .routes import get_current_admin, _audit

router = APIRouter(prefix="/admin/modules", tags=["admin-modules"])

MODULES = {"mart", "food", "shop", "express", "auto", "immo"}


def _assert_mod(code: str) -> str:
    code = code.lower()
    if code not in MODULES:
        raise HTTPException(404, "Unknown module")
    return code


# ================= VENDORS (Partner Stores) =================
VENDOR_STATUSES = {"pending", "approved", "active", "rejected", "suspended"}


class VendorDoc(BaseModel):
    kind: str  # license, tax_id, id_card, other
    label: str
    url: str = ""
    note: str = ""


class VendorIn(BaseModel):
    name: str
    contact_name: str = ""
    contact_email: Optional[EmailStr] = None
    contact_phone: str = ""
    country: str = "CI"
    city: str = ""
    address: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    commission_pct: float = Field(15.0, ge=0, le=100)
    notes: str = ""


@router.get("/{mod}/vendors")
async def list_vendors(mod: str, status: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    q: dict = {"module": mod, "deleted_at": None}
    if status:
        if status not in VENDOR_STATUSES:
            raise HTTPException(400, f"Invalid status; expected one of {sorted(VENDOR_STATUSES)}")
        q["status"] = status
    return await db.module_vendors.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/{mod}/vendors")
async def create_vendor(mod: str, payload: VendorIn, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    doc.update({
        "id": new_id("ven"),
        "module": mod,
        "status": "pending",
        "documents": [],
        "approved_at": None,
        "approved_by": None,
        "created_by": admin["id"],
        "deleted_at": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "version": 1,
    })
    await db.module_vendors.insert_one(doc)
    doc.pop("_id", None)
    await _audit(admin, f"{mod}.vendor.create", doc["id"], {"name": doc["name"]})
    return doc


@router.patch("/{mod}/vendors/{vid}")
async def update_vendor(mod: str, vid: str, payload: dict, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    payload = {k: v for k, v in payload.items() if k not in ("id", "module", "status", "approved_at", "approved_by", "created_at")}
    if "country" in payload and isinstance(payload["country"], str):
        payload["country"] = payload["country"].upper()
    payload["updated_at"] = _now_iso()
    r = await db.module_vendors.update_one({"id": vid, "module": mod}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    await _audit(admin, f"{mod}.vendor.update", vid)
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


class StatusIn(BaseModel):
    reason: Optional[str] = None


@router.post("/{mod}/vendors/{vid}/approve")
async def approve_vendor(mod: str, vid: str, payload: StatusIn, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    vendor = await db.module_vendors.find_one({"id": vid, "module": mod}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if vendor["status"] not in ("pending", "rejected", "suspended"):
        raise HTTPException(400, f"Cannot approve vendor in status {vendor['status']}")
    updates = {
        "status": "approved",
        "approved_at": _now_iso(),
        "approved_by": admin["id"],
        "approval_note": payload.reason or "",
        "updated_at": _now_iso(),
    }
    await db.module_vendors.update_one({"id": vid}, {"$set": updates})
    await _audit(admin, f"{mod}.vendor.approve", vid, {"reason": payload.reason})
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


@router.post("/{mod}/vendors/{vid}/activate")
async def activate_vendor(mod: str, vid: str, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    vendor = await db.module_vendors.find_one({"id": vid, "module": mod}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if vendor["status"] != "approved":
        raise HTTPException(400, f"Vendor must be approved before activation (status={vendor['status']})")
    await db.module_vendors.update_one({"id": vid}, {"$set": {"status": "active", "updated_at": _now_iso()}})
    await _audit(admin, f"{mod}.vendor.activate", vid)
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


@router.post("/{mod}/vendors/{vid}/reject")
async def reject_vendor(mod: str, vid: str, payload: StatusIn, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    vendor = await db.module_vendors.find_one({"id": vid, "module": mod}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    await db.module_vendors.update_one({"id": vid}, {"$set": {"status": "rejected", "rejection_reason": payload.reason or "", "updated_at": _now_iso()}})
    await _audit(admin, f"{mod}.vendor.reject", vid, {"reason": payload.reason})
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


@router.post("/{mod}/vendors/{vid}/suspend")
async def suspend_vendor(mod: str, vid: str, payload: StatusIn, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    r = await db.module_vendors.update_one({"id": vid, "module": mod}, {"$set": {"status": "suspended", "suspension_reason": payload.reason or "", "updated_at": _now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    await _audit(admin, f"{mod}.vendor.suspend", vid, {"reason": payload.reason})
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


@router.post("/{mod}/vendors/{vid}/documents")
async def add_vendor_document(mod: str, vid: str, payload: VendorDoc, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    vendor = await db.module_vendors.find_one({"id": vid, "module": mod}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    doc = payload.model_dump()
    doc.update({"id": new_id("doc"), "uploaded_by": admin["id"], "uploaded_at": _now_iso()})
    docs = vendor.get("documents", []) + [doc]
    await db.module_vendors.update_one({"id": vid}, {"$set": {"documents": docs, "updated_at": _now_iso()}})
    await _audit(admin, f"{mod}.vendor.document.add", vid, {"kind": payload.kind})
    return await db.module_vendors.find_one({"id": vid}, {"_id": 0})


@router.delete("/{mod}/vendors/{vid}")
async def delete_vendor(mod: str, vid: str, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    r = await db.module_vendors.update_one({"id": vid, "module": mod}, {"$set": {"deleted_at": _now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    await _audit(admin, f"{mod}.vendor.delete", vid)
    return {"ok": True}


# ================= MODULE-SCOPED CUSTOMERS =================
@router.get("/{mod}/customers")
async def list_module_customers(mod: str, admin: dict = Depends(get_current_admin), q: Optional[str] = None, limit: int = Query(200, le=500)):
    _assert_mod(mod)
    # Customer is module-scoped if: they have ≥1 order in this module, OR active cart contains items with module=mod
    ids_with_orders = await db.orders.distinct("customer_id", {"module": mod, "deleted_at": {"$in": [None, ""]}})
    ids_with_cart = await db.carts.distinct(
        "customer_id",
        {"status": "active", "items": {"$elemMatch": {"module": mod}}},
    )
    ids = list(set(ids_with_orders + ids_with_cart))
    if not ids:
        return []
    query: dict = {"id": {"$in": ids}}
    if q:
        query["$or"] = [
            {"phone": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    # Enrich each customer with module-scoped stats
    for c in customers:
        c["module_stats"] = {
            "orders": await db.orders.count_documents({"customer_id": c["id"], "module": mod}),
            "spent": 0.0,
        }
        pipeline = [
            {"$match": {"customer_id": c["id"], "module": mod, "payment_status": {"$in": ["succeeded", "authorized"]}}},
            {"$group": {"_id": "$currency", "total": {"$sum": "$total"}}},
        ]
        c["module_stats"]["spent_by_ccy"] = [
            {"currency": r["_id"], "total": r["total"]} async for r in db.orders.aggregate(pipeline)
        ]
    return customers


# ================= DRIVERS =================
class DriverIn(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    country: str = "CI"
    city: str = ""
    vehicle_type: str = Field("bike", pattern="^(bike|scooter|three_wheeler|mini_truck|truck|car|van)$")
    vehicle_reg: str = ""
    license_number: str = ""
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    rating: Optional[float] = None
    photo_url: Optional[str] = None


DRIVER_STATUSES = {"pending", "active", "inactive", "suspended"}


@router.get("/{mod}/drivers")
async def list_drivers(mod: str, status: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    q: dict = {"module": mod, "deleted_at": None}
    if status:
        if status not in DRIVER_STATUSES:
            raise HTTPException(400, f"Invalid status; expected one of {sorted(DRIVER_STATUSES)}")
        q["status"] = status
    return await db.module_drivers.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/{mod}/drivers")
async def create_driver(mod: str, payload: DriverIn, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    doc.update({
        "id": new_id("drv"),
        "module": mod,
        "status": "pending",
        "is_available": True,
        "active_booking_id": None,
        "rating": doc.get("rating") if doc.get("rating") is not None else 4.8,
        "created_by": admin["id"],
        "deleted_at": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "version": 1,
    })
    await db.module_drivers.insert_one(doc)
    doc.pop("_id", None)
    await _audit(admin, f"{mod}.driver.create", doc["id"], {"name": doc["name"]})
    return doc


@router.patch("/{mod}/drivers/{did}")
async def update_driver(mod: str, did: str, payload: dict, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    if "status" in payload and payload["status"] not in DRIVER_STATUSES:
        raise HTTPException(400, f"Invalid status; expected one of {sorted(DRIVER_STATUSES)}")
    payload = {k: v for k, v in payload.items() if k not in ("id", "module", "created_at")}
    payload["updated_at"] = _now_iso()
    r = await db.module_drivers.update_one({"id": did, "module": mod}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "Driver not found")
    await _audit(admin, f"{mod}.driver.update", did, payload)
    return await db.module_drivers.find_one({"id": did}, {"_id": 0})


@router.delete("/{mod}/drivers/{did}")
async def delete_driver(mod: str, did: str, admin: dict = Depends(get_current_admin)):
    _assert_mod(mod)
    r = await db.module_drivers.update_one({"id": did, "module": mod}, {"$set": {"deleted_at": _now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Driver not found")
    await _audit(admin, f"{mod}.driver.delete", did)
    return {"ok": True}


# ================= PRODUCTS (MART) =================
@router.get("/mart/products")
async def list_mart_products_admin(admin: dict = Depends(get_current_admin), q: Optional[str] = None, category: Optional[str] = None, country: Optional[str] = None, limit: int = Query(100, le=500)):
    query: dict = {"deleted_at": None, "module": "mart"}
    if category:
        query["category_slug"] = category
    if country:
        query["country"] = country.upper()
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
        ]
    return await db.mart_products.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


# ================= ORDERS =================
@router.get("/{mod}/orders")
async def list_module_orders(mod: str, admin: dict = Depends(get_current_admin), status: Optional[str] = None, limit: int = Query(100, le=500)):
    _assert_mod(mod)
    q: dict = {"module": mod, "deleted_at": None}
    if status:
        q["status"] = status
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
