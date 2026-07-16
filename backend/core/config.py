"""Configuration Engine — Country/Currency/Locale/Module registry.

Data-driven: adding a new country = insert into `configurations` + `countries` collections. No code change.
"""
from typing import Optional
from core.db import db


DEFAULT_COUNTRY = "CI"  # Côte d'Ivoire is the launch market


async def get_country_config(country_code: str) -> Optional[dict]:
    return await db.countries.find_one({"code": country_code.upper()}, {"_id": 0})


async def get_module_config(module_code: str, country_code: str = DEFAULT_COUNTRY) -> Optional[dict]:
    return await db.configurations.find_one(
        {"scope": "module", "module": module_code, "country": country_code.upper()},
        {"_id": 0},
    )


async def get_app_config(country_code: str) -> dict:
    """Aggregated public config the frontend needs on boot."""
    country = await get_country_config(country_code) or {}
    modules = await db.configurations.find(
        {"scope": "module", "country": country_code.upper()},
        {"_id": 0},
    ).to_list(50)
    return {
        "country": country,
        "modules": modules,
    }
