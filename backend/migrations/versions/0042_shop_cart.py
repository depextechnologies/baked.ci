"""SHOPbakēd — customer cart items table (Slice 6, 2026-02).

SHOP items live in their own `shop_cart_items` table rather than being
crammed into `cart_items` (which has a hard FK to `mart_products.id`).

Keeps MART's cart schema untouched while giving SHOP first-class variant-
level cart entries. The parent `carts` row is still shared per customer,
so a customer's active cart holds MART items + SHOP variant items and
checkout in a later slice can split them into per-module orders.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0042_shop_cart"
down_revision = "0041_audit_modules_action"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "shop_cart_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("cart_id", sa.String(),
                  sa.ForeignKey("carts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", sa.String(),
                  sa.ForeignKey("shop_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("added_at", sa.TIMESTAMP(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("cart_id", "variant_id", name="uq_shop_cart_items_cart_variant"),
    )
    op.create_index("ix_shop_cart_items_cart", "shop_cart_items", ["cart_id"])


def downgrade() -> None:
    op.drop_index("ix_shop_cart_items_cart", table_name="shop_cart_items")
    op.drop_table("shop_cart_items")
