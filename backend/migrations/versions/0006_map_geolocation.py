"""map_geolocation — richer location capture for partner applications & stores.

Adds:
  - partner_applications: warehouse_country_code, warehouse_region,
    warehouse_postal_code, warehouse_place_id, warehouse_formatted_address,
    warehouse_location_accuracy
  - warehouses: formatted_address, place_id, postal_code, location_accuracy,
    country_code (mirrors `country` on the row to keep semantics explicit)

Idempotent: guarded by IF NOT EXISTS.

Revision: 0006_map_geolocation
Down-revision: 0005_multi_store_foundation
"""
from alembic import op


revision      = "0006_map_geolocation"
down_revision = "0005_multi_store_foundation"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    # ---- partner_applications ----
    for stmt in [
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_country_code varchar(2)",
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_region varchar(120)",
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_postal_code varchar(40)",
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_place_id varchar(255)",
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_formatted_address varchar(500)",
        "ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS warehouse_location_accuracy varchar(40)",
    ]:
        op.execute(stmt)

    # ---- warehouses ----
    for stmt in [
        "ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS formatted_address varchar(500)",
        "ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS place_id varchar(255)",
        "ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS postal_code varchar(40)",
        "ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS location_accuracy varchar(40)",
    ]:
        op.execute(stmt)

    # Index for future "stores in bounding box" queries.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_warehouses_lat_lng
                              ON warehouses(latitude, longitude)
                           WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_warehouses_lat_lng")
    for col in ("formatted_address", "place_id", "postal_code", "location_accuracy"):
        op.execute(f"ALTER TABLE warehouses DROP COLUMN IF EXISTS {col}")
    for col in ("warehouse_country_code", "warehouse_region", "warehouse_postal_code",
                "warehouse_place_id", "warehouse_formatted_address", "warehouse_location_accuracy"):
        op.execute(f"ALTER TABLE partner_applications DROP COLUMN IF EXISTS {col}")
