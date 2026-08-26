"""Extends `driver_otps` for the email-based password reset flow.

Adds two nullable columns:
  * `email`   — set when the OTP was requested via /auth/forgot-password
  * `purpose` — 'login' (default, backward compatible) or 'password_reset'

`phone_e164` is relaxed to nullable so an email-only reset OTP can exist
without a fake placeholder phone.
"""
from alembic import op
import sqlalchemy as sa

revision      = "0031_driver_otp_email_purpose"
down_revision = "0030_driver_email_google"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("driver_otps", sa.Column("email",   sa.String(length=200), nullable=True))
    op.add_column("driver_otps", sa.Column("purpose", sa.String(length=32),  nullable=False,
                                           server_default="login"))
    op.alter_column("driver_otps", "phone_e164",
                    existing_type=sa.String(length=24), nullable=True)
    op.create_index("ix_driver_otps_email_lower",
                    "driver_otps", [sa.text("lower(email)"), "created_at"],
                    postgresql_where=sa.text("email IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_driver_otps_email_lower", table_name="driver_otps")
    op.alter_column("driver_otps", "phone_e164",
                    existing_type=sa.String(length=24), nullable=False)
    op.drop_column("driver_otps", "purpose")
    op.drop_column("driver_otps", "email")
