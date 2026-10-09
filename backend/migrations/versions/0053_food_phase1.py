"""FOODbakēd — Phase 1 catalogue tables + seed.

Creates the three tables backing the customer FOOD home + admin workspace:

* `food_categories`  — the 12 chip buttons under the search bar
  (All, Burgers, Pizza, …), rendered horizontally.
* `food_cuisines`    — the 8 tiles in the "Cuisines You'll Love" grid.
* `food_restaurants` — the featured-restaurants rail cards.

Seed data covers **CI and IN** (per user choice §Q2b) — 6 demo restaurants
per country, mirroring the Mock-up 4 lineup (Burger Hub, Pizza Palace,
Spice Nation, Le Gourmet, Sushi Central + Grill House). All rows are
idempotent — `ON CONFLICT (id) DO UPDATE` — so re-running the migration
never duplicates.

Homepage config for FOOD reuses the existing `homepage_sections` table
(the `module` column already accepts arbitrary strings — see
`backend/core/models/homepage.py:36`), so no schema change is needed
there. The admin homepage-management UI writes `module='food'` when the
route is `/admin/modules/food/homepage-management`.

Revision: 0053_food_phase1
Down-revision: 0052_send_india_pricing_rules
"""
from alembic import op


revision      = "0053_food_phase1"
down_revision = "0052_send_india_pricing_rules"
branch_labels = None
depends_on    = None


# 12 category chips from Mock-up 4 (i18n: FR label required — English rendered
# via i18next). Icons/image URLs point at branded stock renders.
_CATEGORIES = [
    # (code, name_en, name_fr, image, sort_order)
    ("all",       "All",       "Tous",       "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop", 0),
    ("burgers",   "Burgers",   "Burgers",    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=200&fit=crop", 1),
    ("pizza",     "Pizza",     "Pizza",      "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop", 2),
    ("chicken",   "Chicken",   "Poulet",     "https://images.unsplash.com/photo-1626082927389-6cd097cee6a6?w=200&h=200&fit=crop", 3),
    ("indian",    "Indian",    "Indien",     "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&h=200&fit=crop", 4),
    ("african",   "African",   "Africain",   "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=200&h=200&fit=crop", 5),
    ("chinese",   "Chinese",   "Chinois",    "https://images.unsplash.com/photo-1552611052-33e04de081de?w=200&h=200&fit=crop", 6),
    ("healthy",   "Healthy",   "Sain",       "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop", 7),
    ("desserts",  "Desserts",  "Desserts",   "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=200&h=200&fit=crop", 8),
    ("beverages", "Beverages", "Boissons",   "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=200&h=200&fit=crop", 9),
    ("bakery",    "Bakery",    "Boulangerie","https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=200&fit=crop", 10),
    ("seafood",   "Seafood",   "Fruits de mer","https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=200&h=200&fit=crop", 11),
]

# 8 cuisines from the "Cuisines You'll Love" section of Mock-up 4.
_CUISINES = [
    ("indian",     "Indian",     "Indien",     "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=400&fit=crop", 0),
    ("chinese",    "Chinese",    "Chinois",    "https://images.unsplash.com/photo-1552611052-33e04de081de?w=400&h=400&fit=crop",   1),
    ("italian",    "Italian",    "Italien",    "https://images.unsplash.com/photo-1595295333158-4742f28fbd85?w=400&h=400&fit=crop",   2),
    ("african",    "African",    "Africain",   "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=400&h=400&fit=crop",   3),
    ("continental","Continental","Continental","https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=400&fit=crop", 4),
    ("fast_food",  "Fast Food",  "Fast Food",  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop", 5),
    ("healthy",    "Healthy",    "Sain",       "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop", 6),
    ("desserts",   "Desserts",   "Desserts",   "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop",   7),
]

# 6 demo restaurants per country (12 total). Delivery fee is in local
# currency minor unit (CFA / INR) as integers so the API can format via
# formatMoney on the client.
_RESTAURANTS_BY_COUNTRY = {
    "CI": [
        ("burger_hub_ci",   "Burger Hub",   "burger-hub",   ["burgers", "fast_food"], 4.6, 1200, 20, 30, 0,   True,  True, 1, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop"),
        ("pizza_palace_ci", "Pizza Palace", "pizza-palace", ["pizza", "italian"],     4.5, 892,  15, 25, 500, True,  True, 2, "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=600&fit=crop"),
        ("spice_nation_ci", "Spice Nation", "spice-nation", ["indian"],               4.7, 1800, 25, 35, 500, True,  True, 3, "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&h=600&fit=crop"),
        ("le_gourmet_ci",   "Le Gourmet",   "le-gourmet",   ["continental", "healthy"],4.4, 523,  20, 30, 0,   True,  True, 4, "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&h=600&fit=crop"),
        ("sushi_central_ci","Sushi Central","sushi-central",["seafood"],              4.6, 965,  15, 25, 500, True,  True, 5, "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&h=600&fit=crop"),
        ("grill_house_ci",  "Grill House",  "grill-house",  ["african", "chicken"],   4.5, 780,  25, 40, 800, True,  False,6, "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=800&h=600&fit=crop"),
    ],
    "IN": [
        ("burger_hub_in",   "Burger Hub",   "burger-hub",   ["burgers", "fast_food"], 4.6, 3200, 20, 30, 0,   True,  True, 1, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop"),
        ("pizza_palace_in", "Pizza Palace", "pizza-palace", ["pizza", "italian"],     4.5, 2100, 15, 25, 29,  True,  True, 2, "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=600&fit=crop"),
        ("spice_nation_in", "Spice Nation", "spice-nation", ["indian"],               4.8, 5400, 25, 35, 29,  True,  True, 3, "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&h=600&fit=crop"),
        ("le_gourmet_in",   "Le Gourmet",   "le-gourmet",   ["continental", "healthy"],4.4, 890,  20, 30, 0,   True,  True, 4, "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&h=600&fit=crop"),
        ("sushi_central_in","Sushi Central","sushi-central",["seafood"],              4.6, 1420, 15, 25, 39,  True,  True, 5, "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&h=600&fit=crop"),
        ("dosa_darbar_in",  "Dosa Darbar",  "dosa-darbar",  ["indian", "healthy"],    4.7, 2300, 20, 30, 19,  True,  True, 6, "https://images.unsplash.com/photo-1630383249896-424e482df921?w=800&h=600&fit=crop"),
    ],
}


def upgrade() -> None:
    # 1. Tables
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_categories (
            code        VARCHAR(32) PRIMARY KEY,
            name_en     VARCHAR(64) NOT NULL,
            name_fr     VARCHAR(64) NOT NULL,
            image       TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_cuisines (
            code        VARCHAR(32) PRIMARY KEY,
            name_en     VARCHAR(64) NOT NULL,
            name_fr     VARCHAR(64) NOT NULL,
            image       TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurants (
            id                  VARCHAR(64) PRIMARY KEY,
            name                VARCHAR(128) NOT NULL,
            slug                VARCHAR(128) NOT NULL,
            country             VARCHAR(4)   NOT NULL,
            cuisines            JSONB NOT NULL DEFAULT '[]'::jsonb,
            rating              NUMERIC(3,2) NOT NULL DEFAULT 0,
            review_count        INTEGER      NOT NULL DEFAULT 0,
            prep_time_min       INTEGER      NOT NULL DEFAULT 15,
            prep_time_max       INTEGER      NOT NULL DEFAULT 30,
            delivery_fee        INTEGER      NOT NULL DEFAULT 0,
            is_open             BOOLEAN      NOT NULL DEFAULT TRUE,
            featured            BOOLEAN      NOT NULL DEFAULT FALSE,
            sort_order          INTEGER      NOT NULL DEFAULT 0,
            image               TEXT,
            status              VARCHAR(16)  NOT NULL DEFAULT 'active',
            created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_restaurants_country_featured ON food_restaurants (country, featured, sort_order)")

    # 2. Seed categories
    for code, en, fr, img, order in _CATEGORIES:
        op.execute(f"""
            INSERT INTO food_categories (code, name_en, name_fr, image, sort_order)
            VALUES ('{code}', '{en.replace("'", "''")}', '{fr.replace("'", "''")}', '{img}', {order})
            ON CONFLICT (code) DO UPDATE SET
                name_en = EXCLUDED.name_en,
                name_fr = EXCLUDED.name_fr,
                image = EXCLUDED.image,
                sort_order = EXCLUDED.sort_order,
                updated_at = now()
        """)

    # 3. Seed cuisines
    for code, en, fr, img, order in _CUISINES:
        op.execute(f"""
            INSERT INTO food_cuisines (code, name_en, name_fr, image, sort_order)
            VALUES ('{code}', '{en.replace("'", "''")}', '{fr.replace("'", "''")}', '{img}', {order})
            ON CONFLICT (code) DO UPDATE SET
                name_en = EXCLUDED.name_en,
                name_fr = EXCLUDED.name_fr,
                image = EXCLUDED.image,
                sort_order = EXCLUDED.sort_order,
                updated_at = now()
        """)

    # 4. Seed restaurants
    for country, rows in _RESTAURANTS_BY_COUNTRY.items():
        for (rid, name, slug, cuisines, rating, review_count, pmin, pmax, delivery_fee,
             is_open, featured, order, image) in rows:
            cuisines_json = str(cuisines).replace("'", '"')
            op.execute(f"""
                INSERT INTO food_restaurants (
                    id, name, slug, country, cuisines, rating, review_count,
                    prep_time_min, prep_time_max, delivery_fee, is_open, featured,
                    sort_order, image, status
                ) VALUES (
                    '{rid}', '{name.replace("'", "''")}', '{slug}', '{country}',
                    '{cuisines_json}'::jsonb, {rating}, {review_count},
                    {pmin}, {pmax}, {delivery_fee}, {str(is_open).upper()}, {str(featured).upper()},
                    {order}, '{image}', 'active'
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    cuisines = EXCLUDED.cuisines,
                    rating = EXCLUDED.rating,
                    review_count = EXCLUDED.review_count,
                    prep_time_min = EXCLUDED.prep_time_min,
                    prep_time_max = EXCLUDED.prep_time_max,
                    delivery_fee = EXCLUDED.delivery_fee,
                    is_open = EXCLUDED.is_open,
                    featured = EXCLUDED.featured,
                    sort_order = EXCLUDED.sort_order,
                    image = EXCLUDED.image,
                    updated_at = now()
            """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_restaurants")
    op.execute("DROP TABLE IF EXISTS food_cuisines")
    op.execute("DROP TABLE IF EXISTS food_categories")
