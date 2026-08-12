/**
 * Super Admin — Inventory Control Tower
 *
 * Network-wide inventory command centre. Aggregates every dark store into a
 * single view. Backed by /api/admin/inventory/* endpoints.
 *
 * Views (tabs): Overview · Stores · SKUs · Low Stock · Out of Stock · Movements
 */
import React, { useEffect, useState, useMemo } from "react";
import {
  Boxes, Store, Package, AlertTriangle, XCircle, Clock,
  Search, DollarSign, TrendingDown, ArrowLeft, ClipboardList,
  Sparkles, PlusCircle,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import { toast } from "sonner";
import { AdminReplenishmentTab } from "./AdminReplenishmentTab";

const num = (n) => (Number(n || 0)).toLocaleString();
const money = (n) => `${(Number(n || 0)).toLocaleString()} CFA`;

const KpiCard = ({ label, value, sublabel, icon: Icon, color = "#77BC1F" }) => (
  <div className="baked-card bg-card border border-border p-4 flex items-start gap-3">
    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
         style={{ background: `${color}22`, color }}>
      <Icon size={20} />
    </div>
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-0.5" style={{ color }}>{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
    </div>
  </div>
);

/* ------------------------ Overview tab ---------------------------- */

const OverviewTab = ({ country }) => {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (q) params.set("q", q);
      if (status) params.set("stock_status", status);
      params.set("limit", "200");
      const { data } = await adminApi.get(`/admin/inventory/overview?${params}`);
      setItems(data.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country, status]);

  return (
    <div className="space-y-3" data-testid="ct-overview-tab">
      <div className="flex gap-2 items-center">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()}
               placeholder="Search product / SKU / brand…" className="baked-input px-3 py-2 bg-secondary text-sm flex-1 max-w-md"
               data-testid="ct-overview-search" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="baked-input px-3 py-2 bg-secondary text-sm">
          <option value="">All statuses</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </div>
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Product</th>
            <th className="text-left p-3">SKU</th>
            <th className="text-left p-3">Stores</th>
            <th className="text-right p-3">Available</th>
            <th className="text-right p-3">Reserved</th>
            <th className="text-right p-3">Damaged</th>
            <th className="text-right p-3">Expired</th>
            <th className="text-left p-3">Status</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              : items.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No inventory rows.</td></tr>
              : items.map((r, i) => (
                <tr key={i} className="border-t border-border" data-testid={`ct-overview-row-${r.sample_partner_product_id}`}>
                  <td className="p-3 flex items-center gap-2">
                    {r.image ? <img src={r.image} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center"><Package size={14} /></div>}
                    <div>
                      <div className="font-medium">{r.name || "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground">{r.brand} · {r.unit}</div>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.sku_code || "—"}</td>
                  <td className="p-3 text-xs">{r.store_count}</td>
                  <td className="p-3 text-right font-mono">{num(r.network_available)}</td>
                  <td className="p-3 text-right font-mono text-blue-400">{num(r.network_reserved)}</td>
                  <td className="p-3 text-right font-mono text-orange-400">{num(r.network_damaged)}</td>
                  <td className="p-3 text-right font-mono text-red-400">{num(r.network_expired)}</td>
                  <td className="p-3">
                    <span className="baked-chip px-2 py-0.5 text-[10px]" style={{
                      background: r.stock_status === "healthy" ? "#77BC1F22"
                                : r.stock_status === "low"     ? "#FCC44C22"
                                : "#FF4C5222",
                      color:      r.stock_status === "healthy" ? "#77BC1F"
                                : r.stock_status === "low"     ? "#FCC44C"
                                : "#FF4C52",
                    }}>{r.stock_status.replace(/_/g, " ")}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setSelected(r.sample_partner_product_id)} className="text-xs px-2 py-1 rounded bg-secondary"
                            data-testid={`ct-drilldown-${r.sample_partner_product_id}`}>Drill</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {selected && <SkuDetailDialog ppid={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const SkuDetailDialog = ({ ppid, onClose }) => {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get(`/admin/inventory/skus/${ppid}`).then(r => setData(r.data)); }, [ppid]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!data) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="text-white">Loading…</div></div>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="sku-detail-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-w-4xl w-full bg-card border border-border rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">SKU Inventory Detail</div>
            <div className="text-xl font-bold">{data.product.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{data.product.sku_code || "—"} · {data.product.brand}</div>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Available</div><div className="text-2xl font-bold text-[#77BC1F]">{num(data.network_totals.available)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Reserved</div><div className="text-2xl font-bold text-blue-400">{num(data.network_totals.reserved)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Damaged</div><div className="text-2xl font-bold text-orange-400">{num(data.network_totals.damaged)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Expired</div><div className="text-2xl font-bold text-red-400">{num(data.network_totals.expired)}</div></div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-2">Store distribution ({data.network_totals.stores})</div>
          <table className="w-full text-sm baked-card bg-card border border-border">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Store</th>
              <th className="text-left p-3">Partner</th>
              <th className="text-right p-3">Available</th>
              <th className="text-right p-3">Reserved</th>
              <th className="text-right p-3">Damaged</th>
              <th className="text-right p-3">Expired</th>
              <th className="text-left p-3">Status</th>
            </tr></thead>
            <tbody>
              {data.distribution.map(d => (
                <tr key={d.warehouse_id} className="border-t border-border">
                  <td className="p-3"><div className="font-mono text-xs">{d.warehouse_code}</div><div className="text-[10px] text-muted-foreground">{d.city}</div></td>
                  <td className="p-3 text-xs">{d.partner_name}<div className="text-[10px] text-muted-foreground">{d.country}</div></td>
                  <td className="p-3 text-right font-mono">{num(d.available_qty)}</td>
                  <td className="p-3 text-right font-mono">{num(d.reserved_qty)}</td>
                  <td className="p-3 text-right font-mono">{num(d.damaged_qty)}</td>
                  <td className="p-3 text-right font-mono">{num(d.expired_qty)}</td>
                  <td className="p-3">
                    <span className="baked-chip px-2 py-0.5 text-[10px]" style={{
                      background: d.status === "healthy" ? "#77BC1F22" : d.status === "low" ? "#FCC44C22" : "#FF4C5222",
                      color:      d.status === "healthy" ? "#77BC1F"   : d.status === "low" ? "#FCC44C"   : "#FF4C52",
                    }}>{d.status.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ------------------------ Stores tab ---------------------------- */

const StoresTab = ({ country }) => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const load = async () => {
    const params = new URLSearchParams(); if (country) params.set("country", country);
    setItems((await adminApi.get(`/admin/inventory/stores?${params}`)).data.items || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country]);
  return (
    <div className="space-y-3" data-testid="ct-stores-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(s => (
          <div key={s.warehouse_id} onClick={() => setSelected(s.warehouse_id)}
               className="baked-card bg-card border border-border p-4 hover:border-primary cursor-pointer"
               data-testid={`ct-store-card-${s.warehouse_code}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-xs text-muted-foreground">{s.warehouse_code}</div>
                <div className="font-semibold text-base mt-0.5">{s.warehouse_name}</div>
                <div className="text-xs text-muted-foreground">{s.city} · {s.country}</div>
              </div>
              <span className="baked-chip px-2 py-0.5 text-[10px] uppercase" style={{
                background: s.status === "active" ? "#77BC1F22" : "#FCC44C22",
                color:      s.status === "active" ? "#77BC1F"   : "#FCC44C",
              }}>{s.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div><div className="text-[10px] uppercase text-muted-foreground">SKUs</div><div className="text-lg font-bold">{s.sku_count}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Available</div><div className="text-lg font-bold text-[#77BC1F]">{num(s.available)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Reserved</div><div className="text-lg font-bold text-blue-400">{num(s.reserved)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Damaged</div><div className="text-sm text-orange-400">{num(s.damaged)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Low</div><div className="text-sm text-amber-400">{num(s.low_stock)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">OOS</div><div className="text-sm text-red-400">{num(s.out_of_stock)}</div></div>
            </div>
          </div>
        ))}
      </div>
      {selected && <StoreDetailDialog whid={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const StoreDetailDialog = ({ whid, onClose }) => {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get(`/admin/inventory/stores/${whid}`).then(r => setData(r.data)); }, [whid]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="store-detail-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-w-5xl w-full bg-card border border-border rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Dark Store Inventory</div>
            <div className="text-xl font-bold">{data.warehouse.name}</div>
            <div className="text-xs text-muted-foreground">{data.warehouse.warehouse_code} · {data.warehouse.city} · {data.warehouse.partner_name}</div>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Available</div><div className="text-xl font-bold text-[#77BC1F]">{num(data.totals.available)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Reserved</div><div className="text-xl font-bold text-blue-400">{num(data.totals.reserved)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Damaged</div><div className="text-xl font-bold text-orange-400">{num(data.totals.damaged)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Expired</div><div className="text-xl font-bold text-red-400">{num(data.totals.expired)}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">Low</div><div className="text-xl font-bold text-amber-400">{data.totals.low}</div></div>
          <div className="baked-card bg-secondary/40 p-3"><div className="text-[10px] uppercase text-muted-foreground">OOS</div><div className="text-xl font-bold text-red-400">{data.totals.oos}</div></div>
        </div>
        <table className="w-full text-sm baked-card bg-card border border-border">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Product</th>
            <th className="text-left p-3">SKU</th>
            <th className="text-right p-3">Available</th>
            <th className="text-right p-3">Reserved</th>
            <th className="text-right p-3">Damaged</th>
            <th className="text-right p-3">Expired</th>
            <th className="text-left p-3">Status</th>
          </tr></thead>
          <tbody>
            {data.items.map(it => (
              <tr key={it.partner_product_id} className="border-t border-border">
                <td className="p-3 flex items-center gap-2">
                  {it.image && <img src={it.image} alt="" className="w-8 h-8 rounded object-cover" />}
                  <div><div className="font-medium">{it.name || "Untitled"}</div><div className="text-[10px] text-muted-foreground">{it.brand}</div></div>
                </td>
                <td className="p-3 font-mono text-xs">{it.sku_code || "—"}</td>
                <td className="p-3 text-right font-mono">{num(it.available_qty)}</td>
                <td className="p-3 text-right font-mono">{num(it.reserved_qty)}</td>
                <td className="p-3 text-right font-mono">{num(it.damaged_qty)}</td>
                <td className="p-3 text-right font-mono">{num(it.expired_qty)}</td>
                <td className="p-3">
                  <span className="baked-chip px-2 py-0.5 text-[10px]" style={{
                    background: it.status === "healthy" ? "#77BC1F22" : it.status === "low" ? "#FCC44C22" : "#FF4C5222",
                    color:      it.status === "healthy" ? "#77BC1F"   : it.status === "low" ? "#FCC44C"   : "#FF4C52",
                  }}>{it.status.replace(/_/g, " ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ------------------ Low Stock / OOS / Movements tabs ------------------ */

const AlertList = ({ url, empty, dataTestId, onQuickAdded }) => {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const load = () => adminApi.get(url).then(r => setItems(r.data.items || []));
  useEffect(() => { load(); }, [url]);
  const quickAdd = async (r) => {
    setBusyId(r.partner_product_id + r.warehouse_id);
    try {
      await adminApi.post("/admin/replenishments/quick-add", {
        partner_product_id: r.partner_product_id,
        warehouse_id: r.warehouse_id,
        suggested_qty: r.recommended_replenishment || null,
      });
      toast.success(`Added ${r.product_name} to replenishment queue`);
      onQuickAdded?.();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Failed to add — a live suggestion may already exist");
    } finally { setBusyId(null); }
  };
  return (
    <div className="baked-card bg-card border border-border overflow-x-auto" data-testid={dataTestId}>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
          <th className="text-left p-3">Product</th>
          <th className="text-left p-3">SKU</th>
          <th className="text-left p-3">Store</th>
          <th className="text-right p-3">Available</th>
          <th className="text-right p-3">Threshold</th>
          <th className="text-right p-3">Recommended</th>
          <th className="p-3"></th>
        </tr></thead>
        <tbody>
          {items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{empty}</td></tr>
            : items.map(r => {
              const key = r.partner_product_id + r.warehouse_id;
              return (
                <tr key={key} className="border-t border-border" data-testid={`alert-row-${r.partner_product_id}-${r.warehouse_id}`}>
                  <td className="p-3 flex items-center gap-2">
                    {r.image && <img src={r.image} alt="" className="w-8 h-8 rounded object-cover" />}
                    <div><div className="font-medium">{r.product_name}</div><div className="text-[10px] text-muted-foreground">{r.brand}</div></div>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.sku_code || "—"}</td>
                  <td className="p-3 text-xs"><div className="font-mono">{r.warehouse_code}</div><div className="text-[10px] text-muted-foreground">{r.partner_name}</div></td>
                  <td className="p-3 text-right font-mono">{r.available_qty}</td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">{r.low_stock_threshold}</td>
                  <td className="p-3 text-right font-mono text-[#77BC1F]">+{r.recommended_replenishment}</td>
                  <td className="p-3 text-right">
                    <button disabled={busyId === key} onClick={() => quickAdd(r)}
                            className="text-xs px-2 py-1 rounded font-medium flex items-center gap-1 ml-auto"
                            style={{ background: "#77BC1F", color: "#0a1200" }}
                            data-testid={`alert-quick-add-${r.partner_product_id}-${r.warehouse_id}`}>
                      <PlusCircle size={11} /> Restock
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
};

const MovementsTab = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { adminApi.get("/admin/inventory/movements?limit=200").then(r => setItems(r.data.items || [])); }, []);
  return (
    <div className="baked-card bg-card border border-border overflow-x-auto" data-testid="ct-movements-tab">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
          <th className="text-left p-3">When</th>
          <th className="text-left p-3">Kind</th>
          <th className="text-right p-3">Δ</th>
          <th className="text-right p-3">Balance</th>
          <th className="text-left p-3">Product</th>
          <th className="text-left p-3">Store</th>
          <th className="text-left p-3">Reason</th>
        </tr></thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id} className="border-t border-border">
              <td className="p-3 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</td>
              <td className="p-3 text-xs uppercase">{m.kind.replace(/_/g, " ")}</td>
              <td className="p-3 text-right font-mono" style={{ color: m.delta_qty > 0 ? "#77BC1F" : "#FF4C52" }}>{m.delta_qty > 0 ? "+" : ""}{m.delta_qty}</td>
              <td className="p-3 text-right font-mono">{m.balance_after}</td>
              <td className="p-3 text-xs">{m.product_name}<div className="text-[10px] text-muted-foreground font-mono">{m.sku_code || ""}</div></td>
              <td className="p-3 text-xs font-mono">{m.warehouse_code}</td>
              <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{m.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------ Root ---------------------------- */

const TABS = [
  { key: "overview",   label: "Overview",     icon: Boxes },
  { key: "stores",     label: "Stores",       icon: Store },
  { key: "low",        label: "Low stock",    icon: AlertTriangle },
  { key: "oos",        label: "Out of stock", icon: XCircle },
  { key: "replen",     label: "Replenishment", icon: Sparkles },
  { key: "movements",  label: "Movements",    icon: ClipboardList },
];

export const AdminInventoryControlTower = () => {
  const [tab, setTab] = useState("overview");
  const [country, setCountry] = useState("");
  const [kpis, setKpis] = useState(null);

  const loadKpis = async () => {
    const params = new URLSearchParams(); if (country) params.set("country", country);
    setKpis((await adminApi.get(`/admin/inventory/kpis?${params}`)).data);
  };
  useEffect(() => { loadKpis(); /* eslint-disable-next-line */ }, [country]);

  return (
    <div className="space-y-5" data-testid="admin-inventory-control-tower">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd · Groceries &amp; Daily Needs</div>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Boxes size={22} /> Inventory Control Tower
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Network-wide inventory command centre. Aggregates every active dark store&apos;s stock.
            Physical stock operations belong to the stores — this is your governance & visibility layer.
          </p>
        </div>
        <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())}
               placeholder="Country filter" maxLength={2}
               className="baked-input px-3 py-2 bg-secondary text-sm w-32" data-testid="ct-country-filter" />
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total SKUs" value={num(kpis.total_skus)} sublabel={`${num(kpis.active_skus)} active`} icon={Package} color="#77BC1F" />
          <KpiCard label="Available" value={num(kpis.available_units)} sublabel="units" icon={Boxes} color="#77BC1F" />
          <KpiCard label="Reserved" value={num(kpis.reserved_units)} icon={Clock} color="#1D9BF0" />
          <KpiCard label="Low stock" value={num(kpis.low_stock_skus)} icon={AlertTriangle} color="#FCC44C" />
          <KpiCard label="Out of stock" value={num(kpis.out_of_stock_skus)} icon={XCircle} color="#FF4C52" />
          <KpiCard label="Inventory value" value={money(kpis.inventory_value)} sublabel={`${num(kpis.stores)} stores`} icon={DollarSign} color="#7ee6b0" />
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon; const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    data-testid={`ct-tab-${t.key}`}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg ${on ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
                    style={on ? { background: "#77BC1F", color: "#0a1200" } : {}}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview"  && <OverviewTab country={country} />}
      {tab === "stores"    && <StoresTab country={country} />}
      {tab === "low"       && <AlertList url={`/admin/inventory/low-stock${country ? `?country=${country}` : ""}`} empty="No low-stock SKUs anywhere on the network 🎉" dataTestId="ct-low-tab" onQuickAdded={loadKpis} />}
      {tab === "oos"       && <AlertList url={`/admin/inventory/out-of-stock${country ? `?country=${country}` : ""}`} empty="No out-of-stock SKUs 🎉" dataTestId="ct-oos-tab" onQuickAdded={loadKpis} />}
      {tab === "replen"    && <AdminReplenishmentTab country={country} />}
      {tab === "movements" && <MovementsTab />}
    </div>
  );
};

export default AdminInventoryControlTower;
