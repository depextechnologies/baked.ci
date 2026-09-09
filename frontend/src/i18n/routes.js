/**
 * Locale-aware route paths (Phase C · Workstream 3).
 *
 * The BAKĒD customer app is French-first: when a French user browses the
 * store, we want the URL bar to read `/produits`, `/panier`, `/paiement` —
 * not the English `/products`, `/cart`, `/checkout`. English URLs still
 * resolve (both are registered in CustomerApp), so external bookmarks and
 * old share links keep working.
 *
 * How to use inside a component:
 *
 *   import { useLocalePath } from "@/i18n/routes";
 *   const path = useLocalePath();
 *   <Link to={path("cart")}>Voir le panier</Link>
 *   navigate(path("checkout"));
 *
 * For dynamic segments:
 *
 *   navigate(path("order", { id: orderId }));   // → /commandes/abc123
 *
 * Keys map to the SAME component in both languages — we only rewrite the URL.
 */
import { useTranslation } from "react-i18next";

// Every customer-facing route the storefront exposes.
// FR is source-of-truth per client brief.
export const ROUTE_MAP = {
  home:            { fr: "/",                        en: "/" },
  categories:      { fr: "/categories",              en: "/categories" }, // same word
  categoryDetail:  { fr: "/categories/:slug",        en: "/categories/:slug" },
  products:        { fr: "/produits",                en: "/products" },
  productDetail:   { fr: "/produits/:id",            en: "/products/:id" },
  cart:            { fr: "/panier",                  en: "/cart" },
  checkout:        { fr: "/paiement",                en: "/checkout" },
  orders:          { fr: "/commandes",               en: "/orders" },
  order:           { fr: "/commandes/:id",           en: "/orders/:id" },
  orderTrack:      { fr: "/commandes/:id/suivi",     en: "/orders/:id/track" },
  orderConfirm:    { fr: "/commandes/:id/confirmation", en: "/orders/:id/confirmation" },
  orderDelivered:  { fr: "/commandes/:id/livree",    en: "/orders/:id/delivered" },
  wallet:          { fr: "/portefeuille",            en: "/wallet" },
  profile:         { fr: "/compte",                  en: "/profile" },
  profileAddresses:{ fr: "/compte/adresses",         en: "/profile/addresses" },
  profileSettings: { fr: "/compte/parametres",       en: "/profile/settings" },
  profileHelp:     { fr: "/compte/aide",             en: "/profile/help" },
  profileActivities:{ fr: "/compte/activites",       en: "/profile/activities" },
  profileRewards:  { fr: "/compte/recompenses",      en: "/profile/rewards" },
  profileRefer:    { fr: "/compte/parrainage",       en: "/profile/refer" },
};

/**
 * Return the URL for a route key in the given language, interpolating params.
 * Unknown keys fall through to `/` so a typo never crashes the app.
 */
export function resolvePath(key, lang = "fr", params = {}) {
  const entry = ROUTE_MAP[key];
  if (!entry) return "/";
  let path = entry[lang] || entry.fr || "/";
  for (const [k, v] of Object.entries(params)) {
    path = path.replace(`:${k}`, encodeURIComponent(v));
  }
  return path;
}

/**
 * Hook variant — the more common form. Returns a `path(key, params?)` helper
 * bound to the current i18next language.
 */
export function useLocalePath() {
  const { i18n } = useTranslation();
  const lang = (i18n?.language || "fr").slice(0, 2);
  return (key, params) => resolvePath(key, lang, params);
}
