/**
 * Cart module theme resolver.
 *
 * Reads the composition of the global BAKĒD cart and returns the accent
 * tokens the cart/checkout UI should render in. The invariant is defined
 * in Fixing_Prompt v14 §4:
 *
 *   • MART_ONLY  → MART green (#77BC1F)
 *   • SHOP_ONLY  → SHOP gold  (#FCC44C)
 *   • MIXED      → Neutral BAKĒD (#E5E7EB) — a deliberate signal that
 *                  multiple modules are represented, so we don't misbrand
 *                  the whole cart as either one.
 *   • EMPTY      → falls back to MART green (existing default surface).
 *
 * The three-state mode is designed to scale — as FOOD, AUTO or SEND
 * become purchasable, the same helper picks the right theme without
 * changes to every cart/checkout component.
 */
export const CART_MODE = Object.freeze({
  MART_ONLY: "MART_ONLY",
  SHOP_ONLY: "SHOP_ONLY",
  MIXED:     "MIXED",
  EMPTY:     "EMPTY",
});

const THEMES = {
  MART_ONLY: {
    accent:       "#77BC1F",
    accent_soft:  "rgba(119,188,31,.15)",
    accent_ring:  "#77BC1F55",
    label:        "MARTbakēd",
    text_on:      "#000000",
  },
  SHOP_ONLY: {
    accent:       "#FCC44C",
    accent_soft:  "rgba(252,196,76,.16)",
    accent_ring:  "#FCC44C66",
    label:        "SHOPbakēd",
    text_on:      "#000000",
  },
  MIXED: {
    // Neutral BAKĒD — dominant on the shell while individual line items
    // keep their own module badge color. Deliberately un-branded so the
    // customer sees "one BAKĒD purchase" instead of a mis-tinted MART/SHOP.
    accent:       "#E5E7EB",
    accent_soft:  "rgba(229,231,235,.12)",
    accent_ring:  "#E5E7EB55",
    label:        "BAKĒD",
    text_on:      "#0B0F12",
  },
  EMPTY: {
    accent:       "#77BC1F",
    accent_soft:  "rgba(119,188,31,.15)",
    accent_ring:  "#77BC1F55",
    label:        "BAKĒD",
    text_on:      "#000000",
  },
};

export function detectCartMode(cart) {
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) return CART_MODE.EMPTY;
  const hasShop = (cart.shop?.item_count ?? 0) > 0 || cart.items.some((i) => i.module === "shop");
  const hasMart = (cart.mart?.item_count ?? 0) > 0 || cart.items.some((i) => i.module !== "shop");
  if (hasShop && hasMart) return CART_MODE.MIXED;
  if (hasShop)            return CART_MODE.SHOP_ONLY;
  return CART_MODE.MART_ONLY;
}

export function getCartTheme(cart) {
  const mode = detectCartMode(cart);
  return { mode, ...THEMES[mode] };
}

// Per-line badge colour — always the *item's* module, never the cart's
// aggregate mode (Fixing_Prompt §4: "Each cart line should retain its own
// module identity where appropriate.").
export function lineAccent(item) {
  return item?.module === "shop" ? "#FCC44C" : "#77BC1F";
}
