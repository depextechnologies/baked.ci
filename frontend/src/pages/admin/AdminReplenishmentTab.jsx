/**
 * Super Admin — Replenishment Suggestions.
 *
 * Actionable restock queue. Auto-generate suggestions from every low/OOS
 * SKU; edit qty inline; one-click Approve → Dispatch → Mark received (which
 * auto-writes a `receive` movement and increments PartnerInventory).
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle2, XCircle, Package, Truck, Boxes, PackageCheck,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const num = (n) => Number(n || 0).toLocaleString();
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const STATUS_META = {
  suggested:  { label: "Suggested",   color: "#FCC44C", icon: Sparkles },
  approved:   { label: "Approved",    color: "#1D9BF0", icon: CheckCircle2 },
  dispatched: { label: "Dispatched",  color: "#7ee6b0", icon: Truck },
  received:   { label: "Received",    color: "#77BC1F", icon: PackageCheck },
  cancelled:  { label: "Cancelled",   color: "#FF4C52", icon: XCircle },
};

const TABS = ["suggested", "approved", "dispatched", "received", "cancelled"];

export const AdminReplenishmentTab = ({ country }) => {
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [status, setStatus] = useState("suggested");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({}); // id → { suggested_qty, approved_qty }

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      params.set("status", status);
      const { data } = await adminApi.get(`/admin/replenishments?${params}`);
      setItems(data.items || []);
      setBuckets(data.buckets || {});
      // Seed edit buffer with current values
      const buf = {};
      (data.items || []).forEach(r => { buf[r.id] = {
        suggested_qty: r.suggested_qty,
        approved_qty: r.approved_qty ?? r.suggested_qty,
      };});
      setEdits(buf);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country, status]);

  const setEdit = (id, k, v) => setEdits({ ...edits, [id]: { ...edits[id], [k]: Number(v) || 0 } });

  const autoGen = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/replenishments/auto-generate", {
        include_out_of_stock: true, multiplier: 3.0,
        ...(country ? { country } : {}),
      });
      toast.success(`Auto-generated ${data.created} suggestion(s) · ${data.skipped} already active`);
      setStatus("suggested"); load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const patch = async (id, body) => {
    try { await adminApi.patch(`/admin/replenishments/${id}`, body); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };

  const transition = async (id, verb, body = {}) => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/replenishments/${id}/${verb}`, body);
      const label = verb === "mark-received" ? "received" : verb;
      toast.success(`Marked ${label}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const approveWithQty = async (r) => {
    const qty = edits[r.id]?.approved_qty ?? r.suggested_qty;
    if (!qty || qty <= 0) return toast.error("Approved qty must be > 0");
    await transition(r.id, "approve", { approved_qty: qty });
  };

  const saveSuggested = async (r) => {
    const qty = edits[r.id]?.suggested_qty ?? r.suggested_qty;
    if (qty === r.suggested_qty) return;
    setBusy(true);
    try { await patch(r.id, { suggested_qty: qty }); toast.success("Updated"); load(); }
    catch { /* toast already fired */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="ct-replen-tab">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Replenishment queue</div>
          <div className="text-xs text-muted-foreground">
            Approve, dispatch and receive restock across every dark store. Received suggestions auto-write a stock movement.
          </div>
        </div>
        <button onClick={autoGen} disabled={busy}
                className="px-3 h-9 rounded-lg text-sm font-medium flex items-center gap-2"
                style={{ background: "#77BC1F", color: "#0a1200" }}
                data-testid="replen-auto-generate">
          <Sparkles size={14} /> Auto-generate from low / OOS
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(s => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          const on = status === s;
          return (
            <button key={s} onClick={() => setStatus(s)} data-testid={`replen-tab-${s}`}
                    className="px-3 h-9 rounded-lg text-xs font-medium flex items-center gap-1.5"
                    style={{
                      background: on ? `${meta.color}22` : "transparent",
                      color:      on ? meta.color : "var(--muted-foreground)",
                      border:     "1px solid " + (on ? meta.color : "var(--border)"),
                    }}>
              <Icon size={12} /> {meta.label} <span className="opacity-75">({buckets[s] || 0})</span>
            </button>
          );
        })}
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Product</th>
            <th className="text-left p-3">Store / Partner</th>
            <th className="text-right p-3">Current</th>
            <th className="text-right p-3">Threshold</th>
            <th className="text-right p-3">Suggested</th>
            {["approved", "dispatched", "received"].includes(status) && <th className="text-right p-3">Approved</th>}
            {status === "received" && <th className="text-right p-3">Received</th>}
            <th className="text-left p-3">Reason</th>
            <th className="p-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              : items.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  No {STATUS_META[status].label.toLowerCase()} replenishments.
                  {status === "suggested" && <div className="mt-2"><button onClick={autoGen} className="underline">Auto-generate now</button> to scan for low/OOS SKUs.</div>}
                </td></tr>
              : items.map(r => (
                <tr key={r.id} className="border-t border-border" data-testid={`replen-row-${r.id}`}>
                  <td className="p-3 flex items-center gap-2">
                    {r.product?.image ? <img src={r.product.image} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center"><Package size={14} /></div>}
                    <div>
                      <div className="font-medium">{r.product?.name || "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.product?.sku_code || "—"}</div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <div className="font-mono">{r.warehouse?.code}</div>
                    <div className="text-[10px] text-muted-foreground">{r.partner?.business_name} · {r.partner?.country}</div>
                  </td>
                  <td className="p-3 text-right font-mono" style={{ color: r.current_qty === 0 ? "#FF4C52" : r.current_qty <= r.low_stock_threshold ? "#FCC44C" : undefined }}>{r.current_qty}</td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">{r.low_stock_threshold}</td>
                  <td className="p-3 text-right">
                    {status === "suggested" ? (
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" min="0" value={edits[r.id]?.suggested_qty ?? r.suggested_qty}
                               onChange={e => setEdit(r.id, "suggested_qty", e.target.value)}
                               onBlur={() => saveSuggested(r)}
                               className="w-20 px-2 py-1 rounded bg-secondary text-right font-mono text-sm"
                               data-testid={`replen-suggested-${r.id}`} />
                      </div>
                    ) : (
                      <span className="font-mono">{r.suggested_qty}</span>
                    )}
                  </td>
                  {["approved", "dispatched", "received"].includes(status) && <td className="p-3 text-right font-mono text-[#1D9BF0]">{r.approved_qty}</td>}
                  {status === "received" && <td className="p-3 text-right font-mono text-[#77BC1F]">{r.received_qty}</td>}
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{r.reason || "—"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {r.status === "suggested" && (
                        <>
                          <button onClick={() => approveWithQty(r)} disabled={busy}
                                  className="text-xs px-2 py-1 rounded font-medium" style={{ background: "#1D9BF0", color: "#0a1200" }}
                                  data-testid={`replen-approve-${r.id}`}>Approve</button>
                          <button onClick={() => transition(r.id, "cancel")} disabled={busy}
                                  className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}
                                  data-testid={`replen-cancel-${r.id}`}>Cancel</button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <>
                          <button onClick={() => transition(r.id, "dispatch")} disabled={busy}
                                  className="text-xs px-2 py-1 rounded" style={{ background: "#7ee6b022", color: "#7ee6b0" }}
                                  data-testid={`replen-dispatch-${r.id}`}><Truck size={11} className="inline mr-1" /> Dispatch</button>
                          <button onClick={() => transition(r.id, "mark-received")} disabled={busy}
                                  className="text-xs px-2 py-1 rounded font-medium" style={{ background: "#77BC1F", color: "#0a1200" }}
                                  data-testid={`replen-receive-${r.id}`}><PackageCheck size={11} className="inline mr-1" /> Received</button>
                          <button onClick={() => transition(r.id, "cancel")} disabled={busy}
                                  className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}>Cancel</button>
                        </>
                      )}
                      {r.status === "dispatched" && (
                        <button onClick={() => transition(r.id, "mark-received")} disabled={busy}
                                className="text-xs px-2 py-1 rounded font-medium" style={{ background: "#77BC1F", color: "#0a1200" }}
                                data-testid={`replen-receive-${r.id}`}><PackageCheck size={11} className="inline mr-1" /> Mark received</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReplenishmentTab;
