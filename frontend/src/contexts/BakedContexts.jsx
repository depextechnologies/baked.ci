import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("baked_theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("baked_country", countryCode); }, [countryCode]);
  useEffect(() => { localStorage.setItem("baked_language", language); document.documentElement.lang = language; }, [language]);

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

  const value = useMemo(() => ({ activeModule, setActiveModule, countryCode, setCountryCode, country, countries, modules, theme, toggleTheme, language, setLanguage, uiLocale }), [activeModule, countryCode, country, countries, modules, theme, language, uiLocale]);
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
