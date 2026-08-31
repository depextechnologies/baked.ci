/**
 * ShopHome — SHOPbakēd customer storefront home (Slice 6).
 *
 * Sections:
 *   1. Hero — brand statement + CTA
 *   2. Category rail — horizontally scrollable pills from /api/shop/catalogue
 *   3. Fresh drops — grid of the newest approved products from /api/shop/products
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowRight, Sparkles, ShieldCheck, Truck } from "lucide-react";

const localised = (r, locale) => (locale === "fr" ? r?.name_fr : r?.name_en) || r?.name_en || r?.name_fr || r?.slug;

export const ShopHome = ({ locale = "fr" }) => {
  const [tree, setTree] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/shop/catalogue?country=CI"),
      api.get("/shop/products?country=CI&limit=12"),
    ])
      .then(([t, p]) => {
        if (cancelled) return;
        setTree(t.data || []);
        setProducts(p.data || []);
      })
      .catch((e) => !cancelled && setError(e?.message || "Failed to load"));
    return () => { cancelled = true; };
  }, []);

  return (
    <div data-testid="shopbaked-home">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl mb-10 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ background: "radial-gradient(ellipse at top right, rgba(251,191,36,.6), transparent 55%)" }} />
        <div className="relative px-8 py-14 md:px-14 md:py-20">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300 mb-4">
            <Sparkles size={14} /> The BAKĒD marketplace
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-50 max-w-3xl">
            Fashion, tech & home goods.
            <span className="block text-amber-400">Shipped across Côte d'Ivoire.</span>
          </h1>
          <p className="mt-5 text-neutral-300 max-w-xl">
            {tree ? `${tree.length} categories · ${tree.reduce((n, c) => n + (c.subcategories?.length || 0), 0)} sub-brands ready to explore.` : "Loading catalogue…"}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#shop-catalogue" className="pl-btn pl-btn-primary" data-testid="shopbaked-hero-cta">
              Browse categories <ArrowRight size={14} />
            </a>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3 max-w-2xl">
            {[
              { icon: ShieldCheck, label: "Vetted sellers", tag: "Every listing reviewed" },
              { icon: Truck, label: "Same-day CI", tag: "Abidjan express" },
              { icon: Sparkles, label: "Fresh drops", tag: "New arrivals weekly" },
            ].map(({ icon: Icon, label, tag }) => (
              <div key={label} className="flex items-start gap-3">
                <Icon size={16} className="text-amber-400 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-neutral-100">{label}</div>
                  <div className="text-xs text-neutral-500">{tag}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="text-red-400 mb-6" data-testid="shopbaked-home-error">Error: {error}</p>}

      {/* Categories rail */}
      <section id="shop-catalogue" className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-100">Categories</h2>
          <span className="text-xs text-neutral-500">{tree?.length || 0} total</span>
        </div>
        {!tree && <div className="text-sm text-neutral-500">Loading…</div>}
        {tree && (
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" data-testid="shopbaked-category-rail">
            {tree.map((c) => (
              <Link
                key={c.id}
                to={`/shopbaked/c/${c.slug}`}
                data-testid={`shopbaked-category-tile-${c.slug}`}
                className="group border border-neutral-800 rounded-xl p-4 bg-neutral-900/40 hover:border-amber-400/60 transition-colors"
              >
                <div className="text-sm font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors">
                  {localised(c, locale)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  {c.subcategories?.length || 0} sub-categories
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Fresh drops */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-100">Fresh drops</h2>
          <span className="text-xs text-neutral-500">{products?.length || 0} live</span>
        </div>
        {!products && <div className="text-sm text-neutral-500">Loading…</div>}
        {products && products.length === 0 && (
          <div className="text-sm text-neutral-500" data-testid="shopbaked-no-products">
            No approved SHOP products yet — check back once suppliers publish new listings.
          </div>
        )}
        {products && products.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="shopbaked-fresh-drops">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
};

export const ProductCard = ({ product }) => (
  <Link
    to={`/shopbaked/p/${product.id}`}
    data-testid={`shopbaked-product-card-${product.id}`}
    className="group block border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 hover:border-amber-400/60 transition-colors"
  >
    <div className="aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden">
      {product.images?.[0] ? (
        <img src={product.images[0]} alt={product.title}
             className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
      ) : (
        <span className="text-neutral-700 text-4xl">SHOP</span>
      )}
    </div>
    <div className="p-3">
      <div className="text-sm font-medium text-neutral-100 truncate">{product.title}</div>
      <div className="text-[11px] text-neutral-500 mt-1">Ships from Côte d'Ivoire</div>
    </div>
  </Link>
);

export default ShopHome;
