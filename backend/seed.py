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
        "production_visible": True,
        "min_order": 3000,
        "delivery_fee": 500,
        "free_delivery_over": 15000,
        "delivery_eta_min": "10-15 min",
        # Serviceability: radius (km) from any active hub within this country
        "service_radius_km": 15,
    },
    {
        "code": "LR",
        "name": "Liberia",
        "flag": "🇱🇷",
        "currency": "LRD",
        "currency_symbol": "L$",
        "locale": "en-LR",
        "phone_code": "+231",
        "timezone": "Africa/Monrovia",
        "active": True,
        "primary": False,
        "production_visible": True,
        # Liberian Dollar denominated — round market values (approx: 1 USD ≈ 190 LRD)
        "min_order": 2000,
        "delivery_fee": 200,
        "free_delivery_over": 6000,
        "delivery_eta_min": "15-20 min",
        "service_radius_km": 15,
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

# category_slug -> list of (subcategory_slug, name_fr, name_en, image)
SUBCATEGORIES = {
    "fruits-vegetables": [
        ("fresh-vegetables", "Légumes Frais", "Fresh Vegetables", "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200&auto=format&fit=crop&q=60"),
        ("fresh-fruits", "Fruits Frais", "Fresh Fruits", "https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=200&auto=format&fit=crop&q=60"),
        ("mangoes-melons", "Mangues & Melons", "Mangoes & Melons", "https://images.unsplash.com/photo-1553279768-865429fa0078?w=200&auto=format&fit=crop&q=60"),
        ("tropical", "Tropicaux", "Tropical", "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=200&auto=format&fit=crop&q=60"),
        ("exotics", "Exotiques", "Exotics", "https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=200&auto=format&fit=crop&q=60"),
    ],
    "dairy-eggs": [
        ("milk", "Lait", "Milk", "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&auto=format&fit=crop&q=60"),
        ("cheese-butter", "Fromage & Beurre", "Cheese & Butter", "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=200&auto=format&fit=crop&q=60"),
        ("eggs", "Œufs", "Eggs", "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=200&auto=format&fit=crop&q=60"),
        ("yogurt", "Yaourt", "Yogurt", "https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=200&auto=format&fit=crop&q=60"),
    ],
    "snacks": [
        ("chips", "Chips", "Chips & Nachos", "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=200&auto=format&fit=crop&q=60"),
        ("biscuits", "Biscuits", "Biscuits & Cookies", "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=200&auto=format&fit=crop&q=60"),
        ("chocolates", "Chocolats", "Chocolates", "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=200&auto=format&fit=crop&q=60"),
    ],
    "beverages": [
        ("soft-drinks", "Sodas", "Soft Drinks", "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&auto=format&fit=crop&q=60"),
        ("juices", "Jus", "Juices", "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=200&auto=format&fit=crop&q=60"),
        ("water", "Eau", "Water", "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=200&auto=format&fit=crop&q=60"),
    ],
    "bakery": [
        ("breads", "Pains", "Breads", "https://images.unsplash.com/photo-1568471173242-461f0a730452?w=200&auto=format&fit=crop&q=60"),
        ("pastries", "Viennoiseries", "Pastries", "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200&auto=format&fit=crop&q=60"),
    ],
    "household": [
        ("grains", "Céréales & Riz", "Grains & Rice", "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200&auto=format&fit=crop&q=60"),
        ("cleaning", "Ménage", "Cleaning", "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=200&auto=format&fit=crop&q=60"),
    ],
    "meat-seafood": [
        ("poultry", "Volaille", "Poultry", "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=200&auto=format&fit=crop&q=60"),
        ("seafood", "Fruits de Mer", "Seafood", "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=200&auto=format&fit=crop&q=60"),
    ],
    "personal-care": [
        ("bath-body", "Bain & Corps", "Bath & Body", "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=200&auto=format&fit=crop&q=60"),
        ("hair-care", "Soins Cheveux", "Hair Care", "https://images.unsplash.com/photo-1626015449473-2c8dc5c9d3ea?w=200&auto=format&fit=crop&q=60"),
    ],
    "baby-care": [
        ("diapers", "Couches", "Diapers", "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=200&auto=format&fit=crop&q=60"),
    ],
}

# Map each seeded product name to its subcategory slug
PRODUCT_SUBCATEGORY = {
    "Banane Cavendish": "fresh-fruits",
    "Tomates Fraîches": "fresh-vegetables",
    "Mangue Kent": "mangoes-melons",
    "Ananas Frais": "tropical",
    "Lait Frais": "milk",
    "Œufs Fermiers": "eggs",
    "Yaourt Nature": "yogurt",
    "Fromage Emmental": "cheese-butter",
    "Chips Classic": "chips",
    "Biscuits Choco": "biscuits",
    "Chocolat au Lait": "chocolates",
    "Coca-Cola": "soft-drinks",
    "Eau Minérale": "water",
    "Jus d'Orange": "juices",
    "Pain de Mie": "breads",
    "Baguette Tradition": "breads",
    "Croissants x4": "pastries",
    "Riz Basmati": "grains",
    "Lessive Ariel": "cleaning",
    "Poulet Entier": "poultry",
    "Poisson Bar": "seafood",
    "Gel Douche Dove": "bath-body",
    "Shampoing": "hair-care",
    "Couches Bébé": "diapers",
}

# Extra products to fill every subcategory grid. Tuple:
# (name, brand, cat_slug, subcat_slug, unit, price_xof, was_xof, image, popularity, badge)
IMG = {
    "veg": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500&auto=format&fit=crop&q=60",
    "carrot": "https://images.unsplash.com/photo-1447175008436-054170c2e979?w=500&auto=format&fit=crop&q=60",
    "onion": "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=500&auto=format&fit=crop&q=60",
    "potato": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500&auto=format&fit=crop&q=60",
    "pepper": "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=500&auto=format&fit=crop&q=60",
    "garlic": "https://images.unsplash.com/photo-1615477550927-6ec8445fcfe9?w=500&auto=format&fit=crop&q=60",
    "apple": "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=500&auto=format&fit=crop&q=60",
    "orange": "https://images.unsplash.com/photo-1580052614034-c55d20bfee3b?w=500&auto=format&fit=crop&q=60",
    "strawberry": "https://images.unsplash.com/photo-1587393855524-087f83d95bc9?w=500&auto=format&fit=crop&q=60",
    "grape": "https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=500&auto=format&fit=crop&q=60",
    "watermelon": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500&auto=format&fit=crop&q=60",
    "melon": "https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=500&auto=format&fit=crop&q=60",
    "mango": "https://images.unsplash.com/photo-1553279768-865429fa0078?w=500&auto=format&fit=crop&q=60",
    "papaya": "https://images.unsplash.com/photo-1617112848923-cc2234396a8d?w=500&auto=format&fit=crop&q=60",
    "passion": "https://images.unsplash.com/photo-1604321929013-77dc0dcbc60f?w=500&auto=format&fit=crop&q=60",
    "guava": "https://images.unsplash.com/photo-1536511132770-e5058c7e8c46?w=500&auto=format&fit=crop&q=60",
    "coconut": "https://images.unsplash.com/photo-1581685691099-1f6bfd97dedf?w=500&auto=format&fit=crop&q=60",
    "kiwi": "https://images.unsplash.com/photo-1585059895524-72359e06133a?w=500&auto=format&fit=crop&q=60",
    "pomegranate": "https://images.unsplash.com/photo-1615485500704-8e990f9900f6?w=500&auto=format&fit=crop&q=60",
    "dragonfruit": "https://images.unsplash.com/photo-1527325678964-54921661f888?w=500&auto=format&fit=crop&q=60",
    "avocado": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=500&auto=format&fit=crop&q=60",
    "milk": "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60",
    "chocmilk": "https://images.unsplash.com/photo-1600788907416-456578634209?w=500&auto=format&fit=crop&q=60",
    "coconutmilk": "https://images.unsplash.com/photo-1615484477201-9f4953340fab?w=500&auto=format&fit=crop&q=60",
    "butter": "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=500&auto=format&fit=crop&q=60",
    "cheese": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=500&auto=format&fit=crop&q=60",
    "camembert": "https://images.unsplash.com/photo-1631379578550-7038263db1e0?w=500&auto=format&fit=crop&q=60",
    "eggs": "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=500&auto=format&fit=crop&q=60",
    "yogurt": "https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=500&auto=format&fit=crop&q=60",
    "greek": "https://images.unsplash.com/photo-1620189507187-1befbcae2606?w=500&auto=format&fit=crop&q=60",
    "chips": "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?w=500&auto=format&fit=crop&q=60",
    "tortilla": "https://images.unsplash.com/photo-1600952841320-db92ec4047ca?w=500&auto=format&fit=crop&q=60",
    "cookie": "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=60",
    "chocolate": "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=500&auto=format&fit=crop&q=60",
    "sprite": "https://images.unsplash.com/photo-1625740822002-1a3f38d5dc22?w=500&auto=format&fit=crop&q=60",
    "fanta": "https://images.unsplash.com/photo-1624517452488-04869289c4ca?w=500&auto=format&fit=crop&q=60",
    "juice": "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=500&auto=format&fit=crop&q=60",
    "sparkling": "https://images.unsplash.com/photo-1523362289600-a70b4a0e09aa?w=500&auto=format&fit=crop&q=60",
    "water": "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=500&auto=format&fit=crop&q=60",
    "bread": "https://images.unsplash.com/photo-1568471173242-461f0a730452?w=500&auto=format&fit=crop&q=60",
    "ciabatta": "https://images.unsplash.com/photo-1585478259715-876acc5be8eb?w=500&auto=format&fit=crop&q=60",
    "muffin": "https://images.unsplash.com/photo-1607958996333-41783b1b83b8?w=500&auto=format&fit=crop&q=60",
    "brioche": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60",
    "rice": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60",
    "pasta": "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=500&auto=format&fit=crop&q=60",
    "couscous": "https://images.unsplash.com/photo-1589308078054-832ff6a06947?w=500&auto=format&fit=crop&q=60",
    "detergent": "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=500&auto=format&fit=crop&q=60",
    "dishsoap": "https://images.unsplash.com/photo-1585421514284-efb74320a266?w=500&auto=format&fit=crop&q=60",
    "toiletpaper": "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=500&auto=format&fit=crop&q=60",
    "chicken": "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=60",
    "chickenbreast": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=500&auto=format&fit=crop&q=60",
    "shrimp": "https://images.unsplash.com/photo-1565680018434-b513d5573b07?w=500&auto=format&fit=crop&q=60",
    "tuna": "https://images.unsplash.com/photo-1611171711791-b34fa42e9135?w=500&auto=format&fit=crop&q=60",
    "salmon": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500&auto=format&fit=crop&q=60",
    "sardine": "https://images.unsplash.com/photo-1594760944230-49f79fd5e3d7?w=500&auto=format&fit=crop&q=60",
    "soap": "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&auto=format&fit=crop&q=60",
    "deodorant": "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&auto=format&fit=crop&q=60",
    "cream": "https://images.unsplash.com/photo-1608248511219-1ab8d5c2e56c?w=500&auto=format&fit=crop&q=60",
    "conditioner": "https://images.unsplash.com/photo-1626015449473-2c8dc5c9d3ea?w=500&auto=format&fit=crop&q=60",
    "hairmask": "https://images.unsplash.com/photo-1631730359585-38a4935cbec4?w=500&auto=format&fit=crop&q=60",
    "wipes": "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=500&auto=format&fit=crop&q=60",
    "babymilk": "https://images.unsplash.com/photo-1592892041693-fb2ff8ca3c65?w=500&auto=format&fit=crop&q=60",
}

EXTRA_PRODUCTS_CI = [
    # fresh-vegetables
    ("Carotte", "Local", "fruits-vegetables", "fresh-vegetables", "500 g", 700, 900, IMG["carrot"], 82, "22% OFF"),
    ("Oignon Rouge", "Local", "fruits-vegetables", "fresh-vegetables", "1 kg", 900, 1100, IMG["onion"], 87, "18% OFF"),
    ("Pomme de Terre", "Local", "fruits-vegetables", "fresh-vegetables", "1 kg", 1000, 1200, IMG["potato"], 88, "16% OFF"),
    ("Poivron Vert", "Local", "fruits-vegetables", "fresh-vegetables", "500 g", 1300, None, IMG["pepper"], 71, None),
    ("Ail Frais", "Local", "fruits-vegetables", "fresh-vegetables", "200 g", 800, None, IMG["garlic"], 68, None),
    # fresh-fruits
    ("Pomme Royale Gala", "Import", "fruits-vegetables", "fresh-fruits", "1 kg", 1800, 2100, IMG["apple"], 84, "14% OFF"),
    ("Orange Douce", "Local", "fruits-vegetables", "fresh-fruits", "1 kg", 1200, 1400, IMG["orange"], 86, "14% OFF"),
    ("Fraises", "Import", "fruits-vegetables", "fresh-fruits", "250 g", 2200, 2600, IMG["strawberry"], 79, "15% OFF"),
    ("Raisin Noir", "Import", "fruits-vegetables", "fresh-fruits", "500 g", 2400, None, IMG["grape"], 74, None),
    # mangoes-melons
    ("Mangue Amélie", "Local", "fruits-vegetables", "mangoes-melons", "1 kg", 1400, 1700, IMG["mango"], 83, "17% OFF"),
    ("Pastèque", "Local", "fruits-vegetables", "mangoes-melons", "1 pièce", 2500, 3000, IMG["watermelon"], 88, "16% OFF"),
    ("Melon Cantaloup", "Local", "fruits-vegetables", "mangoes-melons", "1 pièce", 1800, None, IMG["melon"], 76, None),
    ("Mangue Kent XL", "Local", "fruits-vegetables", "mangoes-melons", "2 pièces", 2000, 2300, IMG["mango"], 81, "13% OFF"),
    # tropical
    ("Fruit de la Passion", "Local", "fruits-vegetables", "tropical", "500 g", 1600, None, IMG["passion"], 72, None),
    ("Goyave", "Local", "fruits-vegetables", "tropical", "500 g", 1200, 1400, IMG["guava"], 74, "14% OFF"),
    ("Papaye", "Local", "fruits-vegetables", "tropical", "1 pièce", 1500, None, IMG["papaya"], 77, None),
    ("Noix de Coco Fraîche", "Local", "fruits-vegetables", "tropical", "1 pièce", 900, 1100, IMG["coconut"], 82, "18% OFF"),
    # exotics
    ("Kiwi", "Import", "fruits-vegetables", "exotics", "6 pièces", 2600, 3000, IMG["kiwi"], 71, "13% OFF"),
    ("Grenade", "Import", "fruits-vegetables", "exotics", "2 pièces", 2800, None, IMG["pomegranate"], 68, None),
    ("Dragon Fruit", "Import", "fruits-vegetables", "exotics", "1 pièce", 3200, 3700, IMG["dragonfruit"], 66, "14% OFF"),
    ("Avocat Hass", "Local", "fruits-vegetables", "exotics", "3 pièces", 1500, 1800, IMG["avocado"], 85, "17% OFF"),
    # milk
    ("Lait Chocolaté", "Bridel", "dairy-eggs", "milk", "1 L", 950, 1100, IMG["chocmilk"], 78, "14% OFF"),
    ("Lait Écrémé", "Bridel", "dairy-eggs", "milk", "1 L", 700, None, IMG["milk"], 74, None),
    ("Lait UHT Demi-écrémé", "Nestlé", "dairy-eggs", "milk", "1 L", 720, 850, IMG["milk"], 82, "15% OFF"),
    ("Lait de Coco", "Grace", "dairy-eggs", "milk", "400 ml", 1200, None, IMG["coconutmilk"], 69, None),
    # cheese-butter
    ("Beurre Doux", "Président", "dairy-eggs", "cheese-butter", "250 g", 2100, 2400, IMG["butter"], 80, "12% OFF"),
    ("Camembert", "Président", "dairy-eggs", "cheese-butter", "250 g", 2600, None, IMG["camembert"], 72, None),
    ("Fromage Râpé", "Président", "dairy-eggs", "cheese-butter", "200 g", 1900, 2200, IMG["cheese"], 76, "14% OFF"),
    ("Fromage de Chèvre", "Local", "dairy-eggs", "cheese-butter", "150 g", 2400, None, IMG["cheese"], 68, None),
    # eggs
    ("Œufs Brunches x12", "Local Farm", "dairy-eggs", "eggs", "12 pièces", 1800, 2100, IMG["eggs"], 84, "14% OFF"),
    ("Œufs Bio", "Local Farm", "dairy-eggs", "eggs", "6 pièces", 1600, None, IMG["eggs"], 71, None),
    ("Œufs XL", "Local Farm", "dairy-eggs", "eggs", "10 pièces", 2100, 2400, IMG["eggs"], 76, "13% OFF"),
    ("Œufs de Caille", "Local", "dairy-eggs", "eggs", "20 pièces", 2500, None, IMG["eggs"], 64, None),
    # yogurt
    ("Yaourt Vanille", "Danone", "dairy-eggs", "yogurt", "4x125g", 1500, 1700, IMG["yogurt"], 79, "12% OFF"),
    ("Yaourt Grec", "Danone", "dairy-eggs", "yogurt", "500 g", 2200, None, IMG["greek"], 74, None),
    ("Yaourt aux Fruits", "Danone", "dairy-eggs", "yogurt", "8x125g", 2600, 2900, IMG["yogurt"], 82, "10% OFF"),
    ("Kefir Nature", "Bio", "dairy-eggs", "yogurt", "500 ml", 1800, None, IMG["yogurt"], 65, None),
    # chips
    ("Chips Sel", "Lay's", "snacks", "chips", "45 g", 450, 600, IMG["chips"], 85, "25% OFF"),
    ("Chips Barbecue", "Lay's", "snacks", "chips", "45 g", 500, 700, IMG["chips"], 86, "28% OFF"),
    ("Chips Fromage", "Doritos", "snacks", "chips", "80 g", 900, 1100, IMG["chips"], 82, "18% OFF"),
    ("Tortillas Chips", "Doritos", "snacks", "chips", "100 g", 1100, None, IMG["tortilla"], 76, None),
    # biscuits
    ("Petit Beurre", "LU", "snacks", "biscuits", "200 g", 1000, 1200, IMG["cookie"], 84, "16% OFF"),
    ("Sablés", "LU", "snacks", "biscuits", "150 g", 900, None, IMG["cookie"], 75, None),
    ("Cookies", "Milka", "snacks", "biscuits", "200 g", 1500, 1800, IMG["cookie"], 80, "16% OFF"),
    ("Spéculoos", "Lotus", "snacks", "biscuits", "250 g", 1700, None, IMG["cookie"], 73, None),
    # chocolates
    ("Kit Kat", "Nestlé", "snacks", "chocolates", "4 barres", 1200, 1400, IMG["chocolate"], 87, "14% OFF"),
    ("Ferrero Rocher", "Ferrero", "snacks", "chocolates", "24 pièces", 6500, 7200, IMG["chocolate"], 74, "10% OFF"),
    ("Snickers", "Mars", "snacks", "chocolates", "4 barres", 1400, None, IMG["chocolate"], 82, None),
    ("Bounty", "Mars", "snacks", "chocolates", "4 barres", 1350, 1500, IMG["chocolate"], 78, "10% OFF"),
    # soft-drinks
    ("Sprite", "Coca-Cola", "beverages", "soft-drinks", "1.5 L", 900, None, IMG["sprite"], 84, None),
    ("Fanta Orange", "Coca-Cola", "beverages", "soft-drinks", "1.5 L", 900, 1050, IMG["fanta"], 86, "14% OFF"),
    ("Ice Tea Pêche", "Lipton", "beverages", "soft-drinks", "1.5 L", 1100, None, IMG["fanta"], 80, None),
    ("Pepsi", "PepsiCo", "beverages", "soft-drinks", "1.5 L", 850, 1000, IMG["sprite"], 79, "15% OFF"),
    # juices
    ("Jus de Pomme", "Tropicana", "beverages", "juices", "1 L", 1500, None, IMG["juice"], 81, None),
    ("Jus Multivitaminé", "Tropicana", "beverages", "juices", "1 L", 1600, 1800, IMG["juice"], 84, "11% OFF"),
    ("Jus d'Ananas", "Tropicana", "beverages", "juices", "1 L", 1400, None, IMG["juice"], 76, None),
    ("Jus de Mangue", "Local", "beverages", "juices", "1 L", 1500, 1750, IMG["juice"], 78, "14% OFF"),
    # water
    ("Eau Gazeuse", "Perrier", "beverages", "water", "1 L", 1500, None, IMG["sparkling"], 74, None),
    ("Eau Vittel", "Vittel", "beverages", "water", "1.5 L", 1200, 1400, IMG["water"], 82, "14% OFF"),
    ("Eau Minérale Awa 12x", "Awa", "beverages", "water", "12x500 ml", 2200, None, IMG["water"], 88, None),
    # breads
    ("Pain Complet", "Boulangerie", "bakery", "breads", "500 g", 1200, None, IMG["bread"], 79, None),
    ("Pain Ciabatta", "Boulangerie", "bakery", "breads", "300 g", 1300, 1500, IMG["ciabatta"], 76, "13% OFF"),
    ("Pain aux Céréales", "Boulangerie", "bakery", "breads", "500 g", 1400, None, IMG["bread"], 74, None),
    # pastries
    ("Pain au Chocolat", "Boulangerie", "bakery", "pastries", "4 pièces", 1400, 1600, IMG["brioche"], 87, "13% OFF"),
    ("Muffins Chocolat", "Boulangerie", "bakery", "pastries", "4 pièces", 1800, None, IMG["muffin"], 76, None),
    ("Brioche Tressée", "Boulangerie", "bakery", "pastries", "400 g", 1500, 1800, IMG["brioche"], 80, "17% OFF"),
    ("Tarte aux Pommes", "Boulangerie", "bakery", "pastries", "1 pièce", 3200, None, IMG["muffin"], 68, None),
    # grains
    ("Riz Jasmin", "Uncle Ben's", "household", "grains", "5 kg", 6800, None, IMG["rice"], 78, None),
    ("Couscous Fin", "Ferrero", "household", "grains", "1 kg", 1600, 1900, IMG["couscous"], 74, "16% OFF"),
    ("Pâtes Spaghetti", "Barilla", "household", "grains", "500 g", 900, 1100, IMG["pasta"], 82, "18% OFF"),
    ("Semoule Fine", "Local", "household", "grains", "1 kg", 1200, None, IMG["couscous"], 70, None),
    # cleaning
    ("Liquide Vaisselle", "Fairy", "household", "cleaning", "1 L", 1400, 1650, IMG["dishsoap"], 79, "15% OFF"),
    ("Nettoyant Sol", "Mr Propre", "household", "cleaning", "1.25 L", 2000, None, IMG["detergent"], 72, None),
    ("Papier Toilette 12x", "Lotus", "household", "cleaning", "12 rouleaux", 3600, 4200, IMG["toiletpaper"], 84, "14% OFF"),
    ("Éponges de Cuisine", "Local", "household", "cleaning", "6 pcs", 800, None, IMG["dishsoap"], 68, None),
    # poultry
    ("Ailes de Poulet", "Ferme", "meat-seafood", "poultry", "500 g", 1800, 2100, IMG["chicken"], 82, "14% OFF"),
    ("Blancs de Poulet", "Ferme", "meat-seafood", "poultry", "500 g", 2600, None, IMG["chickenbreast"], 78, None),
    ("Cuisses de Poulet", "Ferme", "meat-seafood", "poultry", "1 kg", 2800, 3200, IMG["chicken"], 84, "13% OFF"),
    ("Nuggets Poulet", "Maggi", "meat-seafood", "poultry", "500 g", 2400, None, IMG["chickenbreast"], 74, None),
    # seafood
    ("Crevettes Roses", "Marée du jour", "meat-seafood", "seafood", "500 g", 5500, 6500, IMG["shrimp"], 76, "15% OFF"),
    ("Thon en Boîte", "Saupiquet", "meat-seafood", "seafood", "3x140 g", 2200, None, IMG["tuna"], 80, None),
    ("Saumon Fumé", "Labeyrie", "meat-seafood", "seafood", "200 g", 4800, 5400, IMG["salmon"], 72, "11% OFF"),
    ("Sardines Huile", "La Belle-Iloise", "meat-seafood", "seafood", "115 g", 1200, None, IMG["sardine"], 74, None),
    # bath-body
    ("Savon Dove", "Dove", "personal-care", "bath-body", "4 pains", 2400, 2800, IMG["soap"], 82, "14% OFF"),
    ("Déodorant Rexona", "Rexona", "personal-care", "bath-body", "150 ml", 1800, None, IMG["deodorant"], 79, None),
    ("Crème Corps Nivea", "Nivea", "personal-care", "bath-body", "400 ml", 2600, 3000, IMG["cream"], 74, "13% OFF"),
    ("Éponge de Bain", "Local", "personal-care", "bath-body", "1 pièce", 700, None, IMG["soap"], 62, None),
    # hair-care
    ("Après-Shampoing", "L'Oréal", "personal-care", "hair-care", "400 ml", 2500, 2900, IMG["conditioner"], 78, "13% OFF"),
    ("Sérum Cheveux", "L'Oréal", "personal-care", "hair-care", "100 ml", 3800, None, IMG["conditioner"], 68, None),
    ("Masque Capillaire", "Garnier", "personal-care", "hair-care", "300 ml", 2200, 2600, IMG["hairmask"], 72, "15% OFF"),
    ("Gel Coiffant", "Dax", "personal-care", "hair-care", "200 g", 1400, None, IMG["conditioner"], 70, None),
    # diapers / baby
    ("Lingettes Bébé", "Pampers", "baby-care", "diapers", "72 pcs", 2400, 2800, IMG["wipes"], 82, "14% OFF"),
    ("Lait Bébé 1er Âge", "Nestlé", "baby-care", "diapers", "800 g", 12500, None, IMG["babymilk"], 74, None),
    ("Shampoing Bébé", "Mixa", "baby-care", "diapers", "300 ml", 2600, 3000, IMG["babymilk"], 68, "13% OFF"),
    ("Crème Change Bébé", "Mustela", "baby-care", "diapers", "100 ml", 3800, None, IMG["cream"], 66, None),
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
    {"name": "MARTbakēd Cocody", "address": "Rue des Jardins, Cocody, Abidjan", "eta": "10-15 min", "rating": 4.7, "country": "CI", "latitude": 5.3600, "longitude": -4.0000},
    {"name": "MARTbakēd Plateau", "address": "Boulevard de la République, Plateau", "eta": "12-18 min", "rating": 4.6, "country": "CI", "latitude": 5.3200, "longitude": -4.0200},
    {"name": "MARTbakēd Marcory", "address": "Zone 4, Marcory", "eta": "15-20 min", "rating": 4.5, "country": "CI", "latitude": 5.2914, "longitude": -3.9899},
]

STORES_LR = [
    {"name": "MARTbakēd Sinkor", "address": "Tubman Boulevard, Sinkor, Monrovia", "eta": "15-20 min", "rating": 4.6, "country": "LR", "latitude": 6.2833, "longitude": -10.7783},
    {"name": "MARTbakēd Congo Town", "address": "Congo Town, Monrovia", "eta": "20-25 min", "rating": 4.5, "country": "LR", "latitude": 6.2500, "longitude": -10.7500},
]

CITIES_CI = [
    {"name": "Abidjan", "country": "CI", "latitude": 5.3600, "longitude": -4.0083},
    {"name": "Bouaké", "country": "CI", "latitude": 7.6903, "longitude": -5.0300},
    {"name": "Yamoussoukro", "country": "CI", "latitude": 6.8276, "longitude": -5.2893},
    {"name": "Daloa", "country": "CI", "latitude": 6.8770, "longitude": -6.4502},
    {"name": "San-Pédro", "country": "CI", "latitude": 4.7485, "longitude": -6.6363},
]
CITIES_LR = [
    {"name": "Monrovia", "country": "LR", "latitude": 6.3005, "longitude": -10.7969},
    {"name": "Buchanan", "country": "LR", "latitude": 5.8770, "longitude": -10.0467},
    {"name": "Ganta", "country": "LR", "latitude": 7.2367, "longitude": -8.9800},
]

ROLES = [
    {"code": "customer", "label": "Customer", "permissions": ["order:create", "cart:*", "profile:*"], "description": "Standard shopper"},
    {"code": "partner", "label": "Partner (Merchant)", "permissions": ["catalog:*", "orders:read", "orders:fulfil"], "description": "Store operator"},
    {"code": "driver", "label": "Driver", "permissions": ["deliveries:read", "deliveries:update"], "description": "Delivery operator"},
    {"code": "admin", "label": "Admin", "permissions": ["admin:*"], "description": "Platform administrator"},
    {"code": "super_admin", "label": "Super Admin", "permissions": ["*"], "description": "Root platform administrator"},
]


# Sample module vendors (partner stores) — used to demo the pending→approved→active workflow
MART_VENDORS = [
    {"name": "SuperMart Cocody", "contact_name": "Aïssa Diomandé", "contact_email": "aissa@supermart.ci", "contact_phone": "+225 07 12 34 56 78", "country": "CI", "city": "Abidjan", "address": "Rue des Jardins, Cocody", "commission_pct": 12.5, "status": "active", "notes": "Flagship partner — 24/7 dark store"},
    {"name": "Fresh Corner Plateau", "contact_name": "Kouassi N'Guessan", "contact_email": "kouassi@freshcorner.ci", "contact_phone": "+225 05 98 76 54 32", "country": "CI", "city": "Abidjan", "address": "Bd de la République, Plateau", "commission_pct": 15.0, "status": "approved", "notes": "Approved, awaiting store activation"},
    {"name": "Marché Bio Marcory", "contact_name": "Fatou Traoré", "contact_email": "fatou@bio.ci", "contact_phone": "+225 07 11 22 33 44", "country": "CI", "city": "Abidjan", "address": "Zone 4, Marcory", "commission_pct": 18.0, "status": "pending", "notes": "New application — licence pending"},
    {"name": "Monrovia Fresh Foods", "contact_name": "Joseph Weah", "contact_email": "joseph@fresh.lr", "contact_phone": "+231 88 555 0111", "country": "LR", "city": "Monrovia", "address": "Tubman Boulevard, Sinkor", "commission_pct": 15.0, "status": "active", "notes": "Sinkor flagship partner"},
]

MART_DRIVERS = [
    {"name": "Ibrahim Kone", "phone": "+225 07 01 02 03 04", "email": "ibrahim@drivers.baked.ci", "country": "CI", "city": "Abidjan", "vehicle_type": "scooter", "vehicle_reg": "AB-2245-CI", "license_number": "CI-DL-88112", "status": "active"},
    {"name": "Mariam Bamba", "phone": "+225 07 05 06 07 08", "email": "mariam@drivers.baked.ci", "country": "CI", "city": "Abidjan", "vehicle_type": "bike", "vehicle_reg": "-", "license_number": "-", "status": "active"},
    {"name": "Jean-Marc Adou", "phone": "+225 07 09 10 11 12", "country": "CI", "city": "Abidjan", "vehicle_type": "scooter", "vehicle_reg": "CD-9987-CI", "license_number": "CI-DL-88220", "status": "pending"},
    {"name": "Prince Cooper", "phone": "+231 88 555 1122", "email": "prince@drivers.baked.lr", "country": "LR", "city": "Monrovia", "vehicle_type": "scooter", "vehicle_reg": "LR-4421", "license_number": "LR-DL-2201", "status": "active"},
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


async def _seed_subcategories():
    for country in COUNTRIES:
        for cat_slug, subs in SUBCATEGORIES.items():
            for order, (slug, fr, en, image) in enumerate(subs, start=1):
                name = fr if country["locale"].startswith("fr") else en
                key = {"slug": slug, "category_slug": cat_slug, "country": country["code"]}
                doc = {
                    **key,
                    "id": new_id("sub"),
                    "name": name,
                    "name_en": en,
                    "name_fr": fr,
                    "image": image,
                    "order": order,
                    "module": "mart",
                    "updated_at": _now_iso(),
                }
                existing = await db.mart_subcategories.find_one(key, {"_id": 0})
                if existing:
                    doc["id"] = existing["id"]
                await db.mart_subcategories.update_one(key, {"$set": doc}, upsert=True)


async def _seed_products():
    # CI products
    for name, brand, cat_slug, unit, price, was, image, pop, badge in PRODUCTS_CI:
        key = {"name": name, "country": "CI", "module": "mart"}
        doc = {
            **key,
            "id": new_id("prd"),
            "brand": brand,
            "category_slug": cat_slug,
            "subcategory_slug": PRODUCT_SUBCATEGORY.get(name),
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

    # LR mirror (fewer products, LRD prices — approx 1 USD ≈ 190 LRD, 1 XOF ≈ 0.34 LRD)
    for name, brand, cat_slug, unit, price_xof, was_xof, image, pop, badge in PRODUCTS_CI[:12]:
        lrd = int(round(price_xof * 0.34))
        was_lrd = int(round(was_xof * 0.34)) if was_xof else None
        key = {"name": name, "country": "LR", "module": "mart"}
        doc = {
            **key,
            "id": new_id("prd"),
            "brand": brand,
            "category_slug": cat_slug,
            "subcategory_slug": PRODUCT_SUBCATEGORY.get(name),
            "unit": unit,
            "price": lrd,
            "was_price": was_lrd,
            "currency": "LRD",
            "currency_symbol": "L$",
            "image": image,
            "images": [image],
            "popularity": pop,
            "badge": badge,
            "in_stock": True,
            "rating": round(3.8 + (pop % 12) / 10, 1),
            "review_count": (pop * 3) % 250 + 20,
            "description": f"{name} - {brand}. Delivered in 15-20 min in Monrovia.",
            "deleted_at": None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        existing = await db.mart_products.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_products.update_one(key, {"$set": doc}, upsert=True)

    # EXTRA_PRODUCTS_CI — 4-8 products per subcategory, subcategory embedded in tuple
    for name, brand, cat_slug, sub_slug, unit, price, was, image, pop, badge in EXTRA_PRODUCTS_CI:
        key = {"name": name, "country": "CI", "module": "mart"}
        doc = {
            **key,
            "id": new_id("prd"),
            "brand": brand,
            "category_slug": cat_slug,
            "subcategory_slug": sub_slug,
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


async def _seed_offers():
    for o in OFFERS_CI:
        key = {"title": o["title"], "country": "CI"}
        doc = {**key, **o, "active": True, "id": new_id("off"), "updated_at": _now_iso()}
        existing = await db.mart_offers.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_offers.update_one(key, {"$set": doc}, upsert=True)


async def _seed_stores():
    for s in STORES_CI + STORES_LR:
        key = {"name": s["name"], "country": s["country"]}
        doc = {**key, **s, "id": new_id("str"), "module": "mart", "deleted_at": None, "active": True, "updated_at": _now_iso()}
        existing = await db.mart_stores.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.mart_stores.update_one(key, {"$set": doc}, upsert=True)


async def _seed_cities():
    for c in CITIES_CI + CITIES_LR:
        key = {"name": c["name"], "country": c["country"]}
        doc = {**key, **c, "id": new_id("city"), "active": True, "deleted_at": None, "updated_at": _now_iso()}
        existing = await db.cities.find_one(key, {"_id": 0})
        if existing:
            doc["id"] = existing["id"]
        await db.cities.update_one(key, {"$set": doc}, upsert=True)


async def _seed_roles():
    for r in ROLES:
        await db.roles.update_one({"code": r["code"]}, {"$set": {**r, "updated_at": _now_iso()}}, upsert=True)


async def _seed_super_admin():
    """Seed the initial super_admin from env — idempotent."""
    import os
    from core.security import hash_password
    email = (os.environ.get("ADMIN_SEED_EMAIL") or "").strip().lower()
    password = os.environ.get("ADMIN_SEED_PASSWORD") or ""
    name = os.environ.get("ADMIN_SEED_NAME") or "Super Admin"
    if not email or not password:
        return
    existing = await db.admin_users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Ensure role is super_admin and password matches env (allows password rotation via env)
        await db.admin_users.update_one(
            {"email": email},
            {"$set": {
                "role": "super_admin",
                "password_hash": hash_password(password),
                "name": name,
                "deleted_at": None,
                "updated_at": _now_iso(),
            }},
        )
        return
    await db.admin_users.insert_one({
        "id": new_id("adm"),
        "email": email,
        "name": name,
        "role": "super_admin",
        "password_hash": hash_password(password),
        "deleted_at": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "version": 1,
    })


async def _seed_ai_prompts():
    seed = [
        {"name": "MART Product Search", "feature": "product_search", "body": "You are the BAKĒD grocery search assistant for Côte d'Ivoire. Given a natural language query, return structured filters + a friendly one-line summary.", "active": True, "model": "claude-sonnet-4-6"},
        {"name": "Admin Business Insights", "feature": "admin_insights", "body": "Given platform KPIs, return headline + 3-5 insights + 2-4 recommended actions.", "active": True, "model": "claude-sonnet-4-6"},
    ]
    for p in seed:
        exists = await db.ai_prompts.find_one({"name": p["name"]}, {"_id": 0})
        if exists:
            continue
        await db.ai_prompts.insert_one({**p, "id": new_id("prm"), "created_at": _now_iso(), "updated_at": _now_iso()})


async def _seed_module_vendors_and_drivers():
    """Seed sample vendors + drivers for the MART module admin workspace."""
    for v in MART_VENDORS:
        key = {"name": v["name"], "module": "mart"}
        existing = await db.module_vendors.find_one(key, {"_id": 0})
        base = {
            **v,
            "module": "mart",
            "country": v.get("country", "CI").upper(),
            "documents": [],
            "approved_at": _now_iso() if v.get("status") in ("approved", "active") else None,
            "approved_by": "system",
            "deleted_at": None,
            "updated_at": _now_iso(),
        }
        if existing:
            base["id"] = existing["id"]
            base["created_at"] = existing.get("created_at", _now_iso())
            await db.module_vendors.update_one({"id": existing["id"]}, {"$set": base})
        else:
            base["id"] = new_id("ven")
            base["created_at"] = _now_iso()
            base["version"] = 1
            await db.module_vendors.insert_one(base)

    for d in MART_DRIVERS:
        key = {"phone": d["phone"], "module": "mart"}
        existing = await db.module_drivers.find_one(key, {"_id": 0})
        base = {
            **d,
            "module": "mart",
            "country": d.get("country", "CI").upper(),
            "deleted_at": None,
            "updated_at": _now_iso(),
        }
        if existing:
            base["id"] = existing["id"]
            base["created_at"] = existing.get("created_at", _now_iso())
            await db.module_drivers.update_one({"id": existing["id"]}, {"$set": base})
        else:
            base["id"] = new_id("drv")
            base["created_at"] = _now_iso()
            base["version"] = 1
            await db.module_drivers.insert_one(base)


async def _cleanup_removed_countries():
    """One-time cleanup for countries removed from the platform (e.g. GB after 2026-02).

    Idempotent: deletes documents whose country field matches a deprecated code, or
    hides them by setting deleted_at. Safe to run repeatedly.
    """
    deprecated = ["GB", "LBR"]  # LBR was a mis-seeded 3-letter code; canonical is ISO-2 "LR"
    for code in deprecated:
        # Hard-remove config/seed rows (all data is re-seedable)
        await db.countries.delete_many({"code": code})
        await db.cities.delete_many({"country": code})
        await db.configurations.delete_many({"country": code})
        await db.mart_categories.delete_many({"country": code})
        await db.mart_subcategories.delete_many({"country": code})
        await db.mart_products.delete_many({"country": code})
        await db.mart_offers.delete_many({"country": code})
        await db.mart_stores.delete_many({"country": code})
        await db.module_vendors.delete_many({"country": code})
        await db.module_drivers.delete_many({"country": code})


async def run_seed():
    await _cleanup_removed_countries()
    await _seed_countries()
    await _seed_module_configs()
    await _seed_categories()
    await _seed_subcategories()
    await _seed_products()
    await _seed_offers()
    await _seed_stores()
    await _seed_cities()
    await _seed_roles()
    await _seed_super_admin()
    await _seed_ai_prompts()
    await _seed_module_vendors_and_drivers()
