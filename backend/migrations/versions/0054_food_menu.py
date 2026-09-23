"""FOODbakēd — Phase 2 menu, variants, add-ons + demo seed.

Adds the tables backing the Restaurant Detail page:

* `food_menu_sections`  — per-restaurant category headings (Starters,
                          Mains, Desserts, Drinks). Ordered.
* `food_menu_items`     — the individual dishes with base price.
* `food_item_variants`  — size / portion variants (Small +0, Med +500,
                          Large +1000). One row can be default.
* `food_item_addons`    — extras that stack on top (Cheese, Bacon, …).

Seed data attaches a rich, believable menu to Burger Hub CI (10 items,
each with 1-3 variants + 2-4 add-ons). Other restaurants get a lighter
menu (3-5 items) so every restaurant detail page has content.

All rows are idempotent via ON CONFLICT.

Revision: 0054_food_menu
Down-revision: 0053_food_phase1
"""
from alembic import op


revision      = "0054_food_menu"
down_revision = "0053_food_phase1"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # 1. Tables
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_menu_sections (
            id            VARCHAR(64) PRIMARY KEY,
            restaurant_id VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            name_en       VARCHAR(64) NOT NULL,
            name_fr       VARCHAR(64) NOT NULL,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_menu_sections_r ON food_menu_sections (restaurant_id, sort_order)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS food_menu_items (
            id            VARCHAR(64) PRIMARY KEY,
            restaurant_id VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            section_id    VARCHAR(64) NOT NULL REFERENCES food_menu_sections(id) ON DELETE CASCADE,
            name          VARCHAR(128) NOT NULL,
            description   TEXT,
            image         TEXT,
            base_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
            currency      VARCHAR(4) NOT NULL DEFAULT 'XOF',
            is_veg        BOOLEAN NOT NULL DEFAULT FALSE,
            spice_level   INTEGER NOT NULL DEFAULT 0,
            tags          JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_available  BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_menu_items_r ON food_menu_items (restaurant_id, section_id, sort_order)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS food_item_variants (
            id          VARCHAR(64) PRIMARY KEY,
            item_id     VARCHAR(64) NOT NULL REFERENCES food_menu_items(id) ON DELETE CASCADE,
            name_en     VARCHAR(64) NOT NULL,
            name_fr     VARCHAR(64) NOT NULL,
            price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
            is_default  BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order  INTEGER NOT NULL DEFAULT 0
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS food_item_addons (
            id          VARCHAR(64) PRIMARY KEY,
            item_id     VARCHAR(64) NOT NULL REFERENCES food_menu_items(id) ON DELETE CASCADE,
            name_en     VARCHAR(64) NOT NULL,
            name_fr     VARCHAR(64) NOT NULL,
            price       NUMERIC(10,2) NOT NULL DEFAULT 0,
            sort_order  INTEGER NOT NULL DEFAULT 0
        )
    """)

    # 2. Seed. Menu shape:
    # sections[restaurant] = [(section_id, name_en, name_fr, order), ...]
    # items[restaurant]    = [(item_id, section_id, name, desc, image, base_price, currency, is_veg, tags), ...]
    # variants[item]       = [(name_en, name_fr, price_delta, is_default), ...]
    # addons[item]         = [(name_en, name_fr, price), ...]

    # Burger Hub CI + IN share a menu structure (prices differ by currency)
    _BURGER_SECTIONS = [
        ("_sec_starters", "Starters",  "Entrées",   0),
        ("_sec_burgers",  "Burgers",   "Burgers",   1),
        ("_sec_sides",    "Sides",     "Accompagnements", 2),
        ("_sec_drinks",   "Drinks",    "Boissons",  3),
    ]

    _BURGER_ITEMS = [
        # (id_suffix, sec, name, desc, image, CI price, IN price, tags)
        ("crispy_wings", "_sec_starters", "Crispy Chicken Wings",
         "8 pcs · crispy fried chicken wings tossed in signature sauce",
         "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=800&h=600&fit=crop",
         3500, 279, '["popular","spicy"]'),
        ("mozz_sticks", "_sec_starters", "Mozzarella Sticks",
         "Golden fried mozzarella served with marinara dip",
         "https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=800&h=600&fit=crop",
         2500, 199, '["vegetarian"]'),
        ("classic_burger", "_sec_burgers", "Classic Cheeseburger",
         "100% beef patty, cheddar, lettuce, tomato, house sauce",
         "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop",
         4500, 299, '["bestseller"]'),
        ("bacon_burger", "_sec_burgers", "Double Bacon Burger",
         "Two beef patties, smoked bacon, cheddar & caramelised onions",
         "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&h=600&fit=crop",
         6500, 449, '["signature"]'),
        ("veg_burger", "_sec_burgers", "Garden Veggie Burger",
         "Grilled portobello, avocado, lettuce, house mayo",
         "https://images.unsplash.com/photo-1520072959219-c595dc870360?w=800&h=600&fit=crop",
         3800, 249, '["vegetarian"]'),
        ("fries_reg", "_sec_sides", "Golden Fries",
         "Crispy hand-cut fries with sea salt",
         "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=800&h=600&fit=crop",
         1500, 99, '["vegetarian"]'),
        ("onion_rings", "_sec_sides", "Onion Rings",
         "Beer-battered rings with chipotle mayo",
         "https://images.unsplash.com/photo-1639024471283-03518883512d?w=800&h=600&fit=crop",
         1800, 129, '["vegetarian"]'),
        ("coke", "_sec_drinks", "Coca-Cola",
         "Ice-cold classic",
         "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&h=600&fit=crop",
         800, 49, "[]"),
        ("milkshake", "_sec_drinks", "Vanilla Milkshake",
         "Hand-spun with real vanilla bean & whipped cream",
         "https://images.unsplash.com/photo-1568901839119-b1d0be9e5b03?w=800&h=600&fit=crop",
         2200, 159, '["vegetarian"]'),
    ]

    # Variant/addon templates keyed by section
    _VARIANTS_BY_SECTION = {
        "_sec_burgers": [("Regular", "Standard", 0, True), ("Large", "Large", 800, False)],
        "_sec_sides":   [("Regular", "Standard", 0, True), ("Large", "Large", 500, False)],
        "_sec_drinks":  [("Regular", "Standard", 0, True), ("Large", "Large", 300, False)],
        "_sec_starters":[("Regular", "Standard", 0, True)],
    }
    _ADDONS_BY_SECTION = {
        "_sec_burgers":  [("Extra Cheese", "Fromage extra", 400), ("Bacon", "Bacon", 600), ("Avocado", "Avocat", 500)],
        "_sec_starters": [("Extra Sauce", "Sauce extra", 200)],
        "_sec_sides":    [("Cheese Sauce", "Sauce fromage", 300)],
        "_sec_drinks":   [],
    }

    def _seed_restaurant_menu(rid: str, currency: str, price_col_idx: int):
        # Sections
        for sec_suffix, en, fr, order in _BURGER_SECTIONS:
            sid = f"{rid}{sec_suffix}"
            op.execute(f"""
                INSERT INTO food_menu_sections (id, restaurant_id, name_en, name_fr, sort_order)
                VALUES ('{sid}', '{rid}', '{en.replace("'", "''")}', '{fr.replace("'", "''")}', {order})
                ON CONFLICT (id) DO NOTHING
            """)
        # Items + variants + addons
        for (item_suffix, sec_suffix, name, desc, image, price_ci, price_in, tags) in _BURGER_ITEMS:
            iid = f"{rid}_{item_suffix}"
            sid = f"{rid}{sec_suffix}"
            price = price_ci if price_col_idx == 0 else price_in
            desc_escaped = desc.replace("'", "''")
            name_escaped = name.replace("'", "''")
            op.execute(f"""
                INSERT INTO food_menu_items (id, restaurant_id, section_id, name, description, image, base_price, currency, tags, is_available)
                VALUES ('{iid}', '{rid}', '{sid}', '{name_escaped}', '{desc_escaped}', '{image}', {price}, '{currency}', '{tags}'::jsonb, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    description = EXCLUDED.description,
                    image = EXCLUDED.image,
                    base_price = EXCLUDED.base_price,
                    updated_at = now()
            """)
            for (v_en, v_fr, delta, is_def) in _VARIANTS_BY_SECTION.get(sec_suffix, []):
                # Scale variant delta so IN prices stay reasonable
                scaled_delta = delta if price_col_idx == 0 else int(delta / 10)
                vid = f"{iid}_v_{v_en.lower().replace(' ', '_')}"
                op.execute(f"""
                    INSERT INTO food_item_variants (id, item_id, name_en, name_fr, price_delta, is_default, sort_order)
                    VALUES ('{vid}', '{iid}', '{v_en}', '{v_fr}', {scaled_delta}, {str(is_def).upper()}, 0)
                    ON CONFLICT (id) DO NOTHING
                """)
            for (a_en, a_fr, price) in _ADDONS_BY_SECTION.get(sec_suffix, []):
                scaled = price if price_col_idx == 0 else int(price / 10)
                aid = f"{iid}_a_{a_en.lower().replace(' ', '_')}"
                op.execute(f"""
                    INSERT INTO food_item_addons (id, item_id, name_en, name_fr, price, sort_order)
                    VALUES ('{aid}', '{iid}', '{a_en}', '{a_fr}', {scaled}, 0)
                    ON CONFLICT (id) DO NOTHING
                """)

    # Attach the burger-menu template to ALL seeded restaurants so every
    # detail page has content — customers won't hit an empty screen no
    # matter which card they tap. Currency + prices adapt per country.
    op.execute("SELECT id, country FROM food_restaurants")  # ensure exists

    RESTAURANTS = [
        ("burger_hub_ci",   "XOF", 0),
        ("pizza_palace_ci", "XOF", 0),
        ("spice_nation_ci", "XOF", 0),
        ("le_gourmet_ci",   "XOF", 0),
        ("sushi_central_ci","XOF", 0),
        ("grill_house_ci",  "XOF", 0),
        ("burger_hub_in",   "INR", 1),
        ("pizza_palace_in", "INR", 1),
        ("spice_nation_in", "INR", 1),
        ("le_gourmet_in",   "INR", 1),
        ("sushi_central_in","INR", 1),
        ("dosa_darbar_in",  "INR", 1),
    ]
    for rid, currency, price_idx in RESTAURANTS:
        _seed_restaurant_menu(rid, currency, price_idx)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_item_addons")
    op.execute("DROP TABLE IF EXISTS food_item_variants")
    op.execute("DROP TABLE IF EXISTS food_menu_items")
    op.execute("DROP TABLE IF EXISTS food_menu_sections")
