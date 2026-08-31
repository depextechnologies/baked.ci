"""SHOPbakēd — homepage sections seed (Slice 7, 2026-02).

Ships a compact default homepage stack for the /shopbaked storefront:
  * hero            — welcome banner with CTA
  * category_grid   — top 6 SHOP categories
  * product_carousel — "Fresh drops" (auto-populated by ordering products
                      by `published_at DESC`)
  * promotional_banner — "Under 10 000 XOF" seasonal edit
  * brand_carousel  — sample brand names

Insert-only-if-missing on stable ids so admin edits survive restarts.
"""
from __future__ import annotations
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import HomepageSection


_SHOP_HERO_BG = (
    "https://images.unsplash.com/photo-1483985988355-763728e1935b"
    "?w=1600&auto=format&fit=crop&q=70"
)


def _shop_shape(country: str) -> list[dict]:
    prefix = f"hps_{country.lower()}_shop"
    return [
        {
            "id": f"{prefix}_010_hero",
            "country": country, "module": "shop",
            "section_type": "hero",
            "title": "Fashion, tech & home — from vetted BAKĒD sellers",
            "subtitle": "Every listing reviewed. Shipped across Côte d'Ivoire.",
            "config": {
                "cta_label": "Browse categories",
                "cta_link": "/shopbaked",
                "secondary_cta_label": "Fresh drops",
                "secondary_cta_link": "/shopbaked#shop-catalogue",
                "background_image": _SHOP_HERO_BG,
            },
            "display_order": 10,
            "is_enabled": True,
        },
        {
            "id": f"{prefix}_020_category_grid",
            "country": country, "module": "shop",
            "section_type": "category_grid",
            "title": "Shop by category",
            "subtitle": "Fashion · Electronics · Home",
            "config": {
                "columns": 6,
                "categories": [
                    {"slug": "mode-femme",             "name": "Mode Femme"},
                    {"slug": "mode-homme",             "name": "Mode Homme"},
                    {"slug": "chaussures-sneakers",    "name": "Chaussures & Sneakers"},
                    {"slug": "apple",                  "name": "Apple"},
                    {"slug": "smartphones-telephones", "name": "Smartphones"},
                    {"slug": "meuble-decoration",      "name": "Meuble & Déco"},
                ],
            },
            "display_order": 20,
            "is_enabled": True,
        },
        {
            "id": f"{prefix}_030_fresh_drops",
            "country": country, "module": "shop",
            "section_type": "product_carousel",
            "title": "Fresh drops",
            "subtitle": "Latest approved listings from sellers.",
            "config": {"filter": "new", "limit": 12, "link": "/shopbaked"},
            "display_order": 30,
            "is_enabled": True,
        },
        {
            "id": f"{prefix}_040_under_10k",
            "country": country, "module": "shop",
            "section_type": "promotional_banner",
            "title": "Under 10 000 XOF",
            "subtitle": "Budget-friendly finds across every category.",
            "config": {
                "cta_label": "Shop deals",
                "badge": "Under 10K",
                "link": "/shopbaked",
            },
            "display_order": 40,
            "is_enabled": True,
        },
        {
            "id": f"{prefix}_050_brands",
            "country": country, "module": "shop",
            "section_type": "brand_carousel",
            "title": "Featured brands",
            "subtitle": None,
            "config": {
                "brands": [
                    {"name": "Apple"}, {"name": "Samsung"}, {"name": "Nike"},
                    {"name": "Adidas"}, {"name": "Zara"}, {"name": "HP"},
                ],
            },
            "display_order": 50,
            "is_enabled": True,
        },
    ]


SHOP_HOMEPAGE_COUNTRIES = ("CI",)


async def seed_shop_homepage(session: AsyncSession) -> dict[str, int]:
    counts: dict[str, int] = {}
    for country in SHOP_HOMEPAGE_COUNTRIES:
        rows = _shop_shape(country)
        stmt = pg_insert(HomepageSection).values(rows).on_conflict_do_nothing(index_elements=["id"])
        result = await session.execute(stmt)
        counts[country] = result.rowcount or 0
    await session.commit()
    return counts
