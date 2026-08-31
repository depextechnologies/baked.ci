/**
 * ShopProduct — SHOPbakēd PDP with variant picker (Slice 6).
 *
 * Route: /shopbaked/p/:productId
 *
 * The variant picker is generated from the resolved attribute schema
 * that comes back with the product payload. When every "differentiating"
 * attribute is chosen, we look for the matching variant → the customer
 * can add it to their cart.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ShoppingBag, ArrowLeft } from "lucide-react";

const isSelect = (a) => a.type === "select" || a.type === "multi_select";

export const ShopProduct = () => {
  const { productId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/shop/products/${productId}`)
      .then(({ data }) => !cancelled && setDetail(data))
      .catch((e) => !cancelled && setError(e?.response?.data?.detail || e.message));
    return () => { cancelled = true; };
  }, [productId]);

  // Attributes that actually differ across the product's variants are the
  // ones the picker must resolve (Colour/Storage on iPhone but not e.g.
  // Warranty which is constant across the SKUs).
  const pickerAttrs = useMemo(() => {
    if (!detail) return [];
    const keys = new Set();
    for (const v of detail.variants || []) {
      Object.keys(v.attributes || {}).forEach((k) => keys.add(k));
    }
    return (detail.attribute_schema || []).filter((a) => keys.has(a.key) && isSelect(a));
  }, [detail]);

  // Match a specific variant given the current selection. Falls back to
  // "closest match" for the first variant when the customer hasn't picked
  // every attribute yet — lets us always show a price.
  const activeVariant = useMemo(() => {
    if (!detail?.variants?.length) return null;
    const fullMatch = detail.variants.find((v) =>
      pickerAttrs.every((a) => (v.attributes?.[a.key] || "") === (chosen[a.key] || "")),
    );
    if (fullMatch) return fullMatch;
    // Show whichever variant matches the most currently-chosen attributes.
    if (Object.keys(chosen).length === 0) return detail.variants[0];
    const scored = detail.variants
      .map((v) => ({
        v, score: pickerAttrs.reduce((s, a) =>
          s + ((v.attributes?.[a.key] || "") === (chosen[a.key] || "") ? 1 : 0), 0),
      }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.v || detail.variants[0];
  }, [chosen, pickerAttrs, detail]);

  const fullyChosen = pickerAttrs.every((a) => chosen[a.key]);

  const addToCart = async () => {
    if (!activeVariant) return;
    setBusy(true);
    try {
      await api.post("/shop/cart/items", { variant_id: activeVariant.id, quantity: 1 });
      toast.success(`Added ${activeVariant.sku} to your cart`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 401) {
        toast.error("Please sign in to add items to your cart");
      } else if (detail) {
        toast.error(typeof detail === "string" ? detail : detail?.message || "Add to cart failed");
      } else {
        toast.error("Add to cart failed");
      }
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="text-sm text-neutral-400" data-testid="shopbaked-pdp-error">
        <Link to="/shopbaked" className="text-amber-300 hover:underline">← Back</Link>
        <p className="mt-4">Error: {typeof error === "string" ? error : "Product unavailable"}</p>
      </div>
    );
  }
  if (!detail) return <div className="text-sm text-neutral-500">Loading…</div>;

  return (
    <article data-testid="shopbaked-pdp">
      <Link to="/shopbaked" className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-300 mb-4"
            data-testid="shopbaked-pdp-back">
        <ArrowLeft size={12} /> Back to marketplace
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Left: images */}
        <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 aspect-square"
             data-testid="shopbaked-pdp-image">
          {(activeVariant?.images?.[0] || detail.images?.[0]) ? (
            <img src={activeVariant?.images?.[0] || detail.images?.[0]}
                 alt={detail.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-700 text-5xl">SHOP</div>
          )}
        </div>

        {/* Right: metadata + picker */}
        <div>
          <h1 className="text-3xl font-bold text-neutral-100" data-testid="shopbaked-pdp-title">
            {detail.title}
          </h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-amber-300" data-testid="shopbaked-pdp-price">
              {activeVariant ? `${activeVariant.price.toLocaleString()} ${activeVariant.currency}` : "—"}
            </span>
            {activeVariant?.compare_at_price && (
              <span className="text-sm line-through text-neutral-500">
                {activeVariant.compare_at_price.toLocaleString()} {activeVariant.currency}
              </span>
            )}
            {activeVariant && activeVariant.stock_qty > 0 ? (
              <span className="text-xs uppercase tracking-widest text-emerald-400 ml-auto"
                    data-testid="shopbaked-pdp-stock">in stock</span>
            ) : (
              <span className="text-xs uppercase tracking-widest text-red-400 ml-auto"
                    data-testid="shopbaked-pdp-stock">out of stock</span>
            )}
          </div>

          <p className="mt-4 text-neutral-400 leading-relaxed">
            {detail.description || "No description provided."}
          </p>

          {/* Variant picker */}
          {pickerAttrs.length > 0 && (
            <div className="mt-6 space-y-5" data-testid="shopbaked-pdp-picker">
              {pickerAttrs.map((a) => {
                const values = Array.from(new Set(
                  (detail.variants || []).map((v) => v.attributes?.[a.key]).filter(Boolean),
                ));
                return (
                  <div key={a.key}>
                    <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
                      {a.name}{a.unit ? ` (${a.unit})` : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => {
                        const on = chosen[a.key] === val;
                        const label = a.options?.find((o) => o.value === val)?.label || val;
                        return (
                          <button key={val}
                                  onClick={() => setChosen({ ...chosen, [a.key]: val })}
                                  data-testid={`shopbaked-pdp-attr-${a.key}-${val}`}
                                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                    on ? "bg-amber-400 text-neutral-950 border-amber-400 font-semibold"
                                       : "text-neutral-300 border-neutral-800 hover:border-amber-400/60"
                                  }`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={addToCart}
                  disabled={busy || !activeVariant || activeVariant.stock_qty <= 0}
                  data-testid="shopbaked-pdp-add-to-cart"
                  className="mt-8 pl-btn pl-btn-primary text-base px-6 py-3"
                  style={{ opacity: (!activeVariant || activeVariant.stock_qty <= 0) ? 0.5 : 1 }}>
            <ShoppingBag size={16} />
            {busy ? "Adding…" :
             !fullyChosen && pickerAttrs.length > 0 ? "Select options"
             : activeVariant?.stock_qty > 0 ? "Add to cart" : "Out of stock"}
          </button>

          <div className="mt-6 text-xs text-neutral-500 space-y-1">
            <div>SKU: <span className="font-mono">{activeVariant?.sku || "—"}</span></div>
            <div>Condition: {activeVariant?.condition || "new"}</div>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ShopProduct;
