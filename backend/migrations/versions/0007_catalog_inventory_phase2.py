"""catalog_inventory_phase2 — MASTER COMPLETION PROGRAM Phase 2

Adds:
  - mart_brands (new table)
  - mart_products: sku_code, barcode, variants (JSONB), status
  - partner_products: approval_status, review_notes, submitted_at, reviewed_at,
    reviewed_by_admin_id
  - partner_inventory (new table)      — per-SKU stock breakdown
  - partner_stock_movements (new table) — immutable ledger
  - partner_product_locations (new)     — SKU ↔ bin many-to-many
  - CHECK: partner_products.stock_qty >= 0 (never negative)
  - CHECK: partner_inventory.* >= 0

Idempotent — guarded by IF NOT EXISTS / DO blocks.

Revision: 0007_catalog_inventory_phase2
Down-revision: 0006_map_geolocation
"""
from alembic import op


revision      = "0007_catalog_inventory_phase2"
down_revision = "0006_map_geolocation"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ================================================================
    # 1) mart_brands
    # ================================================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS mart_brands (
            id           varchar PRIMARY KEY,
            slug         varchar(120) NOT NULL,
            name         varchar(200) NOT NULL,
            country      varchar(2) NOT NULL REFERENCES countries(code),
            logo         varchar(500),
            description  text,
            is_active    boolean NOT NULL DEFAULT true,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_mart_brands_slug_country UNIQUE (slug, country)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mart_brands_country ON mart_brands(country)")

    # ================================================================
    # 2) mart_products extras: sku_code, barcode, variants, status
    # ================================================================
    for stmt in [
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS sku_code varchar(80)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS barcode  varchar(80)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS status   varchar(24) NOT NULL DEFAULT 'active'",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS brand_id varchar REFERENCES mart_brands(id)",
    ]:
        op.execute(stmt)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mart_products_sku_country ON mart_products(sku_code, country) WHERE sku_code IS NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mart_products_barcode_country ON mart_products(barcode, country) WHERE barcode IS NOT NULL")

    # ================================================================
    # 3) partner_products approval workflow
    # ================================================================
    # `approval_status`: draft | pending | approved | rejected | changes_requested
    # Rules:
    #   - source='master' rows auto-set to 'approved' (existing catalog)
    #   - source='custom' rows created by partners default to 'pending'
    for stmt in [
        "ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS approval_status varchar(32) NOT NULL DEFAULT 'approved'",
        "ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS review_notes text",
        "ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS submitted_at timestamptz",
        "ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS reviewed_at timestamptz",
        "ALTER TABLE partner_products ADD COLUMN IF NOT EXISTS reviewed_by_admin_id varchar REFERENCES admin_users(id)",
    ]:
        op.execute(stmt)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_partner_products_approval_status'
            ) THEN
                ALTER TABLE partner_products
                    ADD CONSTRAINT ck_partner_products_approval_status
                    CHECK (approval_status IN ('draft','pending','approved','rejected','changes_requested'));
            END IF;
        END $$;
    """)
    # Never negative
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_partner_products_stock_qty_nonneg'
            ) THEN
                ALTER TABLE partner_products
                    ADD CONSTRAINT ck_partner_products_stock_qty_nonneg
                    CHECK (stock_qty >= 0);
            END IF;
        END $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_products_approval ON partner_products(partner_id, approval_status)")

    # ================================================================
    # 4) partner_inventory — per-SKU stock breakdown
    # ================================================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_inventory (
            id                    varchar PRIMARY KEY,
            partner_id            varchar NOT NULL REFERENCES partners(id),
            partner_product_id    varchar NOT NULL REFERENCES partner_products(id) ON DELETE CASCADE,
            warehouse_id          varchar NOT NULL REFERENCES warehouses(id),
            available_qty         integer NOT NULL DEFAULT 0,
            reserved_qty          integer NOT NULL DEFAULT 0,
            damaged_qty           integer NOT NULL DEFAULT 0,
            expired_qty           integer NOT NULL DEFAULT 0,
            low_stock_threshold   integer NOT NULL DEFAULT 5,
            last_movement_at      timestamptz,
            created_at            timestamptz NOT NULL DEFAULT now(),
            updated_at            timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_inventory_sku_wh UNIQUE (partner_product_id, warehouse_id),
            CONSTRAINT ck_partner_inv_available_nonneg CHECK (available_qty >= 0),
            CONSTRAINT ck_partner_inv_reserved_nonneg  CHECK (reserved_qty  >= 0),
            CONSTRAINT ck_partner_inv_damaged_nonneg   CHECK (damaged_qty   >= 0),
            CONSTRAINT ck_partner_inv_expired_nonneg   CHECK (expired_qty   >= 0)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_inventory_partner ON partner_inventory(partner_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_partner_inventory_wh ON partner_inventory(warehouse_id)")

    # ================================================================
    # 5) partner_stock_movements — ledger (immutable rows)
    # ================================================================
    # kind: receive | adjustment_add | adjustment_remove | reserve | release |
    #       consume | damage | expire | transfer_in | transfer_out
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_stock_movements (
            id                    varchar PRIMARY KEY,
            partner_id            varchar NOT NULL REFERENCES partners(id),
            partner_product_id    varchar NOT NULL REFERENCES partner_products(id) ON DELETE CASCADE,
            warehouse_id          varchar NOT NULL REFERENCES warehouses(id),
            bin_id                varchar REFERENCES warehouse_bins(id),
            kind                  varchar(32) NOT NULL,
            delta_qty             integer NOT NULL,
            balance_after         integer NOT NULL,
            reason                text,
            reference             varchar(200),
            actor_id              varchar,
            actor_role            varchar(40),
            order_id              varchar REFERENCES orders(id),
            created_at            timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_stock_mv_kind CHECK (kind IN (
                'receive','adjustment_add','adjustment_remove',
                'reserve','release','consume',
                'damage','expire','transfer_in','transfer_out',
                'return_in','opening_stock'
            ))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_mv_partner_created ON partner_stock_movements(partner_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_mv_product ON partner_stock_movements(partner_product_id, created_at DESC)")

    # ================================================================
    # 6) partner_product_locations — SKU ↔ Bin
    # ================================================================
    op.execute("""
        CREATE TABLE IF NOT EXISTS partner_product_locations (
            id                    varchar PRIMARY KEY,
            partner_product_id    varchar NOT NULL REFERENCES partner_products(id) ON DELETE CASCADE,
            bin_id                varchar NOT NULL REFERENCES warehouse_bins(id) ON DELETE CASCADE,
            quantity_at_location  integer NOT NULL DEFAULT 0,
            is_primary            boolean NOT NULL DEFAULT false,
            created_at            timestamptz NOT NULL DEFAULT now(),
            updated_at            timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_ppl_sku_bin UNIQUE (partner_product_id, bin_id),
            CONSTRAINT ck_ppl_qty_nonneg CHECK (quantity_at_location >= 0)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_ppl_bin ON partner_product_locations(bin_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_ppl_primary_per_sku ON partner_product_locations(partner_product_id) WHERE is_primary = true")


def downgrade() -> None:
    for tbl in ("partner_product_locations", "partner_stock_movements", "partner_inventory"):
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
    for stmt in [
        "ALTER TABLE partner_products DROP COLUMN IF EXISTS approval_status",
        "ALTER TABLE partner_products DROP COLUMN IF EXISTS review_notes",
        "ALTER TABLE partner_products DROP COLUMN IF EXISTS submitted_at",
        "ALTER TABLE partner_products DROP COLUMN IF EXISTS reviewed_at",
        "ALTER TABLE partner_products DROP COLUMN IF EXISTS reviewed_by_admin_id",
        "ALTER TABLE mart_products DROP COLUMN IF EXISTS sku_code",
        "ALTER TABLE mart_products DROP COLUMN IF EXISTS barcode",
        "ALTER TABLE mart_products DROP COLUMN IF EXISTS variants",
        "ALTER TABLE mart_products DROP COLUMN IF EXISTS status",
        "ALTER TABLE mart_products DROP COLUMN IF EXISTS brand_id",
    ]:
        op.execute(stmt)
    op.execute("DROP TABLE IF EXISTS mart_brands")
