"""Configuration service — exposes country/module config for the frontend.

Adding a new country/module = insert into `countries`/`configurations`. No code change.
"""
import os
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_session
from core.config import get_app_config
from core.models import Configuration, Country
from core.serializers import row_to_dict

router = APIRouter(prefix="/config", tags=["config"])


def _is_production() -> bool:
    return (os.environ.get("APP_ENV") or "").lower() == "production"


@router.get("/countries")
async def list_countries(session: AsyncSession = Depends(get_session)):
    """Return active countries. In production, only rows explicitly marked
    `production_visible=True` are exposed to the customer UI. QA/dev environments
    see everything so newly seeded countries can be tested before rollout.
    """
    stmt = select(Country).where(Country.active.is_(True))
    if _is_production():
        stmt = stmt.where(Country.production_visible.is_(True))
    rows = (await session.execute(stmt)).scalars().all()
    return [row_to_dict(r) for r in rows]


@router.get("/modules")
async def list_modules(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    rows = (
        (
            await session.execute(
                select(Configuration)
                .where(Configuration.scope == "module", Configuration.country == country.upper())
                .order_by(Configuration.order)
            )
        )
        .scalars()
        .all()
    )
    return [{"code": r.module, **row_to_dict(r)} for r in rows]


@router.get("/app")
async def app_config(country: str = Query("CI"), session: AsyncSession = Depends(get_session)):
    return await get_app_config(session, country)
