"""replenishment_suggestions — Batch 3a of Inventory Control Tower.

Adds `partner_replenishments` table — Super Admin owned queue of restock
suggestions generated from the Low-Stock and Out-of-Stock centres.

Lifecycle:
    suggested → approved → dispatched → received (or cancelled)

Approving lets an admin edit the quantity. Marking received auto-writes a
`receive` movement to the target warehouse and bumps PartnerInventory.available_qty.

Revision: 0009_replenishment_suggestions
Down-revision: 0008_inventory_ops_phase3
"""
from alembic import op


revision      = "0009_replenishment_suggestions"
down_revision = "0008_inventory_ops_phase3"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_replenishments (
            id                   varchar PRIMARY KEY,
            partner_id           varchar NOT NULL REFERENCES partners(id),
            warehouse_id         varchar NOT NULL REFERENCES warehouses(id),
            partner_product_id   varchar NOT NULL REFERENCES partner_products(id) ON DELETE CASCADE,
            current_qty          integer NOT NULL DEFAULT 0,
            low_stock_threshold  integer NOT NULL DEFAULT 5,
            suggested_qty        integer NOT NULL DEFAULT 0,
            approved_qty         integer,
            received_qty         integer NOT NULL DEFAULT 0,
            status               varchar(20) NOT NULL DEFAULT 'suggested',
            source               varchar(20) NOT NULL DEFAULT 'auto',
            reason               text,
            notes                text,
            created_by_admin_id  varchar REFERENCES admin_users(id),
            decided_by_admin_id  varchar REFERENCES admin_users(id),
            movement_id          varchar REFERENCES partner_stock_movements(id),
            created_at           timestamptz NOT NULL DEFAULT now(),
            updated_at           timestamptz NOT NULL DEFAULT now(),
            approved_at          timestamptz,
            dispatched_at        timestamptz,
            received_at          timestamptz,
            CONSTRAINT ck_replen_status CHECK (status IN
                ('suggested','approved','dispatched','received','cancelled')),
            CONSTRAINT ck_replen_source CHECK (source IN ('auto','manual')),
            CONSTRAINT ck_replen_suggested_nonneg CHECK (suggested_qty >= 0),
            CONSTRAINT ck_replen_received_nonneg  CHECK (received_qty  >= 0)
        )
    """)
    # One live (non-terminal) suggestion per (product, warehouse) — prevents dupes.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_replen_live_per_sku
            ON partner_replenishments(partner_product_id, warehouse_id)
            WHERE status IN ('suggested','approved','dispatched')
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_replen_status ON partner_replenishments(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_replen_partner ON partner_replenishments(partner_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS partner_replenishments")
