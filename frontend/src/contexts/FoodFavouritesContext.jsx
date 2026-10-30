/**
 * FOODbakēd Favourites — context + hook.
 *
 * Holds the authenticated customer's favourite-id sets (restaurants + dishes)
 * in memory so every <FavouriteButton /> can render its heart state without a
 * roundtrip per card. Hydrated once per login via GET /api/food/customer/favourites/ids,
 * mutated optimistically on toggle, rolled back on 4xx/5xx.
 *
 * Guest (not logged in): the Provider is a no-op shell that returns empty
 * sets and triggers `openLogin()` on toggle attempts.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "./BakedContexts";
import { useTranslation } from "react-i18next";

const API = process.env.REACT_APP_BACKEND_URL || "";

const FavCtx = createContext(null);

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const FoodFavouritesProvider = ({ children }) => {
  const { customer, openLogin } = useAuth() || {};
  const { t, i18n } = useTranslation("customer");
  const isFr = (i18n.language || "fr").toLowerCase().startsWith("fr");

  const [restaurants, setRestaurants] = useState(new Set());
  const [dishes, setDishes] = useState(new Set());
  const [hydrated, setHydrated] = useState(false);

  const hydrate = useCallback(async () => {
    if (!customer) {
      setRestaurants(new Set());
      setDishes(new Set());
      setHydrated(true);
      return;
    }
    try {
      const { data } = await axios.get(`${API}/api/food/customer/favourites/ids`, { headers: authHeaders() });
      setRestaurants(new Set(data.restaurants || []));
      setDishes(new Set(data.dishes || []));
    } catch {
      /* ignore — keep sets empty rather than crash */
    } finally {
      setHydrated(true);
    }
  }, [customer]);

  useEffect(() => { hydrate(); }, [hydrate]);

  const isFavourite = useCallback((type, id) => {
    if (!id) return false;
    return type === "restaurant" ? restaurants.has(id) : dishes.has(id);
  }, [restaurants, dishes]);

  const toggle = useCallback(async (type, id, meta = {}) => {
    if (!customer) {
      // Pending login: ask for sign-in and bounce back here.
      try { openLogin?.(window.location.pathname + window.location.search); } catch {}
      toast(isFr ? "Connectez-vous pour sauvegarder vos favoris" : "Sign in to save your favourites");
      return { favourited: false, requiredLogin: true };
    }
    const setter = type === "restaurant" ? setRestaurants : setDishes;
    const current = type === "restaurant" ? restaurants : dishes;
    const willBe = !current.has(id);

    // Optimistic update
    setter((prev) => {
      const next = new Set(prev);
      if (willBe) next.add(id); else next.delete(id);
      return next;
    });

    try {
      const { data } = await axios.post(
        `${API}/api/food/customer/favourites/toggle`,
        { target_type: type, target_id: id },
        { headers: { ...authHeaders(), "Content-Type": "application/json" } },
      );
      // Reconcile with server truth.
      setter((prev) => {
        const next = new Set(prev);
        if (data.favourited) next.add(id); else next.delete(id);
        return next;
      });
      const label = meta?.name
        ? (data.favourited
            ? (isFr ? `${meta.name} ajouté aux favoris` : `${meta.name} added to favourites`)
            : (isFr ? `${meta.name} retiré des favoris` : `${meta.name} removed from favourites`))
        : (data.favourited
            ? (isFr ? "Ajouté aux favoris" : "Added to favourites")
            : (isFr ? "Retiré des favoris" : "Removed from favourites"));
      toast.success(label);
      return data;
    } catch (err) {
      // Rollback
      setter((prev) => {
        const next = new Set(prev);
        if (willBe) next.delete(id); else next.add(id);
        return next;
      });
      toast.error(isFr ? "Impossible de mettre à jour les favoris" : "Could not update favourites");
      return { favourited: current.has(id), error: true };
    }
  }, [customer, restaurants, dishes, isFr, openLogin]);

  const value = useMemo(() => ({
    restaurants, dishes, hydrated, isFavourite, toggle, refresh: hydrate,
  }), [restaurants, dishes, hydrated, isFavourite, toggle, hydrate]);

  return <FavCtx.Provider value={value}>{children}</FavCtx.Provider>;
};

export const useFoodFavourites = () => useContext(FavCtx) || {
  restaurants: new Set(),
  dishes: new Set(),
  hydrated: false,
  isFavourite: () => false,
  toggle: async () => ({ favourited: false }),
  refresh: async () => {},
};
