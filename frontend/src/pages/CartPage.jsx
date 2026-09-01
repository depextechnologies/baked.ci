import React from "react";
import { useNavigate } from "react-router-dom";
import { useApp, useCart, useAuth } from "../contexts/BakedContexts";
import { formatMoney } from "../lib/i18n";
import { checkOrderEligibility } from "../lib/checkout";
import { CART } from "../constants/testIds";
import { Button } from "../components/ui/button";
import { Plus, Minus, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

export const CartPage = () => {
  const { country } = useApp();
  const { cart, updateItem, removeItem, clear } = useCart();
  const { customer } = useAuth();
  const navigate = useNavigate();
  const items = cart.items || [];
  const unavailable = cart.unavailable_items || [];
  const hasUnavailable = unavailable.length > 0;
  // Split by module: min-order + delivery fee are MART-only concerns.
  // SHOP items ship from sellers and don't count toward the MART min-order.
  const martSubtotal = cart.mart?.subtotal ?? items.filter((i) => i.module !== "shop").reduce((s, i) => s + (i.line_total || (i.product?.price || 0) * i.quantity), 0);
  const shopSubtotal = cart.shop?.subtotal ?? items.filter((i) => i.module === "shop").reduce((s, i) => s + (i.line_total || 0), 0);
  const martCount = cart.mart?.item_count ?? items.filter((i) => i.module !== "shop").reduce((s, i) => s + i.quantity, 0);
  const shopCount = cart.shop?.item_count ?? items.filter((i) => i.module === "shop").reduce((s, i) => s + i.quantity, 0);
  const hasMart = martCount > 0;
  const hasShop = shopCount > 0;
  const elig = checkOrderEligibility(martSubtotal, country);
  const { delivery_fee: deliveryFee, min_order: minOrder, shortfall, eligible: martEligible } = elig;
  // If cart is SHOP-only we skip the MART min-order gate (SHOP has no min).
  const minOrderOk = hasMart ? martEligible : true;
  const total = (hasMart ? elig.total : 0) + shopSubtotal;
  const subtotal = martSubtotal + shopSubtotal;

  const doCheckout = () => {
    if (!customer) { toast("Please login to continue"); return; }
    if (hasUnavailable) { toast.error("Remove items marked 'Coming soon' before checking out"); return; }
    if (!minOrderOk) { toast.error(`Add ${formatMoney(shortfall, country.currency, country.currency_symbol)} more to reach the ${formatMoney(minOrder, country.currency, country.currency_symbol)} minimum order`); return; }
    // Always route to the global /checkout — it now handles mixed and
    // SHOP-only carts internally (per Fixing_Prompt.docx §2).
    navigate("/checkout");
  };

  if (items.length === 0) {
    return (
      <div className="baked-container my-16 text-center" data-testid={CART.emptyState}>
        <div className="w-24 h-24 rounded-full bg-secondary/60 mx-auto flex items-center justify-center mb-4">
          <ShoppingCart size={36} className="text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Your cart is empty</h2>
        <p className="text-sm text-muted-foreground mt-2">Browse products and add your favourites.</p>
        <Button onClick={() => navigate("/")} className="mt-6 baked-btn h-11 px-6 font-semibold text-black" style={{ backgroundColor: "#77BC1F" }}>
          Start shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="baked-container my-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-3xl font-bold mb-6">Your Cart <span className="text-muted-foreground text-lg font-normal">({cart.item_count} items)</span></h1>
        <div className="baked-card bg-card border border-border divide-y divide-border">
          {items.map((it) => {
            const isShop = it.module === "shop";
            const productLike = isShop
              ? {
                  name: it.title || it.product?.title,
                  image: it.images?.[0] || "",
                  unit: it.variant?.sku || "",
                  brand: "SHOPbakēd seller",
                  price: it.unit_price ?? it.variant?.price ?? 0,
                  currency: it.currency || it.variant?.currency,
                  currency_symbol: it.currency || "XOF",
                  is_stocked_locally: true,
                  master_price: null,
                }
              : it.product;
            const stockedLocal = productLike?.is_stocked_locally !== false;
            const masterPrice = productLike?.master_price;
            const showStrikethrough = masterPrice && Number(masterPrice) > Number(productLike?.price);
            return (
            <div key={it.id} data-testid={CART.itemRow(it.id)} className="p-4 flex items-center gap-4" style={{ opacity: stockedLocal ? 1 : 0.65 }}>
              <img src={productLike?.image} alt={productLike?.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold truncate">{productLike?.name}</div>
                  <span
                    className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: isShop ? "rgba(251,191,36,.15)" : "rgba(119,188,31,.15)",
                      color: isShop ? "#F59E0B" : "#77BC1F",
                      border: `1px solid ${isShop ? "rgba(251,191,36,.3)" : "rgba(119,188,31,.3)"}`,
                    }}
                    data-testid={`cart-module-badge-${it.id}`}
                  >
                    {isShop ? "SHOP" : "MART"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">{productLike?.unit} · {productLike?.brand}</div>
                {isShop && it.variant?.attributes && Object.keys(it.variant.attributes).length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {Object.entries(it.variant.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <div className="text-sm font-bold">{formatMoney(productLike?.price, productLike?.currency, productLike?.currency_symbol)}</div>
                  {showStrikethrough && (
                    <div className="text-[11px] text-muted-foreground line-through">{formatMoney(masterPrice, productLike?.currency, productLike?.currency_symbol)}</div>
                  )}
                </div>
                {!stockedLocal && (
                  <div className="text-[11px] mt-1 text-amber-500" data-testid={`cart-unavailable-${it.id}`}>
                    Coming soon to your area — please remove
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 baked-btn overflow-hidden" style={{ backgroundColor: "#77BC1F" }}>
                <button onClick={() => (it.quantity <= 1 ? removeItem(it.id) : updateItem(it.id, it.quantity - 1))} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10"><Minus size={14} /></button>
                <span className="text-xs font-bold text-[#0a1200] min-w-[20px] text-center">{it.quantity}</span>
                <button onClick={() => updateItem(it.id, it.quantity + 1)} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10"><Plus size={14} /></button>
              </div>
              <div className="text-sm font-bold min-w-[80px] text-right">{formatMoney(it.line_total, productLike?.currency, productLike?.currency_symbol)}</div>
              <button onClick={() => removeItem(it.id)} className="text-muted-foreground hover:text-red-500 motion-fast"><Trash2 size={16} /></button>
            </div>
            );
          })}
        </div>
        <button onClick={clear} className="text-xs text-muted-foreground mt-3 hover:text-red-500 motion-fast">Clear cart</button>
      </div>

      <aside>
        <div className="baked-card bg-card border border-border p-5 sticky top-24">
          <div className="text-sm font-semibold mb-4">Order Summary</div>
          <div className="grid gap-2 text-sm">
            {hasMart && (
              <div className="flex justify-between"><span className="text-muted-foreground" data-testid="cart-summary-mart-subtotal">MART subtotal <span className="text-[10px] text-muted-foreground">({martCount} items)</span></span><span className="font-medium">{formatMoney(martSubtotal, country.currency, country.currency_symbol)}</span></div>
            )}
            {hasShop && (
              <div className="flex justify-between"><span className="text-muted-foreground" data-testid="cart-summary-shop-subtotal">SHOP subtotal <span className="text-[10px] text-muted-foreground">({shopCount} items)</span></span><span className="font-medium">{formatMoney(shopSubtotal, country.currency, country.currency_symbol)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground" data-testid={CART.subtotal}>Subtotal</span><span className="font-medium">{formatMoney(subtotal, country.currency, country.currency_symbol)}</span></div>
            {hasMart && (
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery (MART)</span><span className="font-medium">{deliveryFee === 0 ? "FREE" : formatMoney(deliveryFee, country.currency, country.currency_symbol)}</span></div>
            )}
            {hasShop && (
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping (SHOP)</span><span className="text-[11px] text-muted-foreground">Calculated by seller</span></div>
            )}
            <div className="h-px bg-border my-2" />
            <div className="flex justify-between text-base"><span className="font-semibold">Total</span><span className="font-bold">{formatMoney(total, country.currency, country.currency_symbol)}</span></div>
          </div>
          {hasUnavailable && (
            <div data-testid="cart-unavailable-warning" className="text-[12px] mt-3 p-3 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <b>{unavailable.length} item(s) not available in your area yet</b> — MARTbakēd is coming soon to more stores. Please remove them to continue.
            </div>
          )}
          {!minOrderOk && (
            <div data-testid="cart-min-order-warning" className="text-[11px] mt-3 p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
              Add <b>{formatMoney(shortfall, country.currency, country.currency_symbol)}</b> more to reach the {formatMoney(minOrder, country.currency, country.currency_symbol)} minimum.
            </div>
          )}
          <Button data-testid={CART.checkoutBtn} disabled={!minOrderOk || hasUnavailable} onClick={doCheckout} className="w-full mt-5 h-12 baked-btn font-semibold text-black disabled:opacity-60" style={{ backgroundColor: "#77BC1F" }}>
            Checkout
          </Button>
        </div>
      </aside>
    </div>
  );
};
