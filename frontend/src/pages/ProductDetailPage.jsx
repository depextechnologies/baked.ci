import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useApp, useCart } from "../contexts/BakedContexts";
import { PRODUCT } from "../constants/testIds";
import { formatMoney } from "../lib/i18n";
import { useLocalePath } from "../i18n/routes";
import { Button } from "../components/ui/button";
import { Plus, Minus, Star, Truck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "../components/mart/ProductCard";
import { ProductGallery } from "../components/mart/ProductGallery";
import { ProductDetails } from "../components/mart/ProductDetails";

export const ProductDetailPage = () => {
  const { t } = useTranslation("customer");
  const { id } = useParams();
  const { country } = useApp();
  const { cart, addItem, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const path = useLocalePath();
  const [p, setP] = useState(null);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    api.get(`/mart/products/${id}`).then(r => setP(r.data)).catch(() => setP(null));
  }, [id]);

  useEffect(() => {
    if (!p) return;
    api.get(`/mart/products?country=${country.code}&category=${p.category_slug}&limit=8`).then(r => setRelated(r.data.filter(x => x.id !== p.id)));
  }, [p, country.code]);

  if (!p) return <div className="baked-container my-16 text-center text-muted-foreground">Loading…</div>;

  const inCart = cart.items?.find((i) => i.product_id === p.id);
  const qty = inCart?.quantity || 0;

  return (
    <div className="baked-container my-8">
      <button onClick={() => navigate(-1)} className="text-xs text-muted-foreground mb-4 hover:text-foreground">← Back</button>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,480px)_1fr] items-start">
        <div className="relative">
          <ProductGallery image={p.image} images={p.images} name={p.name} />
          {/* Legacy testid for existing tests — points at the primary image */}
          <img src={p.image} alt="" data-testid={PRODUCT.detailImg} className="sr-only" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{p.brand}</div>
          <h1 data-testid={PRODUCT.detailName} className="text-3xl font-bold mt-1">{p.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Star size={14} className="fill-current text-yellow-400" /> {p.rating}</span>
            <span>·</span>
            <span>{p.review_count} reviews</span>
            <span>·</span>
            <span>{p.unit}</span>
          </div>
          <div className="mt-6 flex items-baseline gap-3">
            <div data-testid={PRODUCT.detailPrice} className="text-4xl font-bold">{formatMoney(p.price, p.currency, p.currency_symbol)}</div>
            {p.was_price && (
              <div className="text-lg text-muted-foreground line-through">{formatMoney(p.was_price, p.currency, p.currency_symbol)}</div>
            )}
            {p.badge && <span className="badge-off ml-2">{p.badge}</span>}
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-xl">{p.description}</p>

          <div className="mt-6 flex items-center gap-3">
            {qty === 0 ? (
              <Button
                data-testid={PRODUCT.detailAddBtn}
                onClick={async () => { await addItem(p, 1); toast(`${p.name} added to cart`); }}
                className="h-12 px-8 baked-btn font-semibold text-black"
                style={{ backgroundColor: "#77BC1F" }}
              >
                + {t("product.add_to_cart")}
              </Button>
            ) : (
              <div className="flex items-center gap-1 baked-btn overflow-hidden" style={{ backgroundColor: "#77BC1F" }}>
                <button onClick={async () => qty <= 1 ? removeItem(inCart.id) : updateItem(inCart.id, qty - 1)} className="px-3 py-3 text-[#0a1200] hover:bg-black/10 motion-fast"><Minus size={16} /></button>
                <span className="text-sm font-bold text-[#0a1200] min-w-[24px] text-center">{qty}</span>
                <button onClick={() => updateItem(inCart.id, qty + 1)} className="px-3 py-3 text-[#0a1200] hover:bg-black/10 motion-fast"><Plus size={16} /></button>
              </div>
            )}
            <Button variant="outline" onClick={() => navigate(path("cart"))} className="h-12 px-6 baked-btn border-border">View cart</Button>
          </div>

          <div className="mt-8 grid gap-3 max-w-md">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Truck size={18} style={{ color: "#77BC1F" }} /> Delivered in {country.delivery_eta_min}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <ShieldCheck size={18} style={{ color: "#77BC1F" }} /> Fresh guarantee — easy returns
            </div>
          </div>

          <ProductDetails product={p} />
        </div>
      </div>

      {related.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mt-12 mb-4">{t("product.you_may_also_like")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {related.slice(0, 6).map(r => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
