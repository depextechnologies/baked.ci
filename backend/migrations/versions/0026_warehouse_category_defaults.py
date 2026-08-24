"""Social.docx §4 — Category → default Zone/Aisle mapping per warehouse.

Adds `warehouse_category_defaults` so ops can set a suggested zone for each
MART category on a per-warehouse basis. Used by the SKU-Location assignment
UI to default-scope the bin picker to the right area.

Revision: 0026_warehouse_category_defaults
Down-revision: 0025_send_india_vehicles
"""
from alembic import op
import sqlalchemy as sa


revision      = "0026_warehouse_category_defaults"
down_revision = "0025_send_india_vehicles"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "warehouse_category_defaults",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("warehouse_id", sa.String(), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_slug", sa.String(length=120), nullable=False),
        sa.Column("zone_id", sa.String(), sa.ForeignKey("warehouse_zones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aisle_id", sa.String(), sa.ForeignKey("warehouse_aisles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("warehouse_id", "category_slug", name="uq_whcd_wh_category"),
    )
    op.create_index("ix_whcd_warehouse", "warehouse_category_defaults", ["warehouse_id"])


def downgrade() -> None:
    op.drop_index("ix_whcd_warehouse", table_name="warehouse_category_defaults")
    op.drop_table("warehouse_category_defaults")
