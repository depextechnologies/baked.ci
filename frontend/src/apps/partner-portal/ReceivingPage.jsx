/**
 * Partner Portal — Receiving & Put-away workflow.
 *
 * Draft → Received → Verified → Put-away → Completed.
 * Each item can be put-away to a specific bin. Completed lines increment
 * PartnerInventory.available_qty and record a `put_away` movement.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Package, CheckCircle2, ArrowRight, X, ClipboardCheck } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const STATUS_META = {
  draft:     { label: "Draft",     color: "#8b8b8b" },
  received:  { label: "Received",  color: "#FCC44C" },
  verified:  { label: "Verified",  color: "#1D9BF0" },
  put_away:  { label: "Put-away",  color: "#7ee6b0" },
  completed: { label: "Completed", color: "#77BC1F" },
  cancelled: { label: "Cancelled", color: "#FF4C52" },
};

/* -------------------- Create receipt modal -------------------- */

const CreateReceiptModal = ({ onClose, onCreated }) => {
  const [products, setProducts] = useState([]);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    partnerApi.get("/partner/products?limit=200").then(r => setProducts(r.data.items || r.data || []));
  }, []);

  const addItem = () => setItems([...items, { partner_product_id: "", expected_qty: 0, received_qty: 0 }]);
  const upd = (i, k, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const rm  = (i) => setItems(items.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (items.length === 0) return toast.error("Add at least one line item");
    if (items.some(i => !i.partner_product_id)) return toast.error("Every line needs a product");
    setBusy(true);
    try {
      await partnerApi.post("/partner/inventory/receipts", {
        source_type: "purchase",
        supplier_name: supplier || null,
        notes: notes || null,
        items: items.map(i => ({
          partner_product_id: i.partner_product_id,
          expected_qty: Number(i.expected_qty) || 0,
          received_qty: Number(i.received_qty) || 0,
        })),
      });
      toast.success("Receipt created");
      onCreated();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.8)" }} data-testid="receipt-create-modal">
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
           style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="ph-eyebrow">New receipt</div>
            <div className="text-lg font-semibold" style={{ color: "var(--ph-fg)" }}>Receive stock</div>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: "var(--ph-fg-muted)" }} /></button>
        </div>
        <div className="space-y-3">
          <input placeholder="Supplier name" value={supplier} onChange={e => setSupplier(e.target.value)}
                 className={FIELD} style={fieldStyle} data-testid="receipt-supplier" />
          <textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    className="px-3 py-2 rounded-lg w-full text-sm" style={fieldStyle} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium" style={{ color: "var(--ph-fg)" }}>Line items</div>
              <button onClick={addItem} className="text-xs px-2 py-1 rounded" style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }} data-testid="receipt-add-line">
                <PlusCircle size={12} className="inline mr-1" /> Add item
              </button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select value={it.partner_product_id} onChange={e => upd(i, "partner_product_id", e.target.value)}
                        className={FIELD + " flex-1"} style={fieldStyle} data-testid={`receipt-line-product-${i}`}>
                  <option value="">— Product —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name || p.master_product_name || p.id}</option>)}
                </select>
                <input type="number" min="0" value={it.expected_qty} onChange={e => upd(i, "expected_qty", e.target.value)}
                       placeholder="Expected" className={FIELD + " w-24"} style={fieldStyle} />
                <input type="number" min="0" value={it.received_qty} onChange={e => upd(i, "received_qty", e.target.value)}
                       placeholder="Received" className={FIELD + " w-24"} style={fieldStyle} data-testid={`receipt-line-received-${i}`} />
                <button onClick={() => rm(i)} className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }}><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
            <button disabled={busy} onClick={submit}
                    className="px-4 h-10 rounded-lg text-sm font-medium"
                    style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                    data-testid="receipt-submit">Create receipt</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------- Receipt detail / put-away drawer -------------------- */

const ReceiptDrawer = ({ id, onClose, onRefresh }) => {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bins, setBins] = useState({}); // item_id → bin_id

  const load = async () => setR((await partnerApi.get(`/partner/inventory/receipts/${id}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const verify = async () => {
    setBusy(true);
    try { await partnerApi.post(`/partner/inventory/receipts/${id}/verify`, {}); toast.success("Verified"); await load(); onRefresh(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const putAway = async () => {
    if (!r) return;
    const remaining = r.items.filter(it => it.received_qty > it.put_away_qty);
    if (remaining.length === 0) return toast.error("Nothing to put-away");
    setBusy(true);
    try {
      await partnerApi.post(`/partner/inventory/receipts/${id}/put-away`, {
        lines: remaining.map(it => ({
          item_id: it.id,
          put_away_qty: it.received_qty - it.put_away_qty,
          bin_id: bins[it.id] || null,
        })),
      });
      toast.success("Put-away completed");
      await load(); onRefresh();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this receipt?")) return;
    setBusy(true);
    try { await partnerApi.post(`/partner/inventory/receipts/${id}/cancel`, {}); toast.success("Cancelled"); onRefresh(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (!r) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"><div className="text-white text-sm">Loading…</div></div>;

  const meta = STATUS_META[r.status];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.8)" }} data-testid="receipt-drawer">
      <div className="w-full max-w-3xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
           style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="ph-eyebrow">Receipt</div>
            <div className="text-lg font-semibold" style={{ color: "var(--ph-fg)" }}>{r.code}</div>
            <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{r.supplier_name || "—"} · {new Date(r.created_at).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="baked-chip px-2 py-1 text-[10px] uppercase rounded"
                  style={{ background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
            <button onClick={onClose}><X size={16} style={{ color: "var(--ph-fg-muted)" }} /></button>
          </div>
        </div>

        <table className="w-full text-sm mb-4">
          <thead className="text-[10px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}><tr>
            <th className="text-left py-2">Product</th>
            <th className="text-right py-2">Expected</th>
            <th className="text-right py-2">Received</th>
            <th className="text-right py-2">Put-away</th>
            <th className="text-right py-2">Remaining</th>
            {r.status === "verified" && <th className="text-left py-2 pl-4">Assign bin (opt)</th>}
          </tr></thead>
          <tbody>
            {r.items.map(it => (
              <tr key={it.id} style={{ borderTop: "1px solid var(--ph-border)" }}>
                <td className="py-2" style={{ color: "var(--ph-fg)" }}>{it.product?.name || it.partner_product_id}</td>
                <td className="py-2 text-right font-mono">{it.expected_qty}</td>
                <td className="py-2 text-right font-mono">{it.received_qty}</td>
                <td className="py-2 text-right font-mono text-[#77BC1F]">{it.put_away_qty}</td>
                <td className="py-2 text-right font-mono">{it.received_qty - it.put_away_qty}</td>
                {r.status === "verified" && (
                  <td className="py-2 pl-4">
                    <input placeholder="bin id (optional)" value={bins[it.id] || ""}
                           onChange={e => setBins({ ...bins, [it.id]: e.target.value })}
                           className="px-2 py-1 rounded text-xs w-40" style={fieldStyle} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {r.notes && <div className="text-xs mb-4 whitespace-pre-wrap" style={{ color: "var(--ph-fg-subtle)" }}>{r.notes}</div>}

        <div className="flex justify-end gap-2">
          {["draft", "received"].includes(r.status) && (
            <button disabled={busy} onClick={cancel} className="px-4 h-10 rounded-lg text-sm" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="receipt-cancel">Cancel</button>
          )}
          {["draft", "received"].includes(r.status) && (
            <button disabled={busy} onClick={verify} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "#1D9BF0", color: "#0a1200" }} data-testid="receipt-verify">
              <ClipboardCheck size={14} className="inline mr-1" /> Verify
            </button>
          )}
          {["verified", "put_away"].includes(r.status) && r.items.some(it => it.received_qty > it.put_away_qty) && (
            <button disabled={busy} onClick={putAway} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="receipt-put-away">
              <ArrowRight size={14} className="inline mr-1" /> Put-away remaining
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------- Main page -------------------- */

export const ReceivingPage = () => {
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const params = new URLSearchParams(); if (status) params.set("status", status);
    const { data } = await partnerApi.get(`/partner/inventory/receipts?${params}`);
    setItems(data.items || []); setBuckets(data.buckets || {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <div data-testid="portal-receiving-page">
      <div className="ph-eyebrow">Warehouse operations</div>
      <div className="flex items-center justify-between">
        <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Receiving</h1>
        <button onClick={() => setCreating(true)} className="px-4 h-10 rounded-lg text-sm font-medium"
                style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="receipt-new-btn">
          <PlusCircle size={14} className="inline mr-1" /> New receipt
        </button>
      </div>
      <p className="ph-body mt-2 max-w-2xl">
        Incoming stock from suppliers, transfers or returns. Each receipt flows
        <span style={{ color: "var(--ph-fg)" }}> Draft → Received → Verified → Put-away → Completed</span>.
        Put-away increments your available inventory.
      </p>

      <div className="mt-6 flex gap-2 flex-wrap">
        {["", "draft", "received", "verified", "put_away", "completed", "cancelled"].map(s => {
          const label = s === "" ? "All" : STATUS_META[s].label;
          const count = s === "" ? Object.values(buckets).reduce((a, b) => a + b, 0) : (buckets[s] || 0);
          return (
            <button key={s || "all"} onClick={() => setStatus(s)} data-testid={`receipt-filter-${s || "all"}`}
                    className="px-3 h-9 rounded-lg text-xs font-medium flex items-center gap-1"
                    style={{
                      background: status === s ? "var(--ph-warm-soft)" : "transparent",
                      color:      status === s ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                      border:     "1px solid " + (status === s ? "var(--ph-accent-warm)" : "var(--ph-border-strong)"),
                    }}>
              {label} <span className="opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {items.length === 0
          ? <div className="p-10 text-center">
              <Package size={32} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>No receipts yet. Create the first one to start receiving stock.</p>
            </div>
          : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase" style={{ color: "var(--ph-fg-subtle)", background: "var(--ph-bg-elevated)" }}>
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Supplier</th>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--ph-border)" }} data-testid={`receipt-row-${r.code}`}>
                    <td className="p-3 font-mono" style={{ color: "var(--ph-fg)" }}>{r.code}</td>
                    <td className="p-3" style={{ color: "var(--ph-fg)" }}>{r.supplier_name || "—"}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{r.source_type}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      <span className="baked-chip px-2 py-0.5 text-[10px] uppercase rounded"
                            style={{ background: `${STATUS_META[r.status]?.color || "#888"}22`, color: STATUS_META[r.status]?.color || "#888" }}>
                        {STATUS_META[r.status]?.label || r.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => setOpenId(r.id)} className="text-xs px-3 h-8 rounded-lg" style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }} data-testid={`receipt-open-${r.code}`}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {creating && <CreateReceiptModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {openId && <ReceiptDrawer id={openId} onClose={() => setOpenId(null)} onRefresh={load} />}
    </div>
  );
};

export default ReceivingPage;
