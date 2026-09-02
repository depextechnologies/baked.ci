"""Resolver — merges parent-category and subcategory attribute rows.

Given (category_id, subcategory_id?), returns a single ordered list of
resolved attribute assignments where the subcategory-scoped row wins over
the parent-category row for the same attribute_id.

Callers:
  * Supplier product form           (`GET /api/mart/categories/{cid}/attributes`)
  * Admin approval drawer           (same endpoint, shows values alongside)
  * Customer PDP                    (uses only `customer_visible=True` rows)
  * Backend validation              (`modules.mart_attributes.validate`)
"""
from __future__ import annotations
from typing import Iterable, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from core.models import MartAttribute, MartAttributeOption, MartCategoryAttribute


def _attr_dict(a: MartAttribute, opts: List[MartAttributeOption]) -> dict:
    return {
        "id": a.id, "key": a.key, "name": a.name, "type": a.type,
        "unit": a.unit, "description": a.description,
        "is_active": a.is_active,
        "options": [
            {"id": o.id, "value": o.value, "label": o.label, "sort_order": o.sort_order}
            for o in sorted(opts, key=lambda o: (o.sort_order, o.label))
            if o.is_active
        ] if a.type in ("select", "multi_select") else [],
    }


async def resolve_attributes(
    session: AsyncSession,
    *, category_id: str,
    subcategory_id: Optional[str] = None,
    only_customer_visible: bool = False,
) -> List[dict]:
    """Return resolved attribute list for the given (category, subcategory).

    The row-selection rule is:
      * Pull every (category_id=cid, subcategory_id IS NULL) row     — parents
      * Pull every (category_id=cid, subcategory_id=sid)  row       — overrides / additions
      * Keyed by attribute_id, subcategory row overrides parent row.
      * Rows with is_active=False (assignment-scope) are dropped.
      * Attributes with definition.is_active=False are dropped.

    Every resolved row is returned as:
        {id, key, name, type, unit, description, options,
         is_required, customer_visible, supplier_editable, sort_order,
         scope: "category" | "subcategory"}
    """
    stmt = (
        select(MartCategoryAttribute, MartAttribute)
        .join(MartAttribute, MartAttribute.id == MartCategoryAttribute.attribute_id)
        .where(MartCategoryAttribute.category_id == category_id)
    )
    if subcategory_id:
        stmt = stmt.where(
            (MartCategoryAttribute.subcategory_id == subcategory_id)
            | (MartCategoryAttribute.subcategory_id.is_(None))
        )
    else:
        stmt = stmt.where(MartCategoryAttribute.subcategory_id.is_(None))

    rows = (await session.execute(stmt)).all()

    # Bucket by attribute_id — subcategory row wins.
    by_attr: dict[str, tuple[MartCategoryAttribute, MartAttribute, str]] = {}
    for ca, attr in rows:
        scope = "subcategory" if ca.subcategory_id else "category"
        cur = by_attr.get(attr.id)
        if cur is None:
            by_attr[attr.id] = (ca, attr, scope)
        else:
            # subcategory row overrides category row
            if scope == "subcategory":
                by_attr[attr.id] = (ca, attr, scope)

    # Preload options for any select/multi_select attribute in one query.
    select_attr_ids = [a.id for _, a, _ in by_attr.values() if a.type in ("select", "multi_select")]
    opts_by_attr: dict[str, list[MartAttributeOption]] = {aid: [] for aid in select_attr_ids}
    if select_attr_ids:
        rows_opts = (await session.execute(
            select(MartAttributeOption).where(
                MartAttributeOption.attribute_id.in_(select_attr_ids)
            )
        )).scalars().all()
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
