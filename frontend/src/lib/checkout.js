// Centralized cart eligibility rules (SINGLE SOURCE OF TRUTH).
// Backend mirror: /app/backend/modules/mart/cart_rules.py
//
// Business rule (BAKĒD v1.1 — 2026-02-05):
//   • NO minimum-order threshold. Customers can place an order of any amount.
//   • Delivery fee still applies per the country config and respects the
//     free-delivery threshold.
//   • The `checkOrderEligibility()` return shape is preserved so existing
//     callers keep working — eligibility is now always `true` and the
//     warning/shortfall fields are inert.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const computeDeliveryFee = (subtotal, country) => {
  const s = round2(subtotal);
  const free = Number(country?.free_delivery_over || 0);
  if (free > 0 && s >= free) return 0;
  return round2(country?.delivery_fee || 0);
};

/**
 * @returns {{ eligible: boolean, subtotal: number, delivery_fee: number, total: number, min_order: number, shortfall: number, reason: string|null }}
 */
export const checkOrderEligibility = (subtotal, country) => {
  const s = round2(subtotal);
  const df = computeDeliveryFee(s, country);
  const total = round2(s + df);
  return {
    eligible: true,          // v1.1: minimum-order rule removed
    subtotal: s,
    delivery_fee: df,
    total,
    min_order: 0,
    shortfall: 0,
    reason: null,
  };
};
