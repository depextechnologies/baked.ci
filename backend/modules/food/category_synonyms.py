"""FOODbakēd category synonym registry (P0 Discovery).

Central source for the dish-name tokens that qualify a restaurant for a
given category chip. The spec explicitly asks for "elastic and intelligent
category matching" with FR + EN variants, without inflating substring
matches.

Design
------
* Hard-coded for v1 (per approved plan). Shape of this module purposefully
  matches a future SQL table ``food_category_synonyms(category_code, lang,
  token)`` so swapping in a Super-Admin-managed source is a one-afternoon
  change — the discover endpoint just calls ``synonyms_for(code)``.
* Each token is matched case-insensitively against
  ``food_menu_items.name`` using the existing ``ix_food_menu_items_name_trgm``
  trigram index via ``ILIKE %token%``. The trigram index keeps the ILIKE
  seek fast even on a 100k-row menu.
* Tokens are chosen conservatively (whole-word dish names + common
  misspellings) to avoid false positives like "margheritas" matching
  "margherita cocktail".
"""
from __future__ import annotations

# NOTE — ordering matters only for readability; the discover query uses
# `ANY(:tokens)` + an index-friendly ILIKE loop.
_REGISTRY: dict[str, list[str]] = {
    "burgers": [
        # EN
        "burger", "burgers", "cheeseburger", "hamburger", "slider",
        # FR
        "burger", "hamburger", "cheese burger",
    ],
    "pizza": [
        "pizza", "pizzas", "margherita", "margarita", "pepperoni",
        "quattro formaggi", "calzone",
    ],
    "chicken": [
        "chicken", "poulet", "wings", "ailes", "nuggets",
        "fried chicken", "poulet frit", "tandoori",
    ],
    "indian": [
        "biryani", "biriani", "butter chicken", "paneer", "tikka",
        "dal", "naan", "roti", "masala", "curry", "indien",
        # Honour spec example: Biryani click should surface
        # Chicken Biryani / Veg Biryani / Mutton Biryani
        "mutton biryani", "veg biryani", "dum biryani", "hyderabadi",
    ],
    "african": [
        "attieke", "attiéké", "alloco", "garba", "kedjenou", "foutou",
        "poisson braisé", "braisé", "jollof", "fufu", "egusi", "yassa",
        "mafé",
    ],
    "chinese": [
        "noodles", "nouilles", "fried rice", "riz sauté", "wonton", "dim sum",
        "chow mein", "kung pao", "sichuan", "manchurian", "schezwan",
    ],
    "healthy": [
        "salad", "salade", "bowl", "buddha bowl", "poke", "quinoa",
        "smoothie", "wrap", "veggie",
    ],
    "desserts": [
        "cake", "gateau", "gâteau", "brownie", "ice cream", "glace",
        "cheesecake", "pancake", "crêpe", "donut", "donuts",
        "pâtisserie", "patisserie", "cookie", "pudding", "mousse",
    ],
    "beverages": [
        "coffee", "café", "latte", "cappuccino", "espresso",
        "juice", "jus", "smoothie", "coke", "coca", "soda", "water", "eau",
        "lassi", "milkshake",
    ],
    "bakery": [
        "bread", "pain", "baguette", "croissant", "muffin", "pâtisserie",
        "patisserie", "sandwich", "panini", "pastry",
    ],
    "seafood": [
        "fish", "poisson", "prawns", "shrimp", "crevette", "crabe",
        "lobster", "homard", "sushi", "sashimi", "calamar", "octopus",
    ],
    # "biryani" is listed separately so the Biryani chip at
    # /food/restaurants?category=biryani works as a first-class category.
    "biryani": [
        "biryani", "biriani", "chicken biryani", "mutton biryani",
        "veg biryani", "dum biryani", "hyderabadi biryani", "biryani rice",
    ],
}

# Pass-through alias — a restaurant also qualifies for its stated cuisine
# codes (JSONB array `food_restaurants.cuisines`). The discover endpoint
# ORs the menu-item hit with the cuisine membership so a true pizza place
# still shows up even if its menu uses language we don't recognise.
_CUISINE_HINTS: dict[str, list[str]] = {
    "burgers":   ["burgers", "fast_food", "american"],
    "pizza":     ["pizza", "italian"],
    "chicken":   ["chicken", "fried_chicken", "wings"],
    "indian":    ["indian", "biryani", "tandoor"],
    "biryani":   ["biryani", "indian", "hyderabadi"],
    "african":   ["african", "ivorian", "ivoirienne"],
    "chinese":   ["chinese", "asian", "noodles"],
    "healthy":   ["healthy", "salads", "vegan", "veg"],
    "desserts":  ["desserts", "sweets", "ice_cream"],
    "beverages": ["beverages", "drinks", "coffee"],
    "bakery":    ["bakery", "patisserie", "boulangerie"],
    "seafood":   ["seafood", "fish"],
}


def synonyms_for(category_code: str) -> list[str]:
    """Lower-cased dish-name tokens for a category. Empty when unknown."""
    return [t.lower().strip() for t in _REGISTRY.get(category_code.lower(), [])]


def cuisine_hints_for(category_code: str) -> list[str]:
    """Cuisine codes that automatically qualify a restaurant for this
    category even when no menu-item name hits (e.g. a venue tagged
    ``cuisines=['italian']`` qualifies for Pizza)."""
    return [c.lower().strip() for c in _CUISINE_HINTS.get(category_code.lower(), [])]


def all_categories() -> list[str]:
    """List of category codes we understand — for health checks / tests."""
    return sorted(_REGISTRY.keys())
