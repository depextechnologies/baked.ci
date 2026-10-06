/**
 * FoodReorderDishModal — Favourites 1-tap reorder (option 1b).
 *
 * Fetches the restaurant's live menu, locates the saved dish, and delegates
 * to the standard ItemModal so the customer confirms variants + add-ons
 * before adding to cart (per user directive 1b).
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../../contexts/BakedContexts";
import { ItemModal } from "../pages/FoodRestaurantDetail";

const API = process.env.REACT_APP_BACKEND_URL || "";

const FoodReorderDishModal = ({ dish, onClose }) => {
  const { t, i18n } = useTranslation("customer");
  const isFr = (i18n.language || "fr").toLowerCase().startsWith("fr");
  const { countryCode } = useApp() || {};
  const [item, setItem] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await axios.get(
          `${API}/api/food/restaurants/${encodeURIComponent(dish.restaurant.slug)}/menu`,
          { params: { country: countryCode || "CI" } },
        );
        if (cancel) return;
        const sec = (data.sections || []).find((s) =>
          (s.items || []).some((it) => it.id === dish.id));
        const found = sec?.items.find((it) => it.id === dish.id);
        if (!found) {
          setError(isFr ? "Ce plat n'est plus disponible." : "This dish is no longer available.");
          toast.error(isFr ? "Plat indisponible" : "Dish unavailable");
          onClose?.(true); // reload favourites so stale cards disappear
          return;
        }
        setItem(found);
        setRestaurant(data.restaurant);
      } catch (e) {
        if (!cancel) {
          setError(isFr ? "Impossible de charger le plat." : "Could not load this dish.");
          toast.error(isFr ? "Erreur de chargement" : "Load error");
          onClose?.(false);
        }
      }
    })();
    return () => { cancel = true; };
  }, [dish, countryCode, isFr, onClose]);

  if (!item || !restaurant) {
    if (error) return null;
    return (
      <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60" data-testid="food-fav-reorder-loading">
        <div className="rounded-2xl bg-background border border-border px-5 py-4 flex items-center gap-3">
          <Loader2 className="animate-spin" size={16} />
          <span className="text-sm">{t("food.loading", "Chargement…")}</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="food-fav-reorder-modal">
      <ItemModal item={item} restaurant={restaurant} onClose={() => onClose?.(false)} />
    </div>
  );
};

export default FoodReorderDishModal;
