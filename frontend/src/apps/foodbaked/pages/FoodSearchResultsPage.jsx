/**
 * FoodSearchResultsPage — `/foodbaked/search?q=…`
 *
 * Full-page browser for the same search API used by the hero dropdown.
 * Groups: All · Restaurants · Dishes · Cuisines · Reservations.
 *
 * Shares its behaviour with the category Discovery page:
 *  - Same Filters bottom-sheet (Sort, Cuisines, Rating, Cost, Dietary,
 *    Availability) and Pure-Veg quick chip.
 *  - Flat 15 km discovery radius from the customer's selected address.
 *  - Delivery-mode: cards inside 15 km but outside their own delivery
 *    zone keep rendering with the "Livraison indisponible" banner and a
 *    disabled delivery CTA (same UX as the category page).
 *  - Pickup / Dine-in: only eligible rows are returned.
 *  - Mode toggle lives in the GLOBAL app state (`foodServiceMode`), so
 *    switching modes here persists back to the hero and vice-versa.
 *  - Filters sync to the URL — refresh and share work out of the box.
 *
 * Clicking a card routes to the canonical restaurant microsite
 * (`/foodbaked/restaurants/:slug` and variants).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  Search as SearchIcon, Loader2, AlertTriangle, Star, Utensils, ChefHat,
  Bike, ShoppingBag, ChevronRight, SlidersHorizontal, Clock, MapPin,
} from "lucide-react";
import { useApp } from "../../../contexts/BakedContexts";
import { cuisineLabelFr, cuisineLabelEn } from "../components/FoodSearchDropdown";
import { FoodFilterSheet } from "../components/FoodFilterSheet";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#77BC1F";

const money = (v, curr = "XOF", loc = "fr-FR") =>
  new Intl.NumberFormat(loc, { style: "currency", currency: curr, maximumFractionDigits: 0 }).format(v || 0);

export const FoodSearchResultsPage = () => {
  const { t, i18n } = useTranslation("customer");
  const {
    country, countryCode, activeAddress, openAddressSelector,
    foodServiceMode, setFoodServiceMode,
  } = useApp() || {};
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const mode = foodServiceMode || "delivery";
  const initialGroup = params.get("group") || "all";
  const [group, setGroup] = useState(initialGroup);
  const [inputQ, setInputQ] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const nav = useNavigate();
  const isFr = (i18n?.language || "fr").toLowerCase().startsWith("fr");
  const isFrLoc = isFr ? "fr-FR" : "en-US";
  const language = isFr ? "fr" : "en";
  const label = (fr, en) => (isFr ? fr : en);
  const currencySymbol = country?.currency_symbol || (countryCode === "IN" ? "₹" : "CFA");

  // ---- Filter state (URL-driven, mirrors FoodDiscoveryPage) --------------
  const [sort,       setSort]       = useState(params.get("sort") || "popularity");
  const [cuisines,   setCuisines]   = useState((params.get("cuisines") || "").split(",").filter(Boolean));
  const [minRating,  setMinRating]  = useState(Number(params.get("min_rating")) || null);
  const [minPrice,   setMinPrice]   = useState(params.get("min_price") ? Number(params.get("min_price")) : null);
  const [maxPrice,   setMaxPrice]   = useState(params.get("max_price") ? Number(params.get("max_price")) : null);
  const [vegetarian, setVegetarian] = useState(params.get("vegetarian") || "all");
  const [openNow,    setOpenNow]    = useState(params.get("open_now") === "1");
  const [draft,      setDraft]      = useState({});
  const [sheet,      setSheet]      = useState(false);

  // Sync filters + query to URL so refresh / share works.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (group && group !== "all") next.set("group", group);
    if (sort && sort !== "popularity") next.set("sort", sort);
    if (cuisines.length)       next.set("cuisines", cuisines.join(","));
    if (minRating)             next.set("min_rating", String(minRating));
    if (minPrice != null)      next.set("min_price",  String(minPrice));
    if (maxPrice != null)      next.set("max_price",  String(maxPrice));
    if (vegetarian && vegetarian !== "all") next.set("vegetarian", vegetarian);
    if (openNow)               next.set("open_now", "1");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, group, sort, cuisines, minRating, minPrice, maxPrice, vegetarian, openNow]);

  const runSearch = useCallback(async () => {
    if (!q || q.length < 1) { setData(null); return; }
    setLoading(true); setError(false);
    try {
      const qp = {
        q, mode: mode || undefined, country: countryCode, limit: 24,
        radius_km: 15, sort,
      };
      if (activeAddress?.lat != null) {
        qp.lat = activeAddress.lat;
        qp.lng = activeAddress.lng;
      }
      if (cuisines.length) qp.cuisines = cuisines.join(",");
      if (minRating) qp.min_rating = minRating;
      if (minPrice != null) qp.min_price = minPrice;
      if (maxPrice != null) qp.max_price = maxPrice;
      if (vegetarian && vegetarian !== "all") qp.vegetarian = vegetarian;
      if (openNow) qp.open_now = true;
      const res = await axios.get(`${API}/api/food/search`, { params: qp });
      setData(res.data);
    } catch {
      setError(true);
    } finally { setLoading(false); }
  }, [q, mode, countryCode, activeAddress?.lat, activeAddress?.lng,
      sort, cuisines, minRating, minPrice, maxPrice, vegetarian, openNow]);

  useEffect(() => { runSearch(); }, [runSearch]);

  const changeMode = (m) => { setFoodServiceMode?.(m); };
  const submitInput = (e) => {
    e.preventDefault();
    const s = inputQ.trim();
    if (!s) return;
    const next = new URLSearchParams(params);
    next.set("q", s);
    setParams(next, { replace: true });
  };

  const totalHits = useMemo(() => {
    if (!data) return 0;
    return (data.restaurants?.length || 0) + (data.dishes?.length || 0)
         + (data.cuisines?.length || 0) + (data.reservations?.length || 0);
  }, [data]);

  const activeFilterCount =
    (cuisines.length ? 1 : 0) + (minRating ? 1 : 0) +
    (minPrice != null || maxPrice != null ? 1 : 0) +
    (vegetarian && vegetarian !== "all" ? 1 : 0) + (openNow ? 1 : 0) +
    (sort !== "popularity" ? 1 : 0);

  const openSheet = () => {
    setDraft({
      sort, cuisines, min_rating: minRating, min_price: minPrice,
      max_price: maxPrice, vegetarian,
      availability: openNow ? "open_now" : null,
    });
    setSheet(true);
  };
  const applySheet = () => {
    setSort(draft.sort || "popularity");
    setCuisines(draft.cuisines || []);
    setMinRating(draft.min_rating || null);
    setMinPrice(draft.min_price ?? null);
    setMaxPrice(draft.max_price ?? null);
    setVegetarian(draft.vegetarian || "all");
    setOpenNow(draft.availability === "open_now");
    setSheet(false);
  };
  const clearSheet = () => {
    setDraft({
      sort: "popularity", cuisines: [], min_rating: null,
      min_price: null, max_price: null, vegetarian: "all",
      availability: null,
    });
  };

  const modeOpts = [
    { code: "delivery", label: t("food.mode_delivery"), icon: Bike },
    { code: "pickup",   label: t("food.mode_pickup"),   icon: ShoppingBag },
    { code: "dine_in",  label: t("food.mode_dine_in"),  icon: Utensils },
  ];

  const groupOpts = [
    { code: "all",          label: t("food.search_all_tab"),           count: totalHits },
    { code: "restaurants",  label: t("food.search_group_restaurants"), count: data?.restaurants?.length || 0 },
    { code: "dishes",       label: t("food.search_group_dishes"),      count: data?.dishes?.length      || 0 },
    { code: "cuisines",     label: t("food.search_group_cuisines"),    count: data?.cuisines?.length    || 0 },
    { code: "reservations", label: t("food.search_group_reservations"),count: data?.reservations?.length|| 0 },
  ];

  return (
    <div className="min-h-screen" data-testid="food-search-results-page">
      <section className="border-b border-border">
        <div className="baked-container py-6 space-y-4">
          <form onSubmit={submitInput} className="flex bg-white rounded-full overflow-hidden max-w-2xl shadow" translate="no">
            <div className="flex items-center gap-2 px-4 flex-1">
              <SearchIcon size={16} className="text-neutral-500" />
              <input value={inputQ} onChange={(e) => setInputQ(e.target.value)}
                     className="flex-1 bg-transparent outline-none py-3 text-sm text-neutral-800"
                     placeholder={t("food.search_placeholder")}
                     data-testid="food-search-results-input" />
              {loading && <Loader2 size={14} className="text-neutral-500 animate-spin" />}
            </div>
            <button className="px-5 text-sm font-semibold text-black" style={{ backgroundColor: GREEN }}
                    data-testid="food-search-results-submit">
              {t("food.search_btn")}
            </button>
          </form>

          {/* Toolbar — Filters | Pure Veg | spacer | Mode toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openSheet}
              data-testid="results-filter-btn"
              className="h-9 px-3 rounded-full border border-border bg-card text-xs font-semibold flex items-center gap-1.5"
            >
              <SlidersHorizontal size={13} />
              {activeFilterCount > 0 && (
                <span
                  className="h-4 w-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center"
                  style={{ background: GREEN, color: "#000" }}
                  data-testid="results-filter-count"
                >
                  {activeFilterCount}
                </span>
              )}
              {label("Filtres", "Filters")}
            </button>
            <button
              onClick={() => setVegetarian(vegetarian === "pure_veg" ? "all" : "pure_veg")}
              data-testid="results-chip-veg"
              className={`h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${
                vegetarian === "pure_veg"
                  ? "bg-[color:var(--food-accent)] text-black border-transparent"
                  : "bg-card border-border text-foreground hover:border-foreground/40"
              }`}
              style={{ "--food-accent": GREEN }}
            >
              {label("Pur Végé", "Pure Veg")}
            </button>
            <div className="flex-1" />
            <div
              className="flex flex-wrap gap-2"
              translate="no"
              data-testid="food-search-results-mode-toggle"
            >
              {modeOpts.map(({ code, label: ml, icon: Icon }) => {
                const on = mode === code;
                return (
                  <button key={code} onClick={() => changeMode(code)}
                          className={`px-4 h-9 rounded-full inline-flex items-center gap-2 text-xs font-semibold border motion-fast
                                      ${on ? "text-black" : "bg-card text-foreground border-border hover:bg-secondary"}`}
                          style={on ? { backgroundColor: GREEN, borderColor: GREEN } : undefined}
                          data-testid={`food-search-results-mode-${code}`}>
                    <Icon size={13} /> {ml}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Address / radius hint — same shape as the category page */}
          {activeAddress ? (
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <MapPin size={11} /> {activeAddress.formatted} · {label("Rayon","Radius")} 15 km
            </p>
          ) : (
            <button onClick={() => openAddressSelector?.()}
                    data-testid="results-set-address"
                    className="text-[11px] text-amber-500 font-semibold inline-flex items-center gap-1">
              <MapPin size={11} /> {label("Choisir l'adresse", "Set your delivery address")}
            </button>
          )}

          <div className="flex flex-wrap gap-1" translate="no" data-testid="food-search-results-group-tabs">
            {groupOpts.map((g) => {
              const on = group === g.code;
              return (
                <button key={g.code} onClick={() => setGroup(g.code)}
                        className={`px-4 h-8 rounded-full text-[11px] font-semibold ${on ? "text-black" : "text-muted-foreground hover:text-foreground"}`}
                        style={on ? { backgroundColor: GREEN } : undefined}
                        data-testid={`food-search-results-group-${g.code}`}>
                  {g.label} {g.count > 0 && <span className={`ml-1 text-[10px] ${on ? "" : "opacity-70"}`}>({g.count})</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="baked-container py-8 space-y-10" data-testid="food-search-results-body">
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500 inline-flex items-center gap-2" data-testid="food-search-results-error">
            <AlertTriangle size={14} /> {t("food.search_error")}
          </div>
        )}
        {!error && !loading && data && totalHits === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center" data-testid="food-search-results-empty">
            <div className="text-lg font-semibold">{t("food.search_empty_title")}</div>
            <div className="text-sm text-muted-foreground mt-1">{t("food.search_empty_hint")}</div>
          </div>
        )}

        {(group === "all" || group === "restaurants") && data?.restaurants?.length > 0 && (
          <Section title={t("food.search_group_restaurants")} testId="results-restaurants">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {data.restaurants.map((r) => (
                <RestaurantCard key={r.id} r={r} mode={mode} isFr={isFr}
                                onOpen={() => nav(`/foodbaked/restaurants/${r.slug}`)} />
              ))}
            </div>
          </Section>
        )}

        {(group === "all" || group === "dishes") && data?.dishes?.length > 0 && (
          <Section title={t("food.search_group_dishes")} testId="results-dishes">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {data.dishes.map((d) => (
                <DishCard key={d.id} d={d} mode={mode} isFr={isFr} isFrLoc={isFrLoc}
                          onOpen={() => nav(`/foodbaked/restaurants/${d.restaurant_slug}?order=1&item=${d.id}`)} />
              ))}
            </div>
          </Section>
        )}

        {(group === "all" || group === "cuisines") && data?.cuisines?.length > 0 && (
          <Section title={t("food.search_group_cuisines")} testId="results-cuisines">
            <div className="flex flex-wrap gap-2">
              {data.cuisines.map((c) => (
                <button key={c.code}
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set("q", c.code);
                          setParams(next, { replace: true });
                        }}
                        className="h-10 px-4 rounded-full bg-card border border-border text-sm font-semibold hover:bg-secondary inline-flex items-center gap-2"
                        data-testid={`results-cuisine-${c.code}`}>
                  <ChefHat size={14} /> {isFr ? c.label_fr : c.label_en}
                </button>
              ))}
            </div>
          </Section>
        )}

        {(group === "all" || group === "reservations") && data?.reservations?.length > 0 && (
          <Section title={t("food.search_group_reservations")} testId="results-reservations">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {data.reservations.map((r) => (
                <RestaurantCard key={"res-" + r.id}
                                r={{ ...r, reservable: true, is_open: true }}
                                mode="dine_in" isFr={isFr}
                                cta={t("food.book_a_table")}
                                onOpen={() => nav(`/foodbaked/restaurants/${r.slug}?reserve=1`)} />
              ))}
            </div>
          </Section>
        )}
      </div>

      <FoodFilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        draft={draft}
        setDraft={setDraft}
        onApply={applySheet}
        onClear={clearSheet}
        availableCuisines={[]}
        language={language}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};

const Section = ({ title, children, testId }) => (
  <section data-testid={testId} className="space-y-3">
    <h2 className="text-lg font-bold">{title}</h2>
    {children}
  </section>
);

const RestaurantCard = ({ r, mode, isFr, cta, onOpen }) => {
  const notDeliverable = mode === "delivery" && r.delivery_eligible === false;
  const label = (fr, en) => (isFr ? fr : en);
  return (
    <button onClick={onOpen}
            className="text-left rounded-2xl border border-border bg-card hover:bg-secondary/60 overflow-hidden motion-fast flex flex-col"
            data-testid={`results-restaurant-${r.slug}`}>
      <div className={`relative aspect-[16/10] bg-muted overflow-hidden ${notDeliverable ? "opacity-60" : ""}`}>
        {r.image ? <img src={r.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
        {(r.eta_min != null && r.eta_max != null) && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-1 rounded-full inline-flex items-center gap-1">
            <Clock size={10} />
            {r.eta_min}–{r.eta_max} min
          </span>
        )}
        {notDeliverable && (
          <div
            data-testid={`results-nondeliverable-${r.id}`}
            className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-[11px] font-semibold px-2 py-1.5 text-center"
          >
            {label(
              "Livraison indisponible à votre adresse",
              "Delivery unavailable at your address",
            )}
          </div>
        )}
      </div>
      <div className="p-3 space-y-1 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-sm truncate">{r.name}</div>
          {r.reservable && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-black" style={{ backgroundColor: GREEN }}>
              {isFr ? "Réservable" : "Reservable"}
            </span>
          )}
          {r.is_open === false && (
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
              {isFr ? "Fermé" : "Closed"}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {(r.cuisines || []).slice(0, 3).map((c) => isFr ? cuisineLabelFr(c) : cuisineLabelEn(c)).join(" · ")}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#f59e0b" }}>
            <Star size={12} fill="#f59e0b" stroke="#f59e0b" /> {(r.rating || 0).toFixed(1)}
            {r.review_count ? <span className="text-muted-foreground font-normal">({r.review_count})</span> : null}
          </span>
          {cta && <span className="text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: GREEN }}>{cta} <ChevronRight size={12} /></span>}
        </div>
      </div>
    </button>
  );
};

const DishCard = ({ d, mode, isFr, isFrLoc, onOpen }) => {
  const notDeliverable = mode === "delivery" && d.delivery_eligible === false;
  const label = (fr, en) => (isFr ? fr : en);
  return (
    <button onClick={onOpen}
            className={`text-left rounded-2xl border border-border bg-card hover:bg-secondary/60 overflow-hidden motion-fast flex ${notDeliverable ? "opacity-70" : ""}`}
            data-testid={`results-dish-${d.id}`}>
      <div className="w-28 h-28 bg-muted overflow-hidden shrink-0">
        {d.image ? <img src={d.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Utensils size={20} className="m-auto text-muted-foreground" />}
      </div>
      <div className="p-3 flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{d.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{d.restaurant_name}</div>
        {d.description && <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{d.description}</div>}
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs font-semibold" style={{ color: GREEN }}>{money(d.price, d.currency, isFrLoc)}</div>
          {notDeliverable && (
            <span
              data-testid={`results-dish-nondeliverable-${d.id}`}
              className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500"
            >
              {label("Livraison indispo.", "No delivery")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default FoodSearchResultsPage;
