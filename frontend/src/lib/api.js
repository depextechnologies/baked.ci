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

// Normalize FastAPI Pydantic validation errors so call-sites can safely do
// `toast.error(err.response.data.detail || "Fallback")` without React crashing
// on the raw `[{type, loc, msg, input, url}, …]` object structure.
export const normalizeApiError = (detail) => {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Pydantic V2 array-of-error-objects — join their `msg` fields.
    const msgs = detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object") {
          const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
          return loc ? `${loc}: ${d.msg}` : d.msg;
        }
        return null;
      })
      .filter(Boolean);
    return msgs.length ? msgs.join(" · ") : "Request failed";
  }
  // A non-array object detail is legal (e.g. a structured error). Do not
  // stringify it — leave it as-is so UI code that inspects .field still works.
  return detail;
};

/**
 * Attach a response interceptor that flattens Pydantic array errors into a
 * string so `toast.error(...)` and JSX children never receive a raw error
 * object. Non-array `detail` values pass through untouched. Idempotent per
 * instance; call once at module top-level.
 */
export const attachDetailNormalizer = (axiosInstance) => {
  axiosInstance.interceptors.response.use(
    (r) => r,
    (err) => {
      const d = err?.response?.data;
      if (d && Array.isArray(d.detail)) {
        d.raw_detail = d.detail;
        d.detail = normalizeApiError(d.detail);
      }
      return Promise.reject(err);
    },
  );
};

attachDetailNormalizer(api);
