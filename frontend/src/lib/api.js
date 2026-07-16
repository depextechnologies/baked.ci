import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  // Rely on JWT Bearer tokens — avoids Cloudflare-edge CORS wildcard vs credentials conflict.
  withCredentials: false,
});

// Attach JWT bearer if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("baked_access_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
