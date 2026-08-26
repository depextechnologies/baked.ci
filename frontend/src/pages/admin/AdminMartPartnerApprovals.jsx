/**
 * Super Admin — MART Partner (Darkstore) custom-product approvals.
 *
 * Companion to AdminSupplierProductRequests but for Darkstore-authored
 * products (partner_products.source='custom', approval_status='pending').
 * Approving promotes the row into the shared MART master catalog
 * (mart_products) and rewires the partner row to source='master' so it's
 * immediately visible to every Darkstore's /partner/master-catalog search.
 *
 * Mounted at /admin/mart-partner-approvals.
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package, X, CheckCircle2, XCircle, Store, DollarSign, Tags, Search,
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

export const AdminMartPartnerApprovals = () => {
  const [status,  setStatus]  = useState("pending");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);       // selected row for review
  const [action, setAction] = useState(null);        // "approve" | "reject"
  const [approveForm, setApproveForm] = useState({});
  const [rejectNotes, setRejectNotes] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = { status };
      if (country) params.country = country;
      if (q.trim())  params.q = q.trim();
      const { data } = await adminApi.get("/admin/mart-partner/partner-products", { params });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status, country, q]);
  useEffect(() => { load(); }, [load]);

  const openDetail = (r) => {
    setActive(r); setAction(null); setRejectNotes("");
    // Preload approve form with the partner's proposed values. Ops can
    // override name / category / price before promoting to master.
    setApproveForm({
      name: r.name || "",
      brand: r.brand || "",
      category_slug:    r.category_slug || "",
      subcategory_slug: r.subcategory_slug || "",
      master_price: r.partner_price ?? "",
      currency: r.currency || "",
      unit: r.unit || "",
      image: r.image || "",
      description: r.description || "",
    });
  };

  const act = async (verb) => {
    if (verb === "approve") {
      if (!approveForm.name?.trim())     return toast.error("Product name is required.");
      if (!approveForm.currency?.trim()) return toast.error("Currency is required for the master row.");
      try {
        const body = {
          name: approveForm.name.trim(),
          brand: approveForm.brand || null,
          category_slug: approveForm.category_slug || null,
          subcategory_slug: approveForm.subcategory_slug || null,
          master_price: approveForm.master_price !== "" && approveForm.master_price != null
                        ? Number(approveForm.master_price) : null,
          currency: approveForm.currency.trim(),
          unit: approveForm.unit || null,
          image: approveForm.image || null,
          description: approveForm.description || null,
        };
        const { data } = await adminApi.post(
          `/admin/mart-partner/partner-products/${active.id}/approve`, body
        );
        toast.success(`Approved — master product ${(data.master_product_id || "").slice(0, 12)}…`);
        setActive(null); setAction(null); load();
      } catch (e) { toast.error(errMsg(e)); }
      return;
    }
    if (verb === "reject") {
      if (rejectNotes.trim().length < 3) return toast.error("Rejection notes are required (≥3 chars).");
      try {
        await adminApi.post(
          `/admin/mart-partner/partner-products/${active.id}/reject`,
          { notes: rejectNotes.trim() }
        );
        toast.success("Rejected");
        setActive(null); setAction(null); load();
      } catch (e) { toast.error(errMsg(e)); }
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-mart-partner-approvals">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Package size={18} /> Darkstore product approvals
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Custom SKUs authored by Darkstores. Approving promotes the item to the shared MART master catalog.
        </p>
      </div>

      {/* Filter row — buckets + country + search */}
      <div className="flex flex-wrap gap-3 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)}
              data-testid={`mpa-bucket-${b.code}`}
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
        <button onClick={() => setStatus("all")} data-testid="mpa-bucket-all"
          className="px-3 h-9 rounded-lg text-xs font-medium"
          style={{
            background: status === "all" ? "#9993" : "transparent",
            color: status === "all" ? "var(--foreground)" : "var(--muted-foreground)",
            border: `1px solid ${status === "all" ? "var(--foreground)" : "var(--border)"}`,
          }}>
          All
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            data-testid="mpa-country" className="baked-input h-9 text-xs bg-secondary px-2">
            <option value="">All countries</option>
            <option value="CI">Côte d&apos;Ivoire (CI)</option>
            <option value="IN">India (IN)</option>
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / brand"
              data-testid="mpa-search"
              className="baked-input h-9 pl-7 pr-3 text-xs w-56 bg-secondary" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Proposed product</th>
              <th className="text-left p-3">Darkstore</th>
              <th className="text-right p-3">Partner price · Stock</th>
              <th className="text-left p-3">Submitted</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="mpa-table-body">
            {busy && items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!busy && items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground" data-testid="mpa-empty">
                No {status === "all" ? "" : (BUCKETS.find(b => b.code === status)?.label.toLowerCase() + " ")}product requests.
              </td></tr>
            )}
            {items.map((r) => {
              const m = BUCKETS.find((b) => b.code === r.approval_status) || BUCKETS[0];
              return (
                <tr key={r.id} className="border-t border-border" data-testid={`mpa-row-${r.id}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {r.image && <img src={r.image} alt="" className="w-9 h-9 rounded object-cover" />}
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.brand || "—"} · {r.unit || "—"}{r.category_slug ? ` · ${r.category_slug}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium flex items-center gap-1"><Store size={11} /> {r.partner?.business_name}</div>
                    <div className="text-[10px] text-muted-foreground">{r.partner?.country}</div>
                  </td>
                  <td className="p-3 text-right text-xs">
                    {r.partner_price != null ? `${r.partner_price} ${r.currency}` : "—"}
                    <br /><span className="text-muted-foreground">Qty {r.stock_qty ?? 0}</span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${m.color}22`, color: m.color }}
                      data-testid={`mpa-status-${r.id}`}>{m.label}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => openDetail(r)} data-testid={`mpa-review-${r.id}`}
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

      {/* Detail drawer */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => { setActive(null); setAction(null); }}
             data-testid="mpa-detail">
          <div className="w-full max-w-2xl baked-card bg-card border border-border overflow-hidden"
               onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{active.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  From <span className="font-medium">{active.partner?.business_name}</span> · {active.partner?.country}
                </div>
              </div>
              <button onClick={() => { setActive(null); setAction(null); }}
                data-testid="mpa-detail-close"
                className="w-9 h-9 rounded-full bg-secondary grid place-items-center"><X size={14} /></button>
            </div>

            {/* Read-only proposed values */}
            <div className="p-4 grid grid-cols-2 gap-3 text-xs">
              <ReadOnly label="Brand" value={active.brand || "—"} icon={<Tags size={11} />} />
              <ReadOnly label="Unit" value={active.unit || "—"} />
              <ReadOnly label="Category" value={active.category_slug || "—"} />
              <ReadOnly label="Subcategory" value={active.subcategory_slug || "—"} />
              <ReadOnly label="Partner price" value={active.partner_price != null ? `${active.partner_price} ${active.currency}` : "—"} icon={<DollarSign size={11} />} />
              <ReadOnly label="Stock" value={active.stock_qty ?? 0} />
              {active.description && (
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Description</div>
                  <div className="text-xs">{active.description}</div>
                </div>
              )}
            </div>

            {/* Approve form (visible when action='approve') */}
            {action === "approve" && (
              <div className="p-4 border-t border-border" data-testid="mpa-approve-form">
                <div className="text-xs font-semibold mb-3">Master catalog overrides <span className="text-muted-foreground font-normal">(optional — leave to accept the partner&apos;s values)</span></div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Field label="Name *" value={approveForm.name} onChange={(v) => setApproveForm(f => ({...f, name: v}))} testid="mpa-approve-name" />
                  <Field label="Brand"  value={approveForm.brand} onChange={(v) => setApproveForm(f => ({...f, brand: v}))} testid="mpa-approve-brand" />
                  <Field label="Category slug" value={approveForm.category_slug} onChange={(v) => setApproveForm(f => ({...f, category_slug: v}))} testid="mpa-approve-cat" />
                  <Field label="Subcategory slug" value={approveForm.subcategory_slug} onChange={(v) => setApproveForm(f => ({...f, subcategory_slug: v}))} testid="mpa-approve-sub" />
                  <Field label="Master price" value={approveForm.master_price} onChange={(v) => setApproveForm(f => ({...f, master_price: v}))} testid="mpa-approve-price" />
                  <Field label="Currency *" value={approveForm.currency} onChange={(v) => setApproveForm(f => ({...f, currency: v}))} testid="mpa-approve-currency" />
                  <Field label="Unit" value={approveForm.unit} onChange={(v) => setApproveForm(f => ({...f, unit: v}))} testid="mpa-approve-unit" />
                  <Field label="Image URL" value={approveForm.image} onChange={(v) => setApproveForm(f => ({...f, image: v}))} testid="mpa-approve-image" />
                </div>
              </div>
            )}

            {/* Reject form */}
            {action === "reject" && (
              <div className="p-4 border-t border-border" data-testid="mpa-reject-form">
                <div className="text-xs font-semibold mb-2">Rejection notes</div>
                <textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Tell the Darkstore what to fix before resubmitting"
                  rows={3}
                  data-testid="mpa-reject-notes"
                  className="baked-input w-full bg-secondary text-xs" />
              </div>
            )}

            {/* Footer actions */}
            <div className="p-4 border-t border-border flex items-center gap-2 justify-end">
              {active.approval_status === "pending" && !action && (
                <>
                  <button onClick={() => setAction("reject")} data-testid="mpa-reject-btn"
                    className="text-xs px-4 h-9 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10">
                    <XCircle size={12} className="inline mr-1" /> Reject
                  </button>
                  <button onClick={() => setAction("approve")} data-testid="mpa-approve-btn"
                    className="text-xs px-4 h-9 rounded-lg text-white"
                    style={{ background: "#77BC1F" }}>
                    <CheckCircle2 size={12} className="inline mr-1" /> Approve & promote
                  </button>
                </>
              )}
              {action && (
                <>
                  <button onClick={() => setAction(null)}
                    data-testid="mpa-back-btn"
                    className="text-xs px-4 h-9 rounded-lg border border-border">
                    Back
                  </button>
                  <button onClick={() => act(action)}
                    data-testid={`mpa-confirm-${action}`}
                    className="text-xs px-4 h-9 rounded-lg text-white"
                    style={{ background: action === "approve" ? "#77BC1F" : "#FF4C52" }}>
                    Confirm {action}
                  </button>
                </>
              )}
              {active.approval_status !== "pending" && !action && (
                <span className="text-xs text-muted-foreground">Already {active.approval_status}.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReadOnly = ({ label, value, icon }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
      {icon}{label}
    </div>
    <div className="font-medium">{value}</div>
  </div>
);

const Field = ({ label, value, onChange, testid }) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="baked-input w-full bg-secondary text-xs mt-1" />
  </div>
);

export default AdminMartPartnerApprovals;
