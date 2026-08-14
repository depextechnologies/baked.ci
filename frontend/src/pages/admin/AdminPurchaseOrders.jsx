/**
 * Super Admin — cross-network Purchase Orders dashboard (Phase 3, Cycle 3).
 *
 * Read-only view across ALL partners and suppliers with:
 *   * Status bucket tabs (draft → received / cancelled)
 *   * PO code search + country (ISO-2) filter
 *   * Detail drawer with lines + audit trail
 *   * Emergency SA "Override cancel" action
 *
 * Backed by /api/admin/modules/mart/purchase-orders (routes already exist).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Package, Search, ChevronLeft, ClipboardCheck, Send, CheckCircle2, Truck,
  PackageOpen, Check, XCircle, Ban, ShieldCheck, Clock, Building2, Store,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../../contexts/AdminContext";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

const BUCKETS = [
  { code: "",                   label: "All",       color: "#94A3B8", icon: Package },
  { code: "draft",              label: "Draft",     color: "#94A3B8", icon: ClipboardCheck },
  { code: "submitted",          label: "Submitted", color: "#3B82F6", icon: Send },
  { code: "acknowledged",       label: "Ack'd",     color: "#8B5CF6", icon: CheckCircle2 },
  { code: "shipped",            label: "Shipped",   color: "#FCC44C", icon: Truck },
  { code: "partially_received", label: "Partial",   color: "#F97316", icon: PackageOpen },
  { code: "received",           label: "Received",  color: "#77BC1F", icon: Check },
  { code: "cancelled",          label: "Cancelled", color: "#FF4C52", icon: XCircle },
];

const inputCls = "w-full px-3 h-10 rounded-lg text-sm bg-secondary border border-border";

export const AdminPurchaseOrders = () => {
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/purchase-orders`, {
        params: {
          status: status || undefined,
          country: country || undefined,
          q: q || undefined,
        },
      });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status, country, q]);
  useEffect(() => { load(); }, [status, country, load]);

  if (openId) return <AdminPODetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  const totalCount = Object.values(buckets).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5" data-testid="admin-po-page">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Package size={18} /> Purchase Orders</h2>
        <p className="text-xs text-muted-foreground">
          Cross-network visibility of every PO raised by partner stores against approved suppliers.
          Use override-cancel only in emergencies (fraud, mis-issued PO, dispute freeze).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          const Icon = b.icon;
          const count = b.code ? (buckets[b.code] || 0) : totalCount;
          return (
            <button key={b.code || "all"} onClick={() => setStatus(b.code)}
              data-testid={`admin-po-bucket-${b.code || "all"}`}
              className="px-3 h-9 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--muted-foreground)",
                border: `1px solid ${on ? b.color : "var(--border)"}`,
              }}>
              <Icon size={12} /> {b.label} <span className="opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 min-w-[220px] px-3 h-10 rounded-lg bg-secondary border border-border">
          <Search size={12} className="text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search PO code…" className="flex-1 bg-transparent outline-none text-sm"
            data-testid="admin-po-search" />
        </div>
        <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Country ISO (e.g. NG)" className="w-44 px-3 h-10 rounded-lg text-sm bg-secondary border border-border"
          data-testid="admin-po-country" />
        <button onClick={load} className="baked-btn baked-btn-primary h-10" data-testid="admin-po-apply">
          Apply filters
        </button>
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">PO code</th>
              <th className="text-left p-3">Partner</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-left p-3">Warehouse</th>
              <th className="text-right p-3">Total</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground" data-testid="admin-po-empty">
                No purchase orders match the current filters.
              </td></tr>
            )}
            {items.map((po) => {
              const m = BUCKETS.find((b) => b.code === po.status) || BUCKETS[0];
              return (
                <tr key={po.id} className="border-t border-border" data-testid={`admin-po-row-${po.po_code}`}>
                  <td className="p-3 font-mono text-xs">{po.po_code}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1"><Store size={12} className="text-muted-foreground" /><span className="font-medium">{po.partner?.business_name || "—"}</span></div>
                    <div className="text-[10px] font-mono text-muted-foreground">{po.partner?.code || ""}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1"><Building2 size={12} className="text-muted-foreground" /><span className="font-medium">{po.supplier?.business_name || "—"}</span></div>
                    <div className="text-[10px] font-mono text-muted-foreground">{po.supplier?.code || ""}</div>
                  </td>
                  <td className="p-3 text-xs">{po.warehouse?.code || po.warehouse?.name || "—"}</td>
                  <td className="p-3 text-right font-mono">{po.grand_total?.toFixed(2)} <span className="text-xs text-muted-foreground">{po.currency}</span></td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${m.color}22`, color: m.color }}>{m.label}</span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{po.created_at ? new Date(po.created_at).toLocaleDateString() : "—"}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setOpenId(po.id)}
                      className="text-xs px-3 h-8 rounded-lg font-medium bg-primary text-primary-foreground"
                      data-testid={`admin-po-open-${po.po_code}`}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             AdminPODetail                                   */
/* -------------------------------------------------------------------------- */

const AdminPODetail = ({ id, onBack }) => {
  const [po, setPo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/purchase-orders/${id}`);
      setPo(data);
    } catch (e) { toast.error(errMsg(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!po) return <div className="text-sm text-muted-foreground p-8">Loading…</div>;

  const meta = BUCKETS.find((b) => b.code === po.status) || BUCKETS[0];
  const StatIcon = meta.icon;
  const canOverride = !["cancelled", "received"].includes(po.status);

  const doOverride = async () => {
    if (!reason.trim()) return toast.error("Override reason is required.");
    setBusy(true);
    try {
      await adminApi.post(`/admin/modules/mart/purchase-orders/${po.id}/override-cancel`, { reason });
      toast.success("PO override-cancelled");
      setShowOverride(false); setReason(""); load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="admin-po-detail">
      <button onClick={onBack} className="text-xs flex items-center gap-1 text-muted-foreground" data-testid="admin-po-back">
        <ChevronLeft size={12} /> Back to all POs
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Purchase order</div>
          <h2 className="text-xl font-bold font-mono">{po.po_code}</h2>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">{po.partner?.business_name}</span> ↔ <span className="font-medium">{po.supplier?.business_name}</span>
            {" · "}{po.warehouse?.code || po.warehouse?.name} · created {new Date(po.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-3 py-2 rounded"
          style={{ background: `${meta.color}22`, color: meta.color }} data-testid={`admin-po-status-${po.status}`}>
          <StatIcon size={12} /> {meta.label}
        </span>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <AdminStat label="Lines" value={po.lines.length} />
        <AdminStat label="Subtotal" value={`${po.subtotal?.toFixed(2)} ${po.currency}`} />
        <AdminStat label="Tax" value={`${po.tax_total?.toFixed(2)} ${po.currency}`} />
        <AdminStat label="Total" value={`${po.grand_total?.toFixed(2)} ${po.currency}`} highlight />
      </div>

      {po.status === "cancelled" && po.cancellation_reason && (
        <div className="p-3 rounded-lg" style={{ background: "rgba(255,76,82,.10)", color: "#FF4C52" }} data-testid="admin-po-cancelled-banner">
          <strong>Cancelled:</strong> {po.cancellation_reason}
        </div>
      )}

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Product</th>
              <th className="text-right p-3">Ordered</th>
              <th className="text-right p-3">Received</th>
              <th className="text-right p-3">Unit cost</th>
              <th className="text-right p-3">Tax %</th>
              <th className="text-right p-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id} className="border-t border-border" data-testid={`admin-po-line-${l.id}`}>
                <td className="p-3">
                  <div className="font-medium leading-snug">{l.product_name}</div>
                  {l.supplier_sku && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{l.supplier_sku}</div>}
                </td>
                <td className="p-3 text-right font-mono">{l.qty_ordered}</td>
                <td className="p-3 text-right font-mono">{l.qty_received}</td>
                <td className="p-3 text-right font-mono">{Number(l.unit_cost).toFixed(2)}</td>
                <td className="p-3 text-right">{Number(l.tax_pct).toFixed(2)}%</td>
                <td className="p-3 text-right font-mono">{Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canOverride && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowOverride(true)} className="baked-btn baked-btn-ghost" style={{ color: "#FF4C52" }} data-testid="admin-po-override-btn">
            <Ban size={14} /> Override-cancel PO
          </button>
        </div>
      )}

      <div className="baked-card bg-card border border-border p-4" data-testid="admin-po-audit-trail">
        <div className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground flex items-center gap-2">
          <ShieldCheck size={12} /> Audit trail
        </div>
        {(po.audit_trail || []).map((a) => (
          <div key={a.id} className="text-xs py-1 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-muted-foreground min-w-[140px] flex items-center gap-1"><Clock size={10} />{new Date(a.created_at).toLocaleString()}</span>
            <span className="font-semibold uppercase text-primary">{a.action}</span>
            {a.from_status && <span className="text-muted-foreground">{a.from_status} → {a.to_status}</span>}
            {a.actor_label && <span className="text-muted-foreground">· {a.actor_label}</span>}
            {a.notes && <span className="text-muted-foreground italic truncate">— {a.notes}</span>}
          </div>
        ))}
        {(!po.audit_trail || po.audit_trail.length === 0) && (
          <div className="text-xs text-muted-foreground">No audit events yet.</div>
        )}
      </div>

      {showOverride && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowOverride(false)}>
          <div className="baked-card bg-card border border-border p-6 max-w-md w-full" data-testid="admin-po-override-modal">
            <div className="text-lg font-bold flex items-center gap-2"><Ban size={16} /> Override-cancel PO</div>
            <p className="text-sm text-muted-foreground mt-2">
              This forcibly cancels <span className="font-mono">{po.po_code}</span> regardless of the current
              status. Use only for fraud, dispute freeze, or a mis-issued PO. The action is written to the audit trail.
            </p>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)…"
              className={inputCls + " mt-3 h-auto py-2"} data-testid="admin-po-override-reason" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowOverride(false)} className="baked-btn baked-btn-ghost" data-testid="admin-po-override-abort">Never mind</button>
              <button onClick={doOverride} disabled={busy} className="baked-btn baked-btn-primary" style={{ background: "#FF4C52" }} data-testid="admin-po-override-confirm">
                {busy ? "Cancelling…" : "Confirm override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminStat = ({ label, value, highlight }) => (
  <div className="rounded-lg border border-border p-3 bg-secondary/20">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`text-sm font-mono ${highlight ? "font-bold text-primary" : ""}`}>{value}</div>
  </div>
);

export default AdminPurchaseOrders;
