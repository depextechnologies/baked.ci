"""P2 — Extend mart_category_requests to accept supplier submissions.

Adds `supplier_id` (nullable FK) and `requester_kind` (partner|supplier, default
'partner'). Makes `partner_id` nullable so supplier-originated requests don't
require a partner FK.

Revision: 0019_category_requests_supplier
Down-revision: 0018_seller_slug
"""
from alembic import op


revision      = "0019_category_requests_supplier"
down_revision = "0018_seller_slug"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE mart_category_requests ADD COLUMN IF NOT EXISTS supplier_id varchar REFERENCES suppliers(id) ON DELETE CASCADE")
    op.execute("ALTER TABLE mart_category_requests ADD COLUMN IF NOT EXISTS requester_kind varchar(16) NOT NULL DEFAULT 'partner'")
    op.execute("ALTER TABLE mart_category_requests ALTER COLUMN partner_id DROP NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cat_req_supplier ON mart_category_requests (supplier_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cat_req_kind ON mart_category_requests (requester_kind, status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_cat_req_kind")
    op.execute("DROP INDEX IF EXISTS ix_cat_req_supplier")
    op.execute("ALTER TABLE mart_category_requests DROP COLUMN IF EXISTS requester_kind")
    op.execute("ALTER TABLE mart_category_requests DROP COLUMN IF EXISTS supplier_id")
