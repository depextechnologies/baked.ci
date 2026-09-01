"""SHOPbakēd — demo product seed (placeholder listings).

Purpose
-------
Populate every SHOP subcategory with 1–2 published demo products so the
customer storefront (`/shop`, `/shop/c/{slug}`, product carousels on the
home page) has content to render instead of the empty-state placeholder.

Rules
-----
* Idempotent — safe to re-run on every boot. Uses a stable synthetic id
  per (subcategory_slug, index) so re-seeds don't create duplicates.
* Only touches DEMO rows (those with id starting with `shpprd_demo_`).
  Real seller-created products are untouched.
* Assigns each product to the demo supplier `sup_demo_delta_seed`
  (SHOP-enabled from `shared/suppliers/seed.py`) so the seller-portal
  fulfilment flow can operate on them if needed.
* Uses royalty-free Unsplash placeholder images keyed off the category
  slug so the tile visuals feel loosely on-theme.
* Two variants per product (colour × size / capacity / condition) with
  price tiers so front-end variant pickers actually have something to
  select. Attribute keys stay generic ("colour"/"size"/"capacity") to
  keep the resolver happy across categories.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import ShopCategory, ShopProduct, ShopSubcategory, ShopVariant

logger = logging.getLogger("baked.shop.demo_seed")

DEMO_SUPPLIER_ID = "sup_demo_delta_seed"

# --------------------------------------------------------------------------- 
# Placeholder image bank — Unsplash source URLs. Two per category so
# products within the same subcategory don't look identical.
# --------------------------------------------------------------------------- 
_IMG = {
    "mode-femme": [
        "https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=800&q=70",
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=70",
    ],
    "mode-homme": [
        "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=800&q=70",
        "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=800&q=70",
    ],
    "bebe-enfant": [
        "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=800&q=70",
        "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800&q=70",
    ],
    "chaussures-sneakers": [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=70",
        "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=70",
    ],
    "sacs-bagages": [
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=70",
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=70",
    ],
    "bijoux-montres-lunettes": [
        "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=800&q=70",
        "https://images.unsplash.com/photo-1594534475808-b18fc33b045e?w=800&q=70",
    ],
    "sports-loisirs": [
        "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&q=70",
        "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=70",
    ],
    "textile-mercerie": [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=70",
        "https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=70",
    ],
    "librairie-papeterie": [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=70",
        "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=800&q=70",
    ],
    "smartphones-telephones": [
        "https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=800&q=70",
        "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&q=70",
    ],
    "apple": [
        "https://images.unsplash.com/photo-1592286927505-1def25115558?w=800&q=70",
        "https://images.unsplash.com/photo-1611186871348-b1ce837f0479?w=800&q=70",
    ],
    "meuble-decoration": [
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=70",
        "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=70",
    ],
    "electronique-audio": [
        "https://images.unsplash.com/photo-1518444065439-e933c06ce9cd?w=800&q=70",
        "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=70",
    ],
    "informatique": [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=70",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=70",
    ],
    "electromenager": [
        "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=70",
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=70",
    ],
    "gaming": [
        "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=70",
        "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800&q=70",
    ],
    "beaute-cosmetique": [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&q=70",
        "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&q=70",
    ],
    "sante-bien-etre": [
        "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=70",
        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=70",
    ],
    "auto-moto-outils": [
        "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=70",
        "https://images.unsplash.com/photo-1555529771-7888783a18d3?w=800&q=70",
    ],
}
_FALLBACK_IMG = "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=800&q=70"


def _images_for(cat_slug: str, idx: int) -> list[str]:
    bank = _IMG.get(cat_slug, [_FALLBACK_IMG])
    return [bank[idx % len(bank)]]


# --------------------------------------------------------------------------- 
# Variant blueprints per category — tuples of
#     (title_suffix, price, compare_at_price, stock, attributes_dict).
# Kept simple and reusable across subcategories within the parent category.
# --------------------------------------------------------------------------- 
_VARIANTS = {
    "mode-femme": [
        ("Small · Black",   14900, 19900, 12, {"colour": "black",  "size": "S"}),
        ("Medium · Ivory",  14900, 19900,  8, {"colour": "ivory",  "size": "M"}),
    ],
    "mode-homme": [
        ("Medium · Navy",   17900, 22900, 10, {"colour": "navy",   "size": "M"}),
        ("Large · Charcoal",17900, 22900,  6, {"colour": "charcoal", "size": "L"}),
    ],
    "bebe-enfant": [
        ("2Y · Sage",        7900, 10900, 15, {"colour": "sage",   "size": "2Y"}),
        ("4Y · Coral",       7900, 10900, 10, {"colour": "coral",  "size": "4Y"}),
    ],
    "chaussures-sneakers": [
        ("EU 40 · White",   24900, 29900,  9, {"colour": "white",  "size": "40"}),
        ("EU 42 · Black",   24900, 29900,  7, {"colour": "black",  "size": "42"}),
    ],
    "sacs-bagages": [
        ("Cabin · Black",   34900, 39900,  5, {"colour": "black",  "capacity": "cabin"}),
        ("Medium · Tan",    39900, 44900,  4, {"colour": "tan",    "capacity": "medium"}),
    ],
    "bijoux-montres-lunettes": [
        ("Gold-tone",       19900, 24900,  8, {"colour": "gold"}),
        ("Silver-tone",     19900, 24900,  6, {"colour": "silver"}),
    ],
    "sports-loisirs": [
        ("Standard",         9900, 12900, 12, {"colour": "blue"}),
        ("Pro",             14900, 17900,  6, {"colour": "black"}),
    ],
    "textile-mercerie": [
        ("1 metre · Beige",  3900, None,  20, {"colour": "beige"}),
        ("1 metre · Olive",  3900, None,  18, {"colour": "olive"}),
    ],
    "librairie-papeterie": [
        ("Softcover",        4900, None,  25, {}),
        ("Hardcover",        7900, None,  15, {}),
    ],
    "smartphones-telephones": [
        ("128GB · Midnight", 189900, 219900, 6, {"capacity": "128GB", "colour": "midnight"}),
        ("256GB · Silver",   219900, 249900, 4, {"capacity": "256GB", "colour": "silver"}),
    ],
    "apple": [
        ("128GB · Space Grey", 549900, 599900, 3, {"capacity": "128GB", "colour": "space-grey"}),
        ("256GB · Starlight",  619900, 669900, 2, {"capacity": "256GB", "colour": "starlight"}),
    ],
    "meuble-decoration": [
        ("Natural oak",       89900, 99900,  4, {"colour": "oak"}),
        ("Matte black",       89900, 99900,  3, {"colour": "black"}),
    ],
    "electronique-audio": [
        ("Standard · Black",  59900, 69900,  8, {"colour": "black"}),
        ("Pro · White",       79900, 89900,  5, {"colour": "white"}),
    ],
    "informatique": [
        ("8GB · 256GB",      299900, 349900,  4, {"capacity": "256GB"}),
        ("16GB · 512GB",     399900, 449900,  3, {"capacity": "512GB"}),
    ],
    "electromenager": [
        ("Standard",         129900, 149900,  5, {"colour": "white"}),
        ("Premium",          169900, 189900,  3, {"colour": "silver"}),
    ],
    "gaming": [
        ("Console · Disc",   329900, 349900,  4, {}),
        ("Console · Digital",289900, 309900,  6, {}),
    ],
    "beaute-cosmetique": [
        ("50ml",              7900,  9900, 18, {}),
        ("100ml",            12900, 14900, 10, {}),
    ],
    "sante-bien-etre": [
        ("30 caps",           4900,  6900, 20, {}),
        ("90 caps",          10900, 12900, 12, {}),
    ],
    "auto-moto-outils": [
        ("Standard",          6900,  8900, 14, {}),
        ("Heavy-duty",       12900, 14900,  9, {}),
    ],
}
_FALLBACK_VARIANTS = [
    ("Option A",  9900, 12900, 10, {}),
    ("Option B", 14900, 17900,  7, {}),
]


def _title_for(sub_name: str, idx: int) -> str:
    """Human-readable demo product title."""
    labels = ["Signature", "Everyday", "Weekender", "Premium"]
    return f"{labels[idx % len(labels)]} {sub_name}"


async def seed_shop_demo_products(session: AsyncSession, country: str = "CI") -> dict:
    """Insert one demo product with two variants into every SHOP subcategory.

    Returns stats for observability. Skips subcategories that already have
    at least one demo row so the total row-count stays constant across
    reboots. Non-demo (seller-created) products are never touched.
    """
    stats = {"products_inserted": 0, "variants_inserted": 0, "skipped": 0}

    cat_rows = (
        await session.execute(select(ShopCategory).where(ShopCategory.country == country))
    ).scalars().all()
    if not cat_rows:
        return stats  # catalogue seed hasn't run yet

    for cat in cat_rows:
        variants_blueprint = _VARIANTS.get(cat.slug, _FALLBACK_VARIANTS)
        img_bank = _IMG.get(cat.slug, [_FALLBACK_IMG])

        subs = (
            await session.execute(
                select(ShopSubcategory).where(ShopSubcategory.category_id == cat.id)
            )
        ).scalars().all()

        for i, sub in enumerate(subs):
            demo_pid = f"shpprd_demo_{sub.slug}"[:64]

            existing = await session.get(ShopProduct, demo_pid)
            if existing:
                stats["skipped"] += 1
                continue

            sub_name = sub.name_en or sub.name_fr or sub.slug.replace("-", " ").title()
            product = ShopProduct(
                id=demo_pid,
                title=_title_for(sub_name, i),
                slug=demo_pid,
                country=country,
                module="shop",
                supplier_id=DEMO_SUPPLIER_ID,
                category_id=cat.id,
                subcategory_id=sub.id,
                description=(
                    f"Demo {sub_name.lower()} listing — placeholder content shipped with "
                    "the SHOPbakēd storefront so customers can browse a fully populated "
                    "catalogue before real sellers list their inventory."
                ),
                images=[img_bank[i % len(img_bank)]],
                attributes={},
                # The public storefront endpoint filters by `status == 'active'`
                # (see modules/shop/routes.py:237). Admin approval uses the
                # same value — we mirror it so demo rows show up alongside
                # real approved listings.
                status="active",
                published_at=datetime.now(timezone.utc),
            )
            session.add(product)
            stats["products_inserted"] += 1

            for v_idx, (suffix, price, compare, stock, attrs) in enumerate(variants_blueprint):
                variant = ShopVariant(
                    id=f"shpvar_demo_{sub.slug}_{v_idx}"[:64],
                    product_id=demo_pid,
                    sku=f"DEMO-{sub.slug.upper()[:12]}-{v_idx + 1}",
                    title_suffix=suffix,
                    price=price,
                    compare_at_price=compare,
                    currency="XOF",
                    stock_qty=stock,
                    condition="new",
                    attributes=attrs,
                    images=[img_bank[(i + v_idx) % len(img_bank)]],
                    is_active=True,
                )
                session.add(variant)
                stats["variants_inserted"] += 1

    if stats["products_inserted"] or stats["variants_inserted"]:
        await session.flush()
        logger.info(
            "shop.demo_seed inserted products=%s variants=%s (skipped existing=%s)",
            stats["products_inserted"], stats["variants_inserted"], stats["skipped"],
        )
    return stats
