"""SENDbakēd Driver — Slice 6 (In-ride chat) — share_token + messages.

Adds:
  - driver_jobs.share_token (unique, nullable)
  - driver_job_messages (append-only chat log)
  - Backfill: any existing in-flight job gets a share_token so testing
    against pre-existing dispatches still works.

Revision: 0024_driver_job_chat
Down-revision: 0023_driver_wallet
"""
from alembic import op


revision      = "0024_driver_job_chat"
down_revision = "0023_driver_wallet"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE driver_jobs ADD COLUMN IF NOT EXISTS share_token varchar(32) UNIQUE")

    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_job_messages (
            id          varchar PRIMARY KEY,
            job_id      varchar NOT NULL REFERENCES driver_jobs(id) ON DELETE CASCADE,
            sender      varchar(16) NOT NULL,
            preset_key  varchar(48),
            text        text NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_job_messages_job_time ON driver_job_messages (job_id, created_at)")

    # Backfill share_token for any existing non-terminal job so the /send/track
    # links keep working on rows dispatched before this migration.
    op.execute("""
        UPDATE driver_jobs
        SET share_token = 'stk_' || substr(md5(id || random()::text), 1, 20)
        WHERE share_token IS NULL
          AND status IN ('offered','accepted','arriving_pickup','picked_up','arriving_dropoff')
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS driver_job_messages")
    op.execute("ALTER TABLE driver_jobs DROP COLUMN IF EXISTS share_token")
