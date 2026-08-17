/**
 * MARTbakēd Partner Portal — Stage 3 (login + first-login reset + dashboard shell).
 *
 * Route: /partner-portal/*
 *   /login          → Sign-in with email + temp password
 *   /reset-password → Forced when partner.must_reset_password (first login)
 *   /               → Dashboard shell (KPI cards + onboarding checklist)
 *   /profile        → Business + Warehouse read-only view
 *
 * Auth token lives in localStorage.baked_partner_token (separate key from
 * customer/admin so all three flows coexist).
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { BrowserRouter as _br, Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, LogOut, LayoutDashboard, Building2, Warehouse as WarehouseIcon,
  Package, ShoppingBag, Wallet, ChevronRight, CheckCircle2, Circle, KeyRound,
  MapPin, Mail, Phone, Store, Users, Boxes, PackagePlus, ClipboardCheck, Sparkles,
  Receipt,
} from "lucide-react";
import { BakedLogo } from "@/components/layout/BakedLogo";
import "@/apps/partner-hub/partner-hub.css";

/* -------------------------------------------------------------------------- */
/*                              Auth context                                  */
/* -------------------------------------------------------------------------- */

const API_BASE = process.env.REACT_APP_BACKEND_URL + "/api";
const TOKEN_KEY = "baked_partner_token";

export const partnerApi = axios.create({ baseURL: API_BASE });
partnerApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const Ctx = createContext(null);
export const usePartner = () => useContext(Ctx);

const PartnerProvider = ({ children }) => {
  const [state, setState] = useState({ partner: null, warehouse: null, staff: null, role: null, loading: true });

  const load = async () => {
    if (!localStorage.getItem(TOKEN_KEY)) { setState({ partner: null, warehouse: null, staff: null, role: null, loading: false }); return; }
    try {
      const { data } = await partnerApi.get("/partner/auth/me");
      setState({
        partner: data.partner,
        warehouse: data.warehouse,
        staff: data.staff || null,
        role: data.staff ? data.staff.role : "owner",
        loading: false,
      });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setState({ partner: null, warehouse: null, staff: null, role: null, loading: false });
    }
  };
  useEffect(() => { load(); }, []);

  // Try owner login first, fall back to staff-login. That way the same
  // sign-in form works for both — no separate URL, no user-visible mode toggle.
  const login = async (email, password) => {
    let data;
    try {
      ({ data } = await partnerApi.post("/partner/auth/login", { email, password }));
    } catch (ownerErr) {
      if (ownerErr?.response?.status === 401) {
        ({ data } = await partnerApi.post("/partner/auth/staff-login", { email, password }));
      } else throw ownerErr;
    }
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setState({
      partner: data.partner,
      warehouse: data.warehouse || null,
      staff: data.staff || null,
      role: data.staff ? data.staff.role : "owner",
      loading: false,
    });
    return data.partner;
  };

  const resetPassword = async (current_password, new_password) => {
    const { data } = await partnerApi.post("/partner/auth/reset-password", { current_password, new_password });
    setState((s) => ({ ...s, partner: data.partner }));
    return data.partner;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("baked_partner_store");
    setState({ partner: null, warehouse: null, staff: null, role: null, loading: false });
  };

  const value = useMemo(() => ({ ...state, login, resetPassword, logout, refresh: load }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/* -------------------------------------------------------------------------- */
/*                                 UI helpers                                 */
/* -------------------------------------------------------------------------- */

const FIELD = "px-4 h-11 rounded-xl w-full text-sm";
const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-medium" style={{ color: "var(--ph-fg)" }}>{label}</span>
    {hint && <span className="block text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>{hint}</span>}
    <div className="mt-2">{children}</div>
  </label>
);

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

/* -------------------------------------------------------------------------- */
/*                                Login page                                  */
/* -------------------------------------------------------------------------- */

const PartnerLoginPage = () => {
  const { login, partner } = usePartner();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  if (partner) return <Navigate to={partner.must_reset_password ? "reset-password" : "/partner-portal"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await login(email, pw);
      toast.success(`Welcome, ${p.business_name}`);
      nav(p.must_reset_password ? "/partner-portal/reset-password" : "/partner-portal");
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="partner-hub" data-theme="dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="max-w-md w-full px-6 py-10">
        <div className="flex flex-col items-center mb-8">
          <BakedLogo size="md" />
          <span
            className="text-[10px] uppercase tracking-widest mt-3 px-2.5 py-1 rounded-full"
            style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)", background: "var(--ph-glass)" }}
          >
            Partner Portal
          </span>
        </div>

        <div className="rounded-3xl p-8" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <h1 className="ph-h2" style={{ color: "var(--ph-fg)" }}>Owner sign in</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ph-fg-muted)" }}>
            Use the email and temp password sent to you at approval.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <Field label="Email">
              <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
                     className={FIELD} style={fieldStyle} data-testid="portal-login-email" placeholder="you@business.com" />
            </Field>
            <Field label="Password">
              <input type="password" required value={pw} onChange={e => setPw(e.target.value)}
                     className={FIELD} style={fieldStyle} data-testid="portal-login-password" placeholder="Your temp or reset password" />
            </Field>
            <button type="submit" disabled={busy} className="ph-btn ph-btn-warm w-full justify-center" data-testid="portal-login-submit">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? "Signing in…" : "Sign in as owner"}
            </button>
          </form>

          {/* Staff Login CTA — teammates use a store-scoped 3-field flow */}
          <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--ph-border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--ph-fg)" }}>
                  Staff member?
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>
                  Sign in with your Store ID + Employee ID / email.
                </div>
              </div>
              <Link to="/partner/staff-login"
                    className="text-sm font-medium px-4 h-10 inline-flex items-center rounded-lg"
                    style={{
                      color: "var(--ph-accent-warm)",
                      border: "1px solid var(--ph-accent-warm)",
                      textDecoration: "none",
                    }}
                    data-testid="portal-login-to-staff">
                Staff Login →
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: "var(--ph-fg-subtle)" }}>
          Not a partner yet? <Link to="/partner/apply" className="underline" style={{ color: "var(--ph-accent-warm)" }}>Apply here</Link>
        </p>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             Password reset page                            */
/* -------------------------------------------------------------------------- */

const PartnerResetPasswordPage = () => {
  const { partner, resetPassword } = usePartner();
  const nav = useNavigate();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!partner) return <Navigate to="login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (nw.length < 8) return toast.error("New password must be at least 8 characters");
    if (nw !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await resetPassword(cur, nw);
      toast.success("Password updated — welcome to your partner portal");
      nav("/partner-portal");
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="partner-hub" data-theme="dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="max-w-md w-full px-6 py-10">
        <div className="flex flex-col items-center mb-8">
          <BakedLogo size="md" />
        </div>
        <div className="rounded-3xl p-8" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
               style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
            <KeyRound size={22} />
          </div>
          <h1 className="ph-h2" style={{ color: "var(--ph-fg)" }}>Set a new password</h1>
          <p className="text-sm mt-2" style={{ color: "var(--ph-fg-muted)" }}>
            For your security, please replace your temporary password before continuing.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-5">
            <Field label="Temporary password">
              <input type="password" required value={cur} onChange={e => setCur(e.target.value)}
                     className={FIELD} style={fieldStyle} data-testid="portal-reset-current" />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <input type="password" required value={nw} onChange={e => setNw(e.target.value)}
                     className={FIELD} style={fieldStyle} data-testid="portal-reset-new" />
            </Field>
            <Field label="Confirm new password">
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                     className={FIELD} style={fieldStyle} data-testid="portal-reset-confirm" />
            </Field>
            <button type="submit" disabled={busy} className="ph-btn ph-btn-warm w-full justify-center" data-testid="portal-reset-submit">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Portal shell                                  */
/* -------------------------------------------------------------------------- */

// Role → visible tabs. Owners see everything (implicit).
const NAV_ROLE_ACCESS = {
  owner:             ["", "profile", "warehouse", "products", "inventory", "receiving", "counts", "restock", "purchase-orders", "invoices", "orders", "wallet", "team"],
  manager:           ["", "profile", "warehouse", "products", "inventory", "receiving", "counts", "restock", "purchase-orders", "invoices", "orders", "wallet", "team"],
  supervisor:        ["", "profile", "warehouse", "products", "inventory", "receiving", "counts", "restock", "purchase-orders", "invoices", "orders", "wallet", "team"],
  warehouse_manager: ["", "profile", "warehouse", "products", "inventory", "receiving", "counts", "restock", "purchase-orders", "invoices", "orders", "team"],
  inventory_manager: ["", "warehouse", "products", "inventory", "receiving", "counts", "restock", "purchase-orders", "invoices", "orders"],
  packer:            ["", "warehouse", "products", "inventory", "orders"],
  cashier:           ["", "orders", "wallet"],
  customer_support:  ["", "orders"],
};

const NAV = [
  { seg: "",          icon: LayoutDashboard, label: "Dashboard" },
  { seg: "profile",   icon: Building2,       label: "Business profile" },
  { seg: "warehouse", icon: WarehouseIcon,   label: "Warehouse" },
  { seg: "products",  icon: Package,         label: "Products" },
  { seg: "inventory", icon: Boxes,           label: "Inventory" },
  { seg: "receiving", icon: PackagePlus,     label: "Receiving" },
  { seg: "counts",    icon: ClipboardCheck,  label: "Stock counts" },
  { seg: "restock",   icon: Sparkles,        label: "Restock suggestions" },
  { seg: "purchase-orders", icon: Package,   label: "Purchase orders" },
  { seg: "invoices",  icon: Receipt,         label: "Supplier invoices" },
  { seg: "orders",    icon: ShoppingBag,     label: "Orders" },
  { seg: "wallet",    icon: Wallet,          label: "Wallet" },
  { seg: "team",      icon: Users,           label: "Team" },
];

const PortalShell = ({ children }) => {
  const { partner, warehouse, logout, role, staff } = usePartner();
  const nav = useNavigate();
  const loc = useLocation();
  const activeSeg = loc.pathname.replace(/^\/partner-portal\/?/, "").split("/")[0] || "";
  const visible = new Set(NAV_ROLE_ACCESS[role] || NAV_ROLE_ACCESS.owner);
  const visibleNav = NAV.filter(n => visible.has(n.seg));

  return (
    <div className="partner-hub" data-theme="dark" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "260px 1fr" }}>
      {/* Sidebar */}
      <aside className="p-6" style={{ background: "var(--ph-bg-elevated)", borderRight: "1px solid var(--ph-border)" }}>
        <Link to="/partner-portal" className="flex items-center gap-3">
          <BakedLogo size="sm" />
        </Link>
        <div className="text-[10px] uppercase tracking-widest mt-2" style={{ color: "var(--ph-fg-subtle)" }}>
          Partner Portal
        </div>

        <div className="mt-8 mb-2 text-xs font-semibold" style={{ color: "var(--ph-fg)" }}>{partner?.business_name}</div>
        {(() => {
          // Show the store context (code + city) when a staff session
          // was scoped to a specific store at login. Cached in localStorage
          // by StaffLoginPage; safe to fall back to warehouse if absent.
          let s = null;
          try { s = JSON.parse(localStorage.getItem("baked_partner_store") || "null"); } catch { /* noop */ }
          const code = s?.code || warehouse?.code;
          const city = s?.city || s?.name || warehouse?.name;
          if (!code) return null;
          return (
            <div data-testid="portal-store-context"
                 className="text-[11px] mt-1 flex items-center gap-2 px-2 py-1 rounded"
                 style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
              <span className="font-mono tracking-wider">{code}</span>
              {city && <span style={{ opacity: 0.7 }}>· {city}</span>}
            </div>
          );
        })()}
        <div className="text-xs mt-2 flex items-center gap-2" style={{ color: "var(--ph-fg-subtle)" }}>
          <span>{staff ? staff.email : partner?.owner_email}</span>
          {role && role !== "owner" && (
            <span data-testid="portal-role-badge"
                  className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
              {role}
            </span>
          )}
        </div>

        <nav className="mt-8 space-y-1">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const isActive = activeSeg === n.seg;
            return (
              <Link
                key={n.seg}
                to={`/partner-portal${n.seg ? "/" + n.seg : ""}`}
                onClick={(e) => { if (n.soon) e.preventDefault(); }}
                data-testid={`portal-nav-${n.seg || "dashboard"}`}
                className="flex items-center gap-3 px-3 h-10 rounded-xl text-sm transition-colors"
                style={{
                  background: isActive ? "var(--ph-warm-soft)" : "transparent",
                  color: isActive ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                  cursor: n.soon ? "not-allowed" : "pointer",
                  opacity: n.soon ? 0.55 : 1,
                }}
              >
                <Icon size={16} />
                <span className="flex-1">{n.label}</span>
                {n.soon && <span className="text-[9px] uppercase tracking-widest">Soon</span>}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => { logout(); nav("/partner-portal/login"); toast.success("Signed out"); }}
          className="mt-8 flex items-center gap-3 px-3 h-10 w-full rounded-xl text-sm"
          style={{ color: "var(--ph-fg-muted)" }}
          data-testid="portal-logout"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", overflow: "hidden" }}>
        <StoreContextBanner />
        <main className="p-10 overflow-y-auto flex-1">{children}</main>
      </div>
    </div>
  );
};


/* -------------------------------------------------------------------------- */
/*                     Persistent Store Context Banner                        */
/*   Fixing_Prompt §17/§19 — every operational screen must expose the        */
/*   active store code/name so a distracted staff member never confuses      */
/*   inventory or orders across stores.                                       */
/* -------------------------------------------------------------------------- */

const STATUS_META = {
  active:                  { color: "#7ee6b0", label: "Active" },
  temporarily_suspended:   { color: "#ff9090", label: "Suspended" },
  maintenance:             { color: "#ffbf3c", label: "Maintenance" },
  setup_in_progress:       { color: "#7edcff", label: "Setup" },
  setup_required:          { color: "#7edcff", label: "Setup required" },
  under_review:            { color: "#ffbf3c", label: "Under review" },
  additional_info_required:{ color: "#ffbf3c", label: "Info required" },
  pending:                 { color: "#a0a0b8", label: "Pending" },
  approved:                { color: "#7ee6b0", label: "Approved" },
  rejected:                { color: "#ff9090", label: "Rejected" },
  closed:                  { color: "#a0a0b8", label: "Closed" },
};

const StoreContextBanner = () => {
  const { warehouse, partner, staff, role } = usePartner();
  // Prefer the JWT-scoped store (from staff-login) cached in localStorage;
  // fall back to the partner's default warehouse for owner sessions.
  let scoped = null;
  try { scoped = JSON.parse(localStorage.getItem("baked_partner_store") || "null"); } catch { /* noop */ }
  const store = scoped || warehouse;
  if (!store) return null;

  const status = store.status || warehouse?.status || "active";
  const meta = STATUS_META[status] || STATUS_META.active;
  const cityLine = [store.city, store.region].filter(Boolean).join(" · ");

  return (
    <div
      data-testid="portal-store-banner"
      className="flex items-center gap-4 px-8 py-3"
      style={{
        background: "var(--ph-bg-elevated)",
        borderBottom: "1px solid var(--ph-border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
          <WarehouseIcon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span data-testid="portal-store-banner-code"
                  className="font-mono text-xs tracking-wider px-2 py-1 rounded"
                  style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
              {store.code}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: "var(--ph-fg)" }}>
              {store.name}
            </span>
            <span data-testid="portal-store-banner-status"
                  className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    color: meta.color,
                    border: `1px solid ${meta.color}44`,
                  }}>
              {meta.label}
            </span>
          </div>
          {cityLine && (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--ph-fg-subtle)" }}>
              {cityLine}
            </div>
          )}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-2 text-[11px]"
           style={{ color: "var(--ph-fg-subtle)" }}>
        <NotificationBell apiClient={partnerApi} basePath="/partner/notifications"
                          onNavigate={(link) => (window.location.href = link)} />
        <span>Signed in as</span>
        <span style={{ color: "var(--ph-fg-muted)" }}>{staff?.email || partner?.owner_email}</span>
        {role && role !== "owner" && (
          <span className="uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
            {role.replace(/_/g, " ")}
          </span>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             Dashboard page                                 */
/* -------------------------------------------------------------------------- */

const MetricCard = ({ label, value, icon: Icon }) => (
  <div className="rounded-2xl p-6" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
           style={{ background: "var(--ph-accent-soft)", color: "var(--ph-accent)" }}>
        <Icon size={18} />
      </div>
      <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg-muted)" }}>{label}</div>
    </div>
    <div className="ph-h1 mt-4" style={{ color: "var(--ph-fg)", fontSize: "2rem" }}>{value}</div>
  </div>
);

const DashboardPage = () => {
  const { partner, warehouse } = usePartner();
  const [dash, setDash] = useState(null);
  const [invKpis, setInvKpis] = useState(null);
  useEffect(() => {
    partnerApi.get("/partner/dashboard").then(r => setDash(r.data));
    partnerApi.get("/partner/inventory/dashboard-kpis").then(r => setInvKpis(r.data)).catch(() => {});
  }, []);

  if (!dash) return <Loader2 className="animate-spin" size={20} />;
  const m = dash.metrics;
  return (
    <div data-testid="portal-dashboard-page">
      <div className="ph-eyebrow">Welcome back</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Hi, {(partner.owner_name || partner.business_name || "").split(" ")[0] || "there"}.</h1>
      <p className="ph-body mt-2 max-w-2xl">
        This is your MARTbakēd Partner dashboard for <b style={{ color: "var(--ph-fg)" }}>{partner.business_name}</b>
        {warehouse && <> — operating out of <b style={{ color: "var(--ph-fg)" }}>{warehouse.name}</b>.</>}
      </p>

      <section className="mt-10">
        <h2 className="ph-h3 mb-4" style={{ color: "var(--ph-fg)" }}>Today at a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Orders today"     value={m.orders_today}    icon={ShoppingBag} />
          <MetricCard label="Revenue today"    value={`${m.revenue_today} CFA`} icon={Wallet} />
          <MetricCard label="Products live"    value={m.products_live}   icon={Package} />
          <MetricCard label="Inventory items"  value={m.inventory_items} icon={WarehouseIcon} />
        </div>
      </section>

      {invKpis && (invKpis.pending_receiving + invKpis.pending_put_away + invKpis.pending_counts) > 0 && (
        <section className="mt-8">
          <h2 className="ph-h3 mb-4" style={{ color: "var(--ph-fg)" }}>Warehouse operations</h2>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Pending receiving" value={invKpis.pending_receiving} icon={PackagePlus} />
            <MetricCard label="Pending put-away"  value={invKpis.pending_put_away}  icon={Boxes} />
            <MetricCard label="Pending counts"    value={invKpis.pending_counts}    icon={ClipboardCheck} />
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="ph-h3 mb-4" style={{ color: "var(--ph-fg)" }}>Get set up</h2>
        <div className="rounded-2xl divide-y" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)", borderColor: "var(--ph-border)" }}>
          {dash.checklist.map((c) => (
            <div key={c.key} className="flex items-center gap-4 p-5" style={{ borderColor: "var(--ph-border)" }}>
              {c.done
                ? <CheckCircle2 size={20} className="text-emerald-400" />
                : <Circle size={20} style={{ color: "var(--ph-fg-subtle)" }} />}
              <div className="flex-1 text-sm" style={{ color: c.done ? "var(--ph-fg-muted)" : "var(--ph-fg)" }}>
                {c.label}
                {c.done && <span className="ml-2 text-[10px] uppercase tracking-widest text-emerald-400">Done</span>}
              </div>
              <ChevronRight size={16} style={{ color: "var(--ph-fg-subtle)" }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                          Business Profile / Warehouse                       */
/* -------------------------------------------------------------------------- */

const KeyRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid var(--ph-border)" }}>
    <Icon size={16} style={{ color: "var(--ph-fg-subtle)" }} className="mt-0.5" />
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>{label}</div>
      <div className="text-sm mt-1" style={{ color: "var(--ph-fg)" }}>{value || "—"}</div>
    </div>
  </div>
);

const ProfilePage = () => {
  const { partner } = usePartner();
  return (
    <div data-testid="portal-profile-page">
      <div className="ph-eyebrow">Business profile</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>{partner.business_name}</h1>
      <p className="ph-body mt-2">Confirmed with BAKĒD at approval. Edits will land in a later slice.</p>
      <div className="mt-8 max-w-xl rounded-2xl p-6" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        <KeyRow icon={Store}     label="Business type" value={partner.business_type?.replace(/_/g, " ")} />
        <KeyRow icon={Building2} label="Owner"          value={partner.owner_name} />
        <KeyRow icon={Mail}      label="Email"          value={partner.owner_email} />
        <KeyRow icon={Phone}     label="Phone"          value={partner.owner_phone} />
        <KeyRow icon={MapPin}    label="Country"        value={partner.country} />
      </div>
    </div>
  );
};

// WarehousePage lives in ./WarehouseEditor to keep this file within the
// Emergent visual-edits Babel plugin's JSX-depth ceiling.
import { WarehousePage } from "./WarehouseEditor";
import { ProductsPage } from "./ProductsPage";
import { OrdersPage } from "./OrdersPage";
import { WalletPage } from "./WalletPage";
import { TeamPage, AcceptInvitePage } from "./TeamPage";
import { InventoryPage } from "./InventoryPage";
import { ReceivingPage } from "./ReceivingPage";
import { PurchaseOrdersPage } from "./PurchaseOrdersPage";
import { RestockSuggestionsPage } from "./RestockSuggestionsPage";
import { SupplierInvoicesPage } from "../../components/invoices/SupplierInvoicesPage";
import { NotificationBell } from "../../components/notifications/NotificationBell";
import { StockCountsPage } from "./StockCountsPage";


/* -------------------------------------------------------------------------- */
/*                             Root routing                                   */
/* -------------------------------------------------------------------------- */

const Protected = ({ children, needsReset }) => {
  const { partner, loading } = usePartner();
  if (loading) return <div className="partner-hub" data-theme="dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Loader2 className="animate-spin" size={20} /></div>;
  if (!partner) return <Navigate to="/partner-portal/login" replace />;
  if (partner.must_reset_password && !needsReset) return <Navigate to="/partner-portal/reset-password" replace />;
  return children;
};

export const PartnerPortalApp = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "BAKĒD Partner Portal";
    return () => { document.title = prev; };
  }, []);
  return (
    <PartnerProvider>
      <Routes>
        <Route path="login" element={<PartnerLoginPage />} />
        <Route path="reset-password" element={<Protected needsReset><PartnerResetPasswordPage /></Protected>} />
        <Route path="" element={<Protected><PortalShell><DashboardPage /></PortalShell></Protected>} />
        <Route path="profile" element={<Protected><PortalShell><ProfilePage /></PortalShell></Protected>} />
        <Route path="warehouse" element={<Protected><PortalShell><WarehousePage /></PortalShell></Protected>} />
        <Route path="products" element={<Protected><PortalShell><ProductsPage /></PortalShell></Protected>} />
        <Route path="inventory" element={<Protected><PortalShell><InventoryPage /></PortalShell></Protected>} />
        <Route path="receiving" element={<Protected><PortalShell><ReceivingPage /></PortalShell></Protected>} />
        <Route path="counts" element={<Protected><PortalShell><StockCountsPage /></PortalShell></Protected>} />
        <Route path="purchase-orders" element={<Protected><PortalShell><PurchaseOrdersPage /></PortalShell></Protected>} />
        <Route path="restock" element={<Protected><PortalShell><RestockSuggestionsPage /></PortalShell></Protected>} />
        <Route path="invoices" element={<Protected><PortalShell><SupplierInvoicesPage apiClient={partnerApi} role="partner" basePath="/partner/invoices" /></PortalShell></Protected>} />
        <Route path="orders" element={<Protected><PortalShell><OrdersPage /></PortalShell></Protected>} />
        <Route path="wallet" element={<Protected><PortalShell><WalletPage /></PortalShell></Protected>} />
        <Route path="team" element={<Protected><PortalShell><TeamPage /></PortalShell></Protected>} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/partner-portal" replace />} />
      </Routes>
    </PartnerProvider>
  );
};

export default PartnerPortalApp;
