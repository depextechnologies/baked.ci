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
  const subtotal = cart.subtotal || 0;
  const elig = checkOrderEligibility(subtotal, country);
  const { delivery_fee: deliveryFee, total, min_order: minOrder, shortfall, eligible: minOrderOk } = elig;

  const doCheckout = () => {
    if (!customer) { toast("Please login to continue"); return; }
    if (!minOrderOk) { toast.error(`Add ${formatMoney(shortfall, country.currency, country.currency_symbol)} more to reach the ${formatMoney(minOrder, country.currency, country.currency_symbol)} minimum order`); return; }
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
          {items.map((it) => (
            <div key={it.id} data-testid={CART.itemRow(it.id)} className="p-4 flex items-center gap-4">
              <img src={it.product.image} alt={it.product.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{it.product.name}</div>
                <div className="text-[11px] text-muted-foreground">{it.product.unit} · {it.product.brand}</div>
                <div className="text-sm font-bold mt-1">{formatMoney(it.product.price, it.product.currency, it.product.currency_symbol)}</div>
              </div>
              <div className="flex items-center gap-1 baked-btn overflow-hidden" style={{ backgroundColor: "#77BC1F" }}>
                <button onClick={() => (it.quantity <= 1 ? removeItem(it.id) : updateItem(it.id, it.quantity - 1))} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10"><Minus size={14} /></button>
                <span className="text-xs font-bold text-[#0a1200] min-w-[20px] text-center">{it.quantity}</span>
                <button onClick={() => updateItem(it.id, it.quantity + 1)} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10"><Plus size={14} /></button>
              </div>
              <div className="text-sm font-bold min-w-[80px] text-right">{formatMoney(it.line_total, it.product.currency, it.product.currency_symbol)}</div>
              <button onClick={() => removeItem(it.id)} className="text-muted-foreground hover:text-red-500 motion-fast"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <button onClick={clear} className="text-xs text-muted-foreground mt-3 hover:text-red-500 motion-fast">Clear cart</button>
      </div>

      <aside>
        <div className="baked-card bg-card border border-border p-5 sticky top-24">
          <div className="text-sm font-semibold mb-4">Order Summary</div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground" data-testid={CART.subtotal}>Subtotal</span><span className="font-medium">{formatMoney(subtotal, country.currency, country.currency_symbol)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span className="font-medium">{deliveryFee === 0 ? "FREE" : formatMoney(deliveryFee, country.currency, country.currency_symbol)}</span></div>
            <div className="h-px bg-border my-2" />
            <div className="flex justify-between text-base"><span className="font-semibold">Total</span><span className="font-bold">{formatMoney(total, country.currency, country.currency_symbol)}</span></div>
          </div>
          {!minOrderOk && (
            <div data-testid="cart-min-order-warning" className="text-[11px] mt-3 p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
              Add <b>{formatMoney(shortfall, country.currency, country.currency_symbol)}</b> more to reach the {formatMoney(minOrder, country.currency, country.currency_symbol)} minimum.
            </div>
          )}
          <Button data-testid={CART.checkoutBtn} disabled={!minOrderOk} onClick={doCheckout} className="w-full mt-5 h-12 baked-btn font-semibold text-black disabled:opacity-60" style={{ backgroundColor: "#77BC1F" }}>
            Checkout
          </Button>
        </div>
      </aside>
    </div>
  );
};
