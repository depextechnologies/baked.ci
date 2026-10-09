/**
 * FoodDiscoveryPage — category-based restaurant discovery (/food/restaurants?category=xxx)
 *
 * Dedicated page the FOOD category chips navigate to (previously they
 * filtered the Featured carousel in place — fixed per spec §2).
 *
 * Spec notes honoured:
 *  - Flat 15 km discovery radius (§5) — the backend enforces it; we just
 *    render the mode-eligible rows.
 *  - Delivery-mode cards whose venue is INSIDE 15 km but outside its own
 *    delivery zone render with the dimmed "Delivery unavailable at your
 *    address" banner and a disabled delivery CTA (§5 + user instruction).
 *  - Mode switch (Livraison / À emporter / Sur place) refetches instantly
 *    and respects per-mode eligibility rules.
 *  - URL-driven filters so refresh / share works out of the box.
 *  - FR default + EN swap via existing i18n keys; dark theme preserved.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  SlidersHorizontal, X, Clock, Star, Heart, Bike, ShoppingBag,
  Utensils, Loader2, MapPin, ChevronDown,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import axios from "axios";
import { useApp, useCart } from "@/contexts/BakedContexts";
import FavouriteButton from "@/apps/foodbaked/components/FavouriteButton";

const API = API_BASE;

const GREEN = "#77BC1F";

// ─── Small atoms ────────────────────────────────────────────────────────
const Chip = ({ active, onClick, children, testId, danger }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    className={`h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${
      active
        ? "bg-[color:var(--food-accent)] text-black border-transparent"
        : "bg-card border-border text-foreground hover:border-foreground/40"
    }`}
    style={{ "--food-accent": GREEN }}
  >
    {children}
    {active && danger && <X size={11} className="inline ml-1" />}
  </button>
);

// ─── Filter bottom sheet / modal ────────────────────────────────────────
const FilterSheet = ({ open, onClose, draft, setDraft, onApply, onClear,
                      availableCuisines, language, t, currencySymbol }) => {
  const [tab, setTab] = useState("sort");
  if (!open) return null;
  const label = (fr, en) => (language === "fr" ? fr : en);

  const Row = ({ value, selected, onClick, children }) => (
    <button type="button" onClick={onClick}
            data-testid={`filter-opt-${value}`}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-card">
      <span className="text-sm">{children}</span>
      <span className={`h-4 w-4 rounded-full border-2 ${
        selected ? "border-[color:var(--food-accent)]" : "border-border"}`}
        style={{ "--food-accent": GREEN,
                 background: selected ? GREEN : "transparent" }} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center md:justify-center"
         onClick={onClose}
         data-testid="filter-sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()}
           className="w-full md:max-w-2xl md:h-[560px] h-[85vh] bg-background rounded-t-3xl md:rounded-3xl border border-border overflow-hidden flex flex-col"
           data-testid="filter-sheet">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold">{label("Filtres", "Filters")}</h3>
          <button onClick={onClose} data-testid="filter-close">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-40 border-r border-border py-2 overflow-y-auto">
            {[
              ["sort",   label("Trier par",     "Sort by")],
              ["cuisine",label("Cuisines",      "Cuisines")],
              ["rating", label("Note",          "Rating")],
              ["cost",   label("Prix / personne","Cost per person")],
              ["diet",   label("Préférence",    "Dietary")],
              ["avail",  label("Disponibilité", "Availability")],
            ].map(([k, v]) => (
              <button key={k} onClick={() => setTab(k)}
                      data-testid={`filter-tab-${k}`}
                      className={`w-full text-left px-4 py-2 text-xs ${
                        tab === k ? "border-l-2 border-[color:var(--food-accent)] font-semibold bg-card" : "text-muted-foreground"
                      }`}
                      style={{ "--food-accent": GREEN }}>
                {v}
              </button>
            ))}
          </nav>
          <div className="flex-1 p-4 overflow-y-auto space-y-1">
            {tab === "sort" && [
              ["popularity",       label("Popularité",             "Popularity")],
              ["rating_desc",      label("Note : élevée à faible", "Rating: High to Low")],
              ["price_asc",        label("Prix : bas à élevé",     "Cost: Low to High")],
              ["price_desc",       label("Prix : élevé à bas",     "Cost: High to Low")],
              ["delivery_time_asc",label("Livraison : plus rapide","Delivery Time: Fastest First")],
            ].map(([v, l]) => (
              <Row key={v} value={v} selected={draft.sort === v}
                   onClick={() => setDraft({ ...draft, sort: v })}>{l}</Row>
            ))}
            {tab === "cuisine" && (availableCuisines.length ? availableCuisines : [
              ["african", "African"], ["ivorian", "Ivoirien"],
              ["indian",  "Indian"],  ["italian", "Italian"],
              ["chinese", "Chinese"], ["american","American"], ["fast_food","Fast Food"],
            ]).map(([v, l]) => (
              <Row key={v} value={v}
                   selected={(draft.cuisines || []).includes(v)}
                   onClick={() => {
                     const cur = new Set(draft.cuisines || []);
                     cur.has(v) ? cur.delete(v) : cur.add(v);
                     setDraft({ ...draft, cuisines: [...cur] });
                   }}>{l}</Row>
            ))}
            {tab === "rating" && [3.0, 3.5, 4.0, 4.5].map((v) => (
              <Row key={v} value={`rating-${v}`} selected={Number(draft.min_rating) === v}
                   onClick={() => setDraft({ ...draft, min_rating: v })}>{v}+</Row>
            ))}
            {tab === "cost" && [
              ["0,500",     `< 500 ${currencySymbol}`],
              ["500,1500",  `500 – 1 500 ${currencySymbol}`],
              ["1500,3000", `1 500 – 3 000 ${currencySymbol}`],
              ["3000,999999", `3 000+ ${currencySymbol}`],
            ].map(([v, l]) => (
              <Row key={v} value={`cost-${v}`}
                   selected={`${draft.min_price || 0},${draft.max_price || 999999}` === v}
                   onClick={() => {
                     const [lo, hi] = v.split(",").map(Number);
                     setDraft({ ...draft, min_price: lo, max_price: hi });
                   }}>{l}</Row>
            ))}
            {tab === "diet" && [
              ["all",         label("Tout",             "All")],
              ["veg_options", label("Options végé",     "Vegetarian options")],
              ["pure_veg",    label("Végétarien pur",   "Pure vegetarian")],
            ].map(([v, l]) => (
              <Row key={v} value={v} selected={(draft.vegetarian || "all") === v}
                   onClick={() => setDraft({ ...draft, vegetarian: v })}>{l}</Row>
            ))}
            {tab === "avail" && [
              ["open_now",  label("Ouvert maintenant",      "Open Now")],
              ["delivery",  label("Livraison disponible",   "Available for Delivery")],
              ["pickup",    label("À emporter disponible",  "Available for Pickup")],
              ["dine_in",   label("Sur place disponible",   "Dine-in Available")],
            ].map(([v, l]) => (
              <Row key={v} value={`avail-${v}`}
                   selected={draft.availability === v}
                   onClick={() => setDraft({ ...draft, availability: v })}>{l}</Row>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button onClick={onClear}
                  data-testid="filter-clear"
                  className="text-xs text-muted-foreground font-semibold">
            {label("Effacer tout", "Clear all")}
          </button>
          <button onClick={onApply}
                  data-testid="filter-apply"
                  className="h-9 px-4 rounded-full text-xs font-bold text-black"
                  style={{ background: GREEN }}>
            {label("Appliquer", "Apply")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Restaurant card ────────────────────────────────────────────────────
const RestaurantCard = ({ r, mode, language, currency }) => {
  const notDeliverable = mode === "delivery" && !r.delivery_eligible;
  const label = (fr, en) => (language === "fr" ? fr : en);
  return (
    <Link
      to={`/food/r/${r.slug}`}
      data-testid={`discover-card-${r.id}`}
      className="group block rounded-2xl border border-border bg-card overflow-hidden transition-colors hover:border-foreground/30">
      <div className={`relative aspect-[4/3] bg-muted ${notDeliverable ? "opacity-60" : ""}`}>
        <img src={r.image} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-1 rounded-full flex items-center gap-1">
          <Clock size={10} />
          {r.eta_min && r.eta_max ? `${r.eta_min}–${r.eta_max} min` : "—"}
        </span>
        <FavouriteButton type="restaurant" id={r.id} name={r.name}
                         variant="overlay" size={14}
                         testId={`discover-fav-${r.id}`}
                         className="absolute top-2 right-2 w-8 h-8" />
        {notDeliverable && (
          <div
            data-testid={`discover-nondeliverable-${r.id}`}
            className="absolute inset-x-0 bottom-0 bg-black/80 text-white text-[11px] font-semibold px-2 py-1.5 text-center">
            {label(
              "Livraison indisponible à votre adresse",
              "Delivery unavailable at your address",
            )}
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-semibold truncate">{r.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {(r.cuisines || []).slice(0, 3).join(" · ")}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] inline-flex items-center gap-1">
            <Star size={11} className="fill-current" style={{ color: GREEN }} />
            {Number(r.rating).toFixed(1)}
            <span className="text-muted-foreground">({r.review_count})</span>
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {r.starting_price
              ? `${label("dès", "from")} ${Math.round(r.starting_price).toLocaleString()} ${currency}`
              : (r.delivery_fee === 0
                 ? label("Livraison offerte", "Free delivery")
                 : `${Math.round(r.delivery_fee).toLocaleString()} ${currency}`)}
          </span>
        </div>
        {r.matched_items?.length > 0 && (
          <div className="text-[10px] text-muted-foreground pt-1 truncate">
            {label("Plats :", "Dishes:")} {r.matched_items.map((m) => m.name).join(", ")}
          </div>
        )}
      </div>
    </Link>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────
export const FoodDiscoveryPage = () => {
  const { t, i18n } = useTranslation("customer");
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { country, countryCode, activeAddress, openAddressSelector,
          foodServiceMode, setFoodServiceMode } = useApp() || {};
  const language = (i18n?.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
  const label = (fr, en) => (language === "fr" ? fr : en);

  const category = params.get("category") || "all";
  const mode = foodServiceMode || "delivery";
  const [sort,       setSort]       = useState(params.get("sort") || "popularity");
  const [cuisines,   setCuisines]   = useState((params.get("cuisines") || "").split(",").filter(Boolean));
  const [minRating,  setMinRating]  = useState(Number(params.get("min_rating")) || null);
  const [minPrice,   setMinPrice]   = useState(params.get("min_price") ? Number(params.get("min_price")) : null);
  const [maxPrice,   setMaxPrice]   = useState(params.get("max_price") ? Number(params.get("max_price")) : null);
  const [vegetarian, setVegetarian] = useState(params.get("vegetarian") || "all");
  const [openNow,    setOpenNow]    = useState(params.get("open_now") === "1");
  const [draft,      setDraft]      = useState({});
  const [sheet,      setSheet]      = useState(false);
  const [data,       setData]       = useState({ items: [], total: 0 });
  const [loading,    setLoading]    = useState(true);
  const [categories, setCategories] = useState([]);

  // Load categories once
  useEffect(() => {
    axios.get(`${API}/food/categories`).then((r) => setCategories(r.data?.items || []));
  }, []);

  // Sync URL whenever filters change — bookmarkable & shareable
  useEffect(() => {
    const next = new URLSearchParams();
    if (category && category !== "all") next.set("category", category);
    if (sort && sort !== "popularity") next.set("sort", sort);
    if (cuisines.length)       next.set("cuisines", cuisines.join(","));
    if (minRating)             next.set("min_rating", String(minRating));
    if (minPrice != null)      next.set("min_price",  String(minPrice));
    if (maxPrice != null)      next.set("max_price",  String(maxPrice));
    if (vegetarian && vegetarian !== "all") next.set("vegetarian", vegetarian);
    if (openNow)               next.set("open_now", "1");
    setParams(next, { replace: true });
  }, [category, sort, cuisines, minRating, minPrice, maxPrice, vegetarian, openNow]);

  // Fetch results — refires on address, mode and any filter change
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({
          country: countryCode || "CI",
          fulfillment_mode: mode,
          sort, page: 1, limit: 24, radius_km: 15,
        });
        if (category && category !== "all") q.set("category", category);
        if (activeAddress?.lat != null) {
          q.set("lat", activeAddress.lat);
          q.set("lng", activeAddress.lng);
        }
        if (cuisines.length) q.set("cuisines", cuisines.join(","));
        if (minRating) q.set("min_rating", minRating);
        if (minPrice != null) q.set("min_price", minPrice);
        if (maxPrice != null) q.set("max_price", maxPrice);
        if (vegetarian && vegetarian !== "all") q.set("vegetarian", vegetarian);
        if (openNow) q.set("open_now", "true");
        const { data } = await axios.get(`${API}/food/restaurants/discover?${q}`);
        if (!cancel) setData(data);
      } catch (err) {
        if (!cancel) setData({ items: [], total: 0 });
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [category, mode, sort, cuisines.join(","), minRating, minPrice, maxPrice,
      vegetarian, openNow, activeAddress?.lat, activeAddress?.lng, countryCode]);

  const activeCat = categories.find((c) => c.code === category);
  const title = activeCat
    ? label(
        `Restaurants ${activeCat.name_fr.toLowerCase()} près de chez vous`,
        `${activeCat.name_en} restaurants near you`,
      )
    : label("Tous les restaurants", "All restaurants");
  const subtitle = activeCat
    ? label(
        `Découvrez les restaurants servant du ${activeCat.name_fr.toLowerCase()} près de votre adresse.`,
        `Discover restaurants serving ${activeCat.name_en.toLowerCase()} near your address.`,
      )
    : null;

  const activeFilterCount =
    (cuisines.length ? 1 : 0) + (minRating ? 1 : 0) +
    (minPrice != null || maxPrice != null ? 1 : 0) +
    (vegetarian && vegetarian !== "all" ? 1 : 0) + (openNow ? 1 : 0) +
    (sort !== "popularity" ? 1 : 0);

  const currencySymbol = country?.currency_symbol || (countryCode === "IN" ? "₹" : "CFA");

  const openSheet = () => {
    setDraft({ sort, cuisines, min_rating: minRating, min_price: minPrice,
               max_price: maxPrice, vegetarian,
               availability: openNow ? "open_now" : null });
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
    setDraft({ sort: "popularity", cuisines: [], min_rating: null,
               min_price: null, max_price: null, vegetarian: "all",
               availability: null });
  };

  return (
    <div className="min-h-screen" data-testid="food-discovery-page">
      <div className="baked-container py-6 space-y-5">
        {/* Toolbar — Filters | Category chip | Pure Veg | Cuisines | Mode */}
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto -mx-2 px-2">
          <button onClick={openSheet}
                  data-testid="discover-filter-btn"
                  className="h-9 px-3 rounded-full border border-border bg-card text-xs font-semibold flex items-center gap-1.5">
            <SlidersHorizontal size={13} />
            {activeFilterCount > 0 && (
              <span className="h-4 w-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center"
                    style={{ background: GREEN, color: "#000" }}
                    data-testid="discover-filter-count">
                {activeFilterCount}
              </span>
            )}
            {label("Filtres", "Filters")}
          </button>
          {activeCat && (
            <button onClick={() => nav("/food/restaurants")}
                    data-testid="discover-category-chip"
                    className="h-9 px-3 rounded-full text-xs font-semibold text-black inline-flex items-center gap-1"
                    style={{ background: GREEN }}>
              {language === "fr" ? activeCat.name_fr : activeCat.name_en}
              <X size={11} />
            </button>
          )}
          <Chip active={vegetarian === "pure_veg"}
                testId="discover-chip-veg"
                onClick={() => setVegetarian(vegetarian === "pure_veg" ? "all" : "pure_veg")}>
            {label("Pur Végé", "Pure Veg")}
          </Chip>
          <div className="flex-1" />
          {/* Mode toggle in the toolbar — refetches instantly */}
          {["delivery", "pickup", "dine_in"].map((m) => {
            const l = { delivery: label("Livraison","Delivery"),
                        pickup:   label("À emporter","Pickup"),
                        dine_in:  label("Sur place","Dine-in") }[m];
            const Icon = { delivery: Bike, pickup: ShoppingBag, dine_in: Utensils }[m];
            return (
              <button key={m}
                      onClick={() => setFoodServiceMode(m)}
                      data-testid={`discover-mode-${m}`}
                      className={`h-9 px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1 ${
                        mode === m ? "bg-foreground text-background border-transparent" : "bg-card border-border"
                      }`}>
                <Icon size={12} /> {l}
              </button>
            );
          })}
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {activeAddress ? (
            <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-1">
              <MapPin size={11} /> {activeAddress.formatted} · {label("Rayon","Radius")} 15 km
            </p>
          ) : (
            <button onClick={() => openAddressSelector?.()}
                    data-testid="discover-set-address"
                    className="text-[11px] text-amber-500 font-semibold mt-2 inline-flex items-center gap-1">
              <MapPin size={11} /> {label("Choisir l'adresse", "Set your delivery address")}
            </button>
          )}
        </div>

        {/* Results */}
        {loading && (
          <div className="py-10 flex justify-center" data-testid="discover-loading">
            <Loader2 className="animate-spin" />
          </div>
        )}
        {!loading && data.items.length === 0 && (
          <div className="py-16 text-center space-y-3" data-testid="discover-empty">
            <div className="text-5xl">🍽️</div>
            <h3 className="font-bold text-lg">
              {label("Aucun restaurant trouvé", "No restaurants found")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {activeAddress ? label(
                `Aucun restaurant ne sert ${activeCat ? activeCat.name_fr.toLowerCase() : "cette catégorie"} dans les 15 km autour de votre adresse. Essayez une autre adresse, catégorie ou mode (livraison / à emporter / sur place).`,
                `No restaurants near you serve ${activeCat ? activeCat.name_en.toLowerCase() : "this category"} within 15 km. Try another address, category or mode.`,
              ) : label(
                "Veuillez choisir une adresse de livraison pour voir les restaurants proches.",
                "Please set your delivery address to see nearby restaurants.",
              )}
            </p>
            {!activeAddress && (
              <button onClick={() => openAddressSelector?.()}
                      className="h-10 px-4 rounded-full text-xs font-bold text-black"
                      style={{ background: GREEN }}>
                {label("Choisir l'adresse", "Set address")}
              </button>
            )}
          </div>
        )}
        {!loading && data.items.length > 0 && (
          <>
            <h2 className="text-base font-semibold">
              {activeAddress?.city
                ? label(
                    `${activeAddress.city} · ${data.total} ${data.total > 1 ? "restaurants" : "restaurant"}`,
                    `${activeAddress.city} · ${data.total} ${data.total > 1 ? "restaurants" : "restaurant"}`,
                  )
                : `${data.total} ${label("restaurants trouvés", "restaurants found")}`}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                 data-testid="discover-grid">
              {data.items.map((r) => (
                <RestaurantCard key={r.id} r={r} mode={mode}
                                language={language} currency={currencySymbol} />
              ))}
            </div>
          </>
        )}
      </div>

      <FilterSheet
        open={sheet} onClose={() => setSheet(false)}
        draft={draft} setDraft={setDraft}
        onApply={applySheet} onClear={clearSheet}
        availableCuisines={[]}
        language={language} t={t}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};

export default FoodDiscoveryPage;
