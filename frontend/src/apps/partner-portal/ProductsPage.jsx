/**
 * Partner — Products page (Slice 5).
 * Hybrid catalog: link from the shared MART master catalog OR create a
 * fully custom SKU. Extracted to its own file so PartnerPortalApp.jsx
 * stays under the Emergent visual-edits Babel plugin's ceiling.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, Link2, X } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const money = (n, cur = "XOF") => `${Number(n).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

/* ---------------- Add-product modal (master search + custom form) ---------- */

const AddProductModal = ({ open, onClose, onDone }) => {
  const [mode, setMode] = useState("master"); // master | custom
  const [q, setQ] = useState("");
  const [master, setMaster] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const { data } = await partnerApi.get(`/partner/master-catalog?q=${encodeURIComponent(q)}&limit=30`);
      setMaster(data.items);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open && mode === "master") search(); /* eslint-disable-next-line */ }, [open, mode]);

  /* Master link form */
  const [selected, setSelected] = useState(null);
  const [linkPrice, setLinkPrice] = useState("");
  const [linkStock, setLinkStock] = useState("0");
  const linkSubmit = async () => {
    if (!selected) return;
    if (!linkPrice || Number(linkPrice) <= 0) return toast.error("Enter a valid price");
    try {
      await partnerApi.post(`/partner/products/link`, {
        master_product_id: selected.id,
        partner_price: Number(linkPrice),
        stock_qty: Number(linkStock) || 0,
      });
      toast.success(`${selected.name} added to your catalog`);
      setSelected(null); setLinkPrice(""); setLinkStock("0");
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };

  /* Custom form */
  const [c, setC] = useState({ name: "", brand: "", unit: "", partner_price: "", stock_qty: "0", category_slug: "" });
  const customSubmit = async () => {
    if (!c.name || !c.partner_price) return toast.error("Name and price are required");
    try {
      await partnerApi.post(`/partner/products/custom`, {
        name: c.name, brand: c.brand || null, unit: c.unit || null,
        partner_price: Number(c.partner_price), stock_qty: Number(c.stock_qty) || 0,
        category_slug: c.category_slug || null,
      });
      toast.success("Custom SKU created");
      setC({ name: "", brand: "", unit: "", partner_price: "", stock_qty: "0", category_slug: "" });
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }}
         data-testid="add-product-modal">
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden" style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div>
            <div className="ph-eyebrow">Add product</div>
            <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>Grow your catalog</h2>
          </div>
          <button onClick={onClose} data-testid="add-product-close"
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 p-4" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          {[
            { k: "master", label: "From master catalog", icon: Link2 },
            { k: "custom", label: "Custom SKU",           icon: Plus },
          ].map(t => {
            const Icon = t.icon;
            const on = mode === t.k;
            return (
              <button key={t.k} onClick={() => setMode(t.k)} data-testid={`add-product-tab-${t.k}`}
                      className="flex items-center gap-2 px-4 h-10 rounded-lg text-sm"
                      style={{
                        background: on ? "var(--ph-warm-soft)" : "transparent",
                        color:      on ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                        border:     "1px solid " + (on ? "var(--ph-accent-warm)" : "var(--ph-border-strong)"),
                      }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {mode === "master" ? (
          <div className="p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex gap-2">
              <input placeholder="Search master catalog by name or brand…" value={q}
                     onChange={e => setQ(e.target.value)}
                     onKeyDown={e => e.key === "Enter" && search()}
                     className={FIELD} style={fieldStyle} data-testid="master-search-input" />
              <button onClick={search} className="px-4 h-10 rounded-lg text-sm"
                      style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="master-search-btn">
                <Search size={14} className="inline mr-1" /> Search
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--ph-fg-subtle)" }}>
              {loading ? "Searching…" : `${master.length} product(s)`}
            </p>

            <div className="mt-4 space-y-2">
              {master.map(m => {
                const isSel = selected?.id === m.id;
                return (
                  <div key={m.id}
                       className="flex items-center gap-3 p-3 rounded-xl"
                       style={{ background: "var(--ph-card)", border: `1px solid ${isSel ? "var(--ph-accent-warm)" : "var(--ph-border)"}`, opacity: m.already_linked ? 0.5 : 1 }}
                       data-testid={`master-row-${m.id}`}>
                    <img src={m.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{m.name}</div>
                      <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                        {m.brand} · {m.unit} · Master price: {money(m.price, m.currency)}
                      </div>
                    </div>
                    {m.already_linked ? (
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded" style={{ color: "var(--ph-fg-subtle)", border: "1px solid var(--ph-border)" }}>
                        Already in catalog
                      </span>
                    ) : (
                      <button onClick={() => { setSelected(m); setLinkPrice(String(m.price)); }}
                              className="px-3 h-9 rounded-lg text-xs"
                              style={{ background: isSel ? "var(--ph-accent-warm)" : "transparent",
                                       color: isSel ? "#0a0a0f" : "var(--ph-accent-warm)",
                                       border: "1px solid var(--ph-accent-warm)" }}
                              data-testid={`master-select-${m.id}`}>
                        {isSel ? "Selected" : "Choose"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {selected && (
              <div className="mt-6 p-4 rounded-xl" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-accent-warm)" }}>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--ph-accent-warm)" }}>
                  Configure “{selected.name}” for your store
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                    Your selling price
                    <input value={linkPrice} onChange={e => setLinkPrice(e.target.value)} type="number" min="0"
                           className={FIELD + " mt-1"} style={fieldStyle} data-testid="link-price-input" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                    Opening stock
                    <input value={linkStock} onChange={e => setLinkStock(e.target.value)} type="number" min="0"
                           className={FIELD + " mt-1"} style={fieldStyle} data-testid="link-stock-input" />
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setSelected(null)} className="px-4 h-10 rounded-lg text-sm"
                          style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
                  <button onClick={linkSubmit} className="px-4 h-10 rounded-lg text-sm font-medium"
                          style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                          data-testid="link-submit-btn">
                    Add to catalog
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
            {[
              ["name", "Product name *", "text"],
              ["brand", "Brand", "text"],
              ["unit", "Unit (e.g. 1 kg, 500 ml)", "text"],
              ["category_slug", "Category slug", "text"],
              ["partner_price", "Selling price *", "number"],
              ["stock_qty", "Opening stock", "number"],
            ].map(([k, label, type]) => (
              <label key={k} className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                {label}
                <input value={c[k]} onChange={e => setC({ ...c, [k]: e.target.value })} type={type}
                       className={FIELD + " mt-1"} style={fieldStyle} data-testid={`custom-input-${k}`} />
              </label>
            ))}
            <div className="col-span-2 flex justify-end gap-2 mt-2">
              <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
              <button onClick={customSubmit} className="px-4 h-10 rounded-lg text-sm font-medium"
                      style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                      data-testid="custom-submit-btn">
                Create SKU
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------- Editable product row -------------------------- */

const ProductRow = ({ p, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(p.partner_price));
  const [stock, setStock] = useState(String(p.stock_qty));
  const lowStock = p.stock_qty <= p.low_stock_threshold;

  const save = async () => {
    try {
      await partnerApi.patch(`/partner/products/${p.id}`, {
        partner_price: Number(price), stock_qty: Number(stock),
      });
      toast.success("Updated");
      setEditing(false);
      onChange();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const toggleActive = async () => {
    try {
      await partnerApi.patch(`/partner/products/${p.id}`, { is_active: !p.is_active });
      onChange();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove "${p.name}" from your catalog?`)) return;
    try {
      await partnerApi.delete(`/partner/products/${p.id}`);
      toast.success("Removed");
      onChange();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="flex items-center gap-3 py-3 px-4"
         style={{ borderBottom: "1px solid var(--ph-border)" }}
         data-testid={`product-row-${p.id}`}>
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0"
           style={{ background: "var(--ph-bg-elevated)" }}>
        {p.image
          ? <img src={p.image} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><Package size={20} style={{ color: "var(--ph-fg-subtle)" }} /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate" style={{ color: "var(--ph-fg)" }}>{p.name}</span>
          <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: p.source === "master" ? "var(--ph-accent-soft)" : "var(--ph-warm-soft)",
                         color:      p.source === "master" ? "var(--ph-accent)"     : "var(--ph-accent-warm)" }}>
            {p.source}
          </span>
          {!p.is_active && <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                                 style={{ background: "rgba(220,80,80,.15)", color: "#e77" }}>Hidden</span>}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>
          {p.brand} · {p.unit}
          {p.master_price != null && p.source === "master" && (
            <span className="ml-2">Master: {money(p.master_price, p.currency)}</span>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number"
                 className="w-24 h-9 px-2 rounded text-sm font-mono" style={fieldStyle} data-testid={`row-price-${p.id}`} />
          <input value={stock} onChange={e => setStock(e.target.value)} type="number"
                 className="w-20 h-9 px-2 rounded text-sm font-mono" style={fieldStyle} data-testid={`row-stock-${p.id}`} />
          <button onClick={save} className="px-3 h-9 rounded text-xs"
                  style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid={`row-save-${p.id}`}>Save</button>
          <button onClick={() => setEditing(false)} className="px-2 h-9 text-xs" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
        </>
      ) : (
        <>
          <div className="text-right w-28">
            <div className="font-mono text-sm" style={{ color: "var(--ph-fg)" }}>{money(p.partner_price, p.currency)}</div>
            <div className={`text-xs ${lowStock ? "text-rose-400" : ""}`} style={{ color: lowStock ? undefined : "var(--ph-fg-subtle)" }}>
              {p.stock_qty} in stock
            </div>
          </div>
          <button onClick={() => setEditing(true)} className="px-2 h-8 text-xs rounded"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-edit-${p.id}`}>Edit</button>
          <button onClick={toggleActive} className="px-2 h-8 text-xs rounded"
                  style={{ color: p.is_active ? "var(--ph-fg-muted)" : "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-toggle-${p.id}`}>{p.is_active ? "Hide" : "Show"}</button>
          <button onClick={remove} className="px-2 h-8 text-xs rounded text-rose-400"
                  style={{ border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-delete-${p.id}`}>Delete</button>
        </>
      )}
    </div>
  );
};

/* ----------------------------- Main page --------------------------------- */

export const ProductsPage = () => {
  const [state, setState] = useState({ items: [], total: 0, live: 0 });
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    const { data } = await partnerApi.get("/partner/products");
    setState(data);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return state.items;
    const ql = q.toLowerCase();
    return state.items.filter(p =>
      (p.name || "").toLowerCase().includes(ql) ||
      (p.brand || "").toLowerCase().includes(ql));
  }, [state.items, q]);

  return (
    <div data-testid="portal-products-page">
      <div className="ph-eyebrow">Catalog</div>
      <div className="flex items-center justify-between mt-2">
        <h1 className="ph-h1" style={{ color: "var(--ph-fg)" }}>Products</h1>
        <button onClick={() => setShowAdd(true)} className="ph-btn ph-btn-warm"
                style={{ height: 44, padding: "0 22px" }} data-testid="products-add-btn">
          <Plus size={16} className="inline mr-1" /> Add product
        </button>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[["Total SKUs", state.total], ["Live", state.live], ["Hidden", state.total - state.live]].map(([l, v]) => (
          <div key={l} className="rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>{l}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "var(--ph-fg)" }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} style={{ color: "var(--ph-fg-subtle)", position: "absolute", left: 12, top: 13 }} />
          <input placeholder="Search your catalog" value={q} onChange={e => setQ(e.target.value)}
                 className={FIELD + " pl-9"} style={fieldStyle} data-testid="products-search-input" />
        </div>
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {filtered.length === 0
          ? (
            <div className="p-10 text-center">
              <Package size={32} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>
                {state.total === 0 ? "No products yet. Click + Add product to start." : "No products match your search."}
              </p>
            </div>
          )
          : filtered.map(p => <ProductRow key={p.id} p={p} onChange={load} />)
        }
      </div>

      <AddProductModal open={showAdd} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />
    </div>
  );
};
