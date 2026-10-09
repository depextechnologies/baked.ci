"""FOODbakēd — Restaurant Microsite foundation (Overview + Photos + Menu docs + Reviews + Offers).

Adds the data plumbing so a restaurant page becomes a full microsite,
not just a menu. The migration is deliberately additive — existing
columns/tables are untouched. Everything is optional and empty-safe on
the frontend.

Tables & columns
----------------
* `food_restaurants` gains:
    description             TEXT
    price_range             VARCHAR(4)     — one of "$", "$$", "$$$", "$$$$"
    address                 VARCHAR(255)
    latitude / longitude    NUMERIC(9,6)
    opening_hours           JSONB          — same shape as the reservation
                                              hours JSONB (per day list of
                                              [start, end] ranges)
    facilities              JSONB          — list of code strings
    highlights              JSONB          — list of code strings
    contact_phone           VARCHAR(32)
    contact_email           VARCHAR(190)

* `food_restaurant_photos` (partner-managed gallery)
    id, restaurant_id, url, category, is_cover, sort_order

* `food_restaurant_offers`
    id, restaurant_id, title_fr/en, description_fr/en, discount_type,
    discount_value, valid_from, valid_until, is_active

* `food_restaurant_menu_docs`
    id, restaurant_id, label_fr/en, url, sort_order

* `food_reviews` — order-gated architecture:
    id, restaurant_id, customer_id, order_id (nullable for admin/seed),
    rating (1-5), text, food_rating, service_rating, ambience_rating,
    value_rating, partner_response, partner_response_at, status
    (published|hidden|reported), created_at

The customer POST + partner response endpoints ship in the follow-up
pass; the schema + read-side aggregates are here so the UI can already
render rating breakdowns and empty-states.

Revision:      0059_restaurant_microsite
Down-revision: 0058_food_reservations
"""
from alembic import op


revision      = "0059_restaurant_microsite"
down_revision = "0058_food_reservations"
branch_labels = None
depends_on    = None


PHOTO_CATEGORIES = ("food", "ambience", "interior", "exterior", "menu")
REVIEW_STATUSES  = ("published", "hidden", "reported")


def upgrade() -> None:
    # -------------------------------------------------------------- restaurants
    add_cols = (
        ("description",   "TEXT"),
        ("price_range",   "VARCHAR(4)"),
        ("address",       "VARCHAR(255)"),
        ("latitude",      "NUMERIC(9, 6)"),
        ("longitude",     "NUMERIC(9, 6)"),
        ("opening_hours", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
        ("facilities",    "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("highlights",    "JSONB NOT NULL DEFAULT '[]'::jsonb"),
        ("contact_phone", "VARCHAR(32)"),
        ("contact_email", "VARCHAR(190)"),
    )
    for col, dtype in add_cols:
        op.execute(f"ALTER TABLE food_restaurants ADD COLUMN IF NOT EXISTS {col} {dtype}")

    # -------------------------------------------------------------- photos
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS food_restaurant_photos (
            id             VARCHAR(64) PRIMARY KEY,
            restaurant_id  VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            url            TEXT NOT NULL,
            category       VARCHAR(16) NOT NULL DEFAULT 'food',
            caption        VARCHAR(255),
            is_cover       BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order     INTEGER NOT NULL DEFAULT 0,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_photo_category CHECK (category IN {PHOTO_CATEGORIES})
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_photos_rest ON food_restaurant_photos (restaurant_id, sort_order)")

    # -------------------------------------------------------------- offers
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurant_offers (
            id              VARCHAR(64) PRIMARY KEY,
            restaurant_id   VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            title_fr        VARCHAR(120) NOT NULL,
            title_en        VARCHAR(120),
            description_fr  VARCHAR(500),
            description_en  VARCHAR(500),
            discount_type   VARCHAR(16) NOT NULL DEFAULT 'percent',   -- percent | flat | free_delivery
            discount_value  NUMERIC(10, 2) NOT NULL DEFAULT 0,
            valid_from      TIMESTAMPTZ,
            valid_until     TIMESTAMPTZ,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order      INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_offer_discount_type CHECK (discount_type IN ('percent','flat','free_delivery'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_offers_rest ON food_restaurant_offers (restaurant_id, is_active)")

    # -------------------------------------------------------------- menu docs
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurant_menu_docs (
            id             VARCHAR(64) PRIMARY KEY,
            restaurant_id  VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            label_fr       VARCHAR(120) NOT NULL,
            label_en       VARCHAR(120),
            url            TEXT NOT NULL,
            sort_order     INTEGER NOT NULL DEFAULT 0,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_menu_docs_rest ON food_restaurant_menu_docs (restaurant_id, sort_order)")

    # -------------------------------------------------------------- reviews
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS food_reviews (
            id                 VARCHAR(64) PRIMARY KEY,
            restaurant_id      VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            customer_id        VARCHAR(64),
            order_id           VARCHAR(64),
            rating             INTEGER NOT NULL,
            text               TEXT,
            food_rating        INTEGER,
            service_rating     INTEGER,
            ambience_rating    INTEGER,
            value_rating       INTEGER,
            partner_response   TEXT,
            partner_response_at TIMESTAMPTZ,
            status             VARCHAR(16) NOT NULL DEFAULT 'published',
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5),
            CONSTRAINT ck_review_status CHECK (status IN {REVIEW_STATUSES}),
            CONSTRAINT uq_review_per_order UNIQUE (order_id, customer_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_reviews_rest ON food_reviews (restaurant_id, status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_reviews_customer ON food_reviews (customer_id, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_reviews")
    op.execute("DROP TABLE IF EXISTS food_restaurant_menu_docs")
    op.execute("DROP TABLE IF EXISTS food_restaurant_offers")
    op.execute("DROP TABLE IF EXISTS food_restaurant_photos")
    for col in ("description","price_range","address","latitude","longitude",
                "opening_hours","facilities","highlights","contact_phone","contact_email"):
        op.execute(f"ALTER TABLE food_restaurants DROP COLUMN IF EXISTS {col}")
