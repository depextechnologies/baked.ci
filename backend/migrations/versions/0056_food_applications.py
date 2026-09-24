"""FOODbakēd — Restaurant Partner Application (onboarding wizard + admin review).

Adds tables:
  * `food_partner_applications`    — one draft per applicant, JSONB blobs per step.
  * `food_application_documents`   — uploaded documents with per-doc review status.
  * `food_application_bank`        — country-scoped payout details.
  * `food_doc_requirements`        — configurable required/optional docs per country.
  * `food_partner_otps`            — email + phone OTP challenges (signup + login).
  * `food_activation_tokens`       — one-time set-password links after approval.

Also extends `food_restaurant_partners` with `application_id`, and seeds the
default document requirements (biz reg / owner ID / proof-of-address required,
food-safety / tax-id optional) for CI + IN.

Revision:      0056_food_applications
Down-revision: 0055_food_partners
"""
from alembic import op


revision      = "0056_food_applications"
down_revision = "0055_food_partners"
branch_labels = None
depends_on    = None


APP_STATUSES = ("draft", "submitted", "under_review", "needs_correction", "approved", "rejected")
DOC_STATUSES = ("pending", "verified", "rejected")


def upgrade() -> None:
    # ----- applications -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_partner_applications (
            id                    VARCHAR(64) PRIMARY KEY,
            applicant_name        VARCHAR(128),
            applicant_email       VARCHAR(190) NOT NULL,
            applicant_phone       VARCHAR(24)  NOT NULL,
            email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
            phone_verified        BOOLEAN NOT NULL DEFAULT FALSE,
            country               VARCHAR(4)  NOT NULL,
            status                VARCHAR(24) NOT NULL DEFAULT 'draft',
            current_step          INTEGER NOT NULL DEFAULT 1,
            -- Step blobs stored as JSONB (see /apply/step/{n} routes).
            restaurant_details    JSONB NOT NULL DEFAULT '{}'::jsonb,
            timing                JSONB NOT NULL DEFAULT '{}'::jsonb,
            menu_cuisines         JSONB NOT NULL DEFAULT '{}'::jsonb,
            submitted_at          TIMESTAMPTZ,
            reviewed_by           VARCHAR(64),
            reviewed_at           TIMESTAMPTZ,
            decision_notes        TEXT,
            correction_notes      TEXT,
            -- Approval side-effects
            created_restaurant_id VARCHAR(64) REFERENCES food_restaurants(id) ON DELETE SET NULL,
            created_partner_id    VARCHAR(64) REFERENCES food_restaurant_partners(id) ON DELETE SET NULL,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_food_app_status CHECK (status IN ('draft','submitted','under_review','needs_correction','approved','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_apps_status  ON food_partner_applications (status, created_at DESC)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_food_apps_email ON food_partner_applications ((LOWER(applicant_email)))")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_food_apps_phone ON food_partner_applications (applicant_phone)")

    # ----- documents -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_application_documents (
            id                VARCHAR(64) PRIMARY KEY,
            application_id    VARCHAR(64) NOT NULL REFERENCES food_partner_applications(id) ON DELETE CASCADE,
            doc_type          VARCHAR(48) NOT NULL,
            file_url          TEXT NOT NULL,
            file_name         VARCHAR(190),
            content_type      VARCHAR(64),
            size_bytes        INTEGER,
            status            VARCHAR(16) NOT NULL DEFAULT 'pending',
            rejection_reason  TEXT,
            uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_by       VARCHAR(64),
            reviewed_at       TIMESTAMPTZ,
            sort_order        INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT ck_food_doc_status CHECK (status IN ('pending','verified','rejected'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_docs_app ON food_application_documents (application_id, doc_type)")

    # ----- bank / payout -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_application_bank (
            application_id      VARCHAR(64) PRIMARY KEY REFERENCES food_partner_applications(id) ON DELETE CASCADE,
            country             VARCHAR(4)  NOT NULL,
            method              VARCHAR(32) NOT NULL,           -- bank_account | mobile_money | upi | mixed
            -- Non-sensitive columns kept as their own fields for indexed lookups.
            bank_name           VARCHAR(190),
            account_holder      VARCHAR(190),
            -- Sensitive numbers hidden inside the JSONB blob so we can encrypt
            -- them at rest later without changing the schema.
            details             JSONB NOT NULL DEFAULT '{}'::jsonb,
            verification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # ----- configurable document requirements per country -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_doc_requirements (
            country_code VARCHAR(4)  NOT NULL,
            doc_type     VARCHAR(48) NOT NULL,
            label_en     VARCHAR(190) NOT NULL,
            label_fr     VARCHAR(190) NOT NULL,
            is_required  BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (country_code, doc_type)
        )
    """)

    _DOC_SEED = [
        # (country, doc_type, label_en, label_fr, required, order)
        ("*",  "business_registration", "Business Registration / Restaurant License", "Immatriculation / Licence de restaurant", True,  1),
        ("*",  "owner_id",              "Owner / Authorized Representative ID",       "Pièce d'identité du propriétaire",         True,  2),
        ("*",  "proof_of_address",      "Proof of Address / Utility Bill",            "Justificatif de domicile / Facture",        True,  3),
        ("*",  "food_safety_cert",      "Food Safety / Hygiene Certificate",          "Certificat d'hygiène alimentaire",          False, 4),
        ("*",  "tax_id",                "Tax ID / Tax Registration",                  "Numéro fiscal / Attestation fiscale",       False, 5),
    ]
    for c, dt, en, fr, req, o in _DOC_SEED:
        op.execute(
            f"INSERT INTO food_doc_requirements (country_code, doc_type, label_en, label_fr, is_required, sort_order) "
            f"VALUES ('{c}', '{dt}', $$"+en+"$$, $$"+fr+"$$, "+("TRUE" if req else "FALSE")+", "+str(o)+") "
            f"ON CONFLICT (country_code, doc_type) DO NOTHING"
        )

    # ----- OTP challenges (phone + email) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_partner_otps (
            id           VARCHAR(64) PRIMARY KEY,
            channel      VARCHAR(8)  NOT NULL,       -- 'phone' | 'email'
            target       VARCHAR(190) NOT NULL,       -- normalised e164 or lowercased email
            purpose      VARCHAR(24) NOT NULL,       -- 'signup_email' | 'signup_phone' | 'login_phone'
            code_hash    VARCHAR(190) NOT NULL,
            tries        INTEGER NOT NULL DEFAULT 0,
            expires_at   TIMESTAMPTZ NOT NULL,
            consumed_at  TIMESTAMPTZ,
            application_id VARCHAR(64),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_food_otps_target ON food_partner_otps (channel, target, purpose, expires_at DESC)")

    # ----- Activation tokens (post-approval set-password) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_activation_tokens (
            id           VARCHAR(64) PRIMARY KEY,
            partner_id   VARCHAR(64) NOT NULL REFERENCES food_restaurant_partners(id) ON DELETE CASCADE,
            token_hash   VARCHAR(190) NOT NULL UNIQUE,
            expires_at   TIMESTAMPTZ NOT NULL,
            consumed_at  TIMESTAMPTZ,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Partner already has password_hash NOT NULL. Loosen it so approval can create
    # a shell partner row that waits for activation.
    op.execute("ALTER TABLE food_restaurant_partners ALTER COLUMN password_hash DROP NOT NULL")
    op.execute("ALTER TABLE food_restaurant_partners ADD COLUMN IF NOT EXISTS application_id VARCHAR(64) REFERENCES food_partner_applications(id) ON DELETE SET NULL")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS food_activation_tokens")
    op.execute("DROP TABLE IF EXISTS food_partner_otps")
    op.execute("DROP TABLE IF EXISTS food_doc_requirements")
    op.execute("DROP TABLE IF EXISTS food_application_bank")
    op.execute("DROP TABLE IF EXISTS food_application_documents")
    op.execute("ALTER TABLE food_restaurant_partners DROP COLUMN IF EXISTS application_id")
    op.execute("DROP TABLE IF EXISTS food_partner_applications")
