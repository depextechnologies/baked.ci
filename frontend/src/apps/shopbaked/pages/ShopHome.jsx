/**
 * ShopHome — SHOPbakēd customer storefront home (Slice 6 + 7).
 *
 * Reads admin-curated rails from `/api/homepage?country=CI&module=shop`
 * and renders one section per config row. Falls back to a built-in
 * "Fresh drops" grid when the CMS has no product_carousel rail.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowRight, Sparkles, ShieldCheck, Truck, Tag } from "lucide-react";

const l = (r, locale) =>
  (locale === "fr" ? r?.name_fr : r?.name_en) || r?.name_en || r?.name_fr || r?.slug;

export const ShopHome = ({ locale = "fr", basePath = "/shop" }) => {
  const [tree, setTree] = useState(null);
  const [products, setProducts] = useState(null);
  const [homepage, setHomepage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get("/shop/catalogue?country=CI"),
      api.get("/shop/products?country=CI&limit=12"),
      api.get("/homepage?country=CI&module=shop"),
    ])
      .then(([t, p, h]) => {
        if (cancelled) return;
        setTree(t.data || []);
        setProducts(p.data || []);
        setHomepage(h.data?.sections || []);
      })
      .catch((e) => !cancelled && setError(e?.message || "Failed to load"));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6" data-testid="shopbaked-home">
      {error && <p className="text-red-400 mb-6" data-testid="shopbaked-home-error">Error: {error}</p>}

      <div className="flex justify-end mb-4">
        <Link to={`${basePath}/checkout`} className="pl-btn text-sm"
              data-testid="shopbaked-home-checkout-cta">
          Go to checkout →
        </Link>
      </div>

      {/* Admin-curated sections drive the layout. Fallback hero remains
          when the CMS returns nothing (fresh install / migration in flight). */}
      {(homepage || []).map((section) => (
        <SectionRenderer key={section.id} section={section}
                         tree={tree} products={products} locale={locale}
                         basePath={basePath} />
      ))}

      {homepage && homepage.length === 0 && (
        <FallbackHero tree={tree} />
      )}
    </div>
  );
};

// ==========================================================================
// Section renderer — dispatches to the right block per section_type.
// Unknown section_types render nothing so admins can safely experiment.
// ==========================================================================

const SectionRenderer = ({ section, tree, products, locale, basePath = "/shop" }) => {
  const testId = `shopbaked-section-${section.section_type}-${section.id}`;
  switch (section.section_type) {
    case "hero":
      return <HeroSection section={section} testId={testId} basePath={basePath} />;
    case "category_grid":
      return <CategoryGridSection section={section} tree={tree} locale={locale} testId={testId} basePath={basePath} />;
    case "product_carousel":
      return <ProductCarouselSection section={section} products={products} testId={testId} basePath={basePath} />;
    case "promotional_banner":
      return <PromoBannerSection section={section} testId={testId} basePath={basePath} />;
    case "brand_carousel":
      return <BrandCarouselSection section={section} testId={testId} />;
    default:
      return null;
  }
};

const HeroSection = ({ section, testId, basePath = "/shop" }) => {
  const { title, subtitle, config = {} } = section;
  const resolveLink = (l) => (l && l.startsWith("/shopbaked") ? l.replace("/shopbaked", basePath) : (l || basePath));
  return (
    <section
      className="relative overflow-hidden rounded-2xl mb-10 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black"
      data-testid={testId}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none"
           style={{ background: "radial-gradient(ellipse at top right, rgba(251,191,36,.6), transparent 55%)" }} />
      <div className="relative px-8 py-14 md:px-14 md:py-20">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300 mb-4">
          <Sparkles size={14} /> The BAKĒD marketplace
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-50 max-w-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-5 text-neutral-300 max-w-xl">{subtitle}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          {config.cta_label && (
            <Link to={resolveLink(config.cta_link)} className="pl-btn pl-btn-primary" data-testid="shopbaked-hero-cta">
              {config.cta_label} <ArrowRight size={14} />
            </Link>
          )}
          {config.secondary_cta_label && (
            <Link to={resolveLink(config.secondary_cta_link)} className="pl-btn"
                  data-testid="shopbaked-hero-secondary">
              {config.secondary_cta_label}
            </Link>
          )}
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
  );
};

const CategoryGridSection = ({ section, tree, locale, testId, basePath = "/shop" }) => {
  const cats = section.config?.categories || [];
  // Merge CMS ordering with catalogue metadata for i18n names.
  const enriched = cats
    .map((c) => {
      const meta = (tree || []).find((t) => t.slug === c.slug);
      return meta ? { ...c, meta } : { ...c, meta: null };
    })
    .filter((c) => c.meta || c.name);
  return (
    <section className="mb-12" id="shop-catalogue" data-testid={testId}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">{section.title}</h2>
          {section.subtitle && (
            <p className="text-sm text-neutral-500 mt-1">{section.subtitle}</p>
          )}
        </div>
        <span className="text-xs text-neutral-500">{enriched.length} tiles</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
           data-testid="shopbaked-category-rail">
        {enriched.map((c) => (
          <Link key={c.slug} to={`${basePath}/c/${c.slug}`}
                data-testid={`shopbaked-category-tile-${c.slug}`}
                className="group border border-neutral-800 rounded-xl p-4 bg-neutral-900/40 hover:border-amber-400/60 transition-colors">
            <div className="text-sm font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors">
              {c.meta ? l(c.meta, locale) : c.name}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              {c.meta?.subcategories?.length || 0} sub-categories
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

const ProductCarouselSection = ({ section, products, testId, basePath = "/shop" }) => {
  const limit = section.config?.limit || 12;
  const items = (products || []).slice(0, limit);
  return (
    <section className="mb-12" data-testid={testId}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">{section.title}</h2>
          {section.subtitle && (
            <p className="text-sm text-neutral-500 mt-1">{section.subtitle}</p>
          )}
        </div>
        <span className="text-xs text-neutral-500">{items.length} live</span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-neutral-500" data-testid="shopbaked-no-products">
          No approved SHOP products yet — check back once suppliers publish new listings.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
             data-testid="shopbaked-fresh-drops">
          {items.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
        </div>
      )}
    </section>
  );
};

const PromoBannerSection = ({ section, testId, basePath = "/shop" }) => {
  const { title, subtitle, config = {} } = section;
  const link = (config.link && config.link.startsWith("/shopbaked"))
    ? config.link.replace("/shopbaked", basePath) : (config.link || basePath);
  return (
    <section
      className="mb-12 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-950/60 to-neutral-950 p-8 md:p-10 relative overflow-hidden"
      data-testid={testId}
    >
      {config.badge && (
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1 mb-4">
          <Tag size={10} /> {config.badge}
        </div>
      )}
      <h2 className="text-2xl md:text-3xl font-bold text-neutral-100">{title}</h2>
      {subtitle && <p className="mt-2 text-neutral-400 max-w-xl">{subtitle}</p>}
      {config.cta_label && (
        <Link to={link} className="mt-6 inline-block pl-btn pl-btn-primary"
              data-testid="shopbaked-promo-cta">
          {config.cta_label} <ArrowRight size={14} />
        </Link>
      )}
    </section>
  );
};

const BrandCarouselSection = ({ section, testId }) => {
  const brands = section.config?.brands || [];
  if (brands.length === 0) return null;
  return (
    <section className="mb-12" data-testid={testId}>
      <h2 className="text-xl font-semibold text-neutral-100 mb-4">{section.title}</h2>
      <div className="flex flex-wrap gap-2" data-testid="shopbaked-brand-rail">
        {brands.map((b) => (
          <span key={b.name}
                className="text-xs uppercase tracking-widest px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300">
            {b.name}
          </span>
        ))}
      </div>
    </section>
  );
};

const FallbackHero = ({ tree }) => (
  <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 mb-8">
    <h1 className="text-3xl font-bold text-neutral-100">SHOPbakēd</h1>
    <p className="text-neutral-400 mt-2">
      {tree ? `${tree.length} categories seeded — admin homepage config coming soon.` : "Loading catalogue…"}
    </p>
  </section>
);

export const ProductCard = ({ product, basePath = "/shop" }) => (
  <Link
    to={`${basePath}/p/${product.id}`}
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
