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


# Curated per-subcategory keyword bank so demo images actually match the
# product name (e.g. "robes-femme" → dress photos, not generic fashion).
# Uses picsum's `source.unsplash.com` proxy which does keyword search under
# the hood. Deterministic per (subcategory slug, variant idx).
_SUBCAT_QUERY = {
    "robes-femme": "dress",
    "jupes-femme": "skirt",
    "mode-contemporaine-femme": "womens-fashion",
    "mode-vintage-femme": "vintage-fashion",
    "ensembles-combinaisons-femme": "jumpsuit",
    "streetwear-femme": "streetwear",
    "grandes-tailles-femme": "plus-size-fashion",
    "lingerie-femme": "lingerie",
    "boutique-femme": "boutique",
    "robes-soiree-femme": "evening-dress",
    "chaussettes-collants-femme": "tights",
    "accessoires-mode-femme": "fashion-accessories",
    "chemises-homme": "mens-shirt",
    "costumes-manteaux-homme": "mens-suit",
    "vetements-travail": "workwear",
    "ensembles-homme": "mens-outfit",
    "mode-vintage-homme": "vintage-menswear",
    "mode-moderne-homme": "modern-menswear",
    "streetwear-homme": "mens-streetwear",
    "sous-vetements-homme": "boxers",
    "boutique-homme": "menswear",
    "accessoires-mode-homme": "mens-accessories",
    "smartphones": "smartphone",
    "smartphones-telephones": "smartphone",
    "laptops": "laptop",
    "casques-audio": "headphones",
    "enceintes": "speaker",
    "televisions": "television",
    "tablettes": "tablet",
    "montres-connectees": "smartwatch",
    "consoles": "gaming-console",
    "jeux-video": "video-game",
    "canapes": "sofa",
    "chaises": "chair",
    "tables": "dining-table",
    "lits": "bed",
    "matelas": "mattress",
    "luminaires": "lamp",
    "rideaux": "curtains",
    "tapis": "rug",
    "art-mural": "wall-art",
    "vaisselle": "tableware",
    "casseroles-poeles": "cookware",
    "sneakers": "sneakers",
    "chaussures-hommes": "mens-shoes",
    "chaussures-femmes": "womens-shoes",
    "bottes-femme": "boots",
    "sandales": "sandals",
    "sacs-a-main": "handbag",
    "sacs-a-dos": "backpack",
    "valises": "suitcase",
    "portefeuilles": "wallet",
    "montres": "watch",
    "colliers": "necklace",
    "bagues": "ring",
    "lunettes-de-soleil": "sunglasses",
    "parfums": "perfume",
    "maquillage": "makeup",
    "soins-visage": "skincare",
    "soins-cheveux": "haircare",
    "livres": "books",
    "papeterie": "stationery",
    "cadeaux": "gift-box",
}


# Curated Unsplash CDN URLs grouped by broad "theme" — mapped from
# subcategory slugs below. Every URL is a direct `images.unsplash.com`
# permalink that survives without the deprecated `source.unsplash.com`
# redirector. Kept small (~4-6 per theme) so images feel varied but stay
# relevant to the product name.
_THEME_URLS = {
    "dress": [
        "https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=600&q=70",
        "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=600&q=70",
        "https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=600&q=70",
        "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=600&q=70",
    ],
    "skirt": [
        "https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=600&q=70",
        "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=600&q=70",
        "https://images.unsplash.com/photo-1582142306909-195724d33ffc?w=600&q=70",
    ],
    "womens-fashion": [
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=70",
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=70",
        "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=70",
        "https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&q=70",
    ],
    "lingerie": [
        "https://images.unsplash.com/photo-1571908599407-cdb918ed83bf?w=600&q=70",
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=70",
    ],
    "menswear": [
        "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=600&q=70",
        "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=600&q=70",
        "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=70",
        "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=70",
    ],
    "mens-shirt": [
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&q=70",
        "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&q=70",
        "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=70",
    ],
    "mens-suit": [
        "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&q=70",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&q=70",
    ],
    "workwear": [
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=70",
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=70",
    ],
    "kids": [
        "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=600&q=70",
        "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=600&q=70",
        "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600&q=70",
    ],
    "sneakers": [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=70",
        "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=70",
        "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=600&q=70",
        "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&q=70",
    ],
    "mens-shoes": [
        "https://images.unsplash.com/photo-1449505278894-297fdb3edbc1?w=600&q=70",
        "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600&q=70",
    ],
    "womens-shoes": [
        "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=600&q=70",
        "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600&q=70",
    ],
    "bag": [
        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=70",
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=70",
        "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600&q=70",
    ],
    "backpack": [
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=70",
        "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&q=70",
    ],
    "suitcase": [
        "https://images.unsplash.com/photo-1553603227-2358aabe821e?w=600&q=70",
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=70",
    ],
    "watch": [
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=70",
        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=70",
        "https://images.unsplash.com/photo-1622434641406-a158123450f9?w=600&q=70",
    ],
    "jewelry": [
        "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600&q=70",
        "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=70",
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&q=70",
    ],
    "sunglasses": [
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&q=70",
        "https://images.unsplash.com/photo-1508296695146-257a814070b4?w=600&q=70",
    ],
    "smartphone": [
        "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=600&q=70",
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=70",
        "https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=600&q=70",
    ],
    "apple": [
        "https://images.unsplash.com/photo-1611186871348-b1ce837f0479?w=600&q=70",
        "https://images.unsplash.com/photo-1592286927505-1def25115558?w=600&q=70",
    ],
    "laptop": [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=70",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&q=70",
        "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600&q=70",
    ],
    "tablet": [
        "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&q=70",
        "https://images.unsplash.com/photo-1585789575349-27f77bcfec2f?w=600&q=70",
    ],
    "headphones": [
        "https://images.unsplash.com/photo-1518444065439-e933c06ce9cd?w=600&q=70",
        "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=70",
        "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&q=70",
    ],
    "speaker": [
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=70",
        "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&q=70",
    ],
    "television": [
        "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&q=70",
        "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=600&q=70",
    ],
    "gaming-console": [
        "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=70",
        "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=600&q=70",
        "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&q=70",
    ],
    "sofa": [
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=70",
        "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&q=70",
    ],
    "chair": [
        "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=600&q=70",
        "https://images.unsplash.com/photo-1519947486511-46149fa0a254?w=600&q=70",
    ],
    "dining-table": [
        "https://images.unsplash.com/photo-1517705008128-361805f42e86?w=600&q=70",
        "https://images.unsplash.com/photo-1533090368676-1fd25485db88?w=600&q=70",
    ],
    "bed": [
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=600&q=70",
        "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&q=70",
    ],
    "mattress": [
        "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=70",
    ],
    "lamp": [
        "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=70",
        "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600&q=70",
    ],
    "rug": [
        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&q=70",
    ],
    "perfume": [
        "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600&q=70",
        "https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=70",
        "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&q=70",
    ],
    "makeup": [
        "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&q=70",
        "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&q=70",
        "https://images.unsplash.com/photo-1583241800698-e8ab01830a07?w=600&q=70",
    ],
    "skincare": [
        "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=70",
        "https://images.unsplash.com/photo-1570194065650-d99fb4bedf0a?w=600&q=70",
    ],
    "books": [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=70",
        "https://images.unsplash.com/photo-1519682337058-a94d519337bc?w=600&q=70",
    ],
    "stationery": [
        "https://images.unsplash.com/photo-1519337265831-281ec6cc8514?w=600&q=70",
        "https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=600&q=70",
    ],
    "cookware": [
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=70",
        "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&q=70",
    ],
    "sports": [
        "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&q=70",
        "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&q=70",
        "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=70",
    ],
    "tools": [
        "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=600&q=70",
        "https://images.unsplash.com/photo-1581147036324-c1c9bf9d75b1?w=600&q=70",
    ],
    "default": [
        "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600&q=70",
        "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=600&q=70",
    ],
}

# Subcategory slug → theme key. Bucket everything we know about; unknown
# slugs fall back to `_slug_to_theme` fuzzy match below.
_SUBCAT_THEME = {
    # Fashion — women
    "robes-femme": "dress", "jupes-femme": "skirt",
    "mode-contemporaine-femme": "womens-fashion", "mode-vintage-femme": "womens-fashion",
    "streetwear-femme": "womens-fashion", "grandes-tailles-femme": "womens-fashion",
    "boutique-femme": "womens-fashion", "robes-soiree-femme": "dress",
    "chaussettes-collants-femme": "womens-fashion", "lingerie-femme": "lingerie",
    "ensembles-combinaisons-femme": "womens-fashion",
    "accessoires-mode-femme": "jewelry",
    # Fashion — men
    "chemises-homme": "mens-shirt", "costumes-manteaux-homme": "mens-suit",
    "vetements-travail": "workwear", "ensembles-homme": "menswear",
    "mode-vintage-homme": "menswear", "mode-moderne-homme": "menswear",
    "streetwear-homme": "menswear", "sous-vetements-homme": "menswear",
    "boutique-homme": "menswear", "accessoires-mode-homme": "watch",
    # Footwear
    "sneakers": "sneakers", "chaussures-hommes": "mens-shoes", "chaussures-femmes": "womens-shoes",
    "bottes-femme": "womens-shoes", "sandales": "sneakers",
    # Bags
    "sacs-a-main": "bag", "sacs-a-dos": "backpack", "valises": "suitcase", "portefeuilles": "bag",
    # Jewelry / accessories
    "montres": "watch", "colliers": "jewelry", "bagues": "jewelry", "lunettes-de-soleil": "sunglasses",
    # Tech
    "smartphones": "smartphone", "smartphones-telephones": "smartphone",
    "accessoires-apple": "apple", "iphone": "apple",
    "laptops": "laptop", "ordinateurs": "laptop", "tablettes": "tablet",
    "casques-audio": "headphones", "enceintes": "speaker", "televisions": "television",
    "montres-connectees": "watch", "consoles": "gaming-console", "jeux-video": "gaming-console",
    # Home
    "canapes": "sofa", "chaises": "chair", "tables": "dining-table",
    "lits": "bed", "matelas": "mattress", "luminaires": "lamp",
    "rideaux": "default", "tapis": "rug", "vaisselle": "cookware", "casseroles-poeles": "cookware",
    # Beauty
    "parfums": "perfume", "maquillage": "makeup", "soins-visage": "skincare", "soins-cheveux": "skincare",
    # Books / stationery
    "livres": "books", "papeterie": "stationery",
    # Sports / tools
    "sports": "sports", "outils-entretien": "tools", "outils-maintenance": "tools",
}

_FUZZY_HINTS = [
    ("femme", "womens-fashion"), ("homme", "menswear"), ("enfant", "kids"), ("bebe", "kids"),
    ("chaussure", "sneakers"), ("sneaker", "sneakers"),
    ("sac", "bag"), ("bagage", "suitcase"),
    ("smartphone", "smartphone"), ("phone", "smartphone"),
    ("apple", "apple"), ("iphone", "apple"),
    ("laptop", "laptop"), ("ordinateur", "laptop"),
    ("audio", "headphones"), ("casque", "headphones"), ("enceinte", "speaker"),
    ("tv", "television"), ("tele", "television"),
    ("game", "gaming-console"), ("jeu", "gaming-console"), ("console", "gaming-console"),
    ("canape", "sofa"), ("chaise", "chair"), ("table", "dining-table"),
    ("lit", "bed"), ("matelas", "mattress"), ("lumin", "lamp"),
    ("parfum", "perfume"), ("makeup", "makeup"), ("cosme", "makeup"), ("beaute", "makeup"),
    ("livre", "books"), ("papet", "stationery"),
    ("sport", "sports"), ("outil", "tools"), ("auto", "tools"), ("moto", "tools"),
    ("bijou", "jewelry"), ("montre", "watch"), ("lunette", "sunglasses"),
]


def _slug_to_theme(slug: str) -> str:
    if slug in _SUBCAT_THEME:
        return _SUBCAT_THEME[slug]
    s = slug.lower()
    for token, theme in _FUZZY_HINTS:
        if token in s:
            return theme
    return "default"


def _keyword_image(sub_slug: str, idx: int) -> str:
    theme = _slug_to_theme(sub_slug)
    bank = _THEME_URLS.get(theme, _THEME_URLS["default"])
    # Deterministic pick keyed on (slug, idx) so re-seeds are stable.
    pick = (abs(hash((sub_slug, idx))) % len(bank))
    return bank[pick]


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

    Multi-region: each supported market has its own currency + price scale.
    For India (IN) prices are quoted directly in INR (₹). India uses a
    country-prefixed demo id (`shpprd_demo_in_<slug>`) so its rows never
    collide with the Côte d'Ivoire (CI) catalogue.
    """
    stats = {"products_inserted": 0, "variants_inserted": 0, "skipped": 0}

    # QA v15 §4 — currency map. Multiplier converts the CI (XOF-denominated)
    # variant prices to the target market's currency. Values are rounded to
    # keep tags "clean" (₹ prices don't need decimals).
    currency_cfg = {
        "CI": {"currency": "XOF", "mult": 1.0,   "id_prefix": "shpprd_demo"},
        "IN": {"currency": "INR", "mult": 0.14,  "id_prefix": "shpprd_demo_in"},
    }.get(country.upper(), {"currency": "XOF", "mult": 1.0, "id_prefix": "shpprd_demo"})
    currency = currency_cfg["currency"]
    mult = currency_cfg["mult"]
    id_prefix = currency_cfg["id_prefix"]

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
            demo_pid = f"{id_prefix}_{sub.slug}"[:64]

            existing = await session.get(ShopProduct, demo_pid)
            if existing:
                stats["skipped"] += 1
                continue

            sub_name = sub.name_en or sub.name_fr or sub.slug.replace("-", " ").title()
            hero_img = _keyword_image(sub.slug, 0)
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
                images=[hero_img],
                attributes={},
                status="active",
                published_at=datetime.now(timezone.utc),
            )
            session.add(product)
            stats["products_inserted"] += 1

            for v_idx, (suffix, price, compare, stock, attrs) in enumerate(variants_blueprint):
                scaled_price = max(1, int(round(price * mult)))
                scaled_compare = max(1, int(round(compare * mult))) if compare else None
                variant = ShopVariant(
                    id=f"shpvar_demo_{country.lower()}_{sub.slug}_{v_idx}"[:64],
                    product_id=demo_pid,
                    sku=f"DEMO-{country.upper()}-{sub.slug.upper()[:10]}-{v_idx + 1}",
                    title_suffix=suffix,
                    price=scaled_price,
                    compare_at_price=scaled_compare,
                    currency=currency,
                    stock_qty=stock,
                    condition="new",
                    attributes=attrs,
                    images=[_keyword_image(sub.slug, v_idx + 1)],
                    is_active=True,
                )
                session.add(variant)
                stats["variants_inserted"] += 1

    if stats["products_inserted"] or stats["variants_inserted"]:
        await session.flush()
        logger.info(
            "shop.demo_seed country=%s inserted products=%s variants=%s (skipped existing=%s)",
            country, stats["products_inserted"], stats["variants_inserted"], stats["skipped"],
        )
    return stats
