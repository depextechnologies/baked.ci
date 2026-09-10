"""SHOPbakēd — homepage sections seed (Slice 7, 2026-02).

Bilingual: every user-facing text field is paired with a `_fr` sibling so
the frontend can render French by default without any hard-coded English
fallbacks. English lives at the canonical key so admin/API contracts stay
backwards compatible.

Insert-only-if-missing on stable ids so admin edits survive restarts.
When adding NEW bilingual keys to an already-seeded environment, bump the
row id (e.g., `_010_hero_v2`) OR run a one-off DELETE via psql — the
frontend picker falls back gracefully to the English value when the FR
sibling is absent.
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
    if country == "IN":
        subline_en = "Every listing reviewed. Shipped across India."
        subline_fr = "Chaque annonce vérifiée. Expédiée dans toute l'Inde."
        tech_line_en = "Phones, audio and accessories — Delhi NCR same-day."
        tech_line_fr = "Téléphones, audio et accessoires — livrés le jour même à Delhi NCR."
        drop_line_en = "Handpicked pieces from India's best sellers — restocked weekly."
        drop_line_fr = "Pièces choisies chez les meilleurs vendeurs indiens — réassort hebdomadaire."
    else:
        subline_en = "Every listing reviewed. Shipped across Côte d'Ivoire."
        subline_fr = "Chaque annonce vérifiée. Expédiée partout en Côte d'Ivoire."
        tech_line_en = "Phones, audio and accessories — same-day Abidjan express."
        tech_line_fr = "Téléphones, audio et accessoires — express le jour même à Abidjan."
        drop_line_en = "Handpicked pieces from CI's best sellers — restocked weekly."
        drop_line_fr = "Pièces choisies chez les meilleurs vendeurs de Côte d'Ivoire — réassort hebdomadaire."
    return [
        {
            "id": f"{prefix}_010_hero",
            "country": country, "module": "shop",
            "section_type": "hero",
            "title": "Fashion, tech & home — from vetted BAKĒD sellers",
            "subtitle": subline_en,
            "config": {
                "title_fr": "Mode, tech & maison — chez des vendeurs BAKĒD vérifiés",
                "subtitle_fr": subline_fr,
                "cta_label": "Browse categories",
                "cta_label_fr": "Parcourir les catégories",
                "cta_link": "/shopbaked",
                "secondary_cta_label": "Fresh drops",
                "secondary_cta_label_fr": "Nouveautés",
                "secondary_cta_link": "/shopbaked#shop-catalogue",
                "background_image": _SHOP_HERO_BG,
                "slides": [
                    {
                        "eyebrow": "THE BAKĒD MARKETPLACE",
                        "eyebrow_fr": "LE MARKETPLACE BAKĒD",
                        "headline": "Fashion, tech & home — from vetted BAKĒD sellers",
                        "headline_fr": "Mode, tech & maison — chez des vendeurs BAKĒD vérifiés",
                        "description": subline_en,
                        "description_fr": subline_fr,
                        "image": _SHOP_HERO_BG,
                        "badge": None,
                        "cta_label": "Browse categories",
                        "cta_label_fr": "Parcourir les catégories",
                        "cta_link": "/shop/categories",
                        "secondary_cta_label": "Fresh drops",
                        "secondary_cta_label_fr": "Nouveautés",
                        "secondary_cta_link": "/shop#shop-catalogue",
                    },
                    {
                        "eyebrow": "SEASONAL DROP",
                        "eyebrow_fr": "COLLECTION SAISONNIÈRE",
                        "headline": "New arrivals every Friday",
                        "headline_fr": "Nouveautés tous les vendredis",
                        "description": drop_line_en,
                        "description_fr": drop_line_fr,
                        "image": "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=70",
                        "badge": "NEW",
                        "badge_fr": "NOUVEAU",
                        "cta_label": "Shop the drop",
                        "cta_label_fr": "Découvrir la collection",
                        "cta_link": "/shop/c/mode-femme",
                    },
                    {
                        "eyebrow": "TECH RESTOCK",
                        "eyebrow_fr": "RÉASSORT TECH",
                        "headline": "Everyday tech · unbeatable prices",
                        "headline_fr": "La tech au quotidien · prix imbattables",
                        "description": tech_line_en,
                        "description_fr": tech_line_fr,
                        "image": "https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=1600&q=70",
                        "badge": "Up to 30% off",
                        "badge_fr": "Jusqu'à -30 %",
                        "cta_label": "Shop tech",
                        "cta_label_fr": "Voir la tech",
                        "cta_link": "/shop/c/smartphones-telephones",
                    },
                ],
                "right_top": {
                    "enabled": True,
                    "label": "NEW ARRIVALS",
                    "label_fr": "NOUVEAUTÉS",
                    "heading": "Discover the latest tech",
                    "heading_fr": "Découvrez les dernières nouveautés tech",
                    "description": "Phones · audio · wearables",
                    "description_fr": "Téléphones · audio · montres connectées",
                    "cta_label": "Shop now",
                    "cta_label_fr": "Acheter",
                    "cta_link": "/shop/c/smartphones-telephones",
                    "image": "https://images.unsplash.com/photo-1518444065439-e933c06ce9cd?w=800&q=70",
                    "badge": None,
                },
                "right_bottom": {
                    "enabled": True,
                    "label": "STARTING AT 24,900 XOF",
                    "label_fr": "À PARTIR DE 24 900 XOF",
                    "heading": "Sneakers, freshly restocked",
                    "heading_fr": "Sneakers, tout juste réassorties",
                    "description": "Everyday drops from vetted brands",
                    "description_fr": "Nouveautés quotidiennes de marques vérifiées",
                    "cta_label": "Shop now",
                    "cta_label_fr": "Acheter",
                    "cta_link": "/shop/c/chaussures-sneakers",
                    "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=70",
                    "badge": "Up to 25% off",
                    "badge_fr": "Jusqu'à -25 %",
                },
                "usp": [
                    {"icon": "shield",   "title": "Vetted sellers",     "title_fr": "Vendeurs vérifiés",      "subtitle": "Every listing reviewed",   "subtitle_fr": "Chaque annonce contrôlée"},
                    {"icon": "truck",    "title": "Same-day CI",        "title_fr": "Livraison le jour même", "subtitle": "Abidjan express",          "subtitle_fr": "Abidjan express"},
                    {"icon": "sparkles", "title": "Fresh drops",        "title_fr": "Nouveautés",             "subtitle": "New arrivals weekly",      "subtitle_fr": "Nouveautés chaque semaine"},
                    {"icon": "tag",      "title": "Affordable Pricing", "title_fr": "Prix accessibles",       "subtitle": "Guaranteed best price",    "subtitle_fr": "Meilleur prix garanti"},
                ],
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
                "title_fr": "Acheter par catégorie",
                "subtitle_fr": "Mode · Électronique · Maison",
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
            "config": {
                "title_fr": "Nouveautés",
                "subtitle_fr": "Dernières annonces approuvées par les vendeurs.",
                "filter": "new", "limit": 12, "link": "/shopbaked",
            },
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
                "title_fr": "Moins de 10 000 XOF",
                "subtitle_fr": "Des pépites à petit prix dans toutes les catégories.",
                "cta_label": "Shop deals",
                "cta_label_fr": "Voir les offres",
                "badge": "Under 10K",
                "badge_fr": "Moins de 10K",
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
                "title_fr": "Marques en vedette",
                "brands": [
                    {"name": "Apple"}, {"name": "Samsung"}, {"name": "Nike"},
                    {"name": "Adidas"}, {"name": "Zara"}, {"name": "HP"},
                ],
            },
            "display_order": 50,
            "is_enabled": True,
        },
    ]


SHOP_HOMEPAGE_COUNTRIES = ("CI", "IN")


async def seed_shop_homepage(session: AsyncSession) -> dict[str, int]:
    counts: dict[str, int] = {}
    for country in SHOP_HOMEPAGE_COUNTRIES:
        rows = _shop_shape(country)
        stmt = pg_insert(HomepageSection).values(rows).on_conflict_do_nothing(index_elements=["id"])
        result = await session.execute(stmt)
        counts[country] = result.rowcount or 0
    await session.commit()
    return counts
