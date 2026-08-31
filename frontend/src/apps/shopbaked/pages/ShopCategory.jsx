/**
 * ShopCategory — SHOPbakēd category landing (Slice 6).
 *
 * Route: /shopbaked/c/:categorySlug
 * Renders subcategory pills + a product grid filtered to the category.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { ProductCard } from "./ShopHome";

export const ShopCategory = ({ locale = "fr" }) => {
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const activeSub = params.get("sub");

  const [cat, setCat] = useState(null);
  const [products, setProducts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/shop/catalogue?country=CI").then(({ data }) => {
      if (cancelled) return;
      setCat(data.find((c) => c.slug === categorySlug) || null);
    });
    return () => { cancelled = true; };
  }, [categorySlug]);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ country: "CI", category: categorySlug, limit: "24" });
    if (activeSub) q.set("subcategory", activeSub);
    api.get(`/shop/products?${q.toString()}`).then(({ data }) => {
      if (!cancelled) setProducts(data || []);
    });
    return () => { cancelled = true; };
  }, [categorySlug, activeSub]);

  return (
    <div data-testid="shopbaked-category">
      <div className="mb-6">
        <Link to="/shopbaked" className="text-xs text-neutral-500 hover:text-amber-300" data-testid="shopbaked-category-back">
          ← All categories
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-neutral-100">
          {cat ? (locale === "fr" ? cat.name_fr : cat.name_en) : categorySlug}
        </h1>
      </div>

      {cat && (cat.subcategories?.length || 0) > 0 && (
        <div className="flex flex-wrap gap-2 mb-8" data-testid="shopbaked-sub-rail">
          <button
            onClick={() => { const p = new URLSearchParams(params); p.delete("sub"); setParams(p); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !activeSub ? "bg-amber-400 text-neutral-950 border-amber-400 font-semibold"
                         : "text-neutral-400 border-neutral-800 hover:border-amber-400/60"
            }`}
            data-testid="shopbaked-sub-all"
          >
            All
          </button>
          {cat.subcategories.map((s) => (
            <button
              key={s.id}
              onClick={() => { const p = new URLSearchParams(params); p.set("sub", s.slug); setParams(p); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeSub === s.slug ? "bg-amber-400 text-neutral-950 border-amber-400 font-semibold"
                                     : "text-neutral-400 border-neutral-800 hover:border-amber-400/60"
              }`}
              data-testid={`shopbaked-sub-${s.slug}`}
            >
              {locale === "fr" ? s.name_fr : s.name_en}
            </button>
          ))}
        </div>
      )}

      {!products && <div className="text-sm text-neutral-500">Loading…</div>}
      {products && products.length === 0 && (
        <div className="text-sm text-neutral-500" data-testid="shopbaked-category-empty">
          No products in this category yet.
        </div>
      )}
      {products && products.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
             data-testid="shopbaked-category-grid">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
};

export default ShopCategory;
