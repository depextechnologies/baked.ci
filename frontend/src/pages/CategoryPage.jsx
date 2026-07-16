import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { ProductCard } from "../components/mart/ProductCard";
import { CATEGORY } from "../constants/testIds";

export const CategoriesIndexPage = () => {
  const { country, language } = useApp();
  const [cats, setCats] = useState([]);
  const navigate = useNavigate();
  useEffect(() => { api.get(`/mart/categories?country=${country.code}`).then(r => setCats(r.data)); }, [country.code]);
  return (
    <div className="baked-container my-8">
      <h1 className="text-3xl font-bold mb-6">{language === "en" ? "All Categories" : "Toutes les catégories"}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cats.map((c) => {
          const displayName = language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);
          return (
            <button key={c.slug} data-testid={CATEGORY.card(c.slug)} onClick={() => navigate(`/categories/${c.slug}`)} className="baked-card bg-card border border-border overflow-hidden group motion-normal hover:border-[#77BC1F]/60">
              <div className="aspect-square bg-secondary/40"><img src={c.image} alt={displayName} className="w-full h-full object-cover motion-normal group-hover:scale-105" /></div>
              <div className="p-3 text-sm font-semibold text-center">{displayName}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Blinkit-style category detail page:
 *  - Left rail with sub-category thumbnails (image + name), active state = green pill on the left edge
 *  - Right side: sub-category products in a grid
 */
export const CategoryDetailPage = () => {
  const { slug } = useParams();
  const { country, language } = useApp();
  const [cat, setCat] = useState(null);
  const [subs, setSubs] = useState([]);
  const [activeSub, setActiveSub] = useState(null);
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();

  // Load category + subs + all products for the category
  useEffect(() => {
    (async () => {
      const [catsResp, subsResp, allResp] = await Promise.all([
        api.get(`/mart/categories?country=${country.code}`),
        api.get(`/mart/subcategories?country=${country.code}&category=${slug}`),
        api.get(`/mart/products?country=${country.code}&category=${slug}&limit=100`),
      ]);
      setCat(catsResp.data.find((c) => c.slug === slug));
      setSubs(subsResp.data);
      setProducts(allResp.data);
      // Auto-select the first sub that actually has products
      const firstWithProducts = subsResp.data.find((s) => allResp.data.some((p) => p.subcategory_slug === s.slug));
      setActiveSub(firstWithProducts?.slug || subsResp.data[0]?.slug || null);
    })();
  }, [slug, country.code]);

  const displayCatName = cat ? (language === "en" ? (cat.name_en || cat.name) : (cat.name_fr || cat.name)) : slug;
  const filtered = useMemo(
    () => (activeSub ? products.filter((p) => p.subcategory_slug === activeSub) : products),
    [products, activeSub]
  );
  const activeSubMeta = subs.find((s) => s.slug === activeSub);
  const activeSubName = activeSubMeta
    ? (language === "en" ? (activeSubMeta.name_en || activeSubMeta.name) : (activeSubMeta.name_fr || activeSubMeta.name))
    : displayCatName;

  return (
    <div className="baked-container my-6">
      <button onClick={() => navigate(-1)} className="text-xs text-muted-foreground mb-4 hover:text-foreground">
        {language === "en" ? "← Back" : "← Retour"}
      </button>

      <div className="baked-card bg-card border border-border overflow-hidden">
        {/* Category header */}
        <div className="px-5 py-3 border-b border-border font-semibold text-sm">{displayCatName}</div>

        <div className="grid grid-cols-[112px_1fr] md:grid-cols-[132px_1fr]">
          {/* Sub-category rail */}
          <aside data-testid="subcategory-rail" className="border-r border-border max-h-[80vh] overflow-y-auto py-2">
            {subs.map((s) => {
              const name = language === "en" ? (s.name_en || s.name) : (s.name_fr || s.name);
              const isActive = s.slug === activeSub;
              return (
                <button
                  key={s.slug}
                  data-testid={`subcategory-${s.slug}`}
                  onClick={() => setActiveSub(s.slug)}
                  className={`relative w-full flex flex-col items-center gap-1 px-2 py-3 motion-fast text-center ${isActive ? "bg-[#77BC1F]/10" : "hover:bg-secondary"}`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#77BC1F]" />
                  )}
                  <div className={`w-16 h-16 rounded-xl overflow-hidden ${isActive ? "ring-2 ring-[#77BC1F]/60" : ""}`}>
                    <img src={s.image} alt={name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className={`text-[11px] leading-tight font-medium mt-1 line-clamp-2 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{name}</div>
                </button>
              );
            })}
          </aside>

          {/* Products */}
          <section className="p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">{activeSubName}</h2>
              <div className="text-xs text-muted-foreground">
                {filtered.length} {language === "en" ? "items" : "articles"}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                {language === "en" ? "No products in this sub-category yet." : "Aucun produit dans cette sous-catégorie."}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
