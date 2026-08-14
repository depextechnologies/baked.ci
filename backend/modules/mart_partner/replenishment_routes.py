"""Partner-scoped replenishment view + PO conversion (Phase 4b).

Partners see their own admin-generated replenishment suggestions and can
one-click convert selected rows into draft POs (grouped by primary supplier).

  * GET  /api/partner/replenishments
  * POST /api/partner/replenishments/convert-to-draft-po

Governance rules (enforced here + in the ORM constraint):
  - Only `suggested` rows are convertible.
  - A row that already carries a non-cancelled `converted_po_id` is a
    duplicate — return it in `skipped` with reason "already_converted".
  - Rows without a matching approved SupplierProduct in the same country as
    the warehouse are returned in `skipped` with reason "no_supplier".
  - Successful rows flip to `status="converted_to_po"` and store `converted_po_id`.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    MartProduct, Partner, PartnerProduct, PartnerReplenishment,
    PurchaseOrder, PurchaseOrderAudit, PurchaseOrderLine, Supplier,
    SupplierProduct, Warehouse,
)
from modules.mart_partner.staff_routes import (
    PartnerActor, get_partner_actor, require_role,
)
from shared.purchase_orders.routes import (
    _actor_label, _next_po_code, _recompute_totals,
)


router = APIRouter(prefix="/partner/replenishments", tags=["partner-replenishment"])


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def _sug_dict(
    r: PartnerReplenishment,
    product: Optional[PartnerProduct],
    warehouse: Optional[Warehouse],
    master: Optional[MartProduct],
    supplier: Optional[Supplier],
    supplier_product: Optional[SupplierProduct],
) -> dict:
    """Serialize a suggestion row with everything the UI needs to render its
    supplier badge + primary conversion metadata."""
    name = (product.name if product else None) or (master.name if master else "Untitled")
    return {
        "id": r.id,
        "status": r.status,
        "source": r.source,
        "reason": r.reason,
        "notes": r.notes,
        "current_qty": r.current_qty,
        "low_stock_threshold": r.low_stock_threshold,
        "suggested_qty": r.suggested_qty,
        "converted_po_id": r.converted_po_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "product": {
            "id": product.id if product else None,
            "name": name,
            "brand": product.brand if product else None,
            "unit": product.unit if product else None,
            "sku_code": (product.sku_code if product else None) or (master.sku_code if master else None),
            "image": product.image if product else None,
            "master_product_id": product.master_product_id if product else None,
        },
        "warehouse": {
            "id": warehouse.id, "code": warehouse.code,
            "name": warehouse.name, "city": warehouse.city,
        } if warehouse else None,
        "primary_supplier": {
            "id": supplier.id,
            "code": supplier.code,
            "business_name": supplier.business_name,
            "currency": supplier.default_currency,
            "unit_cost": float(supplier_product.cost_price),
            "supplier_sku": supplier_product.supplier_sku,
            "supplier_product_id": supplier_product.id,
        } if (supplier and supplier_product) else None,
    }


async def _resolve_primary_supplier(
    session: AsyncSession, master_id: Optional[str], country: str,
) -> tuple[Optional[Supplier], Optional[SupplierProduct]]:
    """Deterministic primary-supplier picker.

    Rules: same country as warehouse, supplier status `approved`, supplier_product
    `is_active`. Tie-break by lowest cost_price then supplier code.
    """
    if not master_id:
        return None, None
    rows = (await session.execute(
        select(SupplierProduct, Supplier)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .where(
            SupplierProduct.master_product_id == master_id,
            SupplierProduct.is_active.is_(True),
            Supplier.status == "approved",
            Supplier.country == country,
        )
    )).all()
    if not rows:
        return None, None
    rows.sort(key=lambda t: (float(t[0].cost_price), t[1].code or ""))
    sp, sup = rows[0]
    return sup, sp


@router.get("")
async def list_partner_replenishments(
    status: Optional[str] = Query(None),
    warehouse_id: Optional[str] = None,
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
    actor: PartnerActor = Depends(get_partner_actor),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(PartnerReplenishment)
        .where(PartnerReplenishment.partner_id == actor.partner_id)
        .order_by(PartnerReplenishment.created_at.desc())
    )
    if status:
        stmt = stmt.where(PartnerReplenishment.status == status)
    if warehouse_id:
        stmt = stmt.where(PartnerReplenishment.warehouse_id == warehouse_id)
    # Staff scoped to a store see only their store
    if actor.actor_kind == "staff" and actor.store_id:
        stmt = stmt.where(PartnerReplenishment.warehouse_id == actor.store_id)
    stmt = stmt.limit(limit).offset(offset)

    rows = (await session.execute(stmt)).scalars().all()
    if not rows:
        return {"items": [], "buckets": {"suggested": 0, "converted_to_po": 0, "cancelled": 0}}

    # Bucket counts (fresh query so filters don't distort the tabs)
    bucket_stmt = (
        select(PartnerReplenishment.status, PartnerReplenishment.id)
        .where(PartnerReplenishment.partner_id == actor.partner_id)
    )
    if actor.actor_kind == "staff" and actor.store_id:
        bucket_stmt = bucket_stmt.where(PartnerReplenishment.warehouse_id == actor.store_id)
    bucket_rows = (await session.execute(bucket_stmt)).all()
    buckets: dict[str, int] = {}
    for st, _ in bucket_rows:
        buckets[st] = buckets.get(st, 0) + 1

    # Hydrate references in bulk
    pp_ids = list({r.partner_product_id for r in rows})
    wh_ids = list({r.warehouse_id for r in rows})
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(pp_ids)))).scalars().all()}
    whs = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))).scalars().all()}
    master_ids = list({p.master_product_id for p in prods.values() if p.master_product_id})
    masters = {m.id: m for m in (await session.execute(select(MartProduct).where(MartProduct.id.in_(master_ids)))).scalars().all()} if master_ids else {}

    items: list[dict] = []
    for r in rows:
        p = prods.get(r.partner_product_id)
        master = masters.get(p.master_product_id) if (p and p.master_product_id) else None
        wh = whs.get(r.warehouse_id)
        supplier, sp = (None, None)
        if wh:
            supplier, sp = await _resolve_primary_supplier(
                session, p.master_product_id if p else None, wh.country,
            )
        items.append(_sug_dict(r, p, wh, master, supplier, sp))

    return {"items": items, "buckets": buckets}


# ---------------------------------------------------------------------------
# Convert to Draft POs
# ---------------------------------------------------------------------------

class ConvertIn(BaseModel):
    suggestion_ids: List[str] = Field(..., min_length=1, max_length=200)


@router.post("/convert-to-draft-po", status_code=201)
async def convert_to_draft_po(
    payload: ConvertIn,
    session: AsyncSession = Depends(get_session),
    actor: PartnerActor = Depends(require_role("owner", "manager")),
):
    """Groups the requested suggestion ids by (warehouse, supplier) and
    creates one draft PO per group.

    Returns:
        {
          "created_pos": [{ "po_id", "po_code", "supplier": {...},
                            "warehouse": {...}, "line_count", "suggestion_ids": [...] }, ...],
          "skipped":     [{ "suggestion_id", "reason", "detail?" }, ...]
        }
    """
    # Fetch and pre-validate suggestions (must belong to this partner)
    rows = (await session.execute(
        select(PartnerReplenishment).where(
            PartnerReplenishment.id.in_(payload.suggestion_ids),
            PartnerReplenishment.partner_id == actor.partner_id,
        )
    )).scalars().all()
    found_ids = {r.id for r in rows}
    skipped: list[dict] = [
        {"suggestion_id": sid, "reason": "not_found"}
        for sid in payload.suggestion_ids if sid not in found_ids
    ]

    # Staff scoped to a store cannot convert suggestions from another store
    if actor.actor_kind == "staff" and actor.store_id:
        for r in list(rows):
            if r.warehouse_id != actor.store_id:
                rows.remove(r)
                skipped.append({"suggestion_id": r.id, "reason": "wrong_store"})

    # Hydrate references
    pp_ids = list({r.partner_product_id for r in rows})
    wh_ids = list({r.warehouse_id for r in rows})
    prods = {p.id: p for p in (await session.execute(select(PartnerProduct).where(PartnerProduct.id.in_(pp_ids)))).scalars().all()}
    whs = {w.id: w for w in (await session.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))).scalars().all()}
    master_ids = list({p.master_product_id for p in prods.values() if p.master_product_id})
    masters = {m.id: m for m in (await session.execute(select(MartProduct).where(MartProduct.id.in_(master_ids)))).scalars().all()} if master_ids else {}

    # Group into (warehouse_id, supplier_id) -> list of (row, product, sp, master)
    groups: dict[tuple[str, str], dict] = {}
    for r in rows:
        # 1) Guard duplicates first
        if r.converted_po_id:
            existing = await session.get(PurchaseOrder, r.converted_po_id)
            if existing and existing.status != "cancelled":
                skipped.append({
                    "suggestion_id": r.id, "reason": "already_converted",
                    "detail": {"po_id": existing.id, "po_code": existing.po_code, "status": existing.status},
                })
                continue
        # 2) Only 'suggested' rows are convertible (cancelled/received/approved/dispatched not eligible)
        if r.status not in ("suggested", "converted_to_po"):
            skipped.append({"suggestion_id": r.id, "reason": "not_suggested", "detail": {"status": r.status}})
            continue
        p = prods.get(r.partner_product_id)
        wh = whs.get(r.warehouse_id)
        if not p or not wh:
            skipped.append({"suggestion_id": r.id, "reason": "missing_product_or_warehouse"})
            continue
        supplier, sp = await _resolve_primary_supplier(session, p.master_product_id, wh.country)
        if not supplier or not sp:
            skipped.append({"suggestion_id": r.id, "reason": "no_supplier"})
            continue
        master = masters.get(p.master_product_id)
        key = (wh.id, supplier.id)
        g = groups.setdefault(key, {
            "warehouse": wh, "supplier": supplier, "lines": [],
        })
        g["lines"].append({
            "sug": r, "sp": sp, "master": master,
            "qty": max(1, int(r.approved_qty or r.suggested_qty or 0)),
        })

    created: list[dict] = []
    for (wh_id, sup_id), group in groups.items():
        wh: Warehouse = group["warehouse"]
        sup: Supplier = group["supplier"]

        # Create the draft PO header
        code = await _next_po_code(session, sup.country)
        po = PurchaseOrder(
            po_code=code, partner_id=actor.partner_id, warehouse_id=wh.id,
            supplier_id=sup.id, currency=sup.default_currency,
            notes=f"Auto-generated from {len(group['lines'])} replenishment suggestion(s).",
            created_by_partner_id=actor.partner.id if actor.actor_kind == "owner" else None,
            created_by_staff_id=actor.staff.id if actor.staff else None,
        )
        session.add(po)
        await session.flush()

        # Add every line
        sug_ids: list[str] = []
        for L in group["lines"]:
            sp: SupplierProduct = L["sp"]
            master: Optional[MartProduct] = L["master"]
            ln = PurchaseOrderLine(
                purchase_order_id=po.id, supplier_product_id=sp.id,
                master_product_id=sp.master_product_id, supplier_sku=sp.supplier_sku,
                product_name=master.name if master else "Unknown",
                qty_ordered=L["qty"],
                unit_cost=float(sp.cost_price),
                tax_pct=float(getattr(master, "tax_pct", None) or 0),
                notes=f"From suggestion {L['sug'].id}",
            )
            session.add(ln)
            # Mark source suggestion as converted
            sug = L["sug"]
            sug.status = "converted_to_po"
            sug.converted_po_id = po.id
            sug.updated_at = datetime.now(timezone.utc)
            sug_ids.append(sug.id)

        await session.flush()
        await _recompute_totals(session, po)
        session.add(PurchaseOrderAudit(
            purchase_order_id=po.id,
            actor_kind="partner_owner" if actor.actor_kind == "owner" else "partner_staff",
            actor_id=actor.actor_id, actor_label=_actor_label(actor),
            action="create_from_replenishment", to_status="draft",
            notes=f"Auto-generated from {len(sug_ids)} suggestion(s): {', '.join(sug_ids)}",
        ))
        created.append({
            "po_id": po.id, "po_code": po.po_code,
            "supplier": {"id": sup.id, "code": sup.code, "business_name": sup.business_name},
            "warehouse": {"id": wh.id, "code": wh.code, "name": wh.name},
            "line_count": len(group["lines"]),
            "grand_total": float(po.grand_total),
            "currency": po.currency,
            "suggestion_ids": sug_ids,
        })

    await session.commit()
    return {"created_pos": created, "skipped": skipped}
