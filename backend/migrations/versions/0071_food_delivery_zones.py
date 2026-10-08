"""FOODbakēd delivery zones + Top Brands CMS section (P0 Discovery).

Adds the location-eligibility layer the customer discovery system expects:

  * ``food_restaurants.delivery_enabled``   — bool, default TRUE
  * ``food_restaurants.delivery_radius_km`` — numeric, default 5 (confirmed
                                              with product)
  * ``food_restaurants.pickup_enabled``     — bool, default FALSE
  * ``food_restaurants.polygon_zone``       — jsonb, optional {type, coordinates}
                                              — reserved for Phase 2 polygon zones
  * Seeds a new ``food_top_brands`` CMS section row for CI + IN so the
    Super Admin can turn the new "Top Brands for You" carousel on/off.

The radius default is 5 km, chosen with the user; a nullable radius means
"no coverage set yet" and the discovery layer surfaces a warning badge.
The actual eligibility SQL uses haversine on (lat, lng), falling back to
country-level matching when the customer has no coordinates.

Revision:      0071_food_delivery_zones
Down-revision: 0070_vendor_payout_cron
"""
from alembic import op


revision      = "0071_food_delivery_zones"
down_revision = "0070_vendor_payout_cron"
branch_labels = None
depends_on    = None


_CI_ID = "hps_food_ci_025_food_top_brands"
_IN_ID = "hps_food_in_025_food_top_brands"


def upgrade() -> None:
    op.execute("""
        ALTER TABLE food_restaurants
            ADD COLUMN IF NOT EXISTS delivery_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(6,2) NULL,
            ADD COLUMN IF NOT EXISTS pickup_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS polygon_zone       JSONB NULL
    """)
    # bbox helper index for haversine pre-filter
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_food_restaurants_coords
          ON food_restaurants (latitude, longitude)
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)

    # Seed Top Brands section — just after food_categories (display_order 25).
    # Use jsonb_build_object() so our literal JSON doesn't collide with
    # SQLAlchemy's bind-parameter parser on the ":10" number pattern.
    op.execute(f"""
        INSERT INTO homepage_sections
          (id, country, module, section_type, title, subtitle, config, display_order, is_enabled)
        VALUES
          ('{_CI_ID}', 'CI', 'food', 'food_top_brands',
           'Les meilleures enseignes près de chez vous',
           'Vos marques préférées à portée de clic',
           jsonb_build_object(
             'title_fr',    'Les meilleures enseignes près de chez vous',
             'title_en',    'Top brands for you',
             'subtitle_fr', 'Vos marques préférées à portée de clic',
             'subtitle_en', 'Your favourite brands, delivered',
             'limit',       10,
             'selection',   'auto'
           ),
           25, TRUE)
        ON CONFLICT (id) DO NOTHING
    """)
    op.execute(f"""
        INSERT INTO homepage_sections
          (id, country, module, section_type, title, subtitle, config, display_order, is_enabled)
        VALUES
          ('{_IN_ID}', 'IN', 'food', 'food_top_brands',
           'Top brands for you',
           'Your favourite brands, delivered',
           jsonb_build_object(
             'title_fr',    'Les meilleures enseignes près de chez vous',
             'title_en',    'Top brands for you',
             'subtitle_fr', 'Vos marques préférées à portée de clic',
             'subtitle_en', 'Your favourite brands, delivered',
             'limit',       10,
             'selection',   'auto'
           ),
           25, TRUE)
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DELETE FROM homepage_sections WHERE id IN ('{_CI_ID}', '{_IN_ID}')")
    op.execute("DROP INDEX IF EXISTS ix_food_restaurants_coords")
    op.execute("""
        ALTER TABLE food_restaurants
            DROP COLUMN IF EXISTS delivery_enabled,
            DROP COLUMN IF EXISTS delivery_radius_km,
            DROP COLUMN IF EXISTS pickup_enabled,
            DROP COLUMN IF EXISTS polygon_zone
    """)
