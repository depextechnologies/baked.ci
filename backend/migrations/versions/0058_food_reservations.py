"""FOODbakēd — Table reservations foundation.

Adds three tables + two nullable columns on `food_restaurants`. Designed
so that later table-level management (individual tables, floor plans,
combining tables) can be layered on WITHOUT rewriting the reservation
workflow — capacity is expressed as time-slot seats today, and every
reservation carries a stable `booking_reference` for the customer.

Tables
------
* `food_restaurants.reservations_enabled`         BOOLEAN (default FALSE)
* `food_restaurants.reservations_paused_until`    TIMESTAMPTZ nullable

* `food_reservation_settings` (1 row per restaurant, id = restaurant_id)
      Capacity + gating knobs — slot capacity (seats concurrently
      bookable per slot), min/max party size, lead-time, slot interval
      (15 / 30 / 60 min), advance-booking window, per-day opening hours
      (JSONB — mirror of the existing `food_restaurants.hours` shape:
      `{ mon: [["12:00","14:30"], ["19:00","22:00"]], ... }`), blackout
      dates (list of ISO dates), plus notification preferences (sound on
      for new orders + new reservations, volume 0.0-1.0).

* `food_reservations`
      One row per reservation. `customer_id` is nullable (guest flow).
      When a guest later signs into an account whose phone/email match,
      backend endpoint can back-fill `customer_id`. `reservation_at` is
      the exact slot start (TIMESTAMPTZ, restaurant-local semantics — we
      persist a naive UTC to avoid TZ drift; humans always see it in the
      restaurant's local clock via the UI). Status transitions are
      recorded in `food_reservation_events` for a durable audit trail.

* `food_reservation_events`
      Full status history (audit). Every action taken by the customer
      OR the partner appears here. Powers "Confirmed 12:04 by partner"
      style UI on both sides.

Revision:      0058_food_reservations
Down-revision: 0057_food_orders
"""
from alembic import op


revision      = "0058_food_reservations"
down_revision = "0057_food_orders"
branch_labels = None
depends_on    = None


RESERVATION_STATUSES = (
    "pending", "confirmed", "rejected", "cancelled", "completed", "no_show",
)


def upgrade() -> None:
    # -------------------------------------------------------------- restaurant columns
    op.execute(
        "ALTER TABLE food_restaurants "
        "ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE food_restaurants "
        "ADD COLUMN IF NOT EXISTS reservations_paused_until TIMESTAMPTZ"
    )

    # -------------------------------------------------------------- settings
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_reservation_settings (
            restaurant_id             VARCHAR(64) PRIMARY KEY REFERENCES food_restaurants(id) ON DELETE CASCADE,
            slot_capacity             INTEGER NOT NULL DEFAULT 20,
            min_party_size            INTEGER NOT NULL DEFAULT 1,
            max_party_size            INTEGER NOT NULL DEFAULT 12,
            min_lead_time_minutes     INTEGER NOT NULL DEFAULT 30,
            slot_interval_minutes     INTEGER NOT NULL DEFAULT 30,
            advance_booking_days      INTEGER NOT NULL DEFAULT 60,
            auto_confirm              BOOLEAN NOT NULL DEFAULT FALSE,
            hours                     JSONB   NOT NULL DEFAULT '{}'::jsonb,
            blackout_dates            JSONB   NOT NULL DEFAULT '[]'::jsonb,
            sound_new_order           BOOLEAN NOT NULL DEFAULT TRUE,
            sound_new_reservation     BOOLEAN NOT NULL DEFAULT TRUE,
            sound_volume              NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
            created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_food_res_settings_interval CHECK (slot_interval_minutes IN (15, 30, 60)),
            CONSTRAINT ck_food_res_settings_volume   CHECK (sound_volume BETWEEN 0.0 AND 1.0),
            CONSTRAINT ck_food_res_settings_party    CHECK (min_party_size >= 1 AND max_party_size >= min_party_size)
        )
    """)

    # -------------------------------------------------------------- reservations
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_reservations (
            id                    VARCHAR(64) PRIMARY KEY,
            booking_reference     VARCHAR(16) UNIQUE NOT NULL,
            restaurant_id         VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE RESTRICT,
            customer_id           VARCHAR(64),
            guest_name            VARCHAR(120) NOT NULL,
            guest_phone           VARCHAR(32)  NOT NULL,
            guest_email           VARCHAR(190),
            party_size            INTEGER NOT NULL,
            reservation_at        TIMESTAMPTZ NOT NULL,
            notes                 TEXT,
            status                VARCHAR(16) NOT NULL DEFAULT 'pending',
            rejection_reason      TEXT,
            cancellation_reason   TEXT,
            confirmed_at          TIMESTAMPTZ,
            cancelled_at          TIMESTAMPTZ,
            completed_at          TIMESTAMPTZ,
            source                VARCHAR(16) NOT NULL DEFAULT 'web',  -- web | mobile | partner
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_food_res_status CHECK (status IN ('pending','confirmed','rejected','cancelled','completed','no_show')),
            CONSTRAINT ck_food_res_party  CHECK (party_size >= 1 AND party_size <= 40)
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_reservations_rest_time "
        "ON food_reservations (restaurant_id, reservation_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_reservations_rest_status "
        "ON food_reservations (restaurant_id, status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_reservations_customer "
        "ON food_reservations (customer_id, reservation_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_reservations_phone_email "
        "ON food_reservations (LOWER(guest_phone), LOWER(guest_email))"
    )

    # -------------------------------------------------------------- events
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_reservation_events (
            id             VARCHAR(64) PRIMARY KEY,
            reservation_id VARCHAR(64) NOT NULL REFERENCES food_reservations(id) ON DELETE CASCADE,
            from_status    VARCHAR(16),
            to_status      VARCHAR(16) NOT NULL,
            actor          VARCHAR(64),
            actor_role     VARCHAR(24),
            notes          TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_food_res_events_res "
        "ON food_reservation_events (reservation_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_reservation_events")
    op.execute("DROP TABLE IF EXISTS food_reservations")
    op.execute("DROP TABLE IF EXISTS food_reservation_settings")
    op.execute("ALTER TABLE food_restaurants DROP COLUMN IF EXISTS reservations_paused_until")
    op.execute("ALTER TABLE food_restaurants DROP COLUMN IF EXISTS reservations_enabled")
