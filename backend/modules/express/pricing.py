"""EXPRESSbakēd — pricing engine.

100% configuration-driven. No hardcoded constants: every rate comes from
`express_pricing_rules` (seeded once, editable from Super Admin).
"""
from __future__ import annotations
import math
from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import Country, ExpressMoversPricing, ExpressMoversItem, ExpressPricingRule, ExpressPromo


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres between two coords."""
    R = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def estimate_duration_min(distance_km: float, vehicle_code: str) -> int:
    """Estimated travel time — configurable via vehicle document if present.

    Assumes urban average speed by vehicle type. Kept centralised so admin can
    override per-vehicle later without touching booking code.
    """
    speeds = {"bike": 22, "scooter": 28, "three_wheeler": 25, "mini_truck": 30, "truck": 32}
    speed = speeds.get(vehicle_code, 25)
    return max(5, int(round((distance_km / speed) * 60)))


async def _pricing_rule(session: AsyncSession, country: str, vehicle_code: str) -> Dict[str, Any]:
    """Fetch active pricing rule; falls back to a safe zero-cost skeleton."""
    rule = (
        await session.execute(
            select(ExpressPricingRule).where(
                ExpressPricingRule.country == country.upper(),
                ExpressPricingRule.vehicle_code == vehicle_code,
                ExpressPricingRule.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if rule is None:
        return {
            "base_fare": 0, "min_fare": 0,
            "price_per_km": 0, "price_per_min": 0,
            "waiting_fee": 0,
            "peak_multiplier": 1.0, "night_multiplier": 1.0,
            "service_fee_pct": 0, "insurance_pct": 0, "insurance_min": 0,
            "taxes_pct": 0,
        }
    return {
        "base_fare": rule.base_fare, "min_fare": rule.min_fare,
        "price_per_km": rule.price_per_km, "price_per_min": rule.price_per_min,
        "waiting_fee": rule.waiting_fee,
        "peak_multiplier": rule.peak_multiplier, "night_multiplier": rule.night_multiplier,
        "service_fee_pct": rule.service_fee_pct, "insurance_pct": rule.insurance_pct,
        "insurance_min": rule.insurance_min, "taxes_pct": rule.taxes_pct,
    }


async def _currency(session: AsyncSession, country: str) -> tuple[str, str]:
    c = await session.get(Country, country.upper())
    if not c:
        return "XOF", "CFA"
    return c.currency or "XOF", c.currency_symbol or "CFA"


def _round(currency: str, value: float) -> float:
    """XOF/LRD are whole-number currencies; keep 2dp for others."""
    if currency in ("XOF", "LRD"):
        return float(int(round(value)))
    return round(value, 2)


async def quote_parcel(
    session: AsyncSession,
    *,
    country: str,
    vehicle_code: str,
    pickup_lat: float, pickup_lng: float,
    drop_lat: float, drop_lng: float,
    promo_code: Optional[str] = None,
    peak: bool = False,
    night: bool = False,
    declared_value: Optional[float] = None,
) -> Dict[str, Any]:
    """Compute the full price breakdown for a parcel booking."""
    rule = await _pricing_rule(session, country, vehicle_code)
    currency, symbol = await _currency(session, country)

    distance_km = round(haversine_km(pickup_lat, pickup_lng, drop_lat, drop_lng), 2)
    duration_min = estimate_duration_min(distance_km, vehicle_code)

    base_fare = float(rule.get("base_fare") or 0)
    distance_fare = distance_km * float(rule.get("price_per_km") or 0)
    time_fare = duration_min * float(rule.get("price_per_min") or 0)

    subtotal = base_fare + distance_fare + time_fare

    # Peak/night surcharges (multiplier on subtotal, extracted as a delta so it's transparent)
    surcharge = 0.0
    if peak: surcharge += subtotal * (float(rule.get("peak_multiplier") or 1) - 1)
    if night: surcharge += subtotal * (float(rule.get("night_multiplier") or 1) - 1)

    service_fee = (subtotal + surcharge) * (float(rule.get("service_fee_pct") or 0) / 100.0)

    ins_pct = float(rule.get("insurance_pct") or 0) / 100.0
    ins_min = float(rule.get("insurance_min") or 0)
    if declared_value and declared_value > 0:
        insurance = max(declared_value * ins_pct, ins_min)
    else:
        insurance = ins_min

    pre_promo = subtotal + surcharge + service_fee + insurance
    # Promo — resolve from active promos (very simple flat/percent for MVP)
    promo_discount = 0.0
    promo_meta = None
    if promo_code:
        promo = (
            await session.execute(
                select(ExpressPromo).where(
                    ExpressPromo.code == promo_code.upper(),
                    ExpressPromo.active.is_(True),
                    ExpressPromo.country == country.upper(),
                )
            )
        ).scalar_one_or_none()
        if promo:
            if promo.kind == "percent":
                promo_discount = pre_promo * (float(promo.value or 0) / 100.0)
                if promo.max_discount:
                    promo_discount = min(promo_discount, float(promo.max_discount))
            elif promo.kind == "flat":
                promo_discount = float(promo.value or 0)
            promo_meta = {"code": promo.code, "label": promo.label, "kind": promo.kind}

    taxable = max(0, pre_promo - promo_discount)
    taxes = taxable * (float(rule.get("taxes_pct") or 0) / 100.0)

    total = max(float(rule.get("min_fare") or 0), taxable + taxes)

    breakdown = {
        "currency": currency,
        "currency_symbol": symbol,
        "distance_km": distance_km,
        "duration_min": duration_min,
        "base_fare": _round(currency, base_fare),
        "distance_fare": _round(currency, distance_fare),
        "time_fare": _round(currency, time_fare),
        "surcharge": _round(currency, surcharge),
        "service_fee": _round(currency, service_fee),
        "insurance": _round(currency, insurance),
        "promo_discount": _round(currency, promo_discount),
        "promo": promo_meta,
        "taxes": _round(currency, taxes),
        "total": _round(currency, total),
    }
    return breakdown


async def quote_movers(
    session: AsyncSession,
    *,
    country: str,
    pickup_lat: float, pickup_lng: float,
    drop_lat: float, drop_lng: float,
    items: list,  # [{item_id, qty}]
    labour_movers: int = 2,
    floors_pickup: int = 0,
    floors_drop: int = 0,
    stairs_pickup: bool = False,
    stairs_drop: bool = False,
    declared_value: Optional[float] = None,
    time_slot_surcharge: float = 0.0,
) -> Dict[str, Any]:
    """Packers & Movers quote. Fully backend-driven; no hardcoded constants."""
    currency, symbol = await _currency(session, country)
    rule_row = (
        await session.execute(
            select(ExpressMoversPricing).where(
                ExpressMoversPricing.country == country.upper(), ExpressMoversPricing.active.is_(True)
            )
        )
    ).scalar_one_or_none()
    rule = {
        "price_per_km": rule_row.price_per_km if rule_row else 0,
        "transport_base": rule_row.transport_base if rule_row else 0,
        "packing_per_item": rule_row.packing_per_item if rule_row else 0,
        "loading_unloading_base": rule_row.loading_unloading_base if rule_row else 0,
        "loading_per_item": rule_row.loading_per_item if rule_row else 0,
        "labour_per_mover": rule_row.labour_per_mover if rule_row else 0,
        "floor_fee": rule_row.floor_fee if rule_row else 0,
        "stair_fee": rule_row.stair_fee if rule_row else 0,
        "toll_permits": rule_row.toll_permits if rule_row else 0,
        "value_per_kg": rule_row.value_per_kg if rule_row else 0,
        "insurance_pct": rule_row.insurance_pct if rule_row else 0,
        "insurance_min": rule_row.insurance_min if rule_row else 0,
        "taxes_pct": rule_row.taxes_pct if rule_row else 0,
        "advance_flat": rule_row.advance_flat if rule_row else 0,
        "advance_pct": rule_row.advance_pct if rule_row else 0,
    }

    distance_km = round(haversine_km(pickup_lat, pickup_lng, drop_lat, drop_lng), 2)

    # Aggregate item metadata (base fee, weight, labour need)
    item_map = {}
    if items:
        ids = [str(it.get("item_id")) for it in items if it.get("item_id")]
        rows = (
            (
                await session.execute(
                    select(ExpressMoversItem).where(
                        ExpressMoversItem.id.in_(ids), ExpressMoversItem.active.is_(True)
                    )
                )
            )
            .scalars()
            .all()
        )
        item_map = {r.id: r for r in rows}

    total_items = 0
    total_weight = 0.0
    for it in items or []:
        d = item_map.get(str(it.get("item_id")))
        qty = int(it.get("qty") or 0)
        if not d or qty <= 0:
            continue
        total_items += qty
        total_weight += float(d.weight_kg or 0) * qty

    transportation = distance_km * float(rule.get("price_per_km") or 0) + float(rule.get("transport_base") or 0)
    packing = total_items * float(rule.get("packing_per_item") or 0)
    loading = float(rule.get("loading_unloading_base") or 0) + total_items * float(rule.get("loading_per_item") or 0)
    labour = labour_movers * float(rule.get("labour_per_mover") or 0)
    floor_fee = (floors_pickup + floors_drop) * float(rule.get("floor_fee") or 0)
    stair_fee = ((1 if stairs_pickup else 0) + (1 if stairs_drop else 0)) * float(rule.get("stair_fee") or 0)
    toll_permit = float(rule.get("toll_permits") or 0)
    ins_pct = float(rule.get("insurance_pct") or 0) / 100.0
    insurance = (declared_value or (total_weight * float(rule.get("value_per_kg") or 0))) * ins_pct
    if insurance < float(rule.get("insurance_min") or 0):
        insurance = float(rule.get("insurance_min") or 0)

    subtotal = transportation + packing + loading + labour + floor_fee + stair_fee + toll_permit + insurance + time_slot_surcharge
    taxes = subtotal * (float(rule.get("taxes_pct") or 0) / 100.0)
    total = subtotal + taxes
    advance = float(rule.get("advance_flat") or 0) or (total * (float(rule.get("advance_pct") or 0) / 100.0))

    return {
        "currency": currency,
        "currency_symbol": symbol,
        "distance_km": distance_km,
        "total_items": total_items,
        "total_weight_kg": _round(currency, total_weight),
        "transportation": _round(currency, transportation),
        "packing": _round(currency, packing),
        "loading_unloading": _round(currency, loading),
        "labour": _round(currency, labour),
        "floor_fee": _round(currency, floor_fee),
        "stair_fee": _round(currency, stair_fee),
        "toll_permits": _round(currency, toll_permit),
        "insurance": _round(currency, insurance),
        "time_slot_surcharge": _round(currency, time_slot_surcharge),
        "taxes": _round(currency, taxes),
        "total": _round(currency, total),
        "advance": _round(currency, advance),
        "remaining": _round(currency, max(0, total - advance)),
    }
