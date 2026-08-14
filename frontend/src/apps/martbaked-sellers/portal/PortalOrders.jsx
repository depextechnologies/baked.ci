/**
 * Supplier Portal — Orders page.
 * Lists POs sent by MARTbakēd store partners. Supplier can:
 *   * Acknowledge (submitted → acknowledged)
 *   * Mark shipped (acknowledged → shipped)
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag, Send, CheckCircle2, Truck, PackageOpen, Check, XCircle,
  Clock, ChevronLeft, X, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";
import { GrnDownloadModal } from "../../../components/purchase-orders/GrnDownloadModal";

const BUCKETS = [
  { code: "submitted",          label: "New orders", color: "#3B82F6", icon: Send },
  { code: "acknowledged",       label: "Confirmed",  color: "#8B5CF6", icon: CheckCircle2 },
  { code: "shipped",            label: "Shipped",    color: "#FCC44C", icon: Truck },
  { code: "partially_received", label: "Partial",    color: "#F97316", icon: PackageOpen },
  { code: "received",           label: "Received",   color: "#77BC1F", icon: Check },
  { code: "cancelled",          label: "Cancelled",  color: "#FF4C52", icon: XCircle },
];

export const PortalOrders = () => {
  const [status, setStatus] = useState("submitted");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await portalApi.get("/supplier/me/purchase-orders", { params: { status } });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  if (openId) return <SupplierPODetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div className="space-y-6" data-testid="portal-orders">
      <div>
        <div className="pl-eyebrow mb-2">Orders</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Purchase orders from MARTbakēd</h1>
        <p className="pl-body mt-2">Confirm new orders and mark them shipped when goods leave your warehouse. Store partners will record receipts on their end.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          const Icon = b.icon;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)} data-testid={`sp-po-bucket-${b.code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--pl-fg-muted)",
                border: `1px solid ${on ? b.color : "var(--pl-border-strong)"}`,
              }}>
              <Icon size={12} /> {b.label} <span className="opacity-75">({buckets[b.code] || 0})</span>
            </button>
          );
        })}
      </div>

      <div className="pl-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>PO code</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Buyer</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Warehouse</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Total</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Received</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}></th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--pl-fg-muted)" }}>Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--pl-fg-muted)" }} data-testid="sp-po-empty">
                No {BUCKETS.find((b) => b.code === status)?.label.toLowerCase()} orders.
              </td></tr>
            )}
            {items.map((po) => (
              <tr key={po.id} style={{ borderBottom: "1px solid var(--pl-border)" }} data-testid={`sp-po-row-${po.po_code}`}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--pl-fg)" }}>{po.po_code}</td>
                <td className="px-4 py-3" style={{ color: "var(--pl-fg)" }}>{po.partner?.business_name || "—"}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--pl-fg-muted)" }}>{po.warehouse?.code || po.warehouse?.name || "—"}</td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--pl-fg)" }}>{po.grand_total?.toFixed(2)} <span className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{po.currency}</span></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--pl-fg-muted)" }}>{po.submitted_at ? new Date(po.submitted_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setOpenId(po.id)} className="pl-btn pl-btn-primary px-3 h-8 text-xs" data-testid={`sp-po-open-${po.po_code}`}>Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SupplierPODetail = ({ id, onBack }) => {
  const [po, setPo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null); // "ack" | "ship"
  const [notes, setNotes] = useState("");
  const [showGrn, setShowGrn] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await portalApi.get(`/supplier/me/purchase-orders/${id}`); setPo(data); }
    catch (e) { toast.error(errMsg(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!po) return <div className="text-sm p-8" style={{ color: "var(--pl-fg-muted)" }}>Loading…</div>;

  const meta = BUCKETS.find((b) => b.code === po.status) || BUCKETS[0];
  const StatIcon = meta.icon;
  const canAck = po.status === "submitted";
  const canShip = po.status === "acknowledged";

  const doAction = async () => {
    setBusy(true);
    try {
      const path = action === "ack" ? "acknowledge" : "ship";
      await portalApi.post(`/supplier/me/purchase-orders/${po.id}/${path}`, { notes: notes || null });
      toast.success(action === "ack" ? "Order acknowledged" : "Marked shipped");
      setAction(null); setNotes(""); load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="sp-po-detail">
      <button onClick={onBack} className="text-xs flex items-center gap-1" style={{ color: "var(--pl-fg-muted)" }} data-testid="sp-po-back"><ChevronLeft size={12} /> Back to orders</button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="pl-eyebrow mb-1">Order</div>
          <h1 className="pl-h1 font-mono" style={{ color: "var(--pl-fg)" }}>{po.po_code}</h1>
          <div className="text-sm mt-1" style={{ color: "var(--pl-fg-muted)" }}>
            <strong style={{ color: "var(--pl-fg)" }}>{po.partner?.business_name}</strong> · {po.warehouse?.code || po.warehouse?.name}
            {po.submitted_at && ` · submitted ${new Date(po.submitted_at).toLocaleDateString()}`}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-3 py-2 rounded"
          style={{ background: `${meta.color}22`, color: meta.color }} data-testid={`sp-po-status-${po.status}`}>
          <StatIcon size={12} /> {meta.label}
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <PortalStat label="Lines" value={po.lines.length} />
        <PortalStat label="Total" value={`${po.grand_total?.toFixed(2)} ${po.currency}`} highlight />
        <PortalStat label="Expected delivery" value={po.expected_delivery_date || "—"} />
      </div>

      {po.notes && (
        <div className="pl-card p-4" data-testid="sp-po-notes">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Buyer notes</div>
          <div className="text-sm mt-1" style={{ color: "var(--pl-fg)" }}>{po.notes}</div>
        </div>
      )}

      <div className="pl-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Product</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Qty</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Received</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Unit cost</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--pl-border)" }} data-testid={`sp-po-line-${l.id}`}>
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: "var(--pl-fg)" }}>{l.product_name}</div>
                  {l.supplier_sku && <div className="text-[10px] font-mono" style={{ color: "var(--pl-fg-muted)" }}>{l.supplier_sku}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--pl-fg)" }}>{l.qty_ordered}</td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: l.qty_received > 0 ? "#77BC1F" : "var(--pl-fg-muted)" }}>{l.qty_received}</td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--pl-fg)" }}>{Number(l.unit_cost).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--pl-fg)" }}>{Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {canAck && <button onClick={() => setAction("ack")} className="pl-btn pl-btn-primary" data-testid="sp-po-btn-ack"><CheckCircle2 size={14} /> Acknowledge</button>}
        {canShip && <button onClick={() => setAction("ship")} className="pl-btn pl-btn-primary" data-testid="sp-po-btn-ship"><Truck size={14} /> Mark shipped</button>}
        {["partially_received", "received"].includes(po.status) && (
          <button onClick={() => setShowGrn(true)} className="pl-btn pl-btn-ghost" data-testid="sp-po-btn-grn">
            <FileText size={14} /> Download GRN
          </button>
        )}
      </div>

      {action && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setAction(null)}>
          <div className="pl-card p-6 w-full max-w-md" data-testid={`sp-po-${action}-drawer`}>
            <div className="flex items-center gap-2 pl-h3" style={{ color: "var(--pl-fg)" }}>
              {action === "ack" ? <><CheckCircle2 size={18} /> Acknowledge order</> : <><Truck size={18} /> Mark shipped</>}
            </div>
            <p className="pl-body mt-2">
              {action === "ack"
                ? "Confirm to the buyer that you can fulfil this PO. It moves to Acknowledged."
                : "Confirm the goods have left your warehouse. The buyer will start expecting the delivery."}
            </p>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the buyer…"
              className="w-full mt-3 px-4 py-3 rounded-xl text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid={`sp-po-${action}-notes`} />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAction(null)} className="pl-btn pl-btn-ghost" data-testid={`sp-po-${action}-cancel`}>Cancel</button>
              <button onClick={doAction} disabled={busy} className="pl-btn pl-btn-primary" data-testid={`sp-po-${action}-confirm`}>
                {busy ? "Sending…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGrn && (
        <GrnDownloadModal
          poCode={po.po_code}
          basePath={`/supplier/me/purchase-orders/${po.id}`}
          apiClient={portalApi}
          onClose={() => setShowGrn(false)}
          variant="supplier"
        />
      )}
    </div>
  );
};

const PortalStat = ({ label, value, highlight }) => (
  <div className="pl-card p-4">
    <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>{label}</div>
    <div className={`text-sm mt-1 ${highlight ? "font-bold" : ""} font-mono`} style={{ color: highlight ? "var(--pl-accent)" : "var(--pl-fg)" }}>{value}</div>
  </div>
);

export default PortalOrders;
