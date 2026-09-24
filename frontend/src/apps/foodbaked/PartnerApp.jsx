/**
 * Restaurant Partner Portal — login + shell + dashboard + menu.
 *
 * Route surface (mounted at /partner/food/*):
 *   /partner/food/login   — email + password
 *   /partner/food         — dashboard (restaurant summary + open/closed toggle + prep time)
 *   /partner/food/menu    — MenuManager scoped to the partner's own restaurant
 *
 * All screens FR-first · EN-second. Partner JWT is stored client-side and
 * automatically attached by `partnerApi`.
 */
import React, { useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { LogIn, LogOut, Utensils, LayoutDashboard, Store, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { FoodPartnerProvider, useFoodPartner, partnerApi } from "../../contexts/FoodPartnerContext";
import MenuManager from "../../components/food/MenuManager";
import RestaurantAnalytics from "../../components/food/RestaurantAnalytics";
import FoodImageUploader from "../../apps/foodbaked/components/FoodImageUploader";
import { FoodPartnerActivateRoute } from "./SellersApp";

const GREEN = "#00A651";
const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const resolveImg = (u) => (!u ? "" : u.startsWith("http") || u.startsWith("data:") ? u : `${API_BASE}${u}`);

// ---------------------------------------------------------------------------
// Auth screens
// ---------------------------------------------------------------------------

const PartnerLoginPage = () => {
  const { login, partner, checking } = useFoodPartner();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="animate-spin mr-2" size={16} /> Chargement…</div>;
  if (partner) return <Navigate to="/partner/food" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(form);
      nav("/partner/food", { replace: true });
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30" data-testid="partner-login-page">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Portail Restaurant · Restaurant Portal</div>
          <h1 className="text-2xl font-bold">FOOD<span style={{ color: GREEN }}>bakēd</span></h1>
          <p className="text-xs text-muted-foreground">Connexion partenaire · Partner sign-in</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</div>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                   className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="partner-login-email" />
          </label>
          <label className="block space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mot de passe · Password</div>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                   className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="partner-login-password" />
          </label>
          {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}
          <button type="submit" disabled={busy} data-testid="partner-login-submit"
                  className="w-full h-10 rounded-lg text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}>
            {busy && <Loader2 size={14} className="animate-spin" />} <LogIn size={14} /> Se connecter · Sign in
          </button>
          <div className="text-[10px] text-center text-muted-foreground">
            Pas de compte ? Demandez à l'équipe FOODbakēd. · No account? Contact the FOODbakēd team.
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Portal shell (once authenticated)
// ---------------------------------------------------------------------------

const PartnerLayout = () => {
  const { partner, restaurant, logout, checking } = useFoodPartner();
  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="animate-spin mr-2" size={16} /> Chargement…</div>;
  if (!partner) return <Navigate to="/partner/food/login" replace />;

  const nav = [
    { to: "/partner/food",           label: "Tableau de bord · Dashboard", icon: LayoutDashboard, end: true },
    { to: "/partner/food/analytics", label: "Analytics",                    icon: BarChart3 },
    { to: "/partner/food/menu",      label: "Menu",                         icon: Utensils },
  ];

  return (
    <div className="min-h-screen bg-secondary/30 flex" data-testid="partner-shell">
      <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Restaurant Portal</div>
          <div className="text-lg font-bold">FOOD<span style={{ color: GREEN }}>bakēd</span></div>
          <div className="mt-2 rounded-lg bg-secondary/60 p-2 flex items-center gap-2">
            <img src={resolveImg(restaurant?.image)} alt="" className="w-8 h-8 rounded-md object-cover bg-muted" />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{restaurant?.name || "—"}</div>
              <div className="text-[10px] text-muted-foreground truncate">{partner.email}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) => `flex items-center gap-2 h-9 px-3 rounded-lg text-sm ${isActive ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                     data-testid={`partner-nav-${to.split("/").pop() || "dashboard"}`}>
              <Icon size={14} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} data-testid="partner-logout" className="m-3 h-9 px-3 rounded-lg bg-secondary hover:bg-red-500/10 hover:text-red-500 text-sm inline-flex items-center gap-2">
          <LogOut size={14} /> Se déconnecter · Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0 p-6"><Outlet /></main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard — read-only summary + limited self-service edits
// ---------------------------------------------------------------------------

const PartnerDashboard = () => {
  const { restaurant, refresh } = useFoodPartner();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  if (!restaurant) return null;

  const patch = async (fields) => {
    setSaving(true); setErr("");
    try { await partnerApi.patch("/food/partner/restaurant", fields); await refresh(); }
    catch (e) { setErr(e.response?.data?.detail || e.message || "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6" data-testid="partner-dashboard">
      <div>
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        <p className="text-sm text-muted-foreground">{restaurant.country} · {(restaurant.cuisines || []).join(", ") || "—"}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label="Statut · Status" value={restaurant.is_open ? "Ouvert · Open" : "Fermé · Closed"} intent={restaurant.is_open ? "ok" : "off"} />
        <StatTile label="Note · Rating" value={`${Number(restaurant.rating).toFixed(1)} ★ (${restaurant.review_count})`} />
        <StatTile label="Prépa · Prep time" value={`${restaurant.prep_time_min}–${restaurant.prep_time_max} min`} />
      </div>

      {err && <div className="text-xs text-red-500">{err}</div>}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="partner-restaurant-controls">
        <div className="text-sm font-semibold flex items-center gap-2"><Store size={16} /> Auto-service · Self-service</div>
        <p className="text-xs text-muted-foreground">Vous pouvez basculer votre statut d'ouverture, ajuster le temps de préparation et changer votre image. Le reste est géré par l'équipe FOODbakēd. · Toggle open/closed, tweak prep time, change cover photo — anything else needs the FOODbakēd team.</p>
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={() => patch({ is_open: !restaurant.is_open })} disabled={saving} data-testid="partner-toggle-open"
                  className={`h-9 px-4 rounded-lg text-sm font-semibold ${restaurant.is_open ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
            {restaurant.is_open ? "Fermer · Close now" : "Ouvrir · Open now"}
          </button>
          <label className="text-xs inline-flex items-center gap-2">
            <span className="text-muted-foreground">Prépa min</span>
            <input type="number" min={1} defaultValue={restaurant.prep_time_min} onBlur={(e) => { const v = parseInt(e.target.value || 0, 10); if (v !== restaurant.prep_time_min) patch({ prep_time_min: v }); }}
                   className="h-8 w-16 rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="partner-prep-min" />
          </label>
          <label className="text-xs inline-flex items-center gap-2">
            <span className="text-muted-foreground">Prépa max</span>
            <input type="number" min={1} defaultValue={restaurant.prep_time_max} onBlur={(e) => { const v = parseInt(e.target.value || 0, 10); if (v !== restaurant.prep_time_max) patch({ prep_time_max: v }); }}
                   className="h-8 w-16 rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="partner-prep-max" />
          </label>
        </div>
        <div className="max-w-xs">
          <FoodImageUploader
            value={restaurant.image}
            onChange={(v) => patch({ image: v })}
            kind="restaurant_cover"
            label="Photo de couverture · Cover photo"
            testId="partner-restaurant-image"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Menu · Menu management</div>
            <div className="text-xs text-muted-foreground">Ajoutez sections, plats, variantes et extras. · Add sections, items, variants and add-ons.</div>
          </div>
          <Link to="/partner/food/menu" data-testid="partner-open-menu" className="h-9 px-4 rounded-lg text-primary-foreground font-semibold text-sm inline-flex items-center gap-2" style={{ backgroundColor: GREEN }}>
            <Utensils size={14} /> Gérer le menu · Open menu
          </Link>
        </div>
      </div>
    </div>
  );
};

const StatTile = ({ label, value, intent }) => (
  <div className={`rounded-2xl border border-border p-4 ${intent === "ok" ? "bg-green-500/5" : intent === "off" ? "bg-red-500/5" : "bg-card"}`}>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-lg font-bold mt-1">{value}</div>
  </div>
);

const PartnerMenuPage = () => {
  const { restaurant } = useFoodPartner();
  if (!restaurant) return null;
  return (
    <div className="space-y-3" data-testid="partner-menu-page">
      <MenuManager restaurantId={restaurant.id} api={partnerApi} testId="partner-menu-manager" />
    </div>
  );
};

const PartnerAnalyticsPage = () => {
  const { restaurant } = useFoodPartner();
  if (!restaurant) return null;
  return (
    <div className="space-y-3" data-testid="partner-analytics-page">
      <RestaurantAnalytics restaurantId={restaurant.id} api={partnerApi} testId="partner-restaurant-analytics" />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Router — mounted from App.jsx
// ---------------------------------------------------------------------------

export const FoodPartnerApp = () => (
  <FoodPartnerProvider>
    <Routes>
      <Route path="login" element={<PartnerLoginPage />} />
      <Route path="activate" element={<FoodPartnerActivateRoute />} />
      <Route path="" element={<PartnerLayout />}>
        <Route index element={<PartnerDashboard />} />
        <Route path="menu" element={<PartnerMenuPage />} />
        <Route path="analytics" element={<PartnerAnalyticsPage />} />
      </Route>
    </Routes>
  </FoodPartnerProvider>
);

export default FoodPartnerApp;
