/**
 * Partner Portal — Inventory
 *
 * Real inventory ledger with per-SKU stock breakdown (available / reserved /
 * damaged / expired) and stock movements. Never-negative is enforced in the
 * backend.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, ArrowUp, ArrowDown, AlertTriangle, XCircle, ClipboardList, MapPin } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const AdjustModal = ({ item, onClose, onDone }) => {
  const [kind, setKind] = useState("receive");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!qty || qty <= 0) return toast.error("Quantity must be positive");
    setBusy(true);
    try {
      await partnerApi.post(`/partner/inventory/${item.partner_product_id}/adjust`, {
        kind, delta_qty: Number(qty), reason: reason || null,
      });
      toast.success("Stock updated");
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }} data-testid="inventory-adjust-modal">
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="ph-eyebrow">Adjust stock</div>
            <div className="text-lg font-semibold" style={{ color: "var(--ph-fg)" }}>{item.product?.name}</div>
            <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Available: {item.available_qty}</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--ph-fg-muted)" }}>✕</button>
        </div>
        <div className="space-y-3">
          <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Kind
            <select value={kind} onChange={e => setKind(e.target.value)} className={FIELD + " mt-1"} style={fieldStyle} data-testid="adjust-kind">
              <option value="receive">Receive stock (+)</option>
              <option value="adjustment_add">Adjustment (+)</option>
              <option value="adjustment_remove">Adjustment (−)</option>
              <option value="damage">Damage (−)</option>
              <option value="expire">Expire (−)</option>
              <option value="return_in">Return in (+)</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Quantity
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                   className={FIELD + " mt-1"} style={fieldStyle} data-testid="adjust-qty" />
          </label>
          <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Reason (optional)
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
                      className="px-3 py-2 rounded-lg w-full text-sm mt-1" style={fieldStyle} data-testid="adjust-reason" />
          </label>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
            <button disabled={busy} onClick={submit} className="px-4 h-10 rounded-lg text-sm font-medium"
                    style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                    data-testid="adjust-submit">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color = "var(--ph-accent)" }) => (
  <div className="rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
    <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>{label}</div>
    <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
  </div>
);

export const InventoryPage = () => {
  const [data, setData] = useState({ items: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | low | out
  const [adjusting, setAdjusting] = useState(null);
  const [tab, setTab] = useState("stock"); // stock | movements
  const [movements, setMovements] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filter === "low") params.set("low_only", "true");
      if (filter === "out") params.set("out_only", "true");
      const { data: d } = await partnerApi.get(`/partner/inventory?${params.toString()}`);
      setData(d);
    } finally { setLoading(false); }
  };
  const loadMovements = async () => {
    const { data: d } = await partnerApi.get(`/partner/inventory/movements?limit=100`);
    setMovements(d.items || []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);
  useEffect(() => { if (tab === "movements") loadMovements(); }, [tab]);

  return (
    <div data-testid="portal-inventory-page">
      <div className="ph-eyebrow">Inventory</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Stock</h1>
      <p className="ph-body mt-2 max-w-2xl">
        Real-time stock ledger. Every change is recorded in the movements log.
        Stock can never go negative.
      </p>

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total SKUs" value={loading ? "—" : data.summary?.total ?? 0} />
        <StatCard label="Available" value={loading ? "—" : data.summary?.total_available ?? 0} color="#7ee6b0" />
        <StatCard label="Reserved" value={loading ? "—" : data.summary?.total_reserved ?? 0} color="#7edcff" />
        <StatCard label="Low stock" value={loading ? "—" : data.summary?.low ?? 0} color="#FCC44C" />
        <StatCard label="Out of stock" value={loading ? "—" : data.summary?.out_of_stock ?? 0} color="#FF4C52" />
      </div>

      <div className="mt-6 flex gap-2">
        {[["all", "All"], ["low", "Low stock"], ["out", "Out of stock"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`inv-filter-${k}`}
                  className="px-3 h-9 rounded-lg text-xs font-medium"
                  style={{
                    background: filter === k ? "var(--ph-warm-soft)" : "transparent",
                    color: filter === k ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                    border: "1px solid " + (filter === k ? "var(--ph-accent-warm)" : "var(--ph-border-strong)"),
                  }}>{l}</button>
        ))}
        <div className="ml-auto">
          <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()}
                 className={FIELD} style={fieldStyle} data-testid="inv-search" />
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b" style={{ borderColor: "var(--ph-border)" }}>
        <button onClick={() => setTab("stock")} data-testid="inv-tab-stock"
                className="px-4 h-10 text-sm font-medium"
                style={{ color: tab === "stock" ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)", borderBottom: tab === "stock" ? "2px solid var(--ph-accent-warm)" : "2px solid transparent" }}>
          <Package size={14} className="inline mr-1" /> Stock
        </button>
        <button onClick={() => setTab("movements")} data-testid="inv-tab-movements"
                className="px-4 h-10 text-sm font-medium"
                style={{ color: tab === "movements" ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)", borderBottom: tab === "movements" ? "2px solid var(--ph-accent-warm)" : "2px solid transparent" }}>
          <ClipboardList size={14} className="inline mr-1" /> Movements
        </button>
      </div>

      {tab === "stock" && (
        <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          {data.items.length === 0
            ? <div className="p-10 text-center"><Package size={32} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
                <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>No inventory rows. Add products first, then adjust stock here.</p>
              </div>
            : data.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-4"
                   style={{ borderBottom: "1px solid var(--ph-border)" }}
                   data-testid={`inv-row-${item.partner_product_id}`}>
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ background: "var(--ph-bg-elevated)" }}>
                  {item.product?.image
                    ? <img src={item.product.image} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package size={20} style={{ color: "var(--ph-fg-subtle)" }} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm truncate" style={{ color: "var(--ph-fg)" }}>{item.product?.name}</span>
                    {item.product?.source && <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                                                     style={{ background: "var(--ph-accent-soft)", color: "var(--ph-accent)" }}>{item.product.source}</span>}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>
                    {item.product?.brand} · {item.product?.unit} · SKU {item.product?.sku_code || "—"}
                  </div>
                </div>
                <div className="text-center min-w-[60px]">
                  <div className={`font-mono text-lg ${item.out_of_stock ? "text-red-400" : item.low_stock ? "text-amber-400" : ""}`}
                       style={{ color: item.out_of_stock ? undefined : item.low_stock ? undefined : "var(--ph-fg)" }}>
                    {item.available_qty}
                  </div>
                  <div className="text-[9px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}>Available</div>
                </div>
                <div className="text-center min-w-[60px]">
                  <div className="font-mono text-sm" style={{ color: "#7edcff" }}>{item.reserved_qty}</div>
                  <div className="text-[9px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}>Reserved</div>
                </div>
                <div className="text-center min-w-[60px]">
                  <div className="font-mono text-sm" style={{ color: item.damaged_qty > 0 ? "#FF9080" : "var(--ph-fg-subtle)" }}>{item.damaged_qty}</div>
                  <div className="text-[9px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}>Damaged</div>
                </div>
                <div className="text-center min-w-[60px]">
                  <div className="font-mono text-sm" style={{ color: item.expired_qty > 0 ? "#FF9080" : "var(--ph-fg-subtle)" }}>{item.expired_qty}</div>
                  <div className="text-[9px] uppercase" style={{ color: "var(--ph-fg-subtle)" }}>Expired</div>
                </div>
                {item.low_stock && <AlertTriangle size={16} className="text-amber-400" title="Low stock" />}
                {item.out_of_stock && <XCircle size={16} className="text-red-400" title="Out of stock" />}
                <button onClick={() => setAdjusting(item)}
                        className="px-3 h-9 rounded-lg text-xs font-medium"
                        style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                        data-testid={`inv-adjust-${item.partner_product_id}`}>
                  Adjust
                </button>
              </div>
            ))}
        </div>
      )}

      {tab === "movements" && (
        <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          {movements.length === 0
            ? <div className="p-10 text-center text-sm" style={{ color: "var(--ph-fg-muted)" }}>No movements yet.</div>
            : movements.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 text-sm"
                   style={{ borderBottom: "1px solid var(--ph-border)" }}
                   data-testid={`mv-row-${m.id}`}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                     style={{
                       background: m.delta_qty > 0 ? "rgba(126,230,176,.15)" : "rgba(255,144,144,.15)",
                       color: m.delta_qty > 0 ? "#7ee6b0" : "#FF9090",
                     }}>
                  {m.delta_qty > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                </div>
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg)" }}>{m.kind.replace(/_/g, " ")}</div>
                  <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{m.reason || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm" style={{ color: m.delta_qty > 0 ? "#7ee6b0" : "#FF9090" }}>
                    {m.delta_qty > 0 ? "+" : ""}{m.delta_qty}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--ph-fg-subtle)" }}>Balance: {m.balance_after}</div>
                </div>
                <div className="text-[10px] text-right w-32" style={{ color: "var(--ph-fg-subtle)" }}>
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            ))}
        </div>
      )}

      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); load(); }} />}
    </div>
  );
};

export default InventoryPage;
