/**
 * FoodHome — CMS-DRIVEN FOODbakēd customer landing page.
 *
 * Layout composition
 * ------------------
 * The order and visibility of every block below the hero is driven by
 * `/api/homepage?country=<cc>&module=food`. The orchestrator fetches the
 * ordered list of ENABLED sections once and dispatches each one to a
 * typed renderer:
 *
 *   section_type === "food_hero"               → <HeroSection>
 *   section_type === "food_categories"         → <CategoryStrip>
 *   section_type === "food_featured_restaurants" → <RestaurantCarousel>
 *   section_type === "food_cuisines"           → <CuisineCarousel>
 *   section_type === "food_promos"             → <PromoStrip>
 *   section_type === "food_usps"               → <USPGrid>
 *   section_type === "food_testimonial"        → <TestimonialBanner>
 *
 * Multiple rows of the SAME type (e.g. two promo strips at different
 * depths) are supported — each row renders independently. If a section_type
 * is unknown it is quietly skipped so adding a type on the backend never
 * breaks the live page.
 *
 * When the CMS returns ZERO sections (fresh country install), the page
 * falls back to a sensible hardcoded default list so the live site is
 * never empty.
 *
 * The HERO is always rendered first (if a food_hero row exists, the admin
 * version wins — otherwise a tasteful default). Everything else is pure
 * admin-driven ordering.
 *
 * The platform shell (global header, cart, location, search) is OUTSIDE
 * this file and remains untouched.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Bike, ShoppingBag, Utensils, Star, Clock, Truck, Heart, ChevronRight, Shield, Tag, Sparkles } from "lucide-react";
import { useApp } from "../../../contexts/BakedContexts";
import axios from "axios";
import FoodSearchDropdown from "../components/FoodSearchDropdown";

const API   = process.env.REACT_APP_BACKEND_URL;
const GREEN = "#77BC1F";

const absImg = (p) => (p && (p.startsWith("http") || p.startsWith("data:")) ? p : (p ? `${API}${p}` : ""));
const bilingual = (row, field, lang) => {
  // Prefer the FR title/subtitle by default; `title_en` / `subtitle_en` live
  // under `config` when authored, falling back to the single stored field.
  if (lang === "en") return row?.config?.[`${field}_en`] || row?.[field] || "";
  return row?.config?.[`${field}_fr`] || row?.[field] || "";
};

// -------------------------------------------------------------------------
// Shared presentational pieces
// -------------------------------------------------------------------------

const ServiceToggle = ({ value, onChange }) => {
  const { t } = useTranslation("customer");
  const opts = [
    { code: "delivery",  label: t("food.mode_delivery",  { defaultValue: "Delivery" }),  icon: Bike },
    { code: "pickup",    label: t("food.mode_pickup",    { defaultValue: "Pickup" }),    icon: ShoppingBag },
    { code: "dine_in",   label: t("food.mode_dine_in",   { defaultValue: "Dine-in / Reserve" }), icon: Utensils },
  ];
  return (
    <div className="flex flex-wrap gap-2" data-testid="food-service-toggle">
      {opts.map(({ code, label, icon: Icon }) => {
        const on = value === code;
        return (
          <button
            key={code}
            onClick={() => onChange(code)}
            data-testid={`food-mode-${code}`}
            className={`px-4 h-10 rounded-full flex items-center gap-2 text-xs font-semibold border motion-fast ${
              on ? "text-black" : "bg-card text-foreground border-border hover:bg-secondary"
            }`}
            style={on ? { backgroundColor: GREEN, borderColor: GREEN } : {}}
          >
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );
};

const CategoryChip = ({ category, isActive, onClick, language }) => {
  const name = language === "fr" ? (category.name_fr || category.name_en) : (category.name_en || category.name_fr);
  return (
    <button
      onClick={onClick}
      data-testid={`food-category-${category.code}`}
      className="flex flex-col items-center gap-1.5 min-w-[64px] shrink-0"
    >
      <div
        className={`w-14 h-14 rounded-2xl overflow-hidden border-2 flex items-center justify-center transition-colors ${
          isActive ? "border-[color:var(--food-accent)]" : "border-border"
        }`}
        style={{ "--food-accent": GREEN }}
      >
        {category.image ? (
          <img src={category.image} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-secondary" />
        )}
      </div>
      <span className={`text-[11px] font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
        {name}
      </span>
    </button>
  );
};

const RestaurantCard = ({ r, currencySymbol = "CFA" }) => {
  const { t } = useTranslation("customer");
  const cuisines = (r.cuisines || []).slice(0, 2).join(" · ");
  const rating = Number(r.rating || 0).toFixed(1);
  return (
    <Link to={`/food/r/${r.slug}`}
          className="block min-w-[240px] w-[240px] shrink-0 rounded-2xl border border-border bg-card overflow-hidden motion-fast hover:border-[color:var(--food-accent)]"
          style={{ "--food-accent": GREEN }}
          data-testid={`food-restaurant-${r.id}`}>
      <div className="relative aspect-[4/3] bg-muted">
        <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-1 rounded-full flex items-center gap-1">
          <Clock size={10} /> {r.prep_time_min}–{r.prep_time_max} min
        </span>
        <button aria-label="Favourite" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:text-red-400 motion-fast">
          <Heart size={14} />
        </button>
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-semibold truncate">{r.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{cuisines}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] flex items-center gap-1">
            <Star size={11} className="fill-current" style={{ color: GREEN }} /> {rating}
            <span className="text-muted-foreground">({r.review_count})</span>
          </span>
          <span
            className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              r.is_open ? "text-black" : "bg-secondary text-muted-foreground"
            }`}
            style={r.is_open ? { backgroundColor: `${GREEN}33`, color: GREEN } : {}}
          >
            {r.is_open ? t("food.open") : t("food.closed")}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground pt-1">
          {r.delivery_fee === 0
            ? t("food.free_delivery", { defaultValue: "Free delivery" })
            : t("food.delivery_fee_line", { defaultValue: "{{fee}} {{cur}} delivery", fee: r.delivery_fee, cur: currencySymbol })}
        </div>
      </div>
    </Link>
  );
};

const CuisineTile = ({ c, language }) => {
  const name = language === "fr" ? (c.name_fr || c.name_en) : (c.name_en || c.name_fr);
  return (
    <div className="flex flex-col items-center gap-2 min-w-[110px]" data-testid={`food-cuisine-${c.code}`}>
      <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted">
        <img src={c.image} alt={name} className="w-full h-full object-cover hover:scale-105 transition-transform" />
      </div>
      <span className="text-xs font-medium">{name}</span>
    </div>
  );
};

const USP_ICON_MAP = { shield: Shield, truck: Truck, sparkles: Sparkles, tag: Tag, clock: Clock, utensils: Utensils, star: Star, heart: Heart, shopping: ShoppingBag };

const USPTile = ({ iconKey, title, subtitle }) => {
  const Icon = USP_ICON_MAP[(iconKey || "star").toLowerCase()] || Star;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Section renderers — one per section_type. All receive the admin row,
// the catalogue data (`data`) and the UI language.
// -------------------------------------------------------------------------

const HeroSection = ({ row, mode, setMode, countryCode, language, t }) => {
  const cfg = row?.config || {};
  const heroBg = cfg.background_image
    || "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1600&h=700&fit=crop";
  const img = absImg(heroBg);
  const headline = bilingual(row, "title", language) || t("food.hero_line1", { defaultValue: "Good Food" });
  const sub      = bilingual(row, "subtitle", language) || t("food.hero_line2", { defaultValue: "Brings People Together" });
  return (
    <section className="relative overflow-hidden" data-testid="food-section-hero">
      <div
        className="relative min-h-[380px] flex items-center"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%), url("${img}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="baked-container relative w-full">
          <div className="max-w-2xl text-white py-10 space-y-5">
            {cfg.eyebrow && (
              <div className="text-[11px] uppercase tracking-widest font-semibold text-white/70">{cfg.eyebrow}</div>
            )}
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              {headline}
              {sub && (<><br /><span style={{ color: GREEN }}>{sub}</span></>)}
            </h1>
            <p className="text-sm md:text-base text-white/80 max-w-lg">
              {bilingual(row, "tagline", language) || t("food.hero_subtitle", { defaultValue: "Discover amazing restaurants, local favourites and global cuisines — only on FOODbakēd." })}
            </p>
            <FoodSearchDropdown
              mode={mode}
              country={countryCode || undefined}
              placeholder={t("food.search_placeholder", { defaultValue: "Search for restaurants, cuisines or dishes…" })}
              ctaLabel={t("food.search_btn", { defaultValue: "Search" })}
            />
            <ServiceToggle value={mode} onChange={setMode} />
            {cfg.cta_label && cfg.cta_link && (
              <a href={cfg.cta_link}
                 className="inline-flex items-center gap-2 px-4 h-10 rounded-full text-xs font-semibold text-black"
                 style={{ backgroundColor: GREEN }}
                 data-testid="food-hero-cta">
                {cfg.cta_label} <ChevronRight size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const CategoryStrip = ({ data, activeCategory, setActiveCategory, language }) => (
  <section className="overflow-x-auto -mx-2 px-2" data-testid="food-section-categories">
    <div className="flex gap-3 min-w-max py-1">
      {data.categories.map((c) => (
        <CategoryChip
          key={c.code}
          category={c}
          isActive={activeCategory === c.code}
          onClick={() => setActiveCategory(c.code)}
          language={language}
        />
      ))}
    </div>
  </section>
);

const SectionHeader = ({ row, defaultTitle, defaultSubtitle, language }) => {
  const title = bilingual(row, "title", language) || defaultTitle;
  const subtitle = bilingual(row, "subtitle", language) || defaultSubtitle;
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};

const RestaurantCarousel = ({ row, data, activeCategory, loading, currencySymbol, language, t }) => {
  const cuisineFilter = row?.config?.cuisine_filter;
  const limit = row?.config?.limit;
  const list = useMemo(() => {
    let xs = data.featured_restaurants || [];
    if (cuisineFilter) xs = xs.filter((r) => (r.cuisines || []).includes(cuisineFilter));
    if (activeCategory && activeCategory !== "all") xs = xs.filter((r) => (r.cuisines || []).includes(activeCategory));
    if (limit) xs = xs.slice(0, Number(limit));
    return xs;
  }, [data, cuisineFilter, limit, activeCategory]);
  return (
    <section data-testid={`food-section-featured-${row?.id || "default"}`}>
      <SectionHeader row={row}
                     defaultTitle={t("food.featured_title", { defaultValue: "Featured Restaurants" })}
                     language={language} />
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-4 min-w-max">
          {loading && [1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[240px] w-[240px] h-[280px] rounded-2xl bg-muted animate-pulse" />
          ))}
          {!loading && list.length === 0 && (
            <div className="text-sm text-muted-foreground py-8">
              {t("food.no_restaurants", { defaultValue: "No restaurants match this category yet." })}
            </div>
          )}
          {!loading && list.map((r) => <RestaurantCard key={r.id} r={r} currencySymbol={currencySymbol} />)}
        </div>
      </div>
    </section>
  );
};

const PromoStrip = ({ row, language }) => {
  const banners = row?.config?.banners || [];
  if (banners.length === 0) return null;
  const lang = language;
  return (
    <section data-testid={`food-section-promos-${row.id}`} className="grid gap-4 md:grid-cols-2">
      {banners.map((b, i) => {
        const headline = (lang === "en" ? b.headline_en : b.headline_fr) || b.headline || "";
        const desc     = (lang === "en" ? b.description_en : b.description_fr) || b.description || "";
        const cta      = (lang === "en" ? b.cta_label_en : b.cta_label_fr) || b.cta_label || "";
        const bgUrl    = absImg(b.image);
        return (
          <div key={i}
               className="rounded-2xl overflow-hidden relative min-h-[160px] text-white"
               data-testid={`food-promo-${row.id}-${i}`}
               style={bgUrl ? { background: `linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.35)), url("${bgUrl}") center/cover no-repeat, #0d0d0d` } : { background: "#0d0d0d" }}>
            <div className="p-6 md:p-8 max-w-md">
              <div className="text-xl md:text-2xl font-bold">{headline}</div>
              {desc && <p className="text-xs md:text-sm text-white/80 mt-2">{desc}</p>}
              {cta && (
                <a href={b.cta_link || "#"}
                   className="mt-4 px-4 h-10 rounded-full text-xs font-semibold text-black inline-flex items-center gap-2"
                   style={{ backgroundColor: GREEN }}>
                  {cta} <ChevronRight size={14} />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
};

const CuisineCarousel = ({ row, data, language, t }) => {
  const limit = row?.config?.limit;
  const xs = limit ? (data.cuisines || []).slice(0, Number(limit)) : data.cuisines;
  return (
    <section data-testid={`food-section-cuisines-${row?.id || "default"}`}>
      <SectionHeader row={row}
                     defaultTitle={t("food.cuisines_title", { defaultValue: "Cuisines You'll Love" })}
                     language={language} />
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-4 min-w-max">
          {xs.map((c) => <CuisineTile key={c.code} c={c} language={language} />)}
        </div>
      </div>
    </section>
  );
};

const USPGrid = ({ row, language, t }) => {
  const usps = row?.config?.usps || [];
  const titleFallback = (
    <>
      {t("food.why_title", { defaultValue: "Why Choose " })}
      <span style={{ color: GREEN }}>FOOD</span>bakēd?
    </>
  );
  return (
    <section data-testid={`food-section-usps-${row?.id || "default"}`}>
      <h2 className="text-xl font-bold mb-4">{bilingual(row, "title", language) || titleFallback}</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {usps.length > 0 ? usps.map((u, i) => {
          const title = language === "en" ? (u.title_en || u.title) : (u.title_fr || u.title);
          const sub   = language === "en" ? (u.subtitle_en || u.subtitle) : (u.subtitle_fr || u.subtitle);
          return <USPTile key={i} iconKey={u.icon} title={title} subtitle={sub} />;
        }) : (
          <>
            <USPTile iconKey="clock"    title={t("food.usp1_title", { defaultValue: "Quick Delivery" })}      subtitle={t("food.usp1_sub", { defaultValue: "Fresh food at your doorstep" })} />
            <USPTile iconKey="utensils" title={t("food.usp2_title", { defaultValue: "Wide Variety" })}        subtitle={t("food.usp2_sub", { defaultValue: "Local & global cuisines" })} />
            <USPTile iconKey="tag"      title={t("food.usp3_title", { defaultValue: "Great Deals" })}         subtitle={t("food.usp3_sub", { defaultValue: "Save more every day" })} />
            <USPTile iconKey="heart"    title={t("food.usp4_title", { defaultValue: "Trusted Restaurants" })} subtitle={t("food.usp4_sub", { defaultValue: "Quality food, happy customers" })} />
          </>
        )}
      </div>
    </section>
  );
};

const TestimonialBanner = ({ row, language, t }) => {
  const quote  = bilingual(row, "quote", language)  || t("food.testimonial_quote",  { defaultValue: "FOODbakēd makes it so easy to discover amazing food near me. Great variety and super fast!" });
  const meta   = bilingual(row, "meta",  language)  || t("food.testimonial_meta",   { defaultValue: "4.8/5 from 10,000+ happy food lovers" });
  const bgUrl  = absImg(row?.config?.background_image) || "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&h=400&fit=crop";
  return (
    <section data-testid={`food-section-testimonial-${row?.id || "default"}`}
             className="rounded-2xl overflow-hidden relative min-h-[160px] flex items-center"
             style={{ background: `linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.55)), url("${bgUrl}") center/cover no-repeat` }}>
      <div className="px-8 py-10 text-white max-w-3xl">
        <p className="text-lg md:text-xl italic leading-snug">&ldquo;{quote}&rdquo;</p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <div className="flex" style={{ color: GREEN }}>
            {[1,2,3,4,5].map((i) => <Star key={i} size={14} className="fill-current" />)}
          </div>
          <span className="text-white/80">{meta}</span>
        </div>
      </div>
    </section>
  );
};

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export const FoodHome = () => {
  const { t, i18n } = useTranslation("customer");
  const { country, countryCode } = useApp() || {};
  const language = (i18n?.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
  const [mode, setMode] = useState("delivery");
  const [activeCategory, setActiveCategory] = useState("all");
  const [data, setData] = useState({ categories: [], cuisines: [], featured_restaurants: [] });
  const [homepage, setHomepage] = useState({ sections: [] });
  const [loading, setLoading] = useState(true);
  const currencySymbol = country?.currency_symbol || (countryCode === "IN" ? "₹" : "CFA");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        // Admin preview escape hatch — /foodbaked?preview_country=IN lets Super
        // Admin see any country's homepage without flipping their location.
        const url = new URL(window.location.href);
        const previewCc = url.searchParams.get("preview_country");
        const cc = encodeURIComponent(previewCc || countryCode || "CI");
        const [homeRes, hpRes] = await Promise.all([
          axios.get(`${API}/api/food/home?country=${cc}`),
          axios.get(`${API}/api/homepage?country=${cc}&module=food`).catch(() => ({ data: { sections: [] } })),
        ]);
        if (!cancel) { setData(homeRes.data); setHomepage(hpRes.data); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [countryCode]);

  // ---------------------------------------------------------------------
  // Build the ORDERED section list. Each admin row is honoured — including
  // multiple rows of the same type. When the CMS returns zero rows the
  // page renders an "empty state" CTA pointing admins at the configurator
  // (parity with the MARTbakēd CMS behaviour).
  // ---------------------------------------------------------------------
  const sections = useMemo(() => {
    return (homepage.sections || []).slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }, [homepage.sections]);

  // Empty-state when the CMS has nothing enabled for this country.
  if (!loading && sections.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" data-testid="food-home-empty">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-xl font-bold">
            {language === "fr"
              ? "Aucune section FOODbakēd configurée pour ce pays"
              : "No FOODbakēd sections configured for this country"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {language === "fr"
              ? "Configurez la page d'accueil dans /admin/modules/food/homepage-management."
              : "Set up the homepage in /admin/modules/food/homepage-management."}
          </p>
        </div>
      </div>
    );
  }

  // Extract the hero row (always rendered at the TOP, full-bleed, above the
  // content container). All other sections live inside the container with
  // tight vertical spacing.
  const heroRow = sections.find((s) => s.section_type === "food_hero");
  const bodyRows = sections.filter((s) => s.section_type !== "food_hero");

  const commonProps = { data, language, t, loading, currencySymbol };

  return (
    <div className="min-h-screen" data-testid="food-home">
      {/* 1. HERO — always first; admin override via food_hero */}
      <HeroSection row={heroRow} mode={mode} setMode={setMode} countryCode={countryCode} language={language} t={t} />

      <div className="baked-container py-8 space-y-10">
        {bodyRows.map((row) => {
          switch (row.section_type) {
            case "food_categories":
              return (
                <CategoryStrip key={row.id} language={language}
                               data={data}
                               activeCategory={activeCategory}
                               setActiveCategory={setActiveCategory} />
              );
            case "food_featured_restaurants":
              return (
                <RestaurantCarousel key={row.id} row={row}
                                    activeCategory={activeCategory}
                                    {...commonProps} />
              );
            case "food_promos":
              return <PromoStrip key={row.id} row={row} language={language} />;
            case "food_cuisines":
              return <CuisineCarousel key={row.id} row={row} {...commonProps} />;
            case "food_usps":
              return <USPGrid key={row.id} row={row} language={language} t={t} />;
            case "food_testimonial":
              return <TestimonialBanner key={row.id} row={row} language={language} t={t} />;
            default:
              // Unknown section_type — quietly skip so adding a new type
              // on the backend doesn't crash the live page.
              return null;
          }
        })}
      </div>
    </div>
  );
};

export default FoodHome;
