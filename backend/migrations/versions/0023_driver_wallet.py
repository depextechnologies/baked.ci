"""SENDbakēd Driver — Slice 3 (Wallet) — earnings + withdrawals.

driver_earnings is an append-only ledger. driver_withdrawals is a request
log (status: pending | paid | failed). Withdrawal execution is mocked in
this slice — an operator flips status manually.

Revision: 0023_driver_wallet
Down-revision: 0022_driver_jobs
"""
from alembic import op


revision      = "0023_driver_wallet"
down_revision = "0022_driver_jobs"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_earnings (
            id          varchar PRIMARY KEY,
            driver_id   varchar NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
            job_id      varchar          REFERENCES driver_jobs(id) ON DELETE SET NULL,
            kind        varchar(16) NOT NULL DEFAULT 'fare',
            amount      double precision NOT NULL,
            currency    varchar(8) NOT NULL,
            note        text,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_earnings_driver_time ON driver_earnings (driver_id, created_at DESC)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_driver_earnings_job_kind ON driver_earnings (job_id, kind) WHERE job_id IS NOT NULL")

    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_withdrawals (
            id            varchar PRIMARY KEY,
            driver_id     varchar NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
            amount        double precision NOT NULL,
            currency      varchar(8) NOT NULL,
            status        varchar(16) NOT NULL DEFAULT 'pending',
            bank_holder   varchar(200),
            bank_account  varchar(80),
            bank_ifsc     varchar(40),
            failure_note  text,
            requested_at  timestamptz NOT NULL DEFAULT now(),
            processed_at  timestamptz
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_withdrawals_driver_time ON driver_withdrawals (driver_id, requested_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_withdrawals_status ON driver_withdrawals (status)")

    # Backfill: one earning row per already-delivered job. Idempotent via the
    # unique (job_id, kind) index — re-running this migration is a no-op.
    op.execute("""
        INSERT INTO driver_earnings (id, driver_id, job_id, kind, amount, currency, created_at)
        SELECT
            'dern_' || substr(md5(j.id), 1, 12),
            j.driver_id,
            j.id,
            'fare',
            j.fare_amount,
            j.fare_currency,
            COALESCE(j.delivered_at, now())
        FROM driver_jobs j
        WHERE j.status = 'delivered'
          AND j.driver_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM driver_earnings e
              WHERE e.job_id = j.id AND e.kind = 'fare'
          )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS driver_withdrawals")
    op.execute("DROP TABLE IF EXISTS driver_earnings")
