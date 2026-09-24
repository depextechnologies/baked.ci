"""FOODbakēd — Real order persistence + status history.

This is the production foundation for the FOOD order pipeline. It is NOT a
temporary analytics-only table. The status enum + event log support the
future workflow:
  placed → accepted → preparing → ready → assigned → out_for_delivery → delivered
  plus terminal: rejected · cancelled · refunded

Tables:
  * `food_orders`         — one row per order. Order-level totals in the
    restaurant's currency, plus `restaurant_earnings` for payout accounting.
    `delivery_address` and `customer_snapshot` are JSONB so historical orders
    are stable when the customer profile changes.

  * `food_order_items`    — one row per line item. `item_name_snapshot`,
    `variant_snapshot`, `addons_snapshot` are captured at order-time so
    later menu edits or price changes NEVER mutate historical order data.

  * `food_order_events`   — full status history. Powers "assigned to driver
    at 12:04" audit trails and the eventual partner "Live orders" view.

Revision:      0057_food_orders
Down-revision: 0056_food_applications
"""
from alembic import op


revision      = "0057_food_orders"
down_revision = "0056_food_applications"
branch_labels = None
depends_on    = None


ORDER_STATUSES = ("placed", "accepted", "preparing", "ready",
                  "assigned", "out_for_delivery", "delivered",
                  "rejected", "cancelled", "refunded")

PAYMENT_STATUSES = ("pending", "authorized", "paid", "failed", "refunded")


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_orders (
            id                    VARCHAR(64) PRIMARY KEY,
            order_number          VARCHAR(24) UNIQUE NOT NULL,
            restaurant_id         VARCHAR(64) NOT NULL REFERENCES food_restaurants(id) ON DELETE RESTRICT,
            customer_id           VARCHAR(64),                         -- nullable for guest orders
            customer_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {name, phone, email}
            country               VARCHAR(4)  NOT NULL,
            order_type            VARCHAR(12) NOT NULL DEFAULT 'delivery',  -- delivery | pickup
            status                VARCHAR(24) NOT NULL DEFAULT 'placed',
            -- Timing checkpoints (nullable — set as they occur).
            placed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            accepted_at           TIMESTAMPTZ,
            ready_at              TIMESTAMPTZ,
            assigned_at           TIMESTAMPTZ,
            out_for_delivery_at   TIMESTAMPTZ,
            delivered_at          TIMESTAMPTZ,
            cancelled_at          TIMESTAMPTZ,
            -- Financials (major currency units — the app is already whole-number driven).
            currency              VARCHAR(8)  NOT NULL DEFAULT 'XOF',
            subtotal              NUMERIC(14, 2) NOT NULL DEFAULT 0,
            discount              NUMERIC(14, 2) NOT NULL DEFAULT 0,
            delivery_fee          NUMERIC(14, 2) NOT NULL DEFAULT 0,
            tax                   NUMERIC(14, 2) NOT NULL DEFAULT 0,
            grand_total           NUMERIC(14, 2) NOT NULL DEFAULT 0,
            restaurant_earnings   NUMERIC(14, 2) NOT NULL DEFAULT 0,
            -- Payment
            payment_method        VARCHAR(24),                         -- cash | card | mobile_money | wallet
            payment_status        VARCHAR(16) NOT NULL DEFAULT 'pending',
            -- Promo / coupon
            promo_code            VARCHAR(48),
            promo_discount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
            -- Delivery details (snapshot)
            delivery_address      JSONB NOT NULL DEFAULT '{}'::jsonb,
            notes                 TEXT,
            -- Housekeeping
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_food_order_status  CHECK (status IN ('placed','accepted','preparing','ready','assigned','out_for_delivery','delivered','rejected','cancelled','refunded')),
            CONSTRAINT ck_food_order_type    CHECK (order_type IN ('delivery','pickup')),
            CONSTRAINT ck_food_pay_status    CHECK (payment_status IN ('pending','authorized','paid','failed','refunded'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_orders_rest_time  ON food_orders (restaurant_id, placed_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_orders_rest_status ON food_orders (restaurant_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_orders_customer    ON food_orders (customer_id, placed_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS food_order_items (
            id                   VARCHAR(64) PRIMARY KEY,
            order_id             VARCHAR(64) NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
            menu_item_id         VARCHAR(64),                          -- nullable if item later deleted
            item_name_snapshot   VARCHAR(190) NOT NULL,
            section_snapshot     VARCHAR(64),
            quantity             INTEGER NOT NULL DEFAULT 1,
            unit_price           NUMERIC(14, 2) NOT NULL DEFAULT 0,
            variant_snapshot     JSONB,                                -- {id, name_fr, name_en, price_delta}
            addons_snapshot      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id, name_fr, name_en, price}]
            item_discount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
            line_total           NUMERIC(14, 2) NOT NULL DEFAULT 0,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_order_items_order   ON food_order_items (order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_order_items_item    ON food_order_items (menu_item_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS food_order_events (
            id           VARCHAR(64) PRIMARY KEY,
            order_id     VARCHAR(64) NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
            from_status  VARCHAR(24),
            to_status    VARCHAR(24) NOT NULL,
            actor        VARCHAR(64),
            actor_role   VARCHAR(24),                                  -- customer|partner|admin|system|driver
            notes        TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_order_events_order ON food_order_events (order_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_order_events")
    op.execute("DROP TABLE IF EXISTS food_order_items")
    op.execute("DROP TABLE IF EXISTS food_orders")
