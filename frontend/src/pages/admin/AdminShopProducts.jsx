/**
 * Super Admin — SHOPbakēd Products Browser.
 *
 * Route: /admin/modules/shop/products
 *
 * Read-only list of every SHOP product with filters (country, status,
 * supplier). Approvals live in a separate page (`AdminShopProductApprovals`)
 * so this view is purely for governance/reporting. Links back to the seller
 * portal for edits (sellers are the source of truth for SHOP catalogue).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Search, ExternalLink, Filter, ShoppingBag } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const SHOP_ACCENT = "#FCC44C";

const STATUS_META = {
  draft:          { label: "Draft",     color: "#6B7280" },
  pending_review: { label: "Pending",   color: "#3B82F6" },
  active:         { label: "Active",    color: "#77BC1F" },
  rejected:       { label: "Rejected",  color: "#FF4C52" },
  archived:       { label: "Archived",  color: "#8B5CF6" },
};

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminShopProducts = () => {
  const [country, setCountry] = useState("CI");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get("/admin/modules/shop/products", {
        params: { country, status: status || undefined, limit: 200 },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [country, status]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((i) => i.title?.toLowerCase().includes(s) || i.id?.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div className="space-y-5" data-testid="admin-shop-products">
      <div>
        <div className="text-xs uppercase tracking-widest" style={{ color: SHOP_ACCENT }}>SHOPbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Package size={18} /> Products</h2>
        <p className="text-xs text-muted-foreground">Every SHOP product across all sellers. Sellers manage the source data — this view is for governance and reporting.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <Filter size={12} /> Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            data-testid="shop-products-country"
            className="h-9 px-2 rounded-lg bg-secondary border border-border text-xs">
            <option value="CI">CI</option>
            <option value="IN">IN</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            data-testid="shop-products-status"
            className="h-9 px-2 rounded-lg bg-secondary border border-border text-xs">
            <option value="">All</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or id…"
            data-testid="shop-products-search"
            className="h-9 pl-9 pr-3 w-72 rounded-lg bg-secondary border border-border text-xs" />
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-products-table">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {busy && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>
            )}
            {!busy && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                <ShoppingBag size={22} className="mx-auto mb-2 opacity-50" />
                No SHOP products match the current filters.
              </td></tr>
            )}
            {!busy && filtered.map((p) => {
              const meta = STATUS_META[p.status] || { label: p.status, color: "#6B7280" };
              return (
                <tr key={p.id} className="border-t border-border" data-testid={`shop-product-row-${p.id}`}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-foreground">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{p.id}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.supplier_id || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.country}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-1 rounded"
                      style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/shop/p/${p.id}`} target="_blank" rel="noreferrer"
                       data-testid={`shop-product-view-${p.id}`}
                       className="text-xs inline-flex items-center gap-1 hover:underline"
                       style={{ color: SHOP_ACCENT }}>
                      View storefront <ExternalLink size={11} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!busy && (
        <div className="text-[11px] text-muted-foreground">Showing {filtered.length} of {items.length} SHOP products.</div>
      )}
    </div>
  );
};

export default AdminShopProducts;
