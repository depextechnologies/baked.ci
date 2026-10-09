"""Cron-scheduled vendor payouts — timezone-aware schedules + idempotency.

Adds the pieces missing from 0069_vendor_settlement so the platform cron can
auto-generate payouts per each vendor's own schedule (Africa/Abidjan by
default) without the Super Admin having to click "Generate payout now":

  * `vendor_payout_config.timezone`              — IANA zone (default Africa/Abidjan)
  * `vendor_payout_config.last_payout_run_at`    — last successful cron run
  * `vendor_payout_config.last_payout_period_end`— period_end of the last
                                                   generated payout, used by
                                                   the "due?" calculator
  * `vendor_payouts.trigger`                     — 'manual' | 'cron'
  * `vendor_payout_runs`                         — audit log for cron runs

A UNIQUE index on `vendor_payouts (restaurant_id, DATE(period_end))` scoped
to cron-triggered rows guarantees DB-level idempotency: a duplicate cron
dispatch for the same day cannot create two payouts.

Revision:      0070_vendor_payout_cron
Down-revision: 0069_vendor_settlement
"""
from alembic import op


revision      = "0070_vendor_payout_cron"
down_revision = "0069_vendor_settlement"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE vendor_payout_config
            ADD COLUMN IF NOT EXISTS timezone                TEXT NOT NULL DEFAULT 'Africa/Abidjan',
            ADD COLUMN IF NOT EXISTS last_payout_run_at      TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS last_payout_period_end  TIMESTAMPTZ NULL
    """)

    op.execute("""
        ALTER TABLE vendor_payouts
            ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'manual',
            ADD COLUMN IF NOT EXISTS period_end_date DATE NULL
    """)
    # Backfill the new DATE column for any pre-existing rows so historical
    # cron-triggered rows participate in the unique index.
    op.execute("UPDATE vendor_payouts SET period_end_date = (period_end AT TIME ZONE 'UTC')::date WHERE period_end_date IS NULL")

    # DB-level idempotency: cron can't create two rows for the same vendor
    # on the same calendar day. We use a plain DATE column (set by the
    # inserter) because PG rejects timestamptz::date in index expressions —
    # it isn't IMMUTABLE enough for the planner.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_vp_cron_daily
          ON vendor_payouts (module, restaurant_id, period_end_date)
          WHERE trigger = 'cron'
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS vendor_payout_runs (
            id             TEXT PRIMARY KEY,
            run_id         TEXT UNIQUE NOT NULL,
            started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at    TIMESTAMPTZ NULL,
            vendors_scanned INTEGER NOT NULL DEFAULT 0,
            payouts_created INTEGER NOT NULL DEFAULT 0,
            skipped         INTEGER NOT NULL DEFAULT 0,
            errors          INTEGER NOT NULL DEFAULT 0,
            summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_vp_cron_daily")
    op.execute("""
        ALTER TABLE vendor_payouts
            DROP COLUMN IF EXISTS trigger,
            DROP COLUMN IF EXISTS period_end_date
    """)
    op.execute("""
        ALTER TABLE vendor_payout_config
            DROP COLUMN IF EXISTS timezone,
            DROP COLUMN IF EXISTS last_payout_run_at,
            DROP COLUMN IF EXISTS last_payout_period_end
    """)
    op.execute("DROP TABLE IF EXISTS vendor_payout_runs")
