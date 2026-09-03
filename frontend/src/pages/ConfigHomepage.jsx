/**
 * ConfigHomepage — customer-facing homepage driven by CMS config
 *   fetched from GET /api/homepage?country=X.
 *
 * Phase C visual polish (2026-02):
 *   • Dark-first premium layout matching HomeLook.png reference
 *   • Every section theme-adaptive via CSS vars — light theme still works
 *   • Rich hero with side "delivery panel" (Delivery in, min order, fee)
 *   • Colour-coded module-switcher tiles (MART green / FOOD orange /
 *     SHOP cyan / SEND yellow / AUTO red / IMMO purple)
 *   • Horizontal snap-scroll product carousels
 *   • Category tiles with images + hover lift
 *   • Trust strip (delivery / range / prices / returns)
 *   • App promotion with QR + Play/App Store buttons
 *
 * Adding a new section type = new renderer in RENDERERS + schema entry in
 * admin editor (no core wiring change).
 */
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight, ChevronLeft, ChevronRight, Loader2, Smartphone, Store,
  Truck, Car, Home as HomeIcon, Package,
  Bike, Clock, Wallet, Tag, RotateCcw, MapPin,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { ProductCard } from "../components/mart/ProductCard";
import { formatMoney } from "../lib/i18n";

// Resolve `/api/homepage/uploads/…` relative URLs against the backend origin.
const abs = (u) => (u && u.startsWith("/") ? `${process.env.REACT_APP_BACKEND_URL}${u}` : u);

// Compact money — drops trailing .00 on whole values for the delivery panel.
const compactMoney = (v, cur) => {
  if (v == null) return "—";
  const s = formatMoney(v, cur, cur);
  return typeof s === "string" ? s.replace(/[.,]00\b/, "") : s;
};


export const ConfigHomepage = () => {
  const { country } = useApp();
  const [sections, setSections] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: hp } = await api.get(`/homepage?country=${country.code}`);
        if (!mounted) return;
        setSections(hp.sections || []);
      } catch (e) {
        setError(e?.response?.data?.detail || e?.message || "Homepage failed to load");
      }
    })();
    return () => { mounted = false; };
  }, [country.code]);

  if (error) {
    toast.error(error);
    return <div className="baked-container py-16 text-center text-sm text-muted-foreground">Homepage temporarily unavailable.</div>;
  }
  if (sections === null) {
    return <div className="py-24 text-center"><Loader2 className="animate-spin inline" size={22} /></div>;
  }
  if (sections.length === 0) {
    return <div className="baked-container py-16 text-center text-sm text-muted-foreground" data-testid="hp-empty">
      Homepage has no enabled sections. Configure at <Link to="/admin/homepage-management" className="text-primary underline">/admin/homepage-management</Link>.
    </div>;
  }

  return (
    <div data-testid="config-homepage" className="pb-16">
      {sections.map((s, i) => (
        <SectionRenderer key={s.id} section={s} index={i} country={country} />
      ))}
      {/* Persistent trust strip — always at the tail so admin can't accidentally hide it */}
      <TrustStrip />
    </div>
  );
};


/* ============================================================================
 * SECTION DISPATCH
 * ============================================================================ */

const SectionRenderer = ({ section, index, country }) => {
  const R = RENDERERS[section.section_type];
  if (!R) return null;
  return (
    <section
      className={index === 0 ? "mt-4 md:mt-6" : "mt-10 md:mt-14"}
      data-testid={`hp-section-${section.section_type}-${section.id}`}
    >
      <R section={section} country={country} />
    </section>
  );
};


/* ============================================================================
 * SHARED HEADER
 * ============================================================================ */

const SectionHeader = ({ title, subtitle, linkLabel, linkTo, eyebrow, testid }) => (
  <div className="baked-container flex items-end justify-between mb-5" data-testid={testid}>
    <div className="min-w-0">
      {eyebrow && (
        <div className="text-[10px] font-semibold tracking-[.2em] uppercase text-[#77BC1F] mb-1">
          {eyebrow}
        </div>
      )}
      {title && (
        <h2 className="text-xl md:text-3xl font-bold tracking-tight leading-tight">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-sm md:text-base text-muted-foreground mt-1.5 max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
    {linkTo && (
      <Link
        to={linkTo}
        className="hidden md:inline-flex items-center gap-1 text-xs uppercase tracking-widest text-[#77BC1F] hover:text-[#77BC1F]/80 font-semibold whitespace-nowrap ml-4"
      >
        {linkLabel || "View all"} <ArrowRight size={12} />
      </Link>
    )}
  </div>
);


/* ============================================================================
 * HERO — full-bleed with side delivery info panel
 * ============================================================================ */

const Hero = ({ section, country }) => {
  const nav = useNavigate();
  const cfg = section.config || {};
  const bg = abs(cfg.background_image) ||
    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&fit=crop&q=70";
  const minOrder = country?.min_order;
  const deliveryFee = country?.delivery_fee;
  const freeOver = country?.free_delivery_over;
  const currency = country?.currency_symbol || country?.currency || "";
  const etaText = country?.delivery_eta_min || "10-15 min";
  const etaMatch = etaText.match(/(\d+\s*-\s*\d+|\d+)/);
  const etaValue = etaMatch ? etaMatch[1].replace(/\s+/g, "") : "10-15";

  return (
    <div className="baked-container">
      <div className="grid md:grid-cols-[1.4fr_.9fr] gap-4">
        {/* LEFT — big hero image w/ text overlay */}
        <div
          className="relative overflow-hidden rounded-3xl min-h-[300px] md:min-h-[420px] flex items-end"
          style={{
            background: `linear-gradient(90deg, rgba(0,0,0,.85) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.15) 100%), url(${bg}) center/cover`,
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 -120px 120px -60px rgba(0,0,0,.6)" }} />
          <div className="relative p-6 md:p-10 max-w-xl text-white">
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-[#77BC1F]/25 border border-[#77BC1F]/50 backdrop-blur text-[11px] font-semibold uppercase tracking-widest mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#77BC1F] animate-pulse" /> MARTbakēd
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-[1.05] tracking-tight" data-testid="hp-hero-title">
              {section.title}
            </h1>
            {section.subtitle && (
              <p className="mt-3 text-sm md:text-base text-white/85 max-w-md">{section.subtitle}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {cfg.cta_label && (
                <button
                  onClick={() => nav(cfg.cta_link || "/products")}
                  className="h-12 px-6 rounded-xl text-sm font-bold bg-[#77BC1F] hover:bg-[#68a319] text-white transition-colors flex items-center gap-2"
                  data-testid="hp-hero-cta"
                >
                  {cfg.cta_label} <ArrowRight size={16} />
                </button>
              )}
              {cfg.secondary_cta_label && (
                <button
                  onClick={() => nav(cfg.secondary_cta_link || "/products")}
                  className="h-12 px-6 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 backdrop-blur border border-white/25 text-white flex items-center gap-2"
                  data-testid="hp-hero-cta-secondary"
                >
                  {cfg.secondary_cta_label}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — delivery panel (country-aware) */}
        <div className="rounded-3xl p-6 md:p-8 flex flex-col justify-between gap-4 relative overflow-hidden"
             style={{ background: "linear-gradient(160deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)" }}
             data-testid="hp-hero-delivery-panel">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Delivery in</div>
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-4xl md:text-5xl font-bold tracking-tight">{etaValue}</div>
              <div className="text-base font-semibold text-muted-foreground">min</div>
              <div className="ml-auto w-14 h-14 rounded-2xl bg-[#77BC1F]/15 flex items-center justify-center">
                <Bike size={26} className="text-[#77BC1F]" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Free delivery on orders over <span className="text-foreground font-semibold">{compactMoney(freeOver, currency)}</span></p>
          </div>
          <div className="border-t border-border/60 pt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Delivery fee</div>
              <div className="text-sm font-bold mt-0.5">
                {compactMoney(deliveryFee, currency)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Min. order</div>
              <div className="text-sm font-bold mt-0.5">
                {compactMoney(minOrder, currency)}
              </div>
            </div>
          </div>
          <div className="border-t border-border/60 pt-4">
            <div className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 text-[#77BC1F] shrink-0" />
              <div className="text-xs">
                <div className="text-muted-foreground">Popular near you</div>
                <div className="text-sm font-semibold mt-0.5 truncate">{country?.name || "Your city"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


/* ============================================================================
 * (module_switcher renderer removed per client request — 2026-02)
 * The switcher tab-bar still exists globally in the customer top-nav; the
 * homepage no longer duplicates it as a section.
 * ============================================================================ */

const MODULE_ROUTES = {
  mart: "/", food: "/food", shop: "/shop", express: "/express", auto: "/auto", immo: "/immo",
};
void MODULE_ROUTES;


/* ============================================================================
 * CATEGORY GRID
 * ============================================================================ */

const CategoryGrid = ({ section }) => {
  const cats = section.config?.categories || [];
  const cols = section.config?.columns || 6;
  const colClass = cols >= 6
    ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
    : "grid-cols-3 sm:grid-cols-4";
  return (
    <div className="baked-container">
      <SectionHeader
        eyebrow="Shop by category"
        title={section.title || "Categories"}
        subtitle={section.subtitle}
        linkTo="/categories"
        linkLabel="View all"
      />
      <div className={`grid ${colClass} gap-3 md:gap-4`}>
        {cats.map((c) => {
          // QA — Fixing_Prompt "Home #3": prefer explicit `link` when the
          // admin has set one; otherwise deep-link to the category filter.
          const target = c.link || `/products?category=${c.slug}`;
          return (
          <Link
            key={c.slug || c.name}
            to={target}
            className="group rounded-2xl bg-card border border-border p-3 md:p-4 flex flex-col items-center gap-3 hover:border-[#77BC1F]/60 hover:-translate-y-0.5 transition-all"
            data-testid={`hp-cat-${c.slug || c.name}`}
          >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-[#77BC1F]/10 overflow-hidden flex items-center justify-center relative">
              {c.image ? (
                <img
                  src={abs(c.image)}
                  alt={c.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <Store size={26} className="text-[#77BC1F]" />
              )}
            </div>
            <div className="text-xs md:text-sm font-semibold text-center leading-tight">{c.name}</div>
          </Link>
          );
        })}
      </div>
    </div>
  );
};


/* ============================================================================
 * PROMOTIONAL BANNER
 * ============================================================================ */

const PromoBanner = ({ section }) => {
  const cfg = section.config || {};
  const inner = (
    <div
      className="rounded-3xl overflow-hidden relative min-h-[180px] md:min-h-[260px] flex items-center"
      style={{
        background: cfg.image
          ? `linear-gradient(90deg, rgba(0,0,0,.65) 0%, rgba(0,0,0,.15) 60%, transparent 100%), url(${abs(cfg.image)}) center/cover`
          : "linear-gradient(120deg, #77BC1F 0%, #3b6b0f 100%)",
      }}
    >
      <div className="p-6 md:p-12 max-w-xl text-white">
        {cfg.badge && (
          <div className="inline-block px-3 h-6 leading-6 rounded-full bg-white/20 backdrop-blur text-[11px] font-bold uppercase tracking-widest mb-3">
            {cfg.badge}
          </div>
        )}
        {section.title && <div className="text-2xl md:text-4xl font-bold leading-tight">{section.title}</div>}
        {section.subtitle && <div className="text-sm md:text-base text-white/85 mt-2 max-w-md">{section.subtitle}</div>}
        {cfg.cta_label && (
          <div className="mt-5">
            <span className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white text-black text-sm font-bold">
              {cfg.cta_label} <ArrowRight size={16} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div className="baked-container">
      {cfg.link
        ? <Link to={cfg.link} data-testid="hp-promo-link">{inner}</Link>
        : inner}
    </div>
  );
};


/* ============================================================================
 * BANNER ROW — up to 4 fixed-size promo cards (320w × 258h) in one row.
 * Backend key kept as `banner_trio` to preserve API + config compat.
 * ============================================================================ */

const BannerTrio = ({ section }) => {
  const banners = section.config?.banners || [];
  return (
    <div className="baked-container">
      {(section.title || section.subtitle) && (
        <SectionHeader title={section.title} subtitle={section.subtitle} />
      )}
      {/* Horizontal scroll on smaller screens; 4-across on ≥1360px so 4×320+gaps fits. */}
      <div
        className="flex gap-4 overflow-x-auto lg:overflow-visible lg:grid lg:grid-cols-4 no-scrollbar pb-2 lg:pb-0 -mx-1 px-1"
        data-testid="hp-banner-row"
      >
        {banners.map((b, i) => (
          <Link
            key={i}
            to={b.link || "/products"}
            className="group relative rounded-2xl overflow-hidden flex items-end p-5 hover:-translate-y-0.5 transition-transform shrink-0"
            style={{
              width: 320,
              minHeight: 258,
              maxWidth: "100%",
              background: b.image
                ? `linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.75) 100%), url(${abs(b.image)}) center/cover`
                : "linear-gradient(160deg, #262626, #0a0a0a)",
            }}
            data-testid={`hp-trio-${i}`}
          >
            <div className="relative text-white">
              {b.eyebrow && (
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">{b.eyebrow}</div>
              )}
              <div className="text-lg md:text-xl font-bold leading-tight">{b.label}</div>
              {b.subtitle && <div className="text-xs md:text-sm text-white/80 mt-1">{b.subtitle}</div>}
            </div>
            <div className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight size={16} className="text-white" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};


/* ============================================================================
 * PRODUCT CAROUSEL — horizontal snap-scroll
 * ============================================================================ */

const ProductCarousel = ({ section, country }) => {
  const cfg = section.config || {};
  const limit = Number(cfg.limit) || 12;
  const scrollRef = React.useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fixing_Prompt v5 §11 — filter products by the section's category slug.
  // Any `filter` value that's not a keyword (bestsellers/new) is treated as
  // a category slug and passed to the server-side query. This eliminates
  // cross-category leakage in homepage sections.
  const filter = (cfg.filter || "").trim();
  const isKeyword = ["", "bestsellers", "new", "newest", "featured"].includes(filter.toLowerCase());
  const categorySlug = isKeyword ? null : filter;
  const subcategorySlug = (cfg.subcategory || "").trim() || null;
  const sortKey = filter.toLowerCase() === "new" || filter.toLowerCase() === "newest" ? "newest" : "popularity";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          country: country.code,
          limit: String(limit),
          sort: sortKey,
        });
        if (categorySlug) params.set("category", categorySlug);
        if (subcategorySlug) params.set("subcategory", subcategorySlug);
        const { data } = await api.get(`/mart/products?${params.toString()}`);
        if (mounted) setProducts(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [country.code, categorySlug, subcategorySlug, limit, sortKey]);

  const slice = products.slice(0, limit);
  if (loading) {
    return (
      <div className="baked-container">
        <h2 className="text-xl md:text-3xl font-bold tracking-tight leading-tight mb-5">{section.title}</h2>
        <div className="flex gap-3 overflow-hidden" data-testid={`hp-carousel-skeleton-${section.id}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[46%] sm:w-[32%] md:w-[22%] lg:w-[18%] aspect-[3/4] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (!slice.length) {
    // Empty-state so the admin notices the section returns nothing —
    // previously this silently swallowed misconfigured category filters.
    return (
      <div className="baked-container">
        <h2 className="text-xl md:text-3xl font-bold tracking-tight leading-tight mb-3">{section.title}</h2>
        <p className="text-xs text-muted-foreground" data-testid={`hp-carousel-empty-${section.id}`}>
          No products{categorySlug ? ` in "${categorySlug}"` : ""} yet.
        </p>
      </div>
    );
  }

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const w = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  return (
    <div>
      <div className="baked-container flex items-end justify-between mb-5">
        <div>
          <h2 className="text-xl md:text-3xl font-bold tracking-tight leading-tight">
            {section.title}
          </h2>
          {section.subtitle && (
            <p className="text-sm md:text-base text-muted-foreground mt-1.5 max-w-2xl">{section.subtitle}</p>
          )}
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => scroll(-1)} className="w-10 h-10 rounded-full border border-border bg-card hover:bg-muted transition flex items-center justify-center" data-testid={`hp-carousel-prev-${section.id}`}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => scroll(1)} className="w-10 h-10 rounded-full border border-border bg-card hover:bg-muted transition flex items-center justify-center" data-testid={`hp-carousel-next-${section.id}`}>
            <ChevronRight size={18} />
          </button>
          {(() => {
            // QA — Fixing_Prompt "Home #2": derive "View all" from the
            // carousel's category filter when the admin hasn't set an
            // explicit link. Only shows when there's a real target.
            const explicit = cfg.link;
            const derived = categorySlug
              ? `/products?category=${categorySlug}${subcategorySlug ? `&subcategory=${subcategorySlug}` : ""}`
              : null;
            const href = explicit || derived;
            return href && (
              <Link to={href} data-testid={`hp-carousel-viewall-${section.id}`}
                    className="ml-2 inline-flex items-center gap-1 text-xs uppercase tracking-widest text-[#77BC1F] font-semibold">
                View all <ArrowRight size={12} />
              </Link>
            );
          })()}
        </div>
      </div>
      <div className="baked-container">
        <div
          ref={scrollRef}
          className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 no-scrollbar -mx-1 px-1"
          data-testid={`hp-carousel-${section.id}`}
        >
          {slice.map((p) => (
            <div key={p.id} className="snap-start shrink-0 w-[46%] sm:w-[32%] md:w-[22%] lg:w-[18%]">
              <ProductCard product={p} country={country} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


/* ============================================================================
 * BRAND CAROUSEL
 * ============================================================================ */

const BrandCarousel = ({ section }) => {
  const brands = section.config?.brands || [];
  return (
    <div className="baked-container">
      <SectionHeader title={section.title} subtitle={section.subtitle} eyebrow="Brands we love" />
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex gap-6 md:gap-10 items-center overflow-x-auto no-scrollbar">
          {brands.map((b, i) => (
            <div
              key={i}
              className="h-16 w-28 md:w-32 shrink-0 rounded-xl flex items-center justify-center p-3 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition"
              data-testid={`hp-brand-${i}`}
            >
              {b.image ? (
                <img
                  src={abs(b.image)}
                  alt={b.name}
                  className="max-h-12 max-w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.replaceWith(
                      Object.assign(document.createElement("span"), { className: "text-xs font-semibold", textContent: b.name })
                    );
                  }}
                />
              ) : (
                <span className="text-xs font-bold uppercase tracking-wider">{b.name}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


/* ============================================================================
 * APP PROMOTION — QR + Play/App Store + phone screenshot
 * ============================================================================ */

const AppPromotion = ({ section }) => {
  const cfg = section.config || {};
  return (
    <div className="baked-container">
      <div className="relative rounded-3xl overflow-hidden p-6 md:p-10 grid md:grid-cols-[1.2fr_.9fr] gap-6 items-center"
           style={{ background: "linear-gradient(120deg, #0f2a05 0%, #1a4d0a 60%, #2b7a15 100%)" }}>
        <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(119,188,31,.35), transparent 70%)" }} />
        <div className="relative text-white">
          {cfg.logo && <img src={abs(cfg.logo)} alt="app" className="w-16 h-16 rounded-2xl mb-4" onError={(e) => (e.currentTarget.style.display = "none")} />}
          <div className="text-[11px] font-bold uppercase tracking-[.2em] text-[#c9f086] mb-2">Get the app</div>
          <h2 className="text-2xl md:text-4xl font-bold leading-tight">{section.title}</h2>
          <p className="text-sm md:text-base text-white/85 mt-3 max-w-md">{section.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {cfg.google_play_url && (
              <a href={cfg.google_play_url} target="_blank" rel="noreferrer"
                 className="h-12 px-5 rounded-xl bg-black hover:bg-black/80 text-white text-sm font-semibold flex items-center gap-3 border border-white/20"
                 data-testid="hp-google-play">
                <Smartphone size={18} />
                <span className="flex flex-col leading-none text-left">
                  <span className="text-[10px] text-white/70">GET IT ON</span>
                  <span className="text-sm font-bold">Google Play</span>
                </span>
              </a>
            )}
            {cfg.app_store_url && (
              <a href={cfg.app_store_url} target="_blank" rel="noreferrer"
                 className="h-12 px-5 rounded-xl bg-black hover:bg-black/80 text-white text-sm font-semibold flex items-center gap-3 border border-white/20"
                 data-testid="hp-app-store">
                <Smartphone size={18} />
                <span className="flex flex-col leading-none text-left">
                  <span className="text-[10px] text-white/70">DOWNLOAD ON THE</span>
                  <span className="text-sm font-bold">App Store</span>
                </span>
              </a>
            )}
          </div>
          {cfg.qr_target && (
            <div className="mt-6 flex items-center gap-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(cfg.qr_target)}`}
                   alt="QR" className="rounded-lg bg-white p-2" data-testid="hp-qr" />
              <div className="text-xs text-white/80 max-w-[160px]">Scan to download BAKĒD on your phone.</div>
            </div>
          )}
        </div>
        {cfg.phone_screenshot ? (
          <div className="relative hidden md:flex justify-center items-end">
            <img src={abs(cfg.phone_screenshot)} alt="app screen"
                 className="max-h-[440px] drop-shadow-2xl rounded-[36px]"
                 onError={(e) => (e.currentTarget.style.display = "none")} />
          </div>
        ) : (
          <div className="relative hidden md:flex items-center justify-center">
            {/* Decorative BAKĒD app tile fallback */}
            <div className="w-56 h-96 rounded-[40px] bg-black/40 border-4 border-white/10 shadow-2xl flex items-center justify-center p-6">
              <Package size={72} className="text-[#77BC1F]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


/* ============================================================================
 * CTA STRIP
 * ============================================================================ */

const CtaStrip = ({ section }) => {
  const cfg = section.config || {};
  return (
    <div className="baked-container">
      <div className="relative overflow-hidden rounded-3xl p-8 md:p-14 text-center"
           style={{ background: "linear-gradient(90deg, #77BC1F 0%, #4a7d0a 100%)", color: "#0a1200" }}>
        <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(255,255,255,.35), transparent 60%)" }} />
        <div className="relative">
          <div className="text-2xl md:text-4xl font-bold tracking-tight">{section.title}</div>
          {section.subtitle && <p className="text-sm md:text-base mt-2 opacity-90 max-w-2xl mx-auto">{section.subtitle}</p>}
          {cfg.cta_label && (
            <Link
              to={cfg.cta_link || "/products"}
              className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-black text-white text-sm font-bold hover:bg-black/85 transition"
              data-testid="hp-cta-strip-link"
            >
              {cfg.cta_label} <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};


/* ============================================================================
 * TRUST STRIP — always-on footer badges
 * ============================================================================ */

const TRUST = [
  { icon: Bike,    color: "#77BC1F", title: "Super fast delivery",  desc: "10-15 min average" },
  { icon: Package, color: "#F97316", title: "Wide range of products", desc: "Everything you need" },
  { icon: Tag,     color: "#06B6D4", title: "Best prices & offers",  desc: "Save more every day" },
  { icon: RotateCcw, color: "#A855F7", title: "Easy returns", desc: "Hassle-free refunds" },
];
const TrustStrip = () => (
  <div className="baked-container mt-14 md:mt-16">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 rounded-2xl bg-card border border-border p-5 md:p-6" data-testid="hp-trust-strip">
      {TRUST.map((t, i) => {
        const Icon = t.icon;
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: `${t.color}22`, color: t.color }}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight">{t.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);


// Suppress lint — used inline in Hero panel
void formatMoney;
void Clock;
void Wallet;

const RENDERERS = {
  hero:                Hero,
  category_grid:       CategoryGrid,
  promotional_banner:  PromoBanner,
  banner_trio:         BannerTrio,
  product_carousel:    ProductCarousel,
  brand_carousel:      BrandCarousel,
  app_promotion:       AppPromotion,
  cta_strip:           CtaStrip,
};

export default ConfigHomepage;
