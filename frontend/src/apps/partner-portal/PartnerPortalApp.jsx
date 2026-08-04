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
  MapPin, Mail, Phone, Store,
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
  const [state, setState] = useState({ partner: null, warehouse: null, loading: true });

  const load = async () => {
    if (!localStorage.getItem(TOKEN_KEY)) { setState({ partner: null, warehouse: null, loading: false }); return; }
    try {
      const { data } = await partnerApi.get("/partner/auth/me");
      setState({ partner: data.partner, warehouse: data.warehouse, loading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setState({ partner: null, warehouse: null, loading: false });
    }
  };
  useEffect(() => { load(); }, []);

  const login = async (email, password) => {
    const { data } = await partnerApi.post("/partner/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setState({ partner: data.partner, warehouse: data.warehouse, loading: false });
    return data.partner;
  };

  const resetPassword = async (current_password, new_password) => {
    const { data } = await partnerApi.post("/partner/auth/reset-password", { current_password, new_password });
    setState((s) => ({ ...s, partner: data.partner }));
    return data.partner;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ partner: null, warehouse: null, loading: false });
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
          <h1 className="ph-h2" style={{ color: "var(--ph-fg)" }}>Sign in</h1>
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
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
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

const NAV = [
  { seg: "",         icon: LayoutDashboard, label: "Dashboard" },
  { seg: "profile",  icon: Building2,       label: "Business profile" },
  { seg: "warehouse", icon: WarehouseIcon,  label: "Warehouse" },
  { seg: "products", icon: Package,         label: "Products",    soon: true },
  { seg: "orders",   icon: ShoppingBag,     label: "Orders",      soon: true },
  { seg: "wallet",   icon: Wallet,          label: "Wallet",      soon: true },
];

const PortalShell = ({ children }) => {
  const { partner, warehouse, logout } = usePartner();
  const nav = useNavigate();
  const loc = useLocation();
  const activeSeg = loc.pathname.replace(/^\/partner-portal\/?/, "").split("/")[0] || "";

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
        <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{partner?.owner_email}</div>

        <nav className="mt-8 space-y-1">
          {NAV.map((n) => {
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

      <main className="p-10 overflow-y-auto">{children}</main>
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
  useEffect(() => { partnerApi.get("/partner/dashboard").then(r => setDash(r.data)); }, []);

  if (!dash) return <Loader2 className="animate-spin" size={20} />;
  const m = dash.metrics;
  return (
    <div data-testid="portal-dashboard-page">
      <div className="ph-eyebrow">Welcome back</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Hi, {partner.owner_name.split(" ")[0]}.</h1>
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

const WarehousePage = () => {
  const { warehouse } = usePartner();
  if (!warehouse) return <p className="ph-body">No warehouse configured yet.</p>;
  return (
    <div data-testid="portal-warehouse-page">
      <div className="ph-eyebrow">Warehouse</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>{warehouse.name}</h1>
      <p className="ph-body mt-2">Primary fulfilment location for your BAKĒD store.</p>
      <div className="mt-8 max-w-xl rounded-2xl p-6" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        <KeyRow icon={MapPin}     label="Address"       value={`${warehouse.address_line}, ${warehouse.city}`} />
        <KeyRow icon={Building2}  label="Property"      value={warehouse.property_type} />
        <KeyRow icon={WarehouseIcon} label="Size"       value={warehouse.property_size_sqm ? `${warehouse.property_size_sqm} m²` : "—"} />
        <KeyRow icon={MapPin}     label="Service area"  value={warehouse.service_area_km ? `${warehouse.service_area_km} km radius` : "—"} />
      </div>
    </div>
  );
};

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
        <Route path="*" element={<Navigate to="/partner-portal" replace />} />
      </Routes>
    </PartnerProvider>
  );
};

export default PartnerPortalApp;
