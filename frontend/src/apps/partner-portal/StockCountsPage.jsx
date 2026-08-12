/**
 * Partner Portal — Cycle Counts / Stock Counts.
 *
 * Draft → Counting → Reconciling → Completed.
 * Recording variances then applying them corrects PartnerInventory.available_qty
 * and writes `stock_count` movements. Never-negative respected.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusCircle, ClipboardCheck, X, Package, Save, AlertTriangle } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};
const STATUS_META = {
  draft:       { label: "Draft",       color: "#8b8b8b" },
  counting:    { label: "Counting",    color: "#FCC44C" },
  reconciling: { label: "Reconciling", color: "#1D9BF0" },
  completed:   { label: "Completed",   color: "#77BC1F" },
  cancelled:   { label: "Cancelled",   color: "#FF4C52" },
};

/* -------------------- Count detail drawer -------------------- */

const CountDrawer = ({ id, onClose, onRefresh }) => {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({}); // line_id → counted_qty

  const load = async () => {
    const { data } = await partnerApi.get(`/partner/inventory/counts/${id}`);
    setC(data);
    const initial = {};
    data.lines.forEach(l => { initial[l.id] = l.counted_qty; });
    setEdits(initial);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const record = async () => {
    if (!c) return;
    setBusy(true);
    try {
      await partnerApi.post(`/partner/inventory/counts/${id}/record`, {
        lines: c.lines.map(l => ({ line_id: l.id, counted_qty: Number(edits[l.id] ?? l.counted_qty) })),
      });
      toast.success("Counts recorded");
      await load(); onRefresh();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!window.confirm("Apply variances and correct inventory? This creates stock-count movements.")) return;
    setBusy(true);
    try {
      await partnerApi.post(`/partner/inventory/counts/${id}/apply`);
      toast.success("Inventory corrected");
      onRefresh(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this stock count?")) return;
    setBusy(true);
    try { await partnerApi.post(`/partner/inventory/counts/${id}/cancel`); toast.success("Cancelled"); onRefresh(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (!c) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"><div className="text-white text-sm">Loading…</div></div>;

  const meta = STATUS_META[c.status];
  const canEdit = c.status === "counting";
  const canApply = c.status === "reconciling";
  const variancesTotal = c.lines.reduce((a, l) => a + Math.abs(l.variance), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.8)" }} data-testid="count-drawer">
      <div className="w-full max-w-4xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
           style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="ph-eyebrow">Stock count</div>
            <div className="text-lg font-semibold" style={{ color: "var(--ph-fg)" }}>{c.code}</div>
            <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Scope: {c.scope} · {new Date(c.created_at).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="baked-chip px-2 py-1 text-[10px] uppercase rounded"
                  style={{ background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
            <button onClick={onClose}><X size={16} style={{ color: "var(--ph-fg-muted)" }} /></button>
          </div>
        </div>

        {variancesTotal > 0 && (
          <div className="mb-3 p-3 rounded-lg" style={{ background: "rgba(252,196,76,.1)", border: "1px solid rgba(252,196,76,.3)" }}>
            <AlertTriangle size={14} className="inline mr-2" style={{ color: "#FCC44C" }} />
            <span className="text-xs" style={{ color: "var(--ph-fg)" }}>
              <b>{variancesTotal}</b> unit(s) of variance across {c.lines.filter(l => l.variance !== 0).length} SKU(s).
              Applying corrects inventory to counted values.
            </span>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}><tr>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Expected</th>
            <th className="text-right py-2">Counted</th>
            <th className="text-right py-2">Variance</th>
          </tr></thead>
          <tbody>
            {c.lines.map(l => {
              const val = edits[l.id] ?? l.counted_qty;
              const variance = Number(val) - l.expected_qty;
              return (
                <tr key={l.id} style={{ borderTop: "1px solid var(--ph-border)" }} data-testid={`count-line-${l.id}`}>
                  <td className="py-2" style={{ color: "var(--ph-fg)" }}>{l.product?.name || l.partner_product_id}</td>
                  <td className="py-2 text-right font-mono">{l.expected_qty}</td>
                  <td className="py-2 text-right">
                    {canEdit
                      ? <input type="number" min="0" value={val} onChange={e => setEdits({ ...edits, [l.id]: e.target.value })}
                               className="w-20 px-2 py-1 rounded text-right text-sm font-mono" style={fieldStyle} />
                      : <span className="font-mono">{l.counted_qty}</span>}
                  </td>
                  <td className="py-2 text-right font-mono" style={{ color: variance === 0 ? "var(--ph-fg-subtle)" : variance > 0 ? "#77BC1F" : "#FF4C52" }}>
                    {variance > 0 ? "+" : ""}{variance}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end gap-2 mt-4">
          {["counting", "reconciling"].includes(c.status) && (
            <button disabled={busy} onClick={cancel} className="px-4 h-10 rounded-lg text-sm" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}>Cancel</button>
          )}
          {canEdit && (
            <button disabled={busy} onClick={record} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "#1D9BF0", color: "#0a1200" }} data-testid="count-record">
              <Save size={14} className="inline mr-1" /> Save counts
            </button>
          )}
          {canApply && (
            <button disabled={busy} onClick={apply} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="count-apply">
              <ClipboardCheck size={14} className="inline mr-1" /> Apply corrections
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------- Main page -------------------- */

export const StockCountsPage = () => {
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const { data } = await partnerApi.get("/partner/inventory/counts");
    setItems(data.items || []); setBuckets(data.buckets || {});
  };
  useEffect(() => { load(); }, []);

  const createFull = async () => {
    if (!window.confirm("Start a full stock count of every SKU in this warehouse?")) return;
    setBusy(true);
    try {
      const { data } = await partnerApi.post("/partner/inventory/counts", { scope: "full", notes: null });
      toast.success(`Count ${data.code} started with ${data.lines.length} lines`);
      setOpenId(data.id); load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="portal-counts-page">
      <div className="ph-eyebrow">Warehouse operations</div>
      <div className="flex items-center justify-between">
        <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Stock counts</h1>
        <button disabled={busy} onClick={createFull} className="px-4 h-10 rounded-lg text-sm font-medium"
                style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="count-new-full">
          <PlusCircle size={14} className="inline mr-1" /> Start full count
        </button>
      </div>
      <p className="ph-body mt-2 max-w-2xl">
        Reconcile physical stock with the system. Enter what you counted; the app calculates variances and creates stock-count movements when you apply.
      </p>

      <div className="mt-6 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {items.length === 0
          ? <div className="p-10 text-center">
              <Package size={32} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>No stock counts yet.</p>
            </div>
          : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase" style={{ color: "var(--ph-fg-subtle)", background: "var(--ph-bg-elevated)" }}>
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Scope</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--ph-border)" }} data-testid={`count-row-${c.code}`}>
                    <td className="p-3 font-mono" style={{ color: "var(--ph-fg)" }}>{c.code}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{c.scope}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{new Date(c.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <span className="baked-chip px-2 py-0.5 text-[10px] uppercase rounded"
                            style={{ background: `${STATUS_META[c.status]?.color || "#888"}22`, color: STATUS_META[c.status]?.color || "#888" }}>
                        {STATUS_META[c.status]?.label || c.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => setOpenId(c.id)} className="text-xs px-3 h-8 rounded-lg" style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }} data-testid={`count-open-${c.code}`}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {openId && <CountDrawer id={openId} onClose={() => setOpenId(null)} onRefresh={load} />}
    </div>
  );
};

export default StockCountsPage;
