"""Issue #10 — Seed SENDbaked (`express`) vehicle catalogue for India (IN).

Mirrors the CI seed for Bike / Mini 3-Wheeler / Truck so the three services
remain visible when the country switch flips to India. Idempotent — reruns
are safe (does nothing if the IN rows already exist).

Revision: 0025_send_india_vehicles
Down-revision: 0024_driver_job_chat
"""
from alembic import op


revision      = "0025_send_india_vehicles"
down_revision = "0024_driver_job_chat"
branch_labels = None
depends_on    = None


# Prices in INR (base_price). ETA windows mirror CI. Weights unchanged.
_IN_VEHICLES = [
    # code, name, description, max_kg, eta_min, eta_max, base_price, sort, image
    ("bike",          "Bike",           "Best for small parcels · Fastest delivery", 5,    15, 20,   79.00, 1,
        "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/coe69eua_EXPRESSBike.png"),
    ("three_wheeler", "Mini 3 Wheeler", "Ideal for bulky items · More space",         300,  30, 40,  199.00, 3,
        "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/c7niryj4_EXPRESS3W.png"),
    ("truck",         "Truck",          "Extra large deliveries · Long distance",     3000, 60, 90, 1499.00, 5,
        "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/sqokzl5j_EXPRESSTruck.png"),
]


def upgrade() -> None:
    # Ensure IN row exists in `countries` (seed script may run later; migration
    # must be idempotent even against a freshly-created DB).
    op.execute("""
        INSERT INTO countries (code, name, currency, currency_symbol, locale, flag, active, "primary", production_visible)
        VALUES ('IN', 'India', 'INR', '₹', 'en-IN', '🇮🇳', TRUE, FALSE, TRUE)
        ON CONFLICT (code) DO NOTHING
    """)
    for code, name, desc, kg, eta_lo, eta_hi, price, sort, image in _IN_VEHICLES:
        # Explicit id — `express_vehicles.id` has no server default in this
        # schema. Deterministic so re-running produces the same rows and
        # ON CONFLICT DO NOTHING is meaningful.
        rid = f"exv_in_{code}"
        op.execute(f"""
            INSERT INTO express_vehicles
              (id, code, country, name, description, max_weight_kg, eta_min_min, eta_min_max,
               base_price, sort_order, active, image, version, created_at, updated_at)
            VALUES
              ('{rid}', '{code}', 'IN', '{name}', '{desc.replace("'", "''")}', {kg}, {eta_lo}, {eta_hi},
               {price}, {sort}, TRUE, '{image}', 1, now(), now())
            ON CONFLICT (id) DO NOTHING
        """)


def downgrade() -> None:
    op.execute("DELETE FROM express_vehicles WHERE country = 'IN' AND code IN ('bike','three_wheeler','truck')")
