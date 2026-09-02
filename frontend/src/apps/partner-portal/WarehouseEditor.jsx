/**
 * Warehouse editor — extracted from PartnerPortalApp.jsx so the Emergent
 * visual-edits Babel plugin doesn't hit its JSX-depth ceiling.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { partnerApi, usePartner } from "./PartnerPortalApp";

const fieldStyle = { background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" };
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  if (d && typeof d === "object" && d.message) return d.message;
  return d || e?.message || "Something went wrong";
};

const LEVEL_LABELS = {
  zone:  { label: "Zone",  child: "aisle" },
  aisle: { label: "Aisle", child: "rack" },
  rack:  { label: "Rack",  child: "shelf" },
  shelf: { label: "Shelf", child: "bin" },
  bin:   { label: "Bin",   child: null },
};

/**
 * CategoryFields — cascading Category → Subcategory pickers used for
 * Aisle + Rack create/edit rows. Fetches categories on mount and reloads
 * subcategories whenever the selected category changes. Resets the
 * subcategory when the category is cleared (or replaced).
 *
 * When rendered inside a Rack row, `inheritedCategory` locks the category
 * picker to the parent Aisle's category so operators can't accidentally
 * introduce an inconsistent branch (backend still validates as a safety
 * net — see mart_partner/routes.py :_validate_category_cascade).
 */
const CategoryFields = ({ country, cat, setCat, sub, setSub, inheritedCategory = null, testidPrefix = "cascade" }) => {
  const [cats, setCats] = useState([]);
  const [subs, setSubs] = useState([]);
  useEffect(() => {
    partnerApi.get(`/mart/categories?country=${country}`).then(r => setCats(r.data || [])).catch(() => setCats([]));
  }, [country]);
  useEffect(() => {
    if (!cat) { setSubs([]); return; }
    partnerApi.get(`/mart/subcategories?country=${country}&category=${encodeURIComponent(cat)}`)
      .then(r => setSubs(r.data || []))
      .catch(() => setSubs([]));
  }, [cat, country]);
  return (
    <>
      <select value={cat} onChange={e => { setCat(e.target.value); setSub(""); }}
              disabled={!!inheritedCategory}
              className="px-2 h-8 rounded text-sm w-40" style={fieldStyle}
              data-testid={`${testidPrefix}-category`}>
        <option value="">— Category —</option>
        {cats.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <select value={sub} onChange={e => setSub(e.target.value)}
              disabled={!cat}
              className="px-2 h-8 rounded text-sm w-40"
              style={{ ...fieldStyle, opacity: cat ? 1 : 0.55 }}
              data-testid={`${testidPrefix}-subcategory`}>
        <option value="">— Subcategory —</option>
        {subs.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
      </select>
    </>
  );
};

const CategoryChips = ({ node }) => {
  if (!node?.category_slug && !node?.subcategory_slug) return null;
  return (
    <span className="flex items-center gap-1 ml-2">
      {node.category_slug && (
        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>
          {node.category_slug}
        </span>
      )}
      {node.subcategory_slug && (
        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: "rgba(96,165,250,.15)", color: "#60a5fa" }}>
          {node.subcategory_slug}
        </span>
      )}
    </span>
  );
};

const NodeRow = ({ node, level, meta, warehouseId, onChange, depth, onEditToggle, editing, onAddClick, hasChildLevel, onExpand, expanded, country, parentCategory, parentSubcategory }) => {
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code);
  const [cat, setCat] = useState(node.category_slug || "");
  const [sub, setSub] = useState(node.subcategory_slug || "");
  const supportsCascade = level === "aisle" || level === "rack";
  const inherited = level === "rack" ? (parentCategory || null) : null;
  useEffect(() => {
    if (level === "rack" && parentCategory && cat !== parentCategory) setCat(parentCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentCategory]);

  const save = async () => {
    try {
      const body = { code, name };
      if (supportsCascade) {
        body.category_slug    = cat || null;
        body.subcategory_slug = sub || null;
      }
      await partnerApi.patch(`/partner/warehouse/${warehouseId}/nodes/${level}/${node.id}`, body);
      toast.success("Updated");
      onEditToggle(false);
      onChange();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${meta.label} "${node.code}"?`)) return;
    try {
      await partnerApi.delete(`/partner/warehouse/${warehouseId}/nodes/${level}/${node.id}`);
      toast.success(`${meta.label} deleted`);
      onChange();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="flex items-center gap-2 py-2 group flex-wrap"
         style={{ borderBottom: "1px solid var(--ph-border)", paddingLeft: depth * 20 }}>
      {hasChildLevel ? (
        <button onClick={onExpand} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5" style={{ color: "var(--ph-fg-subtle)" }}>
          <ChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
      ) : <div className="w-6" />}
      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>{meta.label}</span>
      {editing ? (
        <>
          <input value={code} onChange={e => setCode(e.target.value)} className="px-2 h-8 rounded text-sm font-mono w-24" style={fieldStyle} />
          <input value={name} onChange={e => setName(e.target.value)} className="px-2 h-8 rounded text-sm flex-1 min-w-[160px]" style={fieldStyle} />
          {supportsCascade && (
            <CategoryFields country={country} cat={cat} setCat={setCat} sub={sub} setSub={setSub}
                            inheritedCategory={inherited} testidPrefix={`node-edit-${node.code}`} />
          )}
          <button onClick={save} className="text-xs px-2 h-8 rounded" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid={`node-save-${node.id}`}>Save</button>
          <button onClick={() => { onEditToggle(false); setName(node.name); setCode(node.code); setCat(node.category_slug || ""); setSub(node.subcategory_slug || ""); }} className="text-xs px-2 h-8" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
        </>
      ) : (
        <>
          <span className="font-mono text-xs" style={{ color: "var(--ph-fg)" }}>{node.code}</span>
          <span className="text-sm" style={{ color: "var(--ph-fg-muted)" }}>{node.name}</span>
          {supportsCascade && <CategoryChips node={node} />}
          {level === "zone" && node.suggested_category_slug && (
            <span
              data-testid={`zone-default-chip-${node.code}`}
              title="Default category for new Aisles under this Zone"
              className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)",
                       border: "1px dashed var(--ph-accent-warm)" }}
            >
              default · {node.suggested_category_slug}
            </span>
          )}
          <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button onClick={() => onEditToggle(true)} className="text-xs px-2 h-7 rounded" style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }} data-testid={`node-edit-${node.id}`}>Edit</button>
            <button onClick={remove} className="text-xs px-2 h-7 rounded text-rose-400" style={{ border: "1px solid var(--ph-border-strong)" }} data-testid={`node-delete-${node.id}`}>Delete</button>
            {hasChildLevel && (
              <button onClick={onAddClick} className="text-xs px-2 h-7 rounded" style={{ color: "var(--ph-accent-warm)", border: "1px solid var(--ph-border-strong)" }} data-testid={`node-add-child-${node.id}`}>
                + {LEVEL_LABELS[meta.child].label}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const AddChildRow = ({ node, childLevel, warehouseId, depth, onDone, onCancel, country, parentCategory, parentSubcategory }) => {
  const [nCode, setNCode] = useState("");
  const [nName, setNName] = useState("");
  // Auto-suggest chain:
  //   • Aisle-under-Zone → pre-fill category from Zone default (via tree).
  //   • Rack-under-Aisle → pre-fill category AND subcategory from the parent
  //     Aisle's tags. Category stays locked (parent's cat is authoritative;
  //     backend rejects mismatches anyway). Subcategory renders as a
  //     dismissible ✨ hint chip so ops can override for a more specific rack.
  const zoneSuggested = childLevel === "aisle" ? (node.suggested_category_slug || "") : "";
  const rackInheritedCat = childLevel === "rack" ? (parentCategory    || "") : "";
  const rackInheritedSub = childLevel === "rack" ? (parentSubcategory || "") : "";
  const initialCat = zoneSuggested || rackInheritedCat;
  const initialSub = rackInheritedSub;
  const [cat, setCat] = useState(initialCat);
  const [sub, setSub] = useState(initialSub);
  const [catSuggestionActive, setCatSuggestionActive] = useState(!!zoneSuggested);
  const [subSuggestionActive, setSubSuggestionActive] = useState(!!rackInheritedSub);
  const supportsCascade = childLevel === "aisle" || childLevel === "rack";
  const inherited = childLevel === "rack" ? (parentCategory || null) : null;

  const submit = async () => {
    if (!nCode.trim() || !nName.trim()) return toast.error("Code and name required");
    try {
      const body = {
        level: childLevel, parent_id: node.id,
        code: nCode.trim(), name: nName.trim(),
      };
      if (supportsCascade) {
        body.category_slug    = cat || null;
        body.subcategory_slug = sub || null;
      }
      await partnerApi.post(`/partner/warehouse/${warehouseId}/nodes`, body);
      toast.success(`${LEVEL_LABELS[childLevel].label} added`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="flex items-center gap-2 py-2 flex-wrap" style={{ paddingLeft: (depth + 1) * 20 + 32 }}>
      <input placeholder="Code (A, 1, R3)" value={nCode} onChange={e => setNCode(e.target.value)} className="px-2 h-8 rounded text-sm font-mono w-32" style={fieldStyle} autoFocus />
      <input placeholder="Name" value={nName} onChange={e => setNName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className="px-2 h-8 rounded text-sm flex-1 min-w-[160px]" style={fieldStyle} />
      {supportsCascade && (
        <CategoryFields country={country} cat={cat}
                        setCat={(v) => { setCat(v); if (catSuggestionActive && v !== zoneSuggested) setCatSuggestionActive(false); }}
                        sub={sub}
                        setSub={(v) => { setSub(v); if (subSuggestionActive && v !== rackInheritedSub) setSubSuggestionActive(false); }}
                        inheritedCategory={inherited}
                        testidPrefix={`node-add-${childLevel}-${node.code}`} />
      )}
      {/* Auto-suggest chips — Aisle-under-Zone: dismissible category hint from
          Zone default. Rack-under-Aisle: subcategory hint inherited from the
          parent Aisle (category is locked by CategoryFields, so no chip). */}
      {zoneSuggested && catSuggestionActive && (
        <button
          type="button"
          onClick={() => setCatSuggestionActive(false)}
          data-testid={`node-add-${childLevel}-${node.code}-suggestion-chip`}
          className="text-[10px] uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1"
          style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)",
                   border: "1px dashed var(--ph-accent-warm)" }}
          title="Suggested from your Category defaults — click to dismiss"
        >
          <span>✨ Suggested · {zoneSuggested}</span>
        </button>
      )}
      {rackInheritedSub && subSuggestionActive && (
        <button
          type="button"
          onClick={() => { setSub(""); setSubSuggestionActive(false); }}
          data-testid={`node-add-${childLevel}-${node.code}-sub-suggestion-chip`}
          className="text-[10px] uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1"
          style={{ background: "rgba(96,165,250,.15)", color: "#60a5fa",
                   border: "1px dashed #60a5fa" }}
          title="Inherited from parent Aisle — click to clear and pick a different subcategory"
        >
          <span>✨ Suggested sub · {rackInheritedSub}</span>
        </button>
      )}
      <button onClick={submit} className="text-xs px-3 h-8 rounded" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid={`node-add-child-save-${node.id}`}>Add</button>
      <button onClick={onCancel} className="text-xs px-2 h-8" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
    </div>
  );
};

const HierarchyNode = ({ node, level, warehouseId, onChange, depth = 0, country, parentCategory = null, parentSubcategory = null }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const meta = { ...LEVEL_LABELS[level] };
  const childLevel = meta.child;
  // Children inherit this node's cascade tags when this node is an Aisle so
  // the "child Rack" picker starts pre-filled with the parent Aisle's
  // Category AND Subcategory (2026-02-28 auto-suggest expansion).
  const childInheritedCat = level === "aisle" ? (node.category_slug    || null) : null;
  const childInheritedSub = level === "aisle" ? (node.subcategory_slug || null) : null;

  return (
    <div className="ml-1" data-testid={`node-${level}-${node.code}`}>
      <NodeRow
        node={node} level={level} meta={meta} warehouseId={warehouseId} onChange={onChange} depth={depth}
        editing={editing} onEditToggle={setEditing}
        hasChildLevel={!!childLevel} expanded={expanded} onExpand={() => setExpanded(v => !v)}
        onAddClick={() => { setAdding(true); setExpanded(true); }}
        country={country}
        parentCategory={parentCategory}
        parentSubcategory={parentSubcategory}
      />
      {expanded && childLevel && (
        <div>
          {(node.children || []).map((c) =>
            React.createElement(HierarchyNode, {
              key: c.id, node: c, level: childLevel, warehouseId, onChange, depth: depth + 1,
              country,
              parentCategory:    childInheritedCat,
              parentSubcategory: childInheritedSub,
            })
          )}
          {adding && (
            <AddChildRow
              node={node} childLevel={childLevel} warehouseId={warehouseId} depth={depth}
              onDone={() => { setAdding(false); onChange(); }}
              onCancel={() => setAdding(false)}
              country={country}
              parentCategory={childInheritedCat}
              parentSubcategory={childInheritedSub}
            />
          )}
        </div>
      )}
    </div>
  );
};

export const WarehousePage = () => {
  const { warehouse, partner } = usePartner();
  const country = partner?.country || "CI";
  const [tree, setTree] = useState(null);
  const [addingZone, setAddingZone] = useState(false);
  const [zCode, setZCode] = useState("");
  const [zName, setZName] = useState("");

  const load = async () => {
    if (!warehouse) return;
    const { data } = await partnerApi.get(`/partner/warehouse/${warehouse.id}/tree`);
    setTree(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [warehouse?.id]);

  const addZone = async () => {
    if (!zCode.trim() || !zName.trim()) return toast.error("Code and name required");
    try {
      await partnerApi.post(`/partner/warehouse/${warehouse.id}/nodes`, {
        level: "zone", parent_id: warehouse.id, code: zCode.trim(), name: zName.trim(),
      });
      toast.success("Zone added");
      setAddingZone(false); setZCode(""); setZName("");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!warehouse) return <p className="ph-body">No warehouse configured yet.</p>;
  const c = tree?.counts || { zones: 0, aisles: 0, racks: 0, shelves: 0, bins: 0 };

  return (
    <div data-testid="portal-warehouse-page">
      <div className="ph-eyebrow">Warehouse</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>{warehouse.name}</h1>
      <p className="ph-body mt-2">{warehouse.address_line}, {warehouse.city}</p>

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[["Zones", c.zones], ["Aisles", c.aisles], ["Racks", c.racks], ["Shelves", c.shelves], ["Bins", c.bins]].map(([l, v]) => (
          <div key={l} className="rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>{l}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: "var(--ph-fg)" }}>{v}</div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="ph-h3" style={{ color: "var(--ph-fg)" }}>Storage hierarchy</h2>
          {!addingZone && (
            <button onClick={() => setAddingZone(true)} className="ph-btn ph-btn-warm" style={{ height: 40, padding: "0 18px" }} data-testid="warehouse-add-zone">
              + Add Zone
            </button>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--ph-fg-subtle)" }}>
          Zone → Aisle → Rack → Shelf → Bin. Aisles & Racks can be tagged with a Category + Subcategory —
          product location assignments then verify the cascade so ops can&apos;t misplace SKUs.
        </p>

        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          {addingZone && (
            <div className="flex items-center gap-2 py-3 px-4" style={{ borderBottom: "1px solid var(--ph-border)" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                    style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>Zone</span>
              <input placeholder="Code (A, B, Cold, Dry…)" value={zCode} onChange={e => setZCode(e.target.value)} className="px-2 h-8 rounded text-sm font-mono w-40" style={fieldStyle} autoFocus data-testid="warehouse-new-zone-code" />
              <input placeholder="Name" value={zName} onChange={e => setZName(e.target.value)} onKeyDown={e => e.key === "Enter" && addZone()} className="px-2 h-8 rounded text-sm flex-1" style={fieldStyle} data-testid="warehouse-new-zone-name" />
              <button onClick={addZone} className="text-xs px-3 h-8 rounded" style={{ background: "var(--ph-accent-warm)", color: "#0a0a0f" }} data-testid="warehouse-new-zone-save">Add</button>
              <button onClick={() => setAddingZone(false)} className="text-xs px-2 h-8" style={{ color: "var(--ph-fg-muted)" }}>Cancel</button>
            </div>
          )}
          {tree && tree.zones.length === 0 && !addingZone && (
            <div className="p-8 text-center text-sm" style={{ color: "var(--ph-fg-muted)" }}>
              No zones yet. Click <b>+ Add Zone</b> to start labelling your store.
            </div>
          )}
          {tree && tree.zones.map(z => (
            <HierarchyNode key={z.id} node={z} level="zone" warehouseId={warehouse.id} onChange={load} country={country} />
          ))}
        </div>
      </section>

      <CategoryDefaultsSection warehouseId={warehouse.id} zones={tree?.zones || []} />
    </div>
  );
};

/* -------- Social.docx §4 — Category → default Zone mapping table --------- */

const CategoryDefaultsSection = ({ warehouseId, zones }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await partnerApi.get(`/partner/inventory/warehouse/${warehouseId}/category-defaults`);
      setItems(data.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [warehouseId]);

  const setZone = async (slug, zoneId) => {
    setSaving(slug);
    try {
      await partnerApi.put(`/partner/inventory/warehouse/${warehouseId}/category-defaults`, {
        category_slug: slug, zone_id: zoneId || null, aisle_id: null,
      });
      toast.success(zoneId ? "Zone assigned" : "Cleared");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(null); }
  };

  return (
    <section className="mt-10" data-testid="category-defaults-section">
      <div className="flex items-center justify-between mb-3">
        <h2 className="ph-h3" style={{ color: "var(--ph-fg)" }}>Category → Zone defaults</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ph-fg-subtle)" }}>
        When ops assign a bin to a SKU, the bin picker will default to bins under the category&apos;s suggested zone.
      </p>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {loading ? (
          <div className="p-6 text-sm" style={{ color: "var(--ph-fg-subtle)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--ph-fg-muted)" }}>No categories available in your country yet.</div>
        ) : items.map(row => (
          <div key={row.category_slug}
               className="flex items-center gap-3 py-3 px-4"
               style={{ borderBottom: "1px solid var(--ph-border)" }}
               data-testid={`cat-default-row-${row.category_slug}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)" }}>Category</span>
            <div className="flex-1">
              <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{row.category_name}</div>
              <div className="font-mono text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{row.category_slug}</div>
            </div>
            <select value={row.mapping?.zone_id || ""}
                    onChange={e => setZone(row.category_slug, e.target.value)}
                    disabled={saving === row.category_slug || zones.length === 0}
                    className="px-3 h-9 rounded-lg text-sm w-56" style={fieldStyle}
                    data-testid={`cat-default-select-${row.category_slug}`}>
              <option value="">{zones.length === 0 ? "Add a zone first" : "— Unmapped —"}</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.code} · {z.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
};
