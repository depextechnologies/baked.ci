import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Dedicated axios for admin — separate token key from customer app
export const adminApi = axios.create({ baseURL: API_BASE });
adminApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("baked_admin_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const Ctx = createContext(null);

export const AdminProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem("baked_admin_token");
    if (!t) { setAdmin(null); setLoading(false); return; }
    try {
      const { data } = await adminApi.get("/admin/auth/me");
      setAdmin(data);
    } catch { setAdmin(null); localStorage.removeItem("baked_admin_token"); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { data } = await adminApi.post("/admin/auth/login", { email, password });
    localStorage.setItem("baked_admin_token", data.access_token);
    setAdmin(data.admin);
    return data.admin;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("baked_admin_token");
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ admin, loading, login, logout, refresh }), [admin, loading, login, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAdmin = () => useContext(Ctx);
