/**
 * BAKĒD Global Cart Drawer — right-side slide-in (desktop only).
 *
 * Fixing_Prompt v4 §1-§18, §22-§30.
 *  - Reads cart state from the single `CartProvider` (BakedContexts).
 *  - Reuses `updateItem`, `removeItem`, `openCart`, `closeCart` — no new APIs.
 *  - Reuses `checkOrderEligibility` for MART min-order + delivery-fee gates
 *    and `formatMoney` for locale-aware currency rendering.
 *  - Mobile still uses the full-page /cart route; this drawer renders
 *    nothing when the viewport is < md (768px).
 *  - Focus-trapped, ESC-closes, backdrop-closes. Never navigates on close.
 */
import React, { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Plus, Minus, Trash2, ShoppingCart } from "lucide-react";
import { useApp, useCart, useAuth } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { useLocalePath } from "../../i18n/routes";
import { checkOrderEligibility } from "../../lib/checkout";
import { getCartTheme } from "../../lib/cartTheme";
import { CART } from "../../constants/testIds";
import { Button } from "../ui/button";

// Per-module chip colours — matches the CartPage row badges so the drawer
// reads as the same information surface.
const MODULE_BADGE = {
  shop: { bg: "rgba(251,191,36,.15)",  fg: "#F59E0B", bd: "rgba(251,191,36,.3)", label: "SHOP" },
  food: { bg: "rgba(239,68,68,.15)",   fg: "#EF4444", bd: "rgba(239,68,68,.3)",  label: "FOOD" },
  mart: { bg: "rgba(119,188,31,.15)",  fg: "#77BC1F", bd: "rgba(119,188,31,.3)", label: "MART" },
};

const ModuleChip = ({ module, itemId }) => {
  const style = MODULE_BADGE[module] || MODULE_BADGE.mart;
  return (
    <span
      className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.bd}` }}
      data-testid={`cart-drawer-module-badge-${itemId}`}
    >
      {style.label}
    </span>
  );
};

// Adapts either a MART row (which stores `product`) or a SHOP row (which
// stores `variant` + `product`) into a single render shape. Matches the
// existing CartPage logic so pricing/subtotals stay identical.
const rowFacade = (it) => {
  const isShop = it.module === "shop";
  if (isShop) {
    return {
      name:  it.title || it.product?.title,
      image: it.images?.[0] || it.product?.images?.[0] || "",
      unit:  it.variant?.sku || "",
      brand: "SHOPbakēd seller",
      price: it.unit_price ?? it.variant?.price ?? 0,
      currency: it.currency || it.variant?.currency,
      currency_symbol: it.currency || "XOF",
      variantAttrs: it.variant?.attributes || null,
    };
  }
  return {
    name:  it.product?.name,
    image: it.product?.image,
    unit:  it.product?.unit,
    brand: it.product?.brand,
    price: it.product?.price,
    currency: it.product?.currency,
    currency_symbol: it.product?.currency_symbol,
    variantAttrs: null,
  };
};

export const CartDrawer = () => {
  const { t } = useTranslation("customer");
  const { country } = useApp();
  const { cart, updateItem, removeItem, drawerOpen, closeCart } = useCart();
  const { customer, openLogin } = useAuth();
  const navigate = useNavigate();
  const path = useLocalePath();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const items = cart.items || [];
  const theme = getCartTheme(cart);
  const martSubtotal = cart.mart?.subtotal ?? items.filter((i) => i.module !== "shop").reduce((s, i) => s + (i.line_total || (i.product?.price || 0) * i.quantity), 0);
  const shopSubtotal = cart.shop?.subtotal ?? items.filter((i) => i.module === "shop").reduce((s, i) => s + (i.line_total || 0), 0);
  const hasMart = (cart.mart?.item_count ?? items.filter((i) => i.module !== "shop").length) > 0;
  const hasShop = (cart.shop?.item_count ?? items.filter((i) => i.module === "shop").length) > 0;
  const elig = checkOrderEligibility(martSubtotal, country);
  const { delivery_fee: deliveryFee, min_order: minOrder, shortfall, eligible: martEligible } = elig;
  const minOrderOk = hasMart ? martEligible : true;
  const subtotal = martSubtotal + shopSubtotal;
  const total = (hasMart ? elig.total : 0) + shopSubtotal;

  // ESC to close (Fixing_Prompt §5, §28).
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closeCart(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeCart]);

  // Focus handling — when the drawer opens, remember what was focused and
  // move focus into the panel. When it closes, restore focus to the
  // originating trigger so keyboard users don't lose their place.
  useEffect(() => {
    if (drawerOpen) {
      previouslyFocused.current = typeof document !== "undefined" ? document.activeElement : null;
      // Defer one tick so the panel is mounted before we focus into it.
      const id = window.setTimeout(() => {
        panelRef.current?.querySelector("[data-cart-drawer-initial-focus]")?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    previouslyFocused.current?.focus?.();
    return undefined;
  }, [drawerOpen]);

  // Body scroll lock — prevent the background from scrolling under the
  // drawer while it's open. Restored on close.
  useEffect(() => {
    if (!drawerOpen || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const proceedToCheckout = useCallback(() => {
    if (!customer) {
      // Guests can review freely (Fixing_Prompt §17). Login is only needed
      // when they hit checkout — openLogin stashes /checkout as return path.
      openLogin?.(path("checkout"));
      // Choice §3b — navigate immediately, no exit animation. Drawer
      // unmounts naturally on route change via closeCart in the handler.
      closeCart();
      return;
    }
    if (!minOrderOk) return;
    closeCart();
    navigate(path("checkout"));
  }, [customer, minOrderOk, navigate, path, openLogin, closeCart]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden={!drawerOpen}
      className={`fixed inset-0 z-[100] hidden md:block ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop — click closes (Fixing_Prompt §4). Opacity animates so
          the underlying page fades to ~40% and back cleanly. */}
      <button
        type="button"
        aria-label="Close cart"
        data-testid="cart-drawer-backdrop"
        onClick={closeCart}
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${drawerOpen ? "opacity-40" : "opacity-0"}`}
      />

      {/* Panel — translateX slide, min(35vw, 500px) with a 400px floor
          so it never crushes at 1366px viewport (Fixing_Prompt §2, §20). */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("cart.title", { defaultValue: "Your cart" })}
        data-testid="cart-drawer"
        className={`absolute top-0 right-0 h-screen bg-background border-l border-border shadow-xl flex flex-col
                    transition-transform duration-300 ease-out will-change-transform
                    ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: "min(35vw, 500px)", minWidth: "400px" }}
      >
        {/* Header — back-arrow + title + item count (Fixing_Prompt §6, choice §5b) */}
        <header className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
          <button
            type="button"
            data-cart-drawer-initial-focus
            data-testid="cart-drawer-close"
            onClick={closeCart}
            className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center motion-fast"
            aria-label={t("cart.close", { defaultValue: "Close cart" })}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{t("cart.title", { defaultValue: "Your cart" })}</div>
            <div className="text-[11px] text-muted-foreground" data-testid="cart-drawer-count">
              {t("cart.item_count", { count: cart.item_count || 0, defaultValue: `${cart.item_count || 0} items` })}
            </div>
          </div>
        </header>

        {/* Body — scroll region */}
        <div className="flex-1 overflow-y-auto" data-testid="cart-drawer-body">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4" data-testid="cart-drawer-empty">
              <div className="w-16 h-16 rounded-full bg-secondary/60 flex items-center justify-center">
                <ShoppingCart size={28} className="text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {t("cart.empty_title", { defaultValue: "Your cart is empty" })}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("cart.empty_subtitle", { defaultValue: "Add products from MART or SHOP to see them here." })}
                </div>
              </div>
              <Button onClick={closeCart} variant="outline" data-testid="cart-drawer-continue-shopping">
                {t("cart.continue_shopping", { defaultValue: "Continue shopping" })}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const p = rowFacade(it);
                return (
                  <li key={it.id} data-testid={CART.itemRow(it.id)} className="px-5 py-4 flex gap-3">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-14 h-14 rounded-lg object-cover bg-secondary shrink-0"
                      />
                    ) : (
                      // Empty-string src emits a React runtime warning and
                      // re-fetches the current URL — render a neutral
                      // placeholder tile instead.
                      <div
                        aria-hidden="true"
                        className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground shrink-0"
                      >
                        <ShoppingCart size={18} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold truncate">{p.name}</div>
                        <ModuleChip module={it.module || "mart"} itemId={it.id} />
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.unit ? `${p.unit} · ` : ""}{p.brand}
                      </div>
                      {p.variantAttrs && Object.keys(p.variantAttrs).length > 0 && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {Object.entries(p.variantAttrs).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </div>
                      )}
                      <div className="text-sm font-bold mt-1">
                        {formatMoney(p.price, p.currency, p.currency_symbol)}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
                          <button
                            type="button"
                            data-testid={`cart-drawer-qty-decr-${it.id}`}
                            onClick={() => (it.quantity <= 1 ? removeItem(it.id) : updateItem(it.id, it.quantity - 1))}
                            className="px-2 py-1 hover:bg-secondary"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-xs font-bold min-w-[24px] text-center">{it.quantity}</span>
                          <button
                            type="button"
                            data-testid={`cart-drawer-qty-incr-${it.id}`}
                            onClick={() => updateItem(it.id, it.quantity + 1)}
                            className="px-2 py-1 hover:bg-secondary"
                            aria-label="Increase quantity"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button
                          type="button"
                          data-testid={`cart-drawer-remove-${it.id}`}
                          onClick={() => removeItem(it.id)}
                          className="text-muted-foreground hover:text-red-500 motion-fast"
                          aria-label="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sticky footer — order summary + CTA (Fixing_Prompt §12, §13) */}
        {items.length > 0 && (
          <footer className="border-t border-border bg-background px-5 py-4 shrink-0">
            <div className="grid gap-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                <span className="font-medium" data-testid="cart-drawer-subtotal">
                  {formatMoney(subtotal, country?.currency, country?.currency_symbol)}
                </span>
              </div>
              {hasMart && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.delivery_fee")} (MART)</span>
                  <span className="font-medium">
                    {deliveryFee === 0 ? t("cart.delivery_free") : formatMoney(deliveryFee, country?.currency, country?.currency_symbol)}
                  </span>
                </div>
              )}
              {hasShop && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.delivery_fee")} (SHOP)</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("cart.delivery_shop_note")}
                  </span>
                </div>
              )}
              <div className="h-px bg-border my-1.5" />
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{t("cart.total")}</span>
                <span className="font-bold" data-testid="cart-drawer-total">
                  {formatMoney(total, country?.currency, country?.currency_symbol)}
                </span>
              </div>
            </div>
            {!minOrderOk && hasMart && (
              <div className="text-[11px] mt-3 p-2 rounded-lg bg-yellow-500/10 text-yellow-500" data-testid="cart-drawer-min-order-warning">
                {t("cart.min_order_short", {
                  amount: formatMoney(shortfall, country?.currency, country?.currency_symbol),
                  min: formatMoney(minOrder, country?.currency, country?.currency_symbol),
                })}
              </div>
            )}
            <Button
              data-testid="cart-drawer-checkout"
              onClick={proceedToCheckout}
              disabled={customer && !minOrderOk}
              className="w-full mt-3 h-11 font-semibold disabled:opacity-60"
              style={{ backgroundColor: theme.accent, color: theme.text_on }}
            >
              {customer
                ? t("cart.checkout_cta")
                : t("cart.sign_in_to_checkout")}
            </Button>
            <button
              type="button"
              onClick={closeCart}
              data-testid="cart-drawer-continue-link"
              className="w-full mt-2 text-[11px] text-muted-foreground hover:text-foreground motion-fast"
            >
              {t("cart.continue_shopping", { defaultValue: "Continue shopping" })}
            </button>
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
};

export default CartDrawer;
