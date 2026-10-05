"""Install PostgreSQL extensions required by Global Search.

The Global Search orchestrator (modules/search/__init__.py) relies on
`unaccent()` to make MART + SHOP queries accent-insensitive and uses
`pg_trgm` similarity for fuzzy / typo-tolerant ranking.

Previously these were assumed to exist. In fresh DBs they didn't — every
MART/SHOP query raised `function unaccent(...) does not exist` inside the
provider, which was caught silently and returned 0 hits. That's why
"Lait Frais", "Signature Car Parts", etc. appeared un-searchable.

This migration is idempotent (`IF NOT EXISTS`) and also adds trigram GIN
indexes on the hot searchable columns so fuzzy ranking stays fast at
catalog scale.

Revision:      0064_search_pg_extensions
Down-revision: 0063_global_search
"""
from alembic import op


revision      = "0064_search_pg_extensions"
down_revision = "0063_global_search"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # Extensions — safe to run on every boot of alembic upgrade head.
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Trigram GIN indexes on the searchable text columns. These power
    # both LIKE '%foo%' and similarity() ranking without a sequential
    # scan at catalog scale.
    #
    # Wrapped in individual DO blocks because some environments can't
    # CREATE INDEX inside a transaction block if a prior statement
    # already touched the same table.
    for stmt in (
        "CREATE INDEX IF NOT EXISTS ix_mart_products_name_trgm ON mart_products USING gin (lower(name) gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS ix_mart_products_brand_trgm ON mart_products USING gin (lower(coalesce(brand,'')) gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS ix_shop_products_title_trgm ON shop_products USING gin (lower(title) gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS ix_shop_products_titlefr_trgm ON shop_products USING gin (lower(coalesce(title_fr,'')) gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS ix_food_restaurants_name_trgm ON food_restaurants USING gin (lower(name) gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS ix_food_menu_items_name_trgm ON food_menu_items USING gin (lower(name) gin_trgm_ops)",
    ):
        op.execute(stmt)


def downgrade() -> None:
    # Keep extensions — other code may depend on them. Only drop indexes.
    for stmt in (
        "DROP INDEX IF EXISTS ix_mart_products_name_trgm",
        "DROP INDEX IF EXISTS ix_mart_products_brand_trgm",
        "DROP INDEX IF EXISTS ix_shop_products_title_trgm",
        "DROP INDEX IF EXISTS ix_shop_products_titlefr_trgm",
        "DROP INDEX IF EXISTS ix_food_restaurants_name_trgm",
        "DROP INDEX IF EXISTS ix_food_menu_items_name_trgm",
    ):
        op.execute(stmt)
