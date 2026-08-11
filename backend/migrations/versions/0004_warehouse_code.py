"""warehouse_code — human-readable per-store identifier

Adds a `code` column to `warehouses` (e.g. MRT-ABJ-001, MRT-DAK-002) so
staff can enter their store as context at login, and every operational
screen can display "MRT-ABJ-001 · Cocody Dark Store" in the header.

The code is generated from the country + city + a per-country sequence.
Existing rows are back-filled deterministically inside this migration.

Revision: 0004_warehouse_code
Down-revision: 0003_partner_staff
"""
from alembic import op


revision      = "0004_warehouse_code"
down_revision = "0003_partner_staff"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS code varchar(32)")
    # Back-fill deterministically. Cities collapse to their first 3 uppercase
    # letters. Sequence is numbered per (module, country) starting at 001.
    op.execute("""
        WITH ranked AS (
            SELECT w.id,
                   UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE(w.city, 'XXX'), '[^A-Za-z]', '', 'g')
                                   FROM 1 FOR 3)) AS city3,
                   ROW_NUMBER() OVER (
                     PARTITION BY p.module, p.country
                     ORDER BY w.created_at, w.id
                   ) AS seq,
                   p.module AS module
              FROM warehouses w
              JOIN partners p ON p.id = w.partner_id
             WHERE w.code IS NULL
        )
        UPDATE warehouses w
           SET code = UPPER(ranked.module) || '-' || ranked.city3 || '-'
                     || LPAD(ranked.seq::text, 3, '0')
          FROM ranked
         WHERE ranked.id = w.id
    """)
    op.execute("ALTER TABLE warehouses ALTER COLUMN code SET NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_code ON warehouses(code)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_warehouses_code")
    op.execute("ALTER TABLE warehouses DROP COLUMN IF EXISTS code")
