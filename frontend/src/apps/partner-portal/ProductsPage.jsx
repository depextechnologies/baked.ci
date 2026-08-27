/**
 * Partner — Products page (Slice 5).
 * Hybrid catalog: link from the shared MART master catalog OR create a
 * fully custom SKU. Extracted to its own file so PartnerPortalApp.jsx
 * stays under the Emergent visual-edits Babel plugin's ceiling.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, Link2, X, MapPin, ChevronRight, Image as ImageIcon, ArrowUp, ArrowDown, Trash2, Star, Upload as UploadIcon, Loader2 } from "lucide-react";
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

/* -------------------- SKU-Location assignment modal ---------------------- */

const LocationModal = ({ open, onClose, product, onSaved }) => {
  const { warehouse } = usePartner();
  const [tree, setTree] = useState(null);
  const [assigns, setAssigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selBin, setSelBin] = useState(null);   // { bin, shelf, rack, aisle, zone } — flat path
  const [qty, setQty] = useState("0");
  const [isPrimary, setIsPrimary] = useState(true);
  const [expandedIds, setExpandedIds] = useState({}); // { [nodeId]: true }

  const load = async () => {
    if (!warehouse || !product) return;
    setLoading(true);
    try {
      const [{ data: t }, { data: a }] = await Promise.all([
        partnerApi.get(`/partner/warehouse/${warehouse.id}/tree`),
        partnerApi.get(`/partner/inventory/locations/${product.id}`),
      ]);
      setTree(t);
      setAssigns(a.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, product?.id]);

  // Fixing_Prompt (2026-02-27) — filter tree by product's category cascade.
  // Untagged Aisles/Racks stay visible for back-compat; tagged ones must
  // match the product's category (and subcategory if the product has one).
  const filteredTree = React.useMemo(() => {
    if (!tree || !product) return tree;
    const prodCat = product.category_slug || null;
    const prodSub = product.subcategory_slug || null;
    const filterRack = (r) => {
      if (r.category_slug && prodCat && r.category_slug !== prodCat) return null;
      if (r.subcategory_slug && prodSub && r.subcategory_slug !== prodSub) return null;
      return r;
    };
    const filterAisle = (a) => {
      if (a.category_slug && prodCat && a.category_slug !== prodCat) return null;
      if (a.subcategory_slug && prodSub && a.subcategory_slug !== prodSub) return null;
      return { ...a, children: (a.children || []).map(filterRack).filter(Boolean) };
    };
    return {
      ...tree,
      zones: tree.zones.map(z => ({
        ...z, children: (z.children || []).map(filterAisle).filter(Boolean),
      })),
    };
  }, [tree, product]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!open) { setSelBin(null); setQty("0"); setIsPrimary(true); setExpandedIds({}); }
  }, [open]);

  const toggle = (id) => setExpandedIds(m => ({ ...m, [id]: !m[id] }));

  const submit = async () => {
    if (!selBin) return toast.error("Pick a bin first");
    setBusy(true);
    try {
      await partnerApi.post(`/partner/inventory/locations/${product.id}`, {
        bin_id: selBin.bin.id,
        quantity_at_location: Number(qty) || 0,
        is_primary: isPrimary,
      });
      toast.success(`Assigned to ${selBin.label}`);
      setSelBin(null); setQty("0"); setIsPrimary(true);
      await load();
      onSaved?.();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const removeAssign = async (locId) => {
    if (!window.confirm("Remove this location assignment?")) return;
    try {
      await partnerApi.delete(`/partner/inventory/locations/${locId}`);
      toast.success("Removed");
      await load();
      onSaved?.();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const setPrimary = async (loc) => {
    try {
      await partnerApi.patch(`/partner/inventory/locations/${loc.id}`, { is_primary: true });
      toast.success("Primary updated");
      await load();
      onSaved?.();
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!open) return null;

  // Recursive renderer for the warehouse tree (zone → aisle → rack → shelf → bin).
  const renderNode = (node, level, ancestors) => {
    const hasChildren = (node.children || []).length > 0;
    const isBin = level === "bin";
    const expanded = !!expandedIds[node.id];
    const nextLevel = { zone: "aisle", aisle: "rack", rack: "shelf", shelf: "bin", bin: null }[level];
    const path = { ...ancestors, [level]: node };
    const levels = ["zone", "aisle", "rack", "shelf", "bin"];
    const labels = ["Zone", "Aisle", "Rack", "Shelf", "Bin"];
    const label = levels
      .map((L, i) => path[L] ? `${labels[i]} ${path[L].code}` : null)
      .filter(Boolean)
      .join(" · ");
    const pathObj = {
      zone:  path.zone  && { id: path.zone.id,  code: path.zone.code,  name: path.zone.name  },
      aisle: path.aisle && { id: path.aisle.id, code: path.aisle.code, name: path.aisle.name },
      rack:  path.rack  && { id: path.rack.id,  code: path.rack.code,  name: path.rack.name  },
      shelf: path.shelf && { id: path.shelf.id, code: path.shelf.code, name: path.shelf.name },
      bin:   path.bin   && { id: path.bin.id,   code: path.bin.code,   name: path.bin.name   },
      label,
    };
    const selected = isBin && selBin?.bin?.id === node.id;
    return (
      <div key={node.id} style={{ marginLeft: 0 }} data-testid={`tree-${level}-${node.code}`}>
        <div className="flex items-center gap-2 py-1.5 text-sm" style={{ paddingLeft: (["zone","aisle","rack","shelf","bin"].indexOf(level)) * 16 }}>
          {hasChildren || isBin ? (
            <button onClick={() => isBin ? setSelBin(pathObj) : toggle(node.id)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5"
                    style={{ color: "var(--ph-fg-subtle)" }}>
              {isBin ? <MapPin size={12} style={{ color: selected ? "var(--ph-accent-warm)" : undefined }} />
                     : <ChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />}
            </button>
          ) : <div className="w-6" />}
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>{level}</span>
          <span className="font-mono text-xs" style={{ color: "var(--ph-fg)" }}>{node.code}</span>
          <span className="text-xs" style={{ color: "var(--ph-fg-muted)" }}>{node.name}</span>
          {isBin && (
            <button onClick={() => setSelBin(pathObj)}
                    className="ml-auto text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                    style={{
                      background: selected ? "var(--ph-accent-warm)" : "transparent",
                      color:      selected ? "#0a0a0f" : "var(--ph-accent-warm)",
                      border:     "1px solid var(--ph-accent-warm)",
                    }}
                    data-testid={`tree-bin-select-${node.code}`}>
              {selected ? "Selected" : "Pick"}
            </button>
          )}
        </div>
        {expanded && nextLevel && (node.children || []).map(c => renderNode(c, nextLevel, path))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.75)" }}
         data-testid="location-modal">
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden" style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border-strong)" }}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div>
            <div className="ph-eyebrow">Pick location</div>
            <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>{product?.name}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--ph-fg-subtle)" }}>
              Assign one or more bins so pickers know where to grab this SKU.
            </p>
            {(product?.category_slug || product?.subcategory_slug) && (
              <div className="flex items-center gap-2 mt-2" data-testid="location-cascade-chips">
                {product?.category_slug && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
                    {product.category_slug}
                  </span>
                )}
                {product?.subcategory_slug && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: "rgba(96,165,250,.15)", color: "#60a5fa" }}>
                    {product.subcategory_slug}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: "var(--ph-fg-subtle)" }}>
                  Tree filtered to matching Aisles / Racks.
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} data-testid="location-modal-close"
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Existing assignments */}
          <section>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>
              Current locations
            </div>
            {assigns.length === 0 ? (
              <div className="p-4 rounded-xl text-sm" style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)" }}
                   data-testid="location-none">
                No location assigned yet. Pick a bin below.
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
                {assigns.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2 px-3 text-sm"
                       style={{ borderBottom: "1px solid var(--ph-border)" }}
                       data-testid={`location-row-${a.id}`}>
                    <MapPin size={14} style={{ color: a.is_primary ? "var(--ph-accent-warm)" : "var(--ph-fg-subtle)" }} />
                    <span style={{ color: "var(--ph-fg)" }}>{a.path?.label || a.bin_id}</span>
                    {a.is_primary && (
                      <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                            style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>Primary</span>
                    )}
                    <span className="ml-auto text-xs" style={{ color: "var(--ph-fg-subtle)" }}>Qty: {a.quantity_at_location}</span>
                    {!a.is_primary && (
                      <button onClick={() => setPrimary(a)} className="text-xs px-2 h-7 rounded"
                              style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)" }}
                              data-testid={`location-primary-${a.id}`}>Make primary</button>
                    )}
                    <button onClick={() => removeAssign(a.id)} className="text-xs px-2 h-7 rounded text-rose-400"
                            style={{ border: "1px solid var(--ph-border-strong)" }}
                            data-testid={`location-remove-${a.id}`}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Warehouse tree picker */}
          <section>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>
              Warehouse tree
            </div>
            {loading ? (
              <p className="text-sm" style={{ color: "var(--ph-fg-subtle)" }}>Loading…</p>
            ) : !filteredTree || filteredTree.zones.length === 0 ? (
              <div className="p-4 rounded-xl text-sm" style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)" }}>
                {tree && tree.zones.length > 0
                  ? "No Aisles or Racks match this product's category. Tag an Aisle/Rack with the matching Category → Subcategory under Warehouse → Storage hierarchy."
                  : "No zones yet. Set up your warehouse first under Warehouse → Storage hierarchy."}
              </div>
            ) : (
              <div className="rounded-xl p-2" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }} data-testid="location-tree">
                {filteredTree.zones.map(z => renderNode(z, "zone", {}))}
              </div>
            )}
          </section>

          {/* Assign form */}
          {selBin && (
            <section className="p-4 rounded-xl" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-accent-warm)" }}>
              <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--ph-accent-warm)" }}>
                Assign to {selBin.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                  Quantity at this location
                  <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0"
                         className={FIELD + " mt-1"} style={fieldStyle} data-testid="location-qty-input" />
                </label>
                <label className="text-xs flex items-center gap-2" style={{ color: "var(--ph-fg-subtle)" }}>
                  <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)}
                         data-testid="location-primary-checkbox" />
                  Mark as primary pick location
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setSelBin(null)} className="px-4 h-10 rounded-lg text-sm"
                        style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
                <button disabled={busy} onClick={submit} className="px-4 h-10 rounded-lg text-sm font-medium"
                        style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                        data-testid="location-assign-btn">
                  {busy ? "Saving…" : "Assign"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

/* --------------------- Bulk SKU → single-bin assignment ------------------- */

/**
 * BulkLocationModal — reuses the warehouse tree but with N products applied
 * to ONE picked bin. Backend endpoint is `/partner/inventory/locations/bulk`
 * which validates the cascade per-product and returns a per-row verdict, so
 * a mixed batch (Fresh Fruits + Dairy) still surfaces individual errors
 * without failing the whole request.
 *
 * Tree filter rule: if every selected product shares the same category
 * (and same subcategory), we filter Aisles/Racks the same way the single
 * LocationModal does. If the selection mixes cascades, we ONLY show
 * untagged Aisles/Racks (so nothing is auto-hidden that the manager can
 * legitimately place all N SKUs into).
 */
const BulkLocationModal = ({ products, onClose, onDone }) => {
  const { warehouse } = usePartner();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selBin, setSelBin] = useState(null);
  const [qty, setQty] = useState("0");
  const [isPrimary, setIsPrimary] = useState(true);
  const [expandedIds, setExpandedIds] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!warehouse) return;
    partnerApi.get(`/partner/warehouse/${warehouse.id}/tree`)
      .then(({ data }) => setTree(data))
      .finally(() => setLoading(false));
  }, [warehouse]);

  const cascade = React.useMemo(() => {
    if (!products.length) return { commonCat: null, commonSub: null, mixed: false };
    const cats = new Set(products.map(p => p.category_slug || null));
    const subs = new Set(products.map(p => p.subcategory_slug || null));
    return {
      commonCat: cats.size === 1 ? [...cats][0] : null,
      commonSub: subs.size === 1 ? [...subs][0] : null,
      mixed:     cats.size > 1 || subs.size > 1,
    };
  }, [products]);

  const filteredTree = React.useMemo(() => {
    if (!tree) return tree;
    const { commonCat, commonSub, mixed } = cascade;
    const filterRack = (r) => {
      if (mixed) return (r.category_slug || r.subcategory_slug) ? null : r;
      if (r.category_slug    && commonCat && r.category_slug    !== commonCat) return null;
      if (r.subcategory_slug && commonSub && r.subcategory_slug !== commonSub) return null;
      return r;
    };
    const filterAisle = (a) => {
      if (mixed && (a.category_slug || a.subcategory_slug)) return null;
      if (a.category_slug    && commonCat && a.category_slug    !== commonCat) return null;
      if (a.subcategory_slug && commonSub && a.subcategory_slug !== commonSub) return null;
      return { ...a, children: (a.children || []).map(filterRack).filter(Boolean) };
    };
    return {
      ...tree,
      zones: tree.zones.map(z => ({ ...z, children: (z.children || []).map(filterAisle).filter(Boolean) })),
    };
  }, [tree, cascade]);

  const toggle = (id) => setExpandedIds(m => ({ ...m, [id]: !m[id] }));

  const renderNode = (node, level, ancestors) => {
    const hasChildren = (node.children || []).length > 0;
    const isBin = level === "bin";
    const expanded = !!expandedIds[node.id];
    const nextLevel = { zone: "aisle", aisle: "rack", rack: "shelf", shelf: "bin", bin: null }[level];
    const path = { ...ancestors, [level]: node };
    const levels = ["zone", "aisle", "rack", "shelf", "bin"];
    const labels = ["Zone", "Aisle", "Rack", "Shelf", "Bin"];
    const label = levels.map((L, i) => path[L] ? `${labels[i]} ${path[L].code}` : null)
                        .filter(Boolean).join(" · ");
    const pathObj = { ...path, label };
    const selected = isBin && selBin?.bin?.id === node.id;
    return (
      <div key={node.id} data-testid={`bulk-tree-${level}-${node.code}`}>
        <div className="flex items-center gap-2 py-1.5 text-sm" style={{ paddingLeft: levels.indexOf(level) * 16 }}>
          {hasChildren || isBin ? (
            <button onClick={() => isBin ? setSelBin(pathObj) : toggle(node.id)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5"
                    style={{ color: "var(--ph-fg-subtle)" }}>
              {isBin ? <MapPin size={12} style={{ color: selected ? "var(--ph-accent-warm)" : undefined }} />
                     : <ChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />}
            </button>
          ) : <div className="w-6" />}
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>{level}</span>
          <span className="font-mono text-xs" style={{ color: "var(--ph-fg)" }}>{node.code}</span>
          <span className="text-xs" style={{ color: "var(--ph-fg-muted)" }}>{node.name}</span>
          {isBin && (
            <button onClick={() => setSelBin(pathObj)}
                    className="ml-auto text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                    style={{
                      background: selected ? "var(--ph-accent-warm)" : "transparent",
                      color:      selected ? "#0a0a0f" : "var(--ph-accent-warm)",
                      border:     "1px solid var(--ph-accent-warm)",
                    }}
                    data-testid={`bulk-bin-select-${node.code}`}>
              {selected ? "Selected" : "Pick"}
            </button>
          )}
        </div>
        {expanded && nextLevel && (node.children || []).map(c => renderNode(c, nextLevel, path))}
      </div>
    );
  };

  const submit = async () => {
    if (!selBin?.bin?.id) return toast.error("Pick a bin first");
    setBusy(true);
    try {
      const { data } = await partnerApi.post(`/partner/inventory/locations-bulk`, {
        partner_product_ids: products.map(p => p.id),
        bin_id:               selBin.bin.id,
        quantity_at_location: Number(qty) || 0,
        is_primary:           isPrimary,
      });
      setResult(data);
      if (data.failed === 0) {
        toast.success(`${data.assigned} SKU${data.assigned === 1 ? "" : "s"} placed at ${data.bin_path?.label || selBin.label}`);
        onDone?.(data);
      } else if (data.assigned === 0) {
        toast.error(`All ${data.requested} SKUs failed. See details below.`);
      } else {
        toast.warning(`${data.assigned} placed · ${data.failed} failed — see details below.`);
      }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
         style={{ background: "rgba(6,8,14,.7)", backdropFilter: "blur(6px)" }}
         onClick={onClose} data-testid="bulk-location-modal">
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden"
           style={{ background: "var(--ph-bg)", border: "1px solid var(--ph-border-strong)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div>
            <div className="ph-eyebrow">Bulk-assign location</div>
            <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>
              Placing {products.length} SKU{products.length === 1 ? "" : "s"}
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--ph-fg-subtle)" }}>
              Pick <b>one bin</b> and we&apos;ll assign every selected product there — perfect for first-time store setup.
            </p>
            {cascade.mixed ? (
              <div className="mt-2 text-[11px] px-2 py-1 rounded inline-block"
                   style={{ background: "rgba(252,196,76,.14)", color: "#FCC44C" }}
                   data-testid="bulk-mixed-warning">
                Selection spans multiple categories — only untagged Aisles/Racks are shown.
              </div>
            ) : (cascade.commonCat || cascade.commonSub) ? (
              <div className="flex items-center gap-2 mt-2" data-testid="bulk-cascade-chips">
                {cascade.commonCat && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
                    {cascade.commonCat}
                  </span>
                )}
                {cascade.commonSub && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: "rgba(96,165,250,.15)", color: "#60a5fa" }}>
                    {cascade.commonSub}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: "var(--ph-fg-subtle)" }}>
                  Tree filtered to matching Aisles / Racks.
                </span>
              </div>
            ) : null}
          </div>
          <button onClick={onClose} data-testid="bulk-modal-close"
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
          <div className="flex flex-wrap gap-1.5" data-testid="bulk-selected-chips">
            {products.slice(0, 20).map(p => (
              <span key={p.id} className="text-[11px] px-2 py-1 rounded"
                    style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)", color: "var(--ph-fg)" }}>
                {p.name}
              </span>
            ))}
            {products.length > 20 && (
              <span className="text-[11px] px-2 py-1 rounded"
                    style={{ background: "var(--ph-card)", color: "var(--ph-fg-subtle)", border: "1px solid var(--ph-border)" }}>
                +{products.length - 20} more
              </span>
            )}
          </div>

          <section>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>
              Warehouse tree
            </div>
            {loading ? (
              <p className="text-sm" style={{ color: "var(--ph-fg-subtle)" }}>Loading…</p>
            ) : !filteredTree || filteredTree.zones.length === 0 ? (
              <div className="p-4 rounded-xl text-sm" style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)" }}>
                {tree && tree.zones.length > 0
                  ? "No Aisles or Racks match your selection. Try picking fewer categories at once, or tag an Aisle with the matching category."
                  : "No zones yet. Set up your warehouse first under Warehouse → Storage hierarchy."}
              </div>
            ) : (
              <div className="rounded-xl p-2" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }} data-testid="bulk-location-tree">
                {filteredTree.zones.map(z => renderNode(z, "zone", {}))}
              </div>
            )}
          </section>

          {selBin && !result && (
            <section className="p-4 rounded-xl" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-accent-warm)" }}>
              <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--ph-accent-warm)" }}>
                Assign {products.length} SKU{products.length === 1 ? "" : "s"} to {selBin.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                  Qty per SKU at this location
                  <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0"
                         className={FIELD + " mt-1"} style={fieldStyle} data-testid="bulk-qty-input" />
                </label>
                <label className="text-xs flex items-center gap-2" style={{ color: "var(--ph-fg-subtle)" }}>
                  <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)}
                         data-testid="bulk-primary-checkbox" />
                  Mark as primary pick location for each SKU
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setSelBin(null)} className="px-4 h-10 rounded-lg text-sm"
                        style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
                <button disabled={busy} onClick={submit} className="px-4 h-10 rounded-lg text-sm font-medium"
                        style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                        data-testid="bulk-assign-submit">
                  {busy ? "Saving…" : `Place ${products.length} SKU${products.length === 1 ? "" : "s"} here`}
                </button>
              </div>
            </section>
          )}

          {result && (
            <section className="p-4 rounded-xl" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}
                     data-testid="bulk-result-panel">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-accent-warm)" }}>Result</div>
                  <div className="text-sm mt-1" style={{ color: "var(--ph-fg)" }}>
                    <b style={{ color: "#77BC1F" }}>{result.assigned}</b> placed · <b style={{ color: "#FF4C52" }}>{result.failed}</b> failed
                  </div>
                </div>
                <button onClick={onClose} className="px-3 h-9 rounded-lg text-xs font-medium"
                        style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
                        data-testid="bulk-result-done">Done</button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {result.results.map((r) => (
                  <div key={r.partner_product_id} className="flex items-center gap-2 py-1.5 text-xs"
                       style={{ borderBottom: "1px solid var(--ph-border)" }}
                       data-testid={`bulk-result-${r.partner_product_id}`}>
                    <span className="w-2 h-2 rounded-full"
                          style={{ background: r.status === "ok" ? "#77BC1F" : "#FF4C52" }} />
                    <span className="font-mono" style={{ color: "var(--ph-fg-muted)" }}>{r.sku_code || r.partner_product_id}</span>
                    <span className="ml-auto" style={{ color: r.status === "ok" ? "#77BC1F" : "#FF4C52" }}>
                      {r.status === "ok" ? "Placed" : (r.message || r.code)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

/* --------------------- Supplier image manager modal ---------------------- */

/**
 * ImageManagerModal — supplier gallery editor for a single PartnerProduct.
 * Backed by POST /partner/products/{id}/images/upload + PATCH …/images.
 *
 * UX contract:
 *   • Grid of thumbnails; the first one is treated as the primary and shows
 *     a star badge. Any thumbnail can be promoted with the "Set primary"
 *     button (which just moves it to index 0 via a reorder call).
 *   • ↑/↓ arrows nudge the ordering — simpler + more accessible than DnD.
 *   • Trash removes from the gallery (does NOT purge from object storage —
 *     that's a future cleanup job outside the supplier's mental model).
 *   • Upload accepts JPG/PNG/WebP up to 6 MB, max 8 images. Backend rejects
 *     mismatches so the frontend hint is best-effort.
 *
 * The parent `onSaved` refetch is fired after every network mutation so
 * cascading state (badge count, thumbnail preview) stays in sync.
 */
const ImageManagerModal = ({ open, onClose, product, onSaved }) => {
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setImages(product?.images || []);
  }, [product?.id, product?.images]);

  if (!open) return null;

  const apiBase = process.env.REACT_APP_BACKEND_URL;
  const absUrl = (u) => u?.startsWith("/api/") ? `${apiBase}${u}` : u;

  const persist = async (nextList) => {
    setBusy(true);
    try {
      const { data } = await partnerApi.patch(
        `/partner/products/${product.id}/images`,
        { image_urls: nextList },
      );
      setImages(data.images || []);
      onSaved?.();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally { setBusy(false); }
  };

  const move = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  };
  const remove = (idx) => {
    if (!window.confirm("Remove this image from the gallery?")) return;
    persist(images.filter((_, i) => i !== idx));
  };
  const setPrimary = (idx) => {
    if (idx === 0) return;
    const next = [images[idx], ...images.filter((_, i) => i !== idx)];
    persist(next);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return toast.error("Only JPG, PNG or WebP images accepted.");
    }
    if (file.size > 6 * 1024 * 1024) {
      return toast.error("Image must be ≤ 6 MB.");
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await partnerApi.post(
        `/partner/products/${product.id}/images/upload`, fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setImages(data.images || []);
      onSaved?.();
      toast.success("Image added");
    } catch (err) { toast.error(errMsg(err)); }
    finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
         style={{ background: "rgba(6,8,14,.7)", backdropFilter: "blur(6px)" }}
         onClick={onClose} data-testid="image-manager-modal">
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
           style={{ background: "var(--ph-bg)", border: "1px solid var(--ph-border-strong)" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--ph-border)" }}>
          <div>
            <div className="ph-eyebrow">Product images</div>
            <h2 className="ph-h3 mt-1" style={{ color: "var(--ph-fg)" }}>{product?.name}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--ph-fg-subtle)" }}>
              Add up to 8 images (JPG · PNG · WebP · ≤ 6 MB). The first image is used as the primary thumbnail.
            </p>
          </div>
          <button onClick={onClose} data-testid="image-manager-close"
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {images.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed"
                 style={{ borderColor: "var(--ph-border-strong)", background: "var(--ph-card)" }}
                 data-testid="image-manager-empty">
              <ImageIcon size={26} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>
                No images yet. Upload one to start.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="image-manager-grid">
              {images.map((src, idx) => (
                <div key={src} className="rounded-xl overflow-hidden border"
                     style={{ borderColor: idx === 0 ? "var(--ph-accent-warm)" : "var(--ph-border)" }}
                     data-testid={`image-tile-${idx}`}>
                  <div className="relative aspect-square bg-black/20">
                    <img src={absUrl(src)} alt={`${product?.name} ${idx + 1}`}
                         className="w-full h-full object-cover" loading="lazy" />
                    {idx === 0 && (
                      <span className="absolute top-2 left-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}>
                        <Star size={9} fill="#0a0a0f" /> Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5"
                       style={{ background: "var(--ph-card)" }}>
                    <div className="flex items-center gap-1">
                      <button disabled={busy || idx === 0}
                              onClick={() => move(idx, -1)}
                              data-testid={`image-tile-${idx}-up`}
                              title="Move up"
                              className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-30"
                              style={{ color: "var(--ph-fg-muted)" }}>
                        <ArrowUp size={12} />
                      </button>
                      <button disabled={busy || idx === images.length - 1}
                              onClick={() => move(idx, 1)}
                              data-testid={`image-tile-${idx}-down`}
                              title="Move down"
                              className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-30"
                              style={{ color: "var(--ph-fg-muted)" }}>
                        <ArrowDown size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {idx > 0 && (
                        <button disabled={busy}
                                onClick={() => setPrimary(idx)}
                                data-testid={`image-tile-${idx}-primary`}
                                className="text-[10px] uppercase tracking-widest px-2 h-7 rounded"
                                style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-accent-warm)" }}>
                          Set primary
                        </button>
                      )}
                      <button disabled={busy}
                              onClick={() => remove(idx)}
                              data-testid={`image-tile-${idx}-remove`}
                              title="Remove"
                              className="w-7 h-7 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/10">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                 className="hidden" onChange={onUpload}
                 data-testid="image-manager-file-input" />

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
              {images.length} / 8 image{images.length === 1 ? "" : "s"}
            </div>
            <button
              disabled={uploading || busy || images.length >= 8}
              onClick={() => fileInputRef.current?.click()}
              data-testid="image-manager-upload-btn"
              className="px-4 h-10 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
            >
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                         : <><UploadIcon size={14} /> Add image</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------- Editable product row -------------------------- */

const ProductRow = ({ p, onChange, selected = false, onToggleSelect = null }) => {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(p.partner_price));
  const [stock, setStock] = useState(String(p.stock_qty));
  const [showLocation, setShowLocation] = useState(false);
  const [showImages, setShowImages] = useState(false);
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
         style={{ borderBottom: "1px solid var(--ph-border)",
                  background: selected ? "var(--ph-warm-soft)" : undefined }}
         data-testid={`product-row-${p.id}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(p.id)}
          data-testid={`product-select-${p.id}`}
          aria-label={`Select ${p.name}`}
          className="w-4 h-4 accent-orange-500 shrink-0"
        />
      )}
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
        {p.primary_location?.label ? (
          <div className="flex items-center gap-1 mt-1 text-xs" data-testid={`product-location-${p.id}`}
               style={{ color: "var(--ph-accent-warm)" }}>
            <MapPin size={11} /> {p.primary_location.label}
          </div>
        ) : (
          <div className="text-xs mt-1" style={{ color: "var(--ph-fg-subtle)" }}
               data-testid={`product-location-none-${p.id}`}>
            No pick location set
          </div>
        )}
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
          <button onClick={() => setShowLocation(true)} className="px-2 h-8 text-xs rounded flex items-center gap-1"
                  style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-location-${p.id}`}>
            <MapPin size={12} /> Location
          </button>
          <button onClick={() => setShowImages(true)} className="px-2 h-8 text-xs rounded flex items-center gap-1"
                  style={{ color: p.images_review_status === "rejected" ? "#FF4C52" : "var(--ph-accent-warm)",
                           border: `1px solid ${p.images_review_status === "rejected" ? "#FF4C52" : "var(--ph-border-strong)"}` }}
                  data-testid={`row-images-${p.id}`}
                  title={p.images_review_note || "Manage gallery"}>
            <ImageIcon size={12} /> Images
            {(p.images?.length || 0) > 0 && (
              <span className="text-[10px] font-bold px-1 rounded"
                    style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
                {p.images.length}
              </span>
            )}
            {p.images_review_status === "pending" && (
              <span className="text-[9px] uppercase tracking-widest px-1 rounded"
                    style={{ background: "rgba(252,196,76,.2)", color: "#FCC44C" }}
                    data-testid={`row-images-pending-${p.id}`}>Pending</span>
            )}
            {p.images_review_status === "rejected" && (
              <span className="text-[9px] uppercase tracking-widest px-1 rounded"
                    style={{ background: "rgba(255,76,82,.2)", color: "#FF4C52" }}
                    data-testid={`row-images-rejected-${p.id}`}>Rejected</span>
            )}
          </button>
          <button onClick={toggleActive} className="px-2 h-8 text-xs rounded"
                  style={{ color: p.is_active ? "var(--ph-fg-muted)" : "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-toggle-${p.id}`}>{p.is_active ? "Hide" : "Show"}</button>
          <button onClick={remove} className="px-2 h-8 text-xs rounded text-rose-400"
                  style={{ border: "1px solid var(--ph-border-strong)" }}
                  data-testid={`row-delete-${p.id}`}>Delete</button>
        </>
      )}
      <LocationModal
        open={showLocation}
        onClose={() => setShowLocation(false)}
        product={p}
        onSaved={onChange}
      />
      <ImageManagerModal
        open={showImages}
        onClose={() => setShowImages(false)}
        product={p}
        onSaved={onChange}
      />
    </div>
  );
};

/* ----------------------------- Main page --------------------------------- */

export const ProductsPage = () => {
  const { partner } = usePartner();
  const country = partner?.country || "CI";
  const [state, setState] = useState({ items: [], total: 0, live: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  // Fixing_Prompt (2026-02-27) — cascading catalog filters. When the
  // admin picks a category, only its subcategories show; picking a
  // subcategory further narrows the products list. Empty selection =
  // "All Categories" / "All Subcategories".
  const [cats, setCats]     = useState([]);
  const [subs, setSubs]     = useState([]);
  const [catSel, setCatSel] = useState("");
  const [subSel, setSubSel] = useState("");
  // Ops Bulk Assign (2026-02-27) — multi-select state. Set of PartnerProduct ids
  // that survive filter changes so a manager can filter → tick → filter → tick
  // → assign in one pass. Keeping a Set (not an array) so add/remove are O(1)
  // and the "select all visible" toggle stays snappy on 200-row pages.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showBulk, setShowBulk] = useState(false);
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const load = async () => {
    const params = new URLSearchParams();
    if (catSel) params.set("category", catSel);
    if (subSel) params.set("subcategory", subSel);
    const suffix = params.toString();
    const { data } = await partnerApi.get(`/partner/products${suffix ? `?${suffix}` : ""}`);
    setState(data);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [catSel, subSel]);

  // Categories bootstrap + subcategory cascade on category change.
  useEffect(() => {
    partnerApi.get(`/mart/categories?country=${country}`).then(r => setCats(r.data || [])).catch(() => setCats([]));
  }, [country]);
  useEffect(() => {
    if (!catSel) { setSubs([]); setSubSel(""); return; }
    partnerApi.get(`/mart/subcategories?country=${country}&category=${encodeURIComponent(catSel)}`)
      .then(r => setSubs(r.data || []))
      .catch(() => setSubs([]));
    setSubSel(""); // reset when parent changes
  }, [catSel, country]);

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

      {/* Search + cascading filters row */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_220px_220px] gap-3">
        <div className="relative">
          <Search size={14} style={{ color: "var(--ph-fg-subtle)", position: "absolute", left: 12, top: 13 }} />
          <input placeholder="Search your catalog" value={q} onChange={e => setQ(e.target.value)}
                 className={FIELD + " pl-9"} style={fieldStyle} data-testid="products-search-input" />
        </div>
        <select value={catSel} onChange={e => setCatSel(e.target.value)}
                className={FIELD} style={fieldStyle} data-testid="products-category-filter">
          <option value="">All Categories</option>
          {cats.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={subSel} onChange={e => setSubSel(e.target.value)}
                disabled={!catSel}
                className={FIELD} style={{ ...fieldStyle, opacity: catSel ? 1 : 0.55 }}
                data-testid="products-subcategory-filter">
          <option value="">All Subcategories</option>
          {subs.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {/* Select-all-visible header — appears only when there's ≥ 1 row */}
        {filtered.length > 0 && (() => {
          const allVisibleSelected = filtered.every(p => selectedIds.has(p.id));
          return (
            <div className="flex items-center gap-3 py-2 px-4 text-xs"
                 style={{ borderBottom: "1px solid var(--ph-border)", color: "var(--ph-fg-subtle)" }}>
              <input
                type="checkbox"
                data-testid="products-select-all"
                aria-label={allVisibleSelected ? "Deselect all visible" : "Select all visible"}
                checked={allVisibleSelected}
                onChange={() => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (allVisibleSelected) filtered.forEach(p => next.delete(p.id));
                  else                    filtered.forEach(p => next.add(p.id));
                  return next;
                })}
                className="w-4 h-4 accent-orange-500"
              />
              <span>
                {selectedIds.size > 0
                  ? <><b style={{ color: "var(--ph-fg)" }}>{selectedIds.size}</b> selected</>
                  : "Select multiple to bulk-assign a bin"}
              </span>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())}
                        className="ml-auto text-[11px] hover:underline"
                        data-testid="products-clear-selection">Clear</button>
              )}
            </div>
          );
        })()}

        {filtered.length === 0
          ? (
            <div className="p-10 text-center">
              <Package size={32} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
              <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>
                {state.total === 0 ? "No products yet. Click + Add product to start." : "No products match your search."}
              </p>
            </div>
          )
          : filtered.map(p => (
              <ProductRow
                key={p.id}
                p={p}
                onChange={load}
                selected={selectedIds.has(p.id)}
                onToggleSelect={toggleSelect}
              />
            ))
        }
      </div>

      {/* Floating bulk-assign action bar — sticks to bottom-centre while ≥ 1 SKU is picked */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl shadow-2xl px-4 py-3"
          style={{ background: "var(--ph-card)", border: "1px solid var(--ph-accent-warm)",
                   boxShadow: "0 22px 48px -18px rgba(0,0,0,.6)" }}
          data-testid="products-bulk-action-bar"
        >
          <span className="text-sm" style={{ color: "var(--ph-fg)" }}>
            <b>{selectedIds.size}</b> SKU{selectedIds.size === 1 ? "" : "s"} ready to place
          </span>
          <button
            onClick={() => setShowBulk(true)}
            className="px-4 h-9 rounded-lg text-sm font-semibold flex items-center gap-1.5"
            style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }}
            data-testid="products-bulk-assign-btn"
          >
            <MapPin size={14} /> Assign to bin
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 h-9 rounded-lg text-xs"
            style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}
            data-testid="products-bulk-clear"
          >
            Cancel
          </button>
        </div>
      )}

      {showBulk && (
        <BulkLocationModal
          products={filtered.filter(p => selectedIds.has(p.id))}
          onClose={() => setShowBulk(false)}
          onDone={(result) => {
            setShowBulk(false);
            // Only clear the SKUs that actually got placed — failed ones
            // stay ticked so the manager can retry them on another bin.
            if (result?.results?.length) {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                result.results.forEach(r => { if (r.status === "ok") next.delete(r.partner_product_id); });
                return next;
              });
            } else {
              setSelectedIds(new Set());
            }
            load();
          }}
        />
      )}

      <AddProductModal open={showAdd} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />
    </div>
  );
};
