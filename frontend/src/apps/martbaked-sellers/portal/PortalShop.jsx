/**
 * PortalShop — SHOPbakēd seller portal page (Slice 4).
 *
 * Two-pane layout:
 *   Left:  My SHOP products (with "New product" button)
 *   Right: Form for the selected product (create or edit) with:
 *          - Category / subcategory picker (drives the attribute schema)
 *          - Dynamic parent-level attribute form auto-rendered from the
 *            resolver (`/api/shop/categories/{cid}/attributes`)
 *          - Variant editor grid (SKU × price × stock × per-variant attrs)
 *
 * Ownership + module gate enforced server-side; the UI simply calls
 * `/api/shop/portal/*` and reflects whatever comes back.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";
import { Plus, Trash2, Save, ShoppingBag, AlertTriangle } from "lucide-react";

/* ----------------------------- helpers -------------------------------- */

const isSelect = (a) => a.type === "select" || a.type === "multi_select";

const DynamicField = ({ attr, value, onChange, disabled }) => {
  const label = (
    <label className="block text-xs uppercase tracking-widest mb-1"
      style={{ color: attr.is_required ? "var(--pl-accent)" : "var(--pl-fg-muted)" }}>
      {attr.name}{attr.unit ? ` (${attr.unit})` : ""}
      {attr.is_required ? " *" : ""}
      {attr.scope === "subcategory" ? (
        <span className="ml-1 text-[10px] px-1 rounded" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
          override
        </span>
      ) : null}
    </label>
  );
  const testId = `shop-attr-${attr.key}`;
  if (isSelect(attr)) {
    return (
      <div>
        {label}
        <select className="pl-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
                disabled={disabled} data-testid={testId}>
          <option value="">— select —</option>
          {(attr.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
  const inputType = attr.type === "integer" || attr.type === "decimal" ? "number" : "text";
  return (
    <div>
      {label}
      <input type={inputType} className="pl-input" value={value ?? ""}
             onChange={(e) => onChange(e.target.value)}
             disabled={disabled} data-testid={testId} />
    </div>
  );
};

/* ----------------------------- component ------------------------------ */

export const PortalShop = () => {
  const { supplier } = useOutletContext() || {};
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasShop = supplier?.modules?.includes("SHOP");

  const refresh = async () => {
    if (!hasShop) return;
    try {
      const { data } = await portalApi.get("/shop/portal/catalogue");
      setItems(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
  };

  useEffect(() => { refresh(); }, [hasShop]);

  const loadDetail = async (id) => {
    setLoading(true);
    try {
      const { data } = await portalApi.get(`/shop/portal/products/${id}`);
      setDetail(data);
      setSelectedId(id);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  const startNew = () => {
    setSelectedId(null);
    setDetail({
      _draft: true, title: "", category_id: "", subcategory_id: null,
      description: "", images: [], attributes: {}, variants: [],
      attribute_schema: [], status: "draft",
    });
  };

  if (!hasShop) {
    return (
      <div className="pl-card p-6 flex items-start gap-4" data-testid="portal-shop-gated"
           style={{ background: "rgba(249,115,22,.10)", border: "1px solid rgba(249,115,22,.4)" }}>
        <AlertTriangle size={20} style={{ color: "#F97316" }} />
        <div>
          <div className="font-semibold" style={{ color: "#F97316" }}>SHOP module not enabled</div>
          <div className="text-sm mt-1" style={{ color: "var(--pl-fg-muted)" }}>
            Your account currently lists modules: <strong>{(supplier?.modules || []).join(", ") || "(none)"}</strong>.
            Contact Super Admin to activate SHOP for fashion, electronics and home goods listings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-shop">
      <div className="flex items-center gap-3 flex-wrap">
        <ShoppingBag size={22} style={{ color: "var(--pl-accent)" }} />
        <h1 className="pl-h1 !text-2xl" style={{ color: "var(--pl-fg)" }}>SHOPbakēd — my products</h1>
        <button onClick={startNew} className="pl-btn pl-btn-primary ml-auto" data-testid="portal-shop-new">
          <Plus size={14} /> New product
        </button>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "280px 1fr" }}>
        {/* Left pane — product list */}
        <aside className="pl-card p-3" data-testid="portal-shop-list">
          {items.length === 0 && (
            <div className="text-xs p-4" style={{ color: "var(--pl-fg-subtle)" }}>
              No SHOP products yet.
            </div>
          )}
          {items.map((p) => (
            <button key={p.id} onClick={() => loadDetail(p.id)}
              data-testid={`portal-shop-item-${p.id}`}
              className="w-full text-left px-3 py-2 rounded-md text-sm mb-1"
              style={{
                background: selectedId === p.id ? "var(--pl-accent-soft)" : "transparent",
                color: selectedId === p.id ? "var(--pl-accent)" : "var(--pl-fg)",
              }}>
              <div className="font-medium truncate">{p.title}</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--pl-fg-muted)" }}>
                {p.status}
              </div>
            </button>
          ))}
        </aside>

        {/* Right pane — form */}
        <section>
          {loading && <div className="pl-card p-6 text-sm" style={{ color: "var(--pl-fg-muted)" }}>Loading…</div>}
          {!loading && !detail && (
            <div className="pl-card p-6 text-sm" style={{ color: "var(--pl-fg-muted)" }}>
              Select a product on the left or click "New product".
            </div>
          )}
          {!loading && detail && (
            <ProductForm
              key={detail.id || "new"}
              detail={detail}
              setDetail={setDetail}
              onSaved={async (created) => {
                await refresh();
                if (created?.id) loadDetail(created.id);
              }}
              saving={saving}
              setSaving={setSaving}
              supplier={supplier}
            />
          )}
        </section>
      </div>
    </div>
  );
};

/* ----------------------------- product form --------------------------- */

const ProductForm = ({ detail, setDetail, onSaved, saving, setSaving, supplier }) => {
  const [tree, setTree] = useState([]);
  const [schema, setSchema] = useState(detail.attribute_schema || []);
  const isNew = detail._draft === true;

  useEffect(() => {
    portalApi.get(`/shop/catalogue?country=${supplier?.country || "CI"}`)
      .then(({ data }) => setTree(data || []))
      .catch(() => setTree([]));
  }, [supplier]);

  // Whenever category / subcategory changes, refetch resolved schema.
  useEffect(() => {
    if (!detail.category_id) { setSchema([]); return; }
    const url = `/shop/categories/${detail.category_id}/attributes` +
                (detail.subcategory_id ? `?subcategory_id=${detail.subcategory_id}` : "");
    portalApi.get(url).then(({ data }) => setSchema(data.attributes || []))
      .catch(() => setSchema([]));
  }, [detail.category_id, detail.subcategory_id]);

  const currentCat = useMemo(
    () => tree.find((c) => c.id === detail.category_id) || null, [tree, detail.category_id],
  );

  const set = (field, value) => setDetail({ ...detail, [field]: value });
  const setAttr = (key, value) =>
    setDetail({ ...detail, attributes: { ...(detail.attributes || {}), [key]: value } });

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const payload = {
          title: detail.title, category_id: detail.category_id,
          subcategory_id: detail.subcategory_id || null,
          description: detail.description, images: detail.images,
          attributes: detail.attributes,
        };
        const { data } = await portalApi.post("/shop/portal/products", payload);
        toast.success("Product created — pending admin review");
        onSaved(data);
      } else {
        const payload = {
          title: detail.title, subcategory_id: detail.subcategory_id || null,
          description: detail.description, images: detail.images,
          attributes: detail.attributes,
        };
        await portalApi.patch(`/shop/portal/products/${detail.id}`, payload);
        toast.success("Product updated");
        onSaved({ id: detail.id });
      }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="pl-card p-6 space-y-6" data-testid="portal-shop-form">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="pl-label">Title *</label>
          <input className="pl-input" value={detail.title || ""}
                 onChange={(e) => set("title", e.target.value)}
                 data-testid="portal-shop-title" />
        </div>
        <div>
          <label className="pl-label">Status</label>
          <input className="pl-input" value={detail.status || "draft"} disabled
                 data-testid="portal-shop-status" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="pl-label">Category *</label>
          <select className="pl-input" value={detail.category_id || ""}
                  disabled={!isNew}
                  onChange={(e) => setDetail({ ...detail, category_id: e.target.value, subcategory_id: null })}
                  data-testid="portal-shop-category">
            <option value="">— select category —</option>
            {tree.map((c) => (<option key={c.id} value={c.id}>{c.name_fr} / {c.name_en}</option>))}
          </select>
        </div>
        <div>
          <label className="pl-label">Subcategory</label>
          <select className="pl-input" value={detail.subcategory_id || ""}
                  onChange={(e) => set("subcategory_id", e.target.value || null)}
                  data-testid="portal-shop-subcategory">
            <option value="">— none —</option>
            {(currentCat?.subcategories || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name_fr} / {s.name_en}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="pl-label">Description</label>
        <textarea className="pl-input" rows={3} value={detail.description || ""}
                  onChange={(e) => set("description", e.target.value)}
                  data-testid="portal-shop-description" />
      </div>

      {schema.length > 0 && (
        <div>
          <div className="pl-eyebrow mb-3">Attributes (auto-rendered)</div>
          <div className="grid gap-4 md:grid-cols-3" data-testid="portal-shop-attrs">
            {schema.map((a) => (
              <DynamicField key={a.key} attr={a}
                            value={(detail.attributes || {})[a.key]}
                            onChange={(v) => setAttr(a.key, v)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !detail.title || !detail.category_id}
                className="pl-btn pl-btn-primary"
                data-testid="portal-shop-save">
          <Save size={14} /> {saving ? "Saving…" : (isNew ? "Create" : "Save")}
        </button>
      </div>

      {!isNew && (
        <VariantEditor product={detail} schema={schema} onChange={onSaved} />
      )}
    </div>
  );
};

/* ----------------------------- variant grid --------------------------- */

const VariantEditor = ({ product, schema, onChange }) => {
  const [rows, setRows] = useState(product.variants || []);
  const [draft, setDraft] = useState({
    sku: "", price: 0, stock_qty: 0, condition: "new", attributes: {},
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRows(product.variants || []); }, [product.variants]);

  const add = async () => {
    setBusy(true);
    try {
      const { data } = await portalApi.post(
        `/shop/portal/products/${product.id}/variants`, draft,
      );
      toast.success(`Variant ${data.sku} added`);
      setRows([...rows, data]);
      setDraft({ sku: "", price: 0, stock_qty: 0, condition: "new", attributes: {} });
      onChange({ id: product.id });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const remove = async (vid) => {
    if (!window.confirm("Delete this variant?")) return;
    setBusy(true);
    try {
      await portalApi.delete(`/shop/portal/products/${product.id}/variants/${vid}`);
      setRows(rows.filter((v) => v.id !== vid));
      toast.success("Variant deleted");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const variantAttrs = schema.filter((a) => a.supplier_editable !== false);

  return (
    <div>
      <div className="pl-eyebrow mb-3">Variants</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="portal-shop-variants">
          <thead>
            <tr style={{ color: "var(--pl-fg-muted)", borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left py-2 px-2">SKU</th>
              <th className="text-left py-2 px-2">Price</th>
              <th className="text-left py-2 px-2">Stock</th>
              {variantAttrs.map((a) => (
                <th key={a.key} className="text-left py-2 px-2">{a.name}</th>
              ))}
              <th className="text-left py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} data-testid={`portal-shop-variant-${v.id}`}
                  style={{ borderBottom: "1px solid var(--pl-border)" }}>
                <td className="py-2 px-2 font-mono text-xs">{v.sku}</td>
                <td className="py-2 px-2">{v.price} {v.currency}</td>
                <td className="py-2 px-2">{v.stock_qty}</td>
                {variantAttrs.map((a) => (
                  <td key={a.key} className="py-2 px-2 text-xs">
                    {v.attributes?.[a.key] ?? "—"}
                  </td>
                ))}
                <td className="py-2 px-2">
                  <button onClick={() => remove(v.id)} disabled={busy}
                          className="text-xs" style={{ color: "#F97316" }}
                          data-testid={`portal-shop-variant-delete-${v.id}`}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr data-testid="portal-shop-variant-draft"
                style={{ background: "var(--pl-bg-elevated)" }}>
              <td className="py-2 px-2">
                <input className="pl-input" value={draft.sku}
                       onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                       data-testid="portal-shop-variant-sku" placeholder="SKU" />
              </td>
              <td className="py-2 px-2">
                <input className="pl-input" type="number" value={draft.price}
                       onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                       data-testid="portal-shop-variant-price" />
              </td>
              <td className="py-2 px-2">
                <input className="pl-input" type="number" value={draft.stock_qty}
                       onChange={(e) => setDraft({ ...draft, stock_qty: Number(e.target.value) })}
                       data-testid="portal-shop-variant-stock" />
              </td>
              {variantAttrs.map((a) => (
                <td key={a.key} className="py-2 px-2">
                  {isSelect(a) ? (
                    <select className="pl-input" value={draft.attributes[a.key] ?? ""}
                            onChange={(e) => setDraft({
                              ...draft,
                              attributes: { ...draft.attributes, [a.key]: e.target.value },
                            })}
                            data-testid={`portal-shop-variant-attr-${a.key}`}>
                      <option value="">—</option>
                      {(a.options || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="pl-input" value={draft.attributes[a.key] ?? ""}
                           onChange={(e) => setDraft({
                             ...draft,
                             attributes: { ...draft.attributes, [a.key]: e.target.value },
                           })}
                           data-testid={`portal-shop-variant-attr-${a.key}`} />
                  )}
                </td>
              ))}
              <td className="py-2 px-2">
                <button onClick={add} disabled={busy || !draft.sku}
                        className="pl-btn pl-btn-primary text-xs"
                        data-testid="portal-shop-variant-add">
                  <Plus size={12} /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PortalShop;
