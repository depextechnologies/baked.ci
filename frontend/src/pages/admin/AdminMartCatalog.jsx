/**
 * Admin — MARTbakēd Catalog Manager
 *
 * Tabs: Categories · Subcategories · Brands · Products
 * Full CRUD backed by `/api/admin/mart/*` routes added in Phase 2.
 *
 * Used inside the Module workspace at `/admin/modules/mart/catalog`.
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PlusCircle, Trash2, Edit3, Search, Package, LayersIcon, Tag as TagIcon, Boxes as BoxesIcon, X } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";

const fmtMoney = (n, ccy) => `${(n || 0).toLocaleString("en-US")} ${ccy || ""}`.trim();
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const TABS = [
  { key: "categories", label: "Categories", icon: LayersIcon },
  { key: "subcategories", label: "Subcategories", icon: LayersIcon },
  { key: "brands", label: "Brands", icon: TagIcon },
  { key: "products", label: "Products", icon: Package },
];

/* ---------------------------- Category Manager ---------------------------- */

// Fixing_Prompt v8 — whitelist of admin-editable category fields.
// System-managed fields (id, created_at, updated_at, created_by, updated_by,
// deleted_at, version, module, country, slug) MUST NOT be sent in a PATCH
// body — the backend's `CategoryUpdate` DTO forbids extras on purpose so
// mistakes are caught early.
const CATEGORY_EDITABLE = ["name_en", "name_fr", "icon", "image", "order", "is_active"];
const SUBCATEGORY_EDITABLE = ["name_en", "name_fr", "image", "order"];

const pickEditable = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

const CategoriesTab = () => {
  const [items, setItems] = useState([]);
  const [country, setCountry] = useState("CI");
  const [editing, setEditing] = useState(null);
  // Fixing_Prompt v8 — bulk selection state
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const load = async () => {
    setItems((await adminApi.get(`/admin/mart/categories?country=${country}`)).data);
    setSelected(new Set());
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country]);
  const save = async () => {
    if (!editing.slug || !editing.name_en) return toast.error("Slug and English name required");
    try {
      if (editing.id) {
        // PATCH — only editable fields (fix for "Extra inputs are not permitted")
        await adminApi.patch(`/admin/mart/categories/${editing.id}`,
                             pickEditable(editing, CATEGORY_EDITABLE));
      } else {
        // POST — new row still needs slug/country/module etc.
        const body = {
          slug: editing.slug.trim(), country, module: editing.module || "mart",
          ...pickEditable(editing, CATEGORY_EDITABLE),
        };
        await adminApi.post("/admin/mart/categories", body);
      }
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    try {
      await adminApi.delete(`/admin/mart/categories/${id}`);
      toast.success("Deleted"); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const toggleOne = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(x => x.id)));
  };
  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(
      `Delete selected categories?\n\nYou are about to delete ${ids.length} categor${ids.length === 1 ? "y" : "ies"}. ` +
      "This action may affect associated subcategories, products, homepage sections and attribute assignments."
    )) return;
    setBulkBusy(true);
    try {
      const { data } = await adminApi.post("/admin/mart/categories/bulk-delete", { ids });
      const done = (data.deleted || []).length;
      const blocked = (data.blocked || []).length;
      toast.success(`Deleted ${done}${blocked ? ` · ${blocked} blocked by dependents` : ""}`);
      if (blocked) toast.error(`${blocked} skipped — see console for details`);
      // eslint-disable-next-line no-console
      if (blocked) console.warn("Blocked deletions:", data.blocked);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBulkBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="admin-catalog-categories">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Categories</h3>
          <p className="text-xs text-muted-foreground">Top-level catalog groupings — country-scoped.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())}
                 className="baked-input px-3 py-1.5 bg-secondary text-sm w-20" maxLength={2}
                 data-testid="category-country" placeholder="CI" />
          <Button data-testid="category-add" onClick={() => setEditing({ slug: "", country, name_en: "", name_fr: "", icon: "", image: "", order: (items.length || 0) + 1, module: "mart" })}
                  className="baked-btn bg-primary text-primary-foreground"><PlusCircle size={14} className="mr-1" /> New</Button>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(29,155,240,.08)", border: "1px solid rgba(29,155,240,.3)" }}
             data-testid="categories-bulk-bar">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <Button onClick={bulkDelete} disabled={bulkBusy}
                  data-testid="categories-bulk-delete"
                  className="baked-btn bg-red-500 text-white text-xs">
            Delete Selected
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}
      {editing && (
        <div className="baked-card bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">{editing.id ? "Edit category" : "New category"}</div>
            <button onClick={() => setEditing(null)}><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Slug (e.g. fruits-vegetables)" value={editing.slug}
                   onChange={e => setEditing({ ...editing, slug: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" disabled={!!editing.id}
                   data-testid="cat-input-slug" />
            <input placeholder="Icon (lucide name)" value={editing.icon || ""}
                   onChange={e => setEditing({ ...editing, icon: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" />
            <input placeholder="Name (English)" value={editing.name_en || ""}
                   onChange={e => setEditing({ ...editing, name_en: e.target.value, name: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="cat-input-name-en" />
            <input placeholder="Name (French)" value={editing.name_fr || ""}
                   onChange={e => setEditing({ ...editing, name_fr: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" />
            <input placeholder="Image URL" value={editing.image || ""}
                   onChange={e => setEditing({ ...editing, image: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" />
            <input placeholder="Order" type="number" value={editing.order || 0}
                   onChange={e => setEditing({ ...editing, order: Number(e.target.value) || 0 })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" />
          </div>
          <Button data-testid="cat-save" onClick={save} className="baked-btn bg-primary text-primary-foreground">Save</Button>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={items.length > 0 && selected.size === items.length}
                       onChange={toggleAll} data-testid="cat-select-all" />
              </th>
              <th className="text-left p-3">Slug</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Order</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No categories yet.</td></tr>
              : items.map(c => (
                <tr key={c.id} className="border-t border-border" data-testid={`cat-row-${c.slug}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(c.id)}
                           onChange={() => toggleOne(c.id)}
                           data-testid={`cat-select-${c.slug}`} />
                  </td>
                  <td className="p-3 font-mono text-xs">{c.slug}</td>
                  <td className="p-3">{c.name_en || c.name}<div className="text-[10px] text-muted-foreground">{c.name_fr}</div></td>
                  <td className="p-3 text-xs">{c.country}</td>
                  <td className="p-3 text-xs">{c.order}</td>
                  <td className="p-3 flex gap-1 justify-end">
                    <button onClick={() => setEditing(c)} className="text-xs px-2 py-1 rounded bg-secondary" data-testid={`cat-edit-${c.slug}`}><Edit3 size={12} /></button>
                    <button onClick={() => del(c.id)} className="text-xs px-2 py-1 rounded bg-secondary text-red-500" data-testid={`cat-del-${c.slug}`}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* -------------------------- Subcategories Manager ------------------------- */

const SubcategoriesTab = () => {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [country, setCountry] = useState("CI");
  const [categoryId, setCategoryId] = useState("");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const loadCats = async () => setCats((await adminApi.get(`/admin/mart/categories?country=${country}`)).data);
  const load = async () => {
    const url = `/admin/mart/subcategories?country=${country}${categoryId ? `&category_id=${categoryId}` : ""}`;
    setItems((await adminApi.get(url)).data);
    setSelected(new Set());
  };
  useEffect(() => { loadCats(); }, [country]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country, categoryId]);

  const catName = (id) => cats.find(c => c.id === id)?.name_en || cats.find(c => c.id === id)?.name || "";
  const save = async () => {
    if (!editing.slug || !editing.category_id || !editing.name_en) return toast.error("Slug, category, name required");
    try {
      if (editing.id) {
        // Fixing_Prompt v8 — send only editable fields on PATCH
        await adminApi.patch(`/admin/mart/subcategories/${editing.id}`,
                             pickEditable(editing, SUBCATEGORY_EDITABLE));
      } else {
        const body = {
          slug: editing.slug.trim(), category_id: editing.category_id, country,
          module: editing.module || "mart",
          ...pickEditable(editing, SUBCATEGORY_EDITABLE),
        };
        await adminApi.post("/admin/mart/subcategories", body);
      }
      toast.success("Saved"); setEditing(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this subcategory?")) return;
    await adminApi.delete(`/admin/mart/subcategories/${id}`); toast.success("Deleted"); load();
  };
  const toggleOne = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(x => x.id)));
  };
  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(
      `Delete selected subcategories?\n\nYou are about to delete ${ids.length} subcategor${ids.length === 1 ? "y" : "ies"}. ` +
      "This action may affect associated products, attribute assignments and supplier product requests."
    )) return;
    setBulkBusy(true);
    try {
      const { data } = await adminApi.post("/admin/mart/subcategories/bulk-delete", { ids });
      const done = (data.deleted || []).length;
      const blocked = (data.blocked || []).length;
      toast.success(`Deleted ${done}${blocked ? ` · ${blocked} blocked by dependents` : ""}`);
      // eslint-disable-next-line no-console
      if (blocked) console.warn("Blocked deletions:", data.blocked);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBulkBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="admin-catalog-subcategories">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Subcategories</h3>
          <p className="text-xs text-muted-foreground">Nested under a category.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} className="baked-input px-3 py-1.5 bg-secondary text-sm w-20" maxLength={2} />
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="baked-input px-3 py-1.5 bg-secondary text-sm">
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name_en || c.name}</option>)}
          </select>
          <Button onClick={() => setEditing({ slug: "", category_id: categoryId || cats[0]?.id || "", country, name_en: "", name_fr: "", image: "", order: 0, module: "mart" })}
                  className="baked-btn bg-primary text-primary-foreground" data-testid="subcat-add"><PlusCircle size={14} className="mr-1" /> New</Button>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(29,155,240,.08)", border: "1px solid rgba(29,155,240,.3)" }}
             data-testid="subcategories-bulk-bar">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <Button onClick={bulkDelete} disabled={bulkBusy}
                  data-testid="subcategories-bulk-delete"
                  className="baked-btn bg-red-500 text-white text-xs">Delete Selected</Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}
      {editing && (
        <div className="baked-card bg-card border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Slug" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" disabled={!!editing.id} />
            <select value={editing.category_id} onChange={e => setEditing({ ...editing, category_id: e.target.value })}
                    className="baked-input px-3 py-2 bg-secondary text-sm" disabled={!!editing.id}>
              <option value="">Category…</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name_en || c.name}</option>)}
            </select>
            <input placeholder="Name (English)" value={editing.name_en || ""}
                   onChange={e => setEditing({ ...editing, name_en: e.target.value, name: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" />
            <input placeholder="Name (French)" value={editing.name_fr || ""} onChange={e => setEditing({ ...editing, name_fr: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" />
            <input placeholder="Image URL" value={editing.image || ""} onChange={e => setEditing({ ...editing, image: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="baked-btn bg-primary text-primary-foreground" data-testid="subcat-save">Save</Button>
            <Button onClick={() => setEditing(null)} className="baked-btn bg-secondary text-secondary-foreground">Cancel</Button>
          </div>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" checked={items.length > 0 && selected.size === items.length}
                       onChange={toggleAll} data-testid="subcat-select-all" />
              </th>
              <th className="text-left p-3">Slug</th><th className="text-left p-3">Name</th><th className="text-left p-3">Category</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No subcategories.</td></tr>
              : items.map(s => (
                <tr key={s.id} className="border-t border-border" data-testid={`subcat-row-${s.slug}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)}
                           data-testid={`subcat-select-${s.slug}`} />
                  </td>
                  <td className="p-3 font-mono text-xs">{s.slug}</td>
                  <td className="p-3">{s.name_en || s.name}</td>
                  <td className="p-3 text-xs">{catName(s.category_id)}</td>
                  <td className="p-3 flex gap-1 justify-end">
                    <button onClick={() => setEditing(s)} className="text-xs px-2 py-1 rounded bg-secondary"><Edit3 size={12} /></button>
                    <button onClick={() => del(s.id)} className="text-xs px-2 py-1 rounded bg-secondary text-red-500"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* --------------------------- Brands Manager --------------------------- */

const BrandsTab = () => {
  const [items, setItems] = useState([]);
  const [country, setCountry] = useState("CI");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const load = async () => setItems((await adminApi.get(`/admin/mart/brands?country=${country}${q ? `&q=${encodeURIComponent(q)}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country]);
  const save = async () => {
    if (!editing.slug || !editing.name) return toast.error("Slug & name required");
    try {
      if (editing.id) {
        const { id, slug, country: _c, ...rest } = editing;
        await adminApi.patch(`/admin/mart/brands/${id}`, rest);
      } else {
        await adminApi.post("/admin/mart/brands", { ...editing, country });
      }
      toast.success("Saved"); setEditing(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this brand?")) return;
    await adminApi.delete(`/admin/mart/brands/${id}`); toast.success("Deleted"); load();
  };
  return (
    <div className="space-y-4" data-testid="admin-catalog-brands">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Brands</h3>
          <p className="text-xs text-muted-foreground">Manage brand catalog (country-scoped).</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} className="baked-input px-3 py-1.5 bg-secondary text-sm w-20" maxLength={2} />
          <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} className="baked-input px-3 py-1.5 bg-secondary text-sm" />
          <Button onClick={() => setEditing({ slug: "", country, name: "", logo: "", description: "", is_active: true })}
                  className="baked-btn bg-primary text-primary-foreground" data-testid="brand-add"><PlusCircle size={14} className="mr-1" /> New</Button>
        </div>
      </div>
      {editing && (
        <div className="baked-card bg-card border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Slug" value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" disabled={!!editing.id} data-testid="brand-input-slug" />
            <input placeholder="Name" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                   className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="brand-input-name" />
            <input placeholder="Logo URL" value={editing.logo || ""} onChange={e => setEditing({ ...editing, logo: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" />
            <textarea placeholder="Description" value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" rows={2} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="baked-btn bg-primary text-primary-foreground" data-testid="brand-save">Save</Button>
            <Button onClick={() => setEditing(null)} className="baked-btn bg-secondary text-secondary-foreground">Cancel</Button>
          </div>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Slug</th><th className="text-left p-3">Name</th><th className="text-left p-3">Country</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No brands yet.</td></tr>
              : items.map(b => (
                <tr key={b.id} className="border-t border-border" data-testid={`brand-row-${b.slug}`}>
                  <td className="p-3 font-mono text-xs">{b.slug}</td>
                  <td className="p-3 flex items-center gap-2">{b.logo && <img src={b.logo} alt="" className="w-6 h-6 rounded object-cover" />}{b.name}</td>
                  <td className="p-3 text-xs">{b.country}</td>
                  <td className="p-3 text-xs">{b.is_active ? "✓" : "—"}</td>
                  <td className="p-3 flex gap-1 justify-end">
                    <button onClick={() => setEditing(b)} className="text-xs px-2 py-1 rounded bg-secondary"><Edit3 size={12} /></button>
                    <button onClick={() => del(b.id)} className="text-xs px-2 py-1 rounded bg-secondary text-red-500"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* --------------------------- Products Manager --------------------------- */

const emptyProduct = () => ({
  name: "", country: "CI", module: "mart", brand: "", brand_id: "", category_slug: "", subcategory_slug: "",
  unit: "", price: 0, currency: "XOF", currency_symbol: "CFA", image: "", images: [], description: "",
  sku_code: "", barcode: "", status: "active", in_stock: true,
  // Phase 1 fields
  manufacturer: "", short_description: "", product_type: "", tags: [], ean_upc: "", tax_hsn_code: "",
  batch_tracking: false, expiry_tracking: false, pack_size: "", net_qty: null, gross_qty: null,
  mrp: null, cost_price: null, tax_pct: null, storage_requirement: "", temperature_class: "",
});

const ProductsTab = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  const [brands, setBrands] = useState([]);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("CI");
  const [editing, setEditing] = useState(null);
  const load = async () => {
    const url = `/admin/mart/products?country=${country}${q ? `&q=${encodeURIComponent(q)}` : ""}&limit=200`;
    const { data } = await adminApi.get(url);
    setItems(data.items); setTotal(data.total);
  };
  const loadRefs = async () => {
    const [c, s, b] = await Promise.all([
      adminApi.get(`/admin/mart/categories?country=${country}`),
      adminApi.get(`/admin/mart/subcategories?country=${country}`),
      adminApi.get(`/admin/mart/brands?country=${country}`),
    ]);
    setCats(c.data); setSubs(s.data); setBrands(b.data);
  };
  useEffect(() => { loadRefs(); load(); /* eslint-disable-next-line */ }, [country]);

  const save = async () => {
    if (!editing.name || !editing.price || !editing.currency) return toast.error("Name, price, currency required");
    try {
      const body = { ...editing };
      if (!body.brand_id) delete body.brand_id;
      if (body.id) {
        const { id, country: _c, module: _m, ...rest } = body;
        await adminApi.patch(`/admin/mart/products/${id}`, rest);
      } else {
        await adminApi.post("/admin/mart/products", body);
      }
      toast.success("Saved"); setEditing(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => {
    if (!window.confirm("Archive this product?")) return;
    await adminApi.delete(`/admin/mart/products/${id}`); toast.success("Archived"); load();
  };

  return (
    <div className="space-y-4" data-testid="admin-catalog-products">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Master Catalog Products</h3>
          <p className="text-xs text-muted-foreground">{total} product(s). Partner stores link to these SKUs.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} className="baked-input px-3 py-1.5 bg-secondary text-sm w-20" maxLength={2} />
          <input placeholder="Search name/SKU/barcode" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} className="baked-input px-3 py-1.5 bg-secondary text-sm w-64" data-testid="prod-search" />
          <Button onClick={load} className="baked-btn bg-secondary text-secondary-foreground"><Search size={14} /></Button>
          <Button onClick={() => setEditing(emptyProduct())} className="baked-btn bg-primary text-primary-foreground" data-testid="prod-add"><PlusCircle size={14} className="mr-1" /> New</Button>
        </div>
      </div>
      {editing && (
        <div className="baked-card bg-card border border-border p-4 space-y-3 relative">
          <button onClick={() => setEditing(null)} className="absolute top-3 right-3"><X size={16} /></button>
          <div className="font-semibold text-sm">{editing.id ? `Edit “${editing.name}”` : "New product"}</div>
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name *" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" data-testid="prod-input-name" />
            <input placeholder="Unit (1 kg)" value={editing.unit || ""} onChange={e => setEditing({ ...editing, unit: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" />
            <input placeholder="Price *" type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-price" />
            <input placeholder="Currency *" value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value.toUpperCase() })} className="baked-input px-3 py-2 bg-secondary text-sm" maxLength={3} />
            <input placeholder="Was price" type="number" value={editing.was_price || ""} onChange={e => setEditing({ ...editing, was_price: Number(e.target.value) || null })} className="baked-input px-3 py-2 bg-secondary text-sm" />
            <select value={editing.category_slug || ""} onChange={e => setEditing({ ...editing, category_slug: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm">
              <option value="">— Category —</option>
              {cats.map(c => <option key={c.id} value={c.slug}>{c.name_en || c.name}</option>)}
            </select>
            <select value={editing.subcategory_slug || ""} onChange={e => setEditing({ ...editing, subcategory_slug: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm">
              <option value="">— Subcategory —</option>
              {subs.filter(s => !editing.category_slug || cats.find(c => c.slug === editing.category_slug)?.id === s.category_id).map(s => <option key={s.id} value={s.slug}>{s.name_en || s.name}</option>)}
            </select>
            <select value={editing.brand_id || ""} onChange={e => setEditing({ ...editing, brand_id: e.target.value, brand: brands.find(b => b.id === e.target.value)?.name || editing.brand })} className="baked-input px-3 py-2 bg-secondary text-sm">
              <option value="">— Brand —</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input placeholder="SKU code" value={editing.sku_code || ""} onChange={e => setEditing({ ...editing, sku_code: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-sku" />
            <input placeholder="Barcode" value={editing.barcode || ""} onChange={e => setEditing({ ...editing, barcode: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-barcode" />
            <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm">
              {["active", "draft", "archived"].map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="Image URL" value={editing.image || ""} onChange={e => setEditing({ ...editing, image: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-3" />
            <textarea placeholder="Description" value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-3" rows={2} />
            {/* ── Phase 1 · Commercial + Compliance + Packaging ── */}
            <div className="col-span-3 pt-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Commercial &amp; compliance</div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Manufacturer" value={editing.manufacturer || ""} onChange={e => setEditing({ ...editing, manufacturer: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" />
                <input placeholder="Short description" value={editing.short_description || ""} onChange={e => setEditing({ ...editing, short_description: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" maxLength={280} />
                <input type="number" step="0.01" min="0" placeholder="MRP" value={editing.mrp ?? ""} onChange={e => setEditing({ ...editing, mrp: e.target.value === "" ? null : Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-mrp" />
                <input type="number" step="0.01" min="0" placeholder="Cost price" value={editing.cost_price ?? ""} onChange={e => setEditing({ ...editing, cost_price: e.target.value === "" ? null : Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-cost" />
                <input type="number" step="0.01" min="0" max="100" placeholder="Tax %" value={editing.tax_pct ?? ""} onChange={e => setEditing({ ...editing, tax_pct: e.target.value === "" ? null : Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-tax" />
                <input placeholder="HSN / tax code" value={editing.tax_hsn_code || ""} onChange={e => setEditing({ ...editing, tax_hsn_code: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" data-testid="prod-input-hsn" />
                <input placeholder="EAN / UPC" value={editing.ean_upc || ""} onChange={e => setEditing({ ...editing, ean_upc: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" />
                <input placeholder="Product type" value={editing.product_type || ""} onChange={e => setEditing({ ...editing, product_type: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" />
              </div>
            </div>
            <div className="col-span-3 pt-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Packaging &amp; storage</div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Pack size (e.g. 12x500ml)" value={editing.pack_size || ""} onChange={e => setEditing({ ...editing, pack_size: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm" />
                <input type="number" step="0.001" min="0" placeholder="Net qty" value={editing.net_qty ?? ""} onChange={e => setEditing({ ...editing, net_qty: e.target.value === "" ? null : Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" />
                <input type="number" step="0.001" min="0" placeholder="Gross qty" value={editing.gross_qty ?? ""} onChange={e => setEditing({ ...editing, gross_qty: e.target.value === "" ? null : Number(e.target.value) })} className="baked-input px-3 py-2 bg-secondary text-sm" />
                <input placeholder="Storage requirement" value={editing.storage_requirement || ""} onChange={e => setEditing({ ...editing, storage_requirement: e.target.value })} className="baked-input px-3 py-2 bg-secondary text-sm col-span-2" />
                <select value={editing.temperature_class || ""} onChange={e => setEditing({ ...editing, temperature_class: e.target.value || null })} className="baked-input px-3 py-2 bg-secondary text-sm">
                  <option value="">Temperature class…</option>
                  <option value="ambient">Ambient</option>
                  <option value="chilled">Chilled</option>
                  <option value="frozen">Frozen</option>
                  <option value="hot">Hot</option>
                </select>
                <label className="flex items-center gap-2 text-xs bg-secondary px-3 py-2 rounded"><input type="checkbox" checked={!!editing.batch_tracking} onChange={e => setEditing({ ...editing, batch_tracking: e.target.checked })} data-testid="prod-input-batch" /> Batch tracking</label>
                <label className="flex items-center gap-2 text-xs bg-secondary px-3 py-2 rounded"><input type="checkbox" checked={!!editing.expiry_tracking} onChange={e => setEditing({ ...editing, expiry_tracking: e.target.checked })} data-testid="prod-input-expiry" /> Expiry tracking</label>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="baked-btn bg-primary text-primary-foreground" data-testid="prod-save">Save product</Button>
          </div>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Product</th>
            <th className="text-left p-3">SKU / Barcode</th>
            <th className="text-left p-3">Brand</th>
            <th className="text-left p-3">Category</th>
            <th className="text-left p-3">Price</th>
            <th className="text-left p-3">Status</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No products.</td></tr>
              : items.map(p => (
                <tr key={p.id} className="border-t border-border" data-testid={`prod-row-${p.id}`}>
                  <td className="p-3 flex items-center gap-2">
                    {p.image && <img src={p.image} alt="" className="w-9 h-9 rounded object-cover" />}
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{p.unit}</div>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs">{p.sku_code || "—"}<div className="text-[10px] text-muted-foreground">{p.barcode || ""}</div></td>
                  <td className="p-3 text-xs">{p.brand}</td>
                  <td className="p-3 text-xs">{p.category_slug}<div className="text-[10px] text-muted-foreground">{p.subcategory_slug}</div></td>
                  <td className="p-3 text-xs">{fmtMoney(p.price, p.currency_symbol || p.currency)}</td>
                  <td className="p-3 text-xs"><span className={`baked-chip px-2 py-0.5 ${p.status === "active" ? "bg-[#77BC1F22] text-[#77BC1F]" : p.status === "draft" ? "bg-[#FCC44C22] text-[#FCC44C]" : "bg-secondary text-muted-foreground"}`}>{p.status}</span></td>
                  <td className="p-3 flex gap-1 justify-end">
                    <button onClick={() => setEditing(p)} className="text-xs px-2 py-1 rounded bg-secondary" data-testid={`prod-edit-${p.id}`}><Edit3 size={12} /></button>
                    <button onClick={() => del(p.id)} className="text-xs px-2 py-1 rounded bg-secondary text-red-500" data-testid={`prod-del-${p.id}`}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---------------------------- Root --------------------------------- */

export const AdminMartCatalog = () => {
  const [tab, setTab] = useState("categories");
  return (
    <div className="space-y-5" data-testid="admin-mart-catalog">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><BoxesIcon size={18} /> MARTbakēd Catalog</h2>
        <p className="text-xs text-muted-foreground">Manage the shared MART master catalog: categories, subcategories, brands and products.</p>
      </div>
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    data-testid={`catalog-tab-${t.key}`}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg ${on ? "text-white bg-[#77BC1F]" : "text-muted-foreground hover:text-foreground"}`}
                    style={on ? { color: "#0a1200" } : {}}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "categories" && <CategoriesTab />}
      {tab === "subcategories" && <SubcategoriesTab />}
      {tab === "brands" && <BrandsTab />}
      {tab === "products" && <ProductsTab />}
    </div>
  );
};

export default AdminMartCatalog;
