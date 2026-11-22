"""Brand refresh — module names bMART/bFOOD/bSHOP/bSEND/bIMMO/bAUTO and new FOOD/SHOP/SEND colours.

Data-only: rewrites stored display text (module configs, CMS sections, search intents,
store names, product descriptions). Asset URLs (e.g. ``…SENDbaked.jpeg``) are left untouched.
"""
from alembic import op

revision = "0073_brand_refresh_b_names"
down_revision = "0072_address_recipient"
branch_labels = None
depends_on = None

# (table, column, is_json)
TARGETS = [
    ("configurations", "name", False),
    ("homepage_sections", "title", False),
    ("homepage_sections", "config", True),
    ("search_intents", "subtitle_en", False),
    ("search_intents", "subtitle_fr", False),
    ("search_intents", "action_label_fr", False),
    ("search_intents", "action_label_en", False),
    ("search_intents", "title_en", False),
    ("search_intents", "title_fr", False),
    ("mart_stores", "name", False),
    ("shop_products", "description", False),
    ("shop_products", "description_fr", False),
]
SUFFIX = r"bak(ē|e)d(?!\.(jpe?g|png|webp|svg))(?![_A-Za-z0-9])"


def _rename(expr: str) -> str:
    step1 = f"regexp_replace({expr}, 'EXPRESS{SUFFIX}', 'bSEND', 'g')"
    return f"regexp_replace({step1}, '(FOOD|MART|SHOP|SEND|IMMO|AUTO){SUFFIX}', 'b\\1', 'g')"


def upgrade() -> None:
    conn = op.get_bind()
    for table, col, is_json in TARGETS:
        typ = conn.exec_driver_sql(
            f"select data_type from information_schema.columns where table_schema='public' and table_name='{table}' and column_name='{col}'"
        ).scalar()
        if not typ:
            continue
        expr = f'"{col}"::text' if is_json else f'"{col}"'
        cast = f"({_rename(expr)})::{typ}"
        op.execute(f'update "{table}" set "{col}" = {cast} where {expr} ~ \'(FOOD|MART|SHOP|SEND|EXPRESS|IMMO|AUTO){SUFFIX}\'')
    op.execute("update configurations set color = '#F26924' where module = 'food'")
    op.execute("update configurations set color = '#1D9BF0' where module = 'shop'")
    op.execute("update configurations set color = '#FCC44C' where module = 'express'")


def downgrade() -> None:
    pass
