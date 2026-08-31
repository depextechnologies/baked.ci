"""SHOPbakēd — idempotent catalogue seed (Slice 2, 2026-02).

Seeds `shop_categories` and `shop_subcategories` from the canonical FR/EN
tree in `catalogue_data.py`. Called from the main `run_seed()` startup
hook; safe to re-run on every boot.

Only inserts / updates non-immutable columns (name_fr, name_en, order) so
admin edits to icon/image survive re-seeds (once icon/image are exposed
via the admin CRUD in Slice 5). Slug is the idempotency key.
"""
from __future__ import annotations
import logging

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import ShopCategory, ShopSubcategory, new_id
from modules.shop.catalogue_data import CATEGORIES


logger = logging.getLogger("baked.shop.seed")

# Countries SHOP is enabled for. We start with CI (launch market); LR / IN
# can be appended here once product listings for them exist. Kept in one
# place so Slice 7 (Homepage editor) can join against the same set.
SHOP_COUNTRIES = ("CI",)


async def seed_shop_catalogue(session: AsyncSession) -> dict:
    """Idempotently upsert SHOP categories + subcategories for every
    country in `SHOP_COUNTRIES`. Returns a stats dict for observability."""
    stats = {"categories_upserted": 0, "subcategories_upserted": 0}

    for country in SHOP_COUNTRIES:
        for order, (cat_slug, name_fr, name_en, subs) in enumerate(CATEGORIES, start=1):
            # Preserve existing id (immutable) — we look it up before upsert.
            existing_cat = (
                await session.execute(
                    select(ShopCategory).where(
                        ShopCategory.slug == cat_slug,
                        ShopCategory.country == country,
                    )
                )
            ).scalar_one_or_none()

            cat_values = {
                "slug": cat_slug,
                "country": country,
                "name_fr": name_fr,
                "name_en": name_en,
                "order": order,
                "deleted_at": None,
            }
            if existing_cat is None:
                cat_values["id"] = new_id("shpcat")
            stmt = pg_insert(ShopCategory).values(**cat_values)
            update_cols = {
                "name_fr": stmt.excluded.name_fr,
                "name_en": stmt.excluded.name_en,
                "order": stmt.excluded.order,
                "updated_at": func.now(),
            }
            stmt = stmt.on_conflict_do_update(
                index_elements=["slug", "country"], set_=update_cols
            )
            await session.execute(stmt)
            stats["categories_upserted"] += 1

            # Re-fetch to get the id (either existing or freshly inserted).
            cat_id = (
                await session.execute(
                    select(ShopCategory.id).where(
                        ShopCategory.slug == cat_slug,
                        ShopCategory.country == country,
                    )
                )
            ).scalar_one()

            for sub_order, (sub_slug, sub_fr, sub_en) in enumerate(subs, start=1):
                existing_sub = (
                    await session.execute(
                        select(ShopSubcategory).where(
                            ShopSubcategory.slug == sub_slug,
                            ShopSubcategory.category_id == cat_id,
                        )
                    )
                ).scalar_one_or_none()

                sub_values = {
                    "slug": sub_slug,
                    "category_id": cat_id,
                    "country": country,
                    "name_fr": sub_fr,
                    "name_en": sub_en,
                    "order": sub_order,
                }
                if existing_sub is None:
                    sub_values["id"] = new_id("shpsub")
                sstmt = pg_insert(ShopSubcategory).values(**sub_values)
                supdate = {
                    "name_fr": sstmt.excluded.name_fr,
                    "name_en": sstmt.excluded.name_en,
                    "order": sstmt.excluded.order,
                    "updated_at": func.now(),
                }
                sstmt = sstmt.on_conflict_do_update(
                    index_elements=["slug", "category_id"], set_=supdate
                )
                await session.execute(sstmt)
                stats["subcategories_upserted"] += 1

    logger.info("baked.shop.seed done stats=%s", stats)
    return stats
