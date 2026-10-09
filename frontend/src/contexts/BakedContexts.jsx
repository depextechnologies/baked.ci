import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "../lib/api";
import i18n from "../i18n";

const AuthCtx = createContext(null);
const AppCtx = createContext(null);
const CartCtx = createContext(null);

// ------- AuthProvider -------
export const AuthProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  const setToken = useCallback((token) => {
    if (token) localStorage.setItem("baked_access_token", token);
    else localStorage.removeItem("baked_access_token");
  }, []);

  // Opens the global Sign-In dialog. If a target route is provided (or the current
  // pathname when omitted), we save it so the user is auto-redirected back after
  // successful login (see loginWithToken → baked_post_login).
  const openLogin = useCallback((target) => {
    if (typeof window !== "undefined") {
      const dest = target || (window.location.pathname + window.location.search);
      if (dest && dest !== "/") sessionStorage.setItem("baked_post_login", dest);
    }
    setLoginOpen(true);
  }, []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("baked_access_token");
    if (!token) {
      setCustomer(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setCustomer(data);
    } catch (e) {
      setCustomer(null);
      void e;
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Skip refresh if returning from Google Auth callback (fragment session_id)
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const loginWithToken = useCallback(async (token, cust) => {
    setToken(token);
    setCustomer(cust);
    // Redirect to the intended destination if any (e.g. Profile route the user tried to hit)
    if (typeof window !== "undefined") {
      const target = sessionStorage.getItem("baked_post_login");
      if (target) {
        sessionStorage.removeItem("baked_post_login");
        // Defer to next tick so the token/customer state has propagated
        setTimeout(() => { window.location.href = target; }, 50);
      }
    }
  }, [setToken]);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (e) { void e; }
    setToken(null);
    setCustomer(null);
  }, [setToken]);

  const value = useMemo(() => ({ customer, loading, refresh, loginWithToken, logout, setToken, loginOpen, openLogin, closeLogin }), [customer, loading, refresh, loginWithToken, logout, setToken, loginOpen, openLogin, closeLogin]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};
export const useAuth = () => useContext(AuthCtx);


// ------- AppProvider -------
// Owns: active business module, active country (config), theme, UI language
const DEFAULT_COUNTRY = "CI";

// Snapshot at module-load: was the country ever persisted before this session
// started? Used to decide whether the geolocation-based auto-detect should
// run (we only auto-detect on the very first visit).
const HAD_SAVED_COUNTRY = !!localStorage.getItem("baked_country");

// Initial language detector. Per client brief (Workstream 3), BAKĒD is
// French-first everywhere — we do NOT sniff navigator.language on the
// very first visit anymore, because the platform launches in Côte d'Ivoire
// (French-native) and English is only for the internal QA team. Users who
// prefer English opt in via the header switcher (persists to localStorage)
// or by appending `?lang=en` to any URL.
const detectInitialLanguage = () => {
  const saved = localStorage.getItem("baked_language");
  if (saved === "fr" || saved === "en") return saved;
  // Query-string override honours shared deep-links like `?lang=en`.
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "fr" || q === "en") return q;
  } catch (_) { /* SSR/no-window */ }
  return "fr";
};

export const AppProvider = ({ children }) => {
  const [activeModule, setActiveModule] = useState("mart");
  const [countryCode, setCountryCode] = useState(localStorage.getItem("baked_country") || DEFAULT_COUNTRY);
  const [countries, setCountries] = useState([]);
  const [modules, setModules] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem("baked_theme") || "dark");
  const [language, setLanguageState] = useState(detectInitialLanguage);
  // Force i18next to the language AppProvider chose on the very first
  // paint. Without this, i18next-browser-languagedetector may briefly
  // resolve to a stale cookie / htmlTag value and lock the app into
  // English before the [language]-effect below writes the fix back to
  // localStorage.
  useEffect(() => {
    if (i18n?.language !== language) {
      try { i18n.changeLanguage(language); } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Active delivery address — the single source of truth across every module.
  // Persisted in localStorage for guests; hydrated from saved addresses for authed users.
  const [activeAddress, _setActiveAddress] = useState(() => {
    try { return JSON.parse(localStorage.getItem("baked_active_address")) || null; } catch { return null; }
  });
  const setActiveAddress = useCallback((addr) => {
    _setActiveAddress(addr);
    if (addr) localStorage.setItem("baked_active_address", JSON.stringify(addr));
    else localStorage.removeItem("baked_active_address");
  }, []);
  const [addressSelectorOpen, setAddressSelectorOpen] = useState(false);
  const [addressSelectorClosing, setAddressSelectorClosing] = useState(false);
  const [addressSelectorMode, setAddressSelectorMode] = useState({ callback: null, title: null });

  // Active FOODbakēd service mode (delivery / pickup / dine_in). Persisted
  // across page navigation so a diner picking "À emporter" on the home page
  // stays in pickup when they bounce into a restaurant and come back.
  const [foodServiceMode, _setFoodServiceMode] = useState(() => {
    try { return localStorage.getItem("baked_food_mode") || "delivery"; } catch { return "delivery"; }
  });
  const setFoodServiceMode = useCallback((m) => {
    const normalised = (m === "dine-in" ? "dine_in" : m) || "delivery";
    _setFoodServiceMode(normalised);
    try { localStorage.setItem("baked_food_mode", normalised); } catch { /* ignore quota */ }
  }, []);
  const openAddressSelector = useCallback((opts) => {
    // opts.onPick(address) — when provided, invoked with the picked address INSTEAD of updating global activeAddress.
    // opts.title — override modal title (e.g. "Pickup location")
    setAddressSelectorMode({ callback: opts?.onPick || null, title: opts?.title || null });
    setAddressSelectorClosing(false);
    setAddressSelectorOpen(true);
  }, []);
  const closeAddressSelector = useCallback(() => {
    // Two-step unmount to defuse the "Failed to execute 'removeChild' on
    // 'Node'" runtime error that fires when the AddressSelector modal
    // closes while its Google Maps PreviewMap (@vis.gl/react-google-maps
    // <AdvancedMarker> portal) is still mounted. Flipping `closing=true`
    // signals AddressSelectorInner to reset its step to "search" (which
    // unmounts the map cleanly), THEN we tear down the modal on the next
    // microtask so React finishes committing the map-unmount before the
    // ancestor is removed. Every close path (X button, backdrop click,
    // Confirm callback) funnels through here so all three get the fix.
    setAddressSelectorClosing(true);
    queueMicrotask(() => {
      setAddressSelectorOpen(false);
      setAddressSelectorClosing(false);
      setAddressSelectorMode({ callback: null, title: null });
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("baked_theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("baked_country", countryCode); }, [countryCode]);
  useEffect(() => {
    localStorage.setItem("baked_language", language);
    document.documentElement.lang = language;
    // Keep the i18next runtime in sync with the AppProvider language so
    // hooks (`useTranslation`) re-render on every toggle without needing
    // an extra listener at every call site.
    if (i18n?.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  /**
   * Geolocation → country detection. Returns a Promise that resolves to
   * `{ ok, iso?, reason? }` — never throws.
   *
   *   ok=true  → the detected country was accepted and `setCountryCode` fired
   *   ok=false → reasons: "unsupported" | "denied" | "unavailable" | "timeout"
   *              | "no_maps" | "not_supported_country" | "no_country"
   *
   * Reused by (a) the first-visit auto-detect effect below and (b) the
   * "Use my location" chip in the country switcher (`TopNav.jsx`).
   */
  const detectCountryByLocation = useCallback(() => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ ok: false, reason: "unsupported" }); return; }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { reverseGeocode } = await import("../lib/googleMaps");
          const place = await reverseGeocode({ lat: coords.latitude, lng: coords.longitude });
          const iso = (place?.country || "").toUpperCase();
          if (!iso) return resolve({ ok: false, reason: "no_country" });
          const allowed = countries.map((c) => c.code);
          if (allowed.length > 0 && !allowed.includes(iso)) {
            return resolve({ ok: false, iso, reason: "not_supported_country" });
          }
          setCountryCode(iso);
          resolve({ ok: true, iso });
        } catch { resolve({ ok: false, reason: "no_maps" }); }
      },
      (err) => {
        // PositionError.code — 1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT
        const reason = err?.code === 1 ? "denied"
                     : err?.code === 2 ? "unavailable"
                     : err?.code === 3 ? "timeout"
                     : "unavailable";
        resolve({ ok: false, reason });
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60 * 60 * 1000 },
    );
  }), [countries]);

  /**
   * First-visit geolocation → country detection.
   *
   * Runs once on mount only when `baked_country` has NEVER been set (so we
   * respect any explicit choice the user has already made). Silently no-ops
   * on any error — never blocks the app.
   *
   * See docs/prompts/India_Location.txt §3.
   */
  const firstVisitDetectFiredRef = useRef(false);

  useEffect(() => {
    if (HAD_SAVED_COUNTRY) return;                          // respect any prior explicit choice
    if (countries.length === 0) return;                     // wait until backend allowlist is loaded
    if (firstVisitDetectFiredRef.current) return;            // fire-and-forget only once per session
    firstVisitDetectFiredRef.current = true;
    detectCountryByLocation();
  }, [countries, detectCountryByLocation]);

  useEffect(() => {
    (async () => {
      try {
        const { data: cs } = await api.get("/config/countries");
        setCountries(cs);
        const { data: ms } = await api.get(`/config/modules?country=${countryCode}`);
        setModules(ms);
      } catch (e) { console.error("config load failed", e); }
    })();
  }, [countryCode]);

  const country = useMemo(() => countries.find((c) => c.code === countryCode) || { code: countryCode, currency: "XOF", currency_symbol: "CFA", locale: "fr-CI", phone_code: "+225", delivery_eta_min: "10-15 min", min_order: 3000, delivery_fee: 500, free_delivery_over: 15000 }, [countries, countryCode]);

  // UI locale is derived from language + country region — e.g. "fr" + "CI" = "fr-CI"
  const uiLocale = useMemo(() => `${language}-${countryCode}`, [language, countryCode]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const setLanguage = (lng) => setLanguageState(lng === "en" ? "en" : "fr");

  const value = useMemo(() => ({ activeModule, setActiveModule, countryCode, setCountryCode, detectCountryByLocation, country, countries, modules, theme, toggleTheme, language, setLanguage, uiLocale, activeAddress, setActiveAddress, addressSelectorOpen, addressSelectorClosing, openAddressSelector, closeAddressSelector, addressSelectorMode, foodServiceMode, setFoodServiceMode }), [activeModule, countryCode, detectCountryByLocation, country, countries, modules, theme, language, uiLocale, activeAddress, setActiveAddress, addressSelectorOpen, addressSelectorClosing, openAddressSelector, closeAddressSelector, addressSelectorMode, foodServiceMode, setFoodServiceMode]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};
export const useApp = () => useContext(AppCtx);


// ------- CartProvider -------
// Guest cart lives in localStorage. On login → guest items are auto-merged
// into the server cart, then hydrated from server. Modifications post to
// server if authed, otherwise mutate the localStorage guest cart in place.
//
// Guest item shape:
//   MART:  { id: "g_<pid>",  product_id, quantity, module: "mart",
//            snapshot: { id, name, unit, image, brand, price, currency,
//                        currency_symbol, was_price, compare_at_price,
//                        original_price, master_price, is_stocked_locally } }
//   SHOP:  { id: "gs_<vid>", variant_id, product_id, quantity, module: "shop",
//            snapshot: { title, image, price, compare_at_price, currency,
//                        variant_attributes, sku } }
// Both modules snapshot product/variant info at add-time so hydrate is
// offline-friendly. Legacy MART entries without a snapshot fall back to
// `/mart/products/{id}` fetch. Backend re-validates authoritatively at
// checkout (Fixing_Prompt §25).
const GUEST_KEY = "baked_guest_cart";

const readGuest = () => { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || { items: [] }; } catch { return { items: [] }; } };
const writeGuest = (c) => localStorage.setItem(GUEST_KEY, JSON.stringify(c));

export const CartProvider = ({ children }) => {
  const { customer } = useAuth() || {};
  const app = useContext(AppCtx);          // optional — may be null in test harnesses
  const [cart, setCart] = useState({ items: [], subtotal: 0, item_count: 0 });
  const [quote, setQuote] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Drawer state lives on the cart context so ANY component (top-nav,
  // add-to-cart callbacks, /cart route redirect, etc.) can open/close
  // without prop-drilling.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openCart = useCallback(() => setDrawerOpen(true), []);
  const closeCart = useCallback(() => setDrawerOpen(false), []);
  // Track auth transitions so we only run merge exactly once per login.
  const prevCustomerId = useRef(null);

  const hydrateGuest = useCallback(async () => {
    const g = readGuest();
    if (!g.items?.length) { setCart({ items: [], subtotal: 0, item_count: 0 }); return; }
    const items = [];
    let martSubtotal = 0;
    let shopSubtotal = 0;
    let foodSubtotal = 0;
    for (const it of g.items) {
      if (it.module === "shop") {
        // Guest SHOP row — render from the snapshot captured at add-time so
        // we don't pay 1 network round-trip per item on every page load.
        const s = it.snapshot || {};
        const price = Number(s.price) || 0;
        const line = price * it.quantity;
        shopSubtotal += line;
        items.push({
          id: it.id, module: "shop", quantity: it.quantity,
          line_total: line, currency: s.currency || "XOF",
          variant: { id: it.variant_id, price, currency: s.currency || "XOF",
                     sku: s.sku, attributes: s.variant_attributes || {},
                     images: s.image ? [s.image] : [] },
          product: { id: it.product_id, title: s.title, images: s.image ? [s.image] : [] },
          product_id: it.variant_id, sku: s.sku, title: s.title,
          images: s.image ? [s.image] : [], unit_price: price,
        });
      } else {
        // Guest non-SHOP row (MART or FOOD) — render from the snapshot
        // captured at add-time when present. Legacy entries (added before
        // the snapshot was introduced) fall back to a network fetch so no
        // cart is left stranded after the upgrade.
        //
        // Preserve `it.module` verbatim (defaulting to 'mart' for legacy
        // rows that predate the module tag). Coercing to 'mart' here was
        // the root cause of the FOOD chip regression flagged in
        // iteration_87 — a guest row {module:'food',…} was rendered with
        // a MART badge because both branches below hard-coded 'mart'.
        const mod = it.module || "mart";
        if (it.snapshot) {
          const s = it.snapshot;
          const price = Number(s.price) || 0;
          const line = price * it.quantity;
          // Route to the correct subtotal bucket — the earlier "always MART"
          // accumulator was double-counting FOOD lines (they'd also be
          // picked up by the drawer's food fallback filter → 2× subtotal).
          if (mod === "food") foodSubtotal += line;
          else                martSubtotal += line;
          items.push({
            id: it.id, product_id: it.product_id, quantity: it.quantity,
            module: mod, product: s, line_total: line,
            // Keep the restaurant_id at the top level of the row so the
            // /cart/quote request builder can pick it up without digging
            // into the per-line snapshot. Previously the FOOD snapshot
            // owned the ID but the quote caller looked at `i.restaurant_id`
            // first and never found it → food subtotal silently empty.
            restaurant_id: s.restaurant_id,
          });
        } else {
          try {
            const { data: p } = await api.get(`/mart/products/${it.product_id}`);
            const line = (Number(p.price) || 0) * it.quantity;
            if (mod === "food") foodSubtotal += line;
            else                martSubtotal += line;
            items.push({ ...it, product: p, line_total: line, module: mod });
          } catch (e) { void e; }
        }
      }
    }
    const item_count = items.reduce((s, i) => s + i.quantity, 0);
    setCart({
      items, subtotal: martSubtotal + shopSubtotal + foodSubtotal, item_count,
      mart: { subtotal: martSubtotal, item_count: items.filter((i) => i.module !== "shop" && i.module !== "food").reduce((s, i) => s + i.quantity, 0) },
      shop: { subtotal: shopSubtotal, item_count: items.filter((i) => i.module === "shop").reduce((s, i) => s + i.quantity, 0) },
      food: { subtotal: foodSubtotal, item_count: items.filter((i) => i.module === "food").reduce((s, i) => s + i.quantity, 0) },
    });
  }, []);

  // Replay every guest item into the server cart via the standard add
  // endpoints (which upsert on duplicates → natural quantity merging), then
  // clear the guest cart. Called exactly once on the null→customer edge.
  const mergeGuestIntoServer = useCallback(async () => {
    const g = readGuest();
    if (!g.items?.length) return;
    // FOOD rows stay in the guest cart even after login (Phase 2 — no
    // server-side FOOD cart yet). Only drain MART + SHOP rows here.
    const foodRows = g.items.filter((it) => it.module === "food");
    for (const it of g.items.filter((it) => it.module !== "food")) {
      try {
        if (it.module === "shop") {
          await api.post("/shop/cart/items", { variant_id: it.variant_id, quantity: it.quantity });
        } else {
          await api.post("/carts/me/items", { product_id: it.product_id, quantity: it.quantity, module: "mart" });
        }
      } catch (e) {
        // Server revalidates authoritatively at checkout so a single failed
        // line here doesn't break the flow, but surface a warning so support
        // can trace lost lines from the login-merge (Fixing_Prompt §11).
        console.warn("[cart.merge] guest item skipped", { item: it, error: e?.message });
      }
    }
    writeGuest({ items: foodRows });
  }, []);

  const load = useCallback(async () => {
    if (customer) {
      // First time we see a customer after being logged-out → drain any
      // pending guest cart into the server cart before hydrating so the
      // customer's basket returns intact after login (Fixing_Prompt §11).
      const cid = customer.id;
      if (prevCustomerId.current !== cid) {
        await mergeGuestIntoServer();
        prevCustomerId.current = cid;
      }
      try {
        // Unified cart — merge MART (from /carts/me) + SHOP (from /shop/cart/me)
        // into a single shape so the UI can render one list with per-item
        // `module` tags. Backend keeps them in separate tables so fulfilment
        // logic (MART darkstore vs SHOP seller shipping) stays isolated.
        const [mart, shop] = await Promise.all([
          api.get("/carts/me").then((r) => r.data).catch(() => ({ items: [], subtotal: 0, item_count: 0 })),
          api.get("/shop/cart/me").then((r) => r.data).catch(() => ({ items: [], subtotal: 0, item_count: 0 })),
        ]);
        const martItems = (mart.items || []).map((i) => ({ ...i, module: i.module || "mart" }));
        const shopItems = (shop.items || []).map((i) => ({
          id: i.id, module: "shop", quantity: i.quantity,
          line_total: i.line_total, currency: i.variant?.currency,
          variant: i.variant, product: i.product,
          // Give the row a "product-like" facade the existing UI can render.
          product_id: i.variant?.id, sku: i.variant?.sku,
          title: i.product?.title, images: i.product?.images || i.variant?.images || [],
          unit_price: i.variant?.price,
        }));
        // Phase 2 stopgap — FOOD has no server cart yet. Merge any
        // guest-cart FOOD rows into the unified view so an authed user
        // can add a burger + a MART item and see both in the drawer.
        // Phase 3 will add /api/food/cart/me and replace this.
        const g = readGuest();
        const foodItems = (g.items || []).filter((it) => it.module === "food").map((it) => {
          const s = it.snapshot || {};
          const price = Number(s.price) || 0;
          const line = price * it.quantity;
          return {
            id: it.id,
            product_id: it.product_id,
            quantity: it.quantity,
            module: "food",
            product: s,
            line_total: line,
            restaurant_id: s.restaurant_id,
          };
        });
        const foodSubtotal = foodItems.reduce((s, it) => s + (it.line_total || 0), 0);
        const foodCount = foodItems.reduce((s, it) => s + it.quantity, 0);
        setCart({
          items: [...martItems, ...shopItems, ...foodItems],
          subtotal: (mart.subtotal || 0) + (shop.subtotal || 0) + foodSubtotal,
          item_count: (mart.item_count || 0) + (shop.item_count || 0) + foodCount,
          mart: { subtotal: mart.subtotal || 0, item_count: mart.item_count || 0 },
          shop: { subtotal: shop.subtotal || 0, item_count: shop.item_count || 0 },
          food: { subtotal: foodSubtotal, item_count: foodCount },
        });
      } catch (e) { void e; }
    } else {
      prevCustomerId.current = null;
      await hydrateGuest();
    }
    setLoaded(true);
  }, [customer, hydrateGuest, mergeGuestIntoServer]);

  useEffect(() => { setLoaded(false); load(); }, [load]);

  const addItem = useCallback(async (product, quantity = 1) => {
    if (customer) {
      // Post to MART cart endpoint, then reload the UNIFIED (MART + SHOP)
      // cart so previously-added SHOP items aren't wiped from local state.
      // (Regression fix — Fixing_Prompt v3 §4.2: the previous
      // `setCart(data)` here replaced the merged state with a MART-only
      // response, silently dropping SHOP lines.)
      await api.post("/carts/me/items", { product_id: product.id, quantity, module: "mart" });
      await load();
      return;
    }
    // Guest MART row — snapshot the product info at add-time so the cart
    // page/drawer can render offline without a network round-trip per line.
    // Server revalidates prices/availability at checkout (Fixing_Prompt §25).
    const snapshot = {
      id: product.id, name: product.name, unit: product.unit,
      image: product.image, brand: product.brand,
      price: product.price, currency: product.currency,
      currency_symbol: product.currency_symbol,
      was_price: product.was_price,
      compare_at_price: product.compare_at_price,
      original_price: product.original_price,
      master_price: product.master_price,
      is_stocked_locally: product.is_stocked_locally,
    };
    const g = readGuest();
    const found = g.items.find((i) => i.product_id === product.id);
    if (found) {
      found.quantity = Math.min(99, found.quantity + quantity);
      found.snapshot = { ...(found.snapshot || {}), ...snapshot };
    } else {
      g.items.push({ id: `g_${product.id}`, product_id: product.id, quantity, module: "mart", snapshot });
    }
    writeGuest(g);
    await hydrateGuest();
  }, [customer, hydrateGuest, load]);

  const updateItem = useCallback(async (itemId, quantity) => {
    if (customer) {
      const it = cart.items.find((i) => i.id === itemId);
      // FOOD lines live in guest cart (Phase 2 stopgap) even when authed.
      if (it?.module === "food") {
        const g = readGuest();
        const row = g.items.find((i) => i.id === itemId);
        if (row) {
          if (quantity <= 0) g.items = g.items.filter((i) => i.id !== itemId);
          else row.quantity = quantity;
        }
        writeGuest(g);
        await load();
        return;
      }
      if (it?.module === "shop") {
        await api.patch(`/shop/cart/items/${itemId}`, { quantity });
      } else {
        await api.patch(`/carts/me/items/${itemId}`, { quantity });
      }
      await load();
      return;
    }
    const g = readGuest();
    const it = g.items.find((i) => i.id === itemId);
    if (it) it.quantity = quantity;
    writeGuest(g);
    await hydrateGuest();
  }, [customer, cart.items, hydrateGuest, load]);

  const removeItem = useCallback(async (itemId) => {
    if (customer) {
      const it = cart.items.find((i) => i.id === itemId);
      if (it?.module === "food") {
        const g = readGuest();
        g.items = g.items.filter((i) => i.id !== itemId);
        writeGuest(g);
        await load();
        return;
      }
      if (it?.module === "shop") {
        await api.delete(`/shop/cart/items/${itemId}`);
      } else {
        await api.delete(`/carts/me/items/${itemId}`);
      }
      await load();
      return;
    }
    const g = readGuest();
    g.items = g.items.filter((i) => i.id !== itemId);
    writeGuest(g);
    await hydrateGuest();
  }, [customer, cart.items, hydrateGuest, load]);

  // Slice 6 helper — used by SHOP product cards + PDP. Adds a variant to the
  // shared cart via /api/shop/cart/items when authed, or to the localStorage
  // guest cart when not. Callers pass a `snapshot` object so the guest cart
  // can render the line offline (Fixing_Prompt §3, §13).
  const addShopVariant = useCallback(async (variantId, quantity = 1, snapshot = null) => {
    if (customer) {
      await api.post("/shop/cart/items", { variant_id: variantId, quantity });
      await load();
      return;
    }
    // Guest path — merge into localStorage. `snapshot` is optional but
    // strongly recommended so the cart drawer/page renders a proper line.
    const g = readGuest();
    const id = `gs_${variantId}`;
    const found = g.items.find((i) => i.id === id);
    if (found) {
      found.quantity = Math.min(99, found.quantity + quantity);
      if (snapshot) found.snapshot = { ...(found.snapshot || {}), ...snapshot };
    } else {
      g.items.push({
        id, module: "shop", variant_id: variantId,
        product_id: snapshot?.product_id, quantity,
        snapshot: snapshot || {},
      });
    }
    writeGuest(g);
    await hydrateGuest();
  }, [customer, hydrateGuest, load]);

  const clear = useCallback(async () => {
    if (customer) {
      // MART clear endpoint only. SHOP items are cleared server-side when
      // /shop/checkout succeeds; if any remain they'll re-appear on reload.
      await api.delete("/carts/me").catch(() => null);
      await load();
      return;
    }
    writeGuest({ items: [] });
    setCart({ items: [], subtotal: 0, item_count: 0 });
  }, [customer, load]);

  // FOOD add-to-cart — Phase 2. FOOD lines carry variant + add-on selections
  // in the snapshot so the drawer can render them without a network round
  // trip. Server-side FOOD cart persistence is Phase 3; until then we store
  // in guest cart for BOTH guest and authed users, and `load()` merges the
  // guest FOOD rows back into the unified cart shape on every hydrate.
  //
  // Signature:
  //   addFoodItem({
  //     item,          // { id, name, description, image, base_price, currency, currency_symbol }
  //     restaurant,    // { id, name, slug }
  //     variant,       // optional { id, name, price_delta }
  //     addons,        // optional array of { id, name, price }
  //     quantity,      // integer >= 1
  //     notes,         // optional customer notes
  //   })
  const addFoodItem = useCallback(async (spec) => {
    const { item, restaurant, variant = null, addons = [], quantity = 1, notes = "" } = spec || {};
    if (!item?.id || !restaurant?.id) return;
    const unitPrice = Number(item.base_price || 0)
      + Number(variant?.price_delta || 0)
      + addons.reduce((s, a) => s + Number(a.price || 0), 0);
    const rowId = `g_food_${item.id}_${variant?.id || "_"}_${addons.map((a) => a.id).sort().join("_") || "_"}`;
    const g = readGuest();
    const found = g.items.find((i) => i.id === rowId);
    if (found) {
      found.quantity = Math.min(99, found.quantity + quantity);
    } else {
      g.items.push({
        id: rowId,
        product_id: item.id,
        quantity,
        module: "food",
        notes,
        // Snapshot carries EVERYTHING the drawer + checkout need to render
        // this line offline — name, price (already includes variant + addons),
        // image, currency, restaurant context and the selections themselves
        // so the customer can see "Cheese Burger · Large · +Cheese, +Bacon".
        snapshot: {
          id: item.id,
          name: item.name,
          brand: restaurant.name,
          restaurant_id: restaurant.id,
          restaurant_slug: restaurant.slug,
          image: item.image,
          unit: variant?.name || "",
          variant: variant ? { id: variant.id, name: variant.name } : null,
          addons: addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price || 0) })),
          price: unitPrice,
          currency: item.currency || "XOF",
          currency_symbol: item.currency_symbol || "",
        },
      });
    }
    writeGuest(g);
    await load();
  }, [load]);

  // --- Authoritative pricing quote --------------------------------------
  // Posts the current cart lines + the globally-selected delivery address
  // and service mode to the backend `/cart/quote` engine, which is the ONE
  // place that owns subtotal / delivery_fee / total math across the three
  // modules. Both Mobile and Desktop UIs render straight from the response,
  // so the two surfaces can no longer diverge the way the FOOD-mislabelled
  // ₹29 mobile total used to.
  const address = app?.activeAddress || null;
  const country = app?.country?.code || app?.countryCode || "CI";
  const foodMode = app?.foodServiceMode || "delivery";
  useEffect(() => {
    let cancelled = false;
    const items = (cart.items || []).map((i) => {
      if (i.module === "shop") {
        return { module: "shop", variant_id: i.variant?.id || i.product_id, quantity: i.quantity };
      }
      if (i.module === "food") {
        return {
          module: "food",
          restaurant_id: i.product?.restaurant_id || i.restaurant_id,
          menu_item_id:  i.product_id || i.product?.id,
          quantity: i.quantity,
        };
      }
      return { module: "mart", product_id: i.product_id || i.product?.id, quantity: i.quantity };
    }).filter((row) => row.quantity > 0 && (row.product_id || row.menu_item_id || row.variant_id));

    if (items.length === 0) { setQuote(null); return; }

    (async () => {
      try {
        const { data } = await api.post("/cart/quote", {
          items, country,
          mode: foodMode,
          delivery_address: address?.lat != null && address?.lng != null
            ? { lat: address.lat, lng: address.lng } : null,
        });
        if (!cancelled) setQuote(data);
      } catch (err) {
        // Quote failures must never block the UI — keep displaying the last
        // known values and surface the error for ops to pick up.
        console.warn("[cart.quote] failed", err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [cart.items, country, foodMode, address?.lat, address?.lng]);

  const value = useMemo(() => ({
    cart, quote, loaded, addItem, addShopVariant, addFoodItem, updateItem,
    removeItem, clear, reload: load, drawerOpen, openCart, closeCart,
  }), [cart, quote, loaded, addItem, addShopVariant, addFoodItem, updateItem, removeItem, clear, load, drawerOpen, openCart, closeCart]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
};
export const useCart = () => useContext(CartCtx);
