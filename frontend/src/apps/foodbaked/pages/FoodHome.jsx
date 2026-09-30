/**
 * FoodHome — landing screen for /food (Mock-up 4).
 *
 * Sections (top → bottom):
 *   1. Hero banner (food photo + tagline)
 *   2. Search bar + Delivery/Pickup/Dine-in-Reserve toggle
 *   3. Category chip strip (12 chips, horizontal scroll)
 *   4. Featured Restaurants rail (horizontal cards)
 *   5. Promo strip (2 cards)
 *   6. Cuisines You'll Love (8 circular tiles)
 *   7. Why Choose FOODbakēd (4 USPs)
 *   8. Testimonial banner
 *
 * Phase 1 is UI-heavy but functional: the categories/cuisines/featured
 * cards render live data from `/api/food/home?country=<code>`. The
 * Delivery/Pickup/Dine-in toggle is local state only for now — Phase 2
 * will wire it into the restaurant detail page.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Bike, ShoppingBag, Utensils, Star, Clock, Truck, Heart, ChevronRight } from "lucide-react";
import { useApp } from "../../../contexts/BakedContexts";
import axios from "axios";
import FoodSearchDropdown from "../components/FoodSearchDropdown";

const API = process.env.REACT_APP_BACKEND_URL;
const GREEN = "#77BC1F";

// -------------------------------------------------------------------------
// Small view-only components
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

const CategoryChip = ({ category, isActive, onClick }) => {
  const { language } = useApp() || {};
  const name = language === "fr" ? (category.name_fr || category.name_en) : category.name_en;
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

const CuisineTile = ({ c }) => {
  const { language } = useApp() || {};
  const name = language === "fr" ? (c.name_fr || c.name_en) : c.name_en;
  return (
    <div className="flex flex-col items-center gap-2 min-w-[110px]" data-testid={`food-cuisine-${c.code}`}>
      <div className="w-24 h-24 rounded-xl overflow-hidden bg-muted">
        <img src={c.image} alt={name} className="w-full h-full object-cover hover:scale-105 transition-transform" />
      </div>
      <span className="text-xs font-medium">{name}</span>
    </div>
  );
};

const USPTile = ({ icon: Icon, title, subtitle }) => (
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

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export const FoodHome = () => {
  const { t } = useTranslation("customer");
  const { country, countryCode } = useApp() || {};
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
        const cc = encodeURIComponent(countryCode || "CI");
        // Fetch catalogue + admin-managed homepage sections in parallel.
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

  // Build a per-section-type map so the renderer can pull admin overrides
  // (title/subtitle/config) with a single lookup. Any section_type absent
  // from the map falls back to the hard-coded default below.
  const sx = React.useMemo(() => {
    const map = {};
    for (const s of homepage.sections || []) map[s.section_type] = s;
    return map;
  }, [homepage]);

  const heroCfg = sx.food_hero?.config || {};
  const heroBg = heroCfg.background_image
    || "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1600&h=700&fit=crop";
  const heroImg = heroBg.startsWith("http") || heroBg.startsWith("data:") ? heroBg : `${API}${heroBg}`;

  const promoBanners = sx.food_promos?.config?.banners || [];
  const uspTiles = sx.food_usps?.config?.usps || [];

  const filteredRestaurants = activeCategory === "all"
    ? data.featured_restaurants
    : data.featured_restaurants.filter((r) => (r.cuisines || []).includes(activeCategory));

  return (
    <div className="min-h-screen" data-testid="food-home">
      {/* 1. Hero — admin override via food_hero section */}
      <section className="relative overflow-hidden">
        <div
          className="relative min-h-[380px] flex items-center"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%), url("${heroImg}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="baked-container relative w-full">
            <div className="max-w-2xl text-white py-10 space-y-5">
              {heroCfg.eyebrow && (
                <div className="text-[11px] uppercase tracking-widest font-semibold text-white/70">
                  {heroCfg.eyebrow}
                </div>
              )}
              <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                {sx.food_hero?.title || t("food.hero_line1", { defaultValue: "Good Food" })}
                <br />
                <span style={{ color: GREEN }}>
                  {sx.food_hero?.subtitle || t("food.hero_line2", { defaultValue: "Brings People Together" })}
                </span>
              </h1>
              <p className="text-sm md:text-base text-white/80 max-w-lg">
                {t("food.hero_subtitle", { defaultValue: "Discover amazing restaurants, local favourites and global cuisines — only on FOODbakēd." })}
              </p>

              {/* Search bar (unified discovery) */}
              <FoodSearchDropdown
                mode={mode}
                country={countryCode || undefined}
                placeholder={t("food.search_placeholder", { defaultValue: "Search for restaurants, cuisines or dishes…" })}
                ctaLabel={t("food.search_btn", { defaultValue: "Search" })}
              />

              {/* Service toggle */}
              <ServiceToggle value={mode} onChange={setMode} />
            </div>
          </div>
        </div>
      </section>

      <div className="baked-container py-8 space-y-10">
        {/* 3. Category chips */}
        <section className="overflow-x-auto -mx-2 px-2">
          <div className="flex gap-3 min-w-max py-1">
            {data.categories.map((c) => (
              <CategoryChip
                key={c.code}
                category={c}
                isActive={activeCategory === c.code}
                onClick={() => setActiveCategory(c.code)}
              />
            ))}
          </div>
        </section>

        {/* 4. Featured Restaurants */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{sx.food_featured_restaurants?.title || t("food.featured_title", { defaultValue: "Featured Restaurants" })}</h2>
              {sx.food_featured_restaurants?.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{sx.food_featured_restaurants.subtitle}</p>
              )}
            </div>
            <button className="text-sm font-semibold flex items-center gap-1 hover:opacity-80" style={{ color: GREEN }}>
              {t("food.view_all", { defaultValue: "View All" })} <ChevronRight size={16} />
            </button>
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="flex gap-4 min-w-max">
              {loading && [1,2,3,4].map((i) => (
                <div key={i} className="min-w-[240px] w-[240px] h-[280px] rounded-2xl bg-muted animate-pulse" />
              ))}
              {!loading && filteredRestaurants.length === 0 && (
                <div className="text-sm text-muted-foreground py-8">
                  {t("food.no_restaurants", { defaultValue: "No restaurants match this category yet." })}
                </div>
              )}
              {!loading && filteredRestaurants.map((r) => (
                <RestaurantCard key={r.id} r={r} currencySymbol={currencySymbol} />
              ))}
            </div>
          </div>
        </section>

        {/* 5. Promo strip — admin override via food_promos section */}
        {promoBanners.length > 0 ? (
          <section data-testid="food-promos" className="grid gap-4 md:grid-cols-2">
            {promoBanners.map((b, i) => {
              const bgUrl = b.image ? (b.image.startsWith("http") ? b.image : `${API}${b.image}`) : "";
              return (
                <div key={i}
                     className="rounded-2xl overflow-hidden relative min-h-[160px] text-white"
                     style={bgUrl ? { background: `linear-gradient(90deg, rgba(0,0,0,0.8), rgba(0,0,0,0.35)), url("${bgUrl}") center/cover no-repeat, #0d0d0d` } : { background: "#0d0d0d" }}>
                  <div className="p-6 md:p-8 max-w-md">
                    <div className="text-xl md:text-2xl font-bold">{b.headline}</div>
                    {b.description && <p className="text-xs md:text-sm text-white/80 mt-2">{b.description}</p>}
                    {b.cta_label && (
                      <a href={b.cta_link || "#"}
                         className="mt-4 px-4 h-10 rounded-full text-xs font-semibold text-black inline-flex items-center gap-2"
                         style={{ backgroundColor: GREEN }}>
                        {b.cta_label} <ChevronRight size={14} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl overflow-hidden relative min-h-[140px]"
                 style={{ background: `linear-gradient(90deg, ${GREEN}44 0%, ${GREEN}0F 60%), url("https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=400&fit=crop") right/cover no-repeat, #0d0d0d` }}>
              <div className="p-6 md:p-8 max-w-md">
                <div className="text-xl md:text-2xl font-bold text-white">
                  {t("food.promo1_line1", { defaultValue: "Delicious" })}
                  <br />
                  {t("food.promo1_line2", { defaultValue: "Deals Every Day" })}
                </div>
                <p className="text-xs md:text-sm text-white/80 mt-2">
                  {t("food.promo1_sub", { defaultValue: "Save more on your favourite meals." })}
                </p>
                <button className="mt-4 px-4 h-10 rounded-full text-xs font-semibold text-black inline-flex items-center gap-2" style={{ backgroundColor: GREEN }}>
                  {t("food.promo1_cta", { defaultValue: "View Offers" })} <ChevronRight size={14} />
                </button>
              </div>
              <span className="absolute right-8 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full flex items-center justify-center text-black font-bold text-xs text-center leading-tight" style={{ backgroundColor: GREEN }}>
                UP TO<br />50%<br />OFF
              </span>
            </div>
            <div className="rounded-2xl bg-card border border-border p-6 flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
                <ShoppingBag size={26} />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold" style={{ color: GREEN }}>
                  {t("food.promo2_title", { defaultValue: "Free Delivery" })}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {t("food.promo2_sub", { defaultValue: "This Week" })}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t("food.promo2_note", { defaultValue: `On orders above 5,000 ${currencySymbol}`, currencySymbol })}
                </div>
                <button className="mt-3 px-3 h-9 rounded-full text-[11px] font-semibold text-black inline-flex items-center gap-1" style={{ backgroundColor: GREEN }}>
                  {t("food.promo2_cta", { defaultValue: "Order Now" })} <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 6. Cuisines You'll Love */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">{sx.food_cuisines?.title || t("food.cuisines_title", { defaultValue: "Cuisines You'll Love" })}</h2>
              {sx.food_cuisines?.subtitle && <p className="text-xs text-muted-foreground mt-1">{sx.food_cuisines.subtitle}</p>}
            </div>
            <button className="text-sm font-semibold flex items-center gap-1 hover:opacity-80" style={{ color: GREEN }}>
              {t("food.view_all", { defaultValue: "View All" })} <ChevronRight size={16} />
            </button>
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="flex gap-4 min-w-max">
              {data.cuisines.map((c) => <CuisineTile key={c.code} c={c} />)}
            </div>
          </div>
        </section>

        {/* 7. Why Choose — admin override via food_usps section */}
        <section>
          <h2 className="text-xl font-bold mb-4">
            {sx.food_usps?.title || (
              <>
                {t("food.why_title", { defaultValue: "Why Choose " })}
                <span style={{ color: GREEN }}>FOOD</span>bakēd?
              </>
            )}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {uspTiles.length > 0 ? (
              uspTiles.map((u, i) => {
                const ICON_MAP = { shield: Heart, truck: Truck, sparkles: Star, tag: Star, clock: Clock, utensils: Utensils, star: Star, heart: Heart, shopping: ShoppingBag };
                const Icon = ICON_MAP[(u.icon || "star").toLowerCase()] || Star;
                return <USPTile key={i} icon={Icon} title={u.title} subtitle={u.subtitle} />;
              })
            ) : (
              <>
                <USPTile icon={Clock}      title={t("food.usp1_title", { defaultValue: "Quick Delivery" })}    subtitle={t("food.usp1_sub", { defaultValue: "Fresh food at your doorstep" })} />
                <USPTile icon={Utensils}   title={t("food.usp2_title", { defaultValue: "Wide Variety" })}      subtitle={t("food.usp2_sub", { defaultValue: "Local & global cuisines" })} />
                <USPTile icon={Star}       title={t("food.usp3_title", { defaultValue: "Great Deals" })}       subtitle={t("food.usp3_sub", { defaultValue: "Save more every day" })} />
                <USPTile icon={Heart}      title={t("food.usp4_title", { defaultValue: "Trusted Restaurants" })} subtitle={t("food.usp4_sub", { defaultValue: "Quality food, happy customers" })} />
              </>
            )}
          </div>
        </section>

        {/* 8. Testimonial */}
        <section className="rounded-2xl overflow-hidden relative min-h-[160px] flex items-center"
                 style={{ background: `linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.55)), url("https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&h=400&fit=crop") center/cover no-repeat` }}>
          <div className="px-8 py-10 text-white max-w-3xl">
            <p className="text-lg md:text-xl italic leading-snug">
              &ldquo;{t("food.testimonial_quote", { defaultValue: "FOODbakēd makes it so easy to discover amazing food near me. Great variety and super fast!" })}&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div className="flex" style={{ color: GREEN }}>
                {[1,2,3,4,5].map((i) => <Star key={i} size={14} className="fill-current" />)}
              </div>
              <span className="text-white/80">
                {t("food.testimonial_meta", { defaultValue: "4.8/5 from 10,000+ happy food lovers" })}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FoodHome;
