/**
 * FavouriteButton — reusable heart toggle for FOODbakēd cards.
 *
 * Props:
 *   type: "restaurant" | "dish"
 *   id: string (target id)
 *   name?: string — used in the toast confirmation
 *   variant?: "overlay" (default — floating white heart over images)
 *            | "inline"  (bordered square, used inside modals/menu rows)
 *            | "chip"    (lightweight inline pill without background)
 *   testId?: string
 *   className?: string
 */
import React from "react";
import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFoodFavourites } from "../../../contexts/FoodFavouritesContext";

const BASE = "inline-flex items-center justify-center transition-colors motion-fast focus:outline-none focus:ring-2 focus:ring-[#00A651]/40";

const VARIANTS = {
  overlay: "w-9 h-9 rounded-full bg-black/70 text-white hover:bg-black/80",
  inline:  "w-10 h-10 rounded-xl border border-border bg-card text-foreground hover:bg-secondary",
  chip:    "h-8 px-3 gap-1 rounded-full text-xs font-semibold border border-border bg-card",
};

const FavouriteButton = ({
  type, id, name,
  variant = "overlay",
  size = 16,
  showLabel = false,
  testId,
  className = "",
}) => {
  const { isFavourite, toggle } = useFoodFavourites();
  const { t, i18n } = useTranslation("customer");
  const isFr = (i18n.language || "fr").toLowerCase().startsWith("fr");
  const active = isFavourite(type, id);

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(type, id, { name });
  };

  const aria = active
    ? (isFr ? "Retirer des favoris" : "Remove from favourites")
    : (isFr ? "Ajouter aux favoris" : "Add to favourites");

  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId || `food-fav-${type}-${id}`}
      data-fav-active={active ? "true" : "false"}
      className={`${BASE} ${VARIANTS[variant] || VARIANTS.overlay} ${className}`}
    >
      <Heart
        size={size}
        className={active ? "fill-red-500 text-red-500" : ""}
        strokeWidth={active ? 0 : 2}
      />
      {showLabel && (
        <span className="ml-1.5">{active ? (isFr ? "Favori" : "Saved") : (isFr ? "Favori" : "Save")}</span>
      )}
    </button>
  );
};

export default FavouriteButton;
