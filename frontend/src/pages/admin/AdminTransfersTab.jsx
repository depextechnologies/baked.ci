/**
 * Super Admin — Store Transfers tab.
 *
 * Move stock between two dark stores with a full approval trail.
 * Lifecycle: requested → approved → in_transit → received (or cancelled).
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Truck, ArrowRight, PlusCircle, X, CheckCircle2, XCircle, PackageCheck,
  Package, RefreshCw,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const STATUS_META = {
  requested:  { label: "Requested",  color: "#FCC44C", icon: RefreshCw },
  approved:   { label: "Approved",   color: "#1D9BF0", icon: CheckCircle2 },
  in_transit: { label: "In transit", color: "#7ee6b0", icon: Truck },
  received:   { label: "Received",   color: "#77BC1F", icon: PackageCheck },
  cancelled:  { label: "Cancelled",  color: "#FF4C52", icon: XCircle },
};
const TABS = ["requested", "approved", "in_transit", "received", "cancelled"];

/* --------------------- Create modal --------------------- */

const CreateTransferModal = ({ onClose, onCreated, country }) => {
  const [warehouses, setWarehouses] = useState([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [reason, setReason] = useState("Rebalance");
  const [notes, setNotes] = useState("");
  const [sourceInv, setSourceInv] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState({}); // pp_id -> qty
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.get(`/admin/transfers/lookups/warehouses${country ? `?country=${country}` : ""}`)
      .then(r => setWarehouses(r.data.items || []));
  }, [country]);

  useEffect(() => {
    if (!fromId) { setSourceInv([]); return; }
    adminApi.get(`/admin/transfers/lookups/source-inventory/${fromId}${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then(r => setSourceInv(r.data.items || []));
  }, [fromId, q]);

  const setQty = (id, v) => {
    const n = Number(v) || 0;
    setSelected(prev => { const c = { ...prev }; if (n <= 0) delete c[id]; else c[id] = n; return c; });
  };

  const submit = async () => {
    if (!fromId || !toId) return toast.error("Pick source and destination stores");
    if (fromId === toId) return toast.error("Source and destination must differ");
    const items = Object.entries(selected).map(([id, qty]) => ({ from_partner_product_id: id, quantity: qty }));
    if (items.length === 0) return toast.error("Select at least one product to move");
    setBusy(true);
    try {
      await adminApi.post("/admin/transfers", {
        from_warehouse_id: fromId, to_warehouse_id: toId, reason: reason || null, notes: notes || null, items,
      });
      toast.success("Transfer requested");
      onCreated();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const total = Object.values(selected).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" data-testid="transfer-create-modal"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">New store transfer</div>
            <div className="text-lg font-bold">Move stock between two dark stores</div>
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-muted-foreground">Source store
            <select value={fromId} onChange={e => setFromId(e.target.value)} className="baked-input px-3 py-2 bg-secondary text-sm mt-1 w-full"
                    data-testid="transfer-from-select">
              <option value="">— Pick source —</option>
              {warehouses.map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_code} — {w.partner_name} ({w.city}) · {w.sku_count} SKUs
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Destination store
            <select value={toId} onChange={e => setToId(e.target.value)} className="baked-input px-3 py-2 bg-secondary text-sm mt-1 w-full"
                    data-testid="transfer-to-select">
              <option value="">— Pick destination —</option>
              {warehouses.filter(w => w.warehouse_id !== fromId).map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>
                  {w.warehouse_code} — {w.partner_name} ({w.city})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <input placeholder="Reason (e.g. rebalance, promo, ...)" value={reason} onChange={e => setReason(e.target.value)}
                 className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="transfer-reason" />
          <input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)}
                 className="baked-input px-3 py-2 bg-secondary text-sm" />
        </div>

        {fromId && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Products at source</div>
              <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
                     className="baked-input px-3 py-1.5 bg-secondary text-xs w-64" />
            </div>
            <div className="baked-card bg-card border border-border overflow-hidden mb-4 max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-[10px] uppercase text-muted-foreground sticky top-0"><tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Available</th>
                  <th className="text-right p-2 w-32">Move qty</th>
                </tr></thead>
                <tbody>
                  {sourceInv.length === 0 ? <tr><td colSpan={3} className="p-6 text-center text-muted-foreground text-xs">No stock at source.</td></tr>
                    : sourceInv.map(p => {
                      const cur = selected[p.partner_product_id] || 0;
                      return (
                        <tr key={p.partner_product_id} className="border-t border-border">
                          <td className="p-2 flex items-center gap-2">
                            {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded object-cover" />}
                            <div><div className="text-sm">{p.name}</div><div className="text-[10px] text-muted-foreground">{p.brand} · {p.unit}</div></div>
                          </td>
                          <td className="p-2 text-right font-mono">{p.available_qty}</td>
                          <td className="p-2 text-right">
                            <input type="number" min="0" max={p.available_qty} value={cur || ""}
                                   onChange={e => setQty(p.partner_product_id, Math.min(p.available_qty, Number(e.target.value) || 0))}
                                   className="w-24 px-2 py-1 rounded bg-secondary text-right font-mono text-sm"
                                   placeholder="0"
                                   data-testid={`transfer-qty-${p.partner_product_id}`} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{Object.keys(selected).length} SKU(s) · {total} unit(s) selected</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm text-muted-foreground">Cancel</button>
            <button disabled={busy || total === 0} onClick={submit}
                    className="px-4 h-10 rounded-lg text-sm font-medium"
                    style={{ background: "#77BC1F", color: "#0a1200", opacity: busy || total === 0 ? .5 : 1 }}
                    data-testid="transfer-submit">
              Request transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* --------------------- Detail drawer --------------------- */

const TransferDrawer = ({ id, onClose, onRefresh }) => {
  const [t, setT] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => adminApi.get(`/admin/transfers/${id}`).then(r => setT(r.data));
  useEffect(() => { load(); }, [id]);

  const act = async (verb) => {
    setBusy(true);
    try { await adminApi.post(`/admin/transfers/${id}/${verb}`); toast.success(`Transfer ${verb}d`); load(); onRefresh(); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (!t) return null;
  const meta = STATUS_META[t.status];
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" data-testid="transfer-drawer"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Transfer</div>
            <div className="text-lg font-bold flex items-center gap-2">{t.code} <Icon size={16} style={{ color: meta.color }} /></div>
            <div className="text-xs text-muted-foreground">{t.reason || "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="baked-chip px-2 py-1 text-[10px] uppercase rounded" style={{ background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
            <button onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="baked-card bg-secondary/40 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">From</div>
            <div className="text-sm font-mono">{t.from.warehouse_code}</div>
            <div className="text-xs text-muted-foreground">{t.from.partner_name}</div>
          </div>
          <div className="baked-card bg-secondary/40 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">To</div>
            <div className="text-sm font-mono">{t.to.warehouse_code}</div>
            <div className="text-xs text-muted-foreground">{t.to.partner_name}</div>
          </div>
        </div>

        <table className="w-full text-sm mb-4">
          <thead className="text-[10px] uppercase text-muted-foreground"><tr>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Qty</th>
            <th className="text-right py-2">Dispatched</th>
            <th className="text-right py-2">Received</th>
          </tr></thead>
          <tbody>
            {t.items.map(it => (
              <tr key={it.id} className="border-t border-border">
                <td className="py-2 flex items-center gap-2">
                  {it.from_product?.image && <img src={it.from_product.image} alt="" className="w-8 h-8 rounded object-cover" />}
                  <div><div className="text-sm">{it.from_product?.name}</div><div className="text-[10px] text-muted-foreground">{it.from_product?.brand}</div></div>
                </td>
                <td className="py-2 text-right font-mono">{it.quantity}</td>
                <td className="py-2 text-right font-mono text-blue-400">{it.dispatched_qty}</td>
                <td className="py-2 text-right font-mono text-[#77BC1F]">{it.received_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {t.notes && <pre className="text-xs text-muted-foreground whitespace-pre-wrap mb-4">{t.notes}</pre>}

        <div className="flex justify-end gap-2">
          {t.status === "requested" && <>
            <button disabled={busy} onClick={() => act("cancel")} className="px-3 h-9 rounded-lg text-xs" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="transfer-cancel">Cancel</button>
            <button disabled={busy} onClick={() => act("approve")} className="px-3 h-9 rounded-lg text-xs font-medium" style={{ background: "#1D9BF0", color: "#0a1200" }} data-testid="transfer-approve">Approve</button>
          </>}
          {t.status === "approved" && <>
            <button disabled={busy} onClick={() => act("cancel")} className="px-3 h-9 rounded-lg text-xs" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}>Cancel</button>
            <button disabled={busy} onClick={() => act("dispatch")} className="px-3 h-9 rounded-lg text-xs font-medium" style={{ background: "#7ee6b022", color: "#7ee6b0" }} data-testid="transfer-dispatch">
              <Truck size={12} className="inline mr-1" /> Dispatch
            </button>
          </>}
          {t.status === "in_transit" && <>
            <button disabled={busy} onClick={() => act("cancel")} className="px-3 h-9 rounded-lg text-xs" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}>Cancel & return</button>
            <button disabled={busy} onClick={() => act("receive")} className="px-3 h-9 rounded-lg text-xs font-medium" style={{ background: "#77BC1F", color: "#0a1200" }} data-testid="transfer-receive">
              <PackageCheck size={12} className="inline mr-1" /> Mark received
            </button>
          </>}
        </div>
      </div>
    </div>
  );
};

/* --------------------- Main --------------------- */

export const AdminTransfersTab = ({ country }) => {
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [status, setStatus] = useState("requested");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (status) params.set("status", status);
    const { data } = await adminApi.get(`/admin/transfers?${params}`);
    setItems(data.items || []);
    setBuckets(data.buckets || {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country, status]);

  return (
    <div className="space-y-4" data-testid="ct-transfers-tab">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Store transfers</div>
          <div className="text-xs text-muted-foreground">
            Rebalance stock between dark stores. Every step is logged and reversible until receive.
          </div>
        </div>
        <button onClick={() => setCreating(true)} className="px-3 h-9 rounded-lg text-sm font-medium flex items-center gap-2"
                style={{ background: "#77BC1F", color: "#0a1200" }}
                data-testid="transfer-new">
          <PlusCircle size={14} /> New transfer
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(s => {
          const meta = STATUS_META[s]; const Icon = meta.icon; const on = status === s;
          return (
            <button key={s} onClick={() => setStatus(s)} data-testid={`transfer-tab-${s}`}
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
            <th className="text-left p-3">Code</th>
            <th className="text-left p-3">From → To</th>
            <th className="text-right p-3">SKUs</th>
            <th className="text-right p-3">Units</th>
            <th className="text-left p-3">Reason</th>
            <th className="text-left p-3">Requested</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No {STATUS_META[status].label.toLowerCase()} transfers.</td></tr>
              : items.map(t => {
                const total = t.items.reduce((a, x) => a + x.quantity, 0);
                return (
                  <tr key={t.id} className="border-t border-border" data-testid={`transfer-row-${t.code}`}>
                    <td className="p-3 font-mono text-sm">{t.code}</td>
                    <td className="p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{t.from.warehouse_code}</span>
                        <ArrowRight size={12} className="text-muted-foreground" />
                        <span className="font-mono">{t.to.warehouse_code}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{t.from.partner_name} → {t.to.partner_name}</div>
                    </td>
                    <td className="p-3 text-right">{t.items.length}</td>
                    <td className="p-3 text-right font-mono">{total}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{t.reason || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{t.requested_at ? new Date(t.requested_at).toLocaleString() : "—"}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => setOpenId(t.id)}
                              className="text-xs px-3 h-8 rounded-lg font-medium"
                              style={{ background: "var(--secondary)" }}
                              data-testid={`transfer-open-${t.code}`}>Open</button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {creating && <CreateTransferModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} country={country} />}
      {openId && <TransferDrawer id={openId} onClose={() => setOpenId(null)} onRefresh={load} />}
    </div>
  );
};

export default AdminTransfersTab;
