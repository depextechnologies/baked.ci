"""supplier_catalogue — Phase 2B Supplier Portal & Catalogue.

Adds:
  * supplier_products         — one row per (supplier, master_product) at network cost.
  * supplier_product_requests — supplier proposes an SKU not yet in master catalogue.
  * supplier_documents.is_deleted / storage_path — soft-delete + object-storage tracking.

Revision: 0013_supplier_catalogue
Down-revision: 0012_supplier_onboarding
"""
from alembic import op


revision      = "0013_supplier_catalogue"
down_revision = "0012_supplier_onboarding"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # supplier_products — the master ↔ supplier catalogue link
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_products (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            master_product_id  varchar NOT NULL REFERENCES mart_products(id) ON DELETE CASCADE,
            supplier_sku       varchar(120),
            cost_price         numeric(14,4) NOT NULL,
            currency           varchar(8)   NOT NULL DEFAULT 'XOF',
            moq                integer      NOT NULL DEFAULT 1,
            lead_time_days     integer      NOT NULL DEFAULT 0,
            is_active          boolean      NOT NULL DEFAULT true,
            notes              text,
            created_at         timestamptz  NOT NULL DEFAULT now(),
            updated_at         timestamptz  NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_products_cost      CHECK (cost_price >= 0),
            CONSTRAINT ck_supplier_products_moq       CHECK (moq >= 1),
            CONSTRAINT ck_supplier_products_lead_time CHECK (lead_time_days >= 0)
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_products_pair "
               "ON supplier_products(supplier_id, master_product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_products_master ON supplier_products(master_product_id, is_active)")

    # ------------------------------------------------------------------
    # supplier_product_requests — proposals for master products
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_product_requests (
            id                        varchar PRIMARY KEY,
            supplier_id               varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            proposed_name             varchar(400) NOT NULL,
            proposed_category_id      varchar REFERENCES mart_categories(id),
            proposed_ean_upc          varchar(60),
            proposed_manufacturer     varchar(200),
            proposed_pack_size        varchar(80),
            proposed_net_qty          varchar(80),
            proposed_short_description text,
            proposed_cost_price       numeric(14,4),
            proposed_currency         varchar(8) DEFAULT 'XOF',
            proposed_moq              integer,
            proposed_lead_time_days   integer,
            image_url                 varchar(600),
            notes                     text,
            status                    varchar(20) NOT NULL DEFAULT 'pending',
            review_notes              text,
            reviewed_at               timestamptz,
            reviewer_admin_id         varchar REFERENCES admin_users(id),
            created_master_product_id varchar REFERENCES mart_products(id),
            created_at                timestamptz NOT NULL DEFAULT now(),
            updated_at                timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_prod_req_status CHECK (status IN ('pending','approved','rejected','withdrawn'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_prod_req_status ON supplier_product_requests(status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_prod_req_supplier ON supplier_product_requests(supplier_id)")

    # ------------------------------------------------------------------
    # supplier_documents — soft-delete + storage_path columns
    # ------------------------------------------------------------------
    op.execute("ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS storage_path varchar(600)")
    op.execute("ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS original_filename varchar(300)")
    op.execute("ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS size_bytes bigint")
    op.execute("ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS content_type varchar(120)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_docs_active ON supplier_documents(supplier_id, is_deleted)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS supplier_product_requests")
    op.execute("DROP TABLE IF EXISTS supplier_products")
    for col in ("is_deleted", "storage_path", "original_filename", "size_bytes", "content_type"):
        op.execute(f"ALTER TABLE supplier_documents DROP COLUMN IF EXISTS {col}")
