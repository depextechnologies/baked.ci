/**
 * FoodFavouritesPage — "Mes Favoris" screen.
 *
 * Route: /foodbaked/favorites (+ EN alias /foodbaked/favourites).
 * Login required — redirects to login prompt otherwise.
 *
 * Shows two tabs:
 *   1. Restaurants — grid of saved restaurant cards; click → microsite.
 *   2. Plats — grid of saved dishes; click → opens the dish's ItemModal
 *      pre-selected so the customer confirms variants/add-ons before cart add.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { Heart, Loader2, Star, Clock, Utensils, ArrowLeft, Store } from "lucide-react";
import { useAuth } from "../../../contexts/BakedContexts";
import { useFoodFavourites } from "../../../contexts/FoodFavouritesContext";
import FavouriteButton from "../components/FavouriteButton";
import FoodReorderDishModal from "../components/FoodReorderDishModal";

const API   = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const formatPrice = (v, cur) => `${Math.round(Number(v || 0)).toLocaleString()} ${cur || ""}`;

const RestaurantFavCard = ({ r }) => {
  const { t } = useTranslation("customer");
  const rating = Number(r.rating || 0).toFixed(1);
  const cuisines = (r.cuisines || []).slice(0, 2).join(" · ");
  return (
    <Link
      to={`/foodbaked/restaurants/${r.slug}`}
      data-testid={`food-fav-restaurant-card-${r.id}`}
      className="group block rounded-2xl border border-border bg-card overflow-hidden motion-fast hover:border-[color:var(--food-accent)]"
      style={{ "--food-accent": GREEN }}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {r.image && <img src={r.image} alt={r.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />}
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white px-2 py-1 rounded-full flex items-center gap-1">
          <Clock size={10} /> {r.prep_time_min}–{r.prep_time_max} min
        </span>
        <FavouriteButton
          type="restaurant"
          id={r.id}
          name={r.name}
          variant="overlay"
          testId={`food-fav-remove-restaurant-${r.id}`}
          className="absolute top-2 right-2"
        />
      </div>
      <div className="p-3 space-y-1">
        <div className="text-sm font-semibold truncate">{r.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{cuisines || "—"}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] flex items-center gap-1">
            <Star size={11} className="fill-current" style={{ color: GREEN }} /> {rating}
            <span className="text-muted-foreground">({r.review_count})</span>
          </span>
          <span
            className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.is_open ? "text-black" : "bg-secondary text-muted-foreground"}`}
            style={r.is_open ? { backgroundColor: `${GREEN}33`, color: GREEN } : {}}
          >
            {r.is_open ? t("food.open", "Open") : t("food.closed", "Closed")}
          </span>
        </div>
      </div>
    </Link>
  );
};

const DishFavCard = ({ d, onReorder }) => {
  const { t } = useTranslation("customer");
  const soldOut = !d.is_available;
  return (
    <div
      data-testid={`food-fav-dish-card-${d.id}`}
      className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {d.image && <img src={d.image} alt={d.name} className="w-full h-full object-cover" />}
        <FavouriteButton
          type="dish"
          id={d.id}
          name={d.name}
          variant="overlay"
          testId={`food-fav-remove-dish-${d.id}`}
          className="absolute top-2 right-2"
        />
        {soldOut && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/80 text-white px-2 py-1 rounded-full">
            {t("food.sold_out", "Sold out")}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1 flex-1">
        <div className="text-sm font-semibold truncate">{d.name}</div>
        {d.description && (
          <div className="text-[11px] text-muted-foreground line-clamp-2">{d.description}</div>
        )}
        <Link
          to={`/foodbaked/restaurants/${d.restaurant?.slug}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1"
          data-testid={`food-fav-dish-restaurant-${d.id}`}
        >
          <Store size={11} /> {d.restaurant?.name}
        </Link>
      </div>
      <div className="p-3 pt-0 flex items-center justify-between">
        <div className="text-sm font-bold">{formatPrice(d.base_price, d.currency)}</div>
        <button
          type="button"
          onClick={() => onReorder(d)}
          disabled={soldOut || !d.restaurant?.is_open}
          data-testid={`food-fav-dish-reorder-${d.id}`}
          className="h-9 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: GREEN }}
        >
          <Utensils size={12} /> {t("food.reorder", "Order again")}
        </button>
      </div>
    </div>
  );
};

const EmptyState = ({ title, hint, icon: Icon = Heart }) => (
  <div
    className="rounded-2xl border border-dashed border-border bg-card/40 py-14 flex flex-col items-center justify-center text-center px-6"
    data-testid="food-fav-empty"
  >
    <Icon size={36} className="text-muted-foreground" />
    <div className="mt-3 text-sm font-semibold">{title}</div>
    <div className="text-xs text-muted-foreground mt-1 max-w-sm">{hint}</div>
  </div>
);

export const FoodFavouritesPage = () => {
  const { t, i18n } = useTranslation("customer");
  const isFr = (i18n.language || "fr").toLowerCase().startsWith("fr");
  const { customer, loading: authLoading, openLogin } = useAuth() || {};
  const { refresh: refreshFavCtx } = useFoodFavourites();
  const nav = useNavigate();

  const [tab, setTab] = useState("restaurants");
  const [data, setData] = useState({ restaurants: [], dishes: [] });
  const [loading, setLoading] = useState(true);
  const [reorderDish, setReorderDish] = useState(null);

  const load = async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/food/customer/favourites`, { headers: authHeaders() });
      setData(data);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!authLoading && !customer) {
      try { openLogin?.(window.location.pathname + window.location.search); } catch {}
    } else if (customer) {
      load();
    }
  }, [customer, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = useMemo(() => ([
    { key: "restaurants", label: t("food.tab_restaurants", "Restaurants"), count: data.restaurants?.length || 0 },
    { key: "dishes",      label: t("food.tab_dishes", "Dishes"),           count: data.dishes?.length || 0 },
  ]), [data, t]);

  const onReorderClose = (shouldReload) => {
    setReorderDish(null);
    // After the modal closes we refresh id sets so the heart stays consistent.
    refreshFavCtx?.();
    if (shouldReload) load();
  };

  return (
    <div className="min-h-screen" data-testid="food-favourites-page">
      <div className="baked-container pt-6 pb-16">
        <button
          onClick={() => nav(-1)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
          data-testid="food-fav-back"
        >
          <ArrowLeft size={12} /> {t("food.back", "Back")}
        </button>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Heart size={22} className="fill-red-500 text-red-500" />
              {t("food.favourites_title", isFr ? "Mes Favoris" : "My Favourites")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("food.favourites_subtitle", "Keep your go-to restaurants and dishes one tap away.")}
            </p>
          </div>
        </div>

        {/* Tab pills */}
        <div className="mt-6 flex gap-2" role="tablist" data-testid="food-fav-tabs">
          {tabs.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={tab === p.key}
              onClick={() => setTab(p.key)}
              data-testid={`food-fav-tab-${p.key}`}
              className={`h-10 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-2 border transition-colors ${
                tab === p.key ? "text-black border-transparent" : "border-border bg-card hover:bg-secondary"
              }`}
              style={tab === p.key ? { backgroundColor: GREEN } : undefined}
            >
              {p.label}
              <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-semibold ${
                tab === p.key ? "bg-black/15 text-black" : "bg-secondary text-muted-foreground"
              }`}>{p.count}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-6">
          {loading && (
            <div className="py-16 flex justify-center" data-testid="food-fav-loading">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {!loading && tab === "restaurants" && (
            data.restaurants.length === 0 ? (
              <EmptyState
                icon={Store}
                title={t("food.fav_empty_rest_title", "No favourite restaurants yet")}
                hint={t("food.fav_empty_rest_hint", "Tap the heart on any restaurant to save it here for later.")}
              />
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="food-fav-restaurant-grid">
                {data.restaurants.map((r) => <RestaurantFavCard key={r.id} r={r} />)}
              </div>
            )
          )}
          {!loading && tab === "dishes" && (
            data.dishes.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title={t("food.fav_empty_dish_title", "No favourite dishes yet")}
                hint={t("food.fav_empty_dish_hint", "Tap the heart on any dish you love to save it here for a one-tap reorder.")}
              />
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="food-fav-dish-grid">
                {data.dishes.map((d) => (
                  <DishFavCard key={d.id} d={d} onReorder={setReorderDish} />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {reorderDish && (
        <FoodReorderDishModal
          dish={reorderDish}
          onClose={onReorderClose}
        />
      )}
    </div>
  );
};

export default FoodFavouritesPage;
