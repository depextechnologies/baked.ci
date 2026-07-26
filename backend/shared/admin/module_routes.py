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
from sqlalchemy import distinct, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser,
    Cart,
    CartItem,
    Country,
    Customer,
    ExpressMoversPricing,
    ExpressPricingRule,
    ExpressVehicle,
    MartProduct,
    ModuleDriver,
    ModuleVendor,
    Order,
    VendorDocument,
)
from core.serializers import customer_to_dict, row_to_dict
from .routes import get_current_admin, _audit

router = APIRouter(prefix="/admin/modules", tags=["admin-modules"])

MODULES = {"mart", "food", "shop", "express", "auto", "immo"}


def _assert_mod(code: str) -> str:
    code = code.lower()
    if code not in MODULES:
        raise HTTPException(404, "Unknown module")
    return code


async def _vendor_to_dict(session: AsyncSession, vendor: ModuleVendor) -> dict:
    docs = (
        (await session.execute(select(VendorDocument).where(VendorDocument.vendor_id == vendor.id))).scalars().all()
    )
    data = row_to_dict(vendor)
    data["documents"] = [row_to_dict(d) for d in docs]
    return data


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
async def list_vendors(
    mod: str,
    status: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    stmt = select(ModuleVendor).where(ModuleVendor.module == mod, ModuleVendor.deleted_at.is_(None))
    if status:
        if status not in VENDOR_STATUSES:
            raise HTTPException(400, f"Invalid status; expected one of {sorted(VENDOR_STATUSES)}")
        stmt = stmt.where(ModuleVendor.status == status)
    rows = (await session.execute(stmt.order_by(ModuleVendor.created_at.desc()))).scalars().all()
    return [await _vendor_to_dict(session, v) for v in rows]


@router.post("/{mod}/vendors")
async def create_vendor(
    mod: str,
    payload: VendorIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    vendor = ModuleVendor(**doc, module=mod, status="pending", created_by=admin.id)
    session.add(vendor)
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.create", vendor.id, {"name": vendor.name})
    return await _vendor_to_dict(session, vendor)


@router.patch("/{mod}/vendors/{vid}")
async def update_vendor(
    mod: str,
    vid: str,
    payload: dict,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    payload = {
        k: v for k, v in payload.items() if k not in ("id", "module", "status", "approved_at", "approved_by", "created_at")
    }
    if "country" in payload and isinstance(payload["country"], str):
        payload["country"] = payload["country"].upper()
    result = await session.execute(
        update(ModuleVendor).where(ModuleVendor.id == vid, ModuleVendor.module == mod).values(**payload)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Vendor not found")
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.update", vid)
    return await _vendor_to_dict(session, await session.get(ModuleVendor, vid))


class StatusIn(BaseModel):
    reason: Optional[str] = None


@router.post("/{mod}/vendors/{vid}/approve")
async def approve_vendor(
    mod: str,
    vid: str,
    payload: StatusIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    vendor = await session.get(ModuleVendor, vid)
    if not vendor or vendor.module != mod:
        raise HTTPException(404, "Vendor not found")
    if vendor.status not in ("pending", "rejected", "suspended"):
        raise HTTPException(400, f"Cannot approve vendor in status {vendor.status}")
    vendor.status = "approved"
    vendor.approved_at = func.now()
    vendor.approved_by = admin.id
    vendor.approval_note = payload.reason or ""
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.approve", vid, {"reason": payload.reason})
    return await _vendor_to_dict(session, vendor)


@router.post("/{mod}/vendors/{vid}/activate")
async def activate_vendor(
    mod: str, vid: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    _assert_mod(mod)
    vendor = await session.get(ModuleVendor, vid)
    if not vendor or vendor.module != mod:
        raise HTTPException(404, "Vendor not found")
    if vendor.status != "approved":
        raise HTTPException(400, f"Vendor must be approved before activation (status={vendor.status})")
    vendor.status = "active"
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.activate", vid)
    return await _vendor_to_dict(session, vendor)


@router.post("/{mod}/vendors/{vid}/reject")
async def reject_vendor(
    mod: str,
    vid: str,
    payload: StatusIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    vendor = await session.get(ModuleVendor, vid)
    if not vendor or vendor.module != mod:
        raise HTTPException(404, "Vendor not found")
    vendor.status = "rejected"
    vendor.rejection_reason = payload.reason or ""
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.reject", vid, {"reason": payload.reason})
    return await _vendor_to_dict(session, vendor)


@router.post("/{mod}/vendors/{vid}/suspend")
async def suspend_vendor(
    mod: str,
    vid: str,
    payload: StatusIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    result = await session.execute(
        update(ModuleVendor)
        .where(ModuleVendor.id == vid, ModuleVendor.module == mod)
        .values(status="suspended", suspension_reason=payload.reason or "")
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Vendor not found")
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.suspend", vid, {"reason": payload.reason})
    return await _vendor_to_dict(session, await session.get(ModuleVendor, vid))


@router.post("/{mod}/vendors/{vid}/documents")
async def add_vendor_document(
    mod: str,
    vid: str,
    payload: VendorDoc,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    vendor = await session.get(ModuleVendor, vid)
    if not vendor or vendor.module != mod:
        raise HTTPException(404, "Vendor not found")
    session.add(VendorDocument(vendor_id=vid, uploaded_by=admin.id, **payload.model_dump()))
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.document.add", vid, {"kind": payload.kind})
    return await _vendor_to_dict(session, vendor)


@router.delete("/{mod}/vendors/{vid}")
async def delete_vendor(
    mod: str, vid: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    _assert_mod(mod)
    result = await session.execute(
        update(ModuleVendor).where(ModuleVendor.id == vid, ModuleVendor.module == mod).values(deleted_at=func.now())
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Vendor not found")
    await session.commit()
    await _audit(session, admin, f"{mod}.vendor.delete", vid)
    return {"ok": True}


# ================= MODULE-SCOPED CUSTOMERS =================
@router.get("/{mod}/customers")
async def list_module_customers(
    mod: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    q: Optional[str] = None,
    limit: int = Query(200, le=500),
):
    _assert_mod(mod)
    # Customer is module-scoped if: they have >=1 order in this module, OR active cart contains items with module=mod
    ids_with_orders = (
        (
            await session.execute(
                select(distinct(Order.customer_id)).where(Order.module == mod, Order.deleted_at.is_(None))
            )
        )
        .scalars()
        .all()
    )
    ids_with_cart = (
        (
            await session.execute(
                select(distinct(Cart.customer_id))
                .join(CartItem, CartItem.cart_id == Cart.id)
                .where(Cart.status == "active", CartItem.module == mod)
            )
        )
        .scalars()
        .all()
    )
    ids = list(set(ids_with_orders) | set(ids_with_cart))
    if not ids:
        return []
    stmt = select(Customer).where(Customer.id.in_(ids))
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(Customer.phone.ilike(pat), Customer.email.ilike(pat), Customer.name.ilike(pat)))
    rows = (await session.execute(stmt.order_by(Customer.created_at.desc()).limit(limit))).scalars().all()

    out = []
    for c in rows:
        d = customer_to_dict(c)
        orders_count = (
            await session.execute(
                select(func.count()).select_from(Order).where(Order.customer_id == c.id, Order.module == mod)
            )
        ).scalar_one()
        spent_rows = (
            await session.execute(
                select(Order.currency, func.sum(Order.total).label("total"))
                .where(
                    Order.customer_id == c.id,
                    Order.module == mod,
                    Order.payment_status.in_(["succeeded", "authorized"]),
                )
                .group_by(Order.currency)
            )
        ).all()
        d["module_stats"] = {
            "orders": orders_count,
            "spent": 0.0,
            "spent_by_ccy": [{"currency": r.currency, "total": float(r.total or 0)} for r in spent_rows],
        }
        out.append(d)
    return out


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
async def list_drivers(
    mod: str,
    status: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    stmt = select(ModuleDriver).where(ModuleDriver.module == mod, ModuleDriver.deleted_at.is_(None))
    if status:
        if status not in DRIVER_STATUSES:
            raise HTTPException(400, f"Invalid status; expected one of {sorted(DRIVER_STATUSES)}")
        stmt = stmt.where(ModuleDriver.status == status)
    rows = (await session.execute(stmt.order_by(ModuleDriver.created_at.desc()))).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.post("/{mod}/drivers")
async def create_driver(
    mod: str,
    payload: DriverIn,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    doc = payload.model_dump()
    doc["country"] = doc["country"].upper()
    doc["rating"] = doc.get("rating") if doc.get("rating") is not None else 4.8
    driver = ModuleDriver(**doc, module=mod, status="pending", is_available=True, created_by=admin.id)
    session.add(driver)
    await session.commit()
    await _audit(session, admin, f"{mod}.driver.create", driver.id, {"name": driver.name})
    return row_to_dict(driver)


@router.patch("/{mod}/drivers/{did}")
async def update_driver(
    mod: str,
    did: str,
    payload: dict,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    _assert_mod(mod)
    if "status" in payload and payload["status"] not in DRIVER_STATUSES:
        raise HTTPException(400, f"Invalid status; expected one of {sorted(DRIVER_STATUSES)}")
    payload = {k: v for k, v in payload.items() if k not in ("id", "module", "created_at")}
    result = await session.execute(
        update(ModuleDriver).where(ModuleDriver.id == did, ModuleDriver.module == mod).values(**payload)
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Driver not found")
    await session.commit()
    await _audit(session, admin, f"{mod}.driver.update", did, payload)
    return row_to_dict(await session.get(ModuleDriver, did))


@router.delete("/{mod}/drivers/{did}")
async def delete_driver(
    mod: str, did: str, admin: AdminUser = Depends(get_current_admin), session: AsyncSession = Depends(get_session)
):
    _assert_mod(mod)
    result = await session.execute(
        update(ModuleDriver).where(ModuleDriver.id == did, ModuleDriver.module == mod).values(deleted_at=func.now())
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Driver not found")
    await session.commit()
    await _audit(session, admin, f"{mod}.driver.delete", did)
    return {"ok": True}


# ================= PRODUCTS (MART) =================
@router.get("/mart/products")
async def list_mart_products_admin(
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    q: Optional[str] = None,
    category: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    stmt = select(MartProduct).where(MartProduct.deleted_at.is_(None), MartProduct.module == "mart")
    if category:
        stmt = stmt.where(MartProduct.category_slug == category)
    if country:
        stmt = stmt.where(MartProduct.country == country.upper())
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(MartProduct.name.ilike(pat), MartProduct.brand.ilike(pat)))
    rows = (await session.execute(stmt.order_by(MartProduct.created_at.desc()).limit(limit))).scalars().all()
    return [row_to_dict(r) for r in rows]


# ================= ORDERS =================
@router.get("/{mod}/orders")
async def list_module_orders(
    mod: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    _assert_mod(mod)
    stmt = select(Order).where(Order.module == mod, Order.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Order.status == status)
    rows = (await session.execute(stmt.order_by(Order.created_at.desc()).limit(limit))).scalars().all()
    return [row_to_dict(r) for r in rows]


# ================= EXPRESS PRICING (Sub-feature C) =================
# Editable rules for the fully configuration-driven pricing engine.
# Two tables back this UI:
#   - express_pricing_rules   — per-vehicle per-country parcel pricing
#   - express_movers_pricing  — per-country packers & movers pricing
# Rate fields are stored as raw numbers; percentages are stored *as
# percents* (e.g. 8 = 8%), matching how pricing.py already consumes them.

PARCEL_RULE_FIELDS = {
    "base_fare", "min_fare", "price_per_km", "price_per_min", "waiting_fee",
    "peak_multiplier", "night_multiplier",
    "service_fee_pct", "insurance_pct", "insurance_min", "taxes_pct",
    "active",
}

MOVERS_RULE_FIELDS = {
    "transport_base", "price_per_km",
    "packing_per_item", "loading_unloading_base", "loading_per_item",
    "labour_per_mover", "floor_fee", "stair_fee", "toll_permits",
    "value_per_kg", "insurance_pct", "insurance_min",
    "taxes_pct", "advance_flat", "advance_pct",
    "active",
}


class PricingRulePatch(BaseModel):
    """Partial update payload for one parcel pricing rule.

    All fields optional so the admin UI can PATCH just the changed cells.
    Numeric fields validated at the boundary — invalid keys are rejected in
    the handler instead of silently ignored.
    """
    base_fare: Optional[float] = None
    min_fare: Optional[float] = None
    price_per_km: Optional[float] = None
    price_per_min: Optional[float] = None
    waiting_fee: Optional[float] = None
    peak_multiplier: Optional[float] = None
    night_multiplier: Optional[float] = None
    service_fee_pct: Optional[float] = None
    insurance_pct: Optional[float] = None
    insurance_min: Optional[float] = None
    taxes_pct: Optional[float] = None
    active: Optional[bool] = None


class MoversPricingPatch(BaseModel):
    transport_base: Optional[float] = None
    price_per_km: Optional[float] = None
    packing_per_item: Optional[float] = None
    loading_unloading_base: Optional[float] = None
    loading_per_item: Optional[float] = None
    labour_per_mover: Optional[float] = None
    floor_fee: Optional[float] = None
    stair_fee: Optional[float] = None
    toll_permits: Optional[float] = None
    value_per_kg: Optional[float] = None
    insurance_pct: Optional[float] = None
    insurance_min: Optional[float] = None
    taxes_pct: Optional[float] = None
    advance_flat: Optional[float] = None
    advance_pct: Optional[float] = None
    active: Optional[bool] = None


@router.get("/express/pricing")
async def list_express_pricing(
    country: str = Query(..., min_length=2, max_length=2),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Aggregated pricing view for one country — used by the admin table."""
    country = country.upper()
    supported = (
        await session.execute(select(Country).where(Country.code == country, Country.active.is_(True)))
    ).scalar_one_or_none()
    if not supported:
        raise HTTPException(404, "Country not active")
    parcel_rules = (
        (
            await session.execute(
                select(ExpressPricingRule)
                .where(ExpressPricingRule.country == country)
                .order_by(ExpressPricingRule.vehicle_code)
            )
        )
        .scalars()
        .all()
    )
    movers = (
        await session.execute(select(ExpressMoversPricing).where(ExpressMoversPricing.country == country))
    ).scalar_one_or_none()
    vehicles = (
        (
            await session.execute(
                select(ExpressVehicle)
                .where(ExpressVehicle.country == country, ExpressVehicle.active.is_(True))
                .order_by(ExpressVehicle.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return {
        "country": country,
        "currency": supported.currency or "XOF",
        "currency_symbol": supported.currency_symbol or "CFA",
        "vehicles": [row_to_dict(v) for v in vehicles],
        "parcel_rules": [row_to_dict(r) for r in parcel_rules],
        "movers_pricing": row_to_dict(movers) if movers else None,
    }


@router.patch("/express/pricing/{country}/{vehicle_code}")
async def update_parcel_rule(
    country: str,
    vehicle_code: str,
    payload: PricingRulePatch,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    country = country.upper()
    changes = {k: v for k, v in payload.model_dump(exclude_none=True).items() if k in PARCEL_RULE_FIELDS}
    if not changes:
        raise HTTPException(400, "No editable fields provided")
    result = await session.execute(
        update(ExpressPricingRule)
        .where(ExpressPricingRule.country == country, ExpressPricingRule.vehicle_code == vehicle_code)
        .values(**changes)
    )
    if result.rowcount == 0:
        raise HTTPException(404, f"No pricing rule for {country}/{vehicle_code}")
    await session.commit()
    await _audit(session, admin, "express.pricing.update", f"{country}:{vehicle_code}", changes)
    rule = (
        await session.execute(
            select(ExpressPricingRule).where(
                ExpressPricingRule.country == country, ExpressPricingRule.vehicle_code == vehicle_code
            )
        )
    ).scalar_one()
    return row_to_dict(rule)


@router.patch("/express/movers-pricing/{country}")
async def update_movers_rule(
    country: str,
    payload: MoversPricingPatch,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    country = country.upper()
    changes = {k: v for k, v in payload.model_dump(exclude_none=True).items() if k in MOVERS_RULE_FIELDS}
    if not changes:
        raise HTTPException(400, "No editable fields provided")
    result = await session.execute(
        update(ExpressMoversPricing).where(ExpressMoversPricing.country == country).values(**changes)
    )
    if result.rowcount == 0:
        raise HTTPException(404, f"No movers pricing for {country}")
    await session.commit()
    await _audit(session, admin, "express.movers_pricing.update", country)
    pricing = (
        await session.execute(select(ExpressMoversPricing).where(ExpressMoversPricing.country == country))
    ).scalar_one()
    return row_to_dict(pricing)
