/**
 * ProductDetails — dynamic expandable product-information block for the
 * customer PDP (Fixing_Prompt.docx v4, 2026-02-28).
 *
 * Reads from the product's `details` JSONB + a handful of first-class
 * columns (description, manufacturer, brand). Only renders non-empty
 * values, so a product with just a description still looks clean; a
 * fully-populated food product shows nutrition + allergens + FSSAI + …
 *
 * Structure mirrors Screenshot 1 / 2 in the docx:
 *   • collapsed: a small "Flavour · <value>" preview + "View more details ▾"
 *   • expanded: labeled key/value pairs + nutrition sub-table + return policy
 */
import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

// Well-known label mapping so slugged keys render as human-readable copy.
const LABELS = {
  flavour:              "Flavour",
  diet_preference:      "Diet Preference",
  ingredients:          "Ingredients",
  allergens:            "Allergen Information",
  shelf_life:           "Shelf Life",
  taste_profile:        "Taste Profile",
  disclaimer:           "Disclaimer",
  customer_care:        "Customer Care",
  country_of_origin:    "Country of Origin",
  manufacturer:         "Manufacturer",
  manufacturer_address: "Manufacturer Address",
  marketer_name:        "Marketer Name",
  marketer_address:     "Marketer Address",
  fssai:                "FSSAI License",
  seller:               "Seller",
  seller_fssai:         "Seller FSSAI",
  storage_instructions: "Storage Instructions",
  return_policy:        "Return Policy",
  serve_size:           "Serve Size",
};

// Order in which known keys render. Anything else (custom supplier keys)
// falls through into an alphabetical "More info" list.
const RENDER_ORDER = [
  "flavour", "diet_preference", "ingredients", "allergens", "taste_profile",
  "serve_size", "shelf_life", "storage_instructions",
  "manufacturer", "manufacturer_address", "marketer_name", "marketer_address",
  "country_of_origin", "fssai", "seller", "seller_fssai", "customer_care",
  "disclaimer", "return_policy",
];

const humanize = (slug) => slug
  .replaceAll("_", " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());

const isEmpty = (v) => v == null || v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

const NUTRITION_LABELS = {
  energy_kcal:   "Calories (Kcal)",
  protein_g:     "Protein (g)",
  carbs_g:       "Total Carbohydrates (g)",
  sugar_g:       "Total Sugar (g)",
  added_sugar_g: "Added Sugars (g)",
  fat_g:         "Total Fat (g)",
  saturated_g:   "Saturated Fat (g)",
  trans_g:       "Trans Fat (g)",
  cholesterol_mg:"Cholesterol (mg)",
  fiber_g:       "Dietary Fiber (g)",
  sodium_mg:     "Sodium (mg)",
};

export const ProductDetails = ({ product }) => {
  const [expanded, setExpanded] = useState(false);

  // Merge the flat first-class columns that map cleanly into a "label" so
  // suppliers who haven't migrated to `details` yet still surface useful
  // info. `details` takes precedence when both exist.
  const merged = useMemo(() => {
    const d = product?.details || {};
    const base = {
      description:  product?.description,
      manufacturer: d.manufacturer || product?.manufacturer,
    };
    // Details keys override base; nutrition + custom pass through.
    return { ...base, ...d };
  }, [product]);

  const nutrition = merged.nutrition && typeof merged.nutrition === "object" ? merged.nutrition : null;

  const knownRows = useMemo(() => {
    return RENDER_ORDER
      .filter((k) => !isEmpty(merged[k]))
      .map((k) => [k, merged[k]]);
  }, [merged]);

  const customRows = useMemo(() => {
    // Everything the supplier added that we don't have an explicit label
    // for — surfaces as "More info" so custom fields (docx §10) are visible.
    const known = new Set(RENDER_ORDER);
    known.add("nutrition"); known.add("description"); known.add("id");
    return Object.entries(merged)
      .filter(([k, v]) => !known.has(k) && !isEmpty(v) && typeof v !== "object")
      .sort(([a], [b]) => a.localeCompare(b));
  }, [merged]);

  // If there's literally nothing to show, hide the whole section.
  const hasAnything = knownRows.length + customRows.length + (nutrition ? 1 : 0) + (merged.description ? 1 : 0) > 0;
  if (!hasAnything) return null;

  // Collapsed preview — mirror Screenshot 1 (Flavour · <value>). Falls back
  // to the first known row when Flavour isn't set.
  const previewKey = knownRows.find(([k]) => k === "flavour")?.[0] || knownRows[0]?.[0];
  const previewValue = previewKey ? merged[previewKey] : null;

  return (
    <section
      className="mt-8 rounded-2xl border border-border bg-card p-5"
      data-testid="product-details"
    >
      <h2 className="text-lg font-bold text-foreground">Product Details</h2>

      {/* Compact preview line (visible whether collapsed or expanded) */}
      {previewKey && (
        <div className="mt-3">
          <div className="text-sm font-semibold text-foreground">{LABELS[previewKey] || humanize(previewKey)}</div>
          <div className="text-sm text-muted-foreground">{String(previewValue)}</div>
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        data-testid="product-details-toggle"
        aria-expanded={expanded}
      >
        {expanded ? "Hide details" : "View more details"}
        <ChevronDown
          size={14}
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
        />
      </button>

      {expanded && (
        <div className="mt-5 space-y-4" data-testid="product-details-expanded">
          {merged.description && (
            <Row label="Description" value={merged.description} />
          )}

          {/* All known rows except the preview row (avoid duplicate render) */}
          {knownRows
            .filter(([k]) => k !== previewKey)
            .map(([k, v]) => <Row key={k} label={LABELS[k] || humanize(k)} value={v} />)}

          {/* Nutrition sub-table */}
          {nutrition && (
            <div className="pt-1" data-testid="product-details-nutrition">
              <div className="text-sm font-semibold text-foreground">Nutrition Information</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(nutrition)
                  .filter(([, v]) => !isEmpty(v))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">{NUTRITION_LABELS[k] || humanize(k)}</span>
                      <span className="font-medium text-foreground">{String(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Supplier custom fields — mirrors docx §10 */}
          {customRows.length > 0 && (
            <div className="pt-1" data-testid="product-details-custom">
              <div className="text-sm font-semibold text-foreground">More info</div>
              <div className="mt-2 space-y-2">
                {customRows.map(([k, v]) => (
                  <Row key={k} label={humanize(k)} value={v} compact />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const Row = ({ label, value, compact = false }) => (
  <div className={compact ? "" : "border-t border-border pt-3 first:border-t-0 first:pt-0"}>
    <div className="text-sm font-semibold text-foreground">{label}</div>
    <div className="text-sm text-muted-foreground whitespace-pre-line mt-0.5">{String(value)}</div>
  </div>
);

export default ProductDetails;
