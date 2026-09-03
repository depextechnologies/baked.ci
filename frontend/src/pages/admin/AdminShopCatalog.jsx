/**
 * Super Admin — SHOPbakēd Catalog Editor (categories + sub-categories).
 *
 * Route: /admin/modules/shop/catalog
 *
 * Left pane: list categories in the current country (CI/IN).
 * Right pane: sub-categories of the selected category.
 * Modal-driven CRUD for both entities. Slugs immutable after create.
 *
 * Backend: `/api/admin/modules/shop/{categories,subcategories}`.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Boxes, Plus, Pencil, Trash2, X, ChevronRight, Search, Image as ImageIcon,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const SHOP_ACCENT = "#FCC44C";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminShopCatalog = () => {
  const [country, setCountry] = useState("CI");
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  const [selCatId, setSelCatId] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { kind: "cat"|"sub", isNew, ...fields }

  const loadCats = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get("/admin/modules/shop/categories", { params: { country } });
      setCats(data.items || []);
      if (!selCatId && data.items?.length) setSelCatId(data.items[0].id);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [country, selCatId]);

  const loadSubs = useCallback(async () => {
    if (!selCatId) { setSubs([]); return; }
    try {
      const { data } = await adminApi.get("/admin/modules/shop/subcategories", {
        params: { category_id: selCatId, country },
      });
      setSubs(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
  }, [selCatId, country]);

  useEffect(() => { loadCats(); }, [country]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSubs(); }, [loadSubs]);

  const selCat = useMemo(() => cats.find((c) => c.id === selCatId) || null, [cats, selCatId]);

  const filteredCats = useMemo(() => {
    if (!q.trim()) return cats;
    const s = q.toLowerCase();
    return cats.filter((c) => c.slug.includes(s) || c.name_en?.toLowerCase().includes(s) || c.name_fr?.toLowerCase().includes(s));
  }, [cats, q]);

  const save = async () => {
    const e = editing;
    if (!e) return;
    try {
      if (e.kind === "cat") {
        if (e.isNew) {
          await adminApi.post("/admin/modules/shop/categories", {
            slug: e.slug.trim(), country,
            name_en: e.name_en || null, name_fr: e.name_fr || null,
            icon: e.icon || null, image: e.image || null,
            order: Number(e.order) || 0,
          });
          toast.success("Category created");
        } else {
          await adminApi.patch(`/admin/modules/shop/categories/${e.id}`, {
            name_en: e.name_en || null, name_fr: e.name_fr || null,
            icon: e.icon || null, image: e.image || null,
            order: Number(e.order) || 0,
          });
          toast.success("Category updated");
        }
        setEditing(null);
        loadCats();
      } else if (e.kind === "sub") {
        if (e.isNew) {
          await adminApi.post("/admin/modules/shop/subcategories", {
            slug: e.slug.trim(), category_id: e.category_id, country,
            name_en: e.name_en || null, name_fr: e.name_fr || null,
            image: e.image || null, order: Number(e.order) || 0,
          });
          toast.success("Sub-category created");
        } else {
          await adminApi.patch(`/admin/modules/shop/subcategories/${e.id}`, {
            name_en: e.name_en || null, name_fr: e.name_fr || null,
            image: e.image || null, order: Number(e.order) || 0,
          });
          toast.success("Sub-category updated");
        }
        setEditing(null);
        loadSubs();
        loadCats();
      }
    } catch (err) { toast.error(errMsg(err)); }
  };

  const del = async (kind, id) => {
    if (!window.confirm(`Delete this ${kind === "cat" ? "category" : "sub-category"}? This cannot be undone.`)) return;
    try {
      await adminApi.delete(`/admin/modules/shop/${kind === "cat" ? "categories" : "subcategories"}/${id}`);
      toast.success("Deleted");
      if (kind === "cat") { if (selCatId === id) setSelCatId(null); loadCats(); }
      else { loadSubs(); loadCats(); }
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-shop-catalog">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest" style={{ color: SHOP_ACCENT }}>SHOPbakēd</div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Boxes size={18} /> Catalog</h2>
          <p className="text-xs text-muted-foreground">Manage SHOP categories and sub-categories per country. Slugs are permanent — pick carefully.</p>
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)}
          data-testid="shop-catalog-country"
          className="h-9 px-3 rounded-lg bg-secondary border border-border text-xs">
          <option value="CI">CI</option>
          <option value="IN">IN</option>
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Categories pane */}
        <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-catalog-cats">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="text-sm font-semibold flex-1">Categories <span className="text-muted-foreground">({cats.length})</span></div>
            <button onClick={() => setEditing({ kind: "cat", isNew: true, slug: "", name_en: "", name_fr: "", icon: "", image: "", order: cats.length })}
              data-testid="shop-catalog-add-cat"
              className="h-8 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1"
              style={{ background: SHOP_ACCENT }}>
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                data-testid="shop-catalog-cat-search"
                placeholder="Search categories…"
                className="w-full h-8 pl-8 pr-3 rounded-md bg-secondary border border-border text-xs" />
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {busy && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
            {!busy && filteredCats.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">No categories match.</div>
            )}
            {!busy && filteredCats.map((c) => {
              const on = c.id === selCatId;
              return (
                <div key={c.id} onClick={() => setSelCatId(c.id)}
                  data-testid={`shop-catalog-cat-row-${c.slug}`}
                  className="p-3 border-t border-border cursor-pointer hover:bg-secondary/30 flex items-center gap-3"
                  style={on ? { background: `${SHOP_ACCENT}18` } : {}}>
                  <div className="w-10 h-10 rounded-lg bg-secondary/60 shrink-0 overflow-hidden flex items-center justify-center">
                    {c.image ? <img src={c.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <ImageIcon size={14} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.name_en || c.slug}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.slug} · {c.subcategory_count} sub · order {c.order}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setEditing({ kind: "cat", isNew: false, ...c }); }}
                    data-testid={`shop-catalog-edit-cat-${c.slug}`}
                    className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground">
                    <Pencil size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); del("cat", c.id); }}
                    data-testid={`shop-catalog-del-cat-${c.slug}`}
                    className="w-7 h-7 rounded-md hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center text-muted-foreground">
                    <Trash2 size={12} />
                  </button>
                  <ChevronRight size={12} className="text-muted-foreground" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Sub-categories pane */}
        <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-catalog-subs">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="text-sm font-semibold flex-1">
              Sub-categories {selCat && <span className="text-muted-foreground">of {selCat.name_en || selCat.slug} ({subs.length})</span>}
            </div>
            {selCat && (
              <button onClick={() => setEditing({ kind: "sub", isNew: true, slug: "", category_id: selCat.id, name_en: "", name_fr: "", image: "", order: subs.length })}
                data-testid="shop-catalog-add-sub"
                className="h-8 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1"
                style={{ background: SHOP_ACCENT }}>
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {!selCat && <div className="p-10 text-center text-xs text-muted-foreground">Select a category to see its sub-categories.</div>}
            {selCat && subs.length === 0 && (
              <div className="p-10 text-center text-xs text-muted-foreground">No sub-categories yet. Add one with the button above.</div>
            )}
            {selCat && subs.map((s) => (
              <div key={s.id} data-testid={`shop-catalog-sub-row-${s.slug}`}
                className="p-3 border-t border-border flex items-center gap-3 hover:bg-secondary/20">
                <div className="w-10 h-10 rounded-lg bg-secondary/60 shrink-0 overflow-hidden flex items-center justify-center">
                  {s.image ? <img src={s.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <ImageIcon size={14} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{s.name_en || s.slug}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{s.slug} · order {s.order}</div>
                </div>
                <button onClick={() => setEditing({ kind: "sub", isNew: false, ...s })}
                  data-testid={`shop-catalog-edit-sub-${s.slug}`}
                  className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground">
                  <Pencil size={12} />
                </button>
                <button onClick={() => del("sub", s.id)}
                  data-testid={`shop-catalog-del-sub-${s.slug}`}
                  className="w-7 h-7 rounded-md hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center text-muted-foreground">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" data-testid="shop-catalog-modal" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-lg font-bold">
                {editing.isNew ? `Add ${editing.kind === "cat" ? "Category" : "Sub-category"}` : `Edit ${editing.kind === "cat" ? "Category" : "Sub-category"}`}
              </div>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editing.isNew && (
                <Field label="Slug (permanent)" required>
                  <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    data-testid="shop-catalog-field-slug"
                    placeholder="e.g. accessoires-mode" className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name (English)">
                  <input value={editing.name_en || ""} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                    data-testid="shop-catalog-field-name-en"
                    className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
                </Field>
                <Field label="Name (Français)">
                  <input value={editing.name_fr || ""} onChange={(e) => setEditing({ ...editing, name_fr: e.target.value })}
                    data-testid="shop-catalog-field-name-fr"
                    className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
                </Field>
              </div>
              {editing.kind === "cat" && (
                <Field label="Icon (lucide key)">
                  <input value={editing.icon || ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                    data-testid="shop-catalog-field-icon"
                    placeholder="e.g. shopping-bag" className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
                </Field>
              )}
              <Field label="Image URL">
                <input value={editing.image || ""} onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                  data-testid="shop-catalog-field-image"
                  placeholder="https://…" className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
              </Field>
              <Field label="Order">
                <input type="number" value={editing.order ?? 0} onChange={(e) => setEditing({ ...editing, order: e.target.value })}
                  data-testid="shop-catalog-field-order"
                  className="w-32 h-10 px-3 rounded-lg bg-secondary border border-border text-sm" />
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="h-10 px-4 rounded-lg text-sm border border-border">Cancel</button>
              <button onClick={save} data-testid="shop-catalog-save-btn"
                className="h-10 px-5 rounded-lg text-sm font-semibold text-black"
                style={{ background: SHOP_ACCENT }}>
                {editing.isNew ? "Create" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, required, children }) => (
  <label className="block">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </div>
    {children}
  </label>
);

export default AdminShopCatalog;
