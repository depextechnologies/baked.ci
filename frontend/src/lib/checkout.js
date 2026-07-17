// Centralized cart eligibility rules (SINGLE SOURCE OF TRUTH).
// Backend mirror: /app/backend/modules/mart/cart_rules.py
//
// Business rule (BAKĒD v1.0): minimum-order threshold is compared against the
// **total payable amount** (subtotal + delivery fee, after any discounts).
// This matches what the customer sees on the Order Summary "Total" line.

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
  const minOrder = round2(country?.min_order || 0);
  const eligible = total >= minOrder;
  return {
    eligible,
    subtotal: s,
    delivery_fee: df,
    total,
    min_order: minOrder,
    shortfall: eligible ? 0 : round2(minOrder - total),
    reason: eligible ? null : `Minimum order is ${minOrder}`,
  };
};
