/**
 * FoodPartnerContext — auth context for restaurant partners.
 *
 * Mirrors AdminContext.jsx but points at /api/food/partner/auth/*, stores
 * the token in localStorage under `food_partner_token`, and exposes:
 *   • partner : { id, email, restaurant_id, name, is_active, ... }
 *   • restaurant : the partner's restaurant summary
 *   • login({email,password}), logout()
 *   • partnerApi : an axios client with the Bearer token pre-applied
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";

const STORAGE_KEY = "food_partner_token";
const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

export const partnerApi = axios.create({ baseURL: API_BASE });
partnerApi.interceptors.request.use((config) => {
  const t = localStorage.getItem(STORAGE_KEY);
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

const FoodPartnerContext = createContext(null);

export const FoodPartnerProvider = ({ children }) => {
  const [partner, setPartner] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [checking, setChecking] = useState(true);
  const [token, setTokenState] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null));

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem(STORAGE_KEY);
    setTokenState(t);
    if (!t) { setChecking(false); return; }
    try {
      const { data } = await partnerApi.get("/food/partner/auth/me");
      setPartner(data.partner);
      setRestaurant(data.restaurant);
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      setPartner(null); setRestaurant(null); setTokenState(null);
    } finally { setChecking(false); }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const login = useCallback(async ({ email, password }) => {
    const { data } = await partnerApi.post("/food/partner/auth/login", { email, password });
    localStorage.setItem(STORAGE_KEY, data.access_token);
    setTokenState(data.access_token);
    await loadMe();
    return data.partner;
  }, [loadMe]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPartner(null); setRestaurant(null); setTokenState(null);
  }, []);

  const value = useMemo(() => ({ partner, restaurant, checking, login, logout, refresh: loadMe, token }),
                        [partner, restaurant, checking, login, logout, loadMe, token]);
  return <FoodPartnerContext.Provider value={value}>{children}</FoodPartnerContext.Provider>;
};

export const useFoodPartner = () => {
  const ctx = useContext(FoodPartnerContext);
  if (!ctx) throw new Error("useFoodPartner must be inside FoodPartnerProvider");
  return ctx;
};
