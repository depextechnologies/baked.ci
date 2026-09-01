/**
 * ShopCategory — SHOPbakēd category landing.
 *
 * Adopts MART's Blinkit-style mobile layout (left subcategory rail +
 * right product grid) so navigating from MART → SHOP feels identical.
 * Only the data source (`/shop/*`) and accent (SHOP amber) differ.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, LayoutGrid, LayoutList } from "lucide-react";
import { api } from "@/lib/api";
import { ProductCard } from "./ShopHome";

const SHOP_ACCENT = "#FCC44C";
const abs = (u) => (u && typeof u === "string" && u.startsWith("/")
  ? `${process.env.REACT_APP_BACKEND_URL}${u}`
  : u);

export const ShopCategory = ({ locale = "fr", basePath = "/shop" }) => {
  const { categorySlug } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeSub = params.get("sub") || "all";

  const [cat, setCat] = useState(null);
  const [products, setProducts] = useState(null);
  const [layout, setLayout] = useState("grid");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/shop/catalogue?country=CI").then(({ data }) => {
      if (cancelled) return;
      setCat((data || []).find((c) => c.slug === categorySlug) || null);
    });
    return () => { cancelled = true; };
  }, [categorySlug]);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ country: "CI", category: categorySlug, limit: "100" });
    if (activeSub && activeSub !== "all") q.set("subcategory", activeSub);
    api.get(`/shop/products?${q.toString()}`).then(({ data }) => {
      if (!cancelled) setProducts(data || []);
    });
    return () => { cancelled = true; };
  }, [categorySlug, activeSub]);

  const setSub = (slug) => {
    const p = new URLSearchParams(params);
    if (!slug || slug === "all") p.delete("sub"); else p.set("sub", slug);
    setParams(p);
  };

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter((p) => (p.title || p.name || "").toLowerCase().includes(q));
  }, [products, search]);

  const title = cat ? (locale === "fr" ? cat.name_fr : cat.name_en) : categorySlug;
  const subcats = cat?.subcategories || [];

  return (
    <div data-testid="shopbaked-category">
      {/* Sub header row: back + category title + layout toggle */}
      <div className="px-4 pt-1 pb-2 flex items-center gap-2">
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
        <button data-testid="shopbaked-category-layout"
                onClick={() => setLayout(layout === "grid" ? "row" : "grid")}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          {layout === "grid" ? <LayoutList size={16} /> : <LayoutGrid size={16} />}
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
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
            <div className="grid grid-cols-2 gap-3" data-testid="shopbaked-category-grid">
              {filtered.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3" data-testid="shopbaked-category-list">
              {filtered.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopCategory;
