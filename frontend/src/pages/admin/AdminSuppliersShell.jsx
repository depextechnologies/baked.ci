/**
 * Super Admin — Suppliers tab shell.
 * Renders sub-tabs for "Applications" (onboarding review) and "Product Requests"
 * (SKU proposals). URL uses ?tab=applications | product-requests.
 */
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Package } from "lucide-react";
import { AdminSupplierApplications } from "./AdminSupplierApplications";
import { AdminSupplierProductRequests } from "./AdminSupplierProductRequests";

const TABS = [
  { code: "applications",     label: "Applications",     icon: Building2, note: "Onboarding review" },
  { code: "product-requests", label: "Product Requests", icon: Package,   note: "New SKU proposals" },
];

export const AdminSuppliersShell = () => {
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
        <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Building2 size={18} /> Suppliers</h2>
        <p className="text-xs text-muted-foreground">Governance for supplier applications and their proposed products.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-2" data-testid="admin-suppliers-tabs">
        {TABS.map((t) => {
          const on = tab === t.code;
          const Icon = t.icon;
          return (
            <button key={t.code} onClick={() => setTab(t.code)} data-testid={`admin-suppliers-tab-${t.code}`}
              className="px-4 h-10 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{
                background: on ? "rgba(119,188,31,.15)" : "transparent",
                color: on ? "#77BC1F" : "var(--muted-foreground)",
                border: `1px solid ${on ? "#77BC1F" : "var(--border)"}`,
              }}>
              <Icon size={14} /> {t.label}
              <span className="text-[10px] opacity-70">· {t.note}</span>
            </button>
          );
        })}
      </div>
      {tab === "product-requests" ? <AdminSupplierProductRequests /> : <AdminSupplierApplications embedded />}
    </div>
  );
};

export default AdminSuppliersShell;
