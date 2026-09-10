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
import React from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useCart } from "@/contexts/BakedContexts";
import { ShoppingBag, ArrowLeft } from "lucide-react";
import { pickProductTitle, pickProductDescription } from "../lib/i18nCms";

const isSelect = (a) => a.type === "select" || a.type === "multi_select";

export const ShopProduct = ({ basePath = "/shop" }) => {
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language === "fr" ? "fr" : "en";
  const { productId } = useParams();
  const { addShopVariant } = useCart() || {};
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
      // Route through the shared CartContext. For guests the context stores
      // a snapshot in localStorage; for authed users it POSTs to the server.
      // Login is deferred to Proceed-to-Checkout per Fixing_Prompt §3.
      const productTitle = pickProductTitle(detail, lang);
      await addShopVariant(activeVariant.id, 1, {
        product_id: detail.id,
        title: productTitle + (activeVariant.title_suffix ? ` — ${activeVariant.title_suffix}` : ""),
        image: (activeVariant.images && activeVariant.images[0]) || detail.images?.[0] || null,
        price: activeVariant.price,
        compare_at_price: activeVariant.compare_at_price,
        currency: activeVariant.currency || "XOF",
        variant_attributes: activeVariant.attributes || {},
        sku: activeVariant.sku,
      });
      toast.success(t("shop.added_to_cart", { sku: activeVariant.sku }));
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail) toast.error(typeof detail === "string" ? detail : detail?.message || t("shop.add_to_cart_failed"));
      else toast.error(e?.message || t("shop.add_to_cart_failed"));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="text-sm text-neutral-400" data-testid="shopbaked-pdp-error">
        <Link to={basePath} className="text-amber-300 hover:underline">← {t("shop.back_aria")}</Link>
        <p className="mt-4">{t("shop.error_prefix", { msg: typeof error === "string" ? error : t("shop.product_unavailable") })}</p>
      </div>
    );
  }
  if (!detail) return <div className="text-sm text-neutral-500">{t("shop.loading")}</div>;

  return (
    <article className="mx-auto max-w-7xl px-4 sm:px-6 py-6" data-testid="shopbaked-pdp">
      <Link to={basePath} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-300 mb-4"
            data-testid="shopbaked-pdp-back">
        <ArrowLeft size={12} /> {t("shop.back_to_marketplace")}
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <ProductImageZoom
          src={activeVariant?.images?.[0] || detail.images?.[0]}
          alt={pickProductTitle(detail, lang)}
        />

        {/* Right: metadata + picker */}
        <div>
          <h1 className="text-3xl font-bold text-neutral-100" data-testid="shopbaked-pdp-title">
            {pickProductTitle(detail, lang)}
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
                    data-testid="shopbaked-pdp-stock">{t("shop.in_stock")}</span>
            ) : (
              <span className="text-xs uppercase tracking-widest text-red-400 ml-auto"
                    data-testid="shopbaked-pdp-stock">{t("shop.out_of_stock")}</span>
            )}
          </div>

          <p className="mt-4 text-neutral-400 leading-relaxed">
            {pickProductDescription(detail, lang) || t("shop.no_description")}
          </p>

          {/* Variant picker */}
          {pickerAttrs.length > 0 && (
            <div className="mt-6 space-y-5" data-testid="shopbaked-pdp-picker">
              {pickerAttrs.map((a) => {
                const values = Array.from(new Set(
                  (detail.variants || []).map((v) => v.attributes?.[a.key]).filter(Boolean),
                ));
                const attrName = t(`shop.attr_name.${a.key}`, { defaultValue: a.name });
                return (
                  <div key={a.key}>
                    <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
                      {attrName}{a.unit ? ` (${a.unit})` : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => {
                        const on = chosen[a.key] === val;
                        const rawLabel = a.options?.find((o) => o.value === val)?.label || val;
                        // For colour attribute, look up localised colour name.
                        const label = a.key === "colour"
                          ? t(`shop.colour_label.${String(val).toLowerCase()}`, { defaultValue: rawLabel })
                          : rawLabel;
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
            {busy ? t("shop.adding") :
             !fullyChosen && pickerAttrs.length > 0 ? t("shop.select_options")
             : activeVariant?.stock_qty > 0 ? t("shop.add_to_cart") : t("shop.out_of_stock")}
          </button>

          <div className="mt-6 text-xs text-neutral-500 space-y-1">
            <div>{t("shop.sku_label")}: <span className="font-mono">{activeVariant?.sku || "—"}</span></div>
            <div>{t("shop.condition_label")}: {t(`shop.condition_value.${activeVariant?.condition || "new"}`, { defaultValue: activeVariant?.condition || t("shop.condition_new") })}</div>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ShopProduct;

// ---------------------------------------------------------------------------
// ProductImageZoom — MART-style hover zoom. On desktop, moving the mouse
// over the image reveals a magnified pane anchored to the pointer. On
// touch/mobile the extra pane is skipped (native pinch-to-zoom takes over).
// ---------------------------------------------------------------------------
const ProductImageZoom = ({ src, alt }) => {
  const { t } = useTranslation("customer");
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const wrapRef = React.useRef(null);
  const canZoom = typeof window !== "undefined"
    && window.matchMedia && !window.matchMedia("(pointer: coarse)").matches;

  const onMove = (e) => {
    if (!canZoom || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };

  if (!src) {
    return (
      <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 aspect-square flex items-center justify-center text-neutral-700 text-5xl"
           data-testid="shopbaked-pdp-image">
        SHOP
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => canZoom && setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={onMove}
      className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 aspect-square relative"
      data-testid="shopbaked-pdp-image"
      style={{ cursor: canZoom ? "zoom-in" : "default" }}
    >
      <img
        src={src}
        alt={alt}
        data-testid="shopbaked-pdp-image-img"
        className="w-full h-full object-cover transition-transform duration-100 ease-out"
        style={{
          transform: hover ? "scale(2.2)" : "scale(1)",
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
        draggable={false}
      />
      {canZoom && !hover && (
        <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest bg-black/60 text-neutral-200 px-2 py-1 rounded">
          {t("shop.hover_to_zoom")}
        </span>
      )}
    </div>
  );
};
