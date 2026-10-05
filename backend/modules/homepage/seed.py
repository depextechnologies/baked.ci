"""Homepage sections seed — CI + IN.

Insert-only-if-missing (`ON CONFLICT DO NOTHING`) so any subsequent admin
edit through /admin/homepage-management is never overwritten by a
re-seed on boot. Deterministic ids (`hps_{country}_{seq}_{type}`) mean the
row identity is stable across restarts.

Adding a new country: append a `_SECTIONS_XX` dict + list it in the
`_ALL_COUNTRIES` tuple. Adding a new section type: extend the shared shape
and give it a fresh sequence number.
"""
from __future__ import annotations
from sqlalchemy import delete as sa_delete, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import HomepageSection


# Fallback hero image — admin can replace via the /admin/homepage-management uploader.
_DEFAULT_HERO_BG = (
    "https://images.unsplash.com/photo-1542838132-92c53300491e"
    "?w=1600&auto=format&fit=crop&q=70"
)


def _shape(country: str, texts: dict) -> list[dict]:
    """Build the 9-section homepage stack for one country from the localised text pack."""
    return [
        {
            "id": f"hps_{country.lower()}_010_hero",
            "country": country,
            "section_type": "hero",
            "title": texts["hero_title"],
            "subtitle": texts["hero_subtitle"],
            "config": {
                "cta_label": texts["hero_cta"],
                "cta_link": "/products",
                "secondary_cta_label": texts["hero_cta_secondary"],
                "secondary_cta_link": "/categories",
                "background_image": _DEFAULT_HERO_BG,
            },
            "display_order": 10,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_030_category_grid",
            "country": country,
            "section_type": "category_grid",
            "title": texts["categories_title"],
            "subtitle": texts["categories_subtitle"],
            "config": {
                "columns": 6,
                "categories": [
                    {"slug": "fruits-vegetables", "name": texts["cat_produce"]},
                    {"slug": "dairy-eggs",       "name": texts["cat_dairy"]},
                    {"slug": "beverages",         "name": texts["cat_beverages"]},
                    {"slug": "bakery-bread",      "name": texts["cat_bakery"]},
                    {"slug": "meat-seafood",      "name": texts["cat_meat"]},
                    {"slug": "grocery",           "name": texts["cat_grocery"]},
                ],
            },
            "display_order": 30,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_040_promotional_banner",
            "country": country,
            "section_type": "promotional_banner",
            "title": texts["promo_title"],
            "subtitle": texts["promo_subtitle"],
            "config": {
                "cta_label": texts["promo_cta"],
                "badge": texts["promo_badge"],
                "link": "/products?promo=1",
            },
            "display_order": 40,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_050_bestsellers",
            "country": country,
            "section_type": "product_carousel",
            "title": texts["bestsellers_title"],
            "subtitle": texts["bestsellers_subtitle"],
            "config": {"filter": "bestsellers", "limit": 12, "link": "/products?sort=bestsellers"},
            "display_order": 50,
            "is_enabled": True,
        },
        {
            # 4 banners × 320w × 258h per client spec (2026-02).
            "id": f"hps_{country.lower()}_060_banner_trio",
            "country": country,
            "section_type": "banner_trio",
            "title": texts["discover_title"],
            "subtitle": None,
            "config": {
                "banners": [
                    {"label": texts["trio_1_label"], "eyebrow": texts["trio_eyebrow"], "subtitle": texts["trio_1_subtitle"], "link": "/products?category=fruits-vegetables"},
                    {"label": texts["trio_2_label"], "eyebrow": texts["trio_eyebrow"], "subtitle": texts["trio_2_subtitle"], "link": "/products?category=beverages"},
                    {"label": texts["trio_3_label"], "eyebrow": texts["trio_eyebrow"], "subtitle": texts["trio_3_subtitle"], "link": "/products?category=grocery"},
                    {"label": texts["trio_4_label"], "eyebrow": texts["trio_eyebrow"], "subtitle": texts["trio_4_subtitle"], "link": "/products?category=bakery-bread"},
                ],
            },
            "display_order": 60,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_070_new_arrivals",
            "country": country,
            "section_type": "product_carousel",
            "title": texts["new_title"],
            "subtitle": texts["new_subtitle"],
            "config": {"filter": "new", "limit": 12, "link": "/products?sort=new"},
            "display_order": 70,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_080_brand_carousel",
            "country": country,
            "section_type": "brand_carousel",
            "title": texts["brands_title"],
            "subtitle": None,
            "config": {"brands": [{"name": b} for b in texts["brands_list"]]},
            "display_order": 80,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_090_app_promotion",
            "country": country,
            "section_type": "app_promotion",
            "title": texts["app_title"],
            "subtitle": texts["app_subtitle"],
            "config": {
                "google_play_url": "https://play.google.com/store/apps",
                "app_store_url": "https://apps.apple.com/",
                "qr_target": "https://baked.ci",
            },
            "display_order": 90,
            "is_enabled": True,
        },
        {
            "id": f"hps_{country.lower()}_100_cta_strip",
            "country": country,
            "section_type": "cta_strip",
            "title": texts["cta_title"],
            "subtitle": texts["cta_subtitle"],
            "config": {"cta_label": texts["cta_label"], "cta_link": "/products"},
            "display_order": 100,
            "is_enabled": True,
        },
    ]


# ---- localised copy packs ------------------------------------------------

_CI_TEXTS = {
    # Hero
    "hero_title":         "Tout ce dont vous avez besoin, livré en quelques minutes",
    "hero_subtitle":      "Livraison rapide dans toute la ville",
    "hero_cta":           "Commander maintenant",
    "hero_cta_secondary": "Voir les catégories",
    # Categories
    "categories_title":    "Categories",
    "categories_subtitle": "Achetez par département",
    "cat_produce":   "Fruits & Légumes",
    "cat_dairy":     "Produits Laitiers",
    "cat_beverages": "Boissons",
    "cat_bakery":    "Boulangerie",
    "cat_meat":      "Viandes & Poissons",
    "cat_grocery":   "Épicerie",
    # Promo banner
    "promo_title":    "Meilleures offres",
    "promo_subtitle": "Économisez jusqu'à 30% sur les essentiels de la semaine",
    "promo_cta":      "Voir les offres",
    "promo_badge":    "Offre limitée",
    # Bestsellers
    "bestsellers_title":    "Meilleures Ventes",
    "bestsellers_subtitle": "Best-sellers sélectionnés pour vous",
    # Banner row (4 tiles)
    "discover_title":  "Découvrez plus",
    "trio_eyebrow":    "Boutique",
    "trio_1_label":    "Fruits & Légumes",
    "trio_1_subtitle": "Frais, tous les jours",
    "trio_2_label":    "Boissons",
    "trio_2_subtitle": "Rafraîchissez-vous",
    "trio_3_label":    "Épicerie",
    "trio_3_subtitle": "Essentiels du quotidien",
    "trio_4_label":    "Boulangerie",
    "trio_4_subtitle": "Pain frais du jour",
    # New arrivals
    "new_title":    "Nouveautés",
    "new_subtitle": "Juste arrivé dans votre magasin",
    # Brands
    "brands_title": "Marques que vous pourriez aimer",
    "brands_list":  ["Coca-Cola", "Nestlé", "Danone", "Unilever", "Bel", "Nescafé"],
    # App promo
    "app_title":    "Téléchargez l'app BAKĒD",
    "app_subtitle": "Commandes plus rapides, suivi en direct, dans votre poche.",
    # CTA strip
    "cta_title":    "Prêt à faire vos courses ?",
    "cta_subtitle": "Commandez en moins de 60 secondes",
    "cta_label":    "Commencer",
}


_IN_TEXTS = {
    # Hero
    "hero_title":         "Everything you need, delivered in minutes",
    "hero_subtitle":      "Fresh groceries, daily essentials & more at your doorstep",
    "hero_cta":           "Shop now",
    "hero_cta_secondary": "Browse categories",
    # Categories
    "categories_title":    "Categories",
    "categories_subtitle": "Shop by department",
    "cat_produce":   "Fruits & Vegetables",
    "cat_dairy":     "Dairy & Eggs",
    "cat_beverages": "Beverages",
    "cat_bakery":    "Bakery & Bread",
    "cat_meat":      "Meat & Seafood",
    "cat_grocery":   "Grocery",
    # Promo banner
    "promo_title":    "Best deals for you",
    "promo_subtitle": "Save up to 30% on this week's essentials",
    "promo_cta":      "View deals",
    "promo_badge":    "Limited time",
    # Bestsellers
    "bestsellers_title":    "Best Sellers",
    "bestsellers_subtitle": "Curated top picks for you",
    # Banner row (4 tiles)
    "discover_title":  "Discover more",
    "trio_eyebrow":    "Shop",
    "trio_1_label":    "Fresh Produce",
    "trio_1_subtitle": "Farm-fresh, every day",
    "trio_2_label":    "Beverages",
    "trio_2_subtitle": "Stay refreshed",
    "trio_3_label":    "Home Essentials",
    "trio_3_subtitle": "Everyday must-haves",
    "trio_4_label":    "Bakery",
    "trio_4_subtitle": "Fresh bread daily",
    # New arrivals
    "new_title":    "New Arrivals",
    "new_subtitle": "Just landed in your store",
    # Brands
    "brands_title": "Brands you'll love",
    "brands_list":  ["Amul", "Britannia", "Parle", "Nestlé", "Tata", "ITC"],
    # App promo
    "app_title":    "Get the BAKĒD app",
    "app_subtitle": "Faster ordering, live tracking, right in your pocket.",
    # CTA strip
    "cta_title":    "Ready to shop?",
    "cta_subtitle": "Order in under 60 seconds",
    "cta_label":    "Start shopping",
}


_ALL_COUNTRIES: tuple[tuple[str, dict], ...] = (
    ("CI", _CI_TEXTS),
    ("IN", _IN_TEXTS),
)


# ============================================================================
# FOODbakēd seed — same architecture as MART (insert-only-if-missing,
# deterministic ids, bilingual FR/EN config stored under *_fr / *_en keys).
# Super Admin can edit / reorder / disable / delete; a restart NEVER
# resurrects a deleted row (idempotent `ON CONFLICT DO NOTHING`).
# ============================================================================

_FOOD_HERO_BG = (
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1"
    "?w=1600&auto=format&fit=crop&q=70"
)

# One `config` block per section, authored FR-first with EN alongside. The
# FoodHome renderer reads the right language key based on i18n.
_FOOD_SECTIONS: dict[str, list[dict]] = {
    "CI": [
        dict(seq=10, type="food_hero",                 title="La bonne cuisine",
             subtitle="Rassemble les gens",
             config={
                 "background_image": _FOOD_HERO_BG,
                 "title_fr":    "La bonne cuisine",
                 "title_en":    "Good Food",
                 "subtitle_fr": "Rassemble les gens",
                 "subtitle_en": "Brings People Together",
                 "tagline_fr":  "Découvrez des restaurants locaux et des cuisines du monde — uniquement sur FOODbakēd.",
                 "tagline_en":  "Discover local favourites and global cuisines — only on FOODbakēd.",
                 "eyebrow":     "FOODbakēd",
             }),
        dict(seq=20, type="food_categories",           title="Explorer par type",
             subtitle="Choisissez votre repas",
             config={"title_fr": "Explorer par type", "title_en": "Browse by type"}),
        dict(seq=30, type="food_featured_restaurants", title="Restaurants populaires",
             subtitle="Les favoris de la ville",
             config={
                 "title_fr": "Restaurants populaires",
                 "title_en": "Featured Restaurants",
                 "subtitle_fr": "Les favoris de la ville",
                 "subtitle_en": "City favourites",
                 "limit": 10,
             }),
        dict(seq=40, type="food_promos",               title="Offres du moment",
             subtitle="Les meilleures promos chez les restaurateurs partenaires",
             config={"banners": [
                 {
                     "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&auto=format&fit=crop&q=70",
                     "headline_fr": "–30 % sur les pizzas", "headline_en": "–30% on pizzas",
                     "description_fr": "Chaque mardi, chez tous les partenaires FOOD.",
                     "description_en": "Every Tuesday, at every FOOD partner.",
                     "cta_label_fr": "J'en profite", "cta_label_en": "Grab it", "cta_link": "/foodbaked",
                 },
                 {
                     "image": "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=1200&auto=format&fit=crop&q=70",
                     "headline_fr": "Livraison offerte", "headline_en": "Free delivery",
                     "description_fr": "Dès 10 000 XOF de commande.", "description_en": "On orders over 10,000 XOF.",
                     "cta_label_fr": "Commander", "cta_label_en": "Order", "cta_link": "/foodbaked",
                 },
             ]}),
        dict(seq=50, type="food_cuisines",             title="Cuisines du monde",
             subtitle="De l'Ivoire à l'Italie, en passant par l'Asie",
             config={"title_fr": "Cuisines du monde", "title_en": "Cuisines You'll Love", "limit": 12}),
        dict(seq=60, type="food_usps",                 title="Pourquoi FOODbakēd ?",
             subtitle=None,
             config={"usps": [
                 {"icon": "clock",    "title_fr": "Livraison rapide",      "title_en": "Quick Delivery",     "subtitle_fr": "Repas chauds à votre porte",       "subtitle_en": "Hot meals at your door"},
                 {"icon": "utensils", "title_fr": "Grande variété",         "title_en": "Wide Variety",      "subtitle_fr": "Cuisines locales et internationales", "subtitle_en": "Local & global cuisines"},
                 {"icon": "tag",      "title_fr": "Super offres",           "title_en": "Great Deals",       "subtitle_fr": "Économisez chaque jour",            "subtitle_en": "Save more every day"},
                 {"icon": "heart",    "title_fr": "Partenaires de confiance","title_en": "Trusted Restaurants","subtitle_fr": "Qualité et clients heureux",       "subtitle_en": "Quality food, happy customers"},
             ]}),
        dict(seq=70, type="food_testimonial",          title="Ils nous adorent",
             subtitle=None,
             config={
                 "background_image": "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&auto=format&fit=crop&q=70",
                 "quote_fr": "FOODbakēd a changé ma façon de commander. Rapide, varié, et toujours chaud à l'arrivée.",
                 "quote_en": "FOODbakēd changed how I order. Fast, varied, and still hot when it arrives.",
                 "meta_fr":  "4,8/5 sur plus de 10 000 clients satisfaits",
                 "meta_en":  "4.8/5 from 10,000+ happy food lovers",
             }),
    ],
    "IN": [
        dict(seq=10, type="food_hero",                 title="Good Food",
             subtitle="Brings People Together",
             config={
                 "background_image": _FOOD_HERO_BG,
                 "title_fr":    "Un bon repas",
                 "title_en":    "Good Food",
                 "subtitle_fr": "Rassemble les gens",
                 "subtitle_en": "Brings People Together",
                 "tagline_fr":  "Découvrez des restaurants locaux et des cuisines du monde — uniquement sur FOODbakēd.",
                 "tagline_en":  "Discover local favourites and global cuisines — only on FOODbakēd.",
                 "eyebrow":     "FOODbakēd",
             }),
        dict(seq=20, type="food_categories",           title="Browse by type", subtitle="Pick your meal",
             config={"title_fr": "Explorer par type", "title_en": "Browse by type"}),
        dict(seq=30, type="food_featured_restaurants", title="Featured Restaurants", subtitle="City favourites",
             config={"title_fr": "Restaurants populaires", "title_en": "Featured Restaurants", "limit": 10}),
        dict(seq=40, type="food_promos",               title="Hot deals right now", subtitle="Picked by our team",
             config={"banners": [
                 {
                     "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&auto=format&fit=crop&q=70",
                     "headline_fr": "–30 % sur les pizzas", "headline_en": "–30% on pizzas",
                     "description_fr": "Chaque mardi, chez tous les partenaires.", "description_en": "Every Tuesday, at every partner.",
                     "cta_label_fr": "J'en profite", "cta_label_en": "Grab it", "cta_link": "/foodbaked",
                 },
                 {
                     "image": "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=1200&auto=format&fit=crop&q=70",
                     "headline_fr": "Livraison offerte", "headline_en": "Free delivery",
                     "description_fr": "Dès 500 ₹ de commande.", "description_en": "On orders over ₹500.",
                     "cta_label_fr": "Commander", "cta_label_en": "Order", "cta_link": "/foodbaked",
                 },
             ]}),
        dict(seq=50, type="food_cuisines",             title="Cuisines You'll Love", subtitle="From Mumbai to Milan",
             config={"title_fr": "Cuisines du monde", "title_en": "Cuisines You'll Love", "limit": 12}),
        dict(seq=60, type="food_usps",                 title="Why FOODbakēd?", subtitle=None,
             config={"usps": [
                 {"icon": "clock",    "title_fr": "Livraison rapide",       "title_en": "Quick Delivery",     "subtitle_fr": "Repas chauds à votre porte",         "subtitle_en": "Hot meals at your door"},
                 {"icon": "utensils", "title_fr": "Grande variété",          "title_en": "Wide Variety",      "subtitle_fr": "Cuisines locales et internationales", "subtitle_en": "Local & global cuisines"},
                 {"icon": "tag",      "title_fr": "Super offres",            "title_en": "Great Deals",       "subtitle_fr": "Économisez chaque jour",             "subtitle_en": "Save more every day"},
                 {"icon": "heart",    "title_fr": "Partenaires de confiance","title_en": "Trusted Restaurants","subtitle_fr": "Qualité et clients heureux",         "subtitle_en": "Quality food, happy customers"},
             ]}),
        dict(seq=70, type="food_testimonial",          title="Loved by foodies", subtitle=None,
             config={
                 "background_image": "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&auto=format&fit=crop&q=70",
                 "quote_fr": "FOODbakēd est devenu mon réflexe. Rapide, varié et toujours chaud.",
                 "quote_en": "FOODbakēd changed how I order. Fast, varied, and still hot when it arrives.",
                 "meta_fr":  "4,8/5 sur plus de 10 000 clients satisfaits",
                 "meta_en":  "4.8/5 from 10,000+ happy food lovers",
             }),
    ],
}


def _food_rows(country: str) -> list[dict]:
    """Build the default FOOD section rows for one country (deterministic ids)."""
    out = []
    for row in _FOOD_SECTIONS[country]:
        out.append({
            "id": f"hps_food_{country.lower()}_{row['seq']:03d}_{row['type']}",
            "country": country,
            "module":  "food",
            "section_type": row["type"],
            "title":    row.get("title"),
            "subtitle": row.get("subtitle"),
            "config":   row.get("config") or {},
            "display_order": row["seq"],
            "is_enabled": True,
        })
    return out


async def seed_food_homepage(session: AsyncSession) -> dict[str, int]:
    """Idempotently insert the default FOOD homepage stack per country.

    Admin edits via /admin/modules/food/homepage-management are preserved
    because we `ON CONFLICT DO NOTHING` on the deterministic row id.
    Deleted rows are NEVER re-inserted — unless the admin resets via a
    (future) "Restore defaults" button.
    """
    counts: dict[str, int] = {}
    for country in _FOOD_SECTIONS.keys():
        rows = _food_rows(country)
        stmt = pg_insert(HomepageSection).values(rows).on_conflict_do_nothing(index_elements=["id"])
        result = await session.execute(stmt)
        counts[country] = result.rowcount or 0
    await session.commit()
    return counts



async def seed_homepage(session: AsyncSession) -> dict[str, int]:
    """Idempotently insert the default homepage stack for each supported country.

    Insert-only-if-missing so any admin edit via /admin/homepage-management is
    never overwritten by a subsequent restart.

    Also purges any legacy `module_switcher` rows — the section was removed
    from the homepage per client request (2026-02) and the switcher lives
    only in the global top-nav now.
    """
    # Purge deprecated section type first (safe: rows carry no unique customer data).
    await session.execute(sa_delete(HomepageSection).where(HomepageSection.section_type == "module_switcher"))
    # One-time reshape: the banner_trio row now carries 4 banners instead of 3.
    # Delete only the ORIGINAL 3-banner shape so admin customisations are preserved.
    await session.execute(
        sa_delete(HomepageSection).where(
            HomepageSection.section_type == "banner_trio",
            HomepageSection.config["banners"].astext.like("%[%]%"),  # is a JSON array
            func.jsonb_array_length(HomepageSection.config["banners"]) == 3,  # exactly 3 entries
        )
    )

    counts: dict[str, int] = {}
    for country, texts in _ALL_COUNTRIES:
        rows = _shape(country, texts)
        stmt = pg_insert(HomepageSection).values(rows).on_conflict_do_nothing(index_elements=["id"])
        result = await session.execute(stmt)
        counts[country] = result.rowcount or 0
    await session.commit()
    return counts
