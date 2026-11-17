"""Unique customer email (case-insensitive, active rows only)."""
from alembic import op

revision = "0076_customer_email_unique"
down_revision = "0075_customer_password_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dup = conn.exec_driver_sql(
        "select 1 from customers where email is not null and deleted_at is null group by lower(email) having count(*) > 1 limit 1"
    ).first()
    if dup:  # never fail a deploy on legacy duplicates; the app-level check still applies
        return
    op.execute("create unique index if not exists uq_customers_email_lower_active on customers (lower(email)) where email is not null and deleted_at is null")


def downgrade() -> None:
    op.execute("drop index if exists uq_customers_email_lower_active")
