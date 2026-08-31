"""SHOPbakēd foundation (Slice 1) — 2026-02.

Creates the isolated SHOP catalogue tables and adds the shared-supplier
`modules` JSONB column so a single supplier account can opt-in to any
subset of BAKĒD modules ({"MART", "SHOP", ...}).

Tables added:
  * shop_brands
  * shop_categories
  * shop_subcategories
  * shop_products
  * shop_variants

Column added:
  * suppliers.modules JSONB (default ["MART"])  — backfilled for every
    existing row so nothing regresses on MART.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision      = "0039_shop_foundation"
down_revision = "0038_supplier_request_attributes"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ---- 1) suppliers.modules JSONB (shared identity) ----
    op.add_column(
        "suppliers",
        sa.Column(
            "modules",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("""'["MART"]'::jsonb"""),
        ),
    )
    # Backfill: every existing supplier keeps MART access. The server_default
    # already fills new inserts, but we set the column explicitly here to
    # future-proof against any historical rows that skipped the default.
    op.execute("""UPDATE suppliers SET modules = '["MART"]'::jsonb WHERE modules IS NULL OR modules = '{}'::jsonb""")

    # ---- 2) shop_brands ----
    op.create_table(
        "shop_brands",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country", sa.String(2), sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("logo_url", sa.String(600), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("slug", "country", name="uq_shop_brands_slug_country"),
    )
    op.create_index("ix_shop_brands_active", "shop_brands", ["country", "is_active"])

    # ---- 3) shop_categories ----
    op.create_table(
        "shop_categories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("country", sa.String(2), sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("name_en", sa.String(200), nullable=True),
        sa.Column("name_fr", sa.String(200), nullable=True),
        sa.Column("icon", sa.String(200), nullable=True),
        sa.Column("image", sa.String(600), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("slug", "country", name="uq_shop_categories_slug_country"),
    )

    # ---- 4) shop_subcategories ----
    op.create_table(
        "shop_subcategories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("category_id", sa.String(),
                  sa.ForeignKey("shop_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("country", sa.String(2), sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("name_en", sa.String(200), nullable=True),
        sa.Column("name_fr", sa.String(200), nullable=True),
        sa.Column("image", sa.String(600), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("slug", "category_id", name="uq_shop_subcategories_slug_category"),
    )

    # ---- 5) shop_products ----
    op.create_table(
        "shop_products",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(400), nullable=False),
        sa.Column("slug", sa.String(200), nullable=True),
        sa.Column("country", sa.String(2), sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("module", sa.String(16), nullable=False, server_default="shop"),
        sa.Column("supplier_id", sa.String(),
                  sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("brand_id", sa.String(), sa.ForeignKey("shop_brands.id"), nullable=True),
        sa.Column("category_id", sa.String(), sa.ForeignKey("shop_categories.id"), nullable=True),
        sa.Column("subcategory_id", sa.String(), sa.ForeignKey("shop_subcategories.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("images", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(24), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_shop_products_country_status", "shop_products", ["country", "status"])
    op.create_index("ix_shop_products_supplier", "shop_products", ["supplier_id"])
    op.create_index("ix_shop_products_subcategory", "shop_products", ["subcategory_id"])

    # ---- 6) shop_variants ----
    op.create_table(
        "shop_variants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("product_id", sa.String(),
                  sa.ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(120), nullable=False),
        sa.Column("title_suffix", sa.String(200), nullable=True),
        sa.Column("price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("compare_at_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(8), nullable=False, server_default="XOF"),
        sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("condition", sa.String(24), nullable=False, server_default="new"),
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("images", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("product_id", "sku", name="uq_shop_variants_product_sku"),
    )
    op.create_index("ix_shop_variants_product", "shop_variants", ["product_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_shop_variants_product", table_name="shop_variants")
    op.drop_table("shop_variants")
    op.drop_index("ix_shop_products_subcategory", table_name="shop_products")
    op.drop_index("ix_shop_products_supplier", table_name="shop_products")
    op.drop_index("ix_shop_products_country_status", table_name="shop_products")
    op.drop_table("shop_products")
    op.drop_table("shop_subcategories")
    op.drop_table("shop_categories")
    op.drop_index("ix_shop_brands_active", table_name="shop_brands")
    op.drop_table("shop_brands")
    op.drop_column("suppliers", "modules")
