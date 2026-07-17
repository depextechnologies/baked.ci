import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useApp, useCart } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { QuantityStepper } from "./QuantityStepper";
import { toast } from "sonner";

/**
 * MobileProductCard — Blinkit / MARTbaked style vertical card:
 *   [ image ][+ADD or stepper]
 *   ETA · Name · Unit · Price row (discounted + strike)
 */
export const MobileProductCard = ({ product, layout = "grid" }) => {
  const nav = useNavigate();
  const { country } = useApp();
  const { cart, addItem, updateItem, removeItem } = useCart();

  const line = cart.items?.find((i) => i.product_id === product.id || i.product?.id === product.id);
  const inCart = line?.quantity || 0;
  const ccy = product.currency_symbol || product.currency || country?.currency_symbol;
  const eta = product.eta_min || country?.delivery_eta_min || "10 min";
  const strike = product.compare_at_price || product.original_price;
  const off = strike && strike > product.price ? Math.round(((strike - product.price) / strike) * 100) : 0;

  const onAdd = async (e) => {
    e.stopPropagation();
    try { await addItem(product, 1); } catch { toast.error("Could not add to cart"); }
  };
  const onDec = async (e) => {
    e.stopPropagation();
    if (!line) return;
    if (inCart <= 1) { await removeItem(line.id); } else { await updateItem(line.id, inCart - 1); }
  };
  const onInc = async (e) => {
    e.stopPropagation();
    if (line) await updateItem(line.id, inCart + 1);
    else await addItem(product, 1);
  };

  if (layout === "row") {
    return (
      <div onClick={() => nav(`/products/${product.id}`)} className="flex gap-3 py-3 border-b border-border active:opacity-70 motion-fast">
        <div className="w-24 h-24 rounded-xl overflow-hidden bg-secondary shrink-0 relative">
          {product.image && <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />}
          {off > 0 && <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>{off}% OFF</span>}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground">⚡ {eta}</div>
            <div className="text-sm font-semibold mt-0.5 line-clamp-2">{product.name}</div>
            <div className="text-[11px] text-muted-foreground">{product.unit || "1 pc"}</div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <span className="text-sm font-bold">{formatMoney(product.price, product.currency, ccy)}</span>
              {strike && strike > product.price && <span className="ml-1.5 text-[11px] text-muted-foreground line-through">{formatMoney(strike, product.currency, ccy)}</span>}
            </div>
            {inCart > 0
              ? <QuantityStepper value={inCart} onDecrement={onDec} onIncrement={onInc} size="sm" testid={`m-pc-qty-${product.id}`} />
              : <button data-testid={`m-pc-add-${product.id}`} onClick={onAdd} className="baked-btn px-3 py-1.5 text-xs font-bold border-2 motion-fast active:scale-95" style={{ borderColor: "#77BC1F", color: "#77BC1F" }}>ADD</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`m-pc-${product.id}`}
      onClick={() => nav(`/products/${product.id}`)}
      className="baked-card bg-card border border-border overflow-hidden motion-fast active:scale-[0.98]"
    >
      <div className="relative aspect-square bg-secondary/40 overflow-hidden">
        {product.image && <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />}
        {off > 0 && (
          <span className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>
            {off}% OFF
          </span>
        )}
        <div className="absolute bottom-1.5 right-1.5">
          {inCart > 0
            ? <QuantityStepper value={inCart} onDecrement={onDec} onIncrement={onInc} size="sm" testid={`m-pc-qty-${product.id}`} />
            : <button data-testid={`m-pc-add-${product.id}`} onClick={onAdd} className="baked-btn px-3 h-8 text-xs font-bold bg-background border-2 flex items-center gap-0.5 motion-fast active:scale-95" style={{ borderColor: "#77BC1F", color: "#77BC1F" }}><Plus size={12} strokeWidth={3} /> ADD</button>}
        </div>
      </div>
      <div className="p-2">
        <div className="text-[9px] text-muted-foreground flex items-center gap-1">⚡ {eta}</div>
        <div className="text-[13px] font-semibold mt-0.5 leading-tight line-clamp-2 min-h-[32px]">{product.name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{product.unit || "1 pc"}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{formatMoney(product.price, product.currency, ccy)}</span>
          {strike && strike > product.price && <span className="text-[10px] text-muted-foreground line-through">{formatMoney(strike, product.currency, ccy)}</span>}
        </div>
      </div>
    </div>
  );
};
