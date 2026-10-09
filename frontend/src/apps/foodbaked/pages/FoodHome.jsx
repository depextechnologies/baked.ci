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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Bike, ShoppingBag, Utensils, Star, Clock, Truck, Heart, ChevronRight, ChevronLeft, Shield, Tag, Sparkles, MapPin } from "lucide-react";
import FavouriteButton from "../components/FavouriteButton";
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

const ServiceToggle = ({ value, onChange, language }) => {
  // French-default labels (per product): Livraison / À emporter / Sur place.
  // English swap in only when EN is active.
  const opts = [
    { code: "delivery", icon: Bike,
      label: language === "en" ? "Delivery" : "Livraison" },
    { code: "pickup",   icon: ShoppingBag,
      label: language === "en" ? "Pickup"   : "À emporter" },
    { code: "dine_in",  icon: Utensils,
      label: language === "en" ? "Dine-in"  : "Sur place" },
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
            aria-pressed={on}
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
      className="flex flex-col items-center gap-1.5 min-w-[88px] shrink-0"
    >
      <div
        className={`w-[5.5rem] h-[5.5rem] rounded-3xl overflow-hidden border-2 flex items-center justify-center transition-colors ${
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

const RestaurantCard = ({ r, currencySymbol = "CFA", mode = "delivery", language = "fr" }) => {
  const { t } = useTranslation("customer");
  const cuisines = (r.cuisines || []).slice(0, 2).join(" · ");
  const rating = Number(r.rating || 0).toFixed(1);
  // Mode-aware CTA label. Backend tags each card with `reservations_enabled`
  // so we never render a Book-a-Table button on a venue that disabled it.
  const isDineIn = mode === "dine_in" && r.reservations_enabled;
  const isPickup = mode === "pickup"  && (r.pickup_enabled || r.pickup_eligible);
  const ctaLabel = isDineIn
    ? (language === "fr" ? "Réserver une table" : "Book a table")
    : isPickup
      ? (language === "fr" ? "Commander à emporter" : "Order pickup")
      : null;
  return (
    <Link to={isDineIn ? `/foodbaked/restaurants/${r.slug}/reservations` : `/food/r/${r.slug}`}
          className="block min-w-[240px] w-[240px] shrink-0 rounded-2xl border border-border bg-card overflow-hidden motion-fast hover:border-[color:var(--food-accent)]"
          style={{ "--food-accent": GREEN }}
          data-testid={`food-restaurant-${r.id}`}>
      <div className="relative aspect-[4/3] bg-muted">
        <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-1 rounded-full flex items-center gap-1">
          <Clock size={10} />
          {r.eta_min && r.eta_max ? `${r.eta_min}–${r.eta_max} min` : `${r.prep_time_min}–${r.prep_time_max} min`}
        </span>
        <FavouriteButton
          type="restaurant"
          id={r.id}
          name={r.name}
          variant="overlay"
          size={14}
          testId={`food-fav-restaurant-${r.id}`}
          className="absolute top-2 right-2 w-8 h-8"
        />
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
        {ctaLabel ? (
          <div className="pt-2">
            <span data-testid={`food-restaurant-cta-${r.id}`}
                  className="inline-flex items-center justify-center w-full h-8 rounded-full text-[11px] font-semibold text-black"
                  style={{ backgroundColor: GREEN }}>
              {ctaLabel}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground pt-1">
            {r.delivery_fee === 0
              ? t("food.free_delivery", { defaultValue: "Free delivery" })
              : t("food.delivery_fee_line", { defaultValue: "{{fee}} {{cur}} delivery", fee: r.delivery_fee, cur: currencySymbol })}
          </div>
        )}
      </div>
    </Link>
  );
};

const CuisineTile = ({ c, language }) => {
  const name = language === "fr" ? (c.name_fr || c.name_en) : (c.name_en || c.name_fr);
  return (
    <Link
      to={`/food/restaurants?cuisines=${encodeURIComponent(c.code)}`}
      className="flex flex-col items-center gap-2 min-w-[88px] group outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--food-accent)] rounded-3xl"
      style={{ "--food-accent": GREEN }}
      data-testid={`food-cuisine-${c.code}`}
      aria-label={language === "fr" ? `Voir les restaurants ${name}` : `See ${name} restaurants`}
    >
      <div className="w-[5.5rem] h-[5.5rem] rounded-3xl overflow-hidden bg-muted ring-1 ring-border/60 transition-transform motion-fast group-hover:scale-105 group-active:scale-95">
        <img src={c.image} alt={name} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <span className="text-xs font-medium transition-colors group-hover:text-[color:var(--food-accent)]">
        {name}
      </span>
    </Link>
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
          {/* Floating top-right nav — Favourites entry (Phase 3 Favourites) */}
          <Link
            to="/foodbaked/favorites"
            data-testid="food-nav-favourites"
            className="absolute right-0 top-4 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur border border-white/25 hover:bg-white/25 motion-fast"
          >
            <Heart size={13} className="fill-red-500 text-red-500" />
            {t("food.nav_favourites", { defaultValue: "Mes Favoris" })}
          </Link>
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
            <ServiceToggle value={mode} onChange={setMode} language={language} />
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

const CategoryStrip = ({ row, data, activeCategory, setActiveCategory, language, t }) => {
  const nav = useNavigate();
  // Spec §2 — clicking a FOOD category must navigate to the dedicated
  // discovery page (NOT filter the Featured carousel in place). The "All"
  // chip stays on the home and resets the local category state.
  const onClick = (code) => {
    if (code === "all") { setActiveCategory("all"); return; }
    nav(`/food/restaurants?category=${encodeURIComponent(code)}`);
  };
  return (
    <section data-testid="food-section-categories">
      <SectionHeader
        row={row}
        language={language}
        defaultTitle={t("food.categories_title", { defaultValue: language === "fr" ? "Choisissez votre repas" : "Choose your meal" })}
        defaultSubtitle={t("food.categories_subtitle", { defaultValue: language === "fr" ? "Inspiré par des commandes récentes" : "Inspired by recent orders" })}
      />
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-6 min-w-max py-1">
          {data.categories.map((c) => (
            <CategoryChip
              key={c.code}
              category={c}
              isActive={activeCategory === c.code}
              onClick={() => onClick(c.code)}
              language={language}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const SectionHeader = ({ row, defaultTitle, defaultSubtitle, language, viewAll }) => {
  const title = bilingual(row, "title", language) || defaultTitle;
  const subtitle = bilingual(row, "subtitle", language) || defaultSubtitle;
  return (
    <div className="flex items-end justify-between mb-4 gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {viewAll && (
        <Link
          to={viewAll.to}
          data-testid={viewAll.testId || "section-view-all"}
          className="shrink-0 inline-flex items-center gap-1 text-xs md:text-sm font-semibold text-[color:var(--food-accent)] hover:underline motion-fast outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--food-accent)] rounded-full px-2 py-1"
          style={{ "--food-accent": GREEN }}
          aria-label={viewAll.ariaLabel || viewAll.label}
        >
          {viewAll.label} <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
};

const RestaurantCarousel = ({ row, data, activeCategory, loading, currencySymbol, language, t, mode }) => {
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
                     language={language}
                     viewAll={{
                       to: "/food/restaurants",
                       label: t("food.view_all", { defaultValue: language === "fr" ? "Voir tout" : "View All" }),
                       testId: `food-featured-view-all-${row?.id || "default"}`,
                       ariaLabel: language === "fr" ? "Voir tous les restaurants" : "View all restaurants",
                     }} />
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex gap-4 min-w-max">
          {loading && [1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[240px] w-[240px] h-[280px] rounded-2xl bg-muted animate-pulse" />
          ))}
          {!loading && list.length === 0 && (
            <div className="text-sm text-muted-foreground py-8" data-testid={`food-section-featured-empty-${row?.id || "default"}`}>
              {mode === "pickup"
                ? (language === "fr" ? "Aucun restaurant à emporter à proximité." : "No pickup restaurants nearby.")
                : mode === "dine_in"
                ? (language === "fr" ? "Aucun restaurant avec réservation ouverte à proximité." : "No dine-in restaurants with open reservations nearby.")
                : t("food.no_restaurants", { defaultValue: "No restaurants match this category yet." })}
            </div>
          )}
          {!loading && list.map((r) => <RestaurantCard key={r.id} r={r} currencySymbol={currencySymbol} mode={mode} language={language} />)}
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
        <div className="flex gap-6 min-w-max">
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

// ---------------------------------------------------------------------------
// Testimonials — two premium cards side-by-side on desktop, swipeable
// one-at-a-time carousel on mobile. Admin-driven via `config.items[]`.
// Legacy single-quote rows (config.quote_fr/en + meta_fr/en) auto-convert
// into one item so existing data keeps rendering.
// ---------------------------------------------------------------------------
const TestimonialCard = ({ item, language }) => {
  const quote  = language === "fr"
    ? (item.quote_fr || item.quote_en || item.quote || "")
    : (item.quote_en || item.quote_fr || item.quote || "");
  const author = language === "fr"
    ? (item.author_fr || item.author_en || item.author || "")
    : (item.author_en || item.author_fr || item.author || "");
  const role   = language === "fr"
    ? (item.role_fr || item.role_en || item.role || "")
    : (item.role_en || item.role_fr || item.role || "");
  const bgUrl  = absImg(item.background_image);
  const photo  = absImg(item.customer_image);
  return (
    <article
      data-testid={`food-testimonial-card-${item._key || item.id || "x"}`}
      className="relative h-full rounded-3xl overflow-hidden border border-white/10 bg-neutral-950 flex flex-col justify-between p-6 md:p-7 min-h-[220px]"
      style={bgUrl ? {
        background: `linear-gradient(135deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.72) 60%, rgba(0,0,0,0.6) 100%), url("${bgUrl}") center/cover no-repeat, #0a0a0a`,
      } : undefined}
    >
      <span
        className="absolute -top-2 left-5 text-7xl font-serif leading-none opacity-30 select-none"
        style={{ color: GREEN }}
        aria-hidden="true"
      >
        &ldquo;
      </span>
      <blockquote className="relative text-white text-sm md:text-base leading-relaxed pt-6">
        {quote}
      </blockquote>
      <div className="flex items-center gap-3 pt-5 mt-4 border-t border-white/10">
        {photo ? (
          <img
            src={photo}
            alt={author}
            loading="lazy"
            className="w-10 h-10 rounded-full object-cover ring-1 ring-white/20"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-black"
            style={{ background: GREEN }}
          >
            {(author || "?").trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">
            {author || (language === "fr" ? "Client vérifié" : "Verified customer")}
          </div>
          {role && <div className="text-[11px] text-white/60 truncate">{role}</div>}
        </div>
        <div className="flex" style={{ color: GREEN }} aria-label="5 stars">
          {[1,2,3,4,5].map((i) => <Star key={i} size={13} className="fill-current" />)}
        </div>
      </div>
    </article>
  );
};

const TestimonialBanner = ({ row, language, t }) => {
  // Build the ordered list of enabled testimonials. Legacy rows (single
  // quote_fr/en + meta_fr/en at the config root) become one item so no
  // existing admin content is lost.
  const items = useMemo(() => {
    const cfg = row?.config || {};
    const authored = Array.isArray(cfg.items) ? cfg.items : [];
    const normalised = authored
      .map((it, i) => ({ ...it, _key: it.id || `i${i}` }))
      .filter((it) => it.enabled !== false && (it.quote_fr || it.quote_en || it.quote));
    normalised.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const legacyQuote = cfg.quote_fr || cfg.quote_en || cfg.quote;
    if (normalised.length === 0 && legacyQuote) {
      normalised.push({
        _key: "legacy",
        quote_fr: cfg.quote_fr,
        quote_en: cfg.quote_en,
        author_fr: cfg.author_fr,
        author_en: cfg.author_en,
        role_fr: cfg.role_fr,
        role_en: cfg.role_en,
        background_image: cfg.background_image,
      });
    }
    return normalised;
  }, [row?.config]);

  // Admin preview escape hatch — show a soft placeholder so admins can see
  // the layout even when no items are enabled. Hidden in production.
  const isAdminPreview = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("preview_country");

  const title = bilingual(row, "title", language)
    || t("food.testimonials_title", { defaultValue: language === "fr" ? "Avis de nos clients" : "Customer Reviews" });

  const sheetRef = useRef(null);
  const [mobileIdx, setMobileIdx] = useState(0);

  if (items.length === 0) {
    if (!isAdminPreview) return null;
    return (
      <section
        data-testid={`food-section-testimonial-${row?.id || "default"}-empty`}
        className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
      >
        {language === "fr"
          ? "Aucun témoignage activé. Ajoutez-en dans l'admin pour qu'ils apparaissent ici."
          : "No testimonials enabled. Add some from Admin to show them here."}
      </section>
    );
  }

  // Pick the first 2 for the desktop grid; the rest overflow into the mobile
  // carousel (which cycles through ALL items so admins can author >2).
  const desktopItems = items.slice(0, 2);
  const mobileItems  = items;

  const onScroll = () => {
    const el = sheetRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== mobileIdx) setMobileIdx(idx);
  };

  return (
    <section data-testid={`food-section-testimonial-${row?.id || "default"}`}
             className="space-y-4">
      <h2 className="text-xl font-bold">{title}</h2>

      {/* Desktop — 2 cards side-by-side (3 cols on very wide screens if 3+ items) */}
      <div
        className="hidden md:grid gap-4 md:grid-cols-2"
        data-testid={`food-testimonials-desktop-${row?.id || "default"}`}
      >
        {desktopItems.map((it) => (
          <TestimonialCard key={it._key} item={it} language={language} />
        ))}
      </div>

      {/* Mobile — single card, swipeable carousel with pagination dots */}
      <div className="md:hidden">
        <div
          ref={sheetRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 gap-4"
          data-testid={`food-testimonials-mobile-${row?.id || "default"}`}
        >
          {mobileItems.map((it) => (
            <div key={it._key} className="snap-start shrink-0 w-full">
              <TestimonialCard item={it} language={language} />
            </div>
          ))}
        </div>
        {mobileItems.length > 1 && (
          <div
            className="flex justify-center gap-1.5 mt-3"
            data-testid={`food-testimonials-dots-${row?.id || "default"}`}
          >
            {mobileItems.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full transition-colors"
                style={{ background: i === mobileIdx ? GREEN : "rgba(255,255,255,0.25)" }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// -------------------------------------------------------------------------
// Top Brands For You — premium horizontal carousel (P0 Discovery)
// Reference inspiration provided by product; we match the circular logo +
// vertical name/ETA layout but keep BAKĒD's own chrome:
//   * BLACK bg in dark mode, WHITE bg in light mode (user-confirmed)
//   * Circular logo tile with 1px ring so logos never bleed into bg
//   * Name + ETA stacked below each logo
//   * Snap-scroll on mobile, nav arrows on desktop
//   * Brand grouping is backend-driven — one card per brand name, nearest
//     eligible branch wins (confirmed with product)
// -------------------------------------------------------------------------
const TopBrandsCarousel = ({ row, country, lat, lng, mode, language, t }) => {
  const scrollerRef = useRef(null);
  const [brands, setBrands]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const limit = row?.config?.limit || 10;
        const params = new URLSearchParams({ country, mode, limit });
        if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
          params.set("lat", lat); params.set("lng", lng);
        }
        const { data } = await axios.get(`${API}/api/food/brands/top?${params}`);
        if (!cancel) setBrands(data?.items || []);
      } catch { if (!cancel) setBrands([]); }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [country, lat, lng, mode, row?.id]);

  const title    = bilingual(row, "title", language)
                  || (language === "fr" ? "Les meilleures enseignes près de chez vous" : "Top brands for you");
  const subtitle = bilingual(row, "subtitle", language)
                  || (language === "fr" ? "Vos marques préférées à portée de clic" : "Your favourite brands, delivered");

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.75), behavior: "smooth" });
  };

  // Hide the whole section cleanly when nothing nearby serves this address.
  if (!loading && brands.length === 0) {
    // When customer hasn't picked a location yet, still show nothing —
    // the FoodHome will render the address CTA banner above.
    if (!lat && !lng) return null;
    return (
      <section data-testid="food-section-top-brands-empty"
               className="rounded-2xl bg-[rgb(var(--color-card))] border border-border p-6 text-center">
        <SectionHeader row={row} language={language}
                       defaultTitle={title} defaultSubtitle={subtitle} />
        <div className="text-sm text-muted-foreground flex items-center justify-center gap-2 py-6">
          <MapPin size={14} />
          {language === "fr"
            ? "Aucune enseigne ne livre encore à votre adresse. Essayez une autre adresse ou le mode à emporter."
            : "No brands deliver to this address yet. Try another address or pickup mode."}
        </div>
      </section>
    );
  }

  return (
    <section data-testid="food-section-top-brands"
             className="rounded-3xl p-5 md:p-6 bg-white dark:bg-black text-foreground">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-2">
          <button onClick={() => scrollBy(-1)}
                  data-testid="top-brands-prev"
                  aria-label="Previous"
                  className="h-9 w-9 rounded-full bg-card border border-border inline-flex items-center justify-center hover:scale-105 motion-fast">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scrollBy(1)}
                  data-testid="top-brands-next"
                  aria-label="Next"
                  className="h-9 w-9 rounded-full bg-card border border-border inline-flex items-center justify-center hover:scale-105 motion-fast">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollerRef}
           className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar -mx-5 px-5 pb-2"
           data-testid="top-brands-scroller">
        {(loading ? Array.from({ length: 6 }) : brands).map((b, i) => (
          loading ? (
            <div key={`sk-${i}`} className="snap-start shrink-0 w-28 flex flex-col items-center gap-2">
              <div className="h-24 w-24 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-2 w-14 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <Link key={b.restaurant_id}
                  to={`/foodbaked/restaurants/${b.slug}`}
                  data-testid={`top-brand-card-${b.restaurant_id}`}
                  className="snap-start shrink-0 w-28 flex flex-col items-center gap-2 group">
              <div className="relative h-24 w-24 rounded-full overflow-hidden ring-1 ring-border/60 bg-white shadow-sm transition-transform group-hover:scale-105 motion-fast">
                {b.image ? (
                  <img src={absImg(b.image)}
                       alt={b.brand}
                       className="h-full w-full object-cover"
                       loading="lazy" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xl font-bold text-muted-foreground">
                    {(b.brand || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="text-xs font-semibold text-center line-clamp-1 w-full px-1">
                {b.brand}
              </div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Clock size={10} />
                {b.eta_min && b.eta_max
                  ? `${b.eta_min}–${b.eta_max} min`
                  : (language === "fr" ? "— min" : "— min")}
              </div>
            </Link>
          )
        ))}
      </div>
    </section>
  );
};

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export const FoodHome = () => {
  const { t, i18n } = useTranslation("customer");
  const { country, countryCode, activeAddress, openAddressSelector,
          foodServiceMode, setFoodServiceMode } = useApp() || {};
  const language = (i18n?.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
  // Mode is now owned by the global context so it survives navigation to a
  // restaurant microsite and back; dine_in is the UI label, backend treats
  // it as "reservation".
  const mode = foodServiceMode || "delivery";
  const setMode = setFoodServiceMode;
  const [activeCategory, setActiveCategory] = useState("all");
  const [data, setData] = useState({ categories: [], cuisines: [], featured_restaurants: [] });
  const [homepage, setHomepage] = useState({ sections: [] });
  const [loading, setLoading] = useState(true);
  const currencySymbol = country?.currency_symbol || (countryCode === "IN" ? "₹" : "CFA");

  const lat = activeAddress?.lat ?? null;
  const lng = activeAddress?.lng ?? null;

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
        const homeParams = new URLSearchParams({ country: cc, mode });
        if (lat !== null && lng !== null) {
          homeParams.set("lat", lat); homeParams.set("lng", lng);
        }
        const [homeRes, hpRes] = await Promise.all([
          axios.get(`${API}/api/food/home?${homeParams}`),
          axios.get(`${API}/api/homepage?country=${cc}&module=food`).catch(() => ({ data: { sections: [] } })),
        ]);
        if (!cancel) { setData(homeRes.data); setHomepage(hpRes.data); }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [countryCode, lat, lng, mode]);

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

  const commonProps = { data, language, t, loading, currencySymbol, mode };

  return (
    <div className="min-h-screen" data-testid="food-home">
      {/* 1. HERO — always first; admin override via food_hero */}
      <HeroSection row={heroRow} mode={mode} setMode={setMode} countryCode={countryCode} language={language} t={t} />

      <div className="baked-container py-8 space-y-10">
        {/* No-address banner — nudges customers to pick a delivery location
            so distance/ETA/eligibility can be computed. Appears above the
            CMS rails and never when a lat/lng is already set. */}
        {(lat === null || lng === null) && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:border-amber-400/40 dark:text-amber-200 p-4 flex items-center justify-between gap-3"
               data-testid="food-home-set-address">
            <div className="flex items-center gap-3 min-w-0">
              <MapPin size={18} />
              <div className="text-sm">
                {language === "fr"
                  ? "Choisissez votre adresse de livraison pour voir uniquement les restaurants qui livrent chez vous."
                  : "Set your delivery address to see only restaurants that deliver to you."}
              </div>
            </div>
            <button type="button"
                    onClick={() => openAddressSelector && openAddressSelector()}
                    data-testid="food-home-set-address-btn"
                    className="h-9 px-3 rounded-full text-xs font-semibold bg-amber-500 text-black whitespace-nowrap">
              {language === "fr" ? "Choisir l'adresse" : "Set address"}
            </button>
          </div>
        )}

        {bodyRows.map((row) => {
          switch (row.section_type) {
            case "food_categories":
              return (
                <CategoryStrip key={row.id} row={row} language={language} t={t}
                               data={data}
                               activeCategory={activeCategory}
                               setActiveCategory={setActiveCategory} />
              );
            case "food_top_brands":
              return (
                <TopBrandsCarousel key={row.id} row={row}
                                   country={countryCode || "CI"}
                                   lat={lat} lng={lng} mode={mode}
                                   language={language} t={t} />
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
