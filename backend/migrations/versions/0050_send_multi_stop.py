"""SENDbakēd Phase E — multi-stop trip payload (2026-03).

Adds `express_bookings.stops` — a JSONB array of ordered `{pickup, drop}`
pairs for `service_type = "multiple_shipments"`. Legacy single-shipment
bookings continue to store the whole route in `pickup_*` / `drop_*`
columns; the JSONB payload is `NULL` for them.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision      = "0050_send_multi_stop"
down_revision = "0049_send_service_types"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "express_bookings",
        sa.Column("stops", JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("express_bookings", "stops")
