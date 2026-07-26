"""Configuration Engine — Country/Currency/Locale/Module registry.

Data-driven: adding a new country = insert into `configurations` + `countries` tables. No code change.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Configuration, Country
from core.serializers import row_to_dict

DEFAULT_COUNTRY = "CI"


async def get_country_config(session: AsyncSession, country_code: str) -> Optional[dict]:
    country = await session.get(Country, country_code.upper())
    return row_to_dict(country) if country else None


async def get_module_config(session: AsyncSession, module_code: str, country_code: str = DEFAULT_COUNTRY) -> Optional[dict]:
    row = (
        await session.execute(
            select(Configuration).where(
                Configuration.scope == "module",
                Configuration.module == module_code,
                Configuration.country == country_code.upper(),
            )
        )
    ).scalar_one_or_none()
    return row_to_dict(row) if row else None


async def get_app_config(session: AsyncSession, country_code: str) -> dict:
    """Aggregated public config the frontend needs on boot."""
    country = await get_country_config(session, country_code) or {}
    modules = (
        (
            await session.execute(
                select(Configuration)
                .where(Configuration.scope == "module", Configuration.country == country_code.upper())
                .order_by(Configuration.order)
            )
        )
        .scalars()
        .all()
    )
    return {
        "country": country,
        "modules": [{"code": m.module, **row_to_dict(m)} for m in modules],
    }
