/**
 * MenuManager — reusable menu-management surface for FOODbakēd.
 *
 * Mounted TWICE:
 *   • Super-admin route     /admin/modules/food/restaurants/:id/menu
 *   • Restaurant partner    /partner/food/menu  (partner's own restaurant)
 *
 * Pass 3 brings:
 *   • Full FR/EN monolingual rewrite (no " · " bilingual concatenation anywhere)
 *   • Section drag-and-drop + ↑/↓ reorder (persists sort_order)
 *   • Clear "Par défaut" / "Default" badge for the default variant
 *   • Duplicate menu item (deep clone, lands unavailable with "(Copie)/(Copy)")
 *   • "Épuisé" / "Sold Out" badge replaces the old "Indisponible / Unavailable"
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, ChevronDown, ChevronUp,
  Utensils, Flame, Leaf, EyeOff, Eye, Layers, Package, AlertTriangle,
  GripVertical, ArrowUp, ArrowDown, Copy,
} from "lucide-react";
import FoodImageUploader from "../../apps/foodbaked/components/FoodImageUploader";

/* --------------------------------------------------------------------------
 * i18n helper — same `detectFr()` pattern used across the FOODbakēd partner
 * portal. Reading from localStorage keeps us consistent with the rest of
 * the surface (RestaurantNotificationEngine, PartnerOrdersPage, etc.) and
 * avoids coupling MenuManager to react-i18next directly, since it's also
 * mounted inside the super-admin app which may not have i18n wired yet.
 * -------------------------------------------------------------------------*/
const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (d) return d;
  return detectFr() ? "Erreur" : "Error";
};

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
  const fr = detectFr();
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="menu-section-form">
      <Field label={fr ? "Nom (FR)" : "Name (FR)"}>
        <TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="section-form-name-fr" />
      </Field>
      <Field label={fr ? "Nom (EN)" : "Name (EN)"}>
        <TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="section-form-name-en" />
      </Field>
      <Field label={fr ? "Ordre" : "Sort order"}>
        <TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="section-form-sort" />
      </Field>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="section-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} {fr ? "Enregistrer" : "Save"}
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
  const fr = detectFr();

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4" data-testid="menu-item-form">
      <FoodImageUploader
        value={f.image}
        onChange={(v) => set("image", v)}
        kind="menu_item"
        label={fr ? "Photo du plat" : "Item photo"}
        testId="menu-item-image"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={fr ? "Nom" : "Name"}>
          <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} required data-testid="item-form-name" />
        </Field>
        <Field label="Section">
          <select value={f.section_id} onChange={(e) => set("section_id", e.target.value)} required
                  className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                  data-testid="item-form-section">
            {sections.map((s) => <option key={s.id} value={s.id}>{fr ? s.name_fr : s.name_en}</option>)}
          </select>
        </Field>
        <Field label={fr ? "Prix de base" : "Base price"}>
          <TextInput type="number" step="0.01" min="0" value={f.base_price} onChange={(e) => set("base_price", parseFloat(e.target.value || 0))} required data-testid="item-form-price" />
        </Field>
        <Field label={fr ? "Devise" : "Currency"}>
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                  data-testid="item-form-currency">
            <option value="XOF">XOF (CFA)</option>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
          </select>
        </Field>
        <Field label={fr ? "Niveau épicé (0-3)" : "Spice level (0-3)"}>
          <TextInput type="number" min="0" max="3" value={f.spice_level} onChange={(e) => set("spice_level", parseInt(e.target.value || 0, 10))} data-testid="item-form-spice" />
        </Field>
        <Field label={fr ? "Ordre" : "Sort order"}>
          <TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="item-form-sort" />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={f.description || ""} onChange={(e) => set("description", e.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                  data-testid="item-form-description" />
      </Field>
      <Field label={fr ? "Étiquettes" : "Tags"}>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_veg} onChange={(e) => set("is_veg", e.target.checked)} data-testid="item-form-veg" />
          {fr ? "Végétarien" : "Vegetarian"}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_available} onChange={(e) => set("is_available", e.target.checked)} data-testid="item-form-available" />
          {fr ? "Disponible" : "Available"}
        </label>
      </div>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="item-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} {fr ? "Enregistrer" : "Save"}
      </Btn>
    </form>
  );
};

const VariantForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || { name_fr: "", name_en: "", price_delta: 0, is_default: false, sort_order: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fr = detectFr();
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="variant-form">
      <div className="grid grid-cols-2 gap-3">
        <Field label={fr ? "Nom (FR)" : "Name (FR)"}><TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="variant-form-fr" /></Field>
        <Field label={fr ? "Nom (EN)" : "Name (EN)"}><TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="variant-form-en" /></Field>
        <Field label={fr ? "Delta de prix" : "Price delta"} hint={fr ? "Ajouté au prix de base" : "Added to base price"}>
          <TextInput type="number" step="0.01" value={f.price_delta} onChange={(e) => set("price_delta", parseFloat(e.target.value || 0))} data-testid="variant-form-delta" />
        </Field>
        <Field label={fr ? "Ordre" : "Sort"}><TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="variant-form-sort" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} data-testid="variant-form-default" />
        {fr ? "Par défaut" : "Default"}
      </label>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="variant-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} {fr ? "Enregistrer" : "Save"}
      </Btn>
    </form>
  );
};

const AddonForm = ({ initial, onSave, saving }) => {
  const [f, setF] = useState(initial || { name_fr: "", name_en: "", price: 0, sort_order: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fr = detectFr();
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-3" data-testid="addon-form">
      <div className="grid grid-cols-2 gap-3">
        <Field label={fr ? "Nom (FR)" : "Name (FR)"}><TextInput value={f.name_fr} onChange={(e) => set("name_fr", e.target.value)} required data-testid="addon-form-fr" /></Field>
        <Field label={fr ? "Nom (EN)" : "Name (EN)"}><TextInput value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required data-testid="addon-form-en" /></Field>
        <Field label={fr ? "Prix" : "Price"}><TextInput type="number" step="0.01" min="0" value={f.price} onChange={(e) => set("price", parseFloat(e.target.value || 0))} data-testid="addon-form-price" /></Field>
        <Field label={fr ? "Ordre" : "Sort"}><TextInput type="number" value={f.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || 0, 10))} data-testid="addon-form-sort" /></Field>
      </div>
      <Btn type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground disabled:opacity-50 justify-center" data-testid="addon-form-save">
        {saving && <Loader2 size={14} className="animate-spin" />} {fr ? "Enregistrer" : "Save"}
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
  const [reordering, setReordering] = useState(false);
  const fr = detectFr();

  // modals
  const [editSection, setEditSection]         = useState(null);  // {} | 'new' | null
  const [editItem, setEditItem]               = useState(null);  // item obj | 'new' | null
  const [editVariant, setEditVariant]         = useState(null);  // {item, variant|null}
  const [editAddon, setEditAddon]             = useState(null);  // {item, addon|null}
  const [expanded, setExpanded]               = useState({});    // itemId -> true

  // drag-and-drop state (section index being dragged)
  const dragFrom = useRef(null);

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
    const msg = fr
      ? `Supprimer la section « ${s.name_fr} » et tous ses articles ?`
      : `Delete section "${s.name_en}" and all its items?`;
    if (!window.confirm(msg)) return;
    try { await api.delete(`/food/manage/${restaurantId}/sections/${s.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  // ---- Section reorder (ArrowUp/ArrowDown + drag-and-drop)
  // Writes new sort_order values server-side one-at-a-time; the backend
  // already supports PATCH /sections/{sid}. We update local state first for
  // a snappy UX, then reload to re-sync.
  const persistOrder = async (orderedSections) => {
    setReordering(true);
    try {
      // Only PATCH rows whose sort_order actually changed to minimise writes.
      const needsPatch = orderedSections
        .map((s, idx) => ({ s, idx }))
        .filter(({ s, idx }) => s.sort_order !== idx);
      for (const { s, idx } of needsPatch) {
        // eslint-disable-next-line no-await-in-loop
        await api.patch(`/food/manage/${restaurantId}/sections/${s.id}`, { sort_order: idx });
      }
      await load();
    } catch (e) { setErr(errMsg(e)); await load(); }
    finally { setReordering(false); }
  };
  const moveSection = (sectionId, delta) => {
    const list = [...(tree.sections || [])];
    const idx  = list.findIndex((x) => x.id === sectionId);
    const to   = idx + delta;
    if (idx < 0 || to < 0 || to >= list.length) return;
    [list[idx], list[to]] = [list[to], list[idx]];
    // Optimistic UI update
    setTree({ ...tree, sections: list });
    persistOrder(list);
  };
  const onDragStart = (idx) => (ev) => { dragFrom.current = idx; ev.dataTransfer.effectAllowed = "move"; };
  const onDragOver  = (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; };
  const onDrop      = (idx) => (ev) => {
    ev.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === idx) return;
    const list = [...(tree.sections || [])];
    const [moved] = list.splice(from, 1);
    list.splice(idx, 0, moved);
    setTree({ ...tree, sections: list });
    persistOrder(list);
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
    const msg = fr ? `Supprimer « ${it.name} » ?` : `Delete "${it.name}"?`;
    if (!window.confirm(msg)) return;
    try { await api.delete(`/food/manage/${restaurantId}/items/${it.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const toggleAvailable = async (it) => {
    try { await api.patch(`/food/manage/${restaurantId}/items/${it.id}`, { is_available: !it.is_available }); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const duplicateItem = async (it) => {
    try {
      await api.post(`/food/manage/${restaurantId}/items/${it.id}/duplicate`, {}, {
        headers: { "X-Lang": fr ? "fr" : "en" },
      });
      await load();
    } catch (e) { setErr(errMsg(e)); }
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
    const msg = fr ? `Supprimer la variante « ${v.name_fr} » ?` : `Delete variant "${v.name_en}"?`;
    if (!window.confirm(msg)) return;
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
    const msg = fr ? `Supprimer l'extra « ${a.name_fr} » ?` : `Delete add-on "${a.name_en}"?`;
    if (!window.confirm(msg)) return;
    try { await api.delete(`/food/manage/${restaurantId}/items/${item.id}/addons/${a.id}`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const allSections = useMemo(() => tree.sections || [], [tree]);

  // Sold-out quick list (used by the panel on both Dashboard and Menu pages)
  const soldOutItems = useMemo(() => {
    const out = [];
    for (const s of allSections) {
      for (const it of (s.items || [])) {
        if (!it.is_available) out.push({ ...it, _section_name: fr ? s.name_fr : s.name_en });
      }
    }
    return out;
  }, [allSections, fr]);

  if (loading) return <div className="text-sm text-muted-foreground" data-testid={`${testId}-loading`}>{fr ? "Chargement…" : "Loading…"}</div>;

  return (
    <div className="space-y-6" data-testid={testId}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary"><Utensils size={20} /></div>
          <div>
            <h1 className="text-xl font-bold">{fr ? "Menu — gestion complète" : "Menu — full management"}</h1>
            <p className="text-xs text-muted-foreground">
              {fr ? "Sections · plats · variantes · extras" : "Sections · items · variants · add-ons"}
            </p>
          </div>
        </div>
        <Btn onClick={() => setEditSection("new")} data-testid={`${testId}-add-section`} className="bg-primary text-primary-foreground">
          <Plus size={14} /> {fr ? "Ajouter une section" : "Add section"}
        </Btn>
      </div>
      {err && (
        <div className="text-xs text-red-500 flex items-center gap-1" data-testid={`${testId}-error`}>
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      {/* Quick Sold-Out strip — only visible when at least one item is sold out */}
      {soldOutItems.length > 0 && (
        <SoldOutStrip items={soldOutItems} fr={fr} onRestock={toggleAvailable} testId={`${testId}-soldout`} />
      )}

      {allSections.length === 0 && (
        <div className="text-center py-16 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
          {fr ? "Aucune section — commencez par en créer une." : "No sections yet — start by creating one."}
        </div>
      )}

      {allSections.map((s, sIdx) => (
        <div key={s.id}
             className="rounded-2xl border border-border overflow-hidden"
             data-testid={`${testId}-section-${s.id}`}
             draggable
             onDragStart={onDragStart(sIdx)}
             onDragOver={onDragOver}
             onDrop={onDrop(sIdx)}>
          <div className="flex items-center justify-between p-4 bg-secondary/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className="cursor-grab active:cursor-grabbing text-muted-foreground" data-testid={`${testId}-section-${s.id}-drag`} title={fr ? "Glisser pour réorganiser" : "Drag to reorder"}>
                <GripVertical size={16} />
              </span>
              <Layers size={16} className="text-primary" />
              <h2 className="font-bold text-base truncate">{fr ? s.name_fr : s.name_en}</h2>
              <span className="text-[10px] text-muted-foreground">#{s.sort_order}</span>
            </div>
            <div className="flex gap-1 items-center">
              <button onClick={() => moveSection(s.id, -1)} disabled={sIdx === 0 || reordering}
                      data-testid={`${testId}-section-${s.id}-up`}
                      className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center disabled:opacity-30"
                      title={fr ? "Monter" : "Move up"}><ArrowUp size={12} /></button>
              <button onClick={() => moveSection(s.id, 1)} disabled={sIdx === allSections.length - 1 || reordering}
                      data-testid={`${testId}-section-${s.id}-down`}
                      className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center disabled:opacity-30"
                      title={fr ? "Descendre" : "Move down"}><ArrowDown size={12} /></button>
              <Btn onClick={() => setEditItem(emptyItem(s.id))} className="bg-primary/10 text-primary" data-testid={`${testId}-section-${s.id}-add-item`}>
                <Plus size={12} /> {fr ? "Article" : "Item"}
              </Btn>
              <button onClick={() => setEditSection(s)} data-testid={`${testId}-section-${s.id}-edit`}
                      className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"
                      title={fr ? "Modifier" : "Edit"}><Pencil size={12} /></button>
              <button onClick={() => deleteSection(s)} data-testid={`${testId}-section-${s.id}-delete`}
                      className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"
                      title={fr ? "Supprimer" : "Delete"}><Trash2 size={12} /></button>
            </div>
          </div>

          {s.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {fr ? "Aucun article pour le moment." : "No items yet."}
            </div>
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
                        {it.spice_level > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-500">
                            {Array.from({ length: it.spice_level }).map((_, i) => <Flame key={i} size={10} />)}
                          </span>
                        )}
                        {!it.is_available && (
                          <span data-testid={`${testId}-item-${it.id}-soldout-badge`}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-semibold uppercase tracking-wider">
                            {fr ? "Épuisé" : "Sold Out"}
                          </span>
                        )}
                        {(it.tags || []).map((t) => (
                          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>
                        ))}
                      </div>
                      {it.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>}
                      <div className="text-xs mt-1">
                        <span className="font-semibold">{Number(it.base_price).toLocaleString(fr ? "fr-FR" : "en-US")}</span>{" "}
                        <span className="text-muted-foreground">{it.currency}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {it.variants.length} {fr ? "variantes" : "variants"}
                          {" · "}
                          {it.addons.length} {fr ? "extras" : "add-ons"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <button onClick={() => toggleAvailable(it)} data-testid={`${testId}-item-${it.id}-toggle`}
                                title={it.is_available ? (fr ? "Marquer épuisé" : "Mark sold out") : (fr ? "Remettre en stock" : "Restock")}
                                className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${it.is_available ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground"}`}>
                          {it.is_available ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button onClick={() => duplicateItem(it)} data-testid={`${testId}-item-${it.id}-duplicate`}
                                title={fr ? "Dupliquer" : "Duplicate"}
                                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center">
                          <Copy size={12} />
                        </button>
                        <button onClick={() => setEditItem(it)} data-testid={`${testId}-item-${it.id}-edit`}
                                title={fr ? "Modifier" : "Edit"}
                                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center"><Pencil size={12} /></button>
                        <button onClick={() => deleteItem(it)} data-testid={`${testId}-item-${it.id}-delete`}
                                title={fr ? "Supprimer" : "Delete"}
                                className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center"><Trash2 size={12} /></button>
                      </div>
                      <button onClick={() => toggleExpand(it.id)} data-testid={`${testId}-item-${it.id}-toggle-expand`}
                              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                        {expanded[it.id]
                          ? <><ChevronUp size={11} /> {fr ? "Cacher" : "Hide"}</>
                          : <><ChevronDown size={11} /> {fr ? "Variantes / Extras" : "Variants / Add-ons"}</>}
                      </button>
                    </div>
                  </div>

                  {expanded[it.id] && (
                    <div className="mt-3 pl-3 md:pl-16 grid gap-3 md:grid-cols-2" data-testid={`${testId}-item-${it.id}-details`}>
                      {/* Variants */}
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
                            <Package size={12} /> {fr ? "Variantes" : "Variants"}
                          </div>
                          <button onClick={() => setEditVariant({ item: it, variant: null })} data-testid={`${testId}-item-${it.id}-add-variant`}
                                  className="h-6 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-semibold inline-flex items-center gap-1">
                            <Plus size={10} /> {fr ? "Ajouter" : "Add"}
                          </button>
                        </div>
                        {it.variants.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">{fr ? "Aucune variante." : "No variants."}</div>
                        ) : (
                          <ul className="space-y-1">
                            {it.variants.map((v) => (
                              <li key={v.id} className="flex items-center justify-between text-xs" data-testid={`${testId}-variant-${v.id}`}>
                                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{fr ? v.name_fr : v.name_en}</span>
                                  <span className="text-muted-foreground">{v.price_delta >= 0 ? "+" : ""}{Number(v.price_delta).toLocaleString(fr ? "fr-FR" : "en-US")}</span>
                                  {v.is_default && (
                                    <span data-testid={`${testId}-variant-${v.id}-default-badge`}
                                          className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wider">
                                      {fr ? "Par défaut" : "Default"}
                                    </span>
                                  )}
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
                          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1">
                            <Plus size={12} /> {fr ? "Extras" : "Add-ons"}
                          </div>
                          <button onClick={() => setEditAddon({ item: it, addon: null })} data-testid={`${testId}-item-${it.id}-add-addon`}
                                  className="h-6 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-semibold inline-flex items-center gap-1">
                            <Plus size={10} /> {fr ? "Ajouter" : "Add"}
                          </button>
                        </div>
                        {it.addons.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground">{fr ? "Aucun extra." : "No add-ons."}</div>
                        ) : (
                          <ul className="space-y-1">
                            {it.addons.map((a) => (
                              <li key={a.id} className="flex items-center justify-between text-xs" data-testid={`${testId}-addon-${a.id}`}>
                                <div className="min-w-0">
                                  <span className="font-medium">{fr ? a.name_fr : a.name_en}</span>
                                  <span className="ml-2 text-muted-foreground">+{Number(a.price).toLocaleString(fr ? "fr-FR" : "en-US")}</span>
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
      <Modal open={!!editSection} onClose={() => setEditSection(null)}
             title={editSection === "new"
               ? (fr ? "Nouvelle section" : "New section")
               : `${fr ? "Modifier" : "Edit"} — ${(fr ? editSection?.name_fr : editSection?.name_en) || ""}`}
             testId={`${testId}-section-modal`}>
        {editSection && (
          <SectionForm initial={editSection === "new" ? null : editSection} onSave={saveSection} saving={saving} />
        )}
      </Modal>

      <Modal wide open={!!editItem} onClose={() => setEditItem(null)}
             title={editItem?.id
               ? `${fr ? "Modifier" : "Edit"} — ${editItem?.name || ""}`
               : (fr ? "Nouvel article" : "New item")}
             testId={`${testId}-item-modal`}>
        {editItem && (
          <ItemForm
            initial={editItem?.id ? editItem : editItem}
            sections={allSections}
            onSave={saveItem}
            saving={saving}
          />
        )}
      </Modal>

      <Modal open={!!editVariant} onClose={() => setEditVariant(null)}
             title={editVariant?.variant
               ? (fr ? "Modifier la variante" : "Edit variant")
               : (fr ? "Nouvelle variante" : "New variant")}
             testId={`${testId}-variant-modal`}>
        {editVariant && (
          <VariantForm initial={editVariant.variant} onSave={saveVariant} saving={saving} />
        )}
      </Modal>

      <Modal open={!!editAddon} onClose={() => setEditAddon(null)}
             title={editAddon?.addon
               ? (fr ? "Modifier l'extra" : "Edit add-on")
               : (fr ? "Nouvel extra" : "New add-on")}
             testId={`${testId}-addon-modal`}>
        {editAddon && (
          <AddonForm initial={editAddon.addon} onSave={saveAddon} saving={saving} />
        )}
      </Modal>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Sold-Out quick strip (exported so the Dashboard can reuse it)
// ---------------------------------------------------------------------------

const SoldOutStrip = ({ items, fr, onRestock, testId }) => (
  <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-3" data-testid={testId}>
    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
      <div className="text-[11px] font-bold uppercase tracking-widest text-red-500 inline-flex items-center gap-1">
        <EyeOff size={12} />
        {fr
          ? `${items.length} article(s) épuisé(s)`
          : `${items.length} item(s) sold out`}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {fr ? "Appuyez sur « Remettre en stock » pour les publier instantanément."
            : "Tap “Restock” to publish them instantly."}
      </div>
    </div>
    <div className="flex gap-2 overflow-x-auto">
      {items.map((it) => (
        <div key={it.id}
             className="flex items-center gap-2 bg-background rounded-xl border border-border px-3 py-2 shrink-0"
             data-testid={`${testId}-row-${it.id}`}>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate max-w-[140px]">{it.name}</div>
            <div className="text-[10px] text-muted-foreground">{it._section_name}</div>
          </div>
          <button onClick={() => onRestock(it)}
                  data-testid={`${testId}-restock-${it.id}`}
                  className="h-7 px-3 rounded-full bg-green-500 text-white text-[11px] font-semibold inline-flex items-center gap-1">
            <Eye size={11} /> {fr ? "Remettre en stock" : "Restock"}
          </button>
        </div>
      ))}
    </div>
  </div>
);


/**
 * Compact Sold-Out strip for the Partner Dashboard (no header; renders
 * nothing when every item is available). Reuses the same restock PATCH as
 * the full MenuManager so a one-tap action from the dashboard is identical
 * to the one in /partner/food/menu.
 */
export const DashboardSoldOutPanel = ({ restaurantId, api, testId = "partner-dashboard-soldout" }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const fr = detectFr();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/food/manage/${restaurantId}/menu`);
      const out = [];
      for (const s of (data.sections || [])) {
        for (const it of (s.items || [])) {
          if (!it.is_available) out.push({ ...it, _section_name: fr ? s.name_fr : s.name_en });
        }
      }
      setItems(out);
    } catch (e) { /* silent — dashboard shouldn't throw on a side panel */ }
    finally { setLoading(false); }
  }, [api, restaurantId, fr]);
  useEffect(() => { load(); }, [load]);

  const restock = async (it) => {
    try { await api.patch(`/food/manage/${restaurantId}/items/${it.id}`, { is_available: true }); await load(); }
    catch (e) { /* ignore — the full menu page will surface the error */ }
  };

  if (loading) return null;
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground inline-flex items-center gap-2"
           data-testid={`${testId}-empty`}>
        <Eye size={12} className="text-green-500" />
        {fr ? "Tous les articles sont disponibles." : "All items are available."}
      </div>
    );
  }
  return <SoldOutStrip items={items} fr={fr} onRestock={restock} testId={testId} />;
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
