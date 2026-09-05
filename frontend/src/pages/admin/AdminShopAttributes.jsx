/**
 * Super Admin — SHOPbakēd Attributes Editor.
 *
 * Route: /admin/modules/shop/attributes
 *
 * Two panes:
 *   Left  — SHOP attribute *definitions* (mart_attributes where module='shop').
 *           Add/edit/soft-delete. Reuses existing `/admin/mart/attributes`
 *           endpoints filtered by module=shop.
 *   Right — Category ⇄ attribute *assignments* for the currently selected
 *           SHOP category (`shop_category_attributes`). Add/toggle/delete.
 *
 * Assignments can target the parent category (subcategory_id=null) or a
 * specific sub-category — sub-cat wins during resolution (see
 * `modules/shop/attributes_resolver.py`).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Tag, Plus, Trash2, X, ChevronDown, Check, Eye, EyeOff, ShieldCheck,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const SHOP_ACCENT = "#FCC44C";

const ATTR_TYPES = [
  { code: "text",         label: "Text" },
  { code: "number",       label: "Number" },
  { code: "boolean",      label: "Boolean" },
  { code: "select",       label: "Select" },
  { code: "multi_select", label: "Multi-select" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminShopAttributes = () => {
  const [country] = useState("CI");
  const [attributes, setAttributes] = useState([]);
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  const [selCatId, setSelCatId] = useState(null);
  const [selSubId, setSelSubId] = useState(""); // "" means "parent category"
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newAttr, setNewAttr] = useState(null);   // { name, type, unit }
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadAttributes = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/admin/mart/attributes", { params: { module: "shop", include_inactive: false } });
      setAttributes(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  const loadCats = useCallback(async () => {
    try {
      const { data } = await adminApi.get("/admin/modules/shop/categories", { params: { country } });
      setCats(data.items || []);
      if (!selCatId && data.items?.length) setSelCatId(data.items[0].id);
    } catch (e) { toast.error(errMsg(e)); }
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

  const loadAssignments = useCallback(async () => {
    if (!selCatId) { setAssignments([]); return; }
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/modules/shop/categories/${selCatId}/attributes`);
      setAssignments(data.assignments || []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [selCatId]);

  useEffect(() => { loadAttributes(); loadCats(); }, [loadAttributes, loadCats]);
  useEffect(() => { loadSubs(); loadAssignments(); }, [loadSubs, loadAssignments]);

  const filteredAssignments = useMemo(() => {
    // Scope filter: parent-cat-only vs specific sub-cat.
    if (!selSubId) return assignments.filter((a) => a.subcategory_id === null);
    return assignments.filter((a) => a.subcategory_id === selSubId);
  }, [assignments, selSubId]);

  const availableAttrs = useMemo(() => {
    // Exclude attributes already assigned to the current scope.
    const usedIds = new Set(filteredAssignments.map((a) => a.attribute_id));
    return attributes.filter((a) => !usedIds.has(a.id));
  }, [attributes, filteredAssignments]);

  const createAttribute = async () => {
    if (!newAttr?.name?.trim() || !newAttr?.type) return toast.error("Name and type required");
    try {
      await adminApi.post("/admin/mart/attributes", {
        name: newAttr.name.trim(), type: newAttr.type,
        unit: newAttr.unit || null, module: "shop",
      });
      toast.success("Attribute created");
      setNewAttr(null);
      loadAttributes();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const deleteAttribute = async (id) => {
    if (!window.confirm("Soft-delete this attribute? Historical values are preserved.")) return;
    try {
      await adminApi.delete(`/admin/mart/attributes/${id}`);
      toast.success("Attribute soft-deleted");
      loadAttributes();
      loadAssignments();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const assignAttribute = async (attrId) => {
    try {
      await adminApi.post(`/admin/modules/shop/categories/${selCatId}/attributes`, {
        attribute_id: attrId,
        subcategory_id: selSubId || null,
        is_required: false, customer_visible: true, supplier_editable: true, sort_order: filteredAssignments.length,
      });
      toast.success("Attribute assigned");
      setPickerOpen(false);
      loadAssignments();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const patchAssignment = async (assignmentId, patch) => {
    try {
      await adminApi.patch(`/admin/modules/shop/assignments/${assignmentId}`, patch);
      loadAssignments();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const deleteAssignment = async (assignmentId) => {
    if (!window.confirm("Remove this attribute from the scope?")) return;
    try {
      await adminApi.delete(`/admin/modules/shop/assignments/${assignmentId}`);
      toast.success("Removed");
      loadAssignments();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const selCat = cats.find((c) => c.id === selCatId);
  const selSub = subs.find((s) => s.id === selSubId);

  return (
    <div className="space-y-5" data-testid="admin-shop-attributes">
      <div>
        <div className="text-xs uppercase tracking-widest" style={{ color: SHOP_ACCENT }}>SHOPbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Tag size={18} /> Attributes</h2>
        <p className="text-xs text-muted-foreground">Manage dynamic product attributes for the SHOP catalogue. Define them once, then assign to categories or sub-categories.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Attribute definitions */}
        <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-attr-defs">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="text-sm font-semibold flex-1">Definitions <span className="text-muted-foreground">({attributes.length})</span></div>
            <button onClick={() => setNewAttr({ name: "", type: "select", unit: "" })}
              data-testid="shop-attr-add-btn"
              className="h-8 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1"
              style={{ background: SHOP_ACCENT }}>
              <Plus size={12} /> Add
            </button>
          </div>
          {newAttr && (
            <div className="p-3 border-b border-border space-y-2" data-testid="shop-attr-new-form">
              <input value={newAttr.name} onChange={(e) => setNewAttr({ ...newAttr, name: e.target.value })}
                placeholder="Attribute name (e.g. Colour)"
                data-testid="shop-attr-new-name"
                className="w-full h-9 px-3 rounded-md bg-secondary border border-border text-sm" />
              <div className="flex gap-2">
                <select value={newAttr.type} onChange={(e) => setNewAttr({ ...newAttr, type: e.target.value })}
                  data-testid="shop-attr-new-type"
                  className="flex-1 h-9 px-2 rounded-md bg-secondary border border-border text-xs">
                  {ATTR_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
                <input value={newAttr.unit} onChange={(e) => setNewAttr({ ...newAttr, unit: e.target.value })}
                  placeholder="Unit"
                  data-testid="shop-attr-new-unit"
                  className="w-20 h-9 px-2 rounded-md bg-secondary border border-border text-xs" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNewAttr(null)} className="h-8 px-3 rounded-md text-xs border border-border">Cancel</button>
                <button onClick={createAttribute} data-testid="shop-attr-new-save"
                  className="h-8 px-3 rounded-md text-xs font-semibold text-black" style={{ background: SHOP_ACCENT }}>
                  Create
                </button>
              </div>
            </div>
          )}
          <div className="max-h-[560px] overflow-y-auto">
            {attributes.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">No SHOP attributes yet.</div>
            )}
            {attributes.map((a) => (
              <div key={a.id} data-testid={`shop-attr-row-${a.key}`} className="p-3 border-t border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {a.key} · {a.type}{a.unit ? ` · ${a.unit}` : ""} · {a.option_count} options
                  </div>
                </div>
                <button onClick={() => deleteAttribute(a.id)} data-testid={`shop-attr-del-${a.key}`}
                  className="w-7 h-7 rounded-md hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center text-muted-foreground">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Assignments pane */}
        <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-attr-assignments">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold flex-1">Assignments</div>
              <button onClick={() => setPickerOpen(true)} disabled={!selCatId || availableAttrs.length === 0}
                data-testid="shop-attr-assign-btn"
                className="h-8 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1 disabled:opacity-40"
                style={{ background: SHOP_ACCENT }}>
                <Plus size={12} /> Assign attribute
              </button>
            </div>
            {/* Scope pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <select value={selCatId || ""} onChange={(e) => { setSelCatId(e.target.value); setSelSubId(""); }}
                data-testid="shop-attr-cat-picker"
                className="h-8 px-2 rounded-md bg-secondary border border-border text-xs min-w-[180px]">
                <option value="">Select category…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name_en || c.slug}</option>)}
              </select>
              <select value={selSubId} onChange={(e) => setSelSubId(e.target.value)}
                data-testid="shop-attr-sub-picker"
                disabled={!selCatId || subs.length === 0}
                className="h-8 px-2 rounded-md bg-secondary border border-border text-xs min-w-[180px] disabled:opacity-40">
                <option value="">All (parent scope)</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.name_en || s.slug}</option>)}
              </select>
              <div className="text-[10px] text-muted-foreground">
                Scope: <b>{selSub ? `${selCat?.name_en || selCat?.slug} → ${selSub.name_en || selSub.slug}` : (selCat?.name_en || selCat?.slug || "—")}</b>
              </div>
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {busy && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
            {!busy && !selCatId && <div className="p-10 text-center text-xs text-muted-foreground">Select a category above.</div>}
            {!busy && selCatId && filteredAssignments.length === 0 && (
              <div className="p-10 text-center text-xs text-muted-foreground">No attributes assigned to this scope yet.</div>
            )}
            {!busy && filteredAssignments.map((a) => (
              <div key={a.id} data-testid={`shop-attr-assign-row-${a.attribute?.key}`} className="p-3 border-t border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{a.attribute?.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {a.attribute?.key} · {a.attribute?.type} · sort {a.sort_order}
                  </div>
                </div>
                <ToggleChip label="Required"
                  on={a.is_required}
                  onChange={() => patchAssignment(a.id, { is_required: !a.is_required })}
                  testid={`shop-attr-toggle-req-${a.attribute?.key}`} />
                <ToggleChip label="Visible" icon={a.customer_visible ? Eye : EyeOff}
                  on={a.customer_visible}
                  onChange={() => patchAssignment(a.id, { customer_visible: !a.customer_visible })}
                  testid={`shop-attr-toggle-vis-${a.attribute?.key}`} />
                <ToggleChip label="Seller-edit" icon={ShieldCheck}
                  on={a.supplier_editable}
                  onChange={() => patchAssignment(a.id, { supplier_editable: !a.supplier_editable })}
                  testid={`shop-attr-toggle-sup-${a.attribute?.key}`} />
                <button onClick={() => deleteAssignment(a.id)} data-testid={`shop-attr-unassign-${a.attribute?.key}`}
                  className="w-7 h-7 rounded-md hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center text-muted-foreground">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Attribute picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" data-testid="shop-attr-picker-modal" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="text-lg font-bold">Assign attribute</div>
              <button onClick={() => setPickerOpen(false)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {availableAttrs.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">All SHOP attributes are already assigned to this scope.</div>
              )}
              {availableAttrs.map((a) => (
                <button key={a.id} onClick={() => assignAttribute(a.id)}
                  data-testid={`shop-attr-picker-${a.key}`}
                  className="w-full text-left p-3 border-b border-border hover:bg-secondary/30 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{a.key} · {a.type}</div>
                  </div>
                  <ChevronDown size={14} className="text-muted-foreground -rotate-90" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ToggleChip = ({ label, icon: Icon = Check, on, onChange, testid }) => (
  <button onClick={onChange} data-testid={testid}
    className="h-7 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 border"
    style={{
      background: on ? `${SHOP_ACCENT}22` : "transparent",
      color: on ? SHOP_ACCENT : "var(--muted-foreground)",
      borderColor: on ? `${SHOP_ACCENT}66` : "var(--border)",
    }}>
    <Icon size={10} /> {label}
  </button>
);

export default AdminShopAttributes;
