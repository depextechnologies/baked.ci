"""FOODbakēd — Reservation public toggle + Areas/Tables foundation.

Splits reservation state into two flags for a clean customer-visibility rule:

  * `food_restaurants.reservations_enabled`   — capability enabled by admin
    (partner accepted the reservations option during onboarding)
  * `food_restaurants.reservation_public`     — partner has finished the
    minimum configuration and explicitly hit "Activate Reservations".

Customers only see "Book a Table" when BOTH are TRUE. Partners can
configure reservations from the portal any time capability is on.

Also lays the Areas + Tables foundation (Main Hall / Terrace + T01..).
Tables carry optional `pos_x` / `pos_y` so a graphical floor plan can be
layered on top without a schema rewrite.

Adds two onboarding fields on the seller application:
  * `offers_reservations`             BOOLEAN NOT NULL DEFAULT FALSE
  * `reservations_seating_capacity`   INTEGER (optional applicant hint)

Revision:      0060_food_reservation_public_and_tables
Down-revision: 0059_restaurant_microsite
"""
from alembic import op


revision      = "0060_food_res_public_tables"
down_revision = "0059_restaurant_microsite"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ----- restaurant flag ---------------------------------------------------
    op.execute(
        "ALTER TABLE food_restaurants "
        "ADD COLUMN IF NOT EXISTS reservation_public BOOLEAN NOT NULL DEFAULT FALSE"
    )

    # ----- application fields -----------------------------------------------
    op.execute(
        "ALTER TABLE food_partner_applications "
        "ADD COLUMN IF NOT EXISTS offers_reservations BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE food_partner_applications "
        "ADD COLUMN IF NOT EXISTS reservations_seating_capacity INTEGER"
    )

    # ----- areas -------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_reservation_areas (
            id            VARCHAR(64) PRIMARY KEY,
            restaurant_id VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            name          VARCHAR(120) NOT NULL,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_res_areas_rest "
        "ON food_reservation_areas (restaurant_id, sort_order)"
    )

    # ----- tables ------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_reservation_tables (
            id            VARCHAR(64) PRIMARY KEY,
            restaurant_id VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            area_id       VARCHAR(64) NOT NULL REFERENCES food_reservation_areas(id) ON DELETE CASCADE,
            code          VARCHAR(24) NOT NULL,
            seats         INTEGER NOT NULL,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            pos_x         INTEGER,
            pos_y         INTEGER,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_food_res_table_seats CHECK (seats >= 1 AND seats <= 40),
            CONSTRAINT uq_food_res_table_code UNIQUE (restaurant_id, code)
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_res_tables_rest "
        "ON food_reservation_tables (restaurant_id, area_id, sort_order)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_reservation_tables")
    op.execute("DROP TABLE IF EXISTS food_reservation_areas")
    op.execute("ALTER TABLE food_partner_applications DROP COLUMN IF EXISTS reservations_seating_capacity")
    op.execute("ALTER TABLE food_partner_applications DROP COLUMN IF EXISTS offers_reservations")
    op.execute("ALTER TABLE food_restaurants DROP COLUMN IF EXISTS reservation_public")
