"""SHOPbakēd — bilingual product title/description (2026-03).

Adds `title_fr` + `description_fr` columns to `shop_products` so sellers
can maintain both French (primary/customer-default) and English (secondary)
copy per SKU. English lives at the canonical `title`/`description` columns
so the admin/API contract stays backwards compatible; French values are
optional and fall back to English when absent.

Rationale: French is BAKĒD's default customer language. Real sellers must
be able to publish French listings, not just the demo seed.
"""
from alembic import op
import sqlalchemy as sa


revision      = "0047_shop_bilingual_product"
down_revision = "0046_sci_module"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column("shop_products", sa.Column("title_fr",       sa.String(400), nullable=True))
    op.add_column("shop_products", sa.Column("description_fr", sa.Text(),      nullable=True))


def downgrade() -> None:
    op.drop_column("shop_products", "description_fr")
    op.drop_column("shop_products", "title_fr")
