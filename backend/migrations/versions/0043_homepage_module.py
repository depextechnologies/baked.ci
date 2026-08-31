"""HomepageSection module column (Slice 7, 2026-02).

Adds `module` discriminator so Super Admin can curate a separate stack of
rails per BAKĒD business app. Existing rows default to "mart".
"""
from alembic import op
import sqlalchemy as sa


revision      = "0043_homepage_module"
down_revision = "0042_shop_cart"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "homepage_sections",
        sa.Column("module", sa.String(16), nullable=False, server_default="mart"),
    )
    op.create_index("ix_homepage_country_module_order",
                    "homepage_sections",
                    ["country", "module", "display_order"])


def downgrade() -> None:
    op.drop_index("ix_homepage_country_module_order", table_name="homepage_sections")
    op.drop_column("homepage_sections", "module")
