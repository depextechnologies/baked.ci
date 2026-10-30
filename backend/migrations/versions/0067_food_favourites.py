"""Phase 3 — FOODbakēd customer favourites.

Server-side favourites (login-required). One row per
(customer_id, target_type, target_id). Both restaurant and dish favourites
land in the same table so the "Mes Favoris" page can list them with a
single read.

Revision:      0067_food_favourites
Down-revision: 0066_partner_push_subscriptions
"""
from alembic import op


revision      = "0067_food_favourites"
down_revision = "0066_partner_push_subscriptions"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_favourites (
            id            TEXT PRIMARY KEY,
            customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            target_type   TEXT NOT NULL CHECK (target_type IN ('restaurant', 'dish')),
            target_id     TEXT NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_food_fav_unique "
        "ON food_favourites (customer_id, target_type, target_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_fav_customer "
        "ON food_favourites (customer_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_food_fav_customer")
    op.execute("DROP INDEX IF EXISTS ux_food_fav_unique")
    op.execute("DROP TABLE IF EXISTS food_favourites")
