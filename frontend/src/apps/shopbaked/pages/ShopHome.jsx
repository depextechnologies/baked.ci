/**
 * ShopHome — SHOPbakēd customer storefront home.
 *
 * Reads admin-curated rails from `/api/homepage?country=CI&module=shop`
 * and renders every SECTION TYPE the MART homepage supports, so the Super
 * Admin can add / reorder / enable / disable any section (Hero, Category
 * Grid, Fresh Drops, Promo, Banner Trio, Brand Carousel, CTA Strip) and
 * see the exact same result on the storefront.
 *
 * Fixing_Prompt v3 (2026-03) fixes:
 *   §1  Every enabled section from Homepage Management renders here.
 *   §2  Uploaded images (hero background, category tiles, banner images)
 *       are resolved against REACT_APP_BACKEND_URL when they come back as
 *       relative `/api/homepage/uploads/…` paths.
 *   §7  Frontend is 100% CMS-driven — no hard-coded sections. Falls back to
 *       an empty-state notice pointing the admin to the CMS.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  ArrowRight, Sparkles, ShieldCheck, Truck, Tag, ShoppingBag, Loader2,
} from "lucide-react";

// SHOP accent tokens — keep parity with lib/modules.js `shop.color`.
const SHOP_ACCENT = "#FCC44C";     // primary amber/gold
const SHOP_ACCENT_DEEP = "#F59E0B";

// Resolve `/api/homepage/uploads/…` relative URLs so <img> can load them
// against the backend host. Absolute (http/https) URLs are returned as-is.
const abs = (u) => (u && typeof u === "string" && u.startsWith("/")
  ? `${process.env.REACT_APP_BACKEND_URL}${u}`
  : u);

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

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 text-center">
        <p className="text-red-400" data-testid="shopbaked-home-error">Error: {error}</p>
      </div>
    );
  }
  if (homepage === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 text-center text-neutral-400">
        <Loader2 className="animate-spin inline" size={22} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6" data-testid="shopbaked-home">
      {homepage.length === 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-8 text-center"
             data-testid="shopbaked-home-empty">
          <ShoppingBag size={28} className="mx-auto text-amber-400 mb-3" />
          <div className="text-sm text-neutral-300">
            SHOPbakēd homepage has no enabled sections yet. Configure it at{" "}
            <Link to="/admin/homepage-management" className="text-amber-400 underline">
              /admin/homepage-management
            </Link>.
          </div>
        </div>
      )}
      {homepage.map((section) => (
        <SectionRenderer key={section.id} section={section}
                         tree={tree} products={products} locale={locale}
                         basePath={basePath} />
      ))}
    </div>
  );
};

// ==========================================================================
// Section renderer — dispatches to the right block per section_type.
// Unknown section_types render nothing so admins can safely experiment.
// ==========================================================================

const SectionRenderer = ({ section, tree, products, locale, basePath = "/shop" }) => {
  const testId = `shopbaked-section-${section.section_type}-${section.id}`;
  const R = RENDERERS[section.section_type];
  if (!R) return null;
  return <R section={section} tree={tree} products={products} locale={locale}
            testId={testId} basePath={basePath} />;
};

// -------------------------------------------------------------- HERO ------
const HeroSection = ({ section, testId, basePath = "/shop" }) => {
  const { title, subtitle, config = {} } = section;
  const bg = abs(config.background_image);
  const resolveLink = (l) => (l && l.startsWith("/shopbaked") ? l.replace("/shopbaked", basePath) : (l || basePath));
  return (
    <section
      className="relative overflow-hidden rounded-2xl mb-10 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black"
      data-testid={testId}
      style={bg ? {
        background: `linear-gradient(90deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.15) 100%), url(${bg}) center/cover`,
      } : undefined}
    >
      {!bg && (
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ background: `radial-gradient(ellipse at top right, ${SHOP_ACCENT}99, transparent 55%)` }} />
      )}
      <div className="relative px-8 py-14 md:px-14 md:py-20">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest mb-4"
             style={{ color: SHOP_ACCENT }}>
          <Sparkles size={14} /> The BAKĒD marketplace
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-50 max-w-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-5 text-neutral-300 max-w-xl">{subtitle}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          {config.cta_label && (
            <Link to={resolveLink(config.cta_link)}
                  className="h-11 px-5 rounded-xl font-semibold text-sm text-neutral-900 inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ background: SHOP_ACCENT }}
                  data-testid="shopbaked-hero-cta">
              {config.cta_label} <ArrowRight size={14} />
            </Link>
          )}
          {config.secondary_cta_label && (
            <Link to={resolveLink(config.secondary_cta_link)}
                  className="h-11 px-5 rounded-xl font-semibold text-sm bg-white/10 hover:bg-white/20 backdrop-blur border border-white/25 text-white inline-flex items-center gap-2"
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
              <Icon size={16} className="mt-0.5" style={{ color: SHOP_ACCENT }} />
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

// ---------------------------------------------------- CATEGORY GRID -------
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
        <Link to={`${basePath}/categories`}
              data-testid="shopbaked-category-view-all"
              className="text-xs font-semibold hover:underline flex items-center gap-1"
              style={{ color: SHOP_ACCENT }}>
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6"
           data-testid="shopbaked-category-rail">
        {enriched.map((c) => {
          const img = abs(c.image);
          return (
            <Link key={c.slug} to={`${basePath}/c/${c.slug}`}
                  data-testid={`shopbaked-category-tile-${c.slug}`}
                  className="group border border-neutral-800 rounded-xl p-4 bg-neutral-900/40 hover:border-amber-400/60 transition-colors flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center"
                   style={{ background: img ? "transparent" : `${SHOP_ACCENT}22` }}>
                {img ? (
                  <img src={img} alt={c.name}
                       className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                       onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <ShoppingBag size={22} style={{ color: SHOP_ACCENT }} />
                )}
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors">
                  {c.meta ? l(c.meta, locale) : c.name}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  {c.meta?.subcategories?.length || 0} sub-categories
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

// --------------------------------------------------- PRODUCT CAROUSEL ----
// Mobile-first horizontal rail. ~2 cards visible per screen at ≤ sm, wider
// screens fall back to a proper grid. "View all" deep-links to the section's
// configured target (defaults to /shop/categories when none is set).
const ProductCarouselSection = ({ section, products, testId, basePath = "/shop" }) => {
  const limit = section.config?.limit || 12;
  const items = (products || []).slice(0, limit);
  const viewAllHref = section.config?.view_all_link
    ? (section.config.view_all_link.startsWith("/shopbaked")
        ? section.config.view_all_link.replace("/shopbaked", basePath)
        : section.config.view_all_link)
    : `${basePath}/categories`;
  return (
    <section className="mb-12" data-testid={testId}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">{section.title}</h2>
          {section.subtitle && (
            <p className="text-sm text-neutral-500 mt-1">{section.subtitle}</p>
          )}
        </div>
        <Link to={viewAllHref}
              data-testid="shopbaked-carousel-view-all"
              className="text-xs font-semibold hover:underline flex items-center gap-1"
              style={{ color: SHOP_ACCENT }}>
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-neutral-500" data-testid="shopbaked-no-products">
          No approved SHOP products yet — check back once suppliers publish new listings.
        </div>
      ) : (
        <>
          {/* Mobile / small: horizontal swipe rail, 2 cards visible per screen.
              `snap-x` keeps swipes anchored on card edges for a natural feel. */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 sm:hidden"
               data-testid="shopbaked-fresh-drops-rail">
            {items.map((p) => (
              <div key={p.id} className="basis-[46%] shrink-0 snap-start">
                <ProductCard product={p} basePath={basePath} />
              </div>
            ))}
          </div>
          {/* ≥ sm falls back to the responsive grid — 3/4/5 per row so
              laptops see 4 cards and wide desktops 5, per Fixing_Prompt v9. */}
          <div className="hidden sm:grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
               data-testid="shopbaked-fresh-drops">
            {items.map((p) => <ProductCard key={p.id} product={p} basePath={basePath} />)}
          </div>
        </>
      )}
    </section>
  );
};

// ------------------------------------------------ PROMOTIONAL BANNER -----
const PromoBannerSection = ({ section, testId, basePath = "/shop" }) => {
  const { title, subtitle, config = {} } = section;
  const link = (config.link && config.link.startsWith("/shopbaked"))
    ? config.link.replace("/shopbaked", basePath) : (config.link || basePath);
  const img = abs(config.image);
  return (
    <section
      className="mb-12 rounded-2xl border p-8 md:p-10 relative overflow-hidden"
      data-testid={testId}
      style={{
        borderColor: `${SHOP_ACCENT}55`,
        background: img
          ? `linear-gradient(90deg, rgba(0,0,0,.65) 0%, rgba(0,0,0,.15) 60%, transparent 100%), url(${img}) center/cover`
          : `linear-gradient(160deg, ${SHOP_ACCENT_DEEP}22 0%, #0a0a0a 100%)`,
      }}
    >
      {config.badge && (
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest border rounded-full px-2.5 py-1 mb-4"
             style={{ color: SHOP_ACCENT, borderColor: `${SHOP_ACCENT}66`, background: `${SHOP_ACCENT}18` }}>
          <Tag size={10} /> {config.badge}
        </div>
      )}
      <h2 className="text-2xl md:text-3xl font-bold text-neutral-100">{title}</h2>
      {subtitle && <p className="mt-2 text-neutral-300 max-w-xl">{subtitle}</p>}
      {config.cta_label && (
        <Link to={link}
              className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl font-semibold text-sm text-neutral-900 hover:opacity-90 transition-opacity"
              style={{ background: SHOP_ACCENT }}
              data-testid="shopbaked-promo-cta">
          {config.cta_label} <ArrowRight size={14} />
        </Link>
      )}
    </section>
  );
};

// ------------------------------------------------------ BANNER TRIO ------
const BannerTrioSection = ({ section, testId }) => {
  const banners = section.config?.banners || [];
  if (!banners.length) return null;
  return (
    <section className="mb-12" data-testid={testId}>
      {(section.title || section.subtitle) && (
        <div className="mb-4">
          {section.title && <h2 className="text-xl font-semibold text-neutral-100">{section.title}</h2>}
          {section.subtitle && <p className="text-sm text-neutral-500 mt-1">{section.subtitle}</p>}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto lg:overflow-visible lg:grid lg:grid-cols-4 no-scrollbar pb-2 lg:pb-0"
           data-testid="shopbaked-banner-row">
        {banners.map((b, i) => {
          const img = abs(b.image);
          return (
            <Link key={i} to={b.link || "/shop"}
                  className="group relative rounded-2xl overflow-hidden flex items-end p-5 hover:-translate-y-0.5 transition-transform shrink-0"
                  style={{
                    width: 320, minHeight: 258, maxWidth: "100%",
                    background: img
                      ? `linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.75) 100%), url(${img}) center/cover`
                      : `linear-gradient(160deg, ${SHOP_ACCENT_DEEP}33, #0a0a0a)`,
                  }}
                  data-testid={`shopbaked-banner-tile-${i}`}>
              <div className="relative text-white">
                {b.eyebrow && (
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">{b.eyebrow}</div>
                )}
                <div className="text-lg md:text-xl font-bold leading-tight">{b.label}</div>
                {b.subtitle && <div className="text-xs md:text-sm text-white/80 mt-1">{b.subtitle}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

// ------------------------------------------------ BRAND CAROUSEL ---------
const BrandCarouselSection = ({ section, testId }) => {
  const brands = section.config?.brands || [];
  if (brands.length === 0) return null;
  return (
    <section className="mb-12" data-testid={testId}>
      <h2 className="text-xl font-semibold text-neutral-100 mb-4">{section.title}</h2>
      <div className="flex flex-wrap gap-2" data-testid="shopbaked-brand-rail">
        {brands.map((b, i) => {
          const img = abs(b.image);
          return (
            <span key={b.name || i}
                  className="text-xs uppercase tracking-widest px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 inline-flex items-center gap-2">
              {img && <img src={img} alt={b.name} className="h-4 object-contain"
                           onError={(e) => (e.currentTarget.style.display = "none")} />}
              {b.name}
            </span>
          );
        })}
      </div>
    </section>
  );
};

// ------------------------------------------------ CTA STRIP --------------
const CtaStripSection = ({ section, testId, basePath = "/shop" }) => {
  const cfg = section.config || {};
  const link = (cfg.cta_link && cfg.cta_link.startsWith("/shopbaked"))
    ? cfg.cta_link.replace("/shopbaked", basePath) : (cfg.cta_link || basePath);
  return (
    <section className="mb-12" data-testid={testId}>
      <div className="relative overflow-hidden rounded-3xl p-8 md:p-14 text-center"
           style={{ background: `linear-gradient(90deg, ${SHOP_ACCENT} 0%, ${SHOP_ACCENT_DEEP} 100%)`, color: "#1a1300" }}>
        <div className="relative">
          <div className="text-2xl md:text-4xl font-bold tracking-tight">{section.title}</div>
          {section.subtitle && <p className="text-sm md:text-base mt-2 opacity-90 max-w-2xl mx-auto">{section.subtitle}</p>}
          {cfg.cta_label && (
            <Link to={link}
                  className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-black text-white text-sm font-bold hover:bg-black/85 transition"
                  data-testid="shopbaked-cta-strip-link">
              {cfg.cta_label} <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

// Section-type → renderer registry. Missing types render nothing.
const RENDERERS = {
  hero:                HeroSection,
  category_grid:       CategoryGridSection,
  product_carousel:    ProductCarouselSection,
  promotional_banner:  PromoBannerSection,
  banner_trio:         BannerTrioSection,
  brand_carousel:      BrandCarouselSection,
  cta_strip:           CtaStripSection,
};

export const ProductCard = ({ product, basePath = "/shop" }) => {
  const img = abs(product.images?.[0]);
  return (
    <Link
      to={`${basePath}/p/${product.id}`}
      data-testid={`shopbaked-product-card-${product.id}`}
      className="group block border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 hover:border-amber-400/60 transition-colors"
    >
      <div className="aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden">
        {img ? (
          <img src={img} alt={product.title}
               className="w-full h-full object-cover group-hover:scale-105 transition-transform"
               onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
};

export default ShopHome;
