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
  bool:  (name, label, help = "") => ({ name, label, kind: "bool",  help }),
  list:  (name, label, itemFields, help = "") => ({ name, label, kind: "list", itemFields, help }),
  // Nested object — renders sub-fields under a single labelled block.
  group: (name, label, fields, help = "") => ({ name, label, kind: "group", fields, help }),
};

// ---------------------------------------------------------------------------
// Field builders reused across schemas so seller-facing labels stay
// consistent (Fixing_Prompt v12 — inline hero editor).
// ---------------------------------------------------------------------------
const _SLIDE_FIELDS = [
  F.text("eyebrow", "Eyebrow", "Small tag above the headline (e.g. THE BAKĒD MARKETPLACE)"),
  F.text("headline", "Headline"),
  F.area("description", "Description"),
  F.image("image", "Background image"),
  F.text("badge", "Badge (optional, e.g. NEW, 30% off)"),
  F.text("cta_label", "Primary CTA label"),
  F.url("cta_link", "Primary CTA link"),
  F.text("secondary_cta_label", "Secondary CTA label (optional)"),
  F.url("secondary_cta_link", "Secondary CTA link (optional)"),
];

const _PROMO_FIELDS = [
  F.bool("enabled", "Show this banner"),
  F.image("image", "Banner image"),
  F.text("label", "Label (small caps, e.g. NEW ARRIVALS)"),
  F.text("heading", "Heading"),
  F.text("description", "Description"),
  F.text("badge", "Badge (optional)"),
  F.text("cta_label", "CTA button label"),
  F.url("cta_link", "CTA link"),
];

const _USP_FIELDS = [
  F.text("icon", "Icon key (shield / truck / sparkles / tag)"),
  F.text("title", "Title"),
  F.text("subtitle", "Subtitle"),
];

const SECTION_SCHEMAS = {
  hero: {
    label: "Hero Banner",
    top: [F.text("title", "Legacy headline (used only when no slides)"),
          F.area("subtitle", "Legacy sub-headline")],
    // Hero uses a TABBED editor. Each tab is a slice of the config, driven
    // by SECTION_SCHEMAS[section_type].tabs when present. Basics keeps the
    // pre-slide legacy fields; Slides / Right Banners / USP each map to a
    // known slice of `config` per Fixing_Prompt v11.
    tabs: [
      { key: "basics", label: "Basics", fields: [
          F.image("background_image", "Fallback background image (used when no slides)"),
          F.image("mobile_background_image", "Mobile background image (optional)"),
          F.text("cta_label", "Legacy CTA label"),
          F.url("cta_link", "Legacy CTA link"),
      ]},
      { key: "slides", label: "Slides", fields: [
          F.list("slides", "Carousel slides (3-4 recommended)", _SLIDE_FIELDS),
      ]},
      { key: "right", label: "Right Banners", fields: [
          F.group("right_top", "Right — Top banner (desktop only)", _PROMO_FIELDS),
          F.group("right_bottom", "Right — Bottom banner (desktop only)", _PROMO_FIELDS),
      ]},
      { key: "usp", label: "USP Strip", fields: [
          F.list("usp", "Feature tiles (desktop only)", _USP_FIELDS),
      ]},
    ],
    config: [],  // rendered via tabs above
  },
  category_grid: {
    label: "Category Grid",
    top: [F.text("title", "Title"), F.text("subtitle", "Subtitle")],
    config: [
      F.num("columns", "Columns (desktop)"),
      F.list("categories", "Categories", [
        F.text("slug", "Category slug (e.g. mode-femme)"),
        F.text("name", "Display name"),
        F.image("image", "Icon / illustration URL"),
        // QA — Fixing_Prompt "Admin #5": explicit link overrides slug-based
        // routing so CMS tiles can target /shop/c/<slug>, /shop/categories,
        // or any promo page. Blank = derive from `slug` (default).
        F.url("link", "Target link (blank ⇒ /shop/c/{slug})"),
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
      F.text("filter", "Category slug (or keyword: bestsellers / new). Blank = all"),
      F.text("subcategory", "Subcategory slug (optional)"),
      F.num("limit", "Number of products to show"),
      // QA — Fixing_Prompt "Home #2": explicit URL wins; otherwise "View
      // all" auto-derives from `filter` (category slug) → /shop/c/{filter}.
      F.url("link", "\"View all\" link (blank ⇒ auto from Category slug)"),
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
  const [module, setModule] = useState("mart");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);   // full row being edited
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(
        `/admin/homepage-sections?country=${country}&module=${module}`,
      );
      setItems(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country, module]);

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
        rest.module = module;
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
          <span className="inline-flex rounded-full border border-border p-1 text-xs"
                data-testid="hp-module-toggle">
            {[
              { code: "mart", label: "MARTbakēd" },
              { code: "shop", label: "SHOPbakēd" },
            ].map((m) => (
              <button
                key={m.code}
                onClick={() => setModule(m.code)}
                data-testid={`hp-module-${m.code}`}
                className={`px-3 py-1.5 rounded-full transition-colors ${
                  module === m.code
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </span>
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
  const tabs = schema.tabs;
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.key || "content");

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
  // Grouped field setter — writes to `config[groupName][subField]`.
  const setGroupField = (groupName, subField, value) => setDraft((d) => ({
    ...d,
    config: { ...d.config, [groupName]: { ...(d.config?.[groupName] || {}), [subField]: value } },
  }));

  const renderFieldList = (fields) => (
    <>
      {fields.map((f) => {
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
        if (f.kind === "group") {
          const obj = draft.config?.[f.name] || {};
          return (
            <div key={f.name} className="mb-4 rounded-lg border border-border p-3"
                 data-testid={`hp-editor-group-${f.name}`}>
              <div className="text-xs font-semibold mb-2">{f.label}</div>
              {f.fields.map((sub) => (
                <FieldRenderer key={sub.name} field={sub}
                               value={obj[sub.name]}
                               onChange={(v) => setGroupField(f.name, sub.name, v)} />
              ))}
            </div>
          );
        }
        return (
          <FieldRenderer key={f.name} field={f}
                         value={draft.config?.[f.name]}
                         onChange={(v) => set(f.name, v)} />
        );
      })}
    </>
  );

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
            {tabs ? (
              <>
                {/* Tab bar — only rendered for section types that define
                    schema.tabs (Hero for now). Keeps the form compact
                    while giving admins a focused edit surface per slice. */}
                <div className="flex flex-wrap gap-1 mb-3 border-b border-border" role="tablist">
                  {tabs.map((t) => (
                    <button key={t.key}
                            role="tab"
                            aria-selected={activeTab === t.key}
                            onClick={() => setActiveTab(t.key)}
                            data-testid={`hp-editor-tab-${t.key}`}
                            className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                              activeTab === t.key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {renderFieldList(tabs.find((t) => t.key === activeTab)?.fields || [])}
              </>
            ) : schema.config.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">No extra config for this section type.</p>
            ) : renderFieldList(schema.config)}
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
      ) : field.kind === "bool" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value !== false}
                 onChange={(e) => onChange(e.target.checked)}
                 data-testid={`hp-field-${field.name}`} />
          <span>{field.help || "Enabled"}</span>
        </label>
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

/**
 * QA — Fixing_Prompt "Admin #4": Kubernetes ingress `client_max_body_size`
 * defaults to 1 MiB in most stacks, which trips a 413 for banner-quality
 * images long before our 8 MiB app-level check runs. We resize + re-encode
 * the source on-canvas so uploads always slide comfortably under the
 * proxy limit while keeping banner-grade sharpness (≤2200 px longest side,
 * JPEG @ q=0.85). Small files are passed through unchanged.
 */
const MAX_UPLOAD_BYTES_TARGET = 900 * 1024;     // ≈0.9 MiB → under typical 1 MiB ingress cap
const MAX_UPLOAD_DIMENSION    = 2200;            // px, longest side after resize

async function compressImageIfNeeded(file) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= MAX_UPLOAD_BYTES_TARGET)      return file;
  // Skip re-encoding for SVG (already tiny) and animated GIFs (canvas would freeze them).
  if (/svg|gif/i.test(file.type))                return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const ratio = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Progressive quality drop until we're safely under the target size —
  // banner content survives q=0.7 easily.
  for (const q of [0.85, 0.75, 0.65]) {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_UPLOAD_BYTES_TARGET) {
      const base = (file.name || "banner").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    }
  }
  // Last-resort attempt at the lowest quality.
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.55));
  const base = (file.name || "banner").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

const ImageField = ({ name, value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef(null);
  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please pick an image file");
    setBusy(true);
    try {
      const compressed = await compressImageIfNeeded(file);
      if (compressed !== file) {
        // Info toast so admin knows a large source was auto-resized. Silent
        // when the original was already small enough.
        const kb = Math.round(compressed.size / 1024);
        toast.message(`Auto-optimised ${kb} KB (originally ${Math.round(file.size / 1024)} KB)`);
      }
      const form = new FormData();
      form.append("file", compressed, compressed.name);
      const { data } = await adminApi.post("/admin/homepage-sections/uploads", form,
        { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.file_url);
      toast.success("Uploaded");
    } catch (e) {
      // 413 can still happen if ingress limit is lower than target. Surface
      // an actionable message pointing the admin at the tighter cap.
      if (e?.response?.status === 413) {
        toast.error("Upload rejected by the server (payload too large). Try a smaller image or JPEG.");
      } else {
        toast.error(errMsg(e));
      }
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
