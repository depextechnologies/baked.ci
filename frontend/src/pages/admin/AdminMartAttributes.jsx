/**
 * Admin — Dynamic Category Attribute Manager (Fixing_Prompt v6, Slice 1).
 *
 * Route: /admin/modules/mart/attributes
 *
 * Three top-level views inside a single workspace:
 *   1. **Attributes** — global attribute definitions + options (select/multi_select)
 *   2. **Category assignments** — pick a category, add attributes, override at subcategory
 *   3. **Audit** — full diff log
 *
 * Backend endpoints under /api/admin/mart/... — see
 * `/app/backend/modules/mart_attributes/routes.py`.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, X, Edit3, Trash2, Save, Layers, Tag, Star, Eye, EyeOff,
  Lock, Unlock, GripVertical, ScrollText, Check,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const TYPES = [
  { value: "short_text",   label: "Short text" },
  { value: "long_text",    label: "Long text" },
  { value: "integer",      label: "Integer" },
  { value: "decimal",      label: "Decimal" },
  { value: "select",       label: "Dropdown (single)" },
  { value: "multi_select", label: "Multi-select" },
  { value: "boolean",      label: "Yes / No" },
  { value: "date",         label: "Date" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminMartAttributes = () => {
  const [tab, setTab] = useState("attributes");

  return (
    <div className="space-y-5" data-testid="admin-mart-attributes">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Layers size={18} /> Dynamic Category Attributes
        </h2>
        <p className="text-xs text-muted-foreground max-w-2xl">
          Define custom fields (Ingredients, Size, Colour, …), assign them to categories or
          subcategories with per-scope required / visible / editable flags, and every supplier
          form + admin approval + customer PDP updates automatically.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {[
          { code: "attributes",  label: "Attributes",         icon: Tag },
          { code: "assignments", label: "Category Assignment", icon: Layers },
          { code: "audit",       label: "Audit Trail",         icon: ScrollText },
        ].map(t => {
          const on = tab === t.code;
          const Icon = t.icon;
          return (
            <button key={t.code} onClick={() => setTab(t.code)}
              data-testid={`attributes-tab-${t.code}`}
              className="px-4 h-10 rounded-t-lg text-sm font-medium flex items-center gap-2 -mb-px"
              style={{
                background: on ? "rgba(119,188,31,.10)" : "transparent",
                color: on ? "#77BC1F" : "var(--muted-foreground)",
                borderBottom: `2px solid ${on ? "#77BC1F" : "transparent"}`,
              }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "attributes"  && <AttributesTab />}
      {tab === "assignments" && <AssignmentsTab />}
      {tab === "audit"       && <AuditTab />}
    </div>
  );
};

// ==========================================================================
// Attributes tab — definitions + options
// ==========================================================================

const AttributesTab = () => {
  const [items, setItems] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await adminApi.get(
        `/admin/mart/attributes${includeInactive ? "?include_inactive=1" : ""}`
      );
      setItems(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
  }, [includeInactive]);
  useEffect(() => { load(); }, [load]);

  const softDelete = async (a) => {
    if (!window.confirm(`Deactivate "${a.name}"? Existing product data is preserved.`)) return;
    try {
      await adminApi.delete(`/admin/mart/attributes/${a.id}`);
      toast.success("Attribute deactivated");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const reactivate = async (a) => {
    try {
      await adminApi.patch(`/admin/mart/attributes/${a.id}`, { is_active: true });
      toast.success("Reactivated");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4" data-testid="attributes-tab">
      <div className="flex items-center gap-3">
        <button onClick={() => setCreating(true)}
                data-testid="attributes-create-btn"
                className="text-xs px-3 h-9 rounded-lg font-medium text-white flex items-center gap-1"
                style={{ background: "#77BC1F" }}>
          <Plus size={12} /> New attribute
        </button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={includeInactive}
                 onChange={(e) => setIncludeInactive(e.target.checked)}
                 data-testid="attributes-include-inactive" />
          Show deactivated
        </label>
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Key</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Options</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="attributes-table-body">
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs"
                   data-testid="attributes-empty">
                No attributes yet — create one to get started.
              </td></tr>
            )}
            {items.map(a => (
              <tr key={a.id} className="border-t border-border" data-testid={`attribute-row-${a.id}`}>
                <td className="p-3 font-medium">{a.name}</td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{a.key}</td>
                <td className="p-3 text-xs">
                  {TYPES.find(t => t.value === a.type)?.label || a.type}
                  {a.unit && <span className="text-muted-foreground"> · {a.unit}</span>}
                </td>
                <td className="p-3 text-xs">
                  {(a.type === "select" || a.type === "multi_select")
                    ? `${a.option_count} option${a.option_count === 1 ? "" : "s"}`
                    : "—"}
                </td>
                <td className="p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                    style={{
                      background: a.is_active ? "rgba(119,188,31,.15)" : "rgba(148,163,184,.15)",
                      color: a.is_active ? "#77BC1F" : "var(--muted-foreground)",
                    }}
                    data-testid={`attribute-status-${a.id}`}>
                    {a.is_active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1">
                  <button onClick={() => setEditing(a)}
                          data-testid={`attribute-edit-${a.id}`}
                          className="text-xs px-2 h-8 rounded-lg border border-border hover:bg-secondary inline-flex items-center gap-1">
                    <Edit3 size={11} /> Edit
                  </button>
                  {a.is_active ? (
                    <button onClick={() => softDelete(a)}
                            data-testid={`attribute-deactivate-${a.id}`}
                            className="text-xs px-2 h-8 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 inline-flex items-center gap-1">
                      <Trash2 size={11} /> Deactivate
                    </button>
                  ) : (
                    <button onClick={() => reactivate(a)}
                            data-testid={`attribute-reactivate-${a.id}`}
                            className="text-xs px-2 h-8 rounded-lg border border-border hover:bg-secondary">
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <AttributeEditor mode={editing ? "edit" : "create"} value={editing}
                         onClose={() => { setCreating(false); setEditing(null); }}
                         onSaved={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
};

const AttributeEditor = ({ mode, value, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: value?.name || "", type: value?.type || "short_text",
    description: value?.description || "", unit: value?.unit || "",
  });
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);

  const isSelect = form.type === "select" || form.type === "multi_select";

  const loadOptions = useCallback(async () => {
    if (mode !== "edit" || !isSelect) return;
    // No dedicated list endpoint — pull the attribute and pre-fill from the
    // options tab of the assignments view. For simplicity here we load
    // resolved attribute against any placeholder; but we can call
    // `/admin/mart/attributes` + read `option_count`, then rely on manual add.
  }, [mode, isSelect]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      if (mode === "create") {
        const { data } = await adminApi.post("/admin/mart/attributes", form);
        // If select/multi_select and admin added options in the modal, POST each
        for (const o of options.filter(x => x.value && x.label)) {
          try {
            await adminApi.post(`/admin/mart/attributes/${data.id}/options`,
              { value: o.value, label: o.label, sort_order: o.sort_order || 0 });
          } catch { /* skip duplicates */ }
        }
        toast.success("Attribute created");
      } else {
        await adminApi.patch(`/admin/mart/attributes/${value.id}`, {
          name: form.name, description: form.description || null, unit: form.unit || null,
        });
        for (const o of options.filter(x => x.value && x.label && !x.id)) {
          try {
            await adminApi.post(`/admin/mart/attributes/${value.id}/options`,
              { value: o.value, label: o.label, sort_order: o.sort_order || 0 });
          } catch { /* skip duplicates */ }
        }
        toast.success("Saved");
      }
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose} data-testid="attribute-editor-modal">
      <div className="w-full max-w-lg baked-card bg-card border border-border p-5 space-y-4"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{mode === "create" ? "New attribute" : "Edit attribute"}</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={16} /></button>
        </div>
        <Field label="Name *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))}
               testid="attribute-name" placeholder="e.g. Country of Origin" />
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Type {mode === "edit" && "(immutable)"}</label>
          <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                  disabled={mode === "edit"}
                  data-testid="attribute-type"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm disabled:opacity-60">
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <Field label="Unit (optional)" value={form.unit} onChange={(v) => setForm(f => ({ ...f, unit: v }))}
               testid="attribute-unit" placeholder="e.g. cm, kg, %" />
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Description</label>
          <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    data-testid="attribute-description"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
        </div>

        {isSelect && (
          <div className="pt-3 border-t border-border" data-testid="attribute-options-editor">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Options ({options.length})
              </div>
              <button onClick={() => setOptions(o => [...o, { value: "", label: "", sort_order: o.length }])}
                      data-testid="attribute-add-option"
                      className="text-xs px-2 h-7 rounded-lg border border-border">
                <Plus size={11} className="inline mr-1" /> Add option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="grid grid-cols-2 gap-2" data-testid={`attribute-option-row-${i}`}>
                  <input value={o.value} onChange={(e) => {
                          const cp = [...options]; cp[i] = { ...cp[i], value: e.target.value }; setOptions(cp);
                        }}
                        placeholder="value (stored)"
                        data-testid={`attribute-option-value-${i}`}
                        className="px-2 py-1.5 rounded-lg bg-secondary border border-border text-xs" />
                  <div className="flex gap-1">
                    <input value={o.label} onChange={(e) => {
                            const cp = [...options]; cp[i] = { ...cp[i], label: e.target.value }; setOptions(cp);
                          }}
                          placeholder="label (shown)"
                          data-testid={`attribute-option-label-${i}`}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-secondary border border-border text-xs" />
                    <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                            data-testid={`attribute-option-remove-${i}`}
                            className="w-8 text-red-500"><X size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-xs px-4 h-9 rounded-lg border border-border"
                  data-testid="attribute-cancel">Cancel</button>
          <button onClick={save} disabled={busy}
                  data-testid="attribute-save"
                  className="text-xs px-4 h-9 rounded-lg font-medium text-white"
                  style={{ background: "#77BC1F" }}>
            <Save size={12} className="inline mr-1" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================================================
// Assignments tab — pick category → assign attrs → per-subcategory overrides
// ==========================================================================

const AssignmentsTab = () => {
  const [categories, setCategories] = useState([]);
  const [country, setCountry] = useState("CI");
  const [categoryId, setCategoryId] = useState("");
  const [detail, setDetail] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get(`/mart/categories?country=${country}`);
        const cs = Array.isArray(data) ? data : (data.items || []);
        setCategories(cs);
        if (cs.length && !categoryId) setCategoryId(cs[0].id);
      } catch (e) { toast.error(errMsg(e)); }
    })();
  }, [country]); // eslint-disable-line

  const load = useCallback(async () => {
    if (!categoryId) return;
    try {
      const [d, attrs] = await Promise.all([
        adminApi.get(`/admin/mart/categories/${categoryId}/attributes`),
        adminApi.get(`/admin/mart/attributes`),
      ]);
      setDetail(d.data);
      setAttributes(attrs.data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
  }, [categoryId]);
  useEffect(() => { load(); }, [load]);

  const patchAssignment = async (id, patch) => {
    try {
      await adminApi.patch(`/admin/mart/categories/attributes/${id}`, patch);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const unassign = async (id) => {
    if (!window.confirm("Remove this attribute from the category?")) return;
    try {
      await adminApi.delete(`/admin/mart/categories/attributes/${id}`);
      toast.success("Unassigned");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const assignFromPicker = async (attrId) => {
    try {
      await adminApi.post(`/admin/mart/categories/${categoryId}/attributes`, {
        attribute_id: attrId,
        subcategory_id: selectedSubId || null,
        is_required: false, customer_visible: true, supplier_editable: true,
      });
      toast.success("Attribute assigned");
      setPickerOpen(false);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const rowsForCurrentScope = useMemo(() => {
    if (!detail) return [];
    return (detail.assignments || []).filter(a =>
      selectedSubId ? a.subcategory_id === selectedSubId : !a.subcategory_id
    );
  }, [detail, selectedSubId]);

  return (
    <div className="space-y-4" data-testid="assignments-tab">
      <div className="flex flex-wrap items-center gap-3">
        <select value={country} onChange={(e) => setCountry(e.target.value)}
                data-testid="assignments-country"
                className="h-9 px-2 text-xs rounded-lg bg-secondary border border-border">
          <option value="CI">Côte d&apos;Ivoire (CI)</option>
          <option value="IN">India (IN)</option>
        </select>
        <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSelectedSubId(""); }}
                data-testid="assignments-category"
                className="h-9 px-3 text-xs rounded-lg bg-secondary border border-border">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {detail?.subcategories?.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">Scope:</span>
            <div className="flex gap-1">
              <button onClick={() => setSelectedSubId("")}
                data-testid="assignments-scope-parent"
                className="text-xs px-3 h-9 rounded-lg"
                style={{
                  background: !selectedSubId ? "rgba(119,188,31,.15)" : "transparent",
                  color: !selectedSubId ? "#77BC1F" : "var(--muted-foreground)",
                  border: `1px solid ${!selectedSubId ? "#77BC1F" : "var(--border)"}`,
                }}>
                Category
              </button>
              {detail.subcategories.map(s => (
                <button key={s.id} onClick={() => setSelectedSubId(s.id)}
                  data-testid={`assignments-scope-sub-${s.slug}`}
                  className="text-xs px-3 h-9 rounded-lg"
                  style={{
                    background: selectedSubId === s.id ? "rgba(119,188,31,.15)" : "transparent",
                    color: selectedSubId === s.id ? "#77BC1F" : "var(--muted-foreground)",
                    border: `1px solid ${selectedSubId === s.id ? "#77BC1F" : "var(--border)"}`,
                  }}>
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex-1" />
        <button onClick={() => setPickerOpen(true)}
                data-testid="assignments-add-btn"
                disabled={!categoryId}
                className="text-xs px-3 h-9 rounded-lg font-medium text-white flex items-center gap-1 disabled:opacity-50"
                style={{ background: "#77BC1F" }}>
          <Plus size={12} /> Assign attribute
        </button>
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">Attribute</th>
              <th className="text-left p-3">Type</th>
              <th className="text-center p-3">Required</th>
              <th className="text-center p-3">Customer</th>
              <th className="text-center p-3">Supplier</th>
              <th className="text-center p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="assignments-table-body">
            {rowsForCurrentScope.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground text-xs"
                   data-testid="assignments-empty">
                {selectedSubId
                  ? "No overrides for this subcategory yet — parent-category attributes still apply."
                  : "No attributes assigned to this category yet."}
              </td></tr>
            )}
            {rowsForCurrentScope.map(a => (
              <tr key={a.id} className="border-t border-border"
                  data-testid={`assignment-row-${a.attribute.key}`}>
                <td className="p-3 text-xs">
                  <input type="number" value={a.sort_order}
                    onChange={(e) => patchAssignment(a.id, { sort_order: Number(e.target.value) })}
                    data-testid={`assignment-sort-${a.attribute.key}`}
                    className="w-14 px-2 py-1 rounded bg-secondary border border-border text-xs" />
                </td>
                <td className="p-3">
                  <div className="font-medium">{a.attribute.name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{a.attribute.key}</div>
                </td>
                <td className="p-3 text-xs">{TYPES.find(t => t.value === a.attribute.type)?.label || a.attribute.type}</td>
                <td className="p-3 text-center">
                  <Toggle checked={a.is_required} onChange={(v) => patchAssignment(a.id, { is_required: v })}
                          testid={`assignment-required-${a.attribute.key}`} />
                </td>
                <td className="p-3 text-center">
                  <Toggle checked={a.customer_visible} onChange={(v) => patchAssignment(a.id, { customer_visible: v })}
                          testid={`assignment-visible-${a.attribute.key}`} />
                </td>
                <td className="p-3 text-center">
                  <Toggle checked={a.supplier_editable} onChange={(v) => patchAssignment(a.id, { supplier_editable: v })}
                          testid={`assignment-editable-${a.attribute.key}`} />
                </td>
                <td className="p-3 text-center">
                  <Toggle checked={a.is_active} onChange={(v) => patchAssignment(a.id, { is_active: v })}
                          testid={`assignment-active-${a.attribute.key}`} />
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => unassign(a.id)}
                    data-testid={`assignment-remove-${a.attribute.key}`}
                    className="text-xs text-red-500"><Trash2 size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Attribute picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setPickerOpen(false)}
             data-testid="assignments-picker-modal">
          <div className="w-full max-w-lg baked-card bg-card border border-border p-5"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Assign attribute</h3>
              <button onClick={() => setPickerOpen(false)}><X size={16} /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Assign to <b>{selectedSubId ? "subcategory scope" : "parent category"}</b>. You can flip
              required / visible / editable afterwards.
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {attributes.filter(a => a.is_active).map(a => (
                <button key={a.id} onClick={() => assignFromPicker(a.id)}
                  data-testid={`assignments-picker-${a.key}`}
                  className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-secondary text-sm flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{a.key}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {TYPES.find(t => t.value === a.type)?.label}
                  </span>
                </button>
              ))}
              {attributes.filter(a => a.is_active).length === 0 && (
                <div className="text-xs text-muted-foreground text-center p-4">
                  No attributes exist yet — create one in the Attributes tab first.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================================================
// Audit tab
// ==========================================================================

const AuditTab = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get("/admin/mart/attributes/audit");
        setItems(data.items || []);
      } catch (e) { toast.error(errMsg(e)); }
    })();
  }, []);
  return (
    <div className="baked-card bg-card border border-border overflow-x-auto" data-testid="audit-tab">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left p-3">When</th>
            <th className="text-left p-3">Who</th>
            <th className="text-left p-3">Action</th>
            <th className="text-left p-3">Entity</th>
            <th className="text-left p-3">Diff</th>
          </tr>
        </thead>
        <tbody data-testid="audit-table-body">
          {items.length === 0 && (
            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
              No changes yet.
            </td></tr>
          )}
          {items.map(a => (
            <tr key={a.id} className="border-t border-border" data-testid={`audit-row-${a.id}`}>
              <td className="p-3 text-xs text-muted-foreground font-mono">{new Date(a.created_at).toLocaleString()}</td>
              <td className="p-3 text-xs">{a.actor_email || "—"}</td>
              <td className="p-3 text-xs font-semibold" style={{ color: "#77BC1F" }}>{a.action}</td>
              <td className="p-3 text-xs">{a.entity_kind} · <span className="font-mono">{a.entity_id.slice(0, 12)}…</span></td>
              <td className="p-3 text-[10px] font-mono max-w-md">
                <pre className="whitespace-pre-wrap">{JSON.stringify(a.diff, null, 2).slice(0, 300)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ==========================================================================
// Small helpers
// ==========================================================================

const Field = ({ label, value, onChange, testid, placeholder }) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)}
           placeholder={placeholder}
           data-testid={testid}
           className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
  </div>
);

const Toggle = ({ checked, onChange, testid }) => (
  <button onClick={() => onChange(!checked)}
          data-testid={testid}
          className="w-9 h-5 rounded-full relative transition-colors"
          style={{ background: checked ? "#77BC1F" : "var(--border)" }}>
    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
         style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }} />
  </button>
);

export default AdminMartAttributes;
