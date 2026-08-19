import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "../lib/api";

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

// Auto-detect UI language from the browser (equivalent to Accept-Language on the client).
// Called only on the very first visit — persisted afterwards.
const detectInitialLanguage = () => {
  const saved = localStorage.getItem("baked_language");
  if (saved === "fr" || saved === "en") return saved;
  const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""])
    .map((l) => (l || "").toLowerCase());
  for (const lang of candidates) {
    if (lang.startsWith("fr")) return "fr";
    if (lang.startsWith("en")) return "en";
  }
  return "fr"; // fallback for Côte d'Ivoire launch market
};

export const AppProvider = ({ children }) => {
  const [activeModule, setActiveModule] = useState("mart");
  const [countryCode, setCountryCode] = useState(localStorage.getItem("baked_country") || DEFAULT_COUNTRY);
  const [countries, setCountries] = useState([]);
  const [modules, setModules] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem("baked_theme") || "dark");
  const [language, setLanguageState] = useState(detectInitialLanguage);
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
  const [addressSelectorMode, setAddressSelectorMode] = useState({ callback: null, title: null });
  const openAddressSelector = useCallback((opts) => {
    // opts.onPick(address) — when provided, invoked with the picked address INSTEAD of updating global activeAddress.
    // opts.title — override modal title (e.g. "Pickup location")
    setAddressSelectorMode({ callback: opts?.onPick || null, title: opts?.title || null });
    setAddressSelectorOpen(true);
  }, []);
  const closeAddressSelector = useCallback(() => {
    setAddressSelectorOpen(false);
    setAddressSelectorMode({ callback: null, title: null });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("baked_theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("baked_country", countryCode); }, [countryCode]);
  useEffect(() => { localStorage.setItem("baked_language", language); document.documentElement.lang = language; }, [language]);

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

  const value = useMemo(() => ({ activeModule, setActiveModule, countryCode, setCountryCode, detectCountryByLocation, country, countries, modules, theme, toggleTheme, language, setLanguage, uiLocale, activeAddress, setActiveAddress, addressSelectorOpen, openAddressSelector, closeAddressSelector, addressSelectorMode }), [activeModule, countryCode, detectCountryByLocation, country, countries, modules, theme, language, uiLocale, activeAddress, setActiveAddress, addressSelectorOpen, openAddressSelector, closeAddressSelector, addressSelectorMode]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};
export const useApp = () => useContext(AppCtx);


// ------- CartProvider -------
// Guest cart lives in localStorage. On login → hydrated from server. Modifications post to server if authed.
const GUEST_KEY = "baked_guest_cart";

const readGuest = () => { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || { items: [] }; } catch { return { items: [] }; } };
const writeGuest = (c) => localStorage.setItem(GUEST_KEY, JSON.stringify(c));

export const CartProvider = ({ children }) => {
  const { customer } = useAuth() || {};
  const [cart, setCart] = useState({ items: [], subtotal: 0, item_count: 0 });
  const [loaded, setLoaded] = useState(false);

  const hydrateGuest = useCallback(async () => {
    const g = readGuest();
    if (!g.items?.length) { setCart({ items: [], subtotal: 0, item_count: 0 }); return; }
    // Fetch product info for each id
    const items = [];
    let subtotal = 0;
    for (const it of g.items) {
      try {
        const { data: p } = await api.get(`/mart/products/${it.product_id}`);
        const line = p.price * it.quantity;
        subtotal += line;
        items.push({ ...it, product: p, line_total: line });
      } catch (e) { void e; }
    }
    setCart({ items, subtotal, item_count: items.reduce((s, i) => s + i.quantity, 0) });
  }, []);

  const load = useCallback(async () => {
    if (customer) {
      try {
        const { data } = await api.get("/carts/me");
        setCart(data);
      } catch (e) { void e; }
    } else {
      await hydrateGuest();
    }
    setLoaded(true);
  }, [customer, hydrateGuest]);

  useEffect(() => { setLoaded(false); load(); }, [load]);

  const addItem = useCallback(async (product, quantity = 1) => {
    if (customer) {
      const { data } = await api.post("/carts/me/items", { product_id: product.id, quantity, module: "mart" });
      setCart(data);
      return data;
    }
    const g = readGuest();
    const found = g.items.find((i) => i.product_id === product.id);
    if (found) found.quantity = Math.min(99, found.quantity + quantity);
    else g.items.push({ id: `g_${product.id}`, product_id: product.id, quantity, module: "mart" });
    writeGuest(g);
    await hydrateGuest();
  }, [customer, hydrateGuest]);

  const updateItem = useCallback(async (itemId, quantity) => {
    if (customer) {
      const { data } = await api.patch(`/carts/me/items/${itemId}`, { quantity });
      setCart(data);
      return data;
    }
    const g = readGuest();
    const it = g.items.find((i) => i.id === itemId);
    if (it) it.quantity = quantity;
    writeGuest(g);
    await hydrateGuest();
  }, [customer, hydrateGuest]);

  const removeItem = useCallback(async (itemId) => {
    if (customer) {
      const { data } = await api.delete(`/carts/me/items/${itemId}`);
      setCart(data);
      return data;
    }
    const g = readGuest();
    g.items = g.items.filter((i) => i.id !== itemId);
    writeGuest(g);
    await hydrateGuest();
  }, [customer, hydrateGuest]);

  const clear = useCallback(async () => {
    if (customer) {
      const { data } = await api.delete("/carts/me");
      setCart(data);
      return data;
    }
    writeGuest({ items: [] });
    setCart({ items: [], subtotal: 0, item_count: 0 });
  }, [customer]);

  const value = useMemo(() => ({ cart, loaded, addItem, updateItem, removeItem, clear, reload: load }), [cart, loaded, addItem, updateItem, removeItem, clear, load]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
};
export const useCart = () => useContext(CartCtx);
