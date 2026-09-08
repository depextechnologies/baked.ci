/**
 * MARTbakēd Supplier Portal — auth-gated home for approved suppliers.
 *
 * Structure:
 *   /martbaked/sellers/portal          → Dashboard (home)
 *   /martbaked/sellers/portal/profile  → Business Profile
 *   /martbaked/sellers/portal/catalogue → Catalogue (SKU ↔ cost)
 *   /martbaked/sellers/portal/documents → Documents (drag & drop uploads)
 *   /martbaked/sellers/portal/locations → Supply Locations
 *   /martbaked/sellers/portal/product-requests → Product Requests
 *
 * Shell renders the sidebar + top bar; child pages render inside <Outlet />.
 */
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Routes, Route, NavLink, Navigate, useNavigate, useParams, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard, Building2, PackageSearch, FileText, MapPinned, PlusSquare,
  LogOut, ArrowRight, ArrowLeft, ShieldCheck, AlertTriangle, ShoppingBag, Receipt, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { BakedLogo } from "@/components/layout/BakedLogo";
import { PortalProfile } from "./portal/PortalProfile";
import { PortalCatalogue } from "./portal/PortalCatalogue";
import { PortalDocuments } from "./portal/PortalDocuments";
import { PortalLocations } from "./portal/PortalLocations";
import { PortalProductRequests } from "./portal/PortalProductRequests";
import { PortalOrders } from "./portal/PortalOrders";
import { PortalShop } from "./portal/PortalShop";
import { PortalShopOrders } from "./portal/PortalShopOrders";
import { SupplierInvoicesPage } from "../../components/invoices/SupplierInvoicesPage";
import { NotificationBell } from "../../components/notifications/NotificationBell";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Axios instance + auth interceptor
export const portalApi = axios.create({ baseURL: API });
portalApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("supplier_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
portalApi.interceptors.response.use((r) => r, (err) => {
  if (err?.response?.status === 401) {
    localStorage.removeItem("supplier_token");
    localStorage.removeItem("supplier");
    // Respect the current URL prefix — SHOP sellers shouldn't get bounced
    // to the MART login page.
    const isShop = window.location.pathname.startsWith("/shopbaked");
    const base = isShop ? "/shopbaked" : "/martbaked";
    window.location.href = `${base}/sellers/login?redirect=${base}/sellers/portal`;
  }
  return Promise.reject(err);
});

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Something went wrong.";
};

/* -------------------------------------------------------------------------- */
/*                                Auth guard                                    */
/* -------------------------------------------------------------------------- */

const useSupplierAuth = () => {
  const [supplier, setSupplier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const { data } = await portalApi.get("/supplier/me");
      setSupplier(data);
      setError(null);
      localStorage.setItem("supplier", JSON.stringify(data));
    } catch (e) {
      // Only treat 401 as auth failure — the axios interceptor already handles the redirect.
      // Other errors (network/5xx) shouldn't kick a signed-in user out.
      if (e?.response?.status && e.response.status !== 401) {
        // Fall back to cached supplier so the shell stays usable.
        const cached = localStorage.getItem("supplier");
        if (cached) { try { setSupplier(JSON.parse(cached)); } catch {} }
        setError(null);  // don't trigger redirect below
      } else {
        setError(e);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const t = localStorage.getItem("supplier_token");
    if (!t) { setLoading(false); return; }
    refresh();
  }, []);

  return { supplier, loading, error, refresh };
};

/* -------------------------------------------------------------------------- */
/*                                    Shell                                     */
/* -------------------------------------------------------------------------- */

const NAV = [
  { to: "dashboard",         label: "Dashboard",        icon: LayoutDashboard },
  { to: "profile",           label: "Business Profile", icon: Building2 },
  { to: "catalogue",         label: "Catalogue",        icon: PackageSearch },
  { to: "shop",              label: "SHOPbakēd",        icon: ShoppingBag },
  { to: "shop-orders",       label: "SHOP Orders",      icon: Truck },
  { to: "orders",            label: "Orders",           icon: ShoppingBag },
  { to: "invoices",          label: "Invoices",         icon: Receipt },
  { to: "product-requests",  label: "Product Requests", icon: PlusSquare },
  { to: "documents",         label: "Documents",        icon: FileText },
  { to: "supply-locations",  label: "Supply Locations", icon: MapPinned },
];

const PortalShell = ({ supplier, refresh, portalPrefix = "/martbaked" }) => {
  const { sellerSlug } = useParams();
  const navigate = useNavigate();
  const logout = () => {
    localStorage.removeItem("supplier_token");
    localStorage.removeItem("supplier");
    toast.success("Logged out");
    navigate("/martbaked/sellers");
  };

  return (
    <div className="partner-landing" data-theme="dark" style={{ minHeight: "100vh" }}>
      <div className="flex" style={{ minHeight: "100vh", background: "var(--pl-bg)" }}>
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col p-6 gap-2 shrink-0"
          style={{ width: 260, background: "var(--pl-bg-elevated)", borderRight: "1px solid var(--pl-border)" }}
          data-testid="portal-sidebar">
          <div className="flex items-center gap-3 mb-2">
            <BakedLogo size="sm" />
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-accent)" }}>Sellers</div>
            <div className="ml-auto">
              <NotificationBell apiClient={portalApi} basePath="/supplier/me/notifications"
                                align="left"
                                onNavigate={(link) => (window.location.href = link)} />
            </div>
          </div>
          <div className="pl-card p-4 mb-4" style={{ background: "var(--pl-bg)" }}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-subtle)" }}>Signed in as</div>
            <div className="text-sm font-semibold mt-1" style={{ color: "var(--pl-fg)" }} data-testid="portal-supplier-name">
              {supplier?.trading_name || supplier?.business_name}
            </div>
            <div className="text-xs mt-0.5 font-mono" style={{ color: "var(--pl-fg-muted)" }}>{supplier?.code || "—"}</div>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <NavLink key={n.label}
                to={`${portalPrefix}/${supplier?.seller_slug || sellerSlug || "sellers"}/portal/${n.to}`}
                data-testid={`portal-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) => `flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-all`}
                style={({ isActive }) => ({
                  background: isActive ? "var(--pl-accent-soft)" : "transparent",
                  color: isActive ? "var(--pl-accent)" : "var(--pl-fg-muted)",
                })}>
                <n.icon size={16} /> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto pt-4" style={{ borderTop: "1px solid var(--pl-border)" }}>
            <button onClick={logout} className="flex items-center gap-3 px-3 h-10 rounded-lg text-sm w-full"
              style={{ color: "var(--pl-fg-muted)" }} data-testid="portal-btn-logout">
              <LogOut size={16} /> Sign out
            </button>
            <Link to={portalPrefix === "/shopbaked" ? "/shopbaked/sellers" : "/martbaked/sellers"} className="flex items-center gap-3 px-3 h-9 rounded-lg text-xs mt-1"
              style={{ color: "var(--pl-fg-subtle)" }}>
              <ArrowLeft size={12} /> Back to Sellers Home
            </Link>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--pl-border)" }}>
              <LanguageSwitcher variant="compact" />
            </div>
          </div>
        </aside>
        {/* Content */}
        <main className="flex-1 min-w-0" style={{ background: "var(--pl-bg)" }}>
          <div className="px-6 md:px-10 py-8" data-testid="portal-content">
            <Outlet context={{ supplier, refresh }} />
          </div>
        </main>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Router                                     */
/* -------------------------------------------------------------------------- */

const LoadingScreen = () => (
  <div className="partner-landing" data-theme="dark" style={{ minHeight: "100vh" }}>
    <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--pl-bg)" }}>
      <div className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>Loading portal…</div>
    </div>
  </div>
);

export const SellerPortalApp = ({ legacy = false, module = "mart" }) => {
  // URL prefix identity — `/shopbaked/{slug}/portal/…` for SHOP, otherwise
  // `/martbaked/{slug}/portal/…`. Only affects link generation + login
  // redirects; the backend supplier API is unchanged.
  const portalPrefix = module === "shop" ? "/shopbaked" : "/martbaked";
  const loginBase = module === "shop" ? "/shopbaked/sellers/login" : "/martbaked/sellers/login";
  const { supplier, loading, error, refresh } = useSupplierAuth();
  const { sellerSlug } = useParams();
  const navigate = useNavigate();

  // Legacy `/martbaked/sellers/portal/*` → redirect to the resolved slug URL.
  // Handled here (client-side) once auth resolves so the user is never
  // stranded on a stale bookmark. Kubernetes ingress doesn't let us do this
  // at the edge without a rewrite rule, so client redirect is the safe path.
  useEffect(() => {
    if (loading || !supplier?.seller_slug) return;
    const rest = window.location.pathname.replace(/^\/(?:mart|shop)baked\/(?:sellers\/)?[^/]*\/?portal\/?/, "");
    if (legacy) {
      const dest = `${portalPrefix}/${supplier.seller_slug}/portal/${rest || "dashboard"}`;
      navigate(dest + window.location.search, { replace: true });
    } else if (sellerSlug && sellerSlug !== supplier.seller_slug) {
      navigate(`${portalPrefix}/${supplier.seller_slug}/portal/${rest || "dashboard"}`, { replace: true });
    }
  }, [loading, supplier, sellerSlug, legacy, navigate, portalPrefix]);

  if (loading) return <LoadingScreen />;
  if (loading) return <LoadingScreen />;
  const hasToken = !!localStorage.getItem("supplier_token");
  if (!hasToken || error) return <Navigate to={`${loginBase}?redirect=${portalPrefix}/sellers/portal`} replace />;
  if (!supplier) return <LoadingScreen />;

  return (
    <Routes>
      <Route element={<PortalShell supplier={supplier} refresh={refresh} portalPrefix={portalPrefix} />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PortalHome supplier={supplier} />} />
        <Route path="profile" element={<PortalProfile />} />
        <Route path="catalogue" element={<PortalCatalogue />} />
        <Route path="shop" element={<PortalShop />} />
        <Route path="shop-orders" element={<PortalShopOrders />} />
        <Route path="orders" element={<PortalOrders />} />
        <Route path="invoices" element={<SupplierInvoicesPage apiClient={portalApi} role="supplier" basePath="/supplier/me/invoices" />} />
        <Route path="documents" element={<PortalDocuments />} />
        <Route path="supply-locations" element={<PortalLocations />} />
        <Route path="locations" element={<Navigate to="../supply-locations" replace />} />
        <Route path="product-requests" element={<PortalProductRequests />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Dashboard home                                */
/* -------------------------------------------------------------------------- */

const PortalHome = ({ supplier }) => {
  const [stats, setStats] = useState({
    catalogue: 0, cat_active: 0, cat_pending: 0, cat_changes: 0,
    docs: 0, requests: 0, req_pending: 0,
    orders_open: 0, orders_new: 0,
    invoices_outstanding: 0, invoices_disputed: 0,
    notifs_unread: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const [cat, docs, reqs, orders, invoices, notifs] = await Promise.all([
          portalApi.get("/supplier/me/catalogue").catch(() => ({ data: { items: [] } })),
          portalApi.get("/supplier/me/documents").catch(() => ({ data: { items: [] } })),
          portalApi.get("/supplier/me/product-requests").catch(() => ({ data: { items: [] } })),
          portalApi.get("/supplier/me/purchase-orders").catch(() => ({ data: { items: [], buckets: {} } })),
          portalApi.get("/supplier/me/invoices").catch(() => ({ data: { items: [], buckets: {} } })),
          portalApi.get("/supplier/me/notifications", { params: { unread: 1 } }).catch(() => ({ data: { unread_count: 0 } })),
        ]);
        const cats = cat.data.items || [];
        const catStatus = (row) => row.review_status || row.status || (row.is_active ? "approved" : "pending");
        setStats({
          catalogue: cats.length,
          cat_active: cats.filter((c) => c.is_active).length,
          cat_pending: cats.filter((c) => catStatus(c) === "pending" || catStatus(c) === "under_review").length,
          cat_changes: cats.filter((c) => catStatus(c) === "changes_requested").length,
          docs: (docs.data.items || []).length,
          requests: (reqs.data.items || []).length,
          req_pending: (reqs.data.items || []).filter((r) => r.status === "pending").length,
          orders_open: ["submitted", "acknowledged", "shipped", "partially_received"]
            .reduce((n, k) => n + (orders.data.buckets?.[k] || 0), 0),
          orders_new: orders.data.buckets?.submitted || 0,
          invoices_outstanding: ["matched", "variance", "submitted"]
            .reduce((n, k) => n + (invoices.data.buckets?.[k] || 0), 0),
          invoices_disputed: invoices.data.buckets?.disputed || 0,
          notifs_unread: notifs.data.unread_count || 0,
        });
      } catch (e) { /* silent */ }
    })();
  }, []);

  const criticalNotice = supplier.status === "action_required";

  const cards = [
    { title: "Total products", value: stats.catalogue, sub: `${stats.cat_active} active · ${stats.cat_pending} pending · ${stats.cat_changes} changes`, link: "../catalogue", color: "var(--pl-accent)" },
    { title: "Open POs", value: stats.orders_open, sub: `${stats.orders_new} awaiting your ack`, link: "../orders", color: "#3B82F6" },
    { title: "Invoices to settle", value: stats.invoices_outstanding, sub: `${stats.invoices_disputed} disputed`, link: "../invoices", color: "#F97316" },
    { title: "Product requests", value: stats.req_pending, sub: `${stats.requests} total`, link: "../product-requests", color: "#FCC44C" },
    { title: "Documents", value: stats.docs, sub: "verified & pending", link: "../documents", color: "#77BC1F" },
    { title: "Unread notifications", value: stats.notifs_unread, sub: "click bell to review", link: "../dashboard", color: "#FF4C52" },
  ];

  return (
    <div className="space-y-8" data-testid="portal-home">
      <div>
        <div className="pl-eyebrow mb-2">Welcome back</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>{supplier.trading_name || supplier.business_name}</h1>
        <div className="text-sm mt-2 flex items-center gap-3 flex-wrap" style={{ color: "var(--pl-fg-muted)" }}>
          <span className="px-2 py-0.5 rounded font-mono text-xs" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>{supplier.code || "—"}</span>
          <span className="px-2 py-0.5 rounded font-mono text-xs" style={{ background: "rgba(148,163,184,.15)", color: "var(--pl-fg-muted)" }} data-testid="portal-supplier-slug">/{supplier.seller_slug || "—"}</span>
          <span>Status: <strong style={{ color: criticalNotice ? "#F97316" : "#77BC1F" }} data-testid="portal-supplier-status">{supplier.status}</strong></span>
          <span>Country: <strong style={{ color: "var(--pl-fg)" }}>{supplier.country}</strong></span>
          <span>Currency: <strong style={{ color: "var(--pl-fg)" }}>{supplier.default_currency}</strong></span>
        </div>
      </div>

      {criticalNotice && (
        <div className="pl-card p-5 flex items-start gap-4" style={{ background: "rgba(249,115,22,.10)", border: "1px solid rgba(249,115,22,.4)" }} data-testid="portal-action-required-banner">
          <AlertTriangle size={20} style={{ color: "#F97316" }} />
          <div className="flex-1">
            <div className="font-semibold" style={{ color: "#F97316" }}>Re-verification required</div>
            <div className="text-sm mt-1" style={{ color: "var(--pl-fg-muted)" }}>
              Your account has recent changes to critical fields (name, tax ID or registration number). Super Admin is reviewing — you can continue using the portal, but new PO commitments may be paused until re-verified.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link to={c.link} key={c.title} className="pl-card p-6" data-testid={`portal-stat-${c.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>{c.title}</div>
            <div className="text-4xl font-bold mt-2" style={{ color: c.color }}>{c.value}</div>
            <div className="text-xs mt-1" style={{ color: "var(--pl-fg-subtle)" }}>{c.sub}</div>
            <div className="text-xs mt-4 flex items-center gap-1" style={{ color: "var(--pl-accent)" }}>Open <ArrowRight size={12} /></div>
          </Link>
        ))}
      </div>

      <div className="pl-card p-6" data-testid="portal-quick-actions">
        <div className="pl-eyebrow mb-3">Quick actions</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link to="../catalogue" className="pl-btn pl-btn-primary justify-center" data-testid="portal-qa-add-product">
            <PackageSearch size={14} /> Add / edit product
          </Link>
          <Link to="../orders" className="pl-btn pl-btn-ghost justify-center" data-testid="portal-qa-review-orders">
            <ShoppingBag size={14} /> Review open POs
          </Link>
          <Link to="../invoices" className="pl-btn pl-btn-ghost justify-center" data-testid="portal-qa-submit-invoice">
            <Receipt size={14} /> Submit invoices
          </Link>
          <Link to="../product-requests" className="pl-btn pl-btn-ghost justify-center" data-testid="portal-qa-request-product">
            <PlusSquare size={14} /> Request new product
          </Link>
          <Link to="../documents" className="pl-btn pl-btn-ghost justify-center" data-testid="portal-qa-upload-doc">
            <FileText size={14} /> Upload document
          </Link>
          <Link to="../supply-locations" className="pl-btn pl-btn-ghost justify-center" data-testid="portal-qa-manage-locations">
            <MapPinned size={14} /> Manage supply zones
          </Link>
        </div>
      </div>

      <div className="pl-card p-6">
        <div className="pl-eyebrow mb-3">Getting started</div>
        <ol className="space-y-3">
          {[
            ["Complete your Business Profile", "../profile"],
            ["Link your SKUs to the master catalogue", "../catalogue"],
            ["Upload the latest certificates & catalogues", "../documents"],
            ["Confirm the cities / zones you can supply", "../supply-locations"],
            ["Propose new products not in the master catalogue", "../product-requests"],
          ].map(([label, link], i) => (
            <li key={label} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>{i + 1}</span>
              <Link to={link} className="text-sm flex-1" style={{ color: "var(--pl-fg)" }}>{label}</Link>
              <ArrowRight size={14} style={{ color: "var(--pl-fg-muted)" }} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

// The pages below are declared here to keep everything together — they're
// re-exported so the router can wire them up.
export default SellerPortalApp;
