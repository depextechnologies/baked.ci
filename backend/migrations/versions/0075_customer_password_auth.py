"""Customer email/password credentials + customer_auth_codes."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0075_customer_password_auth"
down_revision = "0074_brand_refresh_accents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("password_hash", sa.String(), nullable=True))
    op.add_column("customers", sa.Column("email_verified_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.create_table(
        "customer_auth_codes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("target", sa.String(), nullable=False),
        sa.Column("customer_id", sa.String(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("code_hash", sa.String(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_customer_auth_codes_target", "customer_auth_codes", ["purpose", "target"])
    op.execute("create index if not exists ix_customers_email_lower on customers (lower(email))")


def downgrade() -> None:
    op.drop_index("ix_customer_auth_codes_target", table_name="customer_auth_codes")
    op.drop_table("customer_auth_codes")
    op.drop_column("customers", "email_verified_at")
    op.drop_column("customers", "password_hash")
