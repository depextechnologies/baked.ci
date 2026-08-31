"""SHOPbakēd — dynamic attributes engine extension (Slice 3, 2026-02).

Extends the existing MART attribute engine to work with SHOP:
  * Adds `module` column to `mart_attributes` so attribute definitions can
    be scoped to a business module (defaults to "mart" for legacy rows).
  * Creates `shop_category_attributes` — parallel assignment table with
    FKs to `shop_categories` and `shop_subcategories`.

Attribute *definitions* stay in the shared `mart_attributes` table (a Size
is a Size regardless of module). The assignment tables stay separate so
SHOP and MART hierarchies remain fully isolated.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0040_shop_attributes"
down_revision = "0039_shop_foundation"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ---- 1) Tag attribute definitions with the module they belong to ----
    op.add_column(
        "mart_attributes",
        sa.Column("module", sa.String(16), nullable=False, server_default="mart"),
    )
    op.create_index("ix_mart_attributes_module", "mart_attributes", ["module", "is_active"])

    # ---- 2) SHOP assignment table (mirrors mart_category_attributes) ----
    op.create_table(
        "shop_category_attributes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("category_id", sa.String(),
                  sa.ForeignKey("shop_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subcategory_id", sa.String(),
                  sa.ForeignKey("shop_subcategories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("attribute_id", sa.String(),
                  sa.ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("customer_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("supplier_editable", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("category_id", "subcategory_id", "attribute_id",
                            name="uq_shop_cat_attr_scope"),
    )
    op.create_index("ix_shop_cat_attr_cat", "shop_category_attributes", ["category_id"])
    op.create_index("ix_shop_cat_attr_sub", "shop_category_attributes", ["subcategory_id"])


def downgrade() -> None:
    op.drop_index("ix_shop_cat_attr_sub", table_name="shop_category_attributes")
    op.drop_index("ix_shop_cat_attr_cat", table_name="shop_category_attributes")
    op.drop_table("shop_category_attributes")
    op.drop_index("ix_mart_attributes_module", table_name="mart_attributes")
    op.drop_column("mart_attributes", "module")
