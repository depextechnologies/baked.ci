"""Phase 5c — seller_slug for URL-safe portal namespaces.

Adds `suppliers.seller_slug` (unique, nullable so drafts don't collide) and
backfills approved suppliers from `trading_name` / `business_name`.

Revision: 0018_seller_slug
Down-revision: 0017_notifications
"""
from alembic import op


revision      = "0018_seller_slug"
down_revision = "0017_notifications"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS seller_slug varchar(80)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_seller_slug ON suppliers (seller_slug)")
    # Backfill approved suppliers with a deterministic slug (first word of
    # trading_name/business_name, ascii-lowercased). Collisions get -2, -3…
    op.execute("""
        DO $$
        DECLARE
          rec RECORD;
          base_slug text;
          candidate text;
          n int;
        BEGIN
          FOR rec IN SELECT id, COALESCE(NULLIF(trading_name,''), business_name) AS name
                     FROM suppliers WHERE status = 'approved' AND seller_slug IS NULL LOOP
            base_slug := regexp_replace(lower(split_part(rec.name, ' ', 1)), '[^a-z0-9]+', '', 'g');
            IF base_slug = '' THEN base_slug := 'seller'; END IF;
            candidate := base_slug; n := 1;
            WHILE EXISTS (SELECT 1 FROM suppliers WHERE seller_slug = candidate) LOOP
              n := n + 1;
              candidate := base_slug || '-' || n;
            END LOOP;
            UPDATE suppliers SET seller_slug = candidate WHERE id = rec.id;
          END LOOP;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_suppliers_seller_slug")
    op.execute("ALTER TABLE suppliers DROP COLUMN IF EXISTS seller_slug")
