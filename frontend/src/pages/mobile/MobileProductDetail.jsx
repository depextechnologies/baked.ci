import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp, useCart } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { MobileProductCard } from "../../components/mobile/MobileProductCard";
import { QuantityStepper } from "../../components/mobile/QuantityStepper";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Share2, Heart, ShoppingCart, Zap, Leaf, HandHeart, Truck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ProductGallery } from "../../components/mart/ProductGallery";
import { ProductDetails } from "../../components/mart/ProductDetails";

const BADGES = [
  { icon: Leaf, label: "Farm fresh" },
  { icon: HandHeart, label: "Handpicked" },
  { icon: ShieldCheck, label: "Quality guaranteed" },
  { icon: Zap, label: "Fast delivery" },
];

export const MobileProductDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { country } = useApp();
  const { cart, addItem, updateItem, removeItem } = useCart();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [expandDesc, setExpandDesc] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/mart/products/${id}`);
        setProduct(data);
        const { data: r } = await api.get(`/mart/products?country=${country.code}&category=${data.category_slug}&limit=8`);
        setRelated((r || []).filter((p) => p.id !== id));
      } catch (e) { toast.error("Product not found"); nav(-1); }
    })();
    // eslint-disable-next-line
  }, [id]);

  const line = useMemo(() => cart.items?.find((i) => i.product_id === id || i.product?.id === id), [cart, id]);
  const inCart = line?.quantity || 0;

  if (!product) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const ccy = product.currency_symbol || product.currency || country?.currency_symbol;
  const strike = product.compare_at_price || product.original_price;
  const off = strike && strike > product.price ? Math.round(((strike - product.price) / strike) * 100) : 0;
  const eta = product.eta_min || country?.delivery_eta_min || "10 min";

  const onAdd = async () => { try { await addItem(product, 1); toast.success("Added to cart"); } catch { toast.error("Failed"); } };
  const onDec = async () => { if (!line) return; if (inCart <= 1) await removeItem(line.id); else await updateItem(line.id, inCart - 1); };
  const onInc = async () => { if (line) await updateItem(line.id, inCart + 1); else await onAdd(); };

  return (
    <div className="pb-32">
      {/* Floating header (image gallery behind) */}
      <div className="relative">
        <div className="relative">
          <ProductGallery image={product.image} images={product.images} name={product.name} />
          {off > 0 && (
            <div className="absolute top-3 left-3 z-10 baked-chip px-3 py-1 text-xs font-bold text-black pointer-events-none" style={{ backgroundColor: "#77BC1F" }}>{off}% OFF</div>
          )}
        </div>
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
          <button data-testid="m-pd-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
            <ArrowLeft size={16} />
          </button>
          <div className="flex gap-2 pointer-events-auto">
            <button className="w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center" aria-label="Wishlist"><Heart size={16} /></button>
            <button className="w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center" aria-label="Share"><Share2 size={16} /></button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pt-4">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">⚡ Express delivery in {eta}</div>
        <h1 className="text-xl font-bold mt-1 leading-tight">{product.name}</h1>
        <div className="text-sm text-muted-foreground mt-0.5">{product.unit || "1 pc"} · {product.brand}</div>

        <div className="flex items-baseline gap-2 mt-3">
          <span className="text-2xl font-bold">{formatMoney(product.price, product.currency, ccy)}</span>
          {strike && strike > product.price && <span className="text-sm text-muted-foreground line-through">{formatMoney(strike, product.currency, ccy)}</span>}
          {off > 0 && <span className="text-xs font-bold" style={{ color: "#77BC1F" }}>{off}% off</span>}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">(Inclusive of all taxes)</div>
      </div>

      {/* Badges strip */}
      <div className="mt-4 px-4">
        <div className="grid grid-cols-4 gap-2">
          {BADGES.map((b) => { const I = b.icon; return (
            <div key={b.label} className="flex flex-col items-center gap-1 text-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><I size={14} /></div>
              <div className="text-[9px] text-muted-foreground leading-tight">{b.label}</div>
            </div>
          );})}
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <div className="px-4 mt-5">
          <div className="text-sm font-semibold mb-1.5">About this product</div>
          <div className={`text-xs text-muted-foreground leading-relaxed ${expandDesc ? "" : "line-clamp-3"}`}>{product.description}</div>
          {product.description.length > 120 && (
            <button onClick={() => setExpandDesc((x) => !x)} className="text-xs font-semibold mt-1" style={{ color: "#77BC1F" }}>
              {expandDesc ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Full product details — dynamic, only renders non-empty fields */}
      <div className="px-4">
        <ProductDetails product={product} />
      </div>

      {/* Quantity selector card */}
      <div className="px-4 mt-5">
        <div className="baked-card bg-card border border-border p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Select quantity</div>
            <div className="text-sm font-bold mt-0.5">{formatMoney(product.price * Math.max(1, inCart), product.currency, ccy)}</div>
          </div>
          <QuantityStepper value={Math.max(1, inCart)} onDecrement={onDec} onIncrement={onInc} size="lg" testid="m-pd-qty" />
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <div className="mt-6">
          <div className="px-4 flex items-center justify-between mb-2">
            <div className="text-sm font-bold">You may also like</div>
            <button onClick={() => nav(`/categories/${product.category_slug}`)} className="text-xs font-semibold" style={{ color: "#77BC1F" }}>View all</button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
            {related.slice(0, 8).map((p) => (
              <div key={p.id} className="shrink-0 w-40">
                <MobileProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Add / Buy footer — sits above the shell's bottom nav */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button data-testid="m-pd-add" onClick={onAdd} className="baked-btn h-12 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            <ShoppingCart size={16} className="mr-1.5" /> Add to Cart
          </Button>
          <Button data-testid="m-pd-buy" onClick={async () => { await onAdd(); nav("/checkout"); }} variant="secondary" className="baked-btn h-12 font-bold" style={{ backgroundColor: "#0a1200", color: "#77BC1F", borderColor: "#77BC1F", borderWidth: 1 }}>
            <Zap size={16} className="mr-1.5" fill="#77BC1F" /> Buy Now
          </Button>
        </div>
      </div>
    </div>
  );
};
