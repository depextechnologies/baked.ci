"""Idempotent seed — Countries, Modules, MART categories, MART products, MART offers, MART stores.

Run on startup. Adding a new country = add here + insert.
"""
from __future__ import annotations
from core.db import db
from core.models_base import _now_iso, new_id


# ---------- data ----------
COUNTRIES = [
    {
        "code": "CI",
        "name": "Côte d'Ivoire",
        "flag": "🇨🇮",
        "currency": "XOF",
        "currency_symbol": "CFA",
        "locale": "fr-CI",
        "phone_code": "+225",
        "timezone": "Africa/Abidjan",
        "active": True,
        "primary": True,
        "min_order": 3000,
        "delivery_fee": 500,
        "free_delivery_over": 15000,
        "delivery_eta_min": "10-15 min",
    },
    {
        "code": "GB",
        "name": "United Kingdom",
        "flag": "🇬🇧",
        "currency": "GBP",
        "currency_symbol": "£",
        "locale": "en-GB",
        "phone_code": "+44",
        "timezone": "Europe/London",
        "active": True,
        "primary": False,
        "min_order": 10,
        "delivery_fee": 1.99,
        "free_delivery_over": 25,
        "delivery_eta_min": "10-15 min",
    },
]

MODULES = [
    {"code": "mart", "name": "MARTbakēd", "tagline": "Groceries & Daily Needs", "color": "#77BC1F", "icon": "shopping-basket", "order": 1, "status": "active"},
    {"code": "food", "name": "FOODbakēd", "tagline": "Restaurants & Food", "color": "#77BC1F", "icon": "utensils", "order": 2, "status": "coming_soon"},
    {"code": "shop", "name": "SHOPbakēd", "tagline": "Electronics & Lifestyle", "color": "#FCC44C", "icon": "shopping-bag", "order": 3, "status": "coming_soon"},
    {"code": "express", "name": "EXPRESSbakēd", "tagline": "Courier & Delivery", "color": "#FCC44C", "icon": "truck", "order": 4, "status": "coming_soon"},
    {"code": "auto", "name": "AUTObakēd", "tagline": "Vehicles & Services", "color": "#FF4C52", "icon": "car", "order": 5, "status": "coming_soon"},
    {"code": "immo", "name": "IMMObakēd", "tagline": "Real Estate & Property", "color": "#A659FF", "icon": "home", "order": 6, "status": "coming_soon"},
]

CATEGORIES = [
    ("fruits-vegetables", "Fruits & Légumes", "Fruits & Vegetables", "leaf", "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400&auto=format&fit=crop&q=60"),
    ("dairy-eggs", "Produits Laitiers & Œufs", "Dairy & Eggs", "milk", "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&auto=format&fit=crop&q=60"),
    ("snacks", "Snacks", "Snacks & Munchies", "cookie", "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&auto=format&fit=crop&q=60"),
    ("beverages", "Boissons", "Beverages", "cup-soda", "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&auto=format&fit=crop&q=60"),
    ("bakery", "Boulangerie", "Bakery & Bread", "croissant", "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=60"),
    ("household", "Ménage", "Household Care", "sparkles", "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&auto=format&fit=crop&q=60"),
    ("meat-seafood", "Viande & Fruits de Mer", "Meat & Seafood", "beef", "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&auto=format&fit=crop&q=60"),
    ("personal-care", "Soins Personnels", "Personal Care", "heart", "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=400&auto=format&fit=crop&q=60"),
    ("baby-care", "Bébé", "Baby Care", "baby", "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&auto=format&fit=crop&q=60"),
]

PRODUCTS_CI = [
    # (name, brand, category_slug, unit, price XOF, was_price, image, popularity, badge)
    ("Banane Cavendish", "Local", "fruits-vegetables", "1 kg", 800, 1000, "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=500&auto=format&fit=crop&q=60", 95, "20% OFF"),
    ("Lait Frais", "Bridel", "dairy-eggs", "1 L", 700, 850, "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60", 92, "15% OFF"),
    ("Chips Classic", "Lay's", "snacks", "52g", 500, 700, "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=500&auto=format&fit=crop&q=60", 88, "25% OFF"),
    ("Œufs Fermiers", "Local Farm", "dairy-eggs", "6 pièces", 900, 1000, "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=500&auto=format&fit=crop&q=60", 90, "10% OFF"),
    ("Tomates Fraîches", "Local", "fruits-vegetables", "1 kg", 1200, 1500, "https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=500&auto=format&fit=crop&q=60", 85, "20% OFF"),
    ("Gel Douche Dove", "Dove", "personal-care", "250 ml", 1600, 1900, "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&auto=format&fit=crop&q=60", 78, "15% OFF"),
    ("Pain de Mie", "Boulangerie", "bakery", "500 g", 1000, None, "https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=500&auto=format&fit=crop&q=60", 82, None),
    ("Coca-Cola", "Coca-Cola", "beverages", "1.5 L", 900, 1100, "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60", 91, "18% OFF"),
    ("Riz Basmati", "Uncle Ben's", "household", "5 kg", 6500, 7500, "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60", 80, "13% OFF"),
    ("Yaourt Nature", "Danone", "dairy-eggs", "4x125g", 1400, None, "https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=500&auto=format&fit=crop&q=60", 76, None),
    ("Mangue Kent", "Local", "fruits-vegetables", "1 kg", 1500, 1800, "https://images.unsplash.com/photo-1553279768-865429fa0078?w=500&auto=format&fit=crop&q=60", 84, "17% OFF"),
    ("Poulet Entier", "Ferme", "meat-seafood", "1.2 kg", 3200, 3800, "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=60", 79, "16% OFF"),
    ("Chocolat au Lait", "Milka", "snacks", "100 g", 1100, 1300, "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=500&auto=format&fit=crop&q=60", 83, "15% OFF"),
    ("Croissants x4", "Boulangerie", "bakery", "4 pièces", 1200, None, "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60", 74, None),
    ("Eau Minérale", "Awa", "beverages", "6x1.5 L", 1800, 2100, "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500&auto=format&fit=crop&q=60", 89, "14% OFF"),
    ("Lessive Ariel", "Ariel", "household", "2 L", 4500, 5200, "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&auto=format&fit=crop&q=60", 72, "13% OFF"),
    ("Ananas Frais", "Local", "fruits-vegetables", "1 pièce", 1000, None, "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=500&auto=format&fit=crop&q=60", 81, None),
    ("Fromage Emmental", "Président", "dairy-eggs", "200 g", 2400, 2700, "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=500&auto=format&fit=crop&q=60", 77, "11% OFF"),
    ("Biscuits Choco", "LU", "snacks", "300 g", 1600, 1900, "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=60", 86, "16% OFF"),
    ("Jus d'Orange", "Tropicana", "beverages", "1 L", 1400, 1600, "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500&auto=format&fit=crop&q=60", 88, "13% OFF"),
    ("Baguette Tradition", "Boulangerie", "bakery", "1 pièce", 400, None, "https://images.unsplash.com/photo-1568471173242-461f0a730452?w=500&auto=format&fit=crop&q=60", 93, None),
    ("Poisson Bar", "Marée du jour", "meat-seafood", "500 g", 4200, None, "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=500&auto=format&fit=crop&q=60", 70, None),
    ("Couches Bébé", "Pampers", "baby-care", "34 pcs", 8500, 9500, "https://images.unsplash.com/photo-1522771930-78848d9293e8?w=500&auto=format&fit=crop&q=60", 75, "11% OFF"),
    ("Shampoing", "Head & Shoulders", "personal-care", "400 ml", 2800, 3200, "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&auto=format&fit=crop&q=60", 73, "13% OFF"),
]

OFFERS_CI = [
    {"title": "Livraison Gratuite dès 15 000 CFA", "subtitle": "Sur toutes vos courses MART", "color": "#77BC1F", "order": 1},
    {"title": "-25% sur les Snacks", "subtitle": "Cette semaine seulement", "color": "#FCC44C", "order": 2},
    {"title": "Nouveauté: Fruits & Légumes locaux", "subtitle": "Directement des producteurs ivoiriens", "color": "#1D9BF0", "order": 3},
]

STORES_CI = [
    {"name": "MARTbakēd Cocody", "address": "Rue des Jardins, Cocody, Abidjan", "eta": "10-15 min", "rating": 4.7},
    {"name": "MARTbakēd Plateau", "address": "Boulevard de la République, Plateau", "eta": "12-18 min", "rating": 4.6},
    {"name": "MARTbakēd Marcory", "address": "Zone 4, Marcory", "eta": "15-20 min", "rating": 4.5},
]


# ---------- runner ----------
async def _seed_countries():
    for c in COUNTRIES:
        await db.countries.update_one({"code": c["code"]}, {"$set": c}, upsert=True)


async def _seed_module_configs():
    for country in COUNTRIES:
        for m in MODULES:
            key = {"scope": "module", "module": m["code"], "country": country["code"]}
            doc = {**key, **m}
            await db.configurations.update_one(key, {"$set": doc}, upsert=True)


async def _seed_categories():
    for country in COUNTRIES:
        for order, (slug, fr, en, icon, image) in enumerate(CATEGORIES, start=1):
            name = fr if country["locale"].startswith("fr") else en
            key = {"slug": slug, "country": country["code"]}
            doc = {
                **key,
                "id": new_id("cat"),
                "name": name,
                "name_en": en,
                "name_fr": fr,
                "icon": icon,
                "image": image,
                "order": order,
                "module": "mart",
                "deleted_at": None,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            existing = await db.mart_categories.find_one(key, {"_id": 0})
            if existing:
                doc["id"] = existing["id"]
                doc["created_at"] = existing.get("created_at", _now_iso())
            await db.mart_categories.update_one(key, {"$set": doc}, upsert=True)


async def _seed_products():
    # CI products
    for name, brand, cat_slug, unit, price, was, image, pop, badge in PRODUCTS_CI:
        key = {"name": name, "country": "CI", "module": "mart"}
        doc = {
            **key,
            "id": new_id("prd"),
            "brand": brand,
            "category_slug": cat_slug,
            "unit": unit,
            "price": price,
            "was_price": was,
            "currency": "XOF",
            "currency_symbol": "CFA",
            "image": image,
            "images": [image],
            "popularity": pop,
            "badge": badge,
            "in_stock": True,
            "rating": round(3.8 + (pop % 12) / 10, 1),
            "review_count": (pop * 3) % 250 + 20,
            "description": f"{name} - {brand}. Livré en 10-15 minutes chez vous à Abidjan.",
            "deleted_at": None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        existing = await db.mart_products.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
            doc["created_at"] = existing.get("created_at", _now_iso())
        await db.mart_products.update_one(key, {"$set": doc}, upsert=True)

    # UK mirror (fewer products, GBP prices)
    for name, brand, cat_slug, unit, price_xof, was_xof, image, pop, badge in PRODUCTS_CI[:12]:
        gbp = round(price_xof / 750, 2)
        was_gbp = round(was_xof / 750, 2) if was_xof else None
        key = {"name": name, "country": "GB", "module": "mart"}
        doc = {
            **key,
            "id": new_id("prd"),
            "brand": brand,
            "category_slug": cat_slug,
            "unit": unit,
            "price": gbp,
            "was_price": was_gbp,
            "currency": "GBP",
            "currency_symbol": "£",
            "image": image,
            "images": [image],
            "popularity": pop,
            "badge": badge,
            "in_stock": True,
            "rating": round(3.8 + (pop % 12) / 10, 1),
            "review_count": (pop * 3) % 250 + 20,
            "description": f"{name} - {brand}. Delivered in 10-15 min in London.",
            "deleted_at": None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        existing = await db.mart_products.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_products.update_one(key, {"$set": doc}, upsert=True)


async def _seed_offers():
    for o in OFFERS_CI:
        key = {"title": o["title"], "country": "CI"}
        doc = {**key, **o, "active": True, "id": new_id("off"), "updated_at": _now_iso()}
        existing = await db.mart_offers.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_offers.update_one(key, {"$set": doc}, upsert=True)


async def _seed_stores():
    for s in STORES_CI:
        key = {"name": s["name"], "country": "CI"}
        doc = {**key, **s, "id": new_id("str"), "module": "mart", "deleted_at": None, "updated_at": _now_iso()}
        existing = await db.mart_stores.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_stores.update_one(key, {"$set": doc}, upsert=True)


async def run_seed():
    await _seed_countries()
    await _seed_module_configs()
    await _seed_categories()
    await _seed_products()
    await _seed_offers()
    await _seed_stores()
