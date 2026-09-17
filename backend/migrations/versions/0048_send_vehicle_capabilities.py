"""SENDbakēd Phase B — Vehicle catalogue + driver capabilities (2026-03).

Extends the central SEND vehicle model with a French display name and a
refrigerated flag, adds the same refrigerated flag to `module_drivers` so
dispatch queries can filter without a JOIN, and introduces a many-to-many
`driver_vehicle_capabilities` table so a single driver can advertise
several vehicle types (e.g. Motorcycle + Tricycle, or Refrigerated Truck
+ Truck). Fresh Products bookings must NEVER be offered to a driver who
doesn't own a refrigerated vehicle — that guarantee is enforced by the
`is_refrigerated` column added to `module_drivers`.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0048_send_vehicle_capabilities"
down_revision = "0047_shop_bilingual_product"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # -- express_vehicles: French label + refrigerated flag ------------------
    op.add_column("express_vehicles", sa.Column("name_fr",         sa.String(200), nullable=True))
    op.add_column(
        "express_vehicles",
        sa.Column("is_refrigerated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # -- module_drivers: refrigerated capability marker for fast dispatch ----
    op.add_column(
        "module_drivers",
        sa.Column("is_refrigerated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_module_drivers_refrigerated",
        "module_drivers",
        ["module", "country", "vehicle_type", "is_refrigerated", "status", "is_available"],
    )

    # -- driver_vehicle_capabilities: many-to-many association ---------------
    op.create_table(
        "driver_vehicle_capabilities",
        sa.Column("driver_id",   sa.String(),  sa.ForeignKey("drivers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("vehicle_code", sa.String(64), primary_key=True),
        sa.Column("is_primary",   sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_dvc_vehicle_code", "driver_vehicle_capabilities", ["vehicle_code"])


def downgrade() -> None:
    op.drop_index("ix_dvc_vehicle_code",       table_name="driver_vehicle_capabilities")
    op.drop_table("driver_vehicle_capabilities")
    op.drop_index("ix_module_drivers_refrigerated", table_name="module_drivers")
    op.drop_column("module_drivers",   "is_refrigerated")
    op.drop_column("express_vehicles", "is_refrigerated")
    op.drop_column("express_vehicles", "name_fr")
