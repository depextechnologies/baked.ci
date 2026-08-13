"""supplier_onboarding — Phase 2A Supplier Onboarding Foundation.

Creates the schema for MARTbakēd Supplier onboarding & governance:
  * suppliers                          — Supplier organisation record.
  * supplier_applications              — Multi-step public application + lifecycle.
  * supplier_contacts                  — Owner / authorised representative info.
  * supplier_documents                 — Business registration, tax, licence, etc.
  * supplier_supply_locations          — Countries / cities / zones the supplier serves.
  * supplier_category_interests        — Categories the supplier deals in (FK to mart_categories).
  * supplier_bank_info                 — Banking / Mobile Money details.
  * supplier_review_audit              — Every SA action (approve/reject/request-info).

Note: `supplier_product_catalogue` (Phase 2B) is NOT created here — Phase 2A
only covers onboarding foundation. Category & product REQUESTS reuse the
existing `mart_category_requests` table (Phase 1) but we add a `supplier_id`
column and drop the NOT-NULL on partner_id — enforcing exactly-one-of.

Revision: 0012_supplier_onboarding
Down-revision: 0011_catalogue_phase1_full
"""
from alembic import op


revision      = "0012_supplier_onboarding"
down_revision = "0011_catalogue_phase1_full"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1) suppliers — the organisation
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id                     varchar PRIMARY KEY,
            code                   varchar(40) UNIQUE,
            business_name          varchar(300) NOT NULL,
            trading_name           varchar(300),
            business_type          varchar(60) NOT NULL,
            business_type_other    varchar(120),
            registration_number    varchar(120),
            tax_id                 varchar(120),
            business_email         varchar(200) NOT NULL,
            business_phone         varchar(40),
            website                varchar(300),
            years_in_operation     integer,
            country                varchar(2) NOT NULL REFERENCES countries.code_field IF FALSE,
            default_currency       varchar(8) NOT NULL DEFAULT 'XOF',
            module                 varchar(20) NOT NULL DEFAULT 'mart',
            status                 varchar(24) NOT NULL DEFAULT 'draft',
            supplier_portal_active boolean NOT NULL DEFAULT false,
            password_hash          varchar(200),
            phone_verified         boolean NOT NULL DEFAULT false,
            email_verified         boolean NOT NULL DEFAULT false,
            approved_at            timestamptz,
            approved_by_admin_id   varchar REFERENCES admin_users(id),
            suspended_at           timestamptz,
            created_at             timestamptz NOT NULL DEFAULT now(),
            updated_at             timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_suppliers_status CHECK (status IN
                ('draft','submitted','under_review','action_required',
                 'approved','rejected','suspended')),
            CONSTRAINT ck_suppliers_business_type CHECK (business_type IN
                ('manufacturer','distributor','wholesaler','supplier','retailer',
                 'brand_owner','producer','importer','other'))
        )
    """.replace("countries.code_field IF FALSE", "countries(code)"))
    op.execute("CREATE INDEX IF NOT EXISTS ix_suppliers_status ON suppliers(status, country)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_suppliers_email ON suppliers(business_email)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_email_country ON suppliers(business_email, country)")

    # ------------------------------------------------------------------
    # 2) supplier_applications — application + lifecycle
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_applications (
            id                     varchar PRIMARY KEY,
            application_code       varchar(40) UNIQUE NOT NULL,
            supplier_id            varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            status                 varchar(24) NOT NULL DEFAULT 'draft',
            current_step           integer NOT NULL DEFAULT 1,
            phone_e164             varchar(24),
            phone_challenge_id     varchar,
            submitted_at           timestamptz,
            reviewed_at            timestamptz,
            reviewer_admin_id      varchar REFERENCES admin_users(id),
            action_required_notes  text,
            rejection_reason       text,
            summary_snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at             timestamptz NOT NULL DEFAULT now(),
            updated_at             timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_app_status CHECK (status IN
                ('draft','submitted','under_review','action_required',
                 'approved','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_app_status ON supplier_applications(status, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_app_supplier ON supplier_applications(supplier_id)")

    # ------------------------------------------------------------------
    # 3) supplier_contacts — owner / authorised rep
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_contacts (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            full_name          varchar(200) NOT NULL,
            position           varchar(120),
            phone              varchar(40),
            email              varchar(200),
            nationality        varchar(2) REFERENCES countries(code),
            id_type            varchar(60),
            id_number          varchar(120),
            id_document_url    varchar(600),
            relationship       varchar(40) NOT NULL DEFAULT 'owner',
            is_primary         boolean NOT NULL DEFAULT true,
            created_at         timestamptz NOT NULL DEFAULT now(),
            updated_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_contact_rel CHECK (relationship IN
                ('owner','director','authorised_representative',
                 'procurement_contact','other'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_contacts_supplier ON supplier_contacts(supplier_id)")

    # ------------------------------------------------------------------
    # 4) supplier_documents
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_documents (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            document_type      varchar(60) NOT NULL,
            title              varchar(200),
            file_url           varchar(600) NOT NULL,
            issued_on          date,
            expires_on         date,
            verification_status varchar(20) NOT NULL DEFAULT 'pending',
            verification_notes text,
            uploaded_at        timestamptz NOT NULL DEFAULT now(),
            reviewed_at        timestamptz,
            reviewer_admin_id  varchar REFERENCES admin_users(id),
            CONSTRAINT ck_supplier_doc_type CHECK (document_type IN
                ('business_registration','tax_certificate','business_licence',
                 'owner_id','product_certification','manufacturer_authorisation',
                 'catalogue','other')),
            CONSTRAINT ck_supplier_doc_verify CHECK (verification_status IN
                ('pending','verified','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_docs_supplier ON supplier_documents(supplier_id)")

    # ------------------------------------------------------------------
    # 5) supplier_supply_locations — where supplier can deliver
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_supply_locations (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            kind               varchar(24) NOT NULL,
            label              varchar(300) NOT NULL,
            city               varchar(120),
            country            varchar(2) REFERENCES countries(code),
            zone               varchar(120),
            warehouse_id       varchar REFERENCES warehouses(id),
            address            varchar(600),
            latitude           numeric(10,6),
            longitude          numeric(10,6),
            postal_code        varchar(20),
            service_radius_km  integer,
            is_business_location boolean NOT NULL DEFAULT false,
            approval_status    varchar(20) NOT NULL DEFAULT 'pending',
            created_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_loc_kind CHECK (kind IN
                ('business_location','supply_country','supply_city','supply_zone','dark_store')),
            CONSTRAINT ck_supplier_loc_approval CHECK (approval_status IN
                ('pending','approved','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_loc_supplier ON supplier_supply_locations(supplier_id)")

    # ------------------------------------------------------------------
    # 6) supplier_category_interests
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_category_interests (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            category_id        varchar REFERENCES mart_categories(id),
            requested_name     varchar(200),
            reason             text,
            status             varchar(20) NOT NULL DEFAULT 'approved',
            created_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_cat_status CHECK (status IN
                ('pending','approved','rejected'))
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_cat_pair "
               "ON supplier_category_interests(supplier_id, category_id) WHERE category_id IS NOT NULL")

    # ------------------------------------------------------------------
    # 7) supplier_bank_info — one row per supplier
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_bank_info (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
            bank_name          varchar(200),
            account_holder     varchar(200),
            account_number     varchar(120),
            iban               varchar(60),
            swift_bic          varchar(40),
            mobile_money_provider varchar(60),
            mobile_money_number   varchar(40),
            preferred_method   varchar(30),
            billing_address    varchar(600),
            billing_city       varchar(120),
            billing_country    varchar(2) REFERENCES countries(code),
            created_at         timestamptz NOT NULL DEFAULT now(),
            updated_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_bank_method CHECK (preferred_method IS NULL OR preferred_method IN
                ('bank_transfer','mobile_money','cheque','cash','other'))
        )
    """)

    # ------------------------------------------------------------------
    # 8) supplier_review_audit — every SA action
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS supplier_review_audit (
            id                 varchar PRIMARY KEY,
            supplier_id        varchar NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
            application_id     varchar REFERENCES supplier_applications(id),
            actor_admin_id     varchar REFERENCES admin_users(id),
            action             varchar(40) NOT NULL,
            from_status        varchar(24),
            to_status          varchar(24),
            notes              text,
            created_at         timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_supplier_audit_action CHECK (action IN
                ('submit','approve','reject','request_information',
                 'suspend','unsuspend','portal_activated'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_supplier_audit_supplier ON supplier_review_audit(supplier_id, created_at DESC)")


def downgrade() -> None:
    for tbl in (
        "supplier_review_audit", "supplier_bank_info", "supplier_category_interests",
        "supplier_supply_locations", "supplier_documents", "supplier_contacts",
        "supplier_applications", "suppliers",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
