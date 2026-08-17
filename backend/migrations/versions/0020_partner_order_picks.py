"""Picker/Packer/Dispatch — per-line pick progress table.

Records how many units of each order_item a picker has scanned/added to the
pack. One row per (partner_order_id, order_item_id) — upserted on each scan.

Revision: 0020_partner_order_picks
Down-revision: 0019_category_requests_supplier
"""
from alembic import op


revision      = "0020_partner_order_picks"
down_revision = "0019_category_requests_supplier"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_order_picks (
            id                varchar        PRIMARY KEY,
            partner_order_id  varchar        NOT NULL REFERENCES partner_orders(id) ON DELETE CASCADE,
            order_item_id     varchar        NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            picked_qty        integer        NOT NULL DEFAULT 0,
            picker_staff_id   varchar        NULL,
            picker_owner_id   varchar        NULL,
            first_picked_at   timestamptz    NULL,
            last_picked_at    timestamptz    NULL,
            created_at        timestamptz    NOT NULL DEFAULT now(),
            updated_at        timestamptz    NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_order_picks_item UNIQUE (partner_order_id, order_item_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_order_picks_partner_order ON partner_order_picks (partner_order_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS partner_order_picks")
