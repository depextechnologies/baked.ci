"""Seed SENDbakēd pricing rules for India (IN).

Fixes the Multiple Shipments (and single-shipment) quote showing ₹0.00 at
Step 2 for India-based trips. Migration 0025 seeded the IN vehicle
catalogue (bike / three_wheeler / truck) but never seeded the matching
`express_pricing_rules` rows, so `_pricing_rule()` fell back to the
zero-cost skeleton and every fare returned 0.

Same schema, multipliers and fee split as CI (5% service fee, 0% VAT,
1.25× peak, 1.15× night). Base fares mirror the base_price column already
seeded in migration 0025 so the "starting from" copy stays consistent.

Idempotent via ON CONFLICT against the partial-unique
`(country, vehicle_code) WHERE active` index.

Revision: 0052_send_india_pricing_rules
Down-revision: 0051_send_product_types
"""
from alembic import op


revision      = "0052_send_india_pricing_rules"
down_revision = "0051_send_product_types"
branch_labels = None
depends_on    = None


# (vehicle_code, base_fare, min_fare, per_km, per_min, insurance_min)
# ₹ INR — calibrated so a 6 km / 18 min bike run sits around ₹250 and a
# 30 km / 60 min truck run sits around ~₹4,800 (i.e. commercial rates for
# Delhi NCR intra-city).
_IN_RULES = [
    ("bike",           79,   79,   8,   2, 100),
    ("three_wheeler", 199,  199,  15,   4, 200),
    ("truck",        1499, 1499,  45,  10, 500),
]

_SERVICE_FEE_PCT   = 5
_INSURANCE_PCT     = 0.5
_TAXES_PCT         = 0
_PEAK_MULTIPLIER   = 1.25
_NIGHT_MULTIPLIER  = 1.15
_WAITING_FEE       = 0


def upgrade() -> None:
    for code, base, min_fare, per_km, per_min, ins_min in _IN_RULES:
        rid = f"pr_in_{code}"
        op.execute(f"""
            INSERT INTO express_pricing_rules (
                id, country, vehicle_code, active,
                base_fare, min_fare, price_per_km, price_per_min, waiting_fee,
                peak_multiplier, night_multiplier,
                service_fee_pct, insurance_pct, insurance_min, taxes_pct,
                version, created_at, updated_at
            ) VALUES (
                '{rid}', 'IN', '{code}', TRUE,
                {base}, {min_fare}, {per_km}, {per_min}, {_WAITING_FEE},
                {_PEAK_MULTIPLIER}, {_NIGHT_MULTIPLIER},
                {_SERVICE_FEE_PCT}, {_INSURANCE_PCT}, {ins_min}, {_TAXES_PCT},
                1, now(), now()
            )
            ON CONFLICT (country, vehicle_code) WHERE active DO UPDATE SET
                base_fare       = EXCLUDED.base_fare,
                min_fare        = EXCLUDED.min_fare,
                price_per_km    = EXCLUDED.price_per_km,
                price_per_min   = EXCLUDED.price_per_min,
                service_fee_pct = EXCLUDED.service_fee_pct,
                insurance_pct   = EXCLUDED.insurance_pct,
                insurance_min   = EXCLUDED.insurance_min,
                peak_multiplier = EXCLUDED.peak_multiplier,
                night_multiplier= EXCLUDED.night_multiplier,
                updated_at      = now()
        """)


def downgrade() -> None:
    op.execute("DELETE FROM express_pricing_rules WHERE country = 'IN'")
