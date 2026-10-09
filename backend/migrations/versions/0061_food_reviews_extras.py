"""FOODbakēd — Reviews extras: verified-visit link + moderation columns.

Adds a `reservation_id` FK so a review can prove "Verified Visit" via a
completed table booking. Adds a `flagged_reason` string + `moderation_notes`
text so automated moderation can hold suspect reviews without deleting them,
and super-admins can note why they moderated. Also adds a partial UNIQUE
index so a customer can leave at most one review per reservation.

Revision:      0061_food_reviews_extras
Down-revision: 0060_food_res_public_tables
"""
from alembic import op


revision      = "0061_food_reviews_extras"
down_revision = "0060_food_res_public_tables"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE food_reviews "
        "ADD COLUMN IF NOT EXISTS reservation_id VARCHAR(64) "
        "REFERENCES food_reservations(id) ON DELETE SET NULL"
    )
    op.execute(
        "ALTER TABLE food_reviews "
        "ADD COLUMN IF NOT EXISTS flagged_reason VARCHAR(64)"
    )
    op.execute(
        "ALTER TABLE food_reviews "
        "ADD COLUMN IF NOT EXISTS moderation_notes TEXT"
    )
    # One review per reservation per customer (partial to allow the same
    # customer to keep reviewing across multiple bookings).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_review_per_reservation "
        "ON food_reviews (reservation_id, customer_id) "
        "WHERE reservation_id IS NOT NULL AND customer_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_review_per_reservation")
    op.execute("ALTER TABLE food_reviews DROP COLUMN IF EXISTS moderation_notes")
    op.execute("ALTER TABLE food_reviews DROP COLUMN IF EXISTS flagged_reason")
    op.execute("ALTER TABLE food_reviews DROP COLUMN IF EXISTS reservation_id")
