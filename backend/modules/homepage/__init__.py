"""Homepage sections API — public read + admin CRUD (Social.docx §Homepage).

Public:
  GET  /api/homepage?country=CI                       — enabled sections in order

Admin (requires admin auth):
  GET   /api/admin/homepage-sections?country=CI       — list ALL (incl. disabled)
  POST  /api/admin/homepage-sections                  — create
  PATCH /api/admin/homepage-sections/{id}             — edit title/subtitle/config/is_enabled
  DELETE /api/admin/homepage-sections/{id}            — delete
  PATCH /api/admin/homepage-sections/reorder          — bulk reorder [{id, display_order}]

`config` is a free-form JSON blob whose expected shape depends on
`section_type` — see `SECTION_SCHEMAS` on the frontend for field lists.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.models import HomepageSection, HOMEPAGE_SECTION_TYPES, AdminUser
from shared.admin.routes import get_current_admin
from core.providers import object_storage


router = APIRouter(tags=["homepage"])
admin_router = APIRouter(prefix="/admin/homepage-sections", tags=["admin-homepage"])


def _dict(row: HomepageSection) -> dict:
    return {
        "id": row.id,
        "country": row.country,
        "section_type": row.section_type,
        "title": row.title,
        "subtitle": row.subtitle,
        "config": row.config or {},
        "display_order": row.display_order,
        "is_enabled": row.is_enabled,
    }


class SectionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    country: str = Field(..., min_length=2, max_length=2)
    section_type: str
    title: Optional[str] = None
    subtitle: Optional[str] = None
    config: dict = Field(default_factory=dict)
    display_order: int = 0
    is_enabled: bool = True


class SectionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Optional[str] = None
    subtitle: Optional[str] = None
    config: Optional[dict] = None
    is_enabled: Optional[bool] = None


class ReorderItem(BaseModel):
    id: str
    display_order: int


class ReorderIn(BaseModel):
    items: List[ReorderItem]


# ---------------------------------------------------------------- public ---

@router.get("/homepage")
async def get_public_homepage(
    country: str = Query(..., min_length=2, max_length=2),
    session: AsyncSession = Depends(get_session),
):
    """Return every ENABLED section for the given country, ordered."""
    rows = (await session.execute(
        select(HomepageSection).where(
            HomepageSection.country == country.upper(),
            HomepageSection.is_enabled == True,  # noqa: E712
        ).order_by(HomepageSection.display_order.asc())
    )).scalars().all()
    return {"country": country.upper(), "sections": [_dict(r) for r in rows]}


# ---------------------------------------------------------------- admin ----

@admin_router.get("")
async def admin_list_sections(
    country: str = Query(..., min_length=2, max_length=2),
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    rows = (await session.execute(
        select(HomepageSection).where(
            HomepageSection.country == country.upper()
        ).order_by(HomepageSection.display_order.asc())
    )).scalars().all()
    return {
        "country": country.upper(),
        "section_types": HOMEPAGE_SECTION_TYPES,
        "items": [_dict(r) for r in rows],
    }


@admin_router.post("", status_code=201)
async def admin_create_section(
    payload: SectionIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    if payload.section_type not in HOMEPAGE_SECTION_TYPES:
        raise HTTPException(400, f"Unknown section_type: {payload.section_type}")
    row = HomepageSection(**payload.model_dump())
    row.country = row.country.upper()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _dict(row)


@admin_router.patch("/reorder")
async def admin_reorder_sections(
    payload: ReorderIn,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    for item in payload.items:
        row = await session.get(HomepageSection, item.id)
        if row:
            row.display_order = item.display_order
    await session.commit()
    return {"ok": True, "count": len(payload.items)}


@admin_router.patch("/{section_id}")
async def admin_update_section(
    section_id: str,
    payload: SectionPatch,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(HomepageSection, section_id)
    if not row:
        raise HTTPException(404, "Section not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return _dict(row)


@admin_router.delete("/{section_id}", status_code=204)
async def admin_delete_section(
    section_id: str,
    session: AsyncSession = Depends(get_session),
    admin: AdminUser = Depends(get_current_admin),
):
    row = await session.get(HomepageSection, section_id)
    if not row:
        raise HTTPException(404, "Section not found")
    await session.delete(row)
    await session.commit()


# ---------------------------------------------------------------- uploads --

MAX_UPLOAD_BYTES = 8 * 1024 * 1024   # 8 MB — banners are pre-optimised


@admin_router.post("/uploads")
async def admin_upload_image(
    file: UploadFile = File(...),
    admin: AdminUser = Depends(get_current_admin),
):
    """Upload an image and return its permanent URL for use in any section
    config (`hero.background_image`, `category.image`, `banner.image`, etc.).
    Storage handled by shared.object_storage — same provider as driver KYC."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "File must be an image (png / jpg / webp / svg)")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large ({MAX_UPLOAD_BYTES // 1024 // 1024} MB max)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() or "png"
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    key = f"{object_storage.APP_NAME}/homepage/{admin.id}/{ts}.{ext}"
    try:
        object_storage.put_object(key, content, file.content_type or "image/png")
    except Exception as e:
        raise HTTPException(502, f"Upload failed: {e}")
    return {"file_url": f"/api/homepage/uploads/{key}", "size": len(content)}


@router.get("/homepage/uploads/{key:path}")
async def homepage_upload_serve(key: str):
    """Public serve for uploaded homepage images (banners, category icons)."""
    try:
        content, ct = object_storage.get_object(key)
    except Exception:
        raise HTTPException(404, "Upload not found")
    return Response(content=content, media_type=ct)
