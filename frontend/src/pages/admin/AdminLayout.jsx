import React from "react";
import { Link, Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAdmin } from "../../contexts/AdminContext";
import { BakedLogo } from "../../components/layout/BakedLogo";
import { LayoutDashboard, Globe, MapPin, ShieldCheck, DollarSign, Sparkles, Brain, ScrollText, Users, UserCog, LogOut } from "lucide-react";

const NAV = [
  { to: "/admin", exact: true, icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/countries", icon: Globe, label: "Countries" },
  { to: "/admin/cities", icon: MapPin, label: "Cities" },
  { to: "/admin/roles", icon: ShieldCheck, label: "Roles & Permissions" },
  { to: "/admin/finance", icon: DollarSign, label: "Finance" },
  { to: "/admin/ai-command", icon: Sparkles, label: "AI Command Center" },
  { to: "/admin/insights", icon: Brain, label: "AI Business Insights" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit Logs" },
  { to: "/admin/customers", icon: Users, label: "Customers" },
  { to: "/admin/admins", icon: UserCog, label: "Admin Users", superOnly: true },
];

export const AdminLayout = () => {
  const { admin, loading, logout } = useAdmin();
  const nav = useNavigate();
  const location = useLocation();
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!admin) return <Navigate to="/admin/login" replace />;
  const isSuper = admin.role === "super_admin";

  return (
    <div className="min-h-screen bg-background text-foreground grid grid-cols-[240px_1fr]">
      <aside className="border-r border-border p-4 flex flex-col gap-2">
        <div className="pt-2 pb-4 flex flex-col items-start"><BakedLogo size="md" /><div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Super Admin</div></div>
        <nav className="flex-1 flex flex-col gap-1">
          {NAV.filter((n) => !n.superOnly || isSuper).map((n) => {
            const Icon = n.icon;
            const active = n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} data-testid={`admin-nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`} className={`flex items-center gap-3 px-3 py-2 baked-btn text-sm motion-fast ${active ? "bg-[#1D9BF0] text-white" : "hover:bg-secondary text-muted-foreground hover:text-foreground"}`}>
                <Icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground truncate">{admin.email}</div>
          <div className="text-[10px] uppercase tracking-widest text-primary">{admin.role}</div>
          <button data-testid="admin-logout" onClick={() => { logout(); nav("/admin/login"); }} className="text-xs mt-2 flex items-center gap-2 text-muted-foreground hover:text-foreground"><LogOut size={12} /> Sign out</button>
        </div>
      </aside>
      <main className="p-6 overflow-y-auto max-h-screen"><Outlet /></main>
    </div>
  );
};
