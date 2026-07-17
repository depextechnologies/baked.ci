import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp } from "../../contexts/BakedContexts";
import { MobileProductCard } from "../../components/mobile/MobileProductCard";
import { FilterDrawer } from "../../components/mobile/FilterDrawer";
import { ArrowLeft, SlidersHorizontal, Search, LayoutGrid, LayoutList } from "lucide-react";

/**
 * MobileCategoryPage covers:
 *   - /categories             → grid of all categories
 *   - /categories/:slug       → Blinkit-style category detail with left subcategory rail + product grid
 */
export const MobileCategoryPage = () => {
  const { slug } = useParams();
  const nav = useNavigate();
  const { country, language } = useApp();
  const [categories, setCategories] = useState([]);
  const [subcats, setSubcats] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeSub, setActiveSub] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [params] = useSearchParams();

  // Category index view — no slug
  useEffect(() => {
    if (slug) return;
    api.get(`/mart/categories?country=${country.code}`).then((r) => setCategories(r.data));
  }, [slug, country?.code]);

  // Category detail — subcats + products
  useEffect(() => {
    if (!slug) return;
    (async () => {
      const [sc, pr] = await Promise.all([
        api.get(`/mart/subcategories?country=${country.code}&category=${slug}`).catch(() => ({ data: [] })),
        api.get(`/mart/products?country=${country.code}&category=${slug}&limit=100`),
      ]);
      setSubcats(sc.data || []);
      setProducts(pr.data);
      setActiveSub("all");
    })();
  }, [slug, country?.code]);

  const activeCat = categories.find((c) => c.slug === slug) || { slug, name: slug };
  const displayCat = (c) => language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);

  const filtered = useMemo(() => {
    let arr = products;
    if (activeSub !== "all") arr = arr.filter((p) => p.subcategory_slug === activeSub);
    if (search) arr = arr.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()));
    if (filters.price) {
      const [lo, hi] = filters.price === "1000+" ? [1000, Infinity] : filters.price.split("-").map(Number);
      arr = arr.filter((p) => p.price >= lo && p.price <= (hi ?? Infinity));
    }
    if (filters.origin?.length) arr = arr.filter((p) => filters.origin.includes(p.country || p.origin));
    if (filters.type?.length) arr = arr.filter((p) => filters.type.includes(p.brand));
    if (filters.sort === "price_asc") arr = [...arr].sort((a, b) => a.price - b.price);
    if (filters.sort === "price_desc") arr = [...arr].sort((a, b) => b.price - a.price);
    if (filters.sort === "discount_desc") arr = [...arr].sort((a, b) => {
      const da = (a.compare_at_price ? (a.compare_at_price - a.price) / a.compare_at_price : 0);
      const db = (b.compare_at_price ? (b.compare_at_price - b.price) / b.compare_at_price : 0);
      return db - da;
    });
    return arr;
  }, [products, activeSub, search, filters]);

  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).slice(0, 20).map((b) => ({ code: b, label: b, count: products.filter((p) => p.brand === b).length })), [products]);
  const origins = useMemo(() => Array.from(new Set(products.map((p) => p.country || p.origin).filter(Boolean))).map((o) => ({ code: o, label: o, count: products.filter((p) => (p.country || p.origin) === o).length })), [products]);

  // ============ CATEGORY INDEX ============
  if (!slug) {
    return (
      <div className="pb-4">
        <div className="px-4 pt-2 pb-3">
          <button onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center mb-2"><ArrowLeft size={16} /></button>
          <div className="text-xl font-bold">All Categories</div>
          <div className="text-xs text-muted-foreground">Everything for your home, delivered fast</div>
        </div>
        <div className="grid grid-cols-3 gap-3 px-4">
          {categories.map((c) => (
            <button key={c.slug} data-testid={`m-cat-${c.slug}`} onClick={() => nav(`/categories/${c.slug}`)} className="baked-card bg-card border border-border p-2 active:scale-95 motion-fast">
              <div className="aspect-square rounded-xl overflow-hidden bg-secondary/40 mb-1.5">
                {c.image && <img src={c.image} alt={displayCat(c)} className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className="text-[11px] font-semibold text-center leading-tight line-clamp-2">{displayCat(c)}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============ CATEGORY DETAIL ============
  return (
    <div>
      {/* Sub header row: back + category title + layout toggle */}
      <div className="px-4 pt-1 pb-2 flex items-center gap-2">
        <button data-testid="m-cat-back" onClick={() => nav("/categories")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate">{displayCat(activeCat)}</div>
          <div className="text-[10px] text-muted-foreground">{products.length} products</div>
        </div>
        <button data-testid="m-cat-layout" onClick={() => setLayout(layout === "grid" ? "row" : "grid")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          {layout === "grid" ? <LayoutList size={16} /> : <LayoutGrid size={16} />}
        </button>
      </div>

      {/* Search + filter */}
      <div className="px-4 pb-2 flex gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input data-testid="m-cat-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in this category" className="w-full baked-input bg-secondary pl-9 pr-3 py-2.5 text-xs" />
        </div>
        <button data-testid="m-cat-filter" onClick={() => setFilterOpen(true)} className="w-11 h-11 shrink-0 rounded-xl bg-secondary flex items-center justify-center relative">
          <SlidersHorizontal size={16} />
          {(filters.type?.length || filters.origin?.length || filters.price || (filters.sort && filters.sort !== "relevance")) ? <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: "#77BC1F" }} /> : null}
        </button>
      </div>

      {/* Left subcategory rail + product grid */}
      <div className="grid grid-cols-[84px_1fr] min-h-[70vh]">
        <aside className="border-r border-border overflow-y-auto pb-24">
          <button data-testid="m-sub-all" onClick={() => setActiveSub("all")} className={`w-full py-3 px-2 text-[11px] font-semibold text-center border-l-2 ${activeSub === "all" ? "bg-secondary/40" : "border-transparent text-muted-foreground"}`} style={activeSub === "all" ? { borderColor: "#77BC1F", color: "#77BC1F" } : {}}>All</button>
          {subcats.map((s) => {
            const name = language === "en" ? (s.name_en || s.name) : (s.name_fr || s.name);
            const isAct = activeSub === s.slug;
            return (
              <button key={s.slug} data-testid={`m-sub-${s.slug}`} onClick={() => setActiveSub(s.slug)} className={`w-full py-3 px-1.5 text-[10px] leading-tight text-center border-l-2 ${isAct ? "bg-secondary/40 font-semibold" : "border-transparent text-muted-foreground"}`} style={isAct ? { borderColor: "#77BC1F", color: "#77BC1F" } : {}}>
                {s.image && <img src={s.image} alt={name} className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" loading="lazy" />}
                {name}
              </button>
            );
          })}
        </aside>

        <div className="p-3">
          {/* Promo strip */}
          <div className="rounded-xl overflow-hidden mb-3 relative" style={{ background: "linear-gradient(135deg, #77BC1F 0%, #5da116 100%)" }}>
            <div className="px-3 py-2.5 text-black">
              <div className="text-[11px] font-bold">Fresh seasonal picks</div>
              <div className="text-[10px] opacity-80">Handpicked · delivered in {country?.delivery_eta_min}</div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">No products match. Try clearing filters.</div>
          ) : layout === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((p) => <MobileProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div>
              {filtered.map((p) => <MobileProductCard key={p.id} product={p} layout="row" />)}
            </div>
          )}
        </div>
      </div>

      <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} initial={filters} onApply={setFilters} brands={brands} origins={origins} />
    </div>
  );
};
