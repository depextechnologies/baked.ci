"""Customer address book: recipient name + phone for delivery.

Revision: 0072_address_recipient
Down-revision: 0071_food_delivery_zones
"""
from alembic import op
import sqlalchemy as sa

revision = "0072_address_recipient"
down_revision = "0071_food_delivery_zones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customer_addresses", sa.Column("recipient_name", sa.String(), nullable=True))
    op.add_column("customer_addresses", sa.Column("recipient_phone", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("customer_addresses", "recipient_phone")
    op.drop_column("customer_addresses", "recipient_name")
