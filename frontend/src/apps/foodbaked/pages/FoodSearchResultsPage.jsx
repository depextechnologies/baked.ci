/**
 * FoodSearchResultsPage — `/foodbaked/search?q=&mode=&group=`
 *
 * Full-page browser for the same search API used by the hero dropdown.
 * Groups: All · Restaurants · Dishes · Cuisines · Reservations.
 *
 * Reuses the GLOBAL cart / location / language state — this page is
 * discovery-only; clicking a card routes back to the canonical
 * restaurant microsite (`/foodbaked/restaurants/:slug` and variants).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  Search as SearchIcon, Loader2, AlertTriangle, Star, Utensils, ChefHat, Calendar, Bike, ShoppingBag, ChevronRight,
} from "lucide-react";
import { useApp } from "../../../contexts/BakedContexts";
import { cuisineLabelFr, cuisineLabelEn } from "../components/FoodSearchDropdown";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#77BC1F";

const money = (v, curr = "XOF", loc = "fr-FR") =>
  new Intl.NumberFormat(loc, { style: "currency", currency: curr, maximumFractionDigits: 0 }).format(v || 0);

export const FoodSearchResultsPage = () => {
  const { t, i18n } = useTranslation("customer");
  const { countryCode } = useApp() || {};
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const mode = params.get("mode") || "delivery";
  const initialGroup = params.get("group") || "all";
  const [group, setGroup] = useState(initialGroup);
  const [inputQ, setInputQ] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const nav = useNavigate();
  const isFr = (i18n?.language || "fr").toLowerCase().startsWith("fr");
  const isFrLoc = isFr ? "fr-FR" : "en-US";

  const runSearch = useCallback(async (query, m) => {
    if (!query || query.length < 1) { setData(null); return; }
    setLoading(true); setError(false);
    try {
      const res = await axios.get(`${API}/api/food/search`, {
        params: { q: query, mode: m || undefined, country: countryCode, limit: 24 },
      });
      setData(res.data);
    } catch {
      setError(true);
    } finally { setLoading(false); }
  }, [countryCode]);

  useEffect(() => { runSearch(q, mode); }, [q, mode, runSearch]);

  const changeMode = (m) => { setParams((p) => { p.set("mode", m); return p; }, { replace: true }); };
  const submitInput = (e) => {
    e.preventDefault();
    const s = inputQ.trim();
    if (!s) return;
    setParams({ q: s, mode }, { replace: true });
  };

  const totalHits = useMemo(() => {
    if (!data) return 0;
    return (data.restaurants?.length || 0) + (data.dishes?.length || 0)
         + (data.cuisines?.length || 0) + (data.reservations?.length || 0);
  }, [data]);

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

          <div className="flex flex-wrap gap-2" translate="no" data-testid="food-search-results-mode-toggle">
            {modeOpts.map(({ code, label, icon: Icon }) => {
              const on = mode === code;
              return (
                <button key={code} onClick={() => changeMode(code)}
                        className={`px-4 h-9 rounded-full inline-flex items-center gap-2 text-xs font-semibold border motion-fast
                                    ${on ? "text-black" : "bg-card text-foreground border-border hover:bg-secondary"}`}
                        style={on ? { backgroundColor: GREEN, borderColor: GREEN } : undefined}
                        data-testid={`food-search-results-mode-${code}`}>
                  <Icon size={13} /> {label}
                </button>
              );
            })}
          </div>

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
                <RestaurantCard key={r.id} r={r} isFr={isFr}
                                onOpen={() => nav(`/foodbaked/restaurants/${r.slug}`)} />
              ))}
            </div>
          </Section>
        )}

        {(group === "all" || group === "dishes") && data?.dishes?.length > 0 && (
          <Section title={t("food.search_group_dishes")} testId="results-dishes">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {data.dishes.map((d) => (
                <DishCard key={d.id} d={d} isFrLoc={isFrLoc}
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
                        onClick={() => setParams({ q: c.code, mode }, { replace: true })}
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
                                isFr={isFr}
                                cta={t("food.book_a_table")}
                                onOpen={() => nav(`/foodbaked/restaurants/${r.slug}?reserve=1`)} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, children, testId }) => (
  <section data-testid={testId} className="space-y-3">
    <h2 className="text-lg font-bold">{title}</h2>
    {children}
  </section>
);

const RestaurantCard = ({ r, isFr, cta, onOpen }) => (
  <button onClick={onOpen}
          className="text-left rounded-2xl border border-border bg-card hover:bg-secondary/60 overflow-hidden motion-fast flex flex-col"
          data-testid={`results-restaurant-${r.slug}`}>
    <div className="aspect-[16/10] bg-muted overflow-hidden">
      {r.image ? <img src={r.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
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

const DishCard = ({ d, isFrLoc, onOpen }) => (
  <button onClick={onOpen}
          className="text-left rounded-2xl border border-border bg-card hover:bg-secondary/60 overflow-hidden motion-fast flex"
          data-testid={`results-dish-${d.id}`}>
    <div className="w-28 h-28 bg-muted overflow-hidden shrink-0">
      {d.image ? <img src={d.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Utensils size={20} className="m-auto text-muted-foreground" />}
    </div>
    <div className="p-3 flex-1 min-w-0">
      <div className="font-semibold text-sm truncate">{d.name}</div>
      <div className="text-[11px] text-muted-foreground truncate">{d.restaurant_name}</div>
      {d.description && <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{d.description}</div>}
      <div className="text-xs font-semibold mt-2" style={{ color: GREEN }}>{money(d.price, d.currency, isFrLoc)}</div>
    </div>
  </button>
);

export default FoodSearchResultsPage;
