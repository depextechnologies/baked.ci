"""Centralized cart eligibility rules (SINGLE SOURCE OF TRUTH).

Frontend mirror: /app/frontend/src/lib/checkout.js
Business rule (BAKĒD v1.1 — 2026-02-05): minimum-order threshold REMOVED.
Customers may place an order of any amount. The function still returns the
`min_order`/`shortfall`/`reason` fields so existing callers compile, but
`eligible` is now always True and `shortfall` is always 0.
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
    min_order: float,  # kept for API compatibility; ignored in v1.1
) -> Eligibility:
    """Compute totals; eligibility is always True in BAKĒD v1.1.

    Rounding: values are rounded to 2 decimals BEFORE comparison to avoid
    off-by-one artefacts from floating-point arithmetic.
    """
    subtotal = round(float(subtotal or 0.0), 2)
    dfee = round(compute_delivery_fee(subtotal, country_delivery_fee, country_free_delivery_over), 2)
    total = round(subtotal + dfee, 2)

    return {
        "eligible": True,          # v1.1: minimum-order rule removed
        "subtotal": subtotal,
        "delivery_fee": dfee,
        "total": total,
        "min_order": 0.0,
        "shortfall": 0.0,
        "reason": None,
    }
