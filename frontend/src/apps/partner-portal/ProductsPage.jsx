/**
 * Partner — Products page (Slice 5).
 * Hybrid catalog: link from the shared MART master catalog OR create a
 * fully custom SKU. Extracted to its own file so PartnerPortalApp.jsx
 * stays under the Emergent visual-edits Babel plugin's ceiling.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, Link2, X } from "lucide-react";
import { partnerApi, usePartner } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const FIELD = "px-3 h-10 rounded-lg w-full text-sm";
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const money = (n, cur = "XOF") => `${Number(n).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

/* ---------------- Add-product modal (master search + custom form) ---------- */

const AddProductModal = ({ open, onClose, onDone }) => {
  const { partner } = usePartner();
  const country = partner?.country || "CI";
  const [mode, setMode] = useState("master"); // master | custom
  const [q, setQ] = useState("");
  const [master, setMaster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cats, setCats] = useState([]);           // [{slug, name}]
  const [subs, setSubs] = useState([]);           // [{slug, name}]
  const [cat, setCat] = useState("");             // selected category slug
  const [sub, setSub] = useState("");             // selected subcategory slug

  const search = async (extra = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q.trim()) params.set("q", q.trim());
      const useCat = extra.cat ?? cat;
      const useSub = extra.sub ?? sub;
      if (useCat) params.set("category", useCat);
      if (useSub) params.set("subcategory", useSub);
      const { data } = await partnerApi.get(`/partner/master-catalog?${params}`);
      setMaster(data.items);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open && mode === "master") search(); /* eslint-disable-next-line */ }, [open, mode]);

  // Category / subcategory dropdowns — populate on open.
  useEffect(() => {
    if (!open || mode !== "master") return;
    partnerApi.get(`/mart/categories?country=${country}`).then(r => setCats(r.data || [])).catch(() => setCats([]));
  }, [open, mode, country]);

  useEffect(() => {
    if (!cat) { setSubs([]); setSub(""); return; }
    partnerApi.get(`/mart/subcategories?country=${country}&category=${encodeURIComponent(cat)}`)
      .then(r => setSubs(r.data || []))
      .catch(() => setSubs([]));
    setSub(""); // reset when parent changes
  }, [cat, country]);

  const onCatChange = (v) => { setCat(v); search({ cat: v, sub: "" }); };
  const onSubChange = (v) => { setSub(v); search({ sub: v }); };

  /* Master link form */
  const [selected, setSelected] = useState(null);
  const [linkPrice, setLinkPrice] = useState("");
  const [linkStock, setLinkStock] = useState("0");

  // Reset filter + selection state when the modal closes so it opens fresh next time.
  useEffect(() => {
    if (!open) { setCat(""); setSub(""); setSubs([]); setQ(""); setSelected(null); }
  }, [open]);
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
      toast.success("Custom SKU submitted for review — you'll be notified once approved");
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
            { k: "master",  label: "From master catalog", icon: Link2 },
            { k: "custom",  label: "Custom SKU",           icon: Plus },
            { k: "cat_req", label: "Request category",     icon: Plus },
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

            {/* Category / Subcategory filters — Social.docx Issue #2 */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <select value={cat} onChange={e => onCatChange(e.target.value)}
                      className={FIELD} style={fieldStyle}
                      data-testid="master-category-select">
                <option value="">All categories</option>
                {cats.map(c => (
                  <option key={c.slug || c.id} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <select value={sub} onChange={e => onSubChange(e.target.value)}
                      disabled={!cat}
                      className={FIELD} style={{ ...fieldStyle, opacity: cat ? 1 : 0.55 }}
                      data-testid="master-subcategory-select">
                <option value="">{cat ? "All subcategories" : "Pick a category first"}</option>
                {subs.map(s => (
                  <option key={s.slug || s.id} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
            {(cat || sub) && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Filters:</span>
                {cat && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}
                        data-testid="filter-chip-category">
                    {(cats.find(c => c.slug === cat)?.name) || cat}
                  </span>
                )}
                {sub && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}
                        data-testid="filter-chip-subcategory">
                    {(subs.find(s => s.slug === sub)?.name) || sub}
                  </span>
                )}
                <button onClick={() => { setCat(""); setSub(""); setSubs([]); search({ cat: "", sub: "" }); }}
                        className="text-[10px] uppercase tracking-widest underline"
                        style={{ color: "var(--ph-fg-subtle)" }}
                        data-testid="filter-clear-btn">
                  Clear
                </button>
              </div>
            )}

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

        {mode === "cat_req" && (
          <CategoryRequestForm onClose={onClose} />
        )}
      </div>
    </div>
  );
};

/* --------------------- Category request form --------------------- */

const CategoryRequestForm = ({ onClose }) => {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState([]);

  useEffect(() => {
    partnerApi.get("/partner/catalog/category-requests").then(r => setMine(r.data.items || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await partnerApi.post("/partner/catalog/category-requests", { name, reason: reason || null });
      toast.success("Category request sent — awaiting Super Admin approval");
      const r = await partnerApi.get("/partner/catalog/category-requests");
      setMine(r.data.items || []); setName(""); setReason("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-5 max-h-[70vh] overflow-y-auto" data-testid="cat-request-form">
      <p className="text-xs mb-4" style={{ color: "var(--ph-fg-subtle)" }}>
        Propose a new category. Super Admin will review and approve before it appears in the marketplace.
      </p>
      <div className="grid gap-3">
        <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Category name *
          <input value={name} onChange={e => setName(e.target.value)} className={FIELD + " mt-1"} style={fieldStyle} data-testid="cat-request-name" />
        </label>
        <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Why do you need this category?
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} className="px-3 py-2 rounded-lg w-full text-sm mt-1" style={fieldStyle} data-testid="cat-request-reason" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm" style={{ color: "var(--ph-fg-muted)" }}>Close</button>
          <button disabled={busy} onClick={submit} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="cat-request-submit">Submit for review</button>
        </div>
      </div>
      {mine.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>Your submissions</div>
          {mine.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 text-xs" style={{ borderBottom: "1px solid var(--ph-border)" }}>
              <div>
                <div style={{ color: "var(--ph-fg)" }}>{r.name}</div>
                <div style={{ color: "var(--ph-fg-subtle)" }}>{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] uppercase"
                    style={{ background: r.status === "pending" ? "rgba(252,196,76,.15)" : r.status === "approved" ? "rgba(119,188,31,.15)" : "rgba(255,76,82,.15)",
                             color:      r.status === "pending" ? "#FCC44C" : r.status === "approved" ? "#77BC1F" : "#FF4C52" }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
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
          {p.approval_status && p.approval_status !== "approved" && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{
                    background: p.approval_status === "pending" ? "rgba(252,196,76,.15)"
                              : p.approval_status === "rejected" ? "rgba(255,76,82,.15)"
                              : "rgba(29,155,240,.15)",
                    color: p.approval_status === "pending" ? "#FCC44C"
                         : p.approval_status === "rejected" ? "#FF4C52"
                         : "#1D9BF0",
                  }}
                  title={p.review_notes || p.approval_status}
                  data-testid={`product-approval-${p.id}`}>
              {p.approval_status.replace(/_/g, " ")}
            </span>
          )}
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
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    const { data } = await partnerApi.get("/partner/products");
    setState(data);
    setLoading(false);
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
            <div className="text-2xl font-bold mt-1" style={{ color: "var(--ph-fg)" }}>{loading ? "—" : v}</div>
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
