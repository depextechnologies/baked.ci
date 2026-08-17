"""Phase 5b — in-app notifications.

Adds a single polymorphic `notifications` table used by every portal. Each row
targets exactly one (recipient_kind, recipient_id) so scoping stays trivial.

Revision: 0017_notifications
Down-revision: 0016_supplier_invoices
"""
from alembic import op


revision      = "0017_notifications"
down_revision = "0016_supplier_invoices"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
          id             varchar PRIMARY KEY,
          recipient_kind varchar(24) NOT NULL
              CHECK (recipient_kind IN ('supplier','partner','admin')),
          recipient_id   varchar NOT NULL,

          kind    varchar(48) NOT NULL,
          title   varchar(200) NOT NULL,
          body    text,
          link    varchar(500),

          entity_kind varchar(48),
          entity_id   varchar,
          actor_label varchar(200),

          is_read   boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          read_at   timestamptz
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_notif_recipient ON notifications (recipient_kind, recipient_id, is_read, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications")
