import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, useAuth, useCart } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { checkOrderEligibility } from "../../lib/checkout";
import { QuantityStepper } from "../../components/mobile/QuantityStepper";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Trash2, ShoppingBag, ShieldCheck, Info, Sparkles, ShoppingCart, AlertCircle } from "lucide-react";

export const MobileCart = () => {
  const nav = useNavigate();
  const { country } = useApp();
  const { cart, loaded: cartLoaded, updateItem, removeItem } = useCart();
  const { customer, openLogin } = useAuth() || {};
  const [note, setNote] = useState("");
  const ccy = country?.currency_symbol || country?.currency;

  // Split by module: min-order + delivery fee are MART-only.
  const items = cart.items || [];
  const martItems = items.filter((i) => i.module !== "shop");
  const shopItems = items.filter((i) => i.module === "shop");
  const martSubtotal = cart.mart?.subtotal ?? martItems.reduce((s, i) => s + (i.line_total || (i.product?.price || 0) * i.quantity), 0);
  const shopSubtotal = cart.shop?.subtotal ?? shopItems.reduce((s, i) => s + (i.line_total || 0), 0);
  const hasMart = martItems.length > 0;
  const hasShop = shopItems.length > 0;
  const elig = checkOrderEligibility(martSubtotal, country);
  const { delivery_fee: deliveryFee, min_order: minOrder, shortfall, eligible: martEligible } = elig;
  const minOrderOk = hasMart ? martEligible : true;
  const total = (hasMart ? elig.total : 0) + shopSubtotal;
  const subtotal = martSubtotal + shopSubtotal;
  const savings = martItems.reduce((s, i) => {
    const p = i.product || {};
    const strike = p.compare_at_price || p.original_price;
    return s + (strike && strike > p.price ? (strike - p.price) * i.quantity : 0);
  }, 0);

  const goCheckout = () => {
    // Guest → open the existing sign-in modal with /checkout as the return
    // destination. `openLogin` persists it to sessionStorage so the customer
    // lands directly on checkout after login with the (merged) cart intact.
    if (!customer) { openLogin?.("/checkout"); return; }
    // Always route to the unified /checkout (MobileCheckout) — it handles
    // MART, SHOP and mixed carts internally.
    nav("/checkout");
  };

  if (!cart.items?.length) {
    if (!cartLoaded) return <div className="p-8 text-sm text-muted-foreground">Loading cart…</div>;
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center pb-16">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
          <ShoppingBag size={40} />
        </div>
        <div className="text-lg font-bold">Your cart is empty</div>
        <div className="text-xs text-muted-foreground mt-1">Browse the aisles to start filling it up.</div>
        <Button data-testid="m-cart-shop" onClick={() => nav("/")} className="baked-btn mt-6 h-11 px-6 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
          Start shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-40">
      {/* Sub header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-cart-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold">My Cart <span className="text-xs text-muted-foreground font-normal">({cart.item_count} items)</span></div>
          {savings > 0 && <div className="text-[11px]" style={{ color: "#77BC1F" }}>You&apos;re saving {formatMoney(savings, country?.currency, ccy)} on this order</div>}
        </div>
      </div>

      {/* Delivery notice */}
      <div className="mx-4 baked-card p-3 flex items-center gap-2.5 border" style={{ backgroundColor: "#77BC1F14", borderColor: "#77BC1F55" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}><Sparkles size={14} /></div>
        <div className="text-[11px] leading-snug">Delivery in <span className="font-bold" style={{ color: "#77BC1F" }}>{country?.delivery_eta_min}</span> · Freshness guaranteed</div>
      </div>

      {/* Items list */}
      <div className="px-4 mt-3 space-y-3">
        {cart.items.map((i) => {
          const isShop = i.module === "shop";
          // SHOP items carry a slightly different shape — normalise so the row
          // renders regardless of module.
          const p = isShop
            ? {
                name: i.title || i.product?.title,
                image: (i.images || i.product?.images || i.variant?.images || [])[0],
                unit: i.variant?.sku || "",
                price: i.unit_price ?? i.variant?.price ?? 0,
                currency: i.currency || i.variant?.currency,
              }
            : (i.product || {});
          const strike = p.compare_at_price || p.original_price;
          const off = strike && strike > p.price ? Math.round(((strike - p.price) / strike) * 100) : 0;
          return (
            <div key={i.id} data-testid={`m-cart-line-${i.id}`} className="baked-card bg-card border border-border p-3 flex gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-secondary/40 shrink-0">
                {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        data-testid={`m-cart-badge-${i.id}`}
                        data-cart-module-badge={i.id}
                        className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: isShop ? "rgba(251,191,36,.15)" : "rgba(119,188,31,.15)",
                          color: isShop ? "#F59E0B" : "#77BC1F",
                          border: `1px solid ${isShop ? "rgba(251,191,36,.3)" : "rgba(119,188,31,.3)"}`,
                        }}
                      >
                        {isShop ? "SHOP" : "MART"}
                      </span>
                      <div className="text-sm font-semibold leading-snug line-clamp-2">{p.name}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{p.unit || "1 pc"}</div>
                    {isShop && i.variant?.attributes && Object.keys(i.variant.attributes).length > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {Object.entries(i.variant.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>
                    )}
                  </div>
                  <button data-testid={`m-cart-del-${i.id}`} onClick={() => removeItem(i.id)} className="w-7 h-7 rounded-full flex items-center justify-center bg-secondary/60 shrink-0 hover:bg-red-500/20 text-muted-foreground hover:text-red-500 motion-fast">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold">{formatMoney((i.line_total ?? p.price * i.quantity), p.currency, ccy)}</span>
                    {strike && strike > p.price && <span className="text-[11px] text-muted-foreground line-through">{formatMoney(strike * i.quantity, p.currency, ccy)}</span>}
                    {off > 0 && <span className="text-[10px] font-bold" style={{ color: "#77BC1F" }}>{off}%</span>}
                  </div>
                  <QuantityStepper value={i.quantity} onDecrement={() => i.quantity <= 1 ? removeItem(i.id) : updateItem(i.id, i.quantity - 1)} onIncrement={() => updateItem(i.id, i.quantity + 1)} size="sm" testid={`m-cart-qty-${i.id}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order note */}
      <div className="px-4 mt-4">
        <div className="text-[11px] text-muted-foreground mb-1.5">Add a note</div>
        <textarea data-testid="m-cart-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Leave delivery instructions or gift notes" className="w-full baked-input bg-secondary p-3 text-xs" />
      </div>

      {/* Order summary */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-sm font-bold mb-3">Order summary</div>
          <div className="space-y-2 text-xs">
            {hasMart && (
              <Row label={<span>MART subtotal <span className="text-[10px] text-muted-foreground">({cart.mart?.item_count ?? martItems.reduce((s,i)=>s+i.quantity,0)} items)</span></span>} value={formatMoney(martSubtotal, country?.currency, ccy)} />
            )}
            {hasShop && (
              <Row label={<span>SHOP subtotal <span className="text-[10px] text-muted-foreground">({cart.shop?.item_count ?? shopItems.reduce((s,i)=>s+i.quantity,0)} items)</span></span>} value={formatMoney(shopSubtotal, country?.currency, ccy)} />
            )}
            <Row label="Subtotal" value={formatMoney(subtotal, country?.currency, ccy)} />
            {hasMart && (
              <Row label="Delivery (MART)" value={deliveryFee === 0 ? <span style={{ color: "#77BC1F" }}>FREE</span> : formatMoney(deliveryFee, country?.currency, ccy)} />
            )}
            {hasShop && (
              <Row label="Shipping (SHOP)" value={<span className="text-[10px] text-muted-foreground">By seller</span>} />
            )}
            {savings > 0 && <Row label="Discount" value={<span style={{ color: "#77BC1F" }}>- {formatMoney(savings, country?.currency, ccy)}</span>} />}
            <div className="h-px bg-border my-2" />
            <div className="flex items-center justify-between text-sm font-bold pt-1">
              <span>Total (Incl. VAT)</span><span data-testid="m-cart-total">{formatMoney(total, country?.currency, ccy)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Min-order banner (only when below threshold) */}
      {!minOrderOk && (
        <div className="px-4 mt-3">
          <div data-testid="m-cart-min-order-warning" className="baked-card p-3 flex items-start gap-2.5 border" style={{ backgroundColor: "#FCC44C1a", borderColor: "#FCC44C88" }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#FCC44C" }} />
            <div className="text-[11px] leading-snug">
              Add <b style={{ color: "#FCC44C" }}>{formatMoney(shortfall, country?.currency, ccy)}</b> more to reach the <b>{formatMoney(minOrder, country?.currency, ccy)}</b> minimum order.
            </div>
          </div>
        </div>
      )}

      {/* Trust strip */}
      <div className="px-4 mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck size={11} /> Secure payments</span>
        <span className="flex items-center gap-1"><Info size={11} /> 24/7 support</span>
      </div>

      {/* Sticky checkout footer */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground">Total (Incl. VAT)</div>
            <div className="text-lg font-bold leading-none">{formatMoney(total, country?.currency, ccy)}</div>
          </div>
          <Button data-testid="m-cart-checkout" disabled={customer && !minOrderOk} onClick={goCheckout} className="baked-btn h-12 px-6 font-bold text-black disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: "#77BC1F" }}>
            <ShoppingCart size={16} className="mr-1.5" />
            {!customer ? "Login to Proceed" : (minOrderOk ? "Checkout" : "Add more")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);
