import React from "react";
import { Link, NavLink, Outlet, useParams, useLocation, useNavigate } from "react-router-dom";
import { MODULES } from "../../lib/modules";
import {
  ShoppingBasket, Utensils, ShoppingBag, Truck, Car, Home as HomeIcon,
  LayoutDashboard, Store, Package, ClipboardList, Users, Bike, DollarSign,
  Sparkles, BarChart3, Megaphone, LifeBuoy, Settings2, ArrowLeft, Boxes, Tag,
  Activity,
} from "lucide-react";

const MODULE_ICON = { mart: ShoppingBasket, food: Utensils, shop: ShoppingBag, express: Truck, auto: Car, immo: HomeIcon };

// Per PRD §7 — sub-nav for each Business Module admin workspace
const MODULE_NAV = [
  { seg: "", exact: true, label: "Overview", icon: LayoutDashboard },
  { seg: "vendors", label: "Vendors", icon: Store, note: "Partner stores" },
  { seg: "products", label: "Catalogue", icon: Package, martOnly: true },
  { seg: "inventory", label: "Inventory", icon: Boxes, comingSoon: true },
  { seg: "orders", label: "Orders", icon: ClipboardList },
  { seg: "bookings", label: "Bookings", icon: Activity, expressOnly: true },
  { seg: "customers", label: "Customers", icon: Users, note: "Module-scoped" },
  { seg: "drivers", label: "Drivers", icon: Bike },
  { seg: "pricing", label: "Pricing", icon: Tag, expressOnly: true },
  { seg: "finance", label: "Finance", icon: DollarSign, comingSoon: true },
  { seg: "ai", label: "AI Operations", icon: Sparkles, comingSoon: true },
  { seg: "analytics", label: "Analytics", icon: BarChart3, comingSoon: true },
  { seg: "promotions", label: "Promotions", icon: Megaphone, comingSoon: true },
  { seg: "support", label: "Support", icon: LifeBuoy, comingSoon: true },
  { seg: "settings", label: "Settings", icon: Settings2, comingSoon: true },
];

export const ModuleWorkspace = () => {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const meta = MODULES.find((m) => m.code === code);
  const Icon = MODULE_ICON[code] || ShoppingBasket;

  if (!meta) return <div className="text-sm text-muted-foreground">Unknown module</div>;

  const base = `/admin/modules/${code}`;
  const active = (seg, exact) => {
    const path = seg ? `${base}/${seg}` : base;
    return exact ? location.pathname === path : location.pathname.startsWith(path);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button data-testid="module-back" onClick={() => navigate("/admin")} className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary hover:bg-secondary/70 text-muted-foreground hover:text-foreground motion-fast" title="Back to Super Admin"><ArrowLeft size={16} /></button>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}><Icon size={26} /></div>
        <div className="flex-1">
          <div className="text-2xl font-bold">{meta.label}<span className="text-muted-foreground font-normal">bakēd</span></div>
          <div className="text-sm text-muted-foreground">{meta.tagline} · Module workspace</div>
        </div>
        <span className="text-[11px] baked-chip px-3 py-1 font-semibold" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>{meta.status === "active" ? "ACTIVE" : "COMING SOON"}</span>
      </div>

      {/* Sub-nav */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max pb-2">
          {MODULE_NAV.filter((n) => (!n.martOnly || code === "mart") && (!n.expressOnly || code === "express")).map((n) => {
            const path = n.seg ? `${base}/${n.seg}` : base;
            const isAct = active(n.seg, n.exact);
            const IconEl = n.icon;
            return (
              <NavLink key={n.seg || "overview"} to={path} end={!!n.exact}
                data-testid={`module-tab-${n.seg || "overview"}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium motion-fast whitespace-nowrap ${isAct ? "text-white" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                style={isAct ? { backgroundColor: meta.color, color: "#0a1200" } : {}}>
                <IconEl size={14} /> {n.label}
                {n.comingSoon && <span className="text-[9px] uppercase tracking-wider opacity-60">soon</span>}
              </NavLink>
            );
          })}
        </div>
      </div>

      <Outlet context={{ meta, code }} />
    </div>
  );
};
