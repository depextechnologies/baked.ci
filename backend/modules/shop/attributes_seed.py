"""SHOPbakēd — attribute definitions + subcategory assignments seed (Slice 3).

Six starter attributes (Size, Colour, RAM, Storage, Condition, Warranty)
are seeded into the shared `mart_attributes` table with `module="shop"`
so the admin UI and validators can scope them. Options are seeded from
this file so any change here rolls out on the next boot.

Assignments follow the *parent-category inheritance* pattern:
  * Condition is attached at EVERY category (14 categories that make
    sense — apparel + electronics + accessories). Subcategories inherit
    automatically via the resolver.
  * Colour is attached at 8 categories (fashion + accessories + Apple + Smartphones).
  * Size is attached at 5 categories (Mode Femme, Mode Homme, Bébé & Enfant,
    Chaussures & Sneakers, Sports & Loisirs).
  * RAM + Storage at 3 electronics categories (Apple, Smartphones, Informatique).
  * Warranty at 4 electronics categories.

For demo-quality inheritance override, we ship one subcategory override:
  * On the "sneakers" subcategory (under Chaussures & Sneakers), Colour is
    flagged `is_required=True` (the parent-category assignment is optional).
    This proves the resolver picks the subcategory row over the parent.
"""
from __future__ import annotations
import logging
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import (
    MartAttribute, MartAttributeOption, ShopCategory, ShopCategoryAttribute,
    ShopSubcategory, new_id,
)

logger = logging.getLogger("baked.shop.attributes_seed")

# ---------- Attribute definitions ----------
# key MUST be lowercase [a-z0-9_]{1,80} — used as JSONB key on products.
ATTRIBUTES: list[dict] = [
    {
        "key": "size",
        "name": "Size",
        "type": "select",
        "description": "Apparel / footwear size chosen by the buyer.",
        "options": [
            ("xs", "XS"), ("s", "S"), ("m", "M"), ("l", "L"),
            ("xl", "XL"), ("xxl", "XXL"), ("xxxl", "XXXL"),
            ("36", "36"), ("38", "38"), ("40", "40"), ("42", "42"), ("44", "44"),
        ],
    },
    {
        "key": "colour",
        "name": "Colour",
        "type": "select",
        "description": "Primary colour of the product.",
        "options": [
            ("black", "Noir / Black"), ("white", "Blanc / White"),
            ("red", "Rouge / Red"), ("blue", "Bleu / Blue"),
            ("green", "Vert / Green"), ("yellow", "Jaune / Yellow"),
            ("pink", "Rose / Pink"), ("grey", "Gris / Grey"),
            ("brown", "Marron / Brown"), ("beige", "Beige"),
            ("gold", "Doré / Gold"), ("silver", "Argenté / Silver"),
            ("multicolour", "Multicolore / Multicolour"),
        ],
    },
    {
        "key": "ram",
        "name": "RAM",
        "type": "select",
        "unit": "GB",
        "description": "System memory (device RAM).",
        "options": [
            ("2", "2 GB"), ("3", "3 GB"), ("4", "4 GB"), ("6", "6 GB"),
            ("8", "8 GB"), ("12", "12 GB"), ("16", "16 GB"),
            ("24", "24 GB"), ("32", "32 GB"),
        ],
    },
    {
        "key": "storage",
        "name": "Storage",
        "type": "select",
        "unit": "GB",
        "description": "On-device storage capacity.",
        "options": [
            ("32", "32 GB"), ("64", "64 GB"), ("128", "128 GB"),
            ("256", "256 GB"), ("512", "512 GB"),
            ("1024", "1 TB"), ("2048", "2 TB"),
        ],
    },
    {
        "key": "condition",
        "name": "Condition",
        "type": "select",
        "description": "Product condition at time of sale.",
        "options": [
            ("new", "Neuf / New"),
            ("refurbished", "Reconditionné / Refurbished"),
            ("used_like_new", "Occasion — comme neuf / Like new"),
            ("used_good", "Occasion — bon état / Good"),
            ("used_fair", "Occasion — état correct / Fair"),
        ],
    },
    {
        "key": "warranty",
        "name": "Warranty",
        "type": "select",
        "description": "Manufacturer or seller warranty duration.",
        "options": [
            ("none", "Aucune / None"),
            ("3m", "3 mois / 3 months"),
            ("6m", "6 mois / 6 months"),
            ("1y", "1 an / 1 year"),
            ("2y", "2 ans / 2 years"),
            ("3y", "3 ans / 3 years"),
        ],
    },
]


# Which category slugs get which attribute.
# Every listed category will get a category-level (subcategory_id NULL)
# assignment; subcategories inherit via the resolver.
ASSIGNMENTS: dict[str, list[str]] = {
    "condition": [
        "mode-femme", "mode-homme", "bebe-enfant", "chaussures-sneakers",
        "sacs-bagages", "bijoux-montres-lunettes", "sports-loisirs",
        "jeux-video-consoles", "apple", "smartphones-telephones",
        "tv-son-photo", "electromenager", "informatique-bureau", "automobile",
    ],
    "colour": [
        "mode-femme", "mode-homme", "bebe-enfant", "chaussures-sneakers",
        "sacs-bagages", "bijoux-montres-lunettes", "apple",
        "smartphones-telephones",
    ],
    "size": [
        "mode-femme", "mode-homme", "bebe-enfant",
        "chaussures-sneakers", "sports-loisirs",
    ],
    "ram": ["apple", "smartphones-telephones", "informatique-bureau"],
    "storage": ["apple", "smartphones-telephones", "informatique-bureau"],
    "warranty": [
        "apple", "smartphones-telephones", "tv-son-photo",
        "electromenager", "informatique-bureau",
    ],
}


# Subcategory-scoped overrides that demonstrate inheritance-wins.
# List of (subcategory_slug, attribute_key, overrides_dict).
SUBCATEGORY_OVERRIDES: list[tuple[str, str, dict]] = [
    # Sneakers get Colour as *required* even though the parent category
    # made it optional — the resolver must pick this row.
    ("sneakers", "colour", {"is_required": True, "sort_order": 5}),
    # iPhone / iPad / Mac get Storage flagged as required at subcategory
    # scope.
    ("iphone", "storage", {"is_required": True, "sort_order": 10}),
    ("ipad", "storage", {"is_required": True, "sort_order": 10}),
    ("mac", "storage", {"is_required": True, "sort_order": 10}),
]


async def _upsert_attribute(session: AsyncSession, defn: dict) -> str:
    """Insert-or-update the attribute definition; return its id."""
    existing = (
        await session.execute(select(MartAttribute).where(MartAttribute.key == defn["key"]))
    ).scalar_one_or_none()
    values = {
        "key": defn["key"],
        "name": defn["name"],
        "type": defn["type"],
        "description": defn.get("description"),
        "unit": defn.get("unit"),
        "module": "shop",
        "is_active": True,
    }
    if existing is None:
        values["id"] = new_id("attr")
    stmt = pg_insert(MartAttribute).values(**values)
    upd = {
        "name": stmt.excluded.name,
        "description": stmt.excluded.description,
        "unit": stmt.excluded.unit,
        "module": stmt.excluded.module,
        "is_active": stmt.excluded.is_active,
        "updated_at": func.now(),
    }
    stmt = stmt.on_conflict_do_update(index_elements=["key"], set_=upd)
    await session.execute(stmt)
    attr_id = (
        await session.execute(select(MartAttribute.id).where(MartAttribute.key == defn["key"]))
    ).scalar_one()

    # Upsert options.
    for order, (value, label) in enumerate(defn.get("options", []), start=1):
        existing_opt = (
            await session.execute(
                select(MartAttributeOption).where(
                    MartAttributeOption.attribute_id == attr_id,
                    MartAttributeOption.value == value,
                )
            )
        ).scalar_one_or_none()
        ov = {
            "attribute_id": attr_id,
            "value": value,
            "label": label,
            "sort_order": order,
            "is_active": True,
        }
        if existing_opt is None:
            ov["id"] = new_id("attropt")
        os_stmt = pg_insert(MartAttributeOption).values(**ov)
        os_stmt = os_stmt.on_conflict_do_update(
            index_elements=["attribute_id", "value"],
            set_={
                "label": os_stmt.excluded.label,
                "sort_order": os_stmt.excluded.sort_order,
                "is_active": os_stmt.excluded.is_active,
            },
        )
        await session.execute(os_stmt)
    return attr_id


async def _upsert_assignment(
    session: AsyncSession, *, category_id: str, subcategory_id: str | None,
    attribute_id: str, is_required: bool = False, sort_order: int = 0,
    customer_visible: bool = True, supplier_editable: bool = True,
) -> None:
    # We can't include NULLs in ON CONFLICT easily since the unique index
    # is (category_id, subcategory_id, attribute_id) — Postgres treats
    # NULLs as distinct by default. Instead, look up an existing row and
    # decide insert vs update.
    q = select(ShopCategoryAttribute).where(
        ShopCategoryAttribute.category_id == category_id,
        ShopCategoryAttribute.attribute_id == attribute_id,
    )
    if subcategory_id is None:
        q = q.where(ShopCategoryAttribute.subcategory_id.is_(None))
    else:
        q = q.where(ShopCategoryAttribute.subcategory_id == subcategory_id)
    existing = (await session.execute(q)).scalar_one_or_none()

    if existing is None:
        session.add(ShopCategoryAttribute(
            id=new_id("shpcatattr"),
            category_id=category_id, subcategory_id=subcategory_id,
            attribute_id=attribute_id, is_required=is_required,
            customer_visible=customer_visible, supplier_editable=supplier_editable,
            sort_order=sort_order, is_active=True,
        ))
    else:
        existing.is_required = is_required
        existing.customer_visible = customer_visible
        existing.supplier_editable = supplier_editable
        existing.sort_order = sort_order
        existing.is_active = True


async def seed_shop_attributes(session: AsyncSession) -> dict:
    """Idempotently upsert SHOP attribute definitions + assignments.

    Safe on every boot. Returns counts for observability.
    """
    stats = {"attributes": 0, "assignments": 0, "overrides": 0}

    # 1) Definitions & options.
    attr_id_by_key: dict[str, str] = {}
    for defn in ATTRIBUTES:
        attr_id = await _upsert_attribute(session, defn)
        attr_id_by_key[defn["key"]] = attr_id
        stats["attributes"] += 1

    # 2) Look up SHOP categories keyed by slug (per-country).
    cats = (await session.execute(select(ShopCategory))).scalars().all()
    cat_by_key: dict[tuple[str, str], ShopCategory] = {(c.country, c.slug): c for c in cats}

    # 3) Category-level assignments.
    for attr_key, cat_slugs in ASSIGNMENTS.items():
        attr_id = attr_id_by_key.get(attr_key)
        if not attr_id:
            continue
        for slug in cat_slugs:
            for country, s in list(cat_by_key.keys()):
                if s != slug:
                    continue
                cat = cat_by_key[(country, s)]
                await _upsert_assignment(
                    session,
                    category_id=cat.id, subcategory_id=None,
                    attribute_id=attr_id,
                    is_required=False,
                    sort_order=_default_sort(attr_key),
                    customer_visible=True,
                )
                stats["assignments"] += 1

    # 4) Subcategory-scoped overrides.
    subs = (await session.execute(select(ShopSubcategory))).scalars().all()
    sub_by_key: dict[tuple[str, str], ShopSubcategory] = {(s.country, s.slug): s for s in subs}
    for sub_slug, attr_key, overrides in SUBCATEGORY_OVERRIDES:
        attr_id = attr_id_by_key.get(attr_key)
        if not attr_id:
            continue
        for country in {c.country for c in cats}:
            sub = sub_by_key.get((country, sub_slug))
            if not sub:
                continue
            await _upsert_assignment(
                session,
                category_id=sub.category_id, subcategory_id=sub.id,
                attribute_id=attr_id,
                is_required=overrides.get("is_required", False),
                sort_order=overrides.get("sort_order", _default_sort(attr_key)),
                customer_visible=overrides.get("customer_visible", True),
                supplier_editable=overrides.get("supplier_editable", True),
            )
            stats["overrides"] += 1

    logger.info("baked.shop.attributes_seed done stats=%s", stats)
    return stats


def _default_sort(key: str) -> int:
    """Order attributes consistently on forms + PDP."""
    order = {
        "condition": 10, "colour": 20, "size": 30,
        "ram": 40, "storage": 50, "warranty": 60,
    }
    return order.get(key, 99)
