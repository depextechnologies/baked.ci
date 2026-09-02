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
import { useEffect, useMemo, useState } from "react";
import React from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  ArrowRight, Sparkles, ShieldCheck, Truck, Tag, ShoppingBag, Loader2, Plus,
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
// Fixing_Prompt v11: three-part hero + USP strip.
//   Desktop  → LEFT carousel (65-70%) + RIGHT top/bottom stacked promos,
//              followed by a 4-tile USP strip beneath.
//   Mobile   → ONLY the carousel. Right promos + USP strip are hidden
//              (they never mount, so no image bandwidth is wasted either).
// The whole block is driven by the CMS `hero` section's config JSONB:
//   config.slides[]        — array of {eyebrow, headline, description,
//                              image, badge, cta_label/cta_link,
//                              secondary_cta_label/secondary_cta_link}
//   config.right_top/bottom — {enabled, image, label, heading, description,
//                              cta_label, cta_link, badge}
//   config.usp[]           — [{icon, title, subtitle}, …]
// If `slides[]` is missing, the renderer falls back to the legacy single-
// hero fields so older seeds keep working.
const HeroSection = ({ section, testId, basePath = "/shop" }) => {
  const cfg = section.config || {};
  const resolveLink = (l) => (l && l.startsWith("/shopbaked")
    ? l.replace("/shopbaked", basePath)
    : (l || basePath));

  // Normalise: prefer slides[], else synthesise one from legacy fields.
  const rawSlides = Array.isArray(cfg.slides) && cfg.slides.length
    ? cfg.slides
    : [{
        eyebrow: "THE BAKĒD MARKETPLACE",
        headline: section.title,
        description: section.subtitle,
        image: cfg.background_image,
        cta_label: cfg.cta_label, cta_link: cfg.cta_link,
        secondary_cta_label: cfg.secondary_cta_label,
        secondary_cta_link: cfg.secondary_cta_link,
      }];
  const slides = rawSlides.filter((s) => s && (s.headline || s.image));
  const rightTop = cfg.right_top?.enabled === false ? null : cfg.right_top;
  const rightBottom = cfg.right_bottom?.enabled === false ? null : cfg.right_bottom;
  const usps = Array.isArray(cfg.usp) ? cfg.usp : [];

  return (
    <section className="mb-10" data-testid={testId}>
      {/* Row 1: carousel + right stack. Right column hidden < lg per spec. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <HeroCarousel slides={slides} resolveLink={resolveLink} />
        <div className="hidden lg:flex flex-col gap-4">
          {rightTop && <RightPromo promo={rightTop} resolveLink={resolveLink} testid="shopbaked-hero-right-top" />}
          {rightBottom && <RightPromo promo={rightBottom} resolveLink={resolveLink} testid="shopbaked-hero-right-bottom" />}
        </div>
      </div>

      {/* USP strip — desktop only. Never renders on mobile per spec §9. */}
      {usps.length > 0 && (
        <div className="hidden lg:grid gap-4 grid-cols-4 mt-6 pt-6 border-t border-neutral-800"
             data-testid="shopbaked-hero-usp">
          {usps.map((u, i) => <UspTile key={i} u={u} />)}
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- carousel
const HeroCarousel = ({ slides, resolveLink }) => {
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  // touch swipe state
  const touch = React.useRef({ x0: null, x1: null });

  React.useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  if (!slides.length) return null;
  const s = slides[idx];
  const bg = abs(s.image);

  const onTouchStart = (e) => { touch.current.x0 = e.touches[0].clientX; };
  const onTouchMove  = (e) => { touch.current.x1 = e.touches[0].clientX; };
  const onTouchEnd = () => {
    const { x0, x1 } = touch.current;
    if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40) {
      setIdx((i) => (x1 < x0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length));
    }
    touch.current = { x0: null, x1: null };
  };

  return (
    <div
      data-testid="shopbaked-hero-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 aspect-[16/10] lg:aspect-[16/9]"
      style={bg ? {
        background: `linear-gradient(90deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.15) 100%), url(${bg}) center/cover`,
      } : undefined}
    >
      {slides.map((sl, i) => (
        <img key={i} src={abs(sl.image)} alt="" aria-hidden={i !== idx}
             loading={i === 0 ? "eager" : "lazy"}
             className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === idx ? "opacity-100" : "opacity-0"}`}
             style={{ zIndex: 0 }}
             onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ))}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: "linear-gradient(90deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.5) 45%, rgba(0,0,0,.05) 100%)" }} />

      <div className="relative z-10 h-full flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-8 max-w-3xl"
           data-testid={`shopbaked-hero-slide-${idx}`}>
        {s.eyebrow && (
          <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-widest mb-3"
               style={{ color: SHOP_ACCENT }}>
            <Sparkles size={12} /> {s.eyebrow}
          </div>
        )}
        {s.badge && (
          <span className="self-start inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded mb-3"
                style={{ background: SHOP_ACCENT, color: "#0a0a0a" }}>
            {s.badge}
          </span>
        )}
        <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
          {s.headline}
        </h1>
        {s.description && (
          <p className="mt-3 sm:mt-5 text-neutral-300 max-w-xl text-sm sm:text-base">{s.description}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {s.cta_label && (
            <Link to={resolveLink(s.cta_link)}
                  className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ background: SHOP_ACCENT, color: "#0a0a0a" }}
                  data-testid={`shopbaked-hero-cta-${idx}`}>
              {s.cta_label} <ArrowRight size={14} />
            </Link>
          )}
          {s.secondary_cta_label && (
            <Link to={resolveLink(s.secondary_cta_link)}
                  className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl font-semibold text-sm bg-white/10 hover:bg-white/20 backdrop-blur border border-white/25 text-white inline-flex items-center gap-2">
              {s.secondary_cta_label}
            </Link>
          )}
        </div>
      </div>

      {/* Indicators */}
      {slides.length > 1 && (
        <div className="absolute z-10 bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2"
             data-testid="shopbaked-hero-indicators">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    data-testid={`shopbaked-hero-dot-${i}`}
                    className="motion-fast rounded-full"
                    style={{
                      width: i === idx ? 24 : 8, height: 8,
                      background: i === idx ? SHOP_ACCENT : "rgba(255,255,255,.5)",
                    }} />
          ))}
        </div>
      )}
    </div>
  );
};

const RightPromo = ({ promo, resolveLink, testid }) => {
  const img = abs(promo.image);
  return (
    <Link to={resolveLink(promo.cta_link)}
          data-testid={testid}
          className="relative rounded-2xl overflow-hidden border border-neutral-800 flex-1 min-h-[180px] flex flex-col justify-between p-5 group"
          style={{
            background: img
              ? `linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.7) 100%), url(${img}) center/cover`
              : `linear-gradient(160deg, ${SHOP_ACCENT_DEEP}44, #0a0a0a)`,
          }}>
      <div>
        {promo.badge && (
          <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded mb-2"
                style={{ background: "#FF4C52", color: "white" }}>
            {promo.badge}
          </span>
        )}
        {promo.label && (
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: SHOP_ACCENT }}>
            {promo.label}
          </div>
        )}
        <h3 className="text-lg font-bold text-white mt-1 leading-tight">{promo.heading}</h3>
        {promo.description && <p className="text-xs text-neutral-300 mt-1">{promo.description}</p>}
      </div>
      {promo.cta_label && (
        <span className="self-start mt-3 h-9 px-4 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 group-hover:opacity-90 transition-opacity"
              style={{ background: SHOP_ACCENT, color: "#0a0a0a" }}>
          {promo.cta_label} <ArrowRight size={12} />
        </span>
      )}
    </Link>
  );
};

const _USP_ICONS = { shield: ShieldCheck, truck: Truck, sparkles: Sparkles, tag: Tag };
const UspTile = ({ u }) => {
  const Icon = _USP_ICONS[u.icon] || Sparkles;
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
           style={{ background: `${SHOP_ACCENT}22`, color: SHOP_ACCENT }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold text-neutral-100">{u.title}</div>
        <div className="text-xs text-neutral-500 mt-0.5">{u.subtitle}</div>
      </div>
    </div>
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
// Single-row horizontal rail across ALL breakpoints:
//   • Mobile      → 2 cards visible per screen (basis-[46%])
//   • Tablet (sm) → 3 cards visible per screen
//   • Laptop (lg) → 4 cards visible per screen
//   • Desktop(xl) → 5 cards visible per screen
// Users can scroll right-to-left to reveal the rest. "View all" deep-links
// to the section's configured target (defaults to /shop/categories).
const ProductCarouselSection = ({ section, products, testId, basePath = "/shop" }) => {
  const limit = section.config?.limit || 12;
  const items = (products || []).slice(0, limit);
  const viewAllHref = section.config?.view_all_link
    ? (section.config.view_all_link.startsWith("/shopbaked")
        ? section.config.view_all_link.replace("/shopbaked", basePath)
        : section.config.view_all_link)
    : `${basePath}/categories`;

  // Desktop chevron nav — scroll by ~one page (rail's clientWidth) at a time.
  const railRef = React.useRef(null);
  const scrollBy = (dir) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

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
        <div className="relative group">
          {/* Single-row scroll rail. `basis-*` widths give:
                mobile 2 / sm 3 / lg 4 / xl 5 cards per viewport. */}
          <div
            ref={railRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 scroll-smooth"
            data-testid="shopbaked-product-carousel-rail"
          >
            {items.map((p) => (
              <div
                key={p.id}
                className="shrink-0 snap-start basis-[46%] sm:basis-[calc((100%-2rem)/3)] lg:basis-[calc((100%-3rem)/4)] xl:basis-[calc((100%-4rem)/5)]"
              >
                <ProductCard product={p} basePath={basePath} />
              </div>
            ))}
          </div>

          {/* Desktop-only prev/next chevrons — hidden on touch/mobile where
              natural horizontal swipe is the primary affordance. */}
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
            data-testid="shopbaked-carousel-prev"
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full items-center justify-center bg-neutral-900/90 border border-neutral-700 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-800"
          >
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
            data-testid="shopbaked-carousel-next"
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-10 h-10 rounded-full items-center justify-center bg-neutral-900/90 border border-neutral-700 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neutral-800"
          >
            <ArrowRight size={16} />
          </button>
        </div>
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
  const price = product.min_price;
  const compareAt = product.compare_at_price;
  const off = compareAt && price && compareAt > price
    ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
  const spec = React.useMemo(() => {
    const a = product.variant_attributes || {};
    const parts = [];
    if (a.size)     parts.push(`Size ${a.size}`);
    if (a.capacity) parts.push(a.capacity);
    if (a.colour)   parts.push(a.colour);
    if (product.variant_count > 1) parts.push(`+${product.variant_count - 1} options`);
    return parts.join(" · ");
  }, [product]);

  const addToCart = async (e) => {
    // MART-style + button — never navigates. Adds the cheapest variant.
    e.preventDefault();
    e.stopPropagation();
    if (!product.first_variant_id) return;
    try {
      const { api } = await import("@/lib/api");
      await api.post("/shop/cart/items", { variant_id: product.first_variant_id, quantity: 1 });
      const { toast } = await import("sonner");
      toast.success(`${product.title} added`);
    } catch (err) {
      const { toast } = await import("sonner");
      if (err?.response?.status === 401) toast.error("Please sign in to add to cart");
      else toast.error("Add to cart failed");
    }
  };

  return (
    <Link
      to={`${basePath}/p/${product.id}`}
      data-testid={`shopbaked-product-card-${product.id}`}
      className="group block border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/40 hover:border-amber-400/60 transition-colors relative"
    >
      <div className="aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden relative">
        {off > 0 && (
          <span className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: "#FF4C52", color: "white" }}>
            {off}% OFF
          </span>
        )}
        {img ? (
          <img src={img} alt={product.title}
               className="w-full h-full object-cover group-hover:scale-105 transition-transform"
               onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <span className="text-neutral-700 text-4xl">SHOP</span>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-neutral-100 line-clamp-2 min-h-[2.5rem]">{product.title}</div>
        {spec && <div className="text-[11px] text-neutral-500 mt-1 truncate">{spec}</div>}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {price != null ? (
              <>
                <div className="text-sm font-bold text-neutral-100">
                  {Number(price).toLocaleString()} {product.currency || "XOF"}
                </div>
                {compareAt && compareAt > price && (
                  <div className="text-[11px] text-neutral-500 line-through">
                    {Number(compareAt).toLocaleString()} {product.currency || "XOF"}
                  </div>
                )}
              </>
            ) : (
              <div className="text-[11px] text-neutral-500">Ships from Côte d'Ivoire</div>
            )}
          </div>
          {product.first_variant_id && (
            <button
              data-testid={`shopbaked-card-add-${product.id}`}
              onClick={addToCart}
              aria-label="Add to cart"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-black hover:scale-105 transition-transform"
              style={{ background: SHOP_ACCENT }}
            >
              <Plus size={18} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ShopHome;
