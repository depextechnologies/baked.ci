"""Adds `password_hash` and `google_sub` to `drivers` so the SENDbakēd
Driver login screen can offer email/password and Google sign-in in
addition to the existing phone-OTP flow.

Both columns are nullable — existing OTP-only drivers keep working.
"""
from alembic import op
import sqlalchemy as sa

revision      = "0030_driver_email_google"
down_revision = "0029_homepage_sections"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column("drivers", sa.Column("google_sub",    sa.String(length=64), nullable=True))
    # Email- and Google-signup paths won't have a phone until KYC. Relax the
    # NOT NULL + drop the strict unique constraint, then replace it with a
    # partial unique index that only enforces uniqueness when a phone is set.
    op.alter_column("drivers", "phone_e164", existing_type=sa.String(length=24), nullable=True)
    op.drop_constraint("drivers_phone_e164_key", "drivers", type_="unique")
    op.create_index("ix_drivers_phone_e164_unique",
                    "drivers", ["phone_e164"], unique=True,
                    postgresql_where=sa.text("phone_e164 IS NOT NULL"))
    op.create_index("ix_drivers_email_lower",
                    "drivers", [sa.text("lower(email)")], unique=True,
                    postgresql_where=sa.text("email IS NOT NULL"))
    op.create_index("ix_drivers_google_sub",
                    "drivers", ["google_sub"], unique=True,
                    postgresql_where=sa.text("google_sub IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_drivers_google_sub", table_name="drivers")
    op.drop_index("ix_drivers_email_lower", table_name="drivers")
    op.drop_index("ix_drivers_phone_e164_unique", table_name="drivers")
    op.create_unique_constraint("drivers_phone_e164_key", "drivers", ["phone_e164"])
    op.alter_column("drivers", "phone_e164", existing_type=sa.String(length=24), nullable=False)
    op.drop_column("drivers", "google_sub")
    op.drop_column("drivers", "password_hash")
