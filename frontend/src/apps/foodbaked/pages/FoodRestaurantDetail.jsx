/**
 * FoodRestaurantDetail — Phase 2 menu screen.
 *
 * Route: /food/r/:slug (customer). Data source: /api/food/restaurants/:slug/menu.
 *
 * Layout:
 *   • Restaurant hero (image · name · cuisines · rating · ETA · delivery)
 *   • Sticky section chip bar (Starters / Burgers / Sides / Drinks)
 *   • Menu items list, scrolled section by section, with image + +Add
 *   • Item modal (bottom sheet on mobile / centered on desktop) with:
 *       — quantity stepper
 *       — variant picker (radio)
 *       — add-on picker (multi-select)
 *       — running total
 *       — "Add to cart" CTA calling addFoodItem() on CartProvider
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star, Clock, ArrowLeft, Plus, Minus, Leaf, X, Check } from "lucide-react";
import { useApp, useCart } from "../../../contexts/BakedContexts";
import { toast } from "sonner";
import axios from "axios";

const API   = process.env.REACT_APP_BACKEND_URL;
const GREEN = "#77BC1F";

const formatPrice = (v, cur) => `${Math.round(Number(v || 0)).toLocaleString()} ${cur || ""}`;

const localised = (lang, obj, key) => (lang === "fr" ? obj[`${key}_fr`] : obj[`${key}_en`]) || obj[`${key}_en`];

// -------------------------------------------------------------------------
// Item detail modal — variants + add-ons + qty + add-to-cart
// -------------------------------------------------------------------------

const ItemModal = ({ item, restaurant, onClose }) => {
  const { t, i18n } = useTranslation("customer");
  const { addFoodItem, openCart } = useCart();
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";

  const defaultVariant = useMemo(
    () => item.variants?.find((v) => v.is_default) || item.variants?.[0] || null,
    [item],
  );
  const [variantId, setVariantId] = useState(defaultVariant?.id || null);
  const [addonIds, setAddonIds] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const variant = item.variants?.find((v) => v.id === variantId) || null;
  const addons  = (item.addons || []).filter((a) => addonIds.includes(a.id));

  const unitPrice = Number(item.base_price || 0)
    + Number(variant?.price_delta || 0)
    + addons.reduce((s, a) => s + Number(a.price || 0), 0);
  const total = unitPrice * quantity;

  const toggleAddon = (id) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleAdd = async () => {
    setBusy(true);
    try {
      await addFoodItem({
        item: {
          // Pass the ORIGINAL base_price so addFoodItem's reducer can add
          // variant.price_delta + addon prices exactly once. Double-adding
          // was the "8,100 vs 6,300" discrepancy caught in dev.
          id: item.id, name: item.name, image: item.image,
          base_price: item.base_price, currency: item.currency, currency_symbol: item.currency,
          description: item.description,
        },
        restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
        variant: variant ? { id: variant.id, name: localised(lang, variant, "name"), price_delta: variant.price_delta } : null,
        addons: addons.map((a) => ({ id: a.id, name: localised(lang, a, "name"), price: a.price })),
        quantity,
      });
      toast.success(t("food.added_to_cart", { defaultValue: `${item.name} added to cart`, name: item.name }));
      onClose();
      // Slight delay so the toast is visible before the drawer slides in.
      setTimeout(() => openCart(), 150);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center md:justify-center" data-testid="food-item-modal">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-testid="food-item-backdrop"
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full md:max-w-lg md:rounded-2xl md:border md:border-border bg-background overflow-hidden max-h-[92vh] flex flex-col">
        <div className="relative aspect-[16/9] bg-muted shrink-0">
          {item.image
            ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center"
            aria-label="Close"
            data-testid="food-item-close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{item.name}</h2>
              {item.is_veg && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
                  <Leaf size={10} /> VEG
                </span>
              )}
            </div>
            {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
            <div className="text-lg font-bold mt-2">{formatPrice(item.base_price, item.currency)}</div>
          </div>

          {item.variants?.length > 1 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                {t("food.variants_title", { defaultValue: "Choose a size" })}
              </h3>
              <div className="space-y-2">
                {item.variants.map((v) => {
                  const on = v.id === variantId;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      data-testid={`food-variant-${v.id}`}
                      className={`w-full h-11 px-3 rounded-lg border flex items-center justify-between motion-fast ${on ? "border-[color:var(--green)]" : "border-border"}`}
                      style={{ "--green": GREEN }}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`w-4 h-4 rounded-full border-2 ${on ? "border-[color:var(--green)]" : "border-border"} flex items-center justify-center`} style={{ "--green": GREEN }}>
                          {on && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GREEN }} />}
                        </span>
                        {localised(lang, v, "name")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {Number(v.price_delta) > 0 ? `+${formatPrice(v.price_delta, item.currency)}` : t("food.included", { defaultValue: "Included" })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {item.addons?.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                {t("food.addons_title", { defaultValue: "Add-ons (optional)" })}
              </h3>
              <div className="space-y-2">
                {item.addons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAddon(a.id)}
                      data-testid={`food-addon-${a.id}`}
                      className={`w-full h-11 px-3 rounded-lg border flex items-center justify-between motion-fast ${on ? "border-[color:var(--green)]" : "border-border"}`}
                      style={{ "--green": GREEN }}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className={`w-4 h-4 rounded border-2 ${on ? "border-[color:var(--green)]" : "border-border"} flex items-center justify-center`} style={{ "--green": GREEN, backgroundColor: on ? GREEN : "transparent" }}>
                          {on && <Check size={11} className="text-black" strokeWidth={3} />}
                        </span>
                        {localised(lang, a, "name")}
                      </span>
                      <span className="text-xs font-semibold">+{formatPrice(a.price, item.currency)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="border-t border-border p-4 flex items-center gap-3 shrink-0 bg-background">
          <div className="inline-flex items-center rounded-full border border-border overflow-hidden">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 flex items-center justify-center hover:bg-secondary"
              data-testid="food-qty-decr"
              aria-label="Decrease"
            ><Minus size={14} /></button>
            <span className="text-sm font-bold w-8 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              className="w-9 h-9 flex items-center justify-center hover:bg-secondary"
              data-testid="food-qty-incr"
              aria-label="Increase"
            ><Plus size={14} /></button>
          </div>
          <button
            onClick={handleAdd}
            disabled={busy}
            data-testid="food-add-to-cart-btn"
            className="flex-1 h-11 rounded-full font-semibold text-black disabled:opacity-60"
            style={{ backgroundColor: GREEN }}
          >
            {busy
              ? t("food.adding", { defaultValue: "Adding…" })
              : `${t("food.add_to_cart", { defaultValue: "Add to cart" })} · ${formatPrice(total, item.currency)}`}
          </button>
        </footer>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export const FoodRestaurantDetail = () => {
  const { t, i18n } = useTranslation("customer");
  const { slug } = useParams();
  const { countryCode } = useApp() || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const sectionsRef = useRef({});
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const { data: menu } = await axios.get(
          `${API}/api/food/restaurants/${encodeURIComponent(slug)}/menu?country=${encodeURIComponent(countryCode || "CI")}`,
        );
        if (!cancel) {
          setData(menu);
          setActiveSection(menu.sections?.[0]?.id || null);
        }
      } catch (e) {
        console.warn("food.detail load failed", e?.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [slug, countryCode]);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const el = sectionsRef.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="baked-container py-16 text-center text-muted-foreground" data-testid="food-detail-loading">
        {t("food.loading_menu", { defaultValue: "Loading menu…" })}
      </div>
    );
  }
  if (!data) {
    return <div className="baked-container py-16 text-center text-muted-foreground">Restaurant not found.</div>;
  }

  const { restaurant, sections } = data;
  const cur = restaurant.cuisines?.[0] === "indian" ? "INR" : restaurant.image;  // placeholder, unused

  return (
    <div className="pb-24" data-testid="food-restaurant-detail">
      {/* Hero */}
      <section className="relative">
        <div className="relative aspect-[21/6] bg-muted overflow-hidden">
          <img src={restaurant.image} alt={restaurant.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
        <div className="baked-container -mt-16 relative">
          <button
            onClick={() => window.history.back()}
            className="mb-3 inline-flex items-center gap-1 text-white text-sm hover:opacity-80"
            data-testid="food-detail-back"
          >
            <ArrowLeft size={16} /> {t("food.back", { defaultValue: "Back" })}
          </button>
          <div className="rounded-2xl bg-card border border-border p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">{restaurant.name}</h1>
                <div className="text-sm text-muted-foreground mt-0.5">{(restaurant.cuisines || []).join(" · ")}</div>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-1 rounded-full ${restaurant.is_open ? "text-black" : "bg-secondary text-muted-foreground"}`}
                style={restaurant.is_open ? { backgroundColor: `${GREEN}33`, color: GREEN } : {}}
              >
                {restaurant.is_open ? t("food.status_open", { defaultValue: "Open Now" }) : t("food.status_closed", { defaultValue: "Closed" })}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 flex-wrap text-sm">
              <span className="inline-flex items-center gap-1 font-semibold">
                <Star size={14} className="fill-current" style={{ color: GREEN }} /> {Number(restaurant.rating || 0).toFixed(1)}
                <span className="text-muted-foreground">({restaurant.review_count})</span>
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock size={14} /> {restaurant.prep_time_min}–{restaurant.prep_time_max} min
              </span>
              <span className="text-muted-foreground">
                {restaurant.delivery_fee === 0
                  ? t("food.free_delivery", { defaultValue: "Free delivery" })
                  : `${formatPrice(restaurant.delivery_fee, restaurant.cuisines?.includes("indian") ? "INR" : "CFA")} delivery`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky section tabs */}
      <div className="sticky top-16 z-30 bg-background border-b border-border" data-testid="food-section-tabs">
        <div className="baked-container overflow-x-auto -mx-2 px-2">
          <div className="flex gap-2 py-3 min-w-max">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                data-testid={`food-section-tab-${s.id}`}
                className={`h-9 px-4 rounded-full text-xs font-semibold whitespace-nowrap motion-fast ${
                  activeSection === s.id ? "text-black" : "bg-card text-foreground border border-border hover:bg-secondary"
                }`}
                style={activeSection === s.id ? { backgroundColor: GREEN } : {}}
              >
                {localised(lang, s, "name")} · {s.items.length}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Menu list */}
      <div className="baked-container mt-6 space-y-10">
        {sections.map((s) => (
          <section
            key={s.id}
            ref={(el) => { if (el) sectionsRef.current[s.id] = el; }}
            data-testid={`food-section-${s.id}`}
          >
            <h2 className="text-xl font-bold mb-4">{localised(lang, s, "name")}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {s.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setOpenItem(it)}
                  data-testid={`food-item-card-${it.id}`}
                  className="text-left rounded-2xl border border-border bg-card overflow-hidden flex gap-4 p-3 hover:border-[color:var(--green)] motion-fast"
                  style={{ "--green": GREEN }}
                >
                  <div className="w-24 h-24 rounded-xl bg-muted overflow-hidden shrink-0">
                    {it.image && <img src={it.image} alt={it.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold truncate">{it.name}</div>
                      {(it.tags || []).slice(0, 1).map((tag) => (
                        <span key={tag} className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    {it.description && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{it.description}</div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm font-bold">{formatPrice(it.base_price, it.currency)}</div>
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold"
                        style={{ backgroundColor: GREEN }}
                        aria-hidden="true"
                      >
                        <Plus size={16} />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              {s.items.length === 0 && (
                <div className="text-sm text-muted-foreground">{t("food.section_empty", { defaultValue: "Nothing on the menu here yet." })}</div>
              )}
            </div>
          </section>
        ))}
      </div>

      {openItem && (
        <ItemModal
          item={openItem}
          restaurant={restaurant}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
};

export default FoodRestaurantDetail;
