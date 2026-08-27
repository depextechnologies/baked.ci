"""MartProduct details JSONB (Fixing_Prompt.docx — 2026-02-28).

Adds a nullable `details` JSONB column to `mart_products` so suppliers /
admins can populate the flexible product-information system without
schema churn per attribute. Well-known keys (fssai, allergens, shelf_life,
taste_profile, disclaimer, customer_care, country_of_origin, ingredients,
manufacturer_address, marketer_name, marketer_address, seller_fssai,
return_policy, serve_size, nutrition{}) are surfaced verbatim on the
customer PDP; anything else the supplier adds shows up in a "More info"
key/value list. Nullable + backward-compatible.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision      = "0034_mart_product_details_jsonb"
down_revision = "0033_warehouse_category_cascade"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "mart_products",
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("mart_products", "details")
