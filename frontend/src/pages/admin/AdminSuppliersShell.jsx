/**
 * Super Admin — Suppliers tab shell.
 * Renders sub-tabs for "Applications" (onboarding review) and "Product Requests"
 * (SKU proposals). URL uses ?tab=applications | product-requests.
 *
 * Module-aware: mounted under `/admin/modules/:code/suppliers` — reads the
 * module code from the workspace outlet context so MART and SHOP each get
 * their own filtered queue. Product Requests is MART-only for now (SHOP uses
 * a different catalogue model — Phase 2 will add a SHOP-native flow).
 */
import React from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { Building2, Package } from "lucide-react";
import { AdminSupplierApplications } from "./AdminSupplierApplications";
import { AdminSupplierProductRequests } from "./AdminSupplierProductRequests";

const TABS = [
  { code: "applications",     label: "Applications",     icon: Building2, note: "Onboarding review" },
  { code: "product-requests", label: "Product Requests", icon: Package,   note: "New SKU proposals", martOnly: true },
];

export const AdminSuppliersShell = () => {
  const ctx = useOutletContext() || {};
  const code = ctx.code || "mart";
  const module = code === "shop" ? "shop" : "mart";
  const MOD_LABEL = module === "shop" ? "SHOPbakēd" : "MARTbakēd";
  const MOD_ACCENT = module === "shop" ? "#FCC44C" : "#77BC1F";

  const visibleTabs = TABS.filter((t) => !t.martOnly || module === "mart");
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "applications";
  const setTab = (t) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-5" data-testid="admin-suppliers-shell">
      <div>
        <div className="text-xs uppercase tracking-widest" style={{ color: MOD_ACCENT }}>{MOD_LABEL}</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Building2 size={18} /> Suppliers</h2>
        <p className="text-xs text-muted-foreground">Governance for supplier applications{module === "mart" ? " and their proposed products" : ""}.</p>
      </div>
      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border pb-2" data-testid="admin-suppliers-tabs">
          {visibleTabs.map((t) => {
            const on = tab === t.code;
            const Icon = t.icon;
            return (
              <button key={t.code} onClick={() => setTab(t.code)} data-testid={`admin-suppliers-tab-${t.code}`}
                className="px-4 h-10 rounded-lg text-sm font-medium flex items-center gap-2"
                style={{
                  background: on ? `${MOD_ACCENT}22` : "transparent",
                  color: on ? MOD_ACCENT : "var(--muted-foreground)",
                  border: `1px solid ${on ? MOD_ACCENT : "var(--border)"}`,
                }}>
                <Icon size={14} /> {t.label}
                <span className="text-[10px] opacity-70">· {t.note}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "product-requests" && module === "mart"
        ? <AdminSupplierProductRequests />
        : <AdminSupplierApplications embedded module={module} />}
    </div>
  );
};

export default AdminSuppliersShell;
