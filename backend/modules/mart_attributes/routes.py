"""Dynamic Attribute Engine — HTTP routes (Fixing_Prompt v6, 2026-02-28).

Public / supplier / customer:
  GET  /api/mart/categories/{category_id}/attributes?subcategory_id=…
       Returns the resolved attribute list (with inheritance + overrides).
       When called without an admin token, only active + non-hidden rows
       are returned so the supplier form or customer PDP renders exactly
       the right fields.

Admin (Super Admin governance):
  # Attributes
  GET    /api/admin/mart/attributes
  POST   /api/admin/mart/attributes
  PATCH  /api/admin/mart/attributes/{attribute_id}
  DELETE /api/admin/mart/attributes/{attribute_id}     — soft-delete (is_active=false)
  # Options
  POST   /api/admin/mart/attributes/{attribute_id}/options
  PATCH  /api/admin/mart/attributes/options/{option_id}
  DELETE /api/admin/mart/attributes/options/{option_id}
  # Assignments (category ⇄ attribute)
  POST   /api/admin/mart/categories/{cid}/attributes
  PATCH  /api/admin/mart/categories/attributes/{assignment_id}
  DELETE /api/admin/mart/categories/attributes/{assignment_id}
  # Categories / Subcategories CRUD (rename / activate / deactivate / create)
  POST   /api/admin/mart/categories
  PATCH  /api/admin/mart/categories/{cid}
  POST   /api/admin/mart/subcategories
  PATCH  /api/admin/mart/subcategories/{sid}
  # Audit
  GET    /api/admin/mart/attributes/audit

Every mutation records a before/after diff in `mart_attribute_audit`.
"""
from __future__ import annotations
import re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import (
    AdminUser, ATTRIBUTE_TYPES, MartAttribute, MartAttributeAudit,
    MartAttributeOption, MartCategory, MartCategoryAttribute, MartSubcategory,
)
from shared.admin.routes import get_current_admin
from modules.mart_attributes.resolver import resolve_attributes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify_key(name: str) -> str:
    """Attribute keys must match /^[a-z0-9_]{1,80}$/ — used as JSONB keys.

    Example: 'Country of Origin' → 'country_of_origin'.
    """
    s = _SLUG_RE.sub("_", (name or "").lower()).strip("_")
    return s[:80] or "attr"


def _attr_dict(a: MartAttribute) -> dict:
    return {
        "id": a.id, "key": a.key, "name": a.name, "description": a.description,
        "type": a.type, "unit": a.unit, "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


def _option_dict(o: MartAttributeOption) -> dict:
    return {
        "id": o.id, "attribute_id": o.attribute_id, "value": o.value,
        "label": o.label, "sort_order": o.sort_order, "is_active": o.is_active,
    }


def _ca_dict(ca: MartCategoryAttribute) -> dict:
    return {
        "id": ca.id, "category_id": ca.category_id, "subcategory_id": ca.subcategory_id,
        "attribute_id": ca.attribute_id, "is_required": ca.is_required,
        "customer_visible": ca.customer_visible, "supplier_editable": ca.supplier_editable,
        "sort_order": ca.sort_order, "is_active": ca.is_active,
        "created_at": ca.created_at.isoformat() if ca.created_at else None,
        "updated_at": ca.updated_at.isoformat() if ca.updated_at else None,
    }


async def _audit(session: AsyncSession, *, admin: AdminUser, action: str,
                 kind: str, entity_id: str, before: Optional[dict] = None,
                 after: Optional[dict] = None) -> None:
    session.add(MartAttributeAudit(
        actor_admin_id=admin.id, actor_email=admin.email,
        action=action, entity_kind=kind, entity_id=entity_id,
        diff={"before": before or {}, "after": after or {}},
    ))


# ---------------------------------------------------------------------------
# Public / supplier / customer — resolved attribute list
# ---------------------------------------------------------------------------

public_router = APIRouter(tags=["mart-attributes"])


@public_router.get("/mart/categories/{category_id}/attributes")
async def get_resolved_attributes(
    category_id: str,
    subcategory_id: Optional[str] = Query(None),
    customer_visible_only: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    # If category_id looks like a slug, resolve to id first (frontend
    # sometimes only has the slug from URL routing).
    cat = await session.get(MartCategory, category_id)
    if not cat:
        row = (await session.execute(
            select(MartCategory).where(MartCategory.slug == category_id).limit(1)
        )).scalar_one_or_none()
        if row:
            cat = row
    if not cat:
        raise HTTPException(404, "Category not found")

    sid = subcategory_id
    if sid:
        # Same slug-fallback for subcategory
        sub = await session.get(MartSubcategory, sid)
        if not sub:
            sub = (await session.execute(
                select(MartSubcategory).where(
                    MartSubcategory.slug == sid,
                    MartSubcategory.category_id == cat.id,
                ).limit(1)
            )).scalar_one_or_none()
        sid = sub.id if sub else None

    resolved = await resolve_attributes(
        session, category_id=cat.id, subcategory_id=sid,
        only_customer_visible=customer_visible_only,
    )
    return {
        "category": {"id": cat.id, "slug": cat.slug, "name": cat.name},
        "subcategory_id": sid,
        "attributes": resolved,
    }


# ---------------------------------------------------------------------------
# Admin — attribute definitions
# ---------------------------------------------------------------------------

admin_router = APIRouter(prefix="/admin/mart", tags=["admin-mart-attributes"])


class AttributeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    type: str
    unit: Optional[str] = Field(None, max_length=24)
    module: str = Field("mart", pattern="^(mart|shop)$")


class AttributePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    unit: Optional[str] = Field(None, max_length=24)
    is_active: Optional[bool] = None


@admin_router.get("/attributes")
async def admin_list_attributes(
    include_inactive: bool = Query(False),
    module: Optional[str] = Query(None, description="Filter by module — mart or shop. Defaults to all."),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    stmt = select(MartAttribute).order_by(MartAttribute.name)
    if not include_inactive:
        stmt = stmt.where(MartAttribute.is_active == True)  # noqa: E712
    if module:
        stmt = stmt.where(MartAttribute.module == module.lower())
    rows = (await session.execute(stmt)).scalars().all()

    # Preload option counts
    counts = {r[0]: r[1] for r in (await session.execute(
        select(MartAttributeOption.attribute_id, func.count(MartAttributeOption.id))
        .group_by(MartAttributeOption.attribute_id)
    )).all()}
    return {"items": [{**_attr_dict(a), "option_count": counts.get(a.id, 0)} for a in rows]}


@admin_router.post("/attributes", status_code=201)
async def admin_create_attribute(
    payload: AttributeIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    if payload.type not in ATTRIBUTE_TYPES:
        raise HTTPException(400, f"Invalid type. Allowed: {list(ATTRIBUTE_TYPES)}")
    key = slugify_key(payload.name)
    # Enforce unique key — if collision, suffix with a short random tag.
    existing = (await session.execute(
        select(MartAttribute.id).where(MartAttribute.key == key)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, {"code": "key_conflict",
                                  "message": f"An attribute with key '{key}' already exists. Rename to differentiate."})
    row = MartAttribute(
        key=key, name=payload.name.strip(), description=payload.description,
        type=payload.type, unit=payload.unit, module=payload.module,
    )
    session.add(row)
    await session.flush()
    await _audit(session, admin=admin, action="create", kind="attribute",
                 entity_id=row.id, after=_attr_dict(row))
    await session.commit()
    await session.refresh(row)
    return _attr_dict(row)


@admin_router.patch("/attributes/{attribute_id}")
async def admin_update_attribute(
    attribute_id: str, payload: AttributePatch,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(MartAttribute, attribute_id)
    if not row:
        raise HTTPException(404, "Attribute not found")
    before = _attr_dict(row)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await _audit(session, admin=admin, action="update", kind="attribute",
                 entity_id=row.id, before=before, after=_attr_dict(row))
    await session.commit()
    await session.refresh(row)
    return _attr_dict(row)


@admin_router.delete("/attributes/{attribute_id}", status_code=204)
async def admin_soft_delete_attribute(
    attribute_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    """Soft-delete: is_active=False. Historical product values preserved."""
    row = await session.get(MartAttribute, attribute_id)
    if not row:
        raise HTTPException(404, "Attribute not found")
    if not row.is_active:
        return  # already soft-deleted
    before = _attr_dict(row)
    row.is_active = False
    await _audit(session, admin=admin, action="deactivate", kind="attribute",
                 entity_id=row.id, before=before, after=_attr_dict(row))
    await session.commit()


# Fixing_Prompt v8 — bulk-deactivate attributes
class _AttrBulkDeleteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[str] = Field(..., min_length=1, max_length=200)


@admin_router.post("/attributes/bulk-delete")
async def admin_bulk_delete_attributes(
    payload: _AttrBulkDeleteIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    """Bulk soft-delete of attribute definitions. Historical product
    values under `details` are preserved thanks to the Slice-2 snapshot
    format (rename never destroys data)."""
    deleted, blocked = [], []
    for aid in payload.ids:
        row = await session.get(MartAttribute, aid)
        if not row:
            blocked.append({"id": aid, "reason": "not_found"})
            continue
        if not row.is_active:
            blocked.append({"id": aid, "reason": "already_inactive"})
            continue
        before = _attr_dict(row)
        row.is_active = False
        await _audit(session, admin=admin, action="bulk_deactivate", kind="attribute",
                     entity_id=row.id, before=before, after=_attr_dict(row))
        deleted.append(aid)
    await session.commit()
    return {"deleted": deleted, "blocked": blocked}


# ---------------------------------------------------------------------------
# Admin — attribute options
# ---------------------------------------------------------------------------

class OptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=200)
    sort_order: int = 0


class OptionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Optional[str] = Field(None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@admin_router.post("/attributes/{attribute_id}/options", status_code=201)
async def admin_add_option(
    attribute_id: str, payload: OptionIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    attr = await session.get(MartAttribute, attribute_id)
    if not attr:
        raise HTTPException(404, "Attribute not found")
    if attr.type not in ("select", "multi_select"):
        raise HTTPException(400, "Only select / multi_select attributes support options")
    row = MartAttributeOption(
        attribute_id=attribute_id, value=payload.value.strip(),
        label=payload.label.strip(), sort_order=payload.sort_order,
    )
    session.add(row)
    try:
        await session.flush()
    except Exception:
        raise HTTPException(409, "Option value already exists for this attribute")
    await _audit(session, admin=admin, action="option_add", kind="option",
                 entity_id=row.id, after=_option_dict(row))
    await session.commit()
    await session.refresh(row)
    return _option_dict(row)


@admin_router.patch("/attributes/options/{option_id}")
async def admin_update_option(
    option_id: str, payload: OptionPatch,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(MartAttributeOption, option_id)
    if not row:
        raise HTTPException(404, "Option not found")
    before = _option_dict(row)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await _audit(session, admin=admin, action="option_update", kind="option",
                 entity_id=row.id, before=before, after=_option_dict(row))
    await session.commit()
    await session.refresh(row)
    return _option_dict(row)


@admin_router.delete("/attributes/options/{option_id}", status_code=204)
async def admin_delete_option(
    option_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(MartAttributeOption, option_id)
    if not row:
        raise HTTPException(404, "Option not found")
    before = _option_dict(row)
    row.is_active = False
    await _audit(session, admin=admin, action="option_deactivate", kind="option",
                 entity_id=row.id, before=before, after=_option_dict(row))
    await session.commit()


# ---------------------------------------------------------------------------
# Admin — category ⇄ attribute assignments
# ---------------------------------------------------------------------------

class AssignmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attribute_id: str
    subcategory_id: Optional[str] = None
    is_required: bool = False
    customer_visible: bool = True
    supplier_editable: bool = True
    sort_order: int = 0


class AssignmentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_required: Optional[bool] = None
    customer_visible: Optional[bool] = None
    supplier_editable: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@admin_router.get("/categories/{category_id}/attributes")
async def admin_list_category_attributes(
    category_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    """Admin view: list every assignment row for this category (parent +
    all subcategory rows), so the assignment UI can render both scopes."""
    cat = await session.get(MartCategory, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    rows = (await session.execute(
        select(MartCategoryAttribute, MartAttribute)
        .join(MartAttribute, MartAttribute.id == MartCategoryAttribute.attribute_id)
        .where(MartCategoryAttribute.category_id == category_id)
        .order_by(MartCategoryAttribute.sort_order, MartAttribute.name)
    )).all()
    subs = (await session.execute(
        select(MartSubcategory).where(MartSubcategory.category_id == category_id)
        .order_by(MartSubcategory.order)
    )).scalars().all()
    return {
        "category": {"id": cat.id, "slug": cat.slug, "name": cat.name},
        "subcategories": [
            {"id": s.id, "slug": s.slug, "name": s.name} for s in subs
        ],
        "assignments": [
            {**_ca_dict(ca), "attribute": _attr_dict(a)} for ca, a in rows
        ],
    }


@admin_router.post("/categories/{category_id}/attributes", status_code=201)
async def admin_assign_attribute(
    category_id: str, payload: AssignmentIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    cat = await session.get(MartCategory, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    attr = await session.get(MartAttribute, payload.attribute_id)
    if not attr:
        raise HTTPException(404, "Attribute not found")
    if payload.subcategory_id:
        sub = await session.get(MartSubcategory, payload.subcategory_id)
        if not sub or sub.category_id != category_id:
            raise HTTPException(400, "Subcategory does not belong to this category")

    # Idempotent — if the row exists, update it instead of raising.
    existing = (await session.execute(
        select(MartCategoryAttribute).where(
            MartCategoryAttribute.category_id == category_id,
            MartCategoryAttribute.subcategory_id == payload.subcategory_id,
            MartCategoryAttribute.attribute_id == payload.attribute_id,
        )
    )).scalar_one_or_none()
    if existing:
        before = _ca_dict(existing)
        existing.is_required = payload.is_required
        existing.customer_visible = payload.customer_visible
        existing.supplier_editable = payload.supplier_editable
        existing.sort_order = payload.sort_order
        existing.is_active = True
        row = existing
        await _audit(session, admin=admin, action="assign_upsert", kind="assignment",
                     entity_id=row.id, before=before, after=_ca_dict(row))
    else:
        row = MartCategoryAttribute(
            category_id=category_id, subcategory_id=payload.subcategory_id,
            attribute_id=payload.attribute_id,
            is_required=payload.is_required,
            customer_visible=payload.customer_visible,
            supplier_editable=payload.supplier_editable,
            sort_order=payload.sort_order,
        )
        session.add(row)
        await session.flush()
        await _audit(session, admin=admin, action="assign", kind="assignment",
                     entity_id=row.id, after=_ca_dict(row))
    await session.commit()
    await session.refresh(row)
    return _ca_dict(row)


@admin_router.patch("/categories/attributes/{assignment_id}")
async def admin_update_assignment(
    assignment_id: str, payload: AssignmentPatch,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(MartCategoryAttribute, assignment_id)
    if not row:
        raise HTTPException(404, "Assignment not found")
    before = _ca_dict(row)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await _audit(session, admin=admin, action="assign_update", kind="assignment",
                 entity_id=row.id, before=before, after=_ca_dict(row))
    await session.commit()
    await session.refresh(row)
    return _ca_dict(row)


@admin_router.delete("/categories/attributes/{assignment_id}", status_code=204)
async def admin_unassign(
    assignment_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(MartCategoryAttribute, assignment_id)
    if not row:
        raise HTTPException(404, "Assignment not found")
    before = _ca_dict(row)
    await session.delete(row)
    await _audit(session, admin=admin, action="unassign", kind="assignment",
                 entity_id=row.id, before=before)
    await session.commit()


# ---------------------------------------------------------------------------
# Admin — audit trail
#
# Category & Subcategory CRUD lives in `shared/admin/mart_catalog_routes.py`
# — the existing routes already provide POST/PATCH/DELETE. This module only
# extended `CategoryUpdate` there with an `is_active` toggle for soft-delete.
# ---------------------------------------------------------------------------

@admin_router.get("/attributes/audit")
async def admin_audit_trail(
    entity_kind: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    stmt = select(MartAttributeAudit).order_by(MartAttributeAudit.created_at.desc()).limit(limit)
    if entity_kind:
        stmt = stmt.where(MartAttributeAudit.entity_kind == entity_kind)
    if entity_id:
        stmt = stmt.where(MartAttributeAudit.entity_id == entity_id)
    rows = (await session.execute(stmt)).scalars().all()
    return {"items": [{
        "id": a.id, "action": a.action, "entity_kind": a.entity_kind,
        "entity_id": a.entity_id, "actor_email": a.actor_email,
        "diff": a.diff,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows]}
