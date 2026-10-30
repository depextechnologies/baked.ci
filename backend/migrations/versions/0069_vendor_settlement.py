"""Vendor-specific settlement — negotiated commission + configurable payout schedule.

Design (user-approved):
  * Commission is **per-vendor**, negotiated during the Super-Admin application
    review. Rate changes are stored as a history (effective_from / effective_until)
    so historical orders never get recalculated. Each order snapshots the active
    rate at delivery time.
  * Payout schedule is **per-vendor** too (daily / weekly / monthly / custom)
    stored as JSON config. Pause / resume is a boolean on the config row.
  * Each delivered order writes an `order_net` ledger entry on the partner wallet.
    Approved refunds debit the wallet. Payouts debit the wallet when marked paid.
  * All financial amounts stored at 2 decimals; module column (food/mart/shop) is
    on every row so the same engine can serve MARTbakēd & SHOPbakēd later.

Revision:      0069_vendor_settlement
Down-revision: 0068_returns_refunds
"""
from alembic import op


revision      = "0069_vendor_settlement"
down_revision = "0068_returns_refunds"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Commission history — immutable rows, every change creates a new row.
    # Current rate = the row where effective_until IS NULL.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS vendor_commission_history (
            id                  TEXT PRIMARY KEY,
            module              TEXT NOT NULL CHECK (module IN ('food','mart','shop')),
            restaurant_id       TEXT NOT NULL,
            rate_percent        NUMERIC(6,3) NOT NULL,
            effective_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
            effective_until     TIMESTAMPTZ NULL,
            note                TEXT NULL,
            changed_by_admin_id TEXT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_vch_vendor ON vendor_commission_history (module, restaurant_id, effective_from DESC)")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_vch_current
          ON vendor_commission_history (module, restaurant_id)
          WHERE effective_until IS NULL
    """)

    # ------------------------------------------------------------------
    # Payout config — one row per vendor. Pause/resume handled here.
    # schedule_type: daily | weekly | monthly | custom
    # schedule_cfg : JSON {weekday:0-6, day_of_month:1-31, time_hhmm:"23:00", ...}
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS vendor_payout_config (
            id                  TEXT PRIMARY KEY,
            module              TEXT NOT NULL CHECK (module IN ('food','mart','shop')),
            restaurant_id       TEXT NOT NULL,
            schedule_type       TEXT NOT NULL DEFAULT 'weekly',
            schedule_cfg        JSONB NOT NULL DEFAULT '{}'::jsonb,
            payout_method       TEXT NULL,
            payout_destination  TEXT NULL,
            min_payout_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
            is_paused           BOOLEAN NOT NULL DEFAULT FALSE,
            pause_reason        TEXT NULL,
            notes               TEXT NULL,
            last_changed_by     TEXT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_vpc_vendor ON vendor_payout_config (module, restaurant_id)")

    # ------------------------------------------------------------------
    # Payouts — one row per settlement window.
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS vendor_payouts (
            id                 TEXT PRIMARY KEY,
            number             TEXT NOT NULL,
            module             TEXT NOT NULL CHECK (module IN ('food','mart','shop')),
            restaurant_id      TEXT NOT NULL,
            period_start       TIMESTAMPTZ NOT NULL,
            period_end         TIMESTAMPTZ NOT NULL,
            gross              NUMERIC(14,2) NOT NULL DEFAULT 0,
            commission         NUMERIC(14,2) NOT NULL DEFAULT 0,
            refunds            NUMERIC(14,2) NOT NULL DEFAULT 0,
            adjustments        NUMERIC(14,2) NOT NULL DEFAULT 0,
            net                NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency           TEXT NOT NULL DEFAULT 'XOF',
            status             TEXT NOT NULL DEFAULT 'scheduled',
            -- scheduled | hold | paid | failed | cancelled
            scheduled_for      TIMESTAMPTZ NULL,
            paid_at            TIMESTAMPTZ NULL,
            reference          TEXT NULL,
            notes              TEXT NULL,
            created_by_admin_id TEXT NULL,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_vp_number ON vendor_payouts (number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vp_vendor ON vendor_payouts (module, restaurant_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_vp_status ON vendor_payouts (status, scheduled_for)")

    # ------------------------------------------------------------------
    # Per-order finance snapshot. We extend food_orders only here; MART/SHOP
    # can mirror this when they adopt the engine.
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE food_orders
            ADD COLUMN IF NOT EXISTS commission_rate_snapshot NUMERIC(6,3) NULL,
            ADD COLUMN IF NOT EXISTS commission_amount        NUMERIC(14,2) NULL,
            ADD COLUMN IF NOT EXISTS vendor_net_amount        NUMERIC(14,2) NULL,
            ADD COLUMN IF NOT EXISTS settlement_status        TEXT NULL,
            ADD COLUMN IF NOT EXISTS settled_payout_id        TEXT NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_orders_settlement ON food_orders (restaurant_id, settlement_status)")

    # ------------------------------------------------------------------
    # Restaurant wallet (FOOD-specific — the generic partner_wallets FK is
    # bound to the MART `partners` table, so we keep this separate).
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurant_wallets (
            id             TEXT PRIMARY KEY,
            restaurant_id  TEXT UNIQUE NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
            balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency       TEXT NOT NULL DEFAULT 'XOF',
            is_active      BOOLEAN NOT NULL DEFAULT TRUE,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_restaurant_wallet_txns (
            id             TEXT PRIMARY KEY,
            wallet_id      TEXT NOT NULL REFERENCES food_restaurant_wallets(id) ON DELETE CASCADE,
            kind           TEXT NOT NULL,
            -- order_net | refund | payout | adjustment
            amount         NUMERIC(14,2) NOT NULL,
            currency       TEXT NOT NULL DEFAULT 'XOF',
            balance_after  NUMERIC(14,2) NOT NULL,
            description    TEXT NULL,
            order_id       TEXT NULL,
            reference      TEXT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_frwt_wallet ON food_restaurant_wallet_txns (wallet_id, created_at DESC)")
    op.execute("""
        INSERT INTO food_restaurant_wallets (id, restaurant_id, balance, currency, is_active)
        SELECT 'frwal_' || r.id, r.id, 0, 'XOF', TRUE FROM food_restaurants r
        ON CONFLICT (restaurant_id) DO NOTHING
    """)


def downgrade() -> None:
    for t in ("food_restaurant_wallet_txns", "food_restaurant_wallets",
              "vendor_payouts", "vendor_payout_config", "vendor_commission_history"):
        op.execute(f"DROP TABLE IF EXISTS {t}")
    op.execute("""
        ALTER TABLE food_orders
            DROP COLUMN IF EXISTS commission_rate_snapshot,
            DROP COLUMN IF EXISTS commission_amount,
            DROP COLUMN IF EXISTS vendor_net_amount,
            DROP COLUMN IF EXISTS settlement_status,
            DROP COLUMN IF EXISTS settled_payout_id
    """)
