"""SHOPbakēd — shop_orders + shop_order_items (Slice 9 checkout, 2026-02).

MART's `orders` / `order_items` tables have hard FKs to `mart_products`
so we cannot reuse them for SHOP variant sales. Following the isolation
pattern from Slice 6 (`shop_cart_items`), the checkout engine mints
per-module fulfilment orders into their own tables.

Phase 8+ can introduce a unified `Fulfilment` view/abstraction on top
of these two isolated modules.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision      = "0044_shop_orders"
down_revision = "0043_homepage_module"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "shop_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("number", sa.String(), nullable=False),
        sa.Column("customer_id", sa.String(),
                  sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("module", sa.String(16), nullable=False, server_default="shop"),
        sa.Column("country", sa.String(2),
                  sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending_payment"),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False),
        sa.Column("delivery_fee", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("payment_status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("payment_provider", sa.String(24), nullable=True),
        sa.Column("payment_provider_ref", sa.String(200), nullable=True),
        # Immutable snapshot of the cart at checkout — powers receipt / audit.
        sa.Column("snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("delivery_address", postgresql.JSONB(), nullable=True),
        sa.Column("instructions", sa.String(400), nullable=True),
        sa.Column("placed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("number", name="uq_shop_orders_number"),
    )
    op.create_index("ix_shop_orders_customer", "shop_orders",
                    ["customer_id", "created_at"])

    op.create_table(
        "shop_order_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("order_id", sa.String(),
                  sa.ForeignKey("shop_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.String(),
                  sa.ForeignKey("shop_variants.id"), nullable=False),
        sa.Column("product_id", sa.String(),
                  sa.ForeignKey("shop_products.id"), nullable=False),
        sa.Column("supplier_id", sa.String(),
                  sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sku", sa.String(120), nullable=False),
        sa.Column("title", sa.String(400), nullable=False),
        sa.Column("attributes", postgresql.JSONB(), nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_shop_order_items_order", "shop_order_items", ["order_id"])
    op.create_index("ix_shop_order_items_supplier", "shop_order_items", ["supplier_id"])


def downgrade() -> None:
    op.drop_index("ix_shop_order_items_supplier", table_name="shop_order_items")
    op.drop_index("ix_shop_order_items_order", table_name="shop_order_items")
    op.drop_table("shop_order_items")
    op.drop_index("ix_shop_orders_customer", table_name="shop_orders")
    op.drop_table("shop_orders")
