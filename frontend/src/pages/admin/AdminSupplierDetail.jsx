/**
 * Admin — Supplier Detail workspace (Fixing_Prompt v5).
 *
 * Route: /admin/modules/mart/suppliers/:supplierId
 *
 * Replaces the old separate approval pages. Every product, image and
 * fulfilment allocation for a supplier is managed from here in a single
 * Overview / Products tabbed workspace. Products can be reviewed
 * individually or in bulk (approve / reject). Product images (all
 * submitted) are surfaced inside the product-review drawer — the old
 * standalone /admin/partner-image-reviews page is removed.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, ArrowLeft, ChevronRight, Package, ShieldCheck, Warehouse as WarehouseIcon,
  Search, X, CheckCircle2, XCircle, Image as ImageIcon, Star,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const STATUS_META = {
  pending:   { label: "Pending",   color: "#FCC44C" },
  approved:  { label: "Approved",  color: "#77BC1F" },
  rejected:  { label: "Rejected",  color: "#FF4C52" },
  withdrawn: { label: "Withdrawn", color: "#8b8b8b" },
};

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminSupplierDetail = () => {
  const { supplierId } = useParams();
  const [tab, setTab] = useState("overview");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/suppliers/${supplierId}`);
      setDetail(data);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, [supplierId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  if (loading && !detail) {
    return <div className="p-8 text-sm text-muted-foreground" data-testid="supplier-detail-loading">Loading supplier…</div>;
  }
  if (!detail) return null;

  const s = detail.supplier;
  const app = detail.application;
  const statusColor = s.status === "approved" ? "#77BC1F"
    : s.status === "suspended" ? "#F97316"
    : s.status === "rejected" ? "#FF4C52" : "#3B82F6";

  return (
    <div className="space-y-6" data-testid="admin-supplier-detail">
      {/* Header */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Link to="/admin/modules/mart/suppliers" className="hover:text-foreground flex items-center gap-1"
                data-testid="supplier-detail-back">
            <ArrowLeft size={12} /> Suppliers
          </Link>
          <ChevronRight size={12} /> <span className="font-medium text-foreground">{s.business_name}</span>
        </div>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
               style={{ background: `${statusColor}22`, color: statusColor }}>
            <Building2 size={26} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="supplier-detail-name">{s.business_name}</h1>
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                    style={{ background: `${statusColor}22`, color: statusColor }}
                    data-testid="supplier-detail-status">
                {s.status}
              </span>
              {s.code && <span className="text-[10px] font-mono text-muted-foreground">{s.code}</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {s.business_email} · {s.country} · {s.business_type}
              {app?.application_code && <> · <span className="font-mono">{app.application_code}</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border" data-testid="supplier-detail-tabs">
        {[
          { code: "overview", label: "Overview", icon: ShieldCheck },
          { code: "products", label: `Products (${
            (detail.product_buckets?.pending || 0) +
            (detail.product_buckets?.approved || 0) +
            (detail.product_buckets?.rejected || 0) +
            (detail.product_buckets?.withdrawn || 0)
          })`, icon: Package },
        ].map(t => {
          const on = tab === t.code;
          const Icon = t.icon;
          return (
            <button key={t.code} onClick={() => setTab(t.code)}
              data-testid={`supplier-detail-tab-${t.code}`}
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

      {tab === "overview" && <OverviewTab detail={detail} />}
      {tab === "products" && <ProductsTab supplierId={supplierId} detail={detail} onProductChange={loadDetail} />}
    </div>
  );
};

// ==========================================================================
// Overview tab
// ==========================================================================

const OverviewTab = ({ detail }) => {
  const s = detail.supplier;
  const contacts = detail.contacts || [];
  const wh = detail.warehouse_assignments || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="supplier-overview">
      <Card title="Business">
        <Row label="Legal name" value={s.business_name} />
        <Row label="Trading name" value={s.trading_name || "—"} />
        <Row label="Business type" value={s.business_type} />
        <Row label="Tax ID" value={s.tax_id || "—"} />
        <Row label="Currency" value={s.default_currency} />
        <Row label="Approved" value={s.approved_at ? new Date(s.approved_at).toLocaleDateString() : "—"} />
      </Card>
      <Card title="Owner">
        {contacts.length === 0 ? <div className="text-xs text-muted-foreground">No contact on file</div>
          : contacts.slice(0, 2).map(c => (
            <div key={c.id} className="pb-3 mb-3 border-b border-border last:border-none last:mb-0">
              <div className="text-sm font-medium">{c.full_name}</div>
              <div className="text-xs text-muted-foreground">{c.position || "—"}</div>
              <div className="text-xs">{c.email || "—"} · {c.phone || "—"}</div>
            </div>
          ))}
      </Card>
      <Card title="Warehouse allocation">
        <p className="text-[11px] text-muted-foreground mb-3">
          Every product this supplier ships inherits this fulfilment allocation.
          Manage it from the Suppliers → Applications drawer.
        </p>
        {wh.length === 0 ? (
          <div className="text-xs text-muted-foreground italic" data-testid="supplier-overview-warehouses-empty">
            No warehouses assigned.
          </div>
        ) : (
          <div className="space-y-2" data-testid="supplier-overview-warehouses">
            {wh.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs"
                   data-testid={`supplier-overview-warehouse-${a.warehouse_id}`}>
                <WarehouseIcon size={12} style={{ color: a.is_primary ? "#77BC1F" : "var(--muted-foreground)" }} />
                <span className="font-mono">{a.warehouse?.code}</span>
                <span className="text-muted-foreground">{a.warehouse?.name}</span>
                {a.is_primary && (
                  <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1 ml-auto"
                        style={{ background: "rgba(119,188,31,.15)", color: "#77BC1F" }}>
                    <Star size={10} /> Primary
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="lg:col-span-3">
        <Card title="Audit trail">
          {(detail.audit_trail || []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No actions yet.</div>
          ) : (
            <div className="space-y-2">
              {detail.audit_trail.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-muted-foreground min-w-[130px]">{new Date(a.created_at).toLocaleString()}</span>
                  <span className="font-semibold uppercase" style={{ color: "#77BC1F" }}>{a.action}</span>
                  {a.from_status && <span className="text-muted-foreground">{a.from_status} → {a.to_status}</span>}
                  {a.notes && <span className="text-muted-foreground italic truncate">— {a.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

// ==========================================================================
// Products tab
// ==========================================================================

const ProductsTab = ({ supplierId, detail, onProductChange }) => {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [reviewProduct, setReviewProduct] = useState(null);
  const [bulkAction, setBulkAction] = useState(null); // "approve" | "reject"
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (category) params.set("category", category);
      if (subcategory) params.set("subcategory", subcategory);
      if (q.trim()) params.set("q", q.trim());
      const { data } = await adminApi.get(
        `/admin/modules/mart/suppliers/${supplierId}/products?${params.toString()}`
      );
      setItems(data.items || []);
      setSelected(new Set());
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [supplierId, status, category, subcategory, q]);

  useEffect(() => { load(); }, [load]);

  // Categories for filter + bulk-approve
  const country = detail?.supplier?.country || "CI";
  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get(`/mart/categories?country=${country}`);
        setCategories(Array.isArray(data) ? data : (data.items || []));
      } catch { /* ignore */ }
    })();
  }, [country]);
  useEffect(() => {
    if (!category) { setSubcategories([]); return; }
    (async () => {
      try {
        const { data } = await adminApi.get(`/mart/subcategories?country=${country}&category=${category}`);
        setSubcategories(Array.isArray(data) ? data : (data.items || []));
      } catch { setSubcategories([]); }
    })();
  }, [category, country]);

  const buckets = detail.product_buckets || {};
  const pendingSelectedCount = useMemo(
    () => items.filter(i => selected.has(i.id) && i.status === "pending").length,
    [items, selected]
  );

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.filter(i => i.status === "pending").map(i => i.id)));
  };
  const toggleOne = (id) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  const runBulk = async () => {
    if (bulkAction === "reject" && bulkNotes.trim().length < 3) {
      return toast.error("Rejection notes are required (≥3 chars).");
    }
    try {
      const request_ids = Array.from(selected);
      const url = `/admin/modules/mart/suppliers/product-requests/bulk-${bulkAction}`;
      const body = bulkAction === "approve"
        ? { request_ids, category_id: bulkCategoryId || null, notes: bulkNotes || null, link_at_supplier_cost: true }
        : { request_ids, notes: bulkNotes.trim() };
      const { data } = await adminApi.post(url, body);
      const done = (data[bulkAction === "approve" ? "approved" : "rejected"] || []).length;
      const skipped = (data.skipped || []).length;
      toast.success(`${done} ${bulkAction}d${skipped ? ` · ${skipped} skipped` : ""}`);
      setBulkAction(null); setBulkNotes(""); setBulkCategoryId("");
      await load();
      onProductChange?.();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4" data-testid="supplier-products-tab">
      {/* Status buckets */}
      <div className="flex flex-wrap gap-2 items-center">
        {["all", "pending", "approved", "rejected", "withdrawn"].map(code => {
          const meta = STATUS_META[code] || { label: "All", color: "#9993" };
          const on = status === code;
          const count = code === "all"
            ? (buckets.pending || 0) + (buckets.approved || 0) + (buckets.rejected || 0) + (buckets.withdrawn || 0)
            : buckets[code] || 0;
          return (
            <button key={code} onClick={() => setStatus(code)}
              data-testid={`supplier-products-bucket-${code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium"
              style={{
                background: on ? `${meta.color}22` : "transparent",
                color: on ? (meta.color === "#9993" ? "var(--foreground)" : meta.color) : "var(--muted-foreground)",
                border: `1px solid ${on ? (meta.color === "#9993" ? "var(--foreground)" : meta.color) : "var(--border)"}`,
              }}>
              {code === "all" ? "All" : meta.label} <span className="opacity-75">({count})</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="flex gap-2 items-center">
          <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}
            data-testid="supplier-products-category-filter"
            className="h-9 px-2 text-xs rounded-lg bg-secondary border border-border">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!category}
            data-testid="supplier-products-subcategory-filter"
            className="h-9 px-2 text-xs rounded-lg bg-secondary border border-border disabled:opacity-50">
            <option value="">All subcategories</option>
            {subcategories.map(sc => <option key={sc.id} value={sc.slug}>{sc.name}</option>)}
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / SKU / EAN"
              data-testid="supplier-products-search"
              className="h-9 pl-7 pr-3 text-xs w-52 rounded-lg bg-secondary border border-border" />
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {pendingSelectedCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(29,155,240,.08)", border: "1px solid rgba(29,155,240,.3)" }}
             data-testid="supplier-products-bulk-bar">
          <span className="text-xs font-medium">{pendingSelectedCount} pending product{pendingSelectedCount === 1 ? "" : "s"} selected</span>
          <button onClick={() => { setBulkAction("approve"); setBulkNotes(""); }}
                  data-testid="supplier-products-bulk-approve-btn"
                  className="text-xs px-3 h-8 rounded-lg font-medium text-white flex items-center gap-1"
                  style={{ background: "#77BC1F" }}>
            <CheckCircle2 size={12} /> Bulk approve
          </button>
          <button onClick={() => { setBulkAction("reject"); setBulkNotes(""); }}
                  data-testid="supplier-products-bulk-reject-btn"
                  className="text-xs px-3 h-8 rounded-lg font-medium text-white flex items-center gap-1"
                  style={{ background: "#FF4C52" }}>
            <XCircle size={12} /> Bulk reject
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  data-testid="supplier-products-bulk-clear">Clear</button>
        </div>
      )}

      {/* Products table */}
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox"
                  checked={items.length > 0 && items.every(i => selected.has(i.id) || i.status !== "pending")}
                  onChange={toggleAll}
                  data-testid="supplier-products-select-all" />
              </th>
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Price</th>
              <th className="text-left p-3">Submitted</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="supplier-products-table-body">
            {busy && items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground" data-testid="supplier-products-empty">
                No products match this filter.
              </td></tr>
            )}
            {items.map(p => {
              const meta = STATUS_META[p.status] || STATUS_META.pending;
              const canSelect = p.status === "pending";
              const primaryImg = p.master_product?.images?.[0] || p.master_product?.image || p.image_url;
              return (
                <tr key={p.id} className="border-t border-border" data-testid={`supplier-product-row-${p.id}`}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(p.id)} disabled={!canSelect}
                           onChange={() => toggleOne(p.id)}
                           data-testid={`supplier-product-check-${p.id}`} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {primaryImg
                        ? <img src={primaryImg} alt="" className="w-9 h-9 rounded object-cover" />
                        : <div className="w-9 h-9 rounded bg-secondary grid place-items-center"><ImageIcon size={14} className="text-muted-foreground" /></div>}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.proposed_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.proposed_manufacturer || "—"} · {p.proposed_pack_size || "—"}
                          {p.master_product?.sku_code && <> · <span className="font-mono">{p.master_product.sku_code}</span></>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {p.category?.name || p.master_product?.category_slug || "—"}
                    {p.master_product?.subcategory_slug && (
                      <div className="text-[10px] text-muted-foreground">{p.master_product.subcategory_slug}</div>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {p.proposed_cost_price != null ? `${p.proposed_cost_price} ${p.proposed_currency || ""}` : "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                      data-testid={`supplier-product-status-${p.id}`}>{meta.label}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setReviewProduct(p)}
                            data-testid={`supplier-product-review-${p.id}`}
                            className="text-xs px-3 h-8 rounded-lg border border-border hover:bg-secondary">
                      Review
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action modal */}
      {bulkAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setBulkAction(null)}
             data-testid={`supplier-products-bulk-modal-${bulkAction}`}>
          <div className="w-full max-w-lg baked-card bg-card border border-border p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                {bulkAction === "approve" ? "Bulk approve" : "Bulk reject"} · {pendingSelectedCount} product{pendingSelectedCount === 1 ? "" : "s"}
              </h3>
              <button onClick={() => setBulkAction(null)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            {bulkAction === "approve" && (
              <div className="space-y-3 mb-4">
                <label className="text-xs text-muted-foreground">Fallback category (used only for requests that don't have one)</label>
                <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}
                        data-testid="supplier-products-bulk-category"
                        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                  <option value="">— use each request's own category —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <label className="text-xs text-muted-foreground">
              {bulkAction === "reject" ? "Rejection notes (required, sent to supplier)" : "Notes (optional, appended to audit)"}
            </label>
            <textarea rows={3} value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                      placeholder={bulkAction === "reject" ? "Explain what needs to change…" : "Optional audit note…"}
                      data-testid="supplier-products-bulk-notes" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBulkAction(null)} className="text-xs px-4 h-9 rounded-lg border border-border"
                      data-testid="supplier-products-bulk-cancel">Cancel</button>
              <button onClick={runBulk} className="text-xs px-4 h-9 rounded-lg font-medium text-white"
                      data-testid="supplier-products-bulk-confirm"
                      style={{ background: bulkAction === "approve" ? "#77BC1F" : "#FF4C52" }}>
                Confirm {bulkAction}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single product review drawer */}
      {reviewProduct && (
        <ProductReviewDrawer product={reviewProduct}
                             categories={categories}
                             onClose={() => setReviewProduct(null)}
                             onDone={() => { setReviewProduct(null); load(); onProductChange?.(); }} />
      )}
    </div>
  );
};

// ==========================================================================
// Single product review drawer
// ==========================================================================

const ProductReviewDrawer = ({ product, categories, onClose, onDone }) => {
  const [action, setAction] = useState(null); // "approve" | "reject"
  const [rejectNotes, setRejectNotes] = useState("");
  const [approveForm, setApproveForm] = useState({
    name: product.proposed_name || "",
    sku: "",
    category_id: product.category?.id || "",
    manufacturer: product.proposed_manufacturer || "",
    ean_upc: product.proposed_ean_upc || "",
    pack_size: product.proposed_pack_size || "",
    short_description: product.proposed_short_description || "",
    mrp: product.proposed_cost_price ? Number(product.proposed_cost_price) * 1.6 : "",
    tax_pct: 18,
    image_url: product.image_url || "",
    notes: "",
    link_at_supplier_cost: true,
  });
  const [busy, setBusy] = useState(false);

  const images = product.master_product?.images?.length
    ? product.master_product.images
    : (product.image_url ? [product.image_url] : []);
  const [activeImg, setActiveImg] = useState(images[0] || null);

  const act = async () => {
    if (action === "approve") {
      if (!approveForm.category_id) return toast.error("Category is required.");
      setBusy(true);
      try {
        await adminApi.post(`/admin/modules/mart/suppliers/product-requests/${product.id}/approve`, {
          name: approveForm.name, sku: approveForm.sku || null,
          category_id: approveForm.category_id,
          manufacturer: approveForm.manufacturer || null,
          ean_upc: approveForm.ean_upc || null,
          pack_size: approveForm.pack_size || null,
          short_description: approveForm.short_description || null,
          mrp: approveForm.mrp ? Number(approveForm.mrp) : null,
          tax_pct: approveForm.tax_pct ? Number(approveForm.tax_pct) : null,
          image_url: approveForm.image_url || null,
          notes: approveForm.notes || null,
          link_at_supplier_cost: !!approveForm.link_at_supplier_cost,
        });
        toast.success("Approved — master product created");
        onDone();
      } catch (e) { toast.error(errMsg(e)); }
      finally { setBusy(false); }
    } else if (action === "reject") {
      if (rejectNotes.trim().length < 3) return toast.error("Rejection notes required (≥3 chars).");
      setBusy(true);
      try {
        await adminApi.post(`/admin/modules/mart/suppliers/product-requests/${product.id}/reject`, {
          notes: rejectNotes.trim(),
        });
        toast.success("Rejected");
        onDone();
      } catch (e) { toast.error(errMsg(e)); }
      finally { setBusy(false); }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70"
         onClick={(e) => e.target === e.currentTarget && onClose()}
         data-testid="product-review-drawer">
      <div className="w-full max-w-3xl bg-card border-l border-border h-full overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Product review</div>
            <div className="text-lg font-bold" data-testid="product-review-name">{product.proposed_name}</div>
            <div className="text-xs text-muted-foreground">
              {product.proposed_manufacturer || "—"} · {product.proposed_pack_size || "—"}
              {product.master_product?.sku_code && <> · <span className="font-mono">{product.master_product.sku_code}</span></>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary grid place-items-center"
                  data-testid="product-review-close"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Image gallery — ALL submitted images */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              All submitted images ({images.length})
            </div>
            {images.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground"
                   data-testid="product-review-images-empty">
                No images submitted.
              </div>
            ) : (
              <div className="space-y-3" data-testid="product-review-gallery">
                <div className="aspect-video rounded-xl overflow-hidden bg-secondary/50 grid place-items-center">
                  {activeImg && (
                    <img src={activeImg} alt="" className="w-full h-full object-contain"
                         data-testid="product-review-image-main" />
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((src, i) => (
                    <button key={src + i} onClick={() => setActiveImg(src)}
                            data-testid={`product-review-thumb-${i}`}
                            className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-secondary/50 relative"
                            style={{ border: activeImg === src ? "2px solid #77BC1F" : "1px solid var(--border)" }}>
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] uppercase tracking-widest px-1 py-0.5 rounded"
                              style={{ background: "rgba(0,0,0,.6)", color: "white" }}>1°</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="grid grid-cols-2 gap-3">
            <ReadField label="Category" value={product.category?.name || product.master_product?.category_slug || "—"} />
            <ReadField label="Subcategory" value={product.master_product?.subcategory_slug || "—"} />
            <ReadField label="EAN / UPC" value={product.proposed_ean_upc || "—"} />
            <ReadField label="Manufacturer" value={product.proposed_manufacturer || "—"} />
            <ReadField label="Cost" value={product.proposed_cost_price != null ? `${product.proposed_cost_price} ${product.proposed_currency}` : "—"} />
            <ReadField label="MOQ / Lead time" value={`${product.proposed_moq || "—"} · ${product.proposed_lead_time_days != null ? product.proposed_lead_time_days + "d" : "—"}`} />
            {product.proposed_short_description && (
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Description</div>
                <div className="text-sm">{product.proposed_short_description}</div>
              </div>
            )}
            {product.status !== "pending" && product.review_notes && (
              <div className="col-span-2 p-3 rounded-lg" style={{ background: "rgba(148,163,184,.08)" }}>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Review notes</div>
                <div className="text-sm">{product.review_notes}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          {product.status === "pending" && (
            <div className="pt-4 border-t border-border">
              {!action ? (
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAction("reject")}
                          data-testid="product-review-btn-reject"
                          className="text-xs px-4 h-9 rounded-lg font-medium text-white flex items-center gap-1"
                          style={{ background: "#FF4C52" }}>
                    <XCircle size={12} /> Reject
                  </button>
                  <button onClick={() => setAction("approve")}
                          data-testid="product-review-btn-approve"
                          className="text-xs px-4 h-9 rounded-lg font-medium text-white flex items-center gap-1"
                          style={{ background: "#77BC1F" }}>
                    <CheckCircle2 size={12} /> Approve & create master
                  </button>
                </div>
              ) : action === "approve" ? (
                <div className="space-y-3" data-testid="product-review-approve-form">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Master product overrides
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name *" value={approveForm.name} onChange={(v) => setApproveForm(f => ({ ...f, name: v }))} testid="approve-name" />
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category *</label>
                      <select value={approveForm.category_id} onChange={(e) => setApproveForm(f => ({ ...f, category_id: e.target.value }))}
                              data-testid="approve-category"
                              className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                        <option value="">Select category…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <Field label="SKU (auto if blank)" value={approveForm.sku} onChange={(v) => setApproveForm(f => ({ ...f, sku: v }))} testid="approve-sku" />
                    <Field label="Manufacturer" value={approveForm.manufacturer} onChange={(v) => setApproveForm(f => ({ ...f, manufacturer: v }))} testid="approve-mfr" />
                    <Field label="MRP" value={approveForm.mrp} onChange={(v) => setApproveForm(f => ({ ...f, mrp: v }))} testid="approve-mrp" />
                    <Field label="Tax %" value={approveForm.tax_pct} onChange={(v) => setApproveForm(f => ({ ...f, tax_pct: v }))} testid="approve-tax" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAction(null)}
                            data-testid="approve-cancel"
                            className="text-xs px-3 h-9 rounded-lg border border-border">Cancel</button>
                    <button onClick={act} disabled={busy}
                            data-testid="approve-confirm"
                            className="text-xs px-4 h-9 rounded-lg font-medium text-white"
                            style={{ background: "#77BC1F" }}>
                      Confirm approve
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3" data-testid="product-review-reject-form">
                  <label className="text-xs text-muted-foreground">Rejection notes (required)</label>
                  <textarea rows={3} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
                            placeholder="Tell the supplier what to fix before resubmitting"
                            data-testid="reject-notes"
                            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAction(null)}
                            data-testid="reject-cancel"
                            className="text-xs px-3 h-9 rounded-lg border border-border">Cancel</button>
                    <button onClick={act} disabled={busy}
                            data-testid="reject-confirm"
                            className="text-xs px-4 h-9 rounded-lg font-medium text-white"
                            style={{ background: "#FF4C52" }}>
                      Confirm reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================================================
// Small helpers
// ==========================================================================

const Card = ({ title, children }) => (
  <div className="rounded-xl border border-border p-4 bg-secondary/20">
    <div className="text-[10px] uppercase tracking-widest font-bold mb-3 text-muted-foreground">{title}</div>
    <div>{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-1 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value ?? "—"}</span>
  </div>
);

const ReadField = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-sm font-medium">{value ?? "—"}</div>
  </div>
);

const Field = ({ label, value, onChange, testid }) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)}
           data-testid={testid}
           className="w-full mt-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
  </div>
);

export default AdminSupplierDetail;
