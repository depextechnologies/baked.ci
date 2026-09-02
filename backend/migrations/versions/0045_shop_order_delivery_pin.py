"""SHOPbakēd — delivery PIN + delivered_at for SHOP orders (2026-03).

Adds:
  * `delivery_pin` — 6-digit code minted at checkout, shared with the customer
    only. The seller/delivery person must enter this PIN at handoff to
    transition the order to `delivered`.
  * `delivery_pin_attempts` — counter used to rate-limit brute-force attempts
    on the deliver endpoint (max 5 fails per order).
  * `delivered_at` — server timestamp when the PIN was validated.

Rationale (Fixing_Prompt v4): trust-based "seller marks delivered" is unsafe
for a marketplace. Requiring the customer's PIN closes the loop.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0045_shop_order_delivery_pin"
down_revision = "0044_shop_orders"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("shop_orders", sa.Column("delivery_pin", sa.String(6), nullable=True))
    op.add_column("shop_orders", sa.Column("delivery_pin_attempts", sa.Integer(),
                                            nullable=False, server_default="0"))
    op.add_column("shop_orders", sa.Column("delivered_at", sa.TIMESTAMP(timezone=True),
                                            nullable=True))


def downgrade() -> None:
    op.drop_column("shop_orders", "delivered_at")
    op.drop_column("shop_orders", "delivery_pin_attempts")
    op.drop_column("shop_orders", "delivery_pin")
