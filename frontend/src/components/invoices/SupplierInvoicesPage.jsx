/**
 * SupplierInvoicesPage — three roles' invoice UI (Phase 5).
 *
 * Renders the bucket list, detail drawer, 3-way match line breakdown, and
 * role-appropriate actions. Consumers pass the axios client + a `role` prop
 * so we can reuse this file across the Partner Portal, Supplier Portal, and
 * Super Admin dashboard without three parallel implementations.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Receipt, ChevronLeft, Check, X, AlertTriangle, Upload, Send, Ban,
  FileText, Clock, Building2, Store, ShieldCheck, Loader2, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return e?.message || "Error";
};

const BUCKETS = [
  { code: "",          label: "All",       color: "#94A3B8" },
  { code: "draft",     label: "Draft",     color: "#94A3B8" },
  { code: "submitted", label: "Submitted", color: "#3B82F6" },
  { code: "matched",   label: "Matched",   color: "#77BC1F" },
  { code: "variance",  label: "Variance",  color: "#F97316" },
  { code: "approved",  label: "Approved",  color: "#22C55E" },
  { code: "disputed",  label: "Disputed",  color: "#FF4C52" },
];

const LINE_MATCH_COLOR = {
  matched: "#22C55E", qty_variance: "#F97316",
  cost_variance: "#F97316", both_variance: "#FF4C52",
};

export const SupplierInvoicesPage = ({ apiClient, role, basePath }) => {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get(basePath, { params: { status: status || undefined } });
      setRows(data.items || []); setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [apiClient, basePath, status]);
  useEffect(() => { load(); }, [load]);

  if (openId) return <InvoiceDetail apiClient={apiClient} basePath={basePath} role={role}
                                    id={openId} onBack={() => { setOpenId(null); load(); }} />;

  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-5" data-testid={`${role}-invoices-page`}>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MARTbaked · Billing</div>
        <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
          <Receipt size={18} className="text-primary" /> Supplier Invoices
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
          {role === "supplier" && "Every received PO auto-creates a draft invoice. Enter your invoice number and date, upload your PDF, and submit — the system runs a 3-way match against the PO and GRN in seconds."}
          {role === "partner" && "Every received PO auto-creates a draft supplier invoice. Once the supplier submits, review the 3-way match breakdown and approve or dispute — with a reason required on both variance and dispute paths."}
          {role === "admin" && "Cross-network visibility of every supplier invoice. Approve, dispute, or reset-to-draft with an audit-logged override reason."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          const count = b.code ? (buckets[b.code] || 0) : total;
          return (
            <button key={b.code || "all"} onClick={() => setStatus(b.code)}
              data-testid={`${role}-inv-bucket-${b.code || "all"}`}
              className="px-3 h-9 rounded-lg text-xs font-medium"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--muted-foreground)",
                border: `1px solid ${on ? b.color : "var(--border)"}`,
              }}>
              {b.label} <span className="opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">PO</th>
              {role !== "supplier" && <th className="text-left p-3">Supplier</th>}
              {role !== "partner" && <th className="text-left p-3">Buyer</th>}
              <th className="text-right p-3">Amount</th>
              <th className="text-center p-3">Match</th>
              <th className="text-center p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && rows.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground" data-testid={`${role}-inv-empty`}>
                No invoices in this bucket yet.
              </td></tr>
            )}
            {rows.map((r) => {
              const m = BUCKETS.find((b) => b.code === r.status) || BUCKETS[0];
              return (
                <tr key={r.id} className="border-t border-border" data-testid={`${role}-inv-row-${r.code}`}>
                  <td className="p-3">
                    <div className="font-mono text-xs font-semibold text-foreground">{r.code}</div>
                    {r.supplier_invoice_number && <div className="text-[10px] text-muted-foreground">Supplier #{r.supplier_invoice_number}</div>}
                  </td>
                  <td className="p-3 font-mono text-xs text-foreground">{r.po_code || "—"}</td>
                  {role !== "supplier" && (
                    <td className="p-3 text-xs text-foreground">
                      <div className="flex items-center gap-1"><Building2 size={11} className="text-muted-foreground" />{r.supplier?.business_name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{r.supplier?.code}</div>
                    </td>
                  )}
                  {role !== "partner" && (
                    <td className="p-3 text-xs text-foreground">
                      <div className="flex items-center gap-1"><Store size={11} className="text-muted-foreground" />{r.partner?.business_name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{r.warehouse?.code}</div>
                    </td>
                  )}
                  <td className="p-3 text-right font-mono text-foreground">{Number(r.grand_total).toFixed(2)} <span className="text-xs text-muted-foreground">{r.currency}</span></td>
                  <td className="p-3 text-center">
                    {r.match_status && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: `${r.match_status === "matched" ? "#22C55E" : "#F97316"}22`, color: r.match_status === "matched" ? "#22C55E" : "#F97316" }}>
                        {r.match_status}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${m.color}22`, color: m.color }}>{m.label}</span>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setOpenId(r.id)}
                      className="text-xs px-3 h-8 rounded-lg font-medium bg-primary text-primary-foreground"
                      data-testid={`${role}-inv-open-${r.code}`}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              InvoiceDetail                                 */
/* -------------------------------------------------------------------------- */

const InvoiceDetail = ({ apiClient, basePath, role, id, onBack }) => {
  const [inv, setInv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null); // "submit" | "approve" | "dispute" | "override"
  const [notes, setNotes] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState("");
  const [overrideAction, setOverrideAction] = useState("approve");

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`${basePath}/${id}`);
      setInv(data);
      setInvNumber(data.supplier_invoice_number || "");
      setInvDate(data.invoice_date || "");
    } catch (e) { toast.error(errMsg(e)); }
  }, [apiClient, basePath, id]);
  useEffect(() => { load(); }, [load]);

  const updateLine = async (lineId, patch) => {
    try {
      const { data } = await apiClient.patch(`${basePath}/${id}`, {
        lines: [{ line_id: lineId, ...patch }],
      });
      setInv(data);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const uploadPdf = async (file) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiClient.post(`${basePath}/${id}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Invoice document uploaded");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const doAction = async () => {
    setBusy(true);
    try {
      if (action === "submit") {
        await apiClient.post(`${basePath}/${id}/submit`, {
          supplier_invoice_number: invNumber || undefined,
          invoice_date: invDate || undefined,
        });
        toast.success("Invoice submitted");
      } else if (action === "approve") {
        await apiClient.post(`${basePath}/${id}/approve`, { notes: notes || undefined });
        toast.success("Invoice approved");
      } else if (action === "dispute") {
        await apiClient.post(`${basePath}/${id}/dispute`, { reason: notes });
        toast.success("Invoice disputed");
      } else if (action === "override") {
        await apiClient.post(`${basePath}/${id}/override`, { action: overrideAction, reason: notes });
        toast.success(`Override ${overrideAction} recorded`);
      }
      setAction(null); setNotes("");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (!inv) return <div className="text-sm text-muted-foreground p-8">Loading…</div>;

  const statusMeta = BUCKETS.find((b) => b.code === inv.status) || BUCKETS[0];
  const isDraft = inv.status === "draft";
  const canSupplierSubmit = role === "supplier" && isDraft;
  const canPartnerAct = role === "partner" && ["matched", "variance"].includes(inv.status);
  const canAdminOverride = role === "admin" && !["approved"].includes(inv.status);
  const canDownloadDoc = !!inv.invoice_document_storage_path;

  const anyLineVariance = inv.lines.some((l) => l.match_status !== "matched");

  return (
    <div className="space-y-5" data-testid={`${role}-inv-detail`}>
      <button onClick={onBack} className="text-xs flex items-center gap-1 text-muted-foreground" data-testid={`${role}-inv-back`}>
        <ChevronLeft size={12} /> Back to invoices
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Supplier invoice</div>
          <h2 className="text-2xl font-bold font-mono text-foreground">{inv.code}</h2>
          <div className="text-xs text-muted-foreground mt-1">
            PO <span className="font-mono">{inv.po?.po_code}</span> ·{" "}
            <span className="font-medium">{inv.supplier?.business_name}</span> ↔{" "}
            <span className="font-medium">{inv.partner?.business_name}</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest px-3 py-2 rounded"
          style={{ background: `${statusMeta.color}22`, color: statusMeta.color }}
          data-testid={`${role}-inv-status-${inv.status}`}>
          {statusMeta.label}
        </span>
      </div>

      {inv.match_status && (
        <div className="rounded-lg border p-3 flex items-center gap-2"
          style={{
            background: inv.match_status === "matched" ? "rgba(34,197,94,.08)" : "rgba(249,115,22,.08)",
            borderColor: inv.match_status === "matched" ? "#22C55E" : "#F97316",
          }}
          data-testid={`${role}-inv-match-banner`}>
          {inv.match_status === "matched" ? <Check size={16} style={{ color: "#22C55E" }} /> : <AlertTriangle size={16} style={{ color: "#F97316" }} />}
          <span className="text-xs" style={{ color: inv.match_status === "matched" ? "#22C55E" : "#F97316" }}>
            <strong>3-way match: {inv.match_status.toUpperCase()}</strong>
            {inv.tolerance_pct_used !== null && <> · tolerance ±{inv.tolerance_pct_used}%</>}
            {inv.match_status === "variance" && " · review line diffs below"}
          </span>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        <StatBox label="Subtotal" value={`${Number(inv.subtotal).toFixed(2)} ${inv.currency}`} />
        <StatBox label="Tax" value={`${Number(inv.tax_total).toFixed(2)} ${inv.currency}`} />
        <StatBox label="Grand total" value={`${Number(inv.grand_total).toFixed(2)} ${inv.currency}`} highlight />
        <StatBox label="Invoice date" value={inv.invoice_date || "—"} />
      </div>

      {/* Supplier draft-edit block: invoice number/date/PDF */}
      {role === "supplier" && isDraft && (
        <div className="baked-card bg-card border border-border p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">Prepare & submit</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Your invoice number *</label>
              <input value={invNumber} onChange={(e) => setInvNumber(e.target.value)}
                className="w-full px-3 h-10 rounded-lg bg-secondary border border-border text-sm"
                placeholder="e.g. INV-2026-8891"
                data-testid="sup-inv-number" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice date *</label>
              <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)}
                className="w-full px-3 h-10 rounded-lg bg-secondary border border-border text-sm"
                data-testid="sup-inv-date" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Invoice PDF *</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="file" accept="application/pdf,image/*"
                onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])}
                className="text-xs"
                data-testid="sup-inv-file" />
              {canDownloadDoc && (
                <span className="text-[10px] text-primary flex items-center gap-1" data-testid="sup-inv-file-ok">
                  <Check size={10} /> Uploaded
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setAction("submit")} disabled={busy}
              className="baked-btn baked-btn-primary" data-testid="sup-inv-submit-btn">
              <Send size={14} /> Submit for approval
            </button>
          </div>
        </div>
      )}

      {/* Lines table with variance columns */}
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Product</th>
              <th className="text-right p-3">Ordered</th>
              <th className="text-right p-3">Received (GRN)</th>
              <th className="text-right p-3">Invoiced</th>
              <th className="text-right p-3">PO unit cost</th>
              <th className="text-right p-3">Invoiced unit cost</th>
              <th className="text-right p-3">Variance</th>
              <th className="text-right p-3">Line total</th>
              <th className="text-center p-3">Match</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((ln) => {
              const color = LINE_MATCH_COLOR[ln.match_status] || "#94A3B8";
              return (
                <tr key={ln.id} className="border-t border-border" data-testid={`${role}-inv-line-${ln.id}`}>
                  <td className="p-3">
                    <div className="font-medium text-foreground">{ln.product_name}</div>
                    {ln.supplier_sku && <div className="text-[10px] font-mono text-muted-foreground">{ln.supplier_sku}</div>}
                  </td>
                  <td className="p-3 text-right font-mono text-foreground">{ln.qty_ordered}</td>
                  <td className="p-3 text-right font-mono text-foreground">{ln.qty_received}</td>
                  <td className="p-3 text-right font-mono text-foreground">
                    {role === "supplier" && isDraft ? (
                      <input type="number" min={0} value={ln.qty_invoiced} step={1}
                        onChange={(e) => updateLine(ln.id, { qty_invoiced: parseInt(e.target.value || "0", 10) })}
                        className="w-20 text-right bg-secondary border border-border rounded px-2 py-1 text-sm"
                        data-testid={`sup-inv-line-qty-${ln.id}`} />
                    ) : ln.qty_invoiced}
                  </td>
                  <td className="p-3 text-right font-mono text-foreground">{Number(ln.unit_cost_po).toFixed(2)}</td>
                  <td className="p-3 text-right font-mono text-foreground">
                    {role === "supplier" && isDraft ? (
                      <input type="number" min={0} step={0.01} value={ln.unit_cost_invoiced}
                        onChange={(e) => updateLine(ln.id, { unit_cost_invoiced: parseFloat(e.target.value || "0") })}
                        className="w-24 text-right bg-secondary border border-border rounded px-2 py-1 text-sm"
                        data-testid={`sup-inv-line-cost-${ln.id}`} />
                    ) : Number(ln.unit_cost_invoiced).toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono" style={{ color: Math.abs(Number(ln.unit_cost_variance_pct)) > 0 ? color : undefined }}>
                    {Number(ln.unit_cost_variance_pct).toFixed(2)}%
                  </td>
                  <td className="p-3 text-right font-mono text-foreground">{Number(ln.line_total).toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${color}22`, color }}>
                      {ln.match_status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PDF download for non-supplier viewers */}
      {canDownloadDoc && role !== "supplier" && (
        <div>
          <a href={`${apiClient.defaults.baseURL || ""}${basePath}/${id}/document`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline"
            data-testid={`${role}-inv-doc-link`}>
            <FileText size={12} /> Download supplier invoice PDF
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canPartnerAct && (
          <>
            <button onClick={() => setAction("approve")} className="baked-btn baked-btn-primary" data-testid="partner-inv-approve-btn">
              <Check size={14} /> Approve
            </button>
            <button onClick={() => setAction("dispute")} className="baked-btn baked-btn-ghost" style={{ color: "#FF4C52" }} data-testid="partner-inv-dispute-btn">
              <Ban size={14} /> Dispute
            </button>
          </>
        )}
        {canAdminOverride && (
          <button onClick={() => setAction("override")} className="baked-btn baked-btn-ghost" style={{ color: "#F97316" }} data-testid="admin-inv-override-btn">
            <ShieldCheck size={14} /> Override
          </button>
        )}
      </div>

      {/* Audit trail */}
      <div className="baked-card bg-card border border-border p-4" data-testid={`${role}-inv-audit`}>
        <div className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground flex items-center gap-2">
          <ShieldCheck size={12} /> Audit trail
        </div>
        {inv.audit_trail.map((a) => (
          <div key={a.id} className="text-xs py-1 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-muted-foreground min-w-[140px] flex items-center gap-1"><Clock size={10} />{new Date(a.created_at).toLocaleString()}</span>
            <span className="font-semibold uppercase text-primary">{a.action}</span>
            {a.from_status && <span className="text-muted-foreground">{a.from_status} → {a.to_status}</span>}
            {a.actor_label && <span className="text-muted-foreground">· {a.actor_label}</span>}
            {a.notes && <span className="text-muted-foreground italic truncate">— {a.notes}</span>}
          </div>
        ))}
      </div>

      {/* Action modal */}
      {action && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setAction(null)}>
          <div className="baked-card bg-card border border-border p-6 max-w-md w-full" data-testid={`${role}-inv-action-modal`}>
            <div className="text-lg font-bold flex items-center gap-2">
              {action === "submit" && <><Send size={16} /> Submit invoice</>}
              {action === "approve" && <><Check size={16} /> Approve invoice</>}
              {action === "dispute" && <><Ban size={16} /> Dispute invoice</>}
              {action === "override" && <><ShieldCheck size={16} /> Admin override</>}
            </div>
            {action === "approve" && anyLineVariance && (
              <p className="text-xs mt-2" style={{ color: "#F97316" }}>
                <AlertTriangle size={11} className="inline" /> This invoice contains a variance —
                a reason is required before approval.
              </p>
            )}
            {action === "override" && (
              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Override action</label>
                <select value={overrideAction} onChange={(e) => setOverrideAction(e.target.value)}
                  className="w-full px-3 h-10 rounded-lg bg-secondary border border-border text-sm mt-1"
                  data-testid="admin-inv-override-select">
                  <option value="approve">Force approve</option>
                  <option value="dispute">Force dispute</option>
                  <option value="reset_to_draft">Reset to draft</option>
                </select>
              </div>
            )}
            {action !== "submit" && (
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={action === "dispute" || action === "override" || (action === "approve" && anyLineVariance)
                  ? "Reason (required)…" : "Notes (optional)"}
                className="w-full mt-3 px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                data-testid={`${role}-inv-notes`} />
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAction(null)} className="baked-btn baked-btn-ghost">Cancel</button>
              <button onClick={doAction} disabled={busy} className="baked-btn baked-btn-primary" data-testid={`${role}-inv-action-confirm`}>
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox = ({ label, value, highlight }) => (
  <div className="rounded-lg border border-border p-3 bg-secondary/20">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`text-sm font-mono ${highlight ? "font-bold text-primary" : "text-foreground"}`}>{value}</div>
  </div>
);

export default SupplierInvoicesPage;
