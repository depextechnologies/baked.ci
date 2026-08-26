"""SENDbakēd real dispatch — bridges the SENDbakēd Driver (drivers table) into
the existing ModuleDriver dispatch pool, and adds server-authoritative job
offer + timeout fields to ExpressBooking.

Additions
---------
module_drivers:
    linked_driver_id  — FK drivers.id (nullable, unique). When set, the row
                         represents a real SENDbakēd driver, not a seed.
    last_seen_at      — timestamp of the last location ping. Used by the
                         dispatch filter (< 60s = online for matching).

express_bookings:
    offered_to_driver_id — FK module_drivers.id (nullable). Set while the
                            offer is outstanding.
    offered_at           — when the offer was pushed.
    offer_expires_at     — server-authoritative countdown deadline.
    declined_driver_ids  — JSONB array of driver ids that already rejected.

Status CHECK is extended to include the new 'offering' transient state.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision      = "0032_sendbaked_dispatch"
down_revision = "0031_driver_otp_email_purpose"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # --- module_drivers bridge ------------------------------------------------
    op.add_column("module_drivers", sa.Column("linked_driver_id", sa.String(), nullable=True))
    op.add_column("module_drivers", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_module_drivers_linked_driver_id",
        "module_drivers", "drivers",
        ["linked_driver_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "ix_module_drivers_linked_driver_id",
        "module_drivers", ["linked_driver_id"], unique=True,
        postgresql_where=sa.text("linked_driver_id IS NOT NULL"),
    )
    op.create_index(
        "ix_module_drivers_last_seen_at",
        "module_drivers", ["last_seen_at"],
    )

    # --- express_bookings offer fields ---------------------------------------
    op.add_column("express_bookings", sa.Column("offered_to_driver_id", sa.String(), nullable=True))
    op.add_column("express_bookings", sa.Column("offered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("express_bookings", sa.Column("offer_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "express_bookings",
        sa.Column("declined_driver_ids", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_foreign_key(
        "fk_express_bookings_offered_to_driver_id",
        "express_bookings", "module_drivers",
        ["offered_to_driver_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(
        "ix_express_bookings_offer_pending",
        "express_bookings", ["offer_expires_at"],
        postgresql_where=sa.text("offered_to_driver_id IS NOT NULL AND status = 'offering'"),
    )

    # Extend status CHECK to accept the transient 'offering' state.
    op.drop_constraint("ck_express_bookings_status", "express_bookings", type_="check")
    op.create_check_constraint(
        "ck_express_bookings_status", "express_bookings",
        "status IN ('searching','offering','driver_assigned','arriving','picked_up',"
        "'in_transit','delivered','cancelled','confirmed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_express_bookings_status", "express_bookings", type_="check")
    op.create_check_constraint(
        "ck_express_bookings_status", "express_bookings",
        "status IN ('searching','driver_assigned','arriving','picked_up',"
        "'in_transit','delivered','cancelled','confirmed')",
    )
    op.drop_index("ix_express_bookings_offer_pending", table_name="express_bookings")
    op.drop_constraint("fk_express_bookings_offered_to_driver_id", "express_bookings", type_="foreignkey")
    op.drop_column("express_bookings", "declined_driver_ids")
    op.drop_column("express_bookings", "offer_expires_at")
    op.drop_column("express_bookings", "offered_at")
    op.drop_column("express_bookings", "offered_to_driver_id")

    op.drop_index("ix_module_drivers_last_seen_at", table_name="module_drivers")
    op.drop_index("ix_module_drivers_linked_driver_id", table_name="module_drivers")
    op.drop_constraint("fk_module_drivers_linked_driver_id", "module_drivers", type_="foreignkey")
    op.drop_column("module_drivers", "last_seen_at")
    op.drop_column("module_drivers", "linked_driver_id")
