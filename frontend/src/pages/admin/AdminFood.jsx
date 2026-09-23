/**
 * FOODbakēd admin workspaces — Phase 1.
 *
 * Read-only listings with toggle-featured / toggle-open actions on
 * restaurants. Categories & Cuisines are seed-driven at Phase 1 so admins
 * see the current catalogue but can't edit (Phase 2 will add CRUD).
 *
 * Routes served by these components (mounted in AdminApp.jsx):
 *   /admin/modules/food/restaurants
 *   /admin/modules/food/categories
 *   /admin/modules/food/cuisines
 */
import React, { useEffect, useState, useCallback } from "react";
import { Star, Eye, EyeOff, Award } from "lucide-react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL;

const _auth = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("baked_admin_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// -------------------------------------------------------------------------
// Restaurants
// -------------------------------------------------------------------------

export const AdminFoodRestaurants = () => {
  const [rows, setRows] = useState([]);
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await axios.get(
        `${API}/api/admin/food/restaurants${country ? `?country=${country}` : ""}`,
        { headers: _auth() }
      );
      setRows(data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { load(); }, [load]);

  const patch = async (rid, fields) => {
    try {
      await axios.patch(`${API}/api/admin/food/restaurants/${rid}`, fields, { headers: _auth() });
      await load();
    } catch (e) { setErr(e.response?.data?.detail || "Update failed"); }
  };

  return (
    <div className="space-y-4" data-testid="admin-food-restaurants">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">FOOD Restaurants</h1>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          data-testid="admin-food-country-filter"
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="">All countries</option>
          <option value="CI">Côte d'Ivoire (CI)</option>
          <option value="IN">India (IN)</option>
        </select>
      </div>
      {err && <div className="text-xs text-red-500">{err}</div>}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Restaurant</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Cuisines</th>
                <th className="px-3 py-2 text-right">Rating</th>
                <th className="px-3 py-2 text-right">ETA</th>
                <th className="px-3 py-2 text-right">Delivery</th>
                <th className="px-3 py-2 text-center">Featured</th>
                <th className="px-3 py-2 text-center">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid={`admin-food-restaurant-row-${r.id}`}>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <img src={r.image} alt="" className="w-8 h-8 rounded-lg object-cover bg-muted" />
                    <span className="font-medium">{r.name}</span>
                  </td>
                  <td className="px-3 py-2">{r.country}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(r.cuisines || []).join(", ")}</td>
                  <td className="px-3 py-2 text-right flex items-center justify-end gap-1">
                    <Star size={12} className="fill-amber-400 text-amber-400" /> {Number(r.rating).toFixed(1)}
                    <span className="text-[10px] text-muted-foreground">({r.review_count})</span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.prep_time_min}–{r.prep_time_max}m</td>
                  <td className="px-3 py-2 text-right">{r.delivery_fee || "Free"}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => patch(r.id, { featured: !r.featured })}
                      data-testid={`admin-food-toggle-featured-${r.id}`}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10px] font-semibold motion-fast ${
                        r.featured ? "bg-amber-500/20 text-amber-500" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Award size={11} /> {r.featured ? "Featured" : "Off"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => patch(r.id, { is_open: !r.is_open })}
                      data-testid={`admin-food-toggle-open-${r.id}`}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10px] font-semibold motion-fast ${
                        r.is_open ? "bg-green-500/20 text-green-500" : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.is_open ? <><Eye size={11} /> Open</> : <><EyeOff size={11} /> Closed</>}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No restaurants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------------------
// Categories & Cuisines — read-only Phase 1
// -------------------------------------------------------------------------

const ReadOnlyGrid = ({ title, endpoint, testId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}${endpoint}`, { headers: _auth() });
        setRows(data);
      } finally { setLoading(false); }
    })();
  }, [endpoint]);
  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <span className="text-[11px] text-muted-foreground">Phase 1 · read-only</span>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((c) => (
            <div key={c.code} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <img src={c.image} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{c.name_en}</div>
                <div className="text-[11px] text-muted-foreground truncate">FR: {c.name_fr}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.is_active ? "bg-green-500/20 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                {c.is_active ? "Active" : "Off"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminFoodCategories = () => (
  <ReadOnlyGrid title="FOOD Categories" endpoint="/api/admin/food/categories" testId="admin-food-categories" />
);

export const AdminFoodCuisines = () => (
  <ReadOnlyGrid title="FOOD Cuisines" endpoint="/api/admin/food/cuisines" testId="admin-food-cuisines" />
);
