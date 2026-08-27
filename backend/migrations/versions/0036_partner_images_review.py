"""PartnerProduct.images_review_status + note (Phase 3 — 2026-02-28).

Fixing_Prompt.docx v4 Phase 3 — Sync supplier gallery to Customer PDP
through the admin approval queue.

When a supplier uploads / reorders images (Phase 2 endpoints), we flip
`images_review_status` to 'pending' if the product is linked to a
MartProduct. Admin queue lists these and can approve (copies
PartnerProduct.images → MartProduct.images + primary) or reject.

Values: none | pending | approved | rejected.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0036_partner_images_review"
down_revision = "0035_partner_images_jsonb"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("partner_products",
                  sa.Column("images_review_status", sa.String(length=20),
                            nullable=False, server_default="none"))
    op.add_column("partner_products",
                  sa.Column("images_review_note", sa.String(length=2000),
                            nullable=True))
    op.create_index("ix_partner_products_images_review",
                    "partner_products", ["images_review_status"])


def downgrade() -> None:
    op.drop_index("ix_partner_products_images_review", table_name="partner_products")
    op.drop_column("partner_products", "images_review_note")
    op.drop_column("partner_products", "images_review_status")
