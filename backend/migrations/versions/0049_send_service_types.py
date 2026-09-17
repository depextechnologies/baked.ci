"""SENDbakēd Phase C — service_type + service-vehicle eligibility (2026-03).

* Adds `express_bookings.service_type` so every booking records which SEND
  service tile it originated from (moto · cargo · fresh_products ·
  between_cities · multiple_shipments). Enforced by a CHECK constraint so
  the booking table cannot drift.
* Adds `send_service_vehicles` — the source of truth for "which vehicle
  codes are eligible for which service" (config-driven, editable per row,
  future admin UI-ready). Composite PK `(service_type, vehicle_code)`.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0049_send_service_types"
down_revision = "0048_send_vehicle_capabilities"
branch_labels = None
depends_on    = None


SERVICE_TYPES = ("moto", "cargo", "fresh_products", "between_cities", "multiple_shipments")


def upgrade() -> None:
    op.add_column("express_bookings", sa.Column("service_type", sa.String(32), nullable=True))
    op.create_check_constraint(
        "ck_express_bookings_service_type",
        "express_bookings",
        f"service_type IS NULL OR service_type IN ({', '.join(repr(s) for s in SERVICE_TYPES)})",
    )
    op.create_index(
        "ix_express_bookings_service_type",
        "express_bookings",
        ["service_type", "status"],
    )

    op.create_table(
        "send_service_vehicles",
        sa.Column("service_type", sa.String(32),  primary_key=True),
        sa.Column("vehicle_code", sa.String(64),  primary_key=True),
        sa.Column("active",       sa.Boolean(),   nullable=False, server_default=sa.true()),
        sa.Column("sort_order",   sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            f"service_type IN ({', '.join(repr(s) for s in SERVICE_TYPES)})",
            name="ck_send_service_vehicles_service_type",
        ),
    )
    op.create_index("ix_ssv_vehicle_code", "send_service_vehicles", ["vehicle_code"])


def downgrade() -> None:
    op.drop_index("ix_ssv_vehicle_code", table_name="send_service_vehicles")
    op.drop_table("send_service_vehicles")
    op.drop_index("ix_express_bookings_service_type", table_name="express_bookings")
    op.drop_constraint("ck_express_bookings_service_type", "express_bookings", type_="check")
    op.drop_column("express_bookings", "service_type")
