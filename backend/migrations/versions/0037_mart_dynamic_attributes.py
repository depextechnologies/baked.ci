"""Mart dynamic attribute engine (Fixing_Prompt v6 — 2026-02-28).

Adds four new tables:
  * mart_attributes            — global attribute definitions
  * mart_attribute_options     — option list for select / multi_select
  * mart_category_attributes   — attribute ↔ (category|subcategory) assignment
  * mart_attribute_audit       — full before/after diff log of admin edits

Existing MartProduct.details JSONB stays unchanged — attribute values are
snapshotted there under the immutable `attribute.key` so historical data
survives any rename / soft-delete of an attribute definition.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0037_mart_dynamic_attributes"
down_revision = "0036_partner_images_review"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.create_table(
        "mart_attributes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("unit", sa.String(24), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("key", name="uq_mart_attributes_key"),
    )
    op.create_index("ix_mart_attributes_active", "mart_attributes", ["is_active"])

    op.create_table(
        "mart_attribute_options",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("attribute_id", sa.String(), sa.ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.String(120), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("attribute_id", "value", name="uq_mart_attribute_option_value"),
    )
    op.create_index("ix_mart_attribute_options_attr", "mart_attribute_options", ["attribute_id"])

    op.create_table(
        "mart_category_attributes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("category_id", sa.String(), sa.ForeignKey("mart_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subcategory_id", sa.String(), sa.ForeignKey("mart_subcategories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("attribute_id", sa.String(), sa.ForeignKey("mart_attributes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("customer_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("supplier_editable", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("category_id", "subcategory_id", "attribute_id",
                            name="uq_mart_cat_attr_scope"),
    )
    op.create_index("ix_mart_cat_attr_cat", "mart_category_attributes", ["category_id"])
    op.create_index("ix_mart_cat_attr_sub", "mart_category_attributes", ["subcategory_id"])

    op.create_table(
        "mart_attribute_audit",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("actor_admin_id", sa.String(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("actor_email", sa.String(200), nullable=True),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("entity_kind", sa.String(32), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("diff", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_mart_attribute_audit_created", "mart_attribute_audit", ["created_at"])
    op.create_index("ix_mart_attribute_audit_entity", "mart_attribute_audit", ["entity_kind", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_mart_attribute_audit_entity", table_name="mart_attribute_audit")
    op.drop_index("ix_mart_attribute_audit_created", table_name="mart_attribute_audit")
    op.drop_table("mart_attribute_audit")

    op.drop_index("ix_mart_cat_attr_sub", table_name="mart_category_attributes")
    op.drop_index("ix_mart_cat_attr_cat", table_name="mart_category_attributes")
    op.drop_table("mart_category_attributes")

    op.drop_index("ix_mart_attribute_options_attr", table_name="mart_attribute_options")
    op.drop_table("mart_attribute_options")

    op.drop_index("ix_mart_attributes_active", table_name="mart_attributes")
    op.drop_table("mart_attributes")
