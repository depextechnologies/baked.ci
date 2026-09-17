/**
 * LocaleRouteSync — keeps the browser URL bar in the same language as the UI.
 *
 * Mounted inside the `AppShell` (below `BrowserRouter`), it watches both
 * `location.pathname` and `i18n.language`. When either changes, it:
 *   1. tries to reverse-match the current pathname against `ROUTE_MAP`
 *      (checking both FR and EN patterns via react-router's `matchPath`),
 *   2. rebuilds the pathname in the caller's current language, and
 *   3. calls `navigate(newPath, { replace: true })` when it differs.
 *
 * Result: toggling FR → EN on `/produits` swaps the URL to `/products`
 * on the fly — no full navigation, query strings + hash preserved, and
 * dynamic segments (e.g. `/produits/abc` → `/products/abc`) are honoured.
 *
 * The component renders nothing; it is a side-effect-only observer.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, matchPath } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ROUTE_MAP } from "./routes";

const OTHER_LANG = { fr: "en", en: "fr" };

/**
 * Reverse-lookup helper.
 * Given a pathname, find the ROUTE_MAP key + language it matches (if any).
 * Returns { key, matchedLang, params } or null.
 * We prefer exact-string matches (no `:` params) first so a static "/panier"
 * doesn't accidentally get matched by "/produits/:id" style patterns.
 */
function reverseMatch(pathname) {
  // Fast path — exact string match against every FR/EN alias.
  for (const [key, m] of Object.entries(ROUTE_MAP)) {
    if (!m.en?.includes(":") && !m.fr?.includes(":")) {
      if (pathname === m.fr) return { key, matchedLang: "fr", params: {} };
      if (pathname === m.en) return { key, matchedLang: "en", params: {} };
    }
  }
  // Slow path — pattern match for routes with `:params` (e.g. `/produits/:id`).
  for (const [key, m] of Object.entries(ROUTE_MAP)) {
    for (const lang of ["fr", "en"]) {
      const pattern = m[lang];
      if (!pattern || !pattern.includes(":")) continue;
      const hit = matchPath({ path: pattern, end: true }, pathname);
      if (hit) return { key, matchedLang: lang, params: hit.params || {} };
    }
  }
  return null;
}

function buildPath(pattern, params) {
  let out = pattern;
  for (const [k, v] of Object.entries(params || {})) {
    // Params from matchPath are already URL-decoded — re-encode when re-emitting.
    if (v == null) continue;
    out = out.replace(`:${k}`, encodeURIComponent(v));
  }
  return out;
}

export const LocaleRouteSync = () => {
  const { i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Track last-processed pair so we don't loop when we ourselves navigate.
  const lastRef = useRef({ path: null, lang: null });

  useEffect(() => {
    const lang = (i18n?.language || "fr").slice(0, 2);
    if (!["fr", "en"].includes(lang)) return;

    // Skip if we already synced this exact pair.
    if (lastRef.current.path === location.pathname && lastRef.current.lang === lang) return;

    const hit = reverseMatch(location.pathname);
    if (!hit) {
      // Unknown route (e.g. /admin, /shop) — leave it alone.
      lastRef.current = { path: location.pathname, lang };
      return;
    }

    // Already in the right language — nothing to swap.
    if (hit.matchedLang === lang) {
      lastRef.current = { path: location.pathname, lang };
      return;
    }

    // Build the localised pathname and rewrite the URL without a full nav.
    const target = ROUTE_MAP[hit.key]?.[lang];
    if (!target) return;
    const newPath = buildPath(target, hit.params) + location.search + location.hash;
    if (newPath === location.pathname + location.search + location.hash) return;

    lastRef.current = { path: newPath, lang };
    navigate(newPath, { replace: true });
    // Note: no scroll reset — this is a pure URL swap.
  }, [location.pathname, location.search, location.hash, i18n?.language, navigate]);

  return null;
};

export default LocaleRouteSync;
