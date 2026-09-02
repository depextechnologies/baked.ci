"""SHOPbakēd — dynamic attribute resolver (Slice 3).

Same shape as `modules.mart_attributes.resolver.resolve_attributes` but
reads assignments from `shop_category_attributes` and definitions from
`mart_attributes` (module-agnostic definitions, module-scoped by seed tag).

Callers:
  * Seller portal SHOP form              (`GET /api/shop/categories/{cid}/attributes`)
  * Customer PDP                         (same endpoint with customer_visible_only=True)
  * Slice 4 variant editor               (uses this + variant-level overrides)
"""
from __future__ import annotations
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import MartAttribute, MartAttributeOption, ShopCategoryAttribute


def _attr_dict(a: MartAttribute, opts: List[MartAttributeOption]) -> dict:
    return {
        "id": a.id, "key": a.key, "name": a.name, "type": a.type,
        "unit": a.unit, "description": a.description,
        "is_active": a.is_active, "module": a.module,
        "options": [
            {"id": o.id, "value": o.value, "label": o.label, "sort_order": o.sort_order}
            for o in sorted(opts, key=lambda o: (o.sort_order, o.label))
            if o.is_active
        ] if a.type in ("select", "multi_select") else [],
    }


async def resolve_shop_attributes(
    session: AsyncSession,
    *, category_id: str,
    subcategory_id: Optional[str] = None,
    only_customer_visible: bool = False,
) -> List[dict]:
    """Return resolved SHOP attribute list for (category, subcategory).

    Selection rule (identical to MART):
      * (category_id=cid, subcategory_id IS NULL)  → parent rows
      * (category_id=cid, subcategory_id=sid)      → override/addition rows
      * Keyed by attribute_id — subcategory row wins.
      * Rows with is_active=False are dropped.
      * Attribute definitions with is_active=False are dropped.
    """
    stmt = (
        select(ShopCategoryAttribute, MartAttribute)
        .join(MartAttribute, MartAttribute.id == ShopCategoryAttribute.attribute_id)
        .where(ShopCategoryAttribute.category_id == category_id)
    )
    if subcategory_id:
        stmt = stmt.where(
            (ShopCategoryAttribute.subcategory_id == subcategory_id)
            | (ShopCategoryAttribute.subcategory_id.is_(None))
        )
    else:
        stmt = stmt.where(ShopCategoryAttribute.subcategory_id.is_(None))

    rows = (await session.execute(stmt)).all()

    by_attr: dict[str, tuple[ShopCategoryAttribute, MartAttribute, str]] = {}
    for ca, attr in rows:
        scope = "subcategory" if ca.subcategory_id else "category"
        cur = by_attr.get(attr.id)
        if cur is None or scope == "subcategory":
            by_attr[attr.id] = (ca, attr, scope)

    select_attr_ids = [
        a.id for _, a, _ in by_attr.values() if a.type in ("select", "multi_select")
    ]
    opts_by_attr: dict[str, list[MartAttributeOption]] = {aid: [] for aid in select_attr_ids}
    if select_attr_ids:
        rows_opts = (
            await session.execute(
                select(MartAttributeOption).where(
                    MartAttributeOption.attribute_id.in_(select_attr_ids)
                )
            )
        ).scalars().all()
        for o in rows_opts:
            opts_by_attr.setdefault(o.attribute_id, []).append(o)

    resolved = []
    for ca, attr, scope in by_attr.values():
        if not ca.is_active or not attr.is_active:
            continue
        if only_customer_visible and not ca.customer_visible:
            continue
        d = _attr_dict(attr, opts_by_attr.get(attr.id, []))
        d.update({
            "is_required": ca.is_required,
            "customer_visible": ca.customer_visible,
            "supplier_editable": ca.supplier_editable,
            "sort_order": ca.sort_order,
            "scope": scope,
            "assignment_id": ca.id,
        })
        resolved.append(d)
    resolved.sort(key=lambda r: (r["sort_order"], r["name"]))
    return resolved
