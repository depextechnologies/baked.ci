/**
 * ShopCategoriesIndex — full SHOPbakēd category tree grid.
 *
 * Rendered at `/shop/categories`. When a customer is inside SHOPbakēd and
 * taps the Categories tab, this page loads (Fixing_Prompt v5 §2). It uses
 * the SHOP catalogue endpoint (never MART) so the wrong data set can't leak.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/BakedContexts";

const SHOP_ACCENT = "#FCC44C";

const abs = (u) => (u && typeof u === "string" && u.startsWith("/")
  ? `${process.env.REACT_APP_BACKEND_URL}${u}`
  : u);

const l = (r, locale) =>
  (locale === "fr" ? r?.name_fr : r?.name_en) || r?.name_en || r?.name_fr || r?.slug;

export const ShopCategoriesIndex = ({ locale = "fr", basePath = "/shop" }) => {
  const { country } = useApp() || {};
  const cc = country?.code || "CI";
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/shop/catalogue?country=${cc}`)
      .then(({ data }) => !cancelled && setTree(data || []))
      .catch((e) => !cancelled && setError(e?.message || "Failed to load"));
    return () => { cancelled = true; };
  }, [cc]);

  if (error) {
    return (
      <div className="px-4 py-8 text-center" data-testid="shopbaked-categories-error">
        <p className="text-red-400 text-sm">Error: {error}</p>
      </div>
    );
  }
  if (tree === null) {
    return (
      <div className="px-4 py-16 text-center text-neutral-400" data-testid="shopbaked-categories-loading">
        <Loader2 className="animate-spin inline" size={22} />
      </div>
    );
  }

  return (
    // QA v15 §A — constrain to max-w-7xl + horizontal padding so the
    // category-index aligns with the header (was edge-to-edge before).
    <div className="pb-24 mx-auto max-w-7xl px-4 sm:px-6" data-testid="shopbaked-categories-index">
      <div className="pt-4 pb-3">
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: SHOP_ACCENT }}>
          SHOPbakēd
        </div>
        <h1 className="text-2xl font-bold text-foreground">All categories</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Fashion, electronics and lifestyle — shipped by vetted BAKĒD sellers.
        </p>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center">
          <ShoppingBag size={22} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">No SHOP categories published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6 md:gap-4">
          {tree.map((c) => {
            const img = abs(c.image);
            return (
              <Link
                key={c.id || c.slug}
                to={`${basePath}/c/${c.slug}`}
                data-testid={`shopbaked-cat-${c.slug}`}
                className="group rounded-2xl border border-border overflow-hidden bg-card hover:border-amber-400/60 transition-colors flex flex-col"
              >
                <div className="aspect-square bg-secondary/40 relative overflow-hidden">
                  {img ? (
                    <img
                      src={img}
                      alt={l(c, locale)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                         style={{ background: `${SHOP_ACCENT}18` }}>
                      <ShoppingBag size={22} style={{ color: SHOP_ACCENT }} />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-foreground line-clamp-2 leading-tight">
                    {l(c, locale)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.subcategories?.length || 0} sub
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShopCategoriesIndex;
