/**
 * MenuManager — reusable menu-management surface for FOODbakēd.
 *
 * Mounted TWICE:
 *   • Super-admin route     /admin/modules/food/restaurants/:id/menu
 *   • Restaurant partner    /partner/food/menu  (partner's own restaurant)
 *
 * Both use the exact same `<MenuManager restaurantId={id} api={axiosInstance}/>`.
 * The `api` prop is the axios client carrying the correct Bearer token:
 *   • adminApi   (existing AdminContext)  → super-admin JWT
 *   • partnerApi (FoodPartnerContext)     → food_partner JWT
 *
 * Server enforces isolation — partner tokens are rejected when their
 * restaurant_id doesn't match the route.
 *
 * Features
 *   • Sections: add / rename / reorder / delete.
 *   • Items:    add / rename / edit price / description / image / tags /
 *               availability / spice / veg / move to another section / delete.
 *   • Variants (size / portion) with price delta + one-default enforcement.
 *   • Add-ons  (extras) with price.
 *   • Every image goes through the reusable <FoodImageUploader/>.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, ChevronDown, ChevronUp,
  Utensils, Flame, Leaf, EyeOff, Eye, Layers, Package, AlertTriangle,
} from "lucide-react";
import FoodImageUploader from "../../apps/foodbaked/components/FoodImageUploader";

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Erreur · Error";

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

const Modal = ({ open, onClose, title, children, testId, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid={testId}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} data-testid={`${testId}-close`} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    {children}
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </label>
);

const TextInput = React.forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} className={`h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm ${props.className || ""}`} />;
});

const Btn = ({ children, className = "", ...rest }) => (
  <button {...rest} className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1 ${className}`}>{children}</button>
);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const SectionForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || { name_fr: "", name_en: "", sort_order: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="menu-section-form">
      <Field label="Nom (FR) · Name (FR)">
        <TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="section-form-name-fr" />
      </Field>
      <Field label="Nom (EN) · Name (EN)">
        <TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="section-form-name-en" />
      </Field>
      <Field label="Ordre · Sort order">
        <TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="section-form-sort" />
      </Field>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="section-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} Enregistrer · Save
      </Btn>
    </form>
  );
};

const TAG_SUGGESTIONS = ["popular", "bestseller", "spicy", "vegetarian", "signature", "new", "chef_special", "gluten_free", "vegan"];

const ItemForm = ({ initial, sections, onSave, saving }) => {
  const [f, setF] = useState(initial || {
    section_id: sections[0]?.id || "",
    name: "", description: "", image: "",
    base_price: 0, currency: "XOF",
    is_veg: false, spice_level: 0, tags: [],
    is_available: true, sort_order: 0,
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggleTag = (t) => set("tags", f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4" data-testid="menu-item-form">
      <FoodImageUploader
        value={f.image}
        onChange={(v) => set("image", v)}
        kind="menu_item"
        label="Photo · Item photo"
        testId="menu-item-image"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nom · Name">
          <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} required data-testid="item-form-name" />
        </Field>
        <Field label="Section">
          <select value={f.section_id} onChange={(e) => set("section_id", e.target.value)} required
                  className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                  data-testid="item-form-section">
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name_fr} · {s.name_en}</option>)}
          </select>
        </Field>
        <Field label="Prix de base · Base price">
          <TextInput type="number" step="0.01" min="0" value={f.base_price} onChange={(e) => set("base_price", parseFloat(e.target.value || 0))} required data-testid="item-form-price" />
        </Field>
        <Field label="Devise · Currency">
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                  data-testid="item-form-currency">
            <option value="XOF">XOF (CFA)</option>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </Field>
        <Field label="Niveau épicé · Spice level (0-3)">
          <TextInput type="number" min="0" max="3" value={f.spice_level} onChange={(e) => set("spice_level", parseInt(e.target.value || 0, 10))} data-testid="item-form-spice" />
        </Field>
        <Field label="Ordre · Sort order">
          <TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="item-form-sort" />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                  data-testid="item-form-description" />
      </Field>
      <Field label="Étiquettes · Tags">
        <div className="flex flex-wrap gap-2" data-testid="item-form-tags">
          {TAG_SUGGESTIONS.map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)}
                    data-testid={`item-form-tag-${t}`}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${
                      f.tags.includes(t) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>{t}</button>
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_veg} onChange={(e) => set("is_veg", e.target.checked)} data-testid="item-form-veg" /> Végétarien · Vegetarian</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_available} onChange={(e) => set("is_available", e.target.checked)} data-testid="item-form-available" /> Disponible · Available</label>
      </div>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="item-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} Enregistrer · Save
      </Btn>
    </form>
  );
};

const VariantForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || { name_fr: "", name_en: "", price_delta: 0, is_default: false, sort_order: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="variant-form">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom (FR)"><TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="variant-form-fr" /></Field>
        <Field label="Nom (EN)"><TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="variant-form-en" /></Field>
        <Field label="Delta prix · Price delta" hint="Ajouté au prix de base · Added to base price">
          <TextInput type="number" step="0.01" value={f.price_delta} onChange={(e) => set("price_delta", parseFloat(e.target.value || 0))} data-testid="variant-form-delta" />
        </Field>
        <Field label="Ordre · Sort"><TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="variant-form-sort" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} data-testid="variant-form-default" /> Défaut · Default</label>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="variant-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} Enregistrer · Save
      </Btn>
    </form>
  );
};

const AddonForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || { name_fr: "", name_en: "", price: 0, sort_order: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="addon-form">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom (FR)"><TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="addon-form-fr" /></Field>
        <Field label="Nom (EN)"><TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="addon-form-en" /></Field>
        <Field label="Prix · Price"><TextInput type="number" step="0.01" min="0" value={f.price} onChange={(e) => set("price", parseFloat(e.target.value || 0))} data-testid="addon-form-price" /></Field>
        <Field label="Ordre · Sort"><TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="addon-form-sort" /></Field>
      </div>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="addon-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} Enregistrer · Save
      </Btn>
    </form>
  );
};

// ---------------------------------------------------------------------------
// The manager itself
// ---------------------------------------------------------------------------

export const MenuManager = ({ restaurantId, api, testId = "menu-manager" }) => {
  const [tree, setTree] = useState({ sections: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // modals
  const [editSection, setEditSection]         = useState(null);  // {} | 'new' | null
  const [editItem, setEditItem]               = useState(null);  // item obj | 'new' | null
  const [editVariant, setEditVariant]         = useState(null);  // {item, variant|null}
  const [editAddon, setEditAddon]             = useState(null);  // {item, addon|null}
  const [expanded, setExpanded]               = useState({});    // itemId -> true

  const toggleExpand = (iid) => setExpanded((s) => ({ ...s, [iid]: !s[iid] }));

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await api.get(`/food/manage/${restaurantId}/menu`);
      setTree(data);
    } catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [api, restaurantId]);

  useEffect(() => { load(); }, [load]);

  // ---- Section handlers
  const saveSection = async (payload) => {
    setSaving(true);
    try {
      if (editSection === "new") await api.post(`/food/manage/${restaurantId}/sections`, payload);
      else await api.patch(`/food/manage/${restaurantId}/sections/${editSection.id}`, payload);
      setEditSection(null); await load();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };
  const deleteSection = async (s) => {
    if (!window.confirm(`Supprimer / Delete la section "${s.name_fr}" et tous ses items ?`)) return;
    try { await api.delete(`/food/manage/${restaurantId}/sections/${s.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  // ---- Item handlers
  const saveItem = async (payload) => {
    setSaving(true);
    try {
      if (!editItem?.id) await api.post(`/food/manage/${restaurantId}/items`, payload);
      else await api.patch(`/food/manage/${restaurantId}/items/${editItem.id}`, payload);
      setEditItem(null); await load();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };
  const deleteItem = async (it) => {
    if (!window.confirm(`Supprimer / Delete "${it.name}" ?`)) return;
    try { await api.delete(`/food/manage/${restaurantId}/items/${it.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const toggleAvailable = async (it) => {
    try { await api.patch(`/food/manage/${restaurantId}/items/${it.id}`, { is_available: !it.is_available }); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  // ---- Variant handlers
  const saveVariant = async (payload) => {
    setSaving(true);
    try {
      const { item, variant } = editVariant;
      if (!variant) await api.post(`/food/manage/${restaurantId}/items/${item.id}/variants`, payload);
      else await api.patch(`/food/manage/${restaurantId}/items/${item.id}/variants/${variant.id}`, payload);
      setEditVariant(null); await load();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };
  const deleteVariant = async (item, v) => {
    if (!window.confirm(`Supprimer / Delete la variante "${v.name_fr}" ?`)) return;
    try { await api.delete(`/food/manage/${restaurantId}/items/${item.id}/variants/${v.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  // ---- Addon handlers
  const saveAddon = async (payload) => {
    setSaving(true);
    try {
      const { item, addon } = editAddon;
      if (!addon) await api.post(`/food/manage/${restaurantId}/items/${item.id}/addons`, payload);
      else await api.patch(`/food/manage/${restaurantId}/items/${item.id}/addons/${addon.id}`, payload);
      setEditAddon(null); await load();
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };
  const deleteAddon = async (item, a) => {
    if (!window.confirm(`Supprimer / Delete "${a.name_fr}" ?`)) return;
    try { await api.delete(`/food/manage/${restaurantId}/items/${item.id}/addons/${a.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const allSections = useMemo(() => tree.sections || [], [tree]);

  if (loading) return <div className="text-sm text-muted-foreground" data-testid={`${testId}-loading`}>Chargement · Loading…</div>;

  return (
    <div className="space-y-6" data-testid={testId}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary"><Utensils size={20} /></div>
          <div>
            <h1 className="text-xl font-bold">Menu · Gestion complète</h1>
            <p className="text-xs text-muted-foreground">Sections · Items · Variantes · Extras — French-first · English-second</p>
          </div>
        </div>
        <Btn onClick={() => setEditSection("new")} data-testid={`${testId}-add-section`} className="bg-primary text-primary-foreground">
          <Plus size={14} /> Ajouter une section · Add section
        </Btn>
      </div>
      {err && (
        <div className="text-xs text-red-500 flex items-center gap-1" data-testid={`${testId}-error`}>
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      {allSections.length === 0 && (
        <div className="text-center py-16 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
          Aucune section — commencez par en créer une. · No sections yet — start by creating one.
        </div>
      )}

      {allSections.map((s) => (
        <div key={s.id} className="rounded-2xl border border-border overflow-hidden" data-testid={`${testId}-section-${s.id}`}>
          <div className="flex items-center justify-between p-4 bg-secondary/40">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              <h2 className="font-bold text-base">{s.name_fr} <span className="text-muted-foreground font-normal text-sm">· {s.name_en}</span></h2>
              <span className="text-[10px] text-muted-foreground">#{s.sort_order}</span>
            </div>
            <div className="flex gap-1">
              <Btn onClick={() => setEditItem(emptyItem(s.id))} className="bg-primary/10 text-primary" data-testid={`${testId}-section-${s.id}-add-item`}>
                <Plus size={12} /> Item
              </Btn>
              <button onClick={() => setEditSection(s)} data-testid={`${testId}-section-${s.id}-edit`} className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={12} /></button>
              <button onClick={() => deleteSection(s)} data-testid={`${testId}-section-${s.id}-delete`} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={12} /></button>
            </div>
          </div>

          {s.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Aucun item · No items yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {s.items.map((it) => (
                <li key={it.id} className="p-3" data-testid={`${testId}-item-${it.id}`}>
                  <div className="flex items-start gap-3">
                    <img src={resolveImg(it.image)} alt="" className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{it.name}</span>
                        {it.is_veg && <Leaf size={12} className="text-green-500" />}
                        {it.spice_level > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-500">{Array.from({length: it.spice_level}).map((_,i)=><Flame key={i} size={10} />)}</span>}
                        {!it.is_available && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-semibold">Indisponible · Unavailable</span>}
                        {(it.tags || []).map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>)}
                      </div>
                      {it.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>}
                      <div className="text-xs mt-1"><span className="font-semibold">{Number(it.base_price).toLocaleString()}</span> <span className="text-muted-foreground">{it.currency}</span> · {it.variants.length} variantes · {it.addons.length} extras</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <button onClick={() => toggleAvailable(it)} data-testid={`${testId}-item-${it.id}-toggle`} title={it.is_available ? "Rendre indisponible" : "Rendre disponible"}
                                className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${it.is_available ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                          {it.is_available ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button onClick={() => setEditItem(it)} data-testid={`${testId}-item-${it.id}-edit`} className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={12} /></button>
                        <button onClick={() => deleteItem(it)} data-testid={`${testId}-item-${it.id}-delete`} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={12} /></button>
                      </div>
                      <button onClick={() => toggleExpand(it.id)} data-testid={`${testId}-item-${it.id}-toggle-expand`} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                        {expanded[it.id] ? <><ChevronUp size={11} /> Cacher</> : <><ChevronDown size={11} /> Variantes / Extras</>}
                      </button>
                    </div>
                  </div>

                  {expanded[it.id] && (
                    <div className="mt-3 pl-3 md:pl-16 grid gap-3 md:grid-cols-2" data-testid={`${testId}-item-${it.id}-details`}>
                      {/* Variants */}
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1"><Package size={12} /> Variantes · Variants</div>
                          <button onClick={() => setEditVariant({ item: it, variant: null })} data-testid={`${testId}-item-${it.id}-add-variant`}
                                  className="h-6 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-semibold inline-flex items-center gap-1"><Plus size={10} /> Ajouter</button>
                        </div>
                        {it.variants.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Aucune variante · No variants.</div>
                        ) : (
                          <ul className="space-y-1">
                            {it.variants.map((v) => (
                              <li key={v.id} className="flex items-center justify-between text-xs" data-testid={`${testId}-variant-${v.id}`}>
                                <div className="min-w-0">
                                  <span className="font-medium">{v.name_fr} · {v.name_en}</span>
                                  <span className="ml-2 text-muted-foreground">{v.price_delta >= 0 ? "+" : ""}{Number(v.price_delta).toLocaleString()}</span>
                                  {v.is_default && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">Défaut</span>}
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => setEditVariant({ item: it, variant: v })} data-testid={`${testId}-variant-${v.id}-edit`} className="w-6 h-6 rounded bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={10} /></button>
                                  <button onClick={() => deleteVariant(it, v)} data-testid={`${testId}-variant-${v.id}-delete`} className="w-6 h-6 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={10} /></button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Add-ons */}
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1"><Plus size={12} /> Extras · Add-ons</div>
                          <button onClick={() => setEditAddon({ item: it, addon: null })} data-testid={`${testId}-item-${it.id}-add-addon`}
                                  className="h-6 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-semibold inline-flex items-center gap-1"><Plus size={10} /> Ajouter</button>
                        </div>
                        {it.addons.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">Aucun extra · No add-ons.</div>
                        ) : (
                          <ul className="space-y-1">
                            {it.addons.map((a) => (
                              <li key={a.id} className="flex items-center justify-between text-xs" data-testid={`${testId}-addon-${a.id}`}>
                                <div className="min-w-0">
                                  <span className="font-medium">{a.name_fr} · {a.name_en}</span>
                                  <span className="ml-2 text-muted-foreground">+{Number(a.price).toLocaleString()}</span>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => setEditAddon({ item: it, addon: a })} data-testid={`${testId}-addon-${a.id}-edit`} className="w-6 h-6 rounded bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={10} /></button>
                                  <button onClick={() => deleteAddon(it, a)} data-testid={`${testId}-addon-${a.id}-delete`} className="w-6 h-6 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={10} /></button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* Modals */}
      <Modal open={!!editSection} onClose={() => setEditSection(null)} title={editSection === "new" ? "Nouvelle section · New section" : `Modifier · Edit — ${editSection?.name_fr || ""}`} testId={`${testId}-section-modal`}>
        {editSection && (
          <SectionForm initial={editSection === "new" ? null : editSection} onSave={saveSection} saving={saving} />
        )}
      </Modal>

      <Modal wide open={!!editItem} onClose={() => setEditItem(null)} title={editItem?.id ? `Modifier · Edit — ${editItem?.name || ""}` : "Nouvel item · New item"} testId={`${testId}-item-modal`}>
        {editItem && (
          <ItemForm
            initial={editItem?.id ? editItem : editItem}
            sections={allSections}
            onSave={saveItem}
            saving={saving}
          />
        )}
      </Modal>

      <Modal open={!!editVariant} onClose={() => setEditVariant(null)} title={editVariant?.variant ? "Modifier la variante" : "Nouvelle variante"} testId={`${testId}-variant-modal`}>
        {editVariant && (
          <VariantForm initial={editVariant.variant} onSave={saveVariant} saving={saving} />
        )}
      </Modal>

      <Modal open={!!editAddon} onClose={() => setEditAddon(null)} title={editAddon?.addon ? "Modifier l'extra" : "Nouvel extra"} testId={`${testId}-addon-modal`}>
        {editAddon && (
          <AddonForm initial={editAddon.addon} onSave={saveAddon} saving={saving} />
        )}
      </Modal>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Helpers exported outside the component
// ---------------------------------------------------------------------------

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const resolveImg = (u) => (!u ? "" : u.startsWith("http") || u.startsWith("data:") ? u : `${API_BASE}${u}`);
const emptyItem = (sid) => ({
  section_id: sid || "", name: "", description: "", image: "",
  base_price: 0, currency: "XOF", is_veg: false, spice_level: 0,
  tags: [], is_available: true, sort_order: 0,
});

export default MenuManager;
