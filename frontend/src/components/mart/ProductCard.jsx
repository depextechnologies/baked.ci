import React from "react";
import { PRODUCT } from "../../constants/testIds";
import { useCart } from "../../contexts/BakedContexts";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "../../lib/i18n";
import { Plus, Minus } from "lucide-react";
import { toast } from "sonner";

export const ProductCard = ({ product }) => {
  const { cart, addItem, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const inCart = cart.items?.find((i) => i.product_id === product.id);
  const qty = inCart?.quantity || 0;
  const moduleGreen = "#77BC1F";

  const handleAdd = async (e) => {
    e.stopPropagation();
    await addItem(product, 1);
    toast(`${product.name} added`, { description: `${formatMoney(product.price, product.currency, product.currency_symbol)}` });
  };
  const handleInc = async (e) => { e.stopPropagation(); if (inCart) await updateItem(inCart.id, qty + 1); };
  const handleDec = async (e) => {
    e.stopPropagation();
    if (!inCart) return;
    if (qty <= 1) await removeItem(inCart.id);
    else await updateItem(inCart.id, qty - 1);
  };

  return (
    <div
      data-testid={PRODUCT.card(product.id)}
      onClick={() => navigate(`/products/${product.id}`)}
      className="baked-card bg-card border border-border overflow-hidden group cursor-pointer motion-normal hover:border-[#77BC1F]/50 hover:shadow-[0_0_0_1px_#77BC1F22] flex flex-col"
    >
      <div className="relative aspect-square bg-secondary/40">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover motion-normal group-hover:scale-105" loading="lazy" />
        {product.badge && (
          <div className="absolute top-2 left-2 badge-off">{product.badge}</div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <div className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{product.name}</div>
        <div className="text-[11px] text-muted-foreground">{product.unit}</div>
        <div className="flex items-center justify-between mt-2">
          <div>
            <div className="text-sm font-bold">{formatMoney(product.price, product.currency, product.currency_symbol)}</div>
            {product.was_price && (
              <div className="text-[11px] text-muted-foreground line-through">{formatMoney(product.was_price, product.currency, product.currency_symbol)}</div>
            )}
          </div>
          {qty === 0 ? (
            <button
              data-testid={PRODUCT.addBtn(product.id)}
              onClick={handleAdd}
              className="baked-btn px-3 py-1.5 text-xs font-bold motion-fast"
              style={{ backgroundColor: moduleGreen, color: "#0a1200" }}
            >
              + Add
            </button>
          ) : (
            <div className="flex items-center gap-1 baked-btn overflow-hidden" style={{ backgroundColor: moduleGreen }}>
              <button data-testid={PRODUCT.qtyDecBtn(product.id)} onClick={handleDec} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10 motion-fast"><Minus size={14} /></button>
              <span className="text-xs font-bold text-[#0a1200] min-w-[18px] text-center">{qty}</span>
              <button data-testid={PRODUCT.qtyIncBtn(product.id)} onClick={handleInc} className="px-2 py-1.5 text-[#0a1200] hover:bg-black/10 motion-fast"><Plus size={14} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
