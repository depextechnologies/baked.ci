"""Phase 4 — FOODbakēd delivery/pickup pause mode.

Adds two nullable TIMESTAMPTZ columns on `food_restaurants`:
  • `delivery_paused_until` — ISO timestamp; delivery orders rejected while
    now() < value. NULL = delivery accepting.
  • `pickup_paused_until`   — ditto for pickup.

Mirrors the existing `reservations_paused_until` convention so one
restaurant-wide pause story applies to every service.

Revision:      0065_food_service_pause
Down-revision: 0064_search_pg_extensions
"""
from alembic import op


revision      = "0065_food_service_pause"
down_revision = "0064_search_pg_extensions"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute("ALTER TABLE food_restaurants ADD COLUMN IF NOT EXISTS delivery_paused_until TIMESTAMPTZ")
    op.execute("ALTER TABLE food_restaurants ADD COLUMN IF NOT EXISTS pickup_paused_until   TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE food_restaurants DROP COLUMN IF EXISTS delivery_paused_until")
    op.execute("ALTER TABLE food_restaurants DROP COLUMN IF EXISTS pickup_paused_until")
