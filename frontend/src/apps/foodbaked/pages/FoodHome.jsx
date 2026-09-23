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
            {r.is_open ? "Open" : "Closed"}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground pt-1">
          {r.delivery_fee === 0 ? "Free delivery" : `${r.delivery_fee} ${currencySymbol} delivery`}
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
  const [loading, setLoading] = useState(true);
  const currencySymbol = country?.currency_symbol || (countryCode === "IN" ? "₹" : "CFA");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const { data: home } = await axios.get(`${API}/api/food/home?country=${encodeURIComponent(countryCode || "CI")}`);
        if (!cancel) setData(home);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [countryCode]);

  const filteredRestaurants = activeCategory === "all"
    ? data.featured_restaurants
    : data.featured_restaurants.filter((r) => (r.cuisines || []).includes(activeCategory));

  return (
    <div className="min-h-screen" data-testid="food-home">
      {/* 1. Hero */}
      <section className="relative overflow-hidden">
        <div
          className="relative min-h-[380px] flex items-center"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%), url("https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1600&h=700&fit=crop")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="baked-container relative w-full">
            <div className="max-w-2xl text-white py-10 space-y-5">
              <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                {t("food.hero_line1", { defaultValue: "Good Food" })}
                <br />
                <span style={{ color: GREEN }}>
                  {t("food.hero_line2", { defaultValue: "Brings People Together" })}
                </span>
              </h1>
              <p className="text-sm md:text-base text-white/80 max-w-lg">
                {t("food.hero_subtitle", { defaultValue: "Discover amazing restaurants, local favourites and global cuisines — only on FOODbakēd." })}
              </p>

              {/* Search bar */}
              <div className="flex bg-white rounded-full overflow-hidden max-w-xl shadow-xl">
                <div className="flex items-center gap-2 px-4 flex-1">
                  <Search size={16} className="text-neutral-500" />
                  <input
                    type="text"
                    placeholder={t("food.search_placeholder", { defaultValue: "Search for restaurants, cuisines or dishes…" })}
                    className="flex-1 bg-transparent outline-none py-3 text-sm text-neutral-800"
                    data-testid="food-search-input"
                  />
                </div>
                <button
                  className="px-6 text-sm font-semibold text-black"
                  style={{ backgroundColor: GREEN }}
                  data-testid="food-search-btn"
                >
                  {t("food.search_btn", { defaultValue: "Search" })}
                </button>
              </div>

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
            <h2 className="text-xl font-bold">{t("food.featured_title", { defaultValue: "Featured Restaurants" })}</h2>
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

        {/* 5. Promo strip */}
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

        {/* 6. Cuisines You'll Love */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{t("food.cuisines_title", { defaultValue: "Cuisines You'll Love" })}</h2>
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

        {/* 7. Why Choose */}
        <section>
          <h2 className="text-xl font-bold mb-4">
            {t("food.why_title", { defaultValue: "Why Choose " })}
            <span style={{ color: GREEN }}>FOOD</span>bakēd?
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <USPTile icon={Clock}      title={t("food.usp1_title", { defaultValue: "Quick Delivery" })}    subtitle={t("food.usp1_sub", { defaultValue: "Fresh food at your doorstep" })} />
            <USPTile icon={Utensils}   title={t("food.usp2_title", { defaultValue: "Wide Variety" })}      subtitle={t("food.usp2_sub", { defaultValue: "Local & global cuisines" })} />
            <USPTile icon={Star}       title={t("food.usp3_title", { defaultValue: "Great Deals" })}       subtitle={t("food.usp3_sub", { defaultValue: "Save more every day" })} />
            <USPTile icon={Heart}      title={t("food.usp4_title", { defaultValue: "Trusted Restaurants" })} subtitle={t("food.usp4_sub", { defaultValue: "Quality food, happy customers" })} />
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
