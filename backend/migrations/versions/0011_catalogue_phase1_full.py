"""catalogue_phase1_full — Master Catalogue completion + Category Request workflow.

Adds every §5 field required by Inventory_Prompt v3:
    manufacturer, short_description, product_type, tags, ean_upc, tax_hsn_code,
    batch_tracking, expiry_tracking, pack_size, net_qty, gross_qty, mrp,
    cost_price, tax_pct, storage_requirement, temperature_class.

Extends partner_inventory with min_stock / max_stock / reorder_level.

Adds mart_category_requests table for the Category Request workflow
(partner submits → SA approves → merges into mart_categories).

Adds `before_qty` to partner_stock_movements per §16.

Revision: 0011_catalogue_phase1_full
Down-revision: 0010_store_transfers
"""
from alembic import op


revision      = "0011_catalogue_phase1_full"
down_revision = "0010_store_transfers"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1) mart_products — commercial + identity + packaging + storage
    # ------------------------------------------------------------------
    stmts = [
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS manufacturer varchar(200)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS short_description varchar(280)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS product_type varchar(60)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS ean_upc varchar(40)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS tax_hsn_code varchar(40)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS batch_tracking boolean NOT NULL DEFAULT false",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS expiry_tracking boolean NOT NULL DEFAULT false",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS pack_size varchar(80)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS net_qty numeric(12,3)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS gross_qty numeric(12,3)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS mrp numeric(12,2)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS tax_pct numeric(5,2)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS storage_requirement varchar(120)",
        "ALTER TABLE mart_products ADD COLUMN IF NOT EXISTS temperature_class varchar(20)",
        # Sanity CHECKs
    ]
    for s in stmts:
        op.execute(s)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_mart_products_temperature_class') THEN
                ALTER TABLE mart_products ADD CONSTRAINT ck_mart_products_temperature_class
                  CHECK (temperature_class IS NULL OR temperature_class IN ('ambient','chilled','frozen','hot'));
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_mart_products_prices_nonneg') THEN
                ALTER TABLE mart_products ADD CONSTRAINT ck_mart_products_prices_nonneg
                  CHECK ((mrp IS NULL OR mrp >= 0) AND (cost_price IS NULL OR cost_price >= 0)
                     AND (tax_pct IS NULL OR (tax_pct >= 0 AND tax_pct <= 100)));
            END IF;
        END $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mart_products_ean ON mart_products(ean_upc) WHERE ean_upc IS NOT NULL")

    # ------------------------------------------------------------------
    # 2) partner_inventory — reorder / min / max
    # ------------------------------------------------------------------
    for s in [
        "ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS reorder_level integer NOT NULL DEFAULT 0",
        "ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS min_stock integer NOT NULL DEFAULT 0",
        "ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS max_stock integer",
    ]:
        op.execute(s)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_partner_inv_stock_thresholds') THEN
                ALTER TABLE partner_inventory ADD CONSTRAINT ck_partner_inv_stock_thresholds
                  CHECK (reorder_level >= 0 AND min_stock >= 0
                     AND (max_stock IS NULL OR max_stock >= min_stock));
            END IF;
        END $$;
    """)

    # ------------------------------------------------------------------
    # 3) mart_category_requests — partner asks / SA reviews
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS mart_category_requests (
            id                  varchar PRIMARY KEY,
            partner_id          varchar NOT NULL REFERENCES partners(id),
            country             varchar(2) NOT NULL REFERENCES countries(code),
            name                varchar(200) NOT NULL,
            slug_hint           varchar(120),
            parent_category_id  varchar REFERENCES mart_categories(id),
            reason              text,
            status              varchar(20) NOT NULL DEFAULT 'pending',
            reviewer_admin_id   varchar REFERENCES admin_users(id),
            review_notes        text,
            approved_category_id varchar REFERENCES mart_categories(id),
            created_at          timestamptz NOT NULL DEFAULT now(),
            reviewed_at         timestamptz,
            CONSTRAINT ck_cat_req_status CHECK (status IN ('pending','approved','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_cat_req_status ON mart_category_requests(status, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cat_req_partner ON mart_category_requests(partner_id)")

    # ------------------------------------------------------------------
    # 4) partner_stock_movements — before_qty column (§16)
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE partner_stock_movements ADD COLUMN IF NOT EXISTS before_qty integer")
    # Extend movement kinds with `loss`
    op.execute("ALTER TABLE partner_stock_movements DROP CONSTRAINT IF EXISTS ck_stock_mv_kind")
    op.execute("""
        ALTER TABLE partner_stock_movements ADD CONSTRAINT ck_stock_mv_kind
        CHECK (kind IN (
            'receive','adjustment_add','adjustment_remove',
            'reserve','release','consume','sale',
            'damage','expire','transfer_in','transfer_out',
            'return_in','opening_stock',
            'put_away','stock_count','correction','pick','pack','dispatch',
            'loss'
        ))
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mart_category_requests")
    for stmt in [
        "ALTER TABLE partner_inventory DROP COLUMN IF EXISTS reorder_level",
        "ALTER TABLE partner_inventory DROP COLUMN IF EXISTS min_stock",
        "ALTER TABLE partner_inventory DROP COLUMN IF EXISTS max_stock",
        "ALTER TABLE partner_stock_movements DROP COLUMN IF EXISTS before_qty",
    ]:
        op.execute(stmt)
    for col in ("manufacturer","short_description","product_type","tags","ean_upc","tax_hsn_code",
                "batch_tracking","expiry_tracking","pack_size","net_qty","gross_qty","mrp",
                "cost_price","tax_pct","storage_requirement","temperature_class"):
        op.execute(f"ALTER TABLE mart_products DROP COLUMN IF EXISTS {col}")
