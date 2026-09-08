/**
 * ShopCategory — SHOPbakēd category landing.
 *
 * Adopts MART's Blinkit-style mobile layout (left subcategory rail +
 * right product grid) so navigating from MART → SHOP feels identical.
 * Only the data source (`/shop/*`) and accent (SHOP amber) differ.
 */
import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, LayoutGrid, LayoutList, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/BakedContexts";
import { ProductCard } from "./ShopHome";

const SHOP_ACCENT = "#FCC44C";
const abs = (u) => (u && typeof u === "string" && u.startsWith("/")
  ? `${process.env.REACT_APP_BACKEND_URL}${u}`
  : u);

export const ShopCategory = ({ locale = "fr", basePath = "/shop" }) => {
  const { country } = useApp() || {};
  const cc = country?.code || "CI";
  const { categorySlug } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeSub = params.get("sub") || "all";

  const [cat, setCat] = useState(null);
  const [products, setProducts] = useState(null);
  const [layout, setLayout] = useState("grid");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Filter state — driven purely on the client for now against the products
  // already loaded for the (category, subcategory) combo. Matches MART UX.
  const [filters, setFilters] = useState({
    priceMax: null,           // number | null
    brands: new Set(),        // Set<brand_id>
    colours: new Set(),       // Set<string>
    sizes: new Set(),         // Set<string>
  });

  useEffect(() => {
    let cancelled = false;
    api.get(`/shop/catalogue?country=${cc}`).then(({ data }) => {
      if (cancelled) return;
      setCat((data || []).find((c) => c.slug === categorySlug) || null);
    });
    return () => { cancelled = true; };
  }, [categorySlug, cc]);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ country: cc, category: categorySlug, limit: "100" });
    if (activeSub && activeSub !== "all") q.set("subcategory", activeSub);
    api.get(`/shop/products?${q.toString()}`).then(({ data }) => {
      if (!cancelled) setProducts(data || []);
    });
    return () => { cancelled = true; };
  }, [categorySlug, activeSub, cc]);

  const setSub = (slug) => {
    const p = new URLSearchParams(params);
    if (!slug || slug === "all") p.delete("sub"); else p.set("sub", slug);
    setParams(p);
  };

  const filtered = useMemo(() => {
    if (!products) return [];
    let out = products;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((p) => (p.title || p.name || "").toLowerCase().includes(q));
    }
    if (filters.priceMax != null) {
      out = out.filter((p) => p.min_price != null && p.min_price <= filters.priceMax);
    }
    if (filters.brands.size) {
      out = out.filter((p) => p.brand_id && filters.brands.has(p.brand_id));
    }
    if (filters.colours.size) {
      out = out.filter((p) => {
        const c = (p.variant_attributes || {}).colour;
        return c && filters.colours.has(c);
      });
    }
    if (filters.sizes.size) {
      out = out.filter((p) => {
        const s = (p.variant_attributes || {}).size || (p.variant_attributes || {}).capacity;
        return s && filters.sizes.has(s);
      });
    }
    return out;
  }, [products, search, filters]);

  // Facet counts derived from the *unfiltered* pool so users can widen back
  // out. Aggregates brand/colour/size + max price.
  const facets = useMemo(() => {
    const brands = new Map(), colours = new Map(), sizes = new Map();
    let maxPrice = 0;
    for (const p of products || []) {
      if (p.min_price != null && p.min_price > maxPrice) maxPrice = p.min_price;
      if (p.brand_id) brands.set(p.brand_id, (brands.get(p.brand_id) || 0) + 1);
      const a = p.variant_attributes || {};
      if (a.colour) colours.set(a.colour, (colours.get(a.colour) || 0) + 1);
      const s = a.size || a.capacity;
      if (s) sizes.set(s, (sizes.get(s) || 0) + 1);
    }
    return { brands, colours, sizes, maxPrice: Math.ceil(maxPrice / 1000) * 1000 };
  }, [products]);

  const activeFilterCount =
    (filters.priceMax != null ? 1 : 0) + filters.brands.size + filters.colours.size + filters.sizes.size;

  const toggleSet = (key, val) => setFilters((f) => {
    const next = new Set(f[key]);
    next.has(val) ? next.delete(val) : next.add(val);
    return { ...f, [key]: next };
  });
  const clearFilters = () => setFilters({ priceMax: null, brands: new Set(), colours: new Set(), sizes: new Set() });

  const title = cat ? (locale === "fr" ? cat.name_fr : cat.name_en) : categorySlug;
  const subcats = cat?.subcategories || [];

  return (
    // Constrain content width + horizontal padding so the category landing
    // aligns with the header / home / other storefront pages. Previously the
    // page stretched edge-to-edge on desktop (QA — Fixing_Prompt "Home #1").
    <div data-testid="shopbaked-category" className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Sub header row: back + category title + layout toggle */}
      <div className="pt-1 pb-2 flex items-center gap-2">
        <button data-testid="shopbaked-category-back" onClick={() => nav(`${basePath}/categories`)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold truncate">{title}</div>
          <div className="text-[10px] text-muted-foreground">
            {products ? `${products.length} products` : "Loading…"}
          </div>
        </div>
        <button data-testid="shopbaked-category-filters"
                onClick={() => setFiltersOpen(true)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center relative">
          <SlidersHorizontal size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-bold rounded-full flex items-center justify-center"
                  style={{ background: SHOP_ACCENT, color: "#0a0a0a" }}>
              {activeFilterCount}
            </span>
          )}
        </button>
        <button data-testid="shopbaked-category-layout"
                onClick={() => setLayout(layout === "grid" ? "row" : "grid")}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          {layout === "grid" ? <LayoutList size={16} /> : <LayoutGrid size={16} />}
        </button>
      </div>

      {/* Search */}
      <div className="pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="shopbaked-category-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in this category"
            className="w-full baked-input bg-secondary pl-9 pr-3 py-2.5 text-xs"
          />
        </div>
      </div>

      {/* Left subcategory rail + product grid — Blinkit / MART parity */}
      <div className="grid grid-cols-[84px_1fr] min-h-[70vh]">
        <aside className="border-r border-border overflow-y-auto pb-24" data-testid="shopbaked-sub-rail">
          <button
            data-testid="shopbaked-sub-all"
            onClick={() => setSub("all")}
            className={`w-full py-3 px-2 text-[11px] font-semibold text-center border-l-2 ${
              activeSub === "all" ? "bg-secondary/40" : "border-transparent text-muted-foreground"
            }`}
            style={activeSub === "all" ? { borderColor: SHOP_ACCENT, color: SHOP_ACCENT } : {}}
          >
            All
          </button>
          {subcats.map((s) => {
            const name = locale === "fr" ? (s.name_fr || s.name_en) : (s.name_en || s.name_fr);
            const img = abs(s.image);
            const isAct = activeSub === s.slug;
            return (
              <button
                key={s.slug}
                data-testid={`shopbaked-sub-${s.slug}`}
                onClick={() => setSub(s.slug)}
                className={`w-full py-3 px-1.5 text-[10px] leading-tight text-center border-l-2 ${
                  isAct ? "bg-secondary/40 font-semibold" : "border-transparent text-muted-foreground"
                }`}
                style={isAct ? { borderColor: SHOP_ACCENT, color: SHOP_ACCENT } : {}}
              >
                {img && <img src={img} alt={name} className="w-10 h-10 rounded-lg object-cover mx-auto mb-1" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                {name || s.slug}
              </button>
            );
          })}
        </aside>

        <div className="p-3">
          {/* SHOP promo strip — parity with MART's fresh-picks strip. */}
          <div className="rounded-xl overflow-hidden mb-3 relative"
               style={{ background: `linear-gradient(135deg, ${SHOP_ACCENT} 0%, #b98a1f 100%)` }}>
            <div className="px-3 py-2.5 text-black">
              <div className="text-[11px] font-bold">Fresh drops in {title}</div>
              <div className="text-[10px] opacity-80">Vetted sellers · shipped across CI</div>
            </div>
          </div>

          {products === null ? (
            <div className="text-center py-16 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground" data-testid="shopbaked-category-empty">
              No products match. Try clearing filters.
            </div>
          ) : layout === "grid" ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4"
                 data-testid="shopbaked-category-grid">
              {filtered.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3" data-testid="shopbaked-category-list">
              {filtered.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
            </div>
          )}
        </div>
      </div>
      {filtersOpen && (
        <FilterDrawer
          facets={facets}
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FilterDrawer — right-side sheet. Price slider + Brand/Colour/Size chips.
// SHOP amber accent; matches MART UX so switching modules doesn't retrain
// the user.
// ---------------------------------------------------------------------------
const FilterDrawer = ({ facets, filters, setFilters, onClear, onClose }) => {
  return (
    <div className="fixed inset-0 z-50" data-testid="shopbaked-filters-drawer">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[92%] max-w-md bg-card border-l border-border overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-sm font-bold">Filters</div>
          <div className="flex items-center gap-2">
            <button onClick={onClear} data-testid="shopbaked-filters-clear"
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Clear</button>
            <button onClick={onClose} data-testid="shopbaked-filters-close"
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Price */}
        {facets.maxPrice > 0 && (
          <section className="px-4 py-4 border-b border-border">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: SHOP_ACCENT }}>
              Max price
            </div>
            <input
              type="range" min={0} max={facets.maxPrice} step={1000}
              value={filters.priceMax ?? facets.maxPrice}
              onChange={(e) => setFilters((f) => ({ ...f, priceMax: Number(e.target.value) }))}
              className="w-full accent-amber-400"
              data-testid="shopbaked-filter-price"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              <span>0</span>
              <span>{Number(filters.priceMax ?? facets.maxPrice).toLocaleString()} XOF</span>
            </div>
          </section>
        )}

        {/* Brand */}
        <FacetGroup label="Brand" facets={facets.brands} testid="brand"
                    active={filters.brands}
                    onToggle={(v) => setFilters((f) => {
                      const n = new Set(f.brands); n.has(v) ? n.delete(v) : n.add(v);
                      return { ...f, brands: n };
                    })} />

        {/* Colour */}
        <FacetGroup label="Colour" facets={facets.colours} testid="colour"
                    active={filters.colours}
                    onToggle={(v) => setFilters((f) => {
                      const n = new Set(f.colours); n.has(v) ? n.delete(v) : n.add(v);
                      return { ...f, colours: n };
                    })} />

        {/* Size / capacity */}
        <FacetGroup label="Size / Capacity" facets={facets.sizes} testid="size"
                    active={filters.sizes}
                    onToggle={(v) => setFilters((f) => {
                      const n = new Set(f.sizes); n.has(v) ? n.delete(v) : n.add(v);
                      return { ...f, sizes: n };
                    })} />

        <div className="mt-auto p-4 border-t border-border">
          <button onClick={onClose}
                  data-testid="shopbaked-filters-apply"
                  className="w-full h-11 rounded-xl font-bold text-black"
                  style={{ background: SHOP_ACCENT }}>
            Apply filters
          </button>
        </div>
      </aside>
    </div>
  );
};

const FacetGroup = ({ label, facets, active, onToggle, testid }) => {
  if (!facets || facets.size === 0) return null;
  return (
    <section className="px-4 py-4 border-b border-border" data-testid={`shopbaked-facet-${testid}`}>
      <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: SHOP_ACCENT }}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {[...facets.entries()].map(([val, count]) => {
          const on = active.has(val);
          return (
            <button key={val}
                    data-testid={`shopbaked-facet-${testid}-${String(val).toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => onToggle(val)}
                    className="baked-chip px-3 py-1.5 text-[11px] font-semibold"
                    style={on
                      ? { background: SHOP_ACCENT, color: "#0a0a0a" }
                      : { background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}>
              {val} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ShopCategory;
