/**
 * FoodSearchDropdown — debounced autocomplete for the FOODbakēd hero.
 *
 * Props:
 *   mode       : "delivery" | "pickup" | "dine_in"
 *   country    : ISO code from the GLOBAL BAKED location selector
 *   placeholder: translated placeholder for the input
 *   ctaLabel   : translated Search button label
 *
 * Behaviour:
 *   - Debounced 280 ms.
 *   - Stale-response protection via request counter.
 *   - Groups: Restaurants · Plats · Cuisines · Réservations.
 *   - Enter / click "Voir tous les résultats" → /foodbaked/search?q=…
 *   - Empty and error states are localised.
 *
 * Uses `react-i18next` — no bilingual concatenation. All strings resolved
 * via the GLOBAL `i18n.language`, which the top nav switcher owns.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  Search as SearchIcon, Loader2, AlertTriangle, Star,
  Utensils, Calendar, ChefHat, ChevronRight,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#77BC1F";

const money = (v, curr = "XOF", loc = "fr-FR") =>
  new Intl.NumberFormat(loc, { style: "currency", currency: curr, maximumFractionDigits: 0 }).format(v || 0);

export const FoodSearchDropdown = ({ mode, country, placeholder, ctaLabel }) => {
  const { t, i18n } = useTranslation("customer");
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const reqIdRef = useRef(0);
  const isFr = (i18n?.language || "fr").toLowerCase().startsWith("fr");

  // Anchor rect for the portal-rendered dropdown so it can never be clipped
  // by the hero's `overflow-hidden`, a parent transform, backdrop-filter, etc.
  const [anchor, setAnchor] = useState(null);
  const recomputeAnchor = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.bottom + 8, left: r.left, width: r.width });
  }, []);
  useEffect(() => {
    if (!open) return;
    recomputeAnchor();
    const onScroll = () => recomputeAnchor();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, recomputeAnchor]);
  useEffect(() => { if (open && q) recomputeAnchor(); }, [q, open, recomputeAnchor]);

  // ---- Debounced fetch
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setData(null); setLoading(false); setError(false);
      return;
    }
    setLoading(true); setError(false);
    const rid = ++reqIdRef.current;
    const controller = new AbortController();
    const tm = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/api/food/search`, {
          params: { q: trimmed, mode: mode || undefined, country, limit: 6 },
          signal: controller.signal,
        });
        if (rid === reqIdRef.current) { setData(res.data); setLoading(false); }
      } catch (e) {
        if (rid === reqIdRef.current && !axios.isCancel(e)) {
          setError(true); setLoading(false);
        }
      }
    }, 280);
    return () => { clearTimeout(tm); controller.abort(); };
  }, [q, mode, country]);

  // ---- Close on outside click (both the input container AND the portalled panel count as "inside")
  useEffect(() => {
    const onClick = (e) => {
      const inContainer = containerRef.current && containerRef.current.contains(e.target);
      const inPanel     = panelRef.current     && panelRef.current.contains(e.target);
      if (!inContainer && !inPanel) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const gotoResults = useCallback((query = q) => {
    const s = query.trim();
    if (!s) return;
    nav(`/foodbaked/search?q=${encodeURIComponent(s)}${mode ? `&mode=${mode}` : ""}`);
    setOpen(false);
  }, [q, mode, nav]);

  const onSubmit = (e) => { e.preventDefault(); gotoResults(); };

  const totalHits = useMemo(() => {
    if (!data) return 0;
    return (data.restaurants?.length || 0) + (data.dishes?.length || 0)
         + (data.cuisines?.length || 0) + (data.reservations?.length || 0);
  }, [data]);

  const goRestaurant = (slug) => { nav(`/foodbaked/restaurants/${slug}`); setOpen(false); };
  const goDish = (slug, dishId) => { nav(`/foodbaked/restaurants/${slug}?order=1&item=${dishId}#menu`); setOpen(false); };
  const goCuisine = (code) => { nav(`/foodbaked/search?q=${encodeURIComponent(code)}&mode=${mode || "delivery"}&group=cuisines`); setOpen(false); };
  const goReserve = (slug) => { nav(`/foodbaked/restaurants/${slug}?reserve=1`); setOpen(false); };

  const showDropdown = open && q.trim().length >= 2;
  const isFrLoc = isFr ? "fr-FR" : "en-US";

  return (
    <div ref={containerRef} className="relative max-w-xl w-full" translate="no" data-testid="food-search-wrapper">
      <form onSubmit={onSubmit}
            className="flex bg-white rounded-full overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 px-4 flex-1">
          <SearchIcon size={16} className="text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none py-3 text-sm text-neutral-800"
            data-testid="food-search-input"
            autoComplete="off"
          />
          {loading && <Loader2 size={14} className="text-neutral-500 animate-spin" />}
        </div>
        <button type="submit"
                className="px-6 text-sm font-semibold text-black"
                style={{ backgroundColor: GREEN }}
                data-testid="food-search-btn">
          {ctaLabel}
        </button>
      </form>

      {showDropdown && anchor && typeof document !== "undefined" && createPortal(
        <div ref={panelRef}
             className="rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
             style={{
               position: "fixed",
               top: anchor.top,
               left: anchor.left,
               width: Math.max(anchor.width, 320),
               maxWidth: `calc(100vw - 16px)`,
               maxHeight: `min(70vh, calc(100vh - ${anchor.top + 16}px))`,
               zIndex: 9999,
             }}
             translate="no"
             data-testid="food-search-dropdown">
          <div className="overflow-y-auto" style={{ maxHeight: `min(70vh, calc(100vh - ${anchor.top + 16}px))` }}>
          {error ? (
            <div className="p-6 text-sm text-red-500 inline-flex items-center gap-2" data-testid="food-search-error">
              <AlertTriangle size={14} /> {t("food.search_error")}
            </div>
          ) : loading && !data ? (
            <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> …
            </div>
          ) : data && totalHits === 0 ? (
            <div className="p-6 text-center" data-testid="food-search-empty">
              <div className="text-sm font-semibold">{t("food.search_empty_title")}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("food.search_empty_hint")}</div>
            </div>
          ) : data && (
            <div className="divide-y divide-border">
              {data.restaurants.length > 0 && (
                <Group title={t("food.search_group_restaurants")} testId="food-search-group-restaurants">
                  {data.restaurants.map((r) => (
                    <ResultRow key={r.id} onClick={() => goRestaurant(r.slug)}
                               image={r.image}
                               title={r.name}
                               subtitle={(r.cuisines || []).slice(0, 3).map((c) => (isFr ? cuisineLabelFr(c) : cuisineLabelEn(c))).join(" · ")}
                               meta={<Rating value={r.rating} count={r.review_count} />}
                               pill={r.reservable ? t("food.search_reservable_pill") : (r.is_open ? t("food.open") : t("food.closed"))}
                               pillTone={r.reservable ? "green" : (r.is_open ? "gray" : "red")}
                               testId={`food-search-restaurant-${r.slug}`} />
                  ))}
                </Group>
              )}

              {data.dishes.length > 0 && (
                <Group title={t("food.search_group_dishes")} testId="food-search-group-dishes">
                  {data.dishes.map((d) => (
                    <ResultRow key={d.id} onClick={() => goDish(d.restaurant_slug, d.id)}
                               image={d.image}
                               title={d.name}
                               subtitle={d.restaurant_name}
                               meta={<span className="text-xs font-semibold" style={{ color: GREEN }}>{money(d.price, d.currency, isFrLoc)}</span>}
                               icon={Utensils}
                               testId={`food-search-dish-${d.id}`} />
                  ))}
                </Group>
              )}

              {data.cuisines.length > 0 && (
                <Group title={t("food.search_group_cuisines")} testId="food-search-group-cuisines">
                  {data.cuisines.map((c) => (
                    <ResultRow key={c.code} onClick={() => goCuisine(c.code)}
                               icon={ChefHat}
                               title={isFr ? c.label_fr : c.label_en}
                               subtitle=""
                               testId={`food-search-cuisine-${c.code}`} />
                  ))}
                </Group>
              )}

              {data.reservations.length > 0 && (
                <Group title={t("food.search_group_reservations")} testId="food-search-group-reservations">
                  {data.reservations.map((r) => (
                    <ResultRow key={"res-" + r.id} onClick={() => goReserve(r.slug)}
                               image={r.image}
                               title={r.name}
                               subtitle={(r.cuisines || []).slice(0, 3).map((c) => (isFr ? cuisineLabelFr(c) : cuisineLabelEn(c))).join(" · ")}
                               meta={<Rating value={r.rating} />}
                               icon={Calendar}
                               pill={t("food.search_reservable_pill")}
                               pillTone="green"
                               testId={`food-search-reservation-${r.slug}`} />
                  ))}
                </Group>
              )}

              <button onClick={() => gotoResults()}
                      className="w-full h-11 px-4 text-sm font-semibold text-black inline-flex items-center justify-center gap-2 hover:brightness-95 sticky bottom-0"
                      style={{ backgroundColor: GREEN }}
                      data-testid="food-search-view-all">
                {t("food.search_view_all")} <ChevronRight size={14} />
              </button>
            </div>
          )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

// -------------------------------------------------------------------------
// Small dropdown building blocks
// -------------------------------------------------------------------------

const Group = ({ title, children, testId }) => (
  <div className="p-2" data-testid={testId}>
    <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
      {title}
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);

const ResultRow = ({ image, icon: Icon, title, subtitle, meta, onClick, pill, pillTone, testId }) => (
  <button onClick={onClick}
          className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/60 motion-fast"
          data-testid={testId}>
    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
      {image ? (
        <img src={image} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : Icon ? (
        <Icon size={16} className="text-muted-foreground" />
      ) : null}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold truncate">{title}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
    </div>
    {pill && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pillClass(pillTone)}`}
                              style={pillTone === "green" ? { backgroundColor: GREEN } : undefined}>{pill}</span>}
    {meta}
  </button>
);

const pillClass = (tone) => {
  switch (tone) {
    case "green": return "text-black";
    case "red":   return "bg-red-500/15 text-red-500";
    default:      return "bg-secondary text-muted-foreground";
  }
};

// ResultRow above merges className via ternary — for the green tone we want
// to inline the accent colour so it matches FOODbakēd primary.
const _greenPillOverride = () => null; // (kept as visual anchor)

const Rating = ({ value, count }) => (
  <span className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#f59e0b" }}>
    <Star size={12} fill="#f59e0b" stroke="#f59e0b" />
    {(value || 0).toFixed(1)}
    {count ? <span className="text-muted-foreground font-normal">({count})</span> : null}
  </span>
);

// Cuisine label helpers — kept small; mirrored on the backend list.
const CUISINE_LABEL_FR = {
  burgers: "Burgers", pizza: "Pizza", indian: "Indien", italian: "Italien",
  chinese: "Chinois", japanese: "Japonais", sushi: "Sushi", mexican: "Mexicain",
  french: "Français", african: "Africain", ivorian: "Ivoirien", thai: "Thaï",
  vegan: "Végétalien", vegetarian: "Végétarien", bbq: "BBQ",
  seafood: "Fruits de mer", fast_food: "Fast Food", desserts: "Desserts",
};
const CUISINE_LABEL_EN = {
  burgers: "Burgers", pizza: "Pizza", indian: "Indian", italian: "Italian",
  chinese: "Chinese", japanese: "Japanese", sushi: "Sushi", mexican: "Mexican",
  french: "French", african: "African", ivorian: "Ivorian", thai: "Thai",
  vegan: "Vegan", vegetarian: "Vegetarian", bbq: "BBQ",
  seafood: "Seafood", fast_food: "Fast Food", desserts: "Desserts",
};
export const cuisineLabelFr = (c) => CUISINE_LABEL_FR[c] || c;
export const cuisineLabelEn = (c) => CUISINE_LABEL_EN[c] || c;

export default FoodSearchDropdown;
