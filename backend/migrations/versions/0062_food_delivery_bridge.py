"""FOODbakēd — Pass 2 Driver Dispatch bridge.

Extends `express_bookings` so a food_order can create a shadow dispatch row
that flows through the exact same SEND dispatch pipeline (nearest driver,
offer TTL, declined-chain, atomic accept).  Nothing changes for existing
EXPRESS/SEND bookings — the new columns are nullable, the new booking_type
value is additive, and the new indexes are partial.

New columns on express_bookings
-------------------------------
    source_module   VARCHAR(16)   — 'express' (implicit default) or 'food'
    food_order_id   VARCHAR(64)   — FK → food_orders(id), nullable, indexed
    pickup_pin      VARCHAR(8)    — 4-digit code the partner shows the driver
                                     for pickup verification (nullable;
                                     generated only for food_delivery rows)

New booking_type value: 'food_delivery' (parcel + movers remain supported)

Idempotency / dedup
-------------------
A partial UNIQUE INDEX on (food_order_id) WHERE status NOT IN ('cancelled')
prevents a double READY event from spawning a second delivery job while the
first is still live.  A fresh booking may be created only if the previous
one was cancelled (operator rescue scenario).

Revision:      0062_food_delivery_bridge
Down-revision: 0061_food_reviews_extras
"""
from alembic import op


revision      = "0062_food_delivery_bridge"
down_revision = "0061_food_reviews_extras"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # 1) New nullable columns — zero impact on existing rows.
    op.execute(
        "ALTER TABLE express_bookings "
        "ADD COLUMN IF NOT EXISTS source_module VARCHAR(16)"
    )
    op.execute(
        "ALTER TABLE express_bookings "
        "ADD COLUMN IF NOT EXISTS food_order_id VARCHAR(64) "
        "REFERENCES food_orders(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE express_bookings "
        "ADD COLUMN IF NOT EXISTS pickup_pin VARCHAR(8)"
    )

    # 2) Replace booking_type CHECK to allow 'food_delivery'. Postgres has no
    #    "ALTER CONSTRAINT" for a CHECK — drop + add.
    op.execute(
        "ALTER TABLE express_bookings "
        "DROP CONSTRAINT IF EXISTS ck_express_bookings_booking_type"
    )
    op.execute(
        "ALTER TABLE express_bookings "
        "ADD CONSTRAINT ck_express_bookings_booking_type "
        "CHECK (booking_type IN ('parcel','movers','food_delivery'))"
    )

    # 3) Indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_express_bookings_food_order "
        "ON express_bookings (food_order_id) "
        "WHERE food_order_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_express_bookings_source_type "
        "ON express_bookings (source_module, booking_type)"
    )
    # Dedup guard: at most one live delivery per food_order.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_food_delivery_live_per_order "
        "ON express_bookings (food_order_id) "
        "WHERE food_order_id IS NOT NULL AND status <> 'cancelled'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_food_delivery_live_per_order")
    op.execute("DROP INDEX IF EXISTS ix_express_bookings_source_type")
    op.execute("DROP INDEX IF EXISTS ix_express_bookings_food_order")

    # Restore the original CHECK before dropping columns so any
    # food_delivery rows left behind (there shouldn't be any once the
    # service is torn down) are caught by the operator rather than silently
    # orphaned.
    op.execute(
        "ALTER TABLE express_bookings "
        "DROP CONSTRAINT IF EXISTS ck_express_bookings_booking_type"
    )
    op.execute(
        "ALTER TABLE express_bookings "
        "ADD CONSTRAINT ck_express_bookings_booking_type "
        "CHECK (booking_type IN ('parcel','movers'))"
    )
    op.execute("ALTER TABLE express_bookings DROP COLUMN IF EXISTS pickup_pin")
    op.execute("ALTER TABLE express_bookings DROP COLUMN IF EXISTS food_order_id")
    op.execute("ALTER TABLE express_bookings DROP COLUMN IF EXISTS source_module")
