"""Configuration service — exposes country/module config for the frontend.

Adding a new country/module = insert into `countries`/`configurations`. No code change.
"""
import os
from fastapi import APIRouter, Query
from core.db import db
from core.config import get_app_config

router = APIRouter(prefix="/config", tags=["config"])


def _is_production() -> bool:
    return (os.environ.get("APP_ENV") or "").lower() == "production"


@router.get("/countries")
async def list_countries():
    """Return active countries. In production, only rows explicitly marked
    `production_visible=True` are exposed to the customer UI. QA/dev environments
    see everything so newly seeded countries can be tested before rollout.
    """
    q: dict = {"active": True}
    if _is_production():
        q["production_visible"] = True
    return await db.countries.find(q, {"_id": 0}).to_list(100)


@router.get("/modules")
async def list_modules(country: str = Query("CI")):
    return await db.configurations.find(
        {"scope": "module", "country": country.upper()}, {"_id": 0}
    ).sort("order", 1).to_list(20)


@router.get("/app")
async def app_config(country: str = Query("CI")):
    return await get_app_config(country)
