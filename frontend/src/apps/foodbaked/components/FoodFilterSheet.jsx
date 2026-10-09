/**
 * FoodFilterSheet — shared Filters bottom-sheet used by both the
 * category Discovery page (`/food/restaurants`) and the search results
 * page (`/foodbaked/search`).
 *
 * Keeping the sheet (and its default option sets) in a single file is
 * what guarantees that the two pages behave identically when the user
 * refines their results — a hard requirement from the P0 brief.
 */
import React, { useState } from "react";
import { X } from "lucide-react";

export const FILTER_GREEN = "#77BC1F";

const Row = ({ value, selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={`filter-opt-${value}`}
    className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-card"
  >
    <span className="text-sm">{children}</span>
    <span
      className={`h-4 w-4 rounded-full border-2 ${
        selected ? "border-[color:var(--food-accent)]" : "border-border"
      }`}
      style={{
        "--food-accent": FILTER_GREEN,
        background: selected ? FILTER_GREEN : "transparent",
      }}
    />
  </button>
);

export const FoodFilterSheet = ({
  open,
  onClose,
  draft,
  setDraft,
  onApply,
  onClear,
  availableCuisines = [],
  language,
  currencySymbol,
}) => {
  const [tab, setTab] = useState("sort");
  if (!open) return null;
  const label = (fr, en) => (language === "fr" ? fr : en);

  const cuisineOpts = availableCuisines.length
    ? availableCuisines
    : [
        ["african", "African"],
        ["ivorian", "Ivoirien"],
        ["indian", "Indian"],
        ["italian", "Italian"],
        ["chinese", "Chinese"],
        ["american", "American"],
        ["fast_food", "Fast Food"],
      ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center md:justify-center"
      onClick={onClose}
      data-testid="filter-sheet-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-2xl md:h-[560px] h-[85vh] bg-background rounded-t-3xl md:rounded-3xl border border-border overflow-hidden flex flex-col"
        data-testid="filter-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold">{label("Filtres", "Filters")}</h3>
          <button onClick={onClose} data-testid="filter-close">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-40 border-r border-border py-2 overflow-y-auto">
            {[
              ["sort", label("Trier par", "Sort by")],
              ["cuisine", label("Cuisines", "Cuisines")],
              ["rating", label("Note", "Rating")],
              ["cost", label("Prix / personne", "Cost per person")],
              ["diet", label("Préférence", "Dietary")],
              ["avail", label("Disponibilité", "Availability")],
            ].map(([k, v]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                data-testid={`filter-tab-${k}`}
                className={`w-full text-left px-4 py-2 text-xs ${
                  tab === k
                    ? "border-l-2 border-[color:var(--food-accent)] font-semibold bg-card"
                    : "text-muted-foreground"
                }`}
                style={{ "--food-accent": FILTER_GREEN }}
              >
                {v}
              </button>
            ))}
          </nav>
          <div className="flex-1 p-4 overflow-y-auto space-y-1">
            {tab === "sort" &&
              [
                ["popularity", label("Popularité", "Popularity")],
                ["rating_desc", label("Note : élevée à faible", "Rating: High to Low")],
                ["price_asc", label("Prix : bas à élevé", "Cost: Low to High")],
                ["price_desc", label("Prix : élevé à bas", "Cost: High to Low")],
                [
                  "delivery_time_asc",
                  label("Livraison : plus rapide", "Delivery Time: Fastest First"),
                ],
              ].map(([v, l]) => (
                <Row
                  key={v}
                  value={v}
                  selected={draft.sort === v}
                  onClick={() => setDraft({ ...draft, sort: v })}
                >
                  {l}
                </Row>
              ))}
            {tab === "cuisine" &&
              cuisineOpts.map(([v, l]) => (
                <Row
                  key={v}
                  value={v}
                  selected={(draft.cuisines || []).includes(v)}
                  onClick={() => {
                    const cur = new Set(draft.cuisines || []);
                    cur.has(v) ? cur.delete(v) : cur.add(v);
                    setDraft({ ...draft, cuisines: [...cur] });
                  }}
                >
                  {l}
                </Row>
              ))}
            {tab === "rating" &&
              [3.0, 3.5, 4.0, 4.5].map((v) => (
                <Row
                  key={v}
                  value={`rating-${v}`}
                  selected={Number(draft.min_rating) === v}
                  onClick={() => setDraft({ ...draft, min_rating: v })}
                >
                  {v}+
                </Row>
              ))}
            {tab === "cost" &&
              [
                ["0,500", `< 500 ${currencySymbol}`],
                ["500,1500", `500 – 1 500 ${currencySymbol}`],
                ["1500,3000", `1 500 – 3 000 ${currencySymbol}`],
                ["3000,999999", `3 000+ ${currencySymbol}`],
              ].map(([v, l]) => (
                <Row
                  key={v}
                  value={`cost-${v}`}
                  selected={
                    `${draft.min_price || 0},${draft.max_price || 999999}` === v
                  }
                  onClick={() => {
                    const [lo, hi] = v.split(",").map(Number);
                    setDraft({ ...draft, min_price: lo, max_price: hi });
                  }}
                >
                  {l}
                </Row>
              ))}
            {tab === "diet" &&
              [
                ["all", label("Tout", "All")],
                ["veg_options", label("Options végé", "Vegetarian options")],
                ["pure_veg", label("Végétarien pur", "Pure vegetarian")],
              ].map(([v, l]) => (
                <Row
                  key={v}
                  value={v}
                  selected={(draft.vegetarian || "all") === v}
                  onClick={() => setDraft({ ...draft, vegetarian: v })}
                >
                  {l}
                </Row>
              ))}
            {tab === "avail" &&
              [
                ["open_now", label("Ouvert maintenant", "Open Now")],
                ["delivery", label("Livraison disponible", "Available for Delivery")],
                ["pickup", label("À emporter disponible", "Available for Pickup")],
                ["dine_in", label("Sur place disponible", "Dine-in Available")],
              ].map(([v, l]) => (
                <Row
                  key={v}
                  value={`avail-${v}`}
                  selected={draft.availability === v}
                  onClick={() => setDraft({ ...draft, availability: v })}
                >
                  {l}
                </Row>
              ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            onClick={onClear}
            data-testid="filter-clear"
            className="text-xs text-muted-foreground font-semibold"
          >
            {label("Effacer tout", "Clear all")}
          </button>
          <button
            onClick={onApply}
            data-testid="filter-apply"
            className="h-9 px-4 rounded-full text-xs font-bold text-black"
            style={{ background: FILTER_GREEN }}
          >
            {label("Appliquer", "Apply")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FoodFilterSheet;
