"""Configuration service — exposes country/module config for the frontend.

Adding a new country/module = insert into `countries`/`configurations`. No code change.
"""
from fastapi import APIRouter, Query
from core.db import db
from core.config import get_app_config

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/countries")
async def list_countries():
    return await db.countries.find({"active": True}, {"_id": 0}).to_list(100)


@router.get("/modules")
async def list_modules(country: str = Query("CI")):
    return await db.configurations.find(
        {"scope": "module", "country": country.upper()}, {"_id": 0}
    ).sort("order", 1).to_list(20)


@router.get("/app")
async def app_config(country: str = Query("CI")):
    return await get_app_config(country)
