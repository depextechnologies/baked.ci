/**
 * Super Admin — Homepage Sections management (Social.docx §Homepage, Phase A).
 *
 * Schema-driven editor: each section_type declares its field list in
 * SECTION_SCHEMAS. Adding a new section type = add an entry here + one
 * consumer render fn on the homepage. No structural code changes.
 *
 * Mounted at /admin/homepage-management.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Home, ArrowUp, ArrowDown, Eye, EyeOff, Pencil, Trash2, Plus, Save, X, Loader2, Globe,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const COUNTRIES = [
  { code: "CI", label: "🇨🇮 Côte d'Ivoire" },
  { code: "IN", label: "🇮🇳 India" },
];

/* ------------------------------ SCHEMAS ---------------------------------- *
 * Each section_type declares its fields for the editor form.
 * Adding a new section type here + one renderer on the homepage is enough.
 * ------------------------------------------------------------------------ */

const F = {
  text:  (name, label, help = "") => ({ name, label, kind: "text",  help }),
  area:  (name, label, help = "") => ({ name, label, kind: "area",  help }),
  url:   (name, label, help = "") => ({ name, label, kind: "url",   help }),
  image: (name, label, help = "") => ({ name, label, kind: "image", help }),
  num:   (name, label, help = "") => ({ name, label, kind: "num",   help }),
  list:  (name, label, itemFields, help = "") => ({ name, label, kind: "list", itemFields, help }),
};

const SECTION_SCHEMAS = {
  hero: {
    label: "Hero Banner",
    top: [F.text("title", "Headline"), F.area("subtitle", "Sub-headline")],
    config: [
      F.text("cta_label", "CTA button label"),
      F.url("cta_link", "CTA link"),
      F.image("background_image", "Desktop background image URL"),
      F.image("mobile_background_image", "Mobile background image URL (optional)"),
    ],
  },
  category_grid: {
    label: "Category Grid",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [
      F.num("columns", "Columns (desktop)"),
      F.list("categories", "Categories", [
        F.text("slug", "Slug"),
        F.text("name", "Display name"),
        F.image("image", "Icon / illustration URL"),
      ]),
    ],
  },
  promotional_banner: {
    label: "Promotional Banner (single)",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [
      F.image("image", "Banner image URL"),
      F.url("link", "Click-through link"),
      F.text("cta_label", "CTA label"),
    ],
  },
  banner_trio: {
    label: "Banner Trio (3 side-by-side)",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [F.list("banners", "Banners (3)", [
      F.image("image", "Image URL"),
      F.url("link", "Click-through link"),
      F.text("label", "Label"),
    ])],
  },
  product_carousel: {
    label: "Product Carousel",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [
      F.text("filter", "Filter (bestsellers / new / category slug)"),
      F.num("limit", "Number of products to show"),
      F.url("link", "See-all link"),
    ],
  },
  brand_carousel: {
    label: "Brand Carousel (Marques que vous pourriez aimer)",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [F.list("brands", "Brands", [
      F.text("name", "Brand name"),
      F.image("image", "Logo URL"),
    ])],
  },
  app_promotion: {
    label: "App Promotion (QR + Play/App Store)",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [
      F.image("logo", "App icon / logo URL"),
      F.image("phone_screenshot", "Phone mockup screenshot URL"),
      F.url("google_play_url", "Google Play URL"),
      F.url("app_store_url", "Apple App Store URL"),
      F.text("qr_target", "URL the QR code should point to"),
    ],
  },
  cta_strip: {
    label: "CTA Strip",
    top: [F.text("title", "Headline"), F.text("subtitle", "Subline")],
    config: [F.text("cta_label", "CTA label"), F.url("cta_link", "CTA link")],
  },
};

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Error";

export const AdminHomepageManagement = () => {
  const [country, setCountry] = useState("CI");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);   // full row being edited
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/homepage-sections?country=${country}`);
      setItems(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country]);

  const toggle = async (row) => {
    try {
      await adminApi.patch(`/admin/homepage-sections/${row.id}`, { is_enabled: !row.is_enabled });
      toast.success(row.is_enabled ? "Disabled" : "Enabled");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.title || row.section_type}" section?`)) return;
    try {
      await adminApi.delete(`/admin/homepage-sections/${row.id}`);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const move = async (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    const payload = reordered.map((r, i) => ({ id: r.id, display_order: (i + 1) * 10 }));
    try {
      await adminApi.patch(`/admin/homepage-sections/reorder`, { items: payload });
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const save = async (row) => {
    try {
      if (row._creating) {
        const { _creating, id, ...rest } = row;
        void _creating; void id;
        rest.country = country;
        rest.display_order = ((items[items.length - 1]?.display_order) || 0) + 10;
        await adminApi.post(`/admin/homepage-sections`, rest);
        toast.success("Section created");
      } else {
        await adminApi.patch(`/admin/homepage-sections/${row.id}`, {
          title: row.title, subtitle: row.subtitle, config: row.config, is_enabled: row.is_enabled,
        });
        toast.success("Saved");
      }
      setEditing(null); setCreating(false);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-6 space-y-4" data-testid="admin-homepage-management">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Configuration</div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Home size={22} /> Homepage Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add, reorder, edit and toggle sections on the customer homepage. Country-specific.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-muted-foreground" />
          <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className="h-9 rounded-lg bg-secondary text-sm px-3"
                  data-testid="hp-country-select">
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <button onClick={() => { setCreating(true); setEditing({ _creating: true, id: null,
            section_type: "hero", title: "", subtitle: "", config: {}, is_enabled: true }); }}
                  className="h-9 px-3 rounded-lg text-xs uppercase tracking-widest font-semibold bg-primary text-primary-foreground flex items-center gap-1"
                  data-testid="hp-add-btn">
            <Plus size={14} /> Add section
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm" data-testid="hp-table">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 w-16">Order</th>
              <th className="text-left px-4 py-3">Section</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3 w-24">Status</th>
              <th className="text-right px-4 py-3 w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="animate-spin inline" size={18} /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No sections yet — click <b>Add section</b> to build the homepage.</td></tr>
            ) : items.map((row, idx) => (
              <tr key={row.id} className="border-t border-border hover:bg-secondary/20"
                  data-testid={`hp-row-${row.id}`}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.display_order}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{row.title || <span className="italic text-muted-foreground">Untitled</span>}</div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-md">{row.subtitle}</div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "rgba(119,188,31,.15)", color: "#77BC1F" }}>
                    {SECTION_SCHEMAS[row.section_type]?.label || row.section_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(row)} className="text-xs flex items-center gap-1"
                          style={{ color: row.is_enabled ? "#77BC1F" : "#94A3B8" }}
                          data-testid={`hp-toggle-${row.id}`}>
                    {row.is_enabled ? <><Eye size={14} /> Enabled</> : <><EyeOff size={14} /> Hidden</>}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                            className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary disabled:opacity-30"
                            title="Move up" data-testid={`hp-up-${row.id}`}><ArrowUp size={14} /></button>
                    <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                            className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary disabled:opacity-30"
                            title="Move down" data-testid={`hp-down-${row.id}`}><ArrowDown size={14} /></button>
                    <button onClick={() => setEditing({ ...row, config: row.config || {} })}
                            className="px-2 h-8 rounded text-xs flex items-center gap-1 border border-border hover:bg-secondary"
                            data-testid={`hp-edit-${row.id}`}><Pencil size={12} /> Edit</button>
                    <button onClick={() => remove(row)}
                            className="w-8 h-8 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/10"
                            title="Delete" data-testid={`hp-delete-${row.id}`}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SectionEditor
          row={editing}
          creating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      )}
    </div>
  );
};

/* --------------------------- Schema-driven editor ------------------------ */

const SectionEditor = ({ row, creating, onClose, onSave }) => {
  const [draft, setDraft] = useState(row);
  const schema = SECTION_SCHEMAS[draft.section_type] || { top: [], config: [] };

  const set = (path, value) => setDraft((d) => {
    if (path === "section_type") return { ...d, section_type: value, config: {} };
    if (path === "title" || path === "subtitle" || path === "is_enabled") return { ...d, [path]: value };
    return { ...d, config: { ...d.config, [path]: value } };
  });

  const setListItem = (listName, itemIdx, itemField, value) => setDraft((d) => {
    const list = [...(d.config?.[listName] || [])];
    list[itemIdx] = { ...list[itemIdx], [itemField]: value };
    return { ...d, config: { ...d.config, [listName]: list } };
  });
  const addListItem = (listName) => setDraft((d) => ({
    ...d, config: { ...d.config, [listName]: [...(d.config?.[listName] || []), {}] },
  }));
  const rmListItem = (listName, itemIdx) => setDraft((d) => ({
    ...d, config: { ...d.config, [listName]: (d.config?.[listName] || []).filter((_, i) => i !== itemIdx) },
  }));

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose}>
      <div className="w-full max-w-2xl bg-background border-l border-border h-full overflow-y-auto"
           onClick={(e) => e.stopPropagation()} data-testid="hp-editor">
        <div className="sticky top-0 bg-background z-10 p-5 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {creating ? "New section" : "Edit section"}
            </div>
            <h2 className="text-lg font-bold">{schema.label}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center"
                  data-testid="hp-editor-close"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {creating && (
            <Field label="Section type">
              <select value={draft.section_type} onChange={(e) => set("section_type", e.target.value)}
                      className="w-full h-10 rounded-lg bg-secondary px-3 text-sm"
                      data-testid="hp-editor-type">
                {Object.entries(SECTION_SCHEMAS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
          )}

          {schema.top.map((f) => (
            <FieldRenderer key={f.name} field={f}
                           value={draft[f.name]}
                           onChange={(v) => set(f.name, v)} />
          ))}

          <div className="pt-3 border-t border-border">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Section content</div>
            {schema.config.length === 0
              ? <p className="text-xs italic text-muted-foreground">No extra config for this section type.</p>
              : schema.config.map((f) => {
                  if (f.kind === "list") {
                    const rows = draft.config?.[f.name] || [];
                    return (
                      <div key={f.name} className="mb-4">
                        <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                          {f.label}
                          <button onClick={() => addListItem(f.name)}
                                  className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-border"
                                  data-testid={`hp-editor-list-add-${f.name}`}>+ Add</button>
                        </div>
                        {rows.map((item, i) => (
                          <div key={i} className="rounded-lg border border-border p-3 mb-2 space-y-2"
                               data-testid={`hp-editor-list-item-${f.name}-${i}`}>
                            {f.itemFields.map((sub) => (
                              <FieldRenderer key={sub.name} field={sub}
                                             value={item[sub.name]}
                                             onChange={(v) => setListItem(f.name, i, sub.name, v)} />
                            ))}
                            <button onClick={() => rmListItem(f.name, i)}
                                    className="text-[10px] uppercase tracking-widest text-rose-400">
                              Remove
                            </button>
                          </div>
                        ))}
                        {rows.length === 0 && (
                          <p className="text-[11px] italic text-muted-foreground">None yet — click + Add.</p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <FieldRenderer key={f.name} field={f}
                                   value={draft.config?.[f.name]}
                                   onChange={(v) => set(f.name, v)} />
                  );
                })}
          </div>

          <label className="flex items-center gap-2 text-sm mt-4">
            <input type="checkbox" checked={draft.is_enabled} onChange={(e) => set("is_enabled", e.target.checked)}
                   data-testid="hp-editor-enabled" />
            Enabled
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <button onClick={onClose} className="px-4 h-10 rounded-lg text-sm">Cancel</button>
            <button onClick={() => onSave(draft)}
                    className="px-4 h-10 rounded-lg text-sm font-semibold flex items-center gap-2 bg-primary text-primary-foreground"
                    data-testid="hp-editor-save">
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, help, children }) => (
  <div className="mb-3">
    <div className="text-xs font-semibold mb-1">{label}</div>
    {children}
    {help && <div className="text-[10px] text-muted-foreground mt-1">{help}</div>}
  </div>
);

const FieldRenderer = ({ field, value, onChange }) => {
  const v = value ?? "";
  const inputCls = "w-full h-10 rounded-lg bg-secondary px-3 text-sm";
  return (
    <Field label={field.label} help={field.help}>
      {field.kind === "area" ? (
        <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={2}
                  className="w-full rounded-lg bg-secondary p-3 text-sm"
                  data-testid={`hp-field-${field.name}`} />
      ) : field.kind === "num" ? (
        <input type="number" value={v} onChange={(e) => onChange(Number(e.target.value))}
               className={inputCls} data-testid={`hp-field-${field.name}`} />
      ) : field.kind === "image" ? (
        <ImageField name={field.name} value={v} onChange={onChange} />
      ) : (
        <input type={field.kind === "url" ? "url" : "text"}
               value={v} onChange={(e) => onChange(e.target.value)}
               className={inputCls} data-testid={`hp-field-${field.name}`} />
      )}
    </Field>
  );
};

const ImageField = ({ name, value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef(null);
  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please pick an image file");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await adminApi.post("/admin/homepage-sections/uploads", form,
        { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.file_url);
      toast.success("Uploaded");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div>
      <div className="flex gap-2 items-start">
        <input type="url" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
               placeholder="https://… or upload →"
               className="flex-1 h-10 rounded-lg bg-secondary px-3 text-sm"
               data-testid={`hp-field-${name}`} />
        <label className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
               data-testid={`hp-field-${name}-upload`}>
          {busy ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
          {busy ? "Uploading…" : "Upload"}
          <input ref={inputRef} type="file" accept="image/*" hidden
                 onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {value && (
          <button onClick={() => onChange("")} className="h-10 w-10 rounded-lg bg-secondary text-rose-400"
                  data-testid={`hp-field-${name}-clear`}><X size={14} className="mx-auto" /></button>
        )}
      </div>
      {value ? (
        <div className="mt-2 rounded-lg border border-border bg-background/40 p-2 inline-block">
          <img src={value.startsWith("/") ? `${process.env.REACT_APP_BACKEND_URL}${value}` : value}
               alt="preview" className="max-h-32 rounded" onError={(e) => e.currentTarget.style.display = "none"}
               data-testid={`hp-field-${name}-preview`} />
        </div>
      ) : null}
    </div>
  );
};

export default AdminHomepageManagement;
