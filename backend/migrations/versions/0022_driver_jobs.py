"""SENDbakēd Driver — Slice 2 (Delivery lifecycle) — driver_jobs table.

Status graph enforced by `/api/driver/jobs/...` endpoints:

  offered → accepted → arriving_pickup → picked_up →
                       arriving_dropoff → delivered
             ↘ declined                             ↘ cancelled

Revision: 0022_driver_jobs
Down-revision: 0021_driver_platform
"""
from alembic import op


revision      = "0022_driver_jobs"
down_revision = "0021_driver_platform"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS driver_jobs (
            id                   varchar PRIMARY KEY,
            driver_id            varchar     REFERENCES drivers(id) ON DELETE CASCADE,
            country              varchar(2)  NOT NULL,
            status               varchar(24) NOT NULL DEFAULT 'offered',
            job_type             varchar(24) NOT NULL DEFAULT 'parcel',
            customer_name        varchar(120) NOT NULL,
            customer_phone       varchar(24)  NOT NULL,
            pickup_label         varchar(200) NOT NULL,
            pickup_lat           double precision NOT NULL,
            pickup_lng           double precision NOT NULL,
            dropoff_label        varchar(200) NOT NULL,
            dropoff_lat          double precision NOT NULL,
            dropoff_lng          double precision NOT NULL,
            distance_km          double precision NOT NULL DEFAULT 0,
            fare_amount          double precision NOT NULL DEFAULT 0,
            fare_currency        varchar(8)  NOT NULL DEFAULT 'XOF',
            pickup_otp           varchar(6)  NOT NULL,
            delivery_otp         varchar(6)  NOT NULL,
            expires_at           timestamptz,
            offered_at           timestamptz,
            accepted_at          timestamptz,
            picked_up_at         timestamptz,
            delivered_at         timestamptz,
            cancelled_at         timestamptz,
            cancellation_reason  text,
            created_at           timestamptz NOT NULL DEFAULT now(),
            updated_at           timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_jobs_driver_status ON driver_jobs (driver_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_driver_jobs_country ON driver_jobs (country, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS driver_jobs")
