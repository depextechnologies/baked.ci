"""store_transfers — Batch 3b of Inventory Control Tower.

Super-Admin-orchestrated stock movement between two dark stores.

Lifecycle:
    draft → requested → approved → in_transit → received  (or cancelled)

Each transfer has multiple line items. Dispatch decrements the source
warehouse's available_qty and records `transfer_out` movements; receive
increments the destination warehouse's available_qty and records
`transfer_in` movements. Never-negative respected — the dispatch step
refuses if any source SKU has insufficient stock.

Revision: 0010_store_transfers
Down-revision: 0009_replenishment_suggestions
"""
from alembic import op


revision      = "0010_store_transfers"
down_revision = "0009_replenishment_suggestions"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_transfers (
            id                      varchar PRIMARY KEY,
            code                    varchar(40) NOT NULL UNIQUE,
            from_partner_id         varchar NOT NULL REFERENCES partners(id),
            from_warehouse_id       varchar NOT NULL REFERENCES warehouses(id),
            to_partner_id           varchar NOT NULL REFERENCES partners(id),
            to_warehouse_id         varchar NOT NULL REFERENCES warehouses(id),
            status                  varchar(20) NOT NULL DEFAULT 'draft',
            reason                  varchar(200),
            notes                   text,
            created_by_admin_id     varchar REFERENCES admin_users(id),
            approved_by_admin_id    varchar REFERENCES admin_users(id),
            dispatched_by_admin_id  varchar REFERENCES admin_users(id),
            received_by_admin_id    varchar REFERENCES admin_users(id),
            created_at              timestamptz NOT NULL DEFAULT now(),
            updated_at              timestamptz NOT NULL DEFAULT now(),
            requested_at            timestamptz,
            approved_at             timestamptz,
            dispatched_at           timestamptz,
            received_at             timestamptz,
            cancelled_at            timestamptz,
            CONSTRAINT ck_transfer_status CHECK (status IN
                ('draft','requested','approved','in_transit','received','cancelled')),
            CONSTRAINT ck_transfer_not_self CHECK (from_warehouse_id <> to_warehouse_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_transfer_status ON partner_transfers(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_transfer_from  ON partner_transfers(from_warehouse_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_transfer_to    ON partner_transfers(to_warehouse_id, status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_transfer_items (
            id                       varchar PRIMARY KEY,
            transfer_id              varchar NOT NULL REFERENCES partner_transfers(id) ON DELETE CASCADE,
            from_partner_product_id  varchar NOT NULL REFERENCES partner_products(id),
            to_partner_product_id    varchar REFERENCES partner_products(id),
            quantity                 integer NOT NULL,
            dispatched_qty           integer NOT NULL DEFAULT 0,
            received_qty             integer NOT NULL DEFAULT 0,
            dispatch_movement_id     varchar REFERENCES partner_stock_movements(id),
            receive_movement_id      varchar REFERENCES partner_stock_movements(id),
            notes                    text,
            created_at               timestamptz NOT NULL DEFAULT now(),
            updated_at               timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_transfer_item_qty_pos      CHECK (quantity > 0),
            CONSTRAINT ck_transfer_item_disp_nonneg  CHECK (dispatched_qty >= 0),
            CONSTRAINT ck_transfer_item_recv_nonneg  CHECK (received_qty  >= 0),
            CONSTRAINT ck_transfer_item_disp_le_qty  CHECK (dispatched_qty <= quantity),
            CONSTRAINT ck_transfer_item_recv_le_disp CHECK (received_qty  <= dispatched_qty)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_transfer_item_transfer ON partner_transfer_items(transfer_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS partner_transfer_items")
    op.execute("DROP TABLE IF EXISTS partner_transfers")
