import React from "react";
import { Link, Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAdmin } from "../../contexts/AdminContext";
import { BakedLogo } from "../../components/layout/BakedLogo";
import {
  LayoutDashboard, Globe, MapPin, ShieldCheck, DollarSign, Sparkles, Brain,
  ScrollText, UserCog, LogOut, ShoppingBasket, Utensils, ShoppingBag, Truck,
  Car, Home as HomeIcon, Settings2, Plug, Server, BarChart3, Warehouse,
} from "lucide-react";
import { MODULES } from "../../lib/modules";
import { NotificationBell } from "../../components/notifications/NotificationBell";
import { adminApi } from "../../contexts/AdminContext";

// PRD §7 Platform Governance — global operational governance only.
// Customers/Vendors/Drivers are module-scoped and live inside each Business Module workspace.
const GOVERNANCE = [
  { to: "/admin", exact: true, icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/countries", icon: Globe, label: "Countries" },
  { to: "/admin/cities", icon: MapPin, label: "Cities" },
  { to: "/admin/stores", icon: Warehouse, label: "Stores" },
  { to: "/admin/admins", icon: UserCog, label: "Admin Users", superOnly: true },
  { to: "/admin/roles", icon: ShieldCheck, label: "Roles & Permissions" },
  { to: "/admin/ai-center", icon: Sparkles, label: "AI Center" },
  { to: "/admin/insights", icon: Brain, label: "AI Business Insights" },
  { to: "/admin/finance", icon: DollarSign, label: "Finance" },
  { to: "/admin/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit Logs" },
  { to: "/admin/api-management", icon: Plug, label: "API Management" },
  { to: "/admin/infrastructure", icon: Server, label: "Infrastructure" },
  { to: "/admin/settings", icon: Settings2, label: "System Settings" },
];

const MODULE_ICONS = { mart: ShoppingBasket, food: Utensils, shop: ShoppingBag, express: Truck, auto: Car, immo: HomeIcon };

export const AdminLayout = () => {
  const { admin, loading, logout } = useAdmin();
  const nav = useNavigate();
  const location = useLocation();
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!admin) return <Navigate to="/admin/login" replace />;
  const isSuper = admin.role === "super_admin";
  const isActive = (n) => (n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen bg-background text-foreground grid grid-cols-[240px_1fr]">
      <aside className="border-r border-border p-4 flex flex-col gap-2 max-h-screen overflow-y-auto">
        <div className="pt-2 pb-4 flex flex-col items-start">
          <BakedLogo size="md" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Super Admin</div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mt-2 mb-1">Platform Governance</div>
        <nav className="flex flex-col gap-1">
          {GOVERNANCE.filter((n) => !n.superOnly || isSuper).map((n) => {
            const Icon = n.icon;
            const active = isActive(n);
            return (
              <Link key={n.to} to={n.to} data-testid={`admin-nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2 baked-btn text-sm motion-fast ${active ? "bg-[#1D9BF0] text-white" : "hover:bg-secondary text-muted-foreground hover:text-foreground"}`}>
                <Icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mt-4 mb-1">Business Modules</div>
        <nav className="flex flex-col gap-1">
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m.code] || ShoppingBasket;
            const to = `/admin/modules/${m.code}`;
            const active = location.pathname.startsWith(to);
            return (
              <Link key={m.code} to={to} data-testid={`admin-nav-module-${m.code}`}
                className={`flex items-center gap-3 px-3 py-2 baked-btn text-sm motion-fast ${active ? "text-white" : "hover:bg-secondary text-muted-foreground hover:text-foreground"}`}
                style={active ? { backgroundColor: m.color } : {}}>
                <Icon size={16} style={active ? {} : { color: m.color }} />
                <span className="flex-1">{m.label}<span className="text-foreground/60">bakēd</span></span>
                {m.status !== "active" && <span className="text-[9px] uppercase tracking-widest opacity-60">soon</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{admin.email}</div>
              <div className="text-[10px] uppercase tracking-widest text-primary">{admin.role}</div>
            </div>
            <NotificationBell apiClient={adminApi} basePath="/admin/notifications"
                              onNavigate={(link) => nav(link)} />
          </div>
          <button data-testid="admin-logout" onClick={() => { logout(); nav("/admin/login"); }} className="text-xs mt-2 flex items-center gap-2 text-muted-foreground hover:text-foreground"><LogOut size={12} /> Sign out</button>
        </div>
      </aside>
      <main className="p-6 overflow-y-auto max-h-screen"><Outlet /></main>
    </div>
  );
};
