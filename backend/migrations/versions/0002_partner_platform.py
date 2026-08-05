"""partner_platform_and_consolidation

Adds every table + column that `SQLAlchemy.create_all()` had been silently
materialising at startup instead of a real migration, plus the specific
`orders.consolidation_status` column requested by the fixing prompt.

Every statement is written with IF NOT EXISTS / DO NOTHING guards so this
migration is safe to run against databases that already have the ad-hoc
schema (which is the case for every environment that was previously booted
by the `create_all()` code path).

NOTE on statement style: asyncpg (our async driver) cannot prepare multiple
SQL statements in one `execute()`. Alembic delegates to the SQLA connection,
which in turn hits asyncpg. Every `op.execute(...)` below is therefore a
SINGLE statement — we loop when we need to emit many.

Revision: 0002_partner_platform
Down-revision: 3200d0b5b23c (initial_schema)
"""
from alembic import op


revision      = "0002_partner_platform"
down_revision = "3200d0b5b23c"
branch_labels = None
depends_on    = None


def _exec_many(stmts: list[str]) -> None:
    for s in stmts:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade() -> None:
    _exec_many([
        # ----------------------------------------------------------
        # Partner platform — applications
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS partner_applications (
            id                        varchar        PRIMARY KEY,
            reference                 varchar(32),
            module                    varchar(16)    NOT NULL DEFAULT 'mart',
            status                    varchar(32)    NOT NULL DEFAULT 'draft',
            country                   varchar(2)     NOT NULL REFERENCES countries(code),
            primary_contact_name      varchar(200)   NOT NULL,
            primary_contact_email     varchar(200)   NOT NULL,
            primary_contact_phone     varchar(40)    NOT NULL,
            owner_name                varchar(200)   NOT NULL,
            owner_id_type             varchar(40),
            owner_id_number           varchar(80),
            business_name             varchar(200)   NOT NULL,
            legal_name                varchar(200),
            business_type             varchar(40)    NOT NULL,
            registration_number       varchar(80),
            tax_id                    varchar(80),
            years_in_business         integer,
            warehouse_address_line    varchar(400)   NOT NULL,
            warehouse_city            varchar(120)   NOT NULL,
            warehouse_latitude        numeric(9,6),
            warehouse_longitude       numeric(9,6),
            property_type             varchar(40),
            property_size_sqm         numeric(10,2),
            service_area_km           numeric(6,2),
            bank_name                 varchar(200),
            bank_account_holder       varchar(200),
            bank_account_number       varchar(80),
            bank_swift_or_code        varchar(80),
            mobile_money_provider     varchar(80),
            mobile_money_number       varchar(40),
            kyc_documents             jsonb          NOT NULL DEFAULT '[]'::jsonb,
            extra                     jsonb          NOT NULL DEFAULT '{}'::jsonb,
            submitted_at              timestamptz,
            reviewed_at               timestamptz,
            reviewed_by_admin_id      varchar        REFERENCES admin_users(id),
            review_notes              text,
            additional_info_message   text,
            rejection_reason          text,
            partner_id                varchar,
            created_at                timestamptz    NOT NULL DEFAULT now(),
            updated_at                timestamptz    NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_applications_reference UNIQUE (reference),
            CONSTRAINT ck_partner_applications_status CHECK (
                status IN ('draft','submitted','under_review',
                           'additional_info_required','approved','rejected')
            ),
            CONSTRAINT ck_partner_applications_business_type CHECK (
                business_type IN ('dark_store','supermarket','convenience_store',
                                  'grocery','pharmacy','specialty','warehouse',
                                  'fulfillment_center')
            ),
            CONSTRAINT ck_partner_applications_module CHECK (
                module IN ('mart','food','shop','express','auto','immo')
            )
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_applications_status ON partner_applications (status)",
        "CREATE INDEX IF NOT EXISTS ix_partner_applications_email ON partner_applications (primary_contact_email)",
        "CREATE INDEX IF NOT EXISTS ix_partner_applications_country_module ON partner_applications (country, module)",
        "CREATE INDEX IF NOT EXISTS ix_partner_applications_partner_id ON partner_applications (partner_id)",

        # ----------------------------------------------------------
        # Partner platform — materialised accounts
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS partners (
            id                       varchar       PRIMARY KEY,
            application_id           varchar       NOT NULL REFERENCES partner_applications(id),
            module                   varchar(16)   NOT NULL,
            country                  varchar(2)    NOT NULL REFERENCES countries(code),
            business_name            varchar(200)  NOT NULL,
            business_type            varchar(40)   NOT NULL,
            owner_name               varchar(200)  NOT NULL,
            owner_email              varchar(200)  NOT NULL,
            owner_phone              varchar(40)   NOT NULL,
            temp_password_hash       varchar,
            must_reset_password      boolean       NOT NULL DEFAULT true,
            is_active                boolean       NOT NULL DEFAULT true,
            approved_at              timestamptz   NOT NULL,
            approved_by_admin_id     varchar       REFERENCES admin_users(id),
            created_at               timestamptz   NOT NULL DEFAULT now(),
            updated_at               timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT ck_partners_module CHECK (
                module IN ('mart','food','shop','express','auto','immo')
            )
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partners_module_country ON partners (module, country)",
        "CREATE INDEX IF NOT EXISTS ix_partners_owner_email ON partners (owner_email)",

        # ----------------------------------------------------------
        # Warehouse hierarchy — 5 levels
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS warehouses (
            id                    varchar       PRIMARY KEY,
            partner_id            varchar       NOT NULL REFERENCES partners(id),
            name                  varchar(200)  NOT NULL,
            address_line          varchar(400)  NOT NULL,
            city                  varchar(120)  NOT NULL,
            country               varchar(2)    NOT NULL REFERENCES countries(code),
            latitude              numeric(9,6),
            longitude             numeric(9,6),
            property_type         varchar(40),
            property_size_sqm     numeric(10,2),
            service_area_km       numeric(6,2),
            is_active             boolean       NOT NULL DEFAULT true,
            created_at            timestamptz   NOT NULL DEFAULT now(),
            updated_at            timestamptz   NOT NULL DEFAULT now()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_warehouses_partner_id ON warehouses (partner_id)",
    ])

    # Zone → Aisle → Rack → Shelf → Bin — same shape, different parents.
    for tbl, parent_tbl, parent_col in [
        ("warehouse_zones",   "warehouses",        "warehouse_id"),
        ("warehouse_aisles",  "warehouse_zones",   "zone_id"),
        ("warehouse_racks",   "warehouse_aisles",  "aisle_id"),
        ("warehouse_shelves", "warehouse_racks",   "rack_id"),
        ("warehouse_bins",    "warehouse_shelves", "shelf_id"),
    ]:
        op.execute(f"""
            CREATE TABLE IF NOT EXISTS {tbl} (
                id            varchar       PRIMARY KEY,
                {parent_col}  varchar       NOT NULL REFERENCES {parent_tbl}(id),
                code          varchar(40)   NOT NULL,
                name          varchar(200)  NOT NULL,
                sort_order    integer       NOT NULL DEFAULT 0,
                is_active     boolean       NOT NULL DEFAULT true,
                created_at    timestamptz   NOT NULL DEFAULT now(),
                updated_at    timestamptz   NOT NULL DEFAULT now(),
                CONSTRAINT uq_{tbl}_code UNIQUE ({parent_col}, code)
            )
        """)
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{tbl}_{parent_col} ON {tbl} ({parent_col})")

    _exec_many([
        # ----------------------------------------------------------
        # Partner commerce — products
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS partner_products (
            id                   varchar       PRIMARY KEY,
            partner_id           varchar       NOT NULL REFERENCES partners(id),
            source               varchar(16)   NOT NULL,
            master_product_id    varchar       REFERENCES mart_products(id),
            name                 varchar(200),
            brand                varchar(120),
            unit                 varchar(60),
            image                varchar,
            category_slug        varchar(80),
            subcategory_slug     varchar(80),
            description          text,
            sku_code             varchar(80),
            partner_price        numeric(14,2) NOT NULL,
            currency             varchar(3)    NOT NULL DEFAULT 'XOF',
            stock_qty            integer       NOT NULL DEFAULT 0,
            low_stock_threshold  integer       NOT NULL DEFAULT 5,
            is_active            boolean       NOT NULL DEFAULT true,
            created_at           timestamptz   NOT NULL DEFAULT now(),
            updated_at           timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT ck_partner_products_source CHECK (source IN ('master','custom')),
            CONSTRAINT uq_partner_products_master UNIQUE (partner_id, master_product_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_products_partner_active ON partner_products (partner_id, is_active)",

        # ----------------------------------------------------------
        # Partner commerce — orders overlay (1..N per customer order)
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS partner_orders (
            id                     varchar       PRIMARY KEY,
            partner_id             varchar       NOT NULL REFERENCES partners(id),
            order_id               varchar       NOT NULL REFERENCES orders(id),
            status                 varchar(32)   NOT NULL DEFAULT 'new',
            subtotal               numeric(14,2) NOT NULL DEFAULT 0,
            item_count             integer       NOT NULL DEFAULT 0,
            accepted_at            timestamptz,
            ready_at               timestamptz,
            handed_off_at          timestamptz,
            cancelled_at           timestamptz,
            cancellation_reason    text,
            created_at             timestamptz   NOT NULL DEFAULT now(),
            updated_at             timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_orders_order_partner UNIQUE (order_id, partner_id),
            CONSTRAINT ck_partner_orders_status CHECK (
                status IN ('new','accepted','packing','ready','handed_off',
                           'completed','cancelled')
            )
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_orders_partner_status ON partner_orders (partner_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_partner_orders_partner_created ON partner_orders (partner_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_partner_orders_order ON partner_orders (order_id)",

        # ----------------------------------------------------------
        # Partner commerce — wallet
        # ----------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS partner_wallets (
            id          varchar       PRIMARY KEY,
            partner_id  varchar       NOT NULL REFERENCES partners(id),
            balance     numeric(14,2) NOT NULL DEFAULT 0,
            currency    varchar(3)    NOT NULL DEFAULT 'XOF',
            is_active   boolean       NOT NULL DEFAULT true,
            created_at  timestamptz   NOT NULL DEFAULT now(),
            updated_at  timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT uq_partner_wallets_partner UNIQUE (partner_id)
        )
        """,

        """
        CREATE TABLE IF NOT EXISTS partner_wallet_txns (
            id             varchar       PRIMARY KEY,
            wallet_id      varchar       NOT NULL REFERENCES partner_wallets(id),
            kind           varchar(32)   NOT NULL,
            amount         numeric(14,2) NOT NULL,
            currency       varchar(3)    NOT NULL,
            balance_after  numeric(14,2) NOT NULL,
            description    varchar(400)  NOT NULL,
            order_id       varchar       REFERENCES orders(id),
            reference      varchar(120),
            created_at     timestamptz   NOT NULL DEFAULT now(),
            CONSTRAINT ck_partner_wallet_txns_kind CHECK (
                kind IN ('credit_order','debit_commission','debit_payout',
                         'credit_topup','credit_adjustment','debit_adjustment')
            )
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_partner_wallet_txns_wallet_created ON partner_wallet_txns (wallet_id, created_at)",

        # ----------------------------------------------------------
        # Consolidation columns on the customer-facing orders / order_items.
        # `orders.consolidation_status` is the SPECIFIC column called out
        # in the fixing prompt — it defines the state machine that keeps
        # multi-partner orders looking like ONE delivery to the customer.
        # ----------------------------------------------------------
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS consolidation_status varchar(32) NOT NULL DEFAULT 'pending'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS partial_delivery_allowed boolean NOT NULL DEFAULT false",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS partner_id varchar REFERENCES partners(id)",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS partner_order_id varchar REFERENCES partner_orders(id) ON DELETE SET NULL",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS partner_product_id varchar REFERENCES partner_products(id) ON DELETE SET NULL",
    ])


def downgrade() -> None:
    # Reverse in FK order: column drops on the referring side first,
    # then partner_* tables (grandchildren before parents), then remove
    # the consolidation columns on the base `orders` table.
    _exec_many([
        "ALTER TABLE order_items DROP COLUMN IF EXISTS partner_product_id",
        "ALTER TABLE order_items DROP COLUMN IF EXISTS partner_order_id",
        "ALTER TABLE order_items DROP COLUMN IF EXISTS partner_id",
        "DROP TABLE IF EXISTS partner_wallet_txns CASCADE",
        "DROP TABLE IF EXISTS partner_wallets      CASCADE",
        "DROP TABLE IF EXISTS partner_orders       CASCADE",
        "DROP TABLE IF EXISTS partner_products     CASCADE",
        "DROP TABLE IF EXISTS warehouse_bins       CASCADE",
        "DROP TABLE IF EXISTS warehouse_shelves    CASCADE",
        "DROP TABLE IF EXISTS warehouse_racks      CASCADE",
        "DROP TABLE IF EXISTS warehouse_aisles     CASCADE",
        "DROP TABLE IF EXISTS warehouse_zones      CASCADE",
        "DROP TABLE IF EXISTS warehouses           CASCADE",
        "DROP TABLE IF EXISTS partners             CASCADE",
        "DROP TABLE IF EXISTS partner_applications CASCADE",
        "ALTER TABLE orders DROP COLUMN IF EXISTS partial_delivery_allowed",
        "ALTER TABLE orders DROP COLUMN IF EXISTS consolidation_status",
    ])
