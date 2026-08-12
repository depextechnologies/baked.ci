"""Super Admin — Inventory Control Tower.

Network-wide inventory command centre. Aggregates real data across every
active dark store. Backed by `partner_inventory` + `partner_products` +
`partner_stock_movements`.

Routes (all under /admin/inventory):

  GET  /kpis                 — network-wide KPIs
  GET  /overview             — SKU list with per-SKU network totals
  GET  /skus/{ppid}          — SKU detail: partner + per-warehouse split
  GET  /stores               — every dark store with rolled-up totals
  GET  /stores/{store_id}    — one dark store's inventory
  GET  /low-stock            — cross-store low-stock command centre
  GET  /out-of-stock         — cross-store OOS command centre
  GET  /movements            — every network movement (paginated)
"""
from __future__ import annotations
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser,
    MartProduct,
    Partner,
    PartnerInventory,
    PartnerProduct,
    PartnerStockMovement,
    Warehouse,
)
from .routes import get_current_admin


router = APIRouter(prefix="/admin/inventory", tags=["admin-inventory-control-tower"])


# ============================================================================
#                                KPIs
# ============================================================================

@router.get("/kpis")
async def network_kpis(
    country: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Fast aggregated snapshot of every dark-store inventory row."""
    stmt = select(
        func.count(PartnerInventory.id),
        func.coalesce(func.sum(PartnerInventory.available_qty), 0),
        func.coalesce(func.sum(PartnerInventory.reserved_qty),  0),
        func.coalesce(func.sum(PartnerInventory.damaged_qty),   0),
        func.coalesce(func.sum(PartnerInventory.expired_qty),   0),
    )
    if country:
        stmt = stmt.join(Partner, Partner.id == PartnerInventory.partner_id).where(Partner.country == country.upper())
    total_skus, available, reserved, damaged, expired = (await session.execute(stmt)).one()

    # Low / OOS counts
    low_stmt = select(func.count(PartnerInventory.id)).where(
        PartnerInventory.available_qty <= PartnerInventory.low_stock_threshold,
        PartnerInventory.available_qty > 0,
    )
    oos_stmt = select(func.count(PartnerInventory.id)).where(PartnerInventory.available_qty == 0)
    if country:
        low_stmt = low_stmt.join(Partner, Partner.id == PartnerInventory.partner_id).where(Partner.country == country.upper())
        oos_stmt = oos_stmt.join(Partner, Partner.id == PartnerInventory.partner_id).where(Partner.country == country.upper())
    low_count = (await session.execute(low_stmt)).scalar_one()
    oos_count = (await session.execute(oos_stmt)).scalar_one()

    # Active SKUs: partner_products.approval_status=approved & is_active
    active_stmt = select(func.count(PartnerProduct.id)).where(
        PartnerProduct.approval_status == "approved", PartnerProduct.is_active.is_(True),
    )
    if country:
        active_stmt = active_stmt.join(Partner, Partner.id == PartnerProduct.partner_id).where(Partner.country == country.upper())
    active_skus = (await session.execute(active_stmt)).scalar_one()

    # Store count
    stores_stmt = select(func.count(Warehouse.id))
    store_count = (await session.execute(stores_stmt)).scalar_one() or 0

    # Rough inventory value: sum(available_qty × partner_price) using a join.
    value_stmt = select(func.coalesce(
        func.sum(PartnerProduct.partner_price * PartnerInventory.available_qty), 0
    )).select_from(PartnerInventory).join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
    if country:
        value_stmt = value_stmt.join(Partner, Partner.id == PartnerInventory.partner_id).where(Partner.country == country.upper())
    inventory_value = (await session.execute(value_stmt)).scalar_one() or Decimal("0")

    # Pending product approvals (governance metric)
    pend_stmt = select(func.count(PartnerProduct.id)).where(PartnerProduct.approval_status == "pending")
    if country:
        pend_stmt = pend_stmt.join(Partner, Partner.id == PartnerProduct.partner_id).where(Partner.country == country.upper())
    pending_approvals = (await session.execute(pend_stmt)).scalar_one()

    return {
        "total_skus":       total_skus,
        "active_skus":      active_skus,
        "total_units":      int(available) + int(reserved),
        "available_units":  int(available),
        "reserved_units":   int(reserved),
        "damaged_units":    int(damaged),
        "expired_units":    int(expired),
        "low_stock_skus":   low_count,
        "out_of_stock_skus": oos_count,
        "inventory_value":  float(inventory_value),
        "stores":           store_count,
        "pending_approvals": pending_approvals,
    }


# ============================================================================
#                           INVENTORY OVERVIEW
# ============================================================================

@router.get("/overview")
async def network_overview(
    q: Optional[str] = None,
    country: Optional[str] = None,
    store_id: Optional[str] = None,
    stock_status: Optional[str] = Query(None, description="healthy|low|out_of_stock"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Every SKU aggregated across the whole network. Rows show per-SKU totals."""
    # Coalesce name from master product for source=master
    stmt = (
        select(
            func.coalesce(PartnerProduct.name, MartProduct.name).label("name"),
            func.coalesce(PartnerProduct.brand, MartProduct.brand).label("brand"),
            func.coalesce(PartnerProduct.sku_code, MartProduct.sku_code).label("sku_code"),
            func.coalesce(PartnerProduct.image, MartProduct.image).label("image"),
            func.coalesce(PartnerProduct.unit, MartProduct.unit).label("unit"),
            PartnerProduct.currency,
            PartnerProduct.master_product_id,
            func.string_agg(PartnerProduct.id, ',').label("pp_ids"),
            func.coalesce(func.sum(PartnerInventory.available_qty), 0).label("available"),
            func.coalesce(func.sum(PartnerInventory.reserved_qty),  0).label("reserved"),
            func.coalesce(func.sum(PartnerInventory.damaged_qty),   0).label("damaged"),
            func.coalesce(func.sum(PartnerInventory.expired_qty),   0).label("expired"),
            func.count(PartnerInventory.id).label("store_count"),
        )
        .select_from(PartnerProduct)
        .join(PartnerInventory, PartnerInventory.partner_product_id == PartnerProduct.id)
        .join(Partner, Partner.id == PartnerProduct.partner_id)
        .join(Warehouse, Warehouse.id == PartnerInventory.warehouse_id)
        .outerjoin(MartProduct, MartProduct.id == PartnerProduct.master_product_id)
        .group_by(
            func.coalesce(PartnerProduct.name, MartProduct.name),
            func.coalesce(PartnerProduct.brand, MartProduct.brand),
            func.coalesce(PartnerProduct.sku_code, MartProduct.sku_code),
            func.coalesce(PartnerProduct.image, MartProduct.image),
            func.coalesce(PartnerProduct.unit, MartProduct.unit),
            PartnerProduct.currency,
            PartnerProduct.master_product_id,
        )
    )
    if country:
        stmt = stmt.where(Partner.country == country.upper())
    if store_id:
        stmt = stmt.where(Warehouse.id == store_id)
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(
            PartnerProduct.name.ilike(pat),
            PartnerProduct.brand.ilike(pat),
            PartnerProduct.sku_code.ilike(pat),
        ))
    stmt = stmt.order_by(func.coalesce(PartnerProduct.name, MartProduct.name)).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()

    items = []
    for r in rows:
        available = int(r.available)
        # Approx stock-status flag using aggregated numbers.
        status = "healthy" if available > 0 else "out_of_stock"
        if r.store_count and available > 0 and available <= (5 * r.store_count):
            status = "low"
        if stock_status and status != stock_status:
            continue
        items.append({
            "name": r.name,
            "brand": r.brand,
            "sku_code": r.sku_code,
            "image": r.image,
            "unit": r.unit,
            "currency": r.currency,
            "master_product_id": r.master_product_id,
            "sample_partner_product_id": (r.pp_ids or "").split(",")[0] if r.pp_ids else None,
            "store_count": r.store_count,
            "network_available": available,
            "network_reserved":  int(r.reserved),
            "network_damaged":   int(r.damaged),
            "network_expired":   int(r.expired),
            "network_total":     available + int(r.reserved),
            "stock_status":      status,
        })
    return {"items": items, "count": len(items)}


# ============================================================================
#                           SKU DETAIL DRILLDOWN
# ============================================================================

@router.get("/skus/{partner_product_id}")
async def sku_detail(
    partner_product_id: str,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """One SKU's per-store distribution."""
    pp = await session.get(PartnerProduct, partner_product_id)
    if not pp:
        raise HTTPException(404, "Product not found")

    # Gather every partner_product with the same master_product_id (or same custom name+brand if no master)
    if pp.master_product_id:
        peers = (await session.execute(
            select(PartnerProduct).where(PartnerProduct.master_product_id == pp.master_product_id)
        )).scalars().all()
    else:
        peers = (await session.execute(
            select(PartnerProduct).where(
                PartnerProduct.name == pp.name, PartnerProduct.brand == pp.brand
            )
        )).scalars().all()

    peer_ids = [p.id for p in peers]
    partner_ids = list({p.partner_id for p in peers})
    partners = {p.id: p for p in (await session.execute(select(Partner).where(Partner.id.in_(partner_ids)))).scalars().all()}

    inv_rows = (await session.execute(
        select(PartnerInventory, Warehouse)
        .join(Warehouse, Warehouse.id == PartnerInventory.warehouse_id)
        .where(PartnerInventory.partner_product_id.in_(peer_ids))
    )).all()

    # Distribution rows
    distribution = []
    total_available = total_reserved = total_damaged = total_expired = 0
    for inv, wh in inv_rows:
        pp_row = next((p for p in peers if p.id == inv.partner_product_id), None)
        partner = partners.get(pp_row.partner_id) if pp_row else None
        status = "healthy" if inv.available_qty > inv.low_stock_threshold else \
                 "out_of_stock" if inv.available_qty == 0 else "low"
        distribution.append({
            "partner_product_id": inv.partner_product_id,
            "partner_id":   inv.partner_id,
            "partner_name": partner.business_name if partner else None,
            "country":      partner.country if partner else None,
            "warehouse_id": inv.warehouse_id,
            "warehouse_code": wh.code,
            "warehouse_name": wh.name,
            "city":         wh.city,
            "available_qty": inv.available_qty,
            "reserved_qty":  inv.reserved_qty,
            "damaged_qty":   inv.damaged_qty,
            "expired_qty":   inv.expired_qty,
            "low_stock_threshold": inv.low_stock_threshold,
            "status": status,
        })
        total_available += inv.available_qty
        total_reserved  += inv.reserved_qty
        total_damaged   += inv.damaged_qty
        total_expired   += inv.expired_qty

    distribution.sort(key=lambda d: (d["country"] or "", d["warehouse_code"] or ""))

    # Also resolve master product name if applicable
    master = None
    if pp.master_product_id:
        m = await session.get(MartProduct, pp.master_product_id)
        if m:
            master = {"id": m.id, "name": m.name, "brand": m.brand, "sku_code": m.sku_code, "barcode": m.barcode, "image": m.image}

    return {
        "product": {
            "id": pp.id,
            "name": (master["name"] if master else pp.name),
            "brand": pp.brand,
            "sku_code": pp.sku_code,
            "unit": pp.unit,
            "image": pp.image,
            "master": master,
            "source": pp.source,
            "approval_status": pp.approval_status,
        },
        "network_totals": {
            "available": total_available,
            "reserved":  total_reserved,
            "damaged":   total_damaged,
            "expired":   total_expired,
            "on_hand":   total_available + total_reserved,
            "stores":    len(distribution),
        },
        "distribution": distribution,
    }


# ============================================================================
#                        STORE INVENTORY VIEWS
# ============================================================================

@router.get("/stores")
async def list_stores_with_totals(
    country: Optional[str] = None,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    """Every dark store with rolled-up inventory totals."""
    stmt = (
        select(
            Warehouse.id, Warehouse.code, Warehouse.name, Warehouse.city, Warehouse.status,
            Partner.id.label("partner_id"), Partner.business_name, Partner.country,
            func.count(PartnerInventory.id).label("sku_count"),
            func.coalesce(func.sum(PartnerInventory.available_qty), 0).label("available"),
            func.coalesce(func.sum(PartnerInventory.reserved_qty),  0).label("reserved"),
            func.coalesce(func.sum(PartnerInventory.damaged_qty),   0).label("damaged"),
            func.coalesce(func.sum(PartnerInventory.expired_qty),   0).label("expired"),
        )
        .join(Partner, Partner.id == Warehouse.partner_id)
        .outerjoin(PartnerInventory, PartnerInventory.warehouse_id == Warehouse.id)
        .group_by(Warehouse.id, Partner.id)
        .order_by(Partner.country, Warehouse.code)
    )
    if country:
        stmt = stmt.where(Partner.country == country.upper())
    rows = (await session.execute(stmt)).all()
    items = []
    for r in rows:
        # low / oos per store
        low_stmt = select(func.count(PartnerInventory.id)).where(
            PartnerInventory.warehouse_id == r.id,
            PartnerInventory.available_qty <= PartnerInventory.low_stock_threshold,
            PartnerInventory.available_qty > 0,
        )
        oos_stmt = select(func.count(PartnerInventory.id)).where(
            PartnerInventory.warehouse_id == r.id, PartnerInventory.available_qty == 0
        )
        low = (await session.execute(low_stmt)).scalar_one()
        oos = (await session.execute(oos_stmt)).scalar_one()
        items.append({
            "warehouse_id": r.id, "warehouse_code": r.code, "warehouse_name": r.name,
            "city": r.city, "status": r.status,
            "partner_id": r.partner_id, "partner_name": r.business_name, "country": r.country,
            "sku_count": r.sku_count, "available": int(r.available), "reserved": int(r.reserved),
            "damaged": int(r.damaged), "expired": int(r.expired),
            "low_stock": low, "out_of_stock": oos,
            "total_units": int(r.available) + int(r.reserved),
        })
    return {"items": items}


@router.get("/stores/{warehouse_id}")
async def store_inventory(
    warehouse_id: str,
    q: Optional[str] = None,
    stock_status: Optional[str] = None,
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    wh = await session.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(404, "Warehouse not found")
    partner = await session.get(Partner, wh.partner_id)

    stmt = (
        select(PartnerInventory, PartnerProduct)
        .join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
        .where(PartnerInventory.warehouse_id == warehouse_id)
    )
    if q:
        pat = f"%{q}%"
        stmt = stmt.where(or_(
            PartnerProduct.name.ilike(pat), PartnerProduct.brand.ilike(pat), PartnerProduct.sku_code.ilike(pat)
        ))
    stmt = stmt.order_by(PartnerInventory.available_qty).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()

    items = []
    totals = {"available": 0, "reserved": 0, "damaged": 0, "expired": 0, "low": 0, "oos": 0}
    for inv, pp in rows:
        status = "healthy" if inv.available_qty > inv.low_stock_threshold else \
                 "out_of_stock" if inv.available_qty == 0 else "low"
        if stock_status and status != stock_status:
            continue
        totals["available"] += inv.available_qty
        totals["reserved"]  += inv.reserved_qty
        totals["damaged"]   += inv.damaged_qty
        totals["expired"]   += inv.expired_qty
        if status == "low": totals["low"] += 1
        if status == "out_of_stock": totals["oos"] += 1
        items.append({
            "partner_product_id": pp.id,
            "name": pp.name,  "brand": pp.brand,  "sku_code": pp.sku_code,
            "unit": pp.unit,  "image": pp.image,  "currency": pp.currency,
            "partner_price": float(pp.partner_price),
            "available_qty": inv.available_qty,
            "reserved_qty":  inv.reserved_qty,
            "damaged_qty":   inv.damaged_qty,
            "expired_qty":   inv.expired_qty,
            "low_stock_threshold": inv.low_stock_threshold,
            "status": status,
        })

    return {
        "warehouse": {
            "id": wh.id, "code": wh.code, "name": wh.name, "city": wh.city,
            "status": wh.status, "partner_id": wh.partner_id,
            "partner_name": partner.business_name if partner else None,
            "country": partner.country if partner else None,
        },
        "items": items,
        "totals": totals,
    }


# ============================================================================
#                    LOW STOCK / OUT OF STOCK CENTRES
# ============================================================================

async def _lowlist(session, country, mode, limit, offset):
    stmt = (
        select(PartnerInventory, PartnerProduct, Warehouse, Partner)
        .join(PartnerProduct, PartnerProduct.id == PartnerInventory.partner_product_id)
        .join(Warehouse, Warehouse.id == PartnerInventory.warehouse_id)
        .join(Partner, Partner.id == PartnerInventory.partner_id)
    )
    if country:
        stmt = stmt.where(Partner.country == country.upper())
    if mode == "low":
        stmt = stmt.where(
            PartnerInventory.available_qty <= PartnerInventory.low_stock_threshold,
            PartnerInventory.available_qty > 0,
        )
    else:
        stmt = stmt.where(PartnerInventory.available_qty == 0)
    stmt = stmt.order_by(PartnerInventory.available_qty).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    return [{
        "partner_product_id": pp.id,
        "product_name": pp.name, "brand": pp.brand, "sku_code": pp.sku_code, "unit": pp.unit,
        "image": pp.image,
        "warehouse_id": wh.id, "warehouse_code": wh.code, "warehouse_name": wh.name,
        "partner_id": partner.id, "partner_name": partner.business_name, "country": partner.country,
        "available_qty": inv.available_qty, "reserved_qty": inv.reserved_qty,
        "low_stock_threshold": inv.low_stock_threshold,
        "recommended_replenishment": max(0, (inv.low_stock_threshold * 3) - inv.available_qty),
    } for inv, pp, wh, partner in rows]


@router.get("/low-stock")
async def low_stock_centre(
    country: Optional[str] = None,
    limit: int = Query(200, le=500), offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    return {"items": await _lowlist(session, country, "low", limit, offset)}


@router.get("/out-of-stock")
async def oos_centre(
    country: Optional[str] = None,
    limit: int = Query(200, le=500), offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    return {"items": await _lowlist(session, country, "oos", limit, offset)}


# ============================================================================
#                        NETWORK MOVEMENT LEDGER
# ============================================================================

@router.get("/movements")
async def network_movements(
    partner_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    kind: Optional[str] = None,
    limit: int = Query(100, le=500), offset: int = Query(0, ge=0),
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(PartnerStockMovement, PartnerProduct, Warehouse, Partner, MartProduct)
        .join(PartnerProduct, PartnerProduct.id == PartnerStockMovement.partner_product_id)
        .join(Warehouse, Warehouse.id == PartnerStockMovement.warehouse_id)
        .join(Partner, Partner.id == PartnerStockMovement.partner_id)
        .outerjoin(MartProduct, MartProduct.id == PartnerProduct.master_product_id)
        .order_by(PartnerStockMovement.created_at.desc())
    )
    if partner_id:   stmt = stmt.where(PartnerStockMovement.partner_id == partner_id)
    if warehouse_id: stmt = stmt.where(PartnerStockMovement.warehouse_id == warehouse_id)
    if kind:         stmt = stmt.where(PartnerStockMovement.kind == kind)
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    return {"items": [{
        "id": mv.id, "kind": mv.kind, "delta_qty": mv.delta_qty, "balance_after": mv.balance_after,
        "reason": mv.reason, "reference": mv.reference,
        "product_name": pp.name or (mp.name if mp else None) or "Untitled",
        "sku_code": pp.sku_code or (mp.sku_code if mp else None),
        "warehouse_code": wh.code, "warehouse_name": wh.name,
        "partner_name": partner.business_name, "country": partner.country,
        "actor_id": mv.actor_id, "actor_role": mv.actor_role,
        "created_at": mv.created_at.isoformat() if mv.created_at else None,
    } for mv, pp, wh, partner, mp in rows]}
