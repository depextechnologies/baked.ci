"""SENDbakēd — send_product_types catalogue (2026-02).

Adds a lightweight catalogue table that ops/Super Admin can edit later so
we can extend the Multiple Shipments "product type" dropdown without a
frontend deploy. Seeded with the 8 canonical types from the redesign
prompt; "general_product" is flagged as the default so any leg missing a
product_type falls back to it.

Optional per-leg metadata is stored inside the existing `express_bookings.stops`
JSONB — no new columns on the bookings table.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0051_send_product_types"
down_revision = "0050_send_multi_stop"
branch_labels = None
depends_on    = None


PRODUCT_TYPES = [
    # (code,           name_fr,               name_en,           default, sort)
    ("general_product", "Produit général",     "General Product", True,   10),
    ("documents",       "Documents",           "Documents",       False,  20),
    ("food",            "Aliments",            "Food",            False,  30),
    ("electronics",     "Électronique",        "Electronics",     False,  40),
    ("clothing",        "Vêtements",           "Clothing",        False,  50),
    ("furniture",       "Meubles",             "Furniture",       False,  60),
    ("fresh_products",  "Produits frais",      "Fresh Products",  False,  70),
    ("other",           "Autre",               "Other",           False,  80),
]


def upgrade() -> None:
    op.create_table(
        "send_product_types",
        sa.Column("id",         sa.String(),                primary_key=True),
        sa.Column("code",       sa.String(64),              nullable=False, unique=True),
        sa.Column("name_fr",    sa.String(128),             nullable=False),
        sa.Column("name_en",    sa.String(128),             nullable=False),
        sa.Column("is_default", sa.Boolean(),               nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(),               nullable=False, server_default="0"),
        sa.Column("active",     sa.Boolean(),               nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_send_product_types_active_sort",
                    "send_product_types", ["active", "sort_order"])
    # Ensure exactly zero-or-one row has is_default=true.
    op.create_index("uq_send_product_types_default",
                    "send_product_types", ["is_default"],
                    unique=True, postgresql_where=sa.text("is_default"))

    # Seed the 8 canonical rows.
    from datetime import datetime
    import secrets
    conn = op.get_bind()
    now = datetime.utcnow()
    for code, fr, en, is_default, sort in PRODUCT_TYPES:
        conn.execute(
            sa.text(
                "INSERT INTO send_product_types "
                "(id, code, name_fr, name_en, is_default, sort_order, active, created_at, updated_at) "
                "VALUES (:id, :code, :fr, :en, :is_default, :sort, TRUE, :now, :now) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {"id": f"spt_{secrets.token_hex(8)}", "code": code, "fr": fr, "en": en,
             "is_default": is_default, "sort": sort, "now": now},
        )


def downgrade() -> None:
    op.drop_index("uq_send_product_types_default", table_name="send_product_types")
    op.drop_index("ix_send_product_types_active_sort", table_name="send_product_types")
    op.drop_table("send_product_types")
