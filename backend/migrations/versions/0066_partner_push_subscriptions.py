"""Phase 4b — Partner Web Push subscriptions table.

Stores one row per browser × partner × restaurant. The browser's
`PushSubscription.endpoint` is the natural primary key — the push service
guarantees it is globally unique and stable for the life of the device
registration. If the same partner subscribes from two devices we store
two rows and fan out to both when a new order lands.

A 410/404 response from the push service means the subscription has been
revoked (uninstalled PWA, cleared data, etc.); the push dispatcher deletes
the row and moves on so stale subscriptions never clog the queue.

Revision:      0066_partner_push_subscriptions
Down-revision: 0065_food_service_pause
"""
from alembic import op
import sqlalchemy as sa


revision      = "0066_partner_push_subscriptions"
down_revision = "0065_food_service_pause"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_push_subscriptions (
            endpoint        TEXT PRIMARY KEY,
            restaurant_id   TEXT NOT NULL,
            partner_id      TEXT,
            p256dh          TEXT NOT NULL,
            auth            TEXT NOT NULL,
            user_agent      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_notified_at TIMESTAMPTZ,
            CONSTRAINT fk_pps_restaurant
                FOREIGN KEY (restaurant_id) REFERENCES food_restaurants(id) ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_pps_restaurant ON partner_push_subscriptions (restaurant_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_pps_restaurant")
    op.execute("DROP TABLE IF EXISTS partner_push_subscriptions")
