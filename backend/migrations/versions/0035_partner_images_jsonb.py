"""PartnerProduct.images JSONB for supplier-managed multi-image gallery.

Fixing_Prompt.docx v4 Phase 2 (2026-02-28) — Supplier Image Manager.

Adds a nullable JSONB `images` array column to `partner_products` so
suppliers can upload, reorder, remove and pick a primary image directly
from the partner portal, without waiting on admin. The existing single
`image` column stays as a convenience "primary" pointer (kept in sync
with `images[0]` by the API) so pre-cascade rendering paths continue
to work unmodified.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision      = "0035_partner_images_jsonb"
down_revision = "0034_mart_product_details_jsonb"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "partner_products",
        sa.Column("images", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("partner_products", "images")
