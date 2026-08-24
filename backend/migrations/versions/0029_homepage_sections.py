"""Social.docx §Homepage — Admin-editable homepage sections.

Adds `homepage_sections` — one row per section per country. Config lives in
a JSON blob so future section types don't require schema migrations.

Revision: 0029_homepage_sections
Down-revision: 0028_supplier_audit_actions
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision      = "0029_homepage_sections"
down_revision = "0028_supplier_audit_actions"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "homepage_sections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("section_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("subtitle", sa.String(length=400), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_hps_country_order", "homepage_sections", ["country", "display_order"])


def downgrade() -> None:
    op.drop_index("ix_hps_country_order", table_name="homepage_sections")
    op.drop_table("homepage_sections")
