"""inventory_ops_phase3 — Receiving, Put-away, Stock Counts + Ledger extensions.

Batch 2 of the Inventory Control Tower rollout. Adds:

  - partner_receipts / partner_receipt_items
        Full receiving workflow (create → verify → put-away → completed)
  - partner_stock_counts / partner_stock_count_lines
        Cycle / full stock counts with variance capture
  - Extends partner_stock_movements.kind allow-list with:
        put_away, stock_count, correction, pick, pack, dispatch

Revision: 0008_inventory_ops_phase3
Down-revision: 0007_catalog_inventory_phase2
"""
from alembic import op


revision      = "0008_inventory_ops_phase3"
down_revision = "0007_catalog_inventory_phase2"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ================================================================
    # 1) Extend stock-movement kinds
    # ================================================================
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_stock_mv_kind') THEN
                ALTER TABLE partner_stock_movements DROP CONSTRAINT ck_stock_mv_kind;
            END IF;
        END $$;
    """)
    op.execute("""
        ALTER TABLE partner_stock_movements
            ADD CONSTRAINT ck_stock_mv_kind
            CHECK (kind IN (
                'receive','adjustment_add','adjustment_remove',
                'reserve','release','consume',
                'damage','expire','transfer_in','transfer_out',
                'return_in','opening_stock',
                'put_away','stock_count','correction','pick','pack','dispatch'
            ))
    """)

    # ================================================================
    # 2) partner_receipts
    # ================================================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_receipts (
            id               varchar PRIMARY KEY,
            partner_id       varchar NOT NULL REFERENCES partners(id),
            warehouse_id     varchar NOT NULL REFERENCES warehouses(id),
            code             varchar(40) NOT NULL,
            source_type      varchar(30) NOT NULL DEFAULT 'purchase',
            source_ref       varchar(200),
            status           varchar(20) NOT NULL DEFAULT 'draft',
            supplier_name    varchar(200),
            supplier_ref     varchar(200),
            notes            text,
            created_by_id    varchar,
            created_by_role  varchar(40),
            created_at       timestamptz NOT NULL DEFAULT now(),
            verified_at      timestamptz,
            completed_at     timestamptz,
            CONSTRAINT uq_partner_receipts_code UNIQUE (partner_id, code),
            CONSTRAINT ck_partner_receipts_status CHECK (status IN
                ('draft','received','verified','put_away','completed','cancelled')),
            CONSTRAINT ck_partner_receipts_source CHECK (source_type IN
                ('purchase','transfer','return','opening'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_receipts_partner ON partner_receipts(partner_id, status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_receipt_items (
            id                    varchar PRIMARY KEY,
            receipt_id            varchar NOT NULL REFERENCES partner_receipts(id) ON DELETE CASCADE,
            partner_product_id    varchar NOT NULL REFERENCES partner_products(id),
            expected_qty          integer NOT NULL DEFAULT 0,
            received_qty          integer NOT NULL DEFAULT 0,
            put_away_qty          integer NOT NULL DEFAULT 0,
            damaged_qty           integer NOT NULL DEFAULT 0,
            bin_id                varchar REFERENCES warehouse_bins(id),
            notes                 text,
            created_at            timestamptz NOT NULL DEFAULT now(),
            updated_at            timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_receipt_items_expected_nonneg CHECK (expected_qty >= 0),
            CONSTRAINT ck_receipt_items_received_nonneg CHECK (received_qty >= 0),
            CONSTRAINT ck_receipt_items_putaway_nonneg  CHECK (put_away_qty >= 0),
            CONSTRAINT ck_receipt_items_damaged_nonneg  CHECK (damaged_qty  >= 0),
            CONSTRAINT ck_receipt_items_putaway_le_received
                CHECK (put_away_qty <= received_qty)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_receipt_items_receipt ON partner_receipt_items(receipt_id)")

    # ================================================================
    # 3) partner_stock_counts
    # ================================================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_stock_counts (
            id               varchar PRIMARY KEY,
            partner_id       varchar NOT NULL REFERENCES partners(id),
            warehouse_id     varchar NOT NULL REFERENCES warehouses(id),
            code             varchar(40) NOT NULL,
            scope            varchar(20) NOT NULL DEFAULT 'full',
            scope_ref_id     varchar,
            status           varchar(20) NOT NULL DEFAULT 'draft',
            notes            text,
            created_by_id    varchar,
            created_by_role  varchar(40),
            approved_by_id   varchar,
            created_at       timestamptz NOT NULL DEFAULT now(),
            completed_at     timestamptz,
            CONSTRAINT uq_partner_counts_code UNIQUE (partner_id, code),
            CONSTRAINT ck_partner_counts_status CHECK (status IN
                ('draft','counting','reconciling','completed','cancelled')),
            CONSTRAINT ck_partner_counts_scope CHECK (scope IN
                ('full','zone','aisle','rack','shelf','bin','product'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_counts_partner ON partner_stock_counts(partner_id, status)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_stock_count_lines (
            id                    varchar PRIMARY KEY,
            count_id              varchar NOT NULL REFERENCES partner_stock_counts(id) ON DELETE CASCADE,
            partner_product_id    varchar NOT NULL REFERENCES partner_products(id),
            bin_id                varchar REFERENCES warehouse_bins(id),
            expected_qty          integer NOT NULL DEFAULT 0,
            counted_qty           integer NOT NULL DEFAULT 0,
            variance              integer NOT NULL DEFAULT 0,
            adjustment_created    boolean NOT NULL DEFAULT false,
            movement_id           varchar REFERENCES partner_stock_movements(id),
            notes                 text,
            created_at            timestamptz NOT NULL DEFAULT now(),
            updated_at            timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_count_lines_count ON partner_stock_count_lines(count_id)")


def downgrade() -> None:
    for tbl in (
        "partner_stock_count_lines", "partner_stock_counts",
        "partner_receipt_items",     "partner_receipts",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
    # Restore the original narrower kind constraint (safer than dropping it).
    op.execute("ALTER TABLE partner_stock_movements DROP CONSTRAINT IF EXISTS ck_stock_mv_kind")
    op.execute("""
        ALTER TABLE partner_stock_movements
            ADD CONSTRAINT ck_stock_mv_kind
            CHECK (kind IN (
                'receive','adjustment_add','adjustment_remove',
                'reserve','release','consume',
                'damage','expire','transfer_in','transfer_out',
                'return_in','opening_stock'
            ))
    """)
