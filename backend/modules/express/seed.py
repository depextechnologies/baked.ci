"""EXPRESSbakēd — idempotent seed data.

Seeds active vehicles, package types, weight tiers, delivery preferences,
pricing rules, move types, mover categories/items, and default time slots
for CI and LR. All values re-editable from Super Admin — nothing is hardcoded
anywhere in the runtime pricing logic.
"""
from __future__ import annotations
import math
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import SessionLocal
from core.models import (
    ExpressDeliveryPref,
    ExpressMoveType,
    ExpressMoversCategory,
    ExpressMoversItem,
    ExpressMoversPricing,
    ExpressPackageType,
    ExpressPricingRule,
    ExpressTimeSlot,
    ExpressVehicle,
    ExpressWeightTier,
    ModuleDriver,
    new_id,
)
from seed import _upsert


VEHICLES = [
    # (code, name, description, max_weight_kg, eta_min, eta_max, base_ci, base_lr, sort)
    ("bike",          "Bike",         "Best for small parcels · Fastest delivery",     5,     15, 20,  1500,  500, 1),
    ("scooter",       "Scooter",      "Perfect for medium parcels · Affordable & quick", 15,   20, 25,  2500,  800, 2),
    ("three_wheeler", "3 Wheeler",    "Ideal for bulky items · More space",              300,  30, 40,  5000, 1500, 3),
    ("mini_truck",    "Mini Truck",   "For large deliveries · Furniture & appliances",   1000, 45, 60, 12000, 4000, 4),
    ("truck",         "Truck",        "Extra large deliveries · Long distance",          3000, 60, 90, 25000, 8000, 5),
]

PACKAGE_TYPES = [
    ("documents",   "Documents",     "file-text", 1),
    ("food",        "Food Package",  "utensils",  2),
    ("electronics", "Electronics",   "cpu",       3),
    ("fragile",     "Fragile Items", "shield",    4),
    ("furniture",   "Furniture",     "armchair",  5),
    ("general",     "General Parcel","package",   6),
]

WEIGHT_TIERS = [
    ("wt_upto_5",  "Up to 5 kg",  0,   5,  1),
    ("wt_5_15",    "5 – 15 kg",   5,   15, 2),
    ("wt_15_30",   "15 – 30 kg",  15,  30, 3),
    ("wt_30_plus", "30+ kg",      30,  0,  4),
]

DELIVERY_PREFS = [
    ("call_before",   "Call receiver before delivery", "We'll call before reaching",             1),
    ("leave_at_door", "Leave at door",                 "Leave at the door if no one is present", 2),
    ("signature",     "Signature required",            "Collect signature on delivery",          3),
]

# Pricing rules — 100% editable from Super Admin.
# per_km / per_min values scaled to base_price (roughly ~10% of base per km, 3% per min).
PRICING_TEMPLATE = {
    # multipliers same across countries; only monetary values differ
    "peak_multiplier": 1.25,
    "night_multiplier": 1.15,
    "service_fee_pct": 5,       # 5% of subtotal
    "insurance_pct": 0.5,       # 0.5% of declared value
    "taxes_pct": 0,             # VAT off by default
    "waiting_fee": 0,
    "active": True,
}
# For each vehicle we set per_km and per_min in local currency
PRICING_PARAMS = {
    "bike":          {"per_km_ci": 150, "per_min_ci": 40,  "per_km_lr": 60,  "per_min_lr": 15},
    "scooter":       {"per_km_ci": 220, "per_min_ci": 55,  "per_km_lr": 80,  "per_min_lr": 20},
    "three_wheeler": {"per_km_ci": 400, "per_min_ci": 90,  "per_km_lr": 140, "per_min_lr": 35},
    "mini_truck":    {"per_km_ci": 900, "per_min_ci": 180, "per_km_lr": 320, "per_min_lr": 60},
    "truck":         {"per_km_ci": 1800,"per_min_ci": 300, "per_km_lr": 620, "per_min_lr": 100},
}

# Packers & Movers
MOVE_TYPES = [
    ("house",       "House Shifting",       "Move your home safely and easily",         "home",    1),
    ("office",      "Office Relocation",    "Relocate your office with zero hassle",    "building",2),
    ("mini_labour", "Mini Truck + Labour",  "Small moves with truck and professional movers", "truck", 3),
    ("single_item", "Single Item Move",     "Move single items like furniture & appliances", "package", 4),
]
MOVERS_CATEGORIES = [
    ("living_room", "Living Room",  "sofa",       1),
    ("bedroom",     "Bedroom",      "bed",        2),
    ("kitchen",     "Kitchen",      "utensils",   3),
    ("office",      "Office",       "briefcase",  4),
    ("outdoor",     "Outdoor",      "tree",       5),
    ("others",      "Others",       "package",    6),
]

# (category, name, weight_kg, labour, base_price_ci, base_price_lr, sort)
MOVERS_ITEMS = [
    # Living room
    ("living_room", "Sofa (2-seater)",     35,  2,  4000, 1500, 1),
    ("living_room", "Sofa (3-seater)",     55,  2,  6000, 2200, 2),
    ("living_room", "TV (up to 50\")",     15,  1,  2500,  900, 3),
    ("living_room", "TV Stand",            20,  1,  2000,  700, 4),
    ("living_room", "Dining Table",        40,  2,  4500, 1600, 5),
    ("living_room", "Coffee Table",        15,  1,  1500,  600, 6),
    ("living_room", "Bookshelf",           25,  2,  3000, 1100, 7),
    # Bedroom
    ("bedroom", "Single Bed",              30,  2,  3500, 1300, 1),
    ("bedroom", "Double Bed",              55,  3,  5500, 2000, 2),
    ("bedroom", "Wardrobe (2-door)",       60,  3,  6000, 2200, 3),
    ("bedroom", "Wardrobe (3-door)",       90,  3,  8000, 2800, 4),
    ("bedroom", "Mattress",                18,  1,  1500,  550, 5),
    ("bedroom", "Dresser",                 30,  2,  3200, 1200, 6),
    # Kitchen
    ("kitchen", "Refrigerator",            80,  3,  7000, 2500, 1),
    ("kitchen", "Washing Machine",         70,  3,  6500, 2300, 2),
    ("kitchen", "Microwave",               12,  1,  1200,  450, 3),
    ("kitchen", "Gas Stove",               15,  1,  1500,  550, 4),
    ("kitchen", "Utensils Box",             8,  1,   800,  300, 5),
    # Office
    ("office", "Office Desk",              40,  2,  4000, 1500, 1),
    ("office", "Office Chair",             12,  1,  1200,  450, 2),
    ("office", "Filing Cabinet",           35,  2,  3200, 1200, 3),
    ("office", "Computer/Monitor",         10,  1,  1000,  400, 4),
    # Outdoor
    ("outdoor", "Bicycle",                 15,  1,  1800,  650, 1),
    ("outdoor", "Plants (large pot)",       8,  1,   700,  260, 2),
    # Others
    ("others", "Carton Box (small)",        5,  1,   400,  150, 1),
    ("others", "Carton Box (large)",       10,  1,   700,  260, 2),
    ("others", "Suitcase",                 12,  1,   600,  220, 3),
]

# Movers pricing config per country (single row; extensible per-country)
MOVERS_PRICING = {
    "CI": {
        "price_per_km": 250, "transport_base": 2000,
        "packing_per_item": 300,
        "loading_unloading_base": 3000, "loading_per_item": 50,
        "labour_per_mover": 4000,
        "floor_fee": 500, "stair_fee": 1500, "toll_permits": 500,
        "insurance_pct": 0.5, "insurance_min": 500,
        "value_per_kg": 3000,
        "taxes_pct": 0,
        "advance_flat": 5000, "advance_pct": 0,
    },
    "LR": {
        "price_per_km": 80, "transport_base": 600,
        "packing_per_item": 100,
        "loading_unloading_base": 1000, "loading_per_item": 20,
        "labour_per_mover": 1500,
        "floor_fee": 200, "stair_fee": 500, "toll_permits": 200,
        "insurance_pct": 0.5, "insurance_min": 200,
        "value_per_kg": 1000,
        "taxes_pct": 0,
        "advance_flat": 1500, "advance_pct": 0,
    },
}

TIME_SLOTS = [
    ("early_morning", "Early Morning", "7:00 AM – 11:00 AM", 0,   "BEST PRICE", 1),
    ("late_morning",  "Late Morning",  "11:00 AM – 3:00 PM", 300, None,          2),
    ("afternoon",     "Afternoon",     "3:00 PM – 7:00 PM",  600, None,          3),
    ("evening",       "Evening",       "7:00 PM – 10:00 PM", 900, None,          4),
]


async def seed_express():
    async with SessionLocal() as session:
        # Vehicles per country
        for code, name, desc, max_w, eta_min, eta_max, base_ci, base_lr, sort in VEHICLES:
            for country, base in (("CI", base_ci), ("LR", base_lr)):
                await _upsert(session, ExpressVehicle, ["code", "country"], {
                    "id": new_id("veh"), "code": code, "country": country, "name": name, "description": desc,
                    "max_weight_kg": max_w, "eta_min_min": eta_min, "eta_min_max": eta_max,
                    "base_price": base, "sort_order": sort, "active": True,
                    "icon": code, "image": None,
                })

        # Package types (global — cloned per-country for future variance)
        for code, name, icon, sort in PACKAGE_TYPES:
            for country in ("CI", "LR"):
                await _upsert(session, ExpressPackageType, ["code", "country"], {
                    "id": new_id("pkg"), "code": code, "country": country, "name": name, "icon": icon,
                    "sort_order": sort, "active": True,
                })

        # Weight tiers (global)
        for code, name, low, high, sort in WEIGHT_TIERS:
            await _upsert(session, ExpressWeightTier, ["code"], {
                "id": new_id("wt"), "code": code, "name": name, "min_kg": low, "max_kg": high or None,
                "sort_order": sort, "active": True,
            })

        # Delivery preferences
        for code, label, desc, sort in DELIVERY_PREFS:
            await _upsert(session, ExpressDeliveryPref, ["code"], {
                "id": new_id("pref"), "code": code, "label": label, "description": desc,
                "sort_order": sort, "active": True,
            })

        # Pricing rules per (country, vehicle)
        for code, _n, _d, _mw, _emin, _emax, base_ci, base_lr, _s in VEHICLES:
            p = PRICING_PARAMS[code]
            for country, base, per_km, per_min in (
                ("CI", base_ci, p["per_km_ci"], p["per_min_ci"]),
                ("LR", base_lr, p["per_km_lr"], p["per_min_lr"]),
            ):
                await _upsert(
                    session, ExpressPricingRule, ["country", "vehicle_code"], {
                        "id": new_id("pr"), **PRICING_TEMPLATE, "country": country, "vehicle_code": code,
                        "base_fare": base, "min_fare": base,
                        "price_per_km": per_km, "price_per_min": per_min,
                        "insurance_min": max(100, int(base * 0.05)),
                    },
                    # Targets the partial unique index (country, vehicle_code) WHERE active —
                    # every seeded rule is active, so this always matches. Must be the bare
                    # column (not `.is_(True)`) to textually match the index's predicate.
                    index_where=ExpressPricingRule.active,
                )

        # Movers taxonomy
        for code, name, desc, icon, sort in MOVE_TYPES:
            await _upsert(session, ExpressMoveType, ["code"], {
                "id": new_id("mvt"), "code": code, "name": name, "description": desc, "icon": icon,
                "sort_order": sort, "active": True,
            })

        for code, name, icon, sort in MOVERS_CATEGORIES:
            await _upsert(session, ExpressMoversCategory, ["code"], {
                "id": new_id("mcat"), "code": code, "name": name, "icon": icon, "sort_order": sort, "active": True,
            })

        for cat, name, weight, labour, base_ci, base_lr, sort in MOVERS_ITEMS:
            for country, base in (("CI", base_ci), ("LR", base_lr)):
                await _upsert(session, ExpressMoversItem, ["name", "category_code", "country"], {
                    "id": new_id("mitem"), "category_code": cat, "country": country, "name": name,
                    "weight_kg": weight, "labour_required": labour,
                    "base_price": base, "sort_order": sort, "active": True,
                })

        # Movers pricing per country
        for country, cfg in MOVERS_PRICING.items():
            await _upsert(session, ExpressMoversPricing, ["country"], {
                "id": new_id("mvp"), **cfg, "country": country, "active": True,
            })

        # Time slots per country (LR uses same LRD surcharge magnitudes, scaled ~0.3x)
        for code, label, window, surcharge, badge, sort in TIME_SLOTS:
            for country, mult in (("CI", 1.0), ("LR", 0.3)):
                await _upsert(session, ExpressTimeSlot, ["code", "country"], {
                    "id": new_id("ts"), "code": code, "country": country, "name": label, "window": window,
                    "surcharge": int(surcharge * mult), "badge": badge,
                    "sort_order": sort, "active": True,
                })

        await session.commit()

        # -------- Express drivers (Phase 2) --------
        await seed_express_drivers(session)
        await session.commit()


# Country reference centers for driver seed distribution.
COUNTRY_CENTERS = {
    "CI": (5.3600, -4.0083, "Cocody"),
    "LR": (6.3005, -10.7969, "Sinkor"),
}

# 15 named drivers per country covering all vehicle types (3 per vehicle).
DRIVER_NAMES_CI = [
    "Kouassi Traoré", "Yao Konan", "Aïcha Bamba", "Serge Ouattara",
    "Fatou Diarra", "Adama Coulibaly", "Awa Bakayoko", "Mamadou Cissé",
    "Sekou Doumbia", "Mariam Kone", "Ibrahim Touré", "Aminata Diallo",
    "Ismael Fofana", "Yasmine Berté", "Cheikh Kouamé",
]
DRIVER_NAMES_LR = [
    "James Kollie", "Emmanuel Doe", "Grace Toe", "Peter Weah",
    "Rachel Cooper", "Moses Sirleaf", "Sarah Johnson", "Daniel Kpangbah",
    "Ruth Kanneh", "Prince Roberts", "Anna Toe", "Samuel Zaza",
    "Deborah Reeves", "Alex Kruah", "Kadi Barclay",
]
VEHICLE_ROTATION = ["bike", "scooter", "three_wheeler", "mini_truck", "truck"]


async def seed_express_drivers(session: AsyncSession):
    """Idempotent seed of 15 active drivers per country, spread around the
    country's reference center at 0.5–3 km offsets. Uses `phone` as the
    dedup key so re-runs don't duplicate."""
    for country_code, (clat, clng, city) in COUNTRY_CENTERS.items():
        names = DRIVER_NAMES_CI if country_code == "CI" else DRIVER_NAMES_LR
        phone_prefix = "+225" if country_code == "CI" else "+231"
        for i, name in enumerate(names):
            vt = VEHICLE_ROTATION[i % len(VEHICLE_ROTATION)]
            angle = (i * 137.508) % 360 * (math.pi / 180)
            radius = 0.008 + ((i * 3) % 20) * 0.001  # ~0.9–3 km
            lat = clat + math.sin(angle) * radius
            lng = clng + math.cos(angle) * radius
            phone = f"{phone_prefix}0{100000 + i * 137:07d}"
            existing = (
                await session.execute(
                    select(ModuleDriver).where(ModuleDriver.phone == phone, ModuleDriver.module == "express")
                )
            ).scalar_one_or_none()
            if existing:
                # Keep phase-2 fields fresh but don't overwrite admin edits
                # (is_available/status/rating stay whatever an admin last set).
                existing.current_lat = lat
                existing.current_lng = lng
                existing.vehicle_type = vt
                continue
            session.add(
                ModuleDriver(
                    id=new_id("drv"),
                    module="express",
                    name=name,
                    phone=phone,
                    country=country_code,
                    city=city,
                    vehicle_type=vt,
                    vehicle_reg=f"{country_code}-{vt[:3].upper()}-{1000 + i:04d}",
                    license_number=f"DL-{country_code}-{200000 + i * 11:06d}",
                    rating=round(4.5 + (i % 5) * 0.1, 1),
                    current_lat=lat,
                    current_lng=lng,
                    is_available=True,
                    status="active",
                )
            )

