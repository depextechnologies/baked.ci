"""Social.docx §9 — Bind suppliers to specific darkstores / fulfilment centres.

Adds `supplier_warehouse_assignments` so a supplier can only supply the
warehouses an admin has explicitly assigned. Used by the purchase-order
flow and by the supplier portal to scope customer visibility.

Revision: 0027_supplier_warehouse_assignments
Down-revision: 0026_warehouse_category_defaults
"""
from alembic import op
import sqlalchemy as sa


revision      = "0027_supplier_warehouses"
down_revision = "0026_warehouse_category_defaults"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "supplier_warehouse_assignments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("supplier_id", sa.String(), sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("warehouse_id", sa.String(), sa.ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("assigned_by_admin_id", sa.String(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("supplier_id", "warehouse_id", name="uq_swa_supplier_warehouse"),
    )
    op.create_index("ix_swa_supplier", "supplier_warehouse_assignments", ["supplier_id"])
    op.create_index("ix_swa_warehouse", "supplier_warehouse_assignments", ["warehouse_id"])


def downgrade() -> None:
    op.drop_index("ix_swa_warehouse", table_name="supplier_warehouse_assignments")
    op.drop_index("ix_swa_supplier", table_name="supplier_warehouse_assignments")
    op.drop_table("supplier_warehouse_assignments")
