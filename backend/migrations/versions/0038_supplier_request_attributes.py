"""Supplier product-request: dynamic attribute payload (Slice 2, 2026-02-28).

Adds two columns to `supplier_product_requests`:
  * proposed_subcategory_id — nullable FK to mart_subcategories, powers the
    supplier form's subcategory-scoped attribute resolution.
  * attributes — JSONB snapshot of {attribute_key: {v, label, type}} written
    at submit time so historical requests survive attribute renames.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0038_supplier_request_attributes"
down_revision = "0037_mart_dynamic_attributes"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "supplier_product_requests",
        sa.Column("proposed_subcategory_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_supplier_prod_req_subcategory",
        "supplier_product_requests", "mart_subcategories",
        ["proposed_subcategory_id"], ["id"],
    )
    op.add_column(
        "supplier_product_requests",
        sa.Column(
            "attributes",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("supplier_product_requests", "attributes")
    op.drop_constraint("fk_supplier_prod_req_subcategory",
                       "supplier_product_requests", type_="foreignkey")
    op.drop_column("supplier_product_requests", "proposed_subcategory_id")
