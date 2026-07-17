"""Centralized cart eligibility rules (SINGLE SOURCE OF TRUTH).

Frontend mirror: /app/frontend/src/lib/checkout.js
Business rule (BAKĒD v1.0): minimum-order threshold is compared against the
**total payable amount** (subtotal + delivery fee, after any discounts).
This matches what the customer sees on the Order Summary line "Total".
"""
from __future__ import annotations
from typing import Optional, TypedDict


class Eligibility(TypedDict):
    eligible: bool
    subtotal: float
    delivery_fee: float
    total: float
    min_order: float
    shortfall: float                # 0 when eligible, else how far below the threshold
    reason: Optional[str]           # None when eligible


def compute_delivery_fee(subtotal: float, delivery_fee: float, free_delivery_over: float) -> float:
    """Free delivery when subtotal (product value) meets the free-delivery threshold."""
    if free_delivery_over and subtotal >= free_delivery_over:
        return 0.0
    return float(delivery_fee or 0.0)


def check_order_eligibility(
    subtotal: float,
    country_delivery_fee: float,
    country_free_delivery_over: float,
    min_order: float,
) -> Eligibility:
    """Compute totals + eligibility using the canonical rule (`total >= min_order`).

    Rounding: values are rounded to 2 decimals BEFORE comparison to avoid
    off-by-one artefacts from floating-point arithmetic.
    """
    subtotal = round(float(subtotal or 0.0), 2)
    dfee = round(compute_delivery_fee(subtotal, country_delivery_fee, country_free_delivery_over), 2)
    total = round(subtotal + dfee, 2)
    min_order_v = round(float(min_order or 0.0), 2)

    eligible = total >= min_order_v
    shortfall = 0.0 if eligible else round(min_order_v - total, 2)

    return {
        "eligible": eligible,
        "subtotal": subtotal,
        "delivery_fee": dfee,
        "total": total,
        "min_order": min_order_v,
        "shortfall": shortfall,
        "reason": None if eligible else f"Minimum order is {min_order_v:g}",
    }
