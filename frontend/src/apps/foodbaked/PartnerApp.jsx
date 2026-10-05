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
import React, { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut, Utensils, LayoutDashboard, Store, Loader2, AlertTriangle, BarChart3, CalendarClock, Settings, Image as ImgIcon, LayoutGrid, ListChecks, Package, Bell, TrendingUp, Clock } from "lucide-react";
import { FoodPartnerProvider, useFoodPartner, partnerApi } from "../../contexts/FoodPartnerContext";
import MenuManager, { DashboardSoldOutPanel } from "../../components/food/MenuManager";
import RestaurantAnalytics from "../../components/food/RestaurantAnalytics";
import FoodImageUploader from "../../apps/foodbaked/components/FoodImageUploader";
import { FoodPartnerActivateRoute } from "./SellersApp";
import RestaurantNotificationProvider, { useRestaurantNotifications } from "./components/RestaurantNotificationEngine";
import PartnerPauseCard from "./components/PartnerPauseCard";
import PartnerNotificationCenter, { useNotificationHistory } from "./components/PartnerNotificationCenter";
import PartnerReservationsPage from "./pages/PartnerReservationsPage";
import PartnerReservationSettingsPage from "./pages/PartnerReservationSettingsPage";
import PartnerReservationsDashboard from "./pages/PartnerReservationsDashboard";
import PartnerFloorTablesPage from "./pages/PartnerFloorTablesPage";
import PartnerOrdersPage from "./pages/PartnerOrdersPage";
import PartnerRestaurantProfilePage from "./pages/PartnerRestaurantProfilePage";

const GREEN = "#00A651";
const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const resolveImg = (u) => (!u ? "" : u.startsWith("http") || u.startsWith("data:") ? u : `${API_BASE}${u}`);
const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

// ---------------------------------------------------------------------------
// Auth screens
// ---------------------------------------------------------------------------

const PartnerLoginPage = () => {
  const { login, partner, checking } = useFoodPartner();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isFr = detectFr();

  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="animate-spin mr-2" size={16} /> {isFr ? "Chargement…" : "Loading…"}</div>;
  if (partner) return <Navigate to="/partner/food" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await login(form);
      nav("/partner/food", { replace: true });
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30" data-testid="partner-login-page">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{isFr ? "Portail Restaurant" : "Restaurant Portal"}</div>
          <h1 className="text-2xl font-bold">FOOD<span style={{ color: GREEN }}>bakēd</span></h1>
          <p className="text-xs text-muted-foreground">{isFr ? "Connexion partenaire" : "Partner sign-in"}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</div>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                   className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="partner-login-email" />
          </label>
          <label className="block space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{isFr ? "Mot de passe" : "Password"}</div>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                   className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm" data-testid="partner-login-password" />
          </label>
          {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}
          <button type="submit" disabled={busy} data-testid="partner-login-submit"
                  className="w-full h-10 rounded-lg text-primary-foreground font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}>
            {busy && <Loader2 size={14} className="animate-spin" />} <LogIn size={14} /> {isFr ? "Se connecter" : "Sign in"}
          </button>
          <div className="text-[10px] text-center text-muted-foreground">
            {isFr ? "Pas de compte ? Demandez à l'équipe FOODbakēd." : "No account? Contact the FOODbakēd team."}
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
  const { partner, restaurant, logout, checking, token } = useFoodPartner();
  const isFr = detectFr();
  const [notifOpen, setNotifOpen] = useState(false);
  if (checking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="animate-spin mr-2" size={16} /> {isFr ? "Chargement…" : "Loading…"}</div>;
  if (!partner) return <Navigate to="/partner/food/login" replace />;

  const nav = [
    { to: "/partner/food",              key: "dashboard",     label: isFr ? "Tableau de bord" : "Dashboard",     icon: LayoutDashboard, end: true },
    { to: "/partner/food/orders",       key: "orders",        label: isFr ? "Commandes" : "Orders",              icon: Package },
    { to: "/partner/food/reservations", key: "reservations",  label: isFr ? "Réservations" : "Reservations",     icon: CalendarClock },
    { to: "/partner/food/profile",      key: "profile",       label: isFr ? "Profil" : "Profile",                icon: ImgIcon },
    { to: "/partner/food/analytics",    key: "analytics",     label: "Analytics",                                 icon: BarChart3 },
    { to: "/partner/food/menu",         key: "menu",          label: "Menu",                                      icon: Utensils },
    { to: "/partner/food/settings",     key: "settings",      label: isFr ? "Paramètres" : "Settings",            icon: Settings },
  ];

  return (
    <RestaurantNotificationProvider restaurantId={restaurant?.id} token={token}>
      <div className="min-h-screen bg-secondary/30 flex" data-testid="partner-shell">
        <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{isFr ? "Portail Restaurant" : "Restaurant Portal"}</div>
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
            {nav.map(({ to, key, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                       className={({ isActive }) => `flex items-center gap-2 h-9 px-3 rounded-lg text-sm ${isActive ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                       data-testid={`partner-nav-${key}`}>
                <Icon size={14} /> <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <button onClick={logout} data-testid="partner-logout" className="m-3 h-9 px-3 rounded-lg bg-secondary hover:bg-red-500/10 hover:text-red-500 text-sm inline-flex items-center gap-2">
            <LogOut size={14} /> {isFr ? "Se déconnecter" : "Sign out"}
          </button>
        </aside>
        <main className="flex-1 min-w-0">
          <div className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border px-6 h-14 flex items-center justify-end gap-3">
            <NotificationBell restaurantId={restaurant?.id} onOpen={() => setNotifOpen(true)} />
          </div>
          <div className="p-6"><Outlet /></div>
        </main>
        <PartnerNotificationCenter restaurantId={restaurant?.id}
                                     open={notifOpen}
                                     onClose={() => setNotifOpen(false)} />
      </div>
    </RestaurantNotificationProvider>
  );
};

// Thin bell button that reads the unread count from the same localStorage
// history the drawer uses. Keeps the badge in sync without extra plumbing.
const NotificationBell = ({ restaurantId, onOpen }) => {
  const { unread } = useNotificationHistory(restaurantId);
  return (
    <button onClick={onOpen}
            className="relative h-9 w-9 rounded-lg border border-border inline-flex items-center justify-center hover:bg-secondary"
            data-testid="partner-notif-bell"
            aria-label="Notifications">
      <Bell size={16} />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
              style={{ background: "#EF4444" }}
              data-testid="partner-notif-bell-badge">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Dashboard — read-only summary + limited self-service edits
// ---------------------------------------------------------------------------

const PartnerDashboard = () => {
  const { restaurant, refresh } = useFoodPartner();
  const { updatesVersion } = useRestaurantNotifications();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [stats, setStats] = useState(null);
  const isFr = detectFr();

  // Refresh dashboard KPIs on mount AND whenever the WS fires a change
  // (new order, status update, etc.). No polling needed.
  useEffect(() => {
    if (!restaurant?.id) return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await partnerApi.get(`/food/manage/${restaurant.id}/dashboard-stats`);
        if (!cancel) setStats(data);
      } catch (_) { /* non-fatal */ }
    })();
    return () => { cancel = true; };
  }, [restaurant?.id, updatesVersion]);

  if (!restaurant) return null;

  const patch = async (fields) => {
    setSaving(true); setErr("");
    try { await partnerApi.patch("/food/partner/restaurant", fields); await refresh(); }
    catch (e) { setErr(e.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error")); }
    finally { setSaving(false); }
  };

  const fmtMoney = (v, cur) => {
    const n = Math.round(Number(v || 0));
    return `${n.toLocaleString(isFr ? "fr-FR" : "en-US")} ${cur || "XOF"}`;
  };

  return (
    <div className="space-y-6" data-testid="partner-dashboard">
      <div>
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        <p className="text-sm text-muted-foreground">{restaurant.country} · {(restaurant.cuisines || []).join(", ") || "—"}</p>
      </div>

      {/* ---- Phase 4 live KPI strip ---- */}
      <div className="grid gap-3 md:grid-cols-4" data-testid="partner-kpi-strip">
        <KpiTile icon={Package}    label={isFr ? "Commandes aujourd'hui" : "Orders today"}
                 value={stats?.orders_today ?? "—"} testId="partner-kpi-orders" />
        <KpiTile icon={Clock}      label={isFr ? "En attente d'action" : "Needs action"}
                 value={stats?.pending_orders ?? "—"}
                 intent={(stats?.pending_orders || 0) > 0 ? "warn" : "ok"}
                 testId="partner-kpi-pending" />
        <KpiTile icon={TrendingUp} label={isFr ? "Chiffre d'affaires" : "Revenue today"}
                 value={stats ? fmtMoney(stats.revenue_today, stats.currency) : "—"}
                 testId="partner-kpi-revenue" />
        <KpiTile icon={BarChart3}  label={isFr ? "Temps de prépa moyen" : "Avg prep time"}
                 value={stats ? `${stats.avg_prep_minutes} min` : "—"}
                 testId="partner-kpi-prep" />
      </div>

      {/* Restaurant status + rating + prep window (compact, below KPI strip) */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label={isFr ? "Statut" : "Status"} value={restaurant.is_open ? (isFr ? "Ouvert" : "Open") : (isFr ? "Fermé" : "Closed")} intent={restaurant.is_open ? "ok" : "off"} />
        <StatTile label={isFr ? "Note" : "Rating"} value={`${Number(restaurant.rating).toFixed(1)} ★ (${restaurant.review_count})`} />
        <StatTile label={isFr ? "Fenêtre de prépa" : "Prep window"} value={`${restaurant.prep_time_min}–${restaurant.prep_time_max} min`} />
      </div>

      {err && <div className="text-xs text-red-500">{err}</div>}

      {/* ---- Phase 4 delivery/pickup pause card ---- */}
      <PartnerPauseCard restaurantId={restaurant.id} />

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="partner-restaurant-controls">
        <div className="text-sm font-semibold flex items-center gap-2"><Store size={16} /> {isFr ? "Auto-service" : "Self-service"}</div>
        <p className="text-xs text-muted-foreground">{isFr
          ? "Vous pouvez basculer votre statut d'ouverture, ajuster le temps de préparation et changer votre image. Le reste est géré par l'équipe FOODbakēd."
          : "Toggle open/closed, tweak prep time, change cover photo — anything else needs the FOODbakēd team."}</p>
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={() => patch({ is_open: !restaurant.is_open })} disabled={saving} data-testid="partner-toggle-open"
                  className={`h-9 px-4 rounded-lg text-sm font-semibold ${restaurant.is_open ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
            {restaurant.is_open ? (isFr ? "Fermer" : "Close now") : (isFr ? "Ouvrir" : "Open now")}
          </button>
          <label className="text-xs inline-flex items-center gap-2">
            <span className="text-muted-foreground">{isFr ? "Prépa min" : "Prep min"}</span>
            <input type="number" min={1} defaultValue={restaurant.prep_time_min} onBlur={(e) => { const v = parseInt(e.target.value || 0, 10); if (v !== restaurant.prep_time_min) patch({ prep_time_min: v }); }}
                   className="h-8 w-16 rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="partner-prep-min" />
          </label>
          <label className="text-xs inline-flex items-center gap-2">
            <span className="text-muted-foreground">{isFr ? "Prépa max" : "Prep max"}</span>
            <input type="number" min={1} defaultValue={restaurant.prep_time_max} onBlur={(e) => { const v = parseInt(e.target.value || 0, 10); if (v !== restaurant.prep_time_max) patch({ prep_time_max: v }); }}
                   className="h-8 w-16 rounded-lg border border-border bg-secondary/40 px-2 text-xs" data-testid="partner-prep-max" />
          </label>
        </div>
        <div className="max-w-xs">
          <FoodImageUploader
            value={restaurant.image}
            onChange={(v) => patch({ image: v })}
            kind="restaurant_cover"
            label={isFr ? "Photo de couverture" : "Cover photo"}
            testId="partner-restaurant-image"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{isFr ? "Gestion du menu" : "Menu management"}</div>
            <div className="text-xs text-muted-foreground">{isFr
              ? "Ajoutez sections, plats, variantes et extras."
              : "Add sections, items, variants and add-ons."}</div>
          </div>
          <Link to="/partner/food/menu" data-testid="partner-open-menu" className="h-9 px-4 rounded-lg text-primary-foreground font-semibold text-sm inline-flex items-center gap-2" style={{ backgroundColor: GREEN }}>
            <Utensils size={14} /> {isFr ? "Gérer le menu" : "Open menu"}
          </Link>
        </div>
      </div>

      {/* Pass 3 — one-tap sold-out triage, visible on the dashboard home so
          the partner never needs to open the full menu page during a rush. */}
      <DashboardSoldOutPanel restaurantId={restaurant.id} api={partnerApi} />
    </div>
  );
};

const KpiTile = ({ icon: Icon, label, value, intent = "info", testId }) => {
  const toneBg = intent === "warn" ? "rgba(245,158,11,.08)" : "rgba(0,166,81,.06)";
  const toneFg = intent === "warn" ? "#F59E0B" : GREEN;
  return (
    <div className="rounded-2xl border border-border p-4 flex items-start gap-3 bg-card" data-testid={testId}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: toneBg, color: toneFg }}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold mt-0.5 truncate">{value}</div>
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

const RESERVATION_SUBTABS = [
  { to: "",          label_fr: "Aperçu",          label_en: "Dashboard",  test: "sub-dashboard", end: true },
  { to: "bookings",  label_fr: "Demandes",        label_en: "Bookings",   test: "sub-bookings" },
  { to: "floor",     label_fr: "Espaces & tables",label_en: "Floor & Tables", test: "sub-floor" },
  { to: "settings",  label_fr: "Paramètres",      label_en: "Settings",   test: "sub-settings" },
];

const ReservationsHubLayout = () => {
  const isFr = ((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr");
  return (
    <div className="space-y-4" data-testid="partner-reservations-hub">
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-secondary/60 p-1" translate="no">
        {RESERVATION_SUBTABS.map((s) => (
          <NavLink key={s.to || "index"} to={s.to} end={s.end}
                   className={({ isActive }) => `px-4 h-9 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${isActive ? "text-black" : "text-muted-foreground hover:text-foreground"}`}
                   style={({ isActive }) => isActive ? { backgroundColor: GREEN } : undefined}
                   data-testid={`partner-reservations-${s.test}`}>
            {isFr ? s.label_fr : s.label_en}
          </NavLink>
        ))}
      </div>
      <Outlet />
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
        <Route path="orders" element={<PartnerOrdersPage />} />
        <Route path="analytics" element={<PartnerAnalyticsPage />} />
        <Route path="reservations" element={<ReservationsHubLayout />}>
          <Route index element={<PartnerReservationsDashboard />} />
          <Route path="bookings" element={<PartnerReservationsPage />} />
          <Route path="floor" element={<PartnerFloorTablesPage />} />
          <Route path="settings" element={<PartnerReservationSettingsPage />} />
        </Route>
        <Route path="profile" element={<PartnerRestaurantProfilePage />} />
        <Route path="settings" element={<PartnerReservationSettingsPage />} />
      </Route>
    </Routes>
  </FoodPartnerProvider>
);

export default FoodPartnerApp;
