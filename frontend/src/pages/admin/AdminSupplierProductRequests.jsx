/**
 * Super Admin — MARTbakēd Supplier Product Requests review.
 *
 * Suppliers propose new master SKUs from their portal. Admins here can either
 * approve (creates a master product in mart_products AND auto-links the supplier
 * at their proposed cost) or reject with notes.
 *
 * Companion tab to AdminSupplierApplications — mounted at
 * /admin/modules/mart/suppliers?tab=product-requests.
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package, X, CheckCircle2, XCircle, Clock, ExternalLink, Search,
  Building2, Tags, DollarSign, Truck, ShieldCheck,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const BUCKETS = [
  { code: "pending",  label: "Pending",  color: "#FCC44C" },
  { code: "approved", label: "Approved", color: "#77BC1F" },
  { code: "rejected", label: "Rejected", color: "#FF4C52" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminSupplierProductRequests = () => {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [action, setAction] = useState(null); // "approve" | "reject"
  const [categories, setCategories] = useState([]);
  const [approveForm, setApproveForm] = useState({});
  const [rejectNotes, setRejectNotes] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get("/admin/modules/mart/suppliers/product-requests", { params: { status } });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  // Load categories once for the approve form dropdown
  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get("/mart/categories?country=CI");
        const cs = Array.isArray(data) ? data : (data.items || []);
        setCategories(cs);
      } catch (e) { /* silent */ }
    })();
  }, []);

  const openDetail = (r) => {
    setActive(r); setAction(null); setRejectNotes("");
    setApproveForm({
      name: r.proposed_name,
      sku: "",
      category_id: r.proposed_category_id || "",
      manufacturer: r.proposed_manufacturer || "",
      ean_upc: r.proposed_ean_upc || "",
      pack_size: r.proposed_pack_size || "",
      short_description: r.proposed_short_description || "",
      mrp: r.proposed_cost_price ? Number(r.proposed_cost_price) * 1.6 : "",
      tax_pct: 18,
      image_url: r.image_url || "",
      notes: "",
      link_at_supplier_cost: true,
    });
  };

  const act = async (verb) => {
    if (verb === "approve") {
      if (!approveForm.category_id) return toast.error("Category is required to create a master product.");
      try {
        const { data } = await adminApi.post(
          `/admin/modules/mart/suppliers/product-requests/${active.id}/approve`,
          {
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
          }
        );
        toast.success(`Approved — master product ${data.master_product_id.slice(0, 12)}… created`);
        setActive(null); setAction(null); load();
      } catch (e) { toast.error(errMsg(e)); }
      return;
    }
    if (verb === "reject") {
      if (!rejectNotes.trim()) return toast.error("Rejection notes are required.");
      try {
        await adminApi.post(`/admin/modules/mart/suppliers/product-requests/${active.id}/reject`, { notes: rejectNotes });
        toast.success("Rejected");
        setActive(null); setAction(null); load();
      } catch (e) { toast.error(errMsg(e)); }
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-supplier-product-requests">
      <div className="flex flex-wrap gap-2 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)} data-testid={`prod-req-bucket-${b.code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--muted-foreground)",
                border: `1px solid ${on ? b.color : "var(--border)"}`,
              }}>
              {b.label} <span className="opacity-75">({buckets[b.code] || 0})</span>
            </button>
          );
        })}
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Proposed product</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-right p-3">Cost / MOQ / Lead</th>
              <th className="text-left p-3">Submitted</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground" data-testid="prod-req-empty">
                No {BUCKETS.find((b) => b.code === status)?.label.toLowerCase()} product requests.
              </td></tr>
            )}
            {items.map((r) => {
              const m = BUCKETS.find((b) => b.code === r.status) || BUCKETS[0];
              return (
                <tr key={r.id} className="border-t border-border" data-testid={`prod-req-row-${r.id}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {r.image_url && <img src={r.image_url} alt="" className="w-9 h-9 rounded object-cover" />}
                      <div>
                        <div className="font-medium">{r.proposed_name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.proposed_manufacturer || "—"} · {r.proposed_pack_size || ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{r.supplier?.business_name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{r.supplier?.code || r.supplier?.id?.slice(0, 12)}</div>
                  </td>
                  <td className="p-3 text-right text-xs">
                    {r.proposed_cost_price ? `${r.proposed_cost_price} ${r.proposed_currency}` : "—"}
                    <br /><span className="text-muted-foreground">MOQ {r.proposed_moq || "—"} · {r.proposed_lead_time_days != null ? `${r.proposed_lead_time_days}d` : "—"}</span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${m.color}22`, color: m.color }}>{m.label}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => openDetail(r)} className="text-xs px-3 h-8 rounded-lg font-medium"
                      style={{ background: "#77BC1F", color: "#0a1200" }}
                      data-testid={`prod-req-review-${r.id}`}>Review</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail / action drawer */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="w-full max-w-3xl bg-card border-l border-border h-full overflow-y-auto" data-testid="prod-req-drawer">
            <div className="flex items-center gap-3 p-6 border-b border-border sticky top-0 bg-card z-10">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#77BC1F22", color: "#77BC1F" }}>
                <Package size={22} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Product proposal from <span className="font-semibold">{active.supplier?.business_name}</span></div>
                <div className="text-lg font-bold">{active.proposed_name}</div>
                <div className="text-xs text-muted-foreground">{active.supplier?.code || "—"} · {active.supplier?.country || "—"}</div>
              </div>
              <button onClick={() => setActive(null)} data-testid="prod-req-drawer-close"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Proposal snapshot */}
              <div className="rounded-xl border border-border p-4 bg-secondary/20">
                <div className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground flex items-center gap-2">
                  <Building2 size={12} /> Proposed details
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Proposed name" value={active.proposed_name} />
                  <Row label="Manufacturer" value={active.proposed_manufacturer || "—"} />
                  <Row label="EAN / UPC" value={active.proposed_ean_upc || "—"} />
                  <Row label="Pack size" value={active.proposed_pack_size || "—"} />
                  <Row label="Net qty" value={active.proposed_net_qty || "—"} />
                  <Row label="Cost" value={active.proposed_cost_price ? `${active.proposed_cost_price} ${active.proposed_currency}` : "—"} />
                  <Row label="MOQ" value={active.proposed_moq || "—"} />
                  <Row label="Lead time" value={active.proposed_lead_time_days != null ? `${active.proposed_lead_time_days} days` : "—"} />
                </div>
                {active.proposed_short_description && (
                  <div className="mt-3 text-xs text-muted-foreground italic">{active.proposed_short_description}</div>
                )}
                {active.image_url && (
                  <div className="mt-3">
                    <a href={active.image_url} target="_blank" rel="noreferrer" className="text-xs underline flex items-center gap-1"><ExternalLink size={12} /> Product photo</a>
                  </div>
                )}
                {active.notes && (
                  <div className="mt-3 text-xs">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-widest">Supplier notes</div>
                    <div>{active.notes}</div>
                  </div>
                )}
              </div>

              {/* Approved outcome banner */}
              {active.status !== "pending" && (
                <div className="p-3 rounded-lg text-sm"
                  style={{
                    background: active.status === "approved" ? "rgba(119,188,31,.10)" : "rgba(255,76,82,.10)",
                    color: active.status === "approved" ? "#77BC1F" : "#FF4C52",
                  }}>
                  <div className="font-semibold uppercase tracking-widest text-xs">{active.status}</div>
                  {active.review_notes && <div className="mt-1">{active.review_notes}</div>}
                  {active.created_master_product_id && (
                    <div className="mt-1 text-xs">Master product: <span className="font-mono">{active.created_master_product_id}</span></div>
                  )}
                </div>
              )}

              {/* Action panel — pending only */}
              {active.status === "pending" && (
                <div className="pt-4 border-t border-border">
                  {!action ? (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setAction("approve")} className="pl-btn pl-btn-primary" data-testid="prod-req-btn-approve"><CheckCircle2 size={14} /> Approve & create master</button>
                      <button onClick={() => setAction("reject")} className="pl-btn pl-btn-ghost" style={{ color: "#FF4C52" }} data-testid="prod-req-btn-reject"><XCircle size={14} /> Reject</button>
                    </div>
                  ) : action === "approve" ? (
                    <div className="space-y-4" data-testid="prod-req-approve-form">
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Create master product</div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <AdminField label="Name *">
                          <AdminInput value={approveForm.name} onChange={(v) => setApproveForm({ ...approveForm, name: v })} testId="approve-name" />
                        </AdminField>
                        <AdminField label="Category *">
                          <select value={approveForm.category_id} onChange={(e) => setApproveForm({ ...approveForm, category_id: e.target.value })}
                            className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="approve-category">
                            <option value="">Select category…</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </AdminField>
                        <AdminField label="Master SKU (auto if blank)">
                          <AdminInput value={approveForm.sku} onChange={(v) => setApproveForm({ ...approveForm, sku: v })} testId="approve-sku" />
                        </AdminField>
                        <AdminField label="Manufacturer">
                          <AdminInput value={approveForm.manufacturer} onChange={(v) => setApproveForm({ ...approveForm, manufacturer: v })} testId="approve-mfr" />
                        </AdminField>
                        <AdminField label="EAN / UPC">
                          <AdminInput value={approveForm.ean_upc} onChange={(v) => setApproveForm({ ...approveForm, ean_upc: v })} testId="approve-ean" />
                        </AdminField>
                        <AdminField label="Pack size">
                          <AdminInput value={approveForm.pack_size} onChange={(v) => setApproveForm({ ...approveForm, pack_size: v })} testId="approve-pack" />
                        </AdminField>
                        <AdminField label="MRP">
                          <AdminInput type="number" min={0} step="0.01" value={approveForm.mrp} onChange={(v) => setApproveForm({ ...approveForm, mrp: v })} testId="approve-mrp" />
                        </AdminField>
                        <AdminField label="Tax %">
                          <AdminInput type="number" min={0} max={99} step="0.01" value={approveForm.tax_pct} onChange={(v) => setApproveForm({ ...approveForm, tax_pct: v })} testId="approve-tax" />
                        </AdminField>
                      </div>
                      <AdminField label="Short description">
                        <textarea rows={2} value={approveForm.short_description}
                          onChange={(e) => setApproveForm({ ...approveForm, short_description: e.target.value })}
                          className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="approve-desc" />
                      </AdminField>
                      <AdminField label="Approval notes (audit)">
                        <textarea rows={2} value={approveForm.notes}
                          onChange={(e) => setApproveForm({ ...approveForm, notes: e.target.value })}
                          className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="approve-notes" />
                      </AdminField>
                      <label className="flex items-center gap-3 text-xs cursor-pointer" data-testid="approve-link-label">
                        <input type="checkbox" checked={approveForm.link_at_supplier_cost}
                          onChange={(e) => setApproveForm({ ...approveForm, link_at_supplier_cost: e.target.checked })}
                          data-testid="approve-link-checkbox" />
                        <span>Auto-link this supplier to the new master product at their proposed cost
                          ({active.proposed_cost_price ? `${active.proposed_cost_price} ${active.proposed_currency}` : "no cost set"})</span>
                      </label>
                      <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setAction(null)} className="pl-btn pl-btn-ghost" data-testid="approve-cancel">Cancel</button>
                        <button onClick={() => act("approve")} className="pl-btn pl-btn-primary" data-testid="approve-confirm">
                          <CheckCircle2 size={14} /> Approve & create
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="prod-req-reject-form">
                      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Rejection notes (required)</div>
                      <textarea rows={4} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
                        placeholder="Tell the supplier why this can't be added (e.g. duplicate of existing SKU, restricted category, insufficient info)…"
                        className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="reject-notes" />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setAction(null)} className="pl-btn pl-btn-ghost" data-testid="reject-cancel">Cancel</button>
                        <button onClick={() => act("reject")} className="pl-btn pl-btn-primary" style={{ background: "#FF4C52", color: "#fff" }} data-testid="reject-confirm">
                          <XCircle size={14} /> Confirm rejection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-sm">{value || "—"}</div>
  </div>
);

const AdminField = ({ label, children }) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
    <div className="mt-1">{children}</div>
  </div>
);

const AdminInput = ({ value, onChange, testId, ...rest }) => (
  <input {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
    className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid={testId} />
);

export default AdminSupplierProductRequests;
