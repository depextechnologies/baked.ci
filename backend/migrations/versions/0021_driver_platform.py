"""SENDbakēd Driver — Slice 1 (Onboarding + KYC + Dashboard).

* One `Driver` row per phone number. Status flows:
    onboarding → pending_review → approved (or) suspended
* `kyc_step` tracks how far the driver got in the wizard so we can resume.
* `DriverOtp` is a short-lived phone-verification token; SMS is mocked in
  dev (printed to backend logs), same pattern MART uses today.

Revision: 0021_driver_platform
Down-revision: 0020_partner_order_picks
"""
from alembic import op


revision      = "0021_driver_platform"
down_revision = "0020_partner_order_picks"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS drivers (
            id                       varchar PRIMARY KEY,
            phone_e164               varchar(24) NOT NULL UNIQUE,
            country                  varchar(2)  NOT NULL,
            name                     varchar(200),
            email                    varchar(200),
            status                   varchar(24) NOT NULL DEFAULT 'onboarding',
            kyc_step                 varchar(32) NOT NULL DEFAULT 'personal',
            gov_id_type              varchar(32),
            gov_id_number            varchar(80),
            gov_id_front_url         text,
            gov_id_back_url          text,
            licence_number           varchar(80),
            licence_front_url        text,
            licence_expiry           date,
            selfie_url               text,
            vehicle_type             varchar(32),
            vehicle_plate            varchar(32),
            vehicle_reg_url          text,
            bank_account_holder      varchar(200),
            bank_account_number      varchar(80),
            bank_ifsc_or_swift       varchar(40),
            emergency_contact_name   varchar(200),
            emergency_contact_phone  varchar(24),
            is_online                boolean NOT NULL DEFAULT false,
            last_seen_at             timestamptz,
            current_lat              double precision,
            current_lng              double precision,
            current_area             varchar(120),
            submitted_at             timestamptz,
            approved_at              timestamptz,
            reviewer_notes           text,
            created_at               timestamptz NOT NULL DEFAULT now(),
            updated_at               timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_drivers_status ON drivers (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_drivers_country ON drivers (country)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_otps (
            id            varchar PRIMARY KEY,
            phone_e164    varchar(24) NOT NULL,
            code          varchar(8)  NOT NULL,
            expires_at    timestamptz NOT NULL,
            attempts      integer     NOT NULL DEFAULT 0,
            consumed_at   timestamptz,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_otps_phone ON driver_otps (phone_e164, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS driver_otps")
    op.execute("DROP TABLE IF EXISTS drivers")
