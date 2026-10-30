"""FOODbakēd — restaurant partner accounts + auth support tables.

Adds:
  * `food_restaurant_partners` — email + bcrypt hash + restaurant_id + is_active.
  * Case-insensitive unique index on `email`.
  * A super-admin owner can create as many partner accounts as they like per
    restaurant. Deleting a restaurant cascades to its partners.

Revision:      0055_food_partners
Down-revision: 0054_food_menu
"""
from alembic import op


revision      = "0055_food_partners"
down_revision = "0054_food_menu"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurant_partners (
            id            VARCHAR(64) PRIMARY KEY,
            restaurant_id VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            email         VARCHAR(190) NOT NULL,
            password_hash TEXT NOT NULL,
            name          VARCHAR(128),
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            last_login_at TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # Case-insensitive uniqueness on email
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_food_restaurant_partners_email
          ON food_restaurant_partners ((LOWER(email)))
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_food_restaurant_partners_restaurant
          ON food_restaurant_partners (restaurant_id, is_active)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_restaurant_partners")
