"""SHOPbakēd — make supplier_category_interests module-aware (2026-03).

Previously `supplier_category_interests.category_id` had a hard FK on
`mart_categories.id`, which prevented SHOP applicants from selecting SHOP
categories during the Step-5 wizard (Fixing_Prompt v13 — Seller Apply #7).

Changes:
  * Drop FK constraint on `category_id` — the column now stores either a
    MART category id (`cat_…`) or a SHOP category id (`shpcat_…`) and is
    resolved at query time using the new `module` discriminator.
  * Add `module` VARCHAR(8) NOT NULL DEFAULT 'mart' so existing rows are
    tagged correctly and future rows must declare their source.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0046_sci_module"
down_revision = "0045_shop_order_delivery_pin"
branch_labels = None
depends_on    = None


FK_CANDIDATES = (
    "supplier_category_interests_category_id_fkey",   # postgres default naming
    "fk_supplier_category_interests_category_id",     # alt Alembic convention
)


def upgrade() -> None:
    # Drop the FK — Postgres names the constraint predictably but we try both
    # conventions defensively so re-runs on non-default environments succeed.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("supplier_category_interests")}
    for name in FK_CANDIDATES:
        if name in existing_fks:
            op.drop_constraint(name, "supplier_category_interests", type_="foreignkey")
            break

    op.add_column("supplier_category_interests",
                  sa.Column("module", sa.String(8), nullable=False, server_default="mart"))
    # Index for efficient module-scoped queries (supplier + module).
    op.create_index("ix_sci_supplier_module",
                    "supplier_category_interests", ["supplier_id", "module"])


def downgrade() -> None:
    op.drop_index("ix_sci_supplier_module", table_name="supplier_category_interests")
    op.drop_column("supplier_category_interests", "module")
    op.create_foreign_key(
        "supplier_category_interests_category_id_fkey",
        "supplier_category_interests", "mart_categories",
        ["category_id"], ["id"],
    )
