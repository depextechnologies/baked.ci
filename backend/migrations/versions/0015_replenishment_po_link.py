"""Phase 4b — link replenishment suggestions to draft POs.

Adds:
  * `partner_replenishments.converted_po_id` (nullable FK → purchase_orders.id)
  * Extends `ck_replen_status` to include `'converted_to_po'`

Revision: 0015_replenishment_po_link
Down-revision: 0014_purchase_orders
"""
from alembic import op


revision      = "0015_replenishment_po_link"
down_revision = "0014_purchase_orders"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE partner_replenishments "
               "ADD COLUMN IF NOT EXISTS converted_po_id varchar NULL REFERENCES purchase_orders(id) ON DELETE SET NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_replen_converted_po ON partner_replenishments (converted_po_id)")
    op.execute("ALTER TABLE partner_replenishments DROP CONSTRAINT IF EXISTS ck_replen_status")
    op.execute(
        "ALTER TABLE partner_replenishments ADD CONSTRAINT ck_replen_status "
        "CHECK (status IN ('suggested','approved','dispatched','received','cancelled','converted_to_po'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE partner_replenishments DROP CONSTRAINT IF EXISTS ck_replen_status")
    op.execute(
        "ALTER TABLE partner_replenishments ADD CONSTRAINT ck_replen_status "
        "CHECK (status IN ('suggested','approved','dispatched','received','cancelled'))"
    )
    op.execute("DROP INDEX IF EXISTS ix_replen_converted_po")
    op.execute("ALTER TABLE partner_replenishments DROP COLUMN IF EXISTS converted_po_id")
