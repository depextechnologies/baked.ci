/**
 * Admin — MARTbakēd Partner Applications queue (Stage 2 Super Admin Review).
 *
 * Route: /admin/modules/mart/applications (registered in AdminApp).
 * Data:  GET  /api/admin/mart-partner/applications
 *        POST /api/admin/mart-partner/applications/{id}/{mark-under-review|request-info|approve|reject}
 *
 * On approve the backend materialises a Partner + primary Warehouse and
 * returns a one-time `temp_password` — we surface it in a copy-to-clipboard
 * card and warn that it won't be shown again.
 */
import React, { useEffect, useMemo, useState } from "react";
import { adminApi as api } from "@/contexts/AdminContext";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, XCircle, Info, Search, RefreshCw, Copy, ExternalLink,
  ChevronRight, Building2, MapPin, Phone, Mail, Wallet, FileText, ClipboardCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const STATUS_META = {
  draft:                     { label: "Draft",              tone: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  submitted:                 { label: "Submitted",          tone: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  under_review:              { label: "Under review",       tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  additional_info_required:  { label: "Info requested",     tone: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  approved:                  { label: "Approved",           tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected:                  { label: "Rejected",           tone: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const StatusPill = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.submitted;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${m.tone}`}>
      {m.label}
    </span>
  );
};

const FilterButton = ({ value, active, onClick, children }) => (
  <button
    type="button"
    onClick={() => onClick(value)}
    data-testid={`applications-filter-${value || "all"}`}
    className={`px-3 h-9 rounded-full text-xs font-semibold border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-muted-foreground border-border hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

/* -------------------------------------------------------------------------- */
/*                            Application drawer                              */
/* -------------------------------------------------------------------------- */

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
    <Icon size={15} className="text-muted-foreground shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground mt-0.5 break-words">{value || "—"}</div>
    </div>
  </div>
);

const ActionDialog = ({ mode, application, onClose, onDone }) => {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = {
    "request-info": { title: "Request additional information", cta: "Send request", tone: "default" },
    "reject":       { title: "Reject application",             cta: "Reject",       tone: "destructive" },
  }[mode] || {};

  const run = async () => {
    if (!message.trim()) { toast.error("Please add a message for the applicant"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/mart-partner/applications/${application.id}/${mode}`, { message });
      toast.success(mode === "reject" ? "Application rejected" : "Info request sent");
      onDone(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="application-action-dialog">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>
            Applicant: <b>{application.business_name}</b> · Ref <b>{application.reference}</b>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={mode === "reject"
            ? "Reason for rejection (will be shown to the applicant)…"
            : "What info do you need? e.g. clearer registration document, updated bank details…"}
          data-testid="application-action-message"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="application-action-cancel">Cancel</Button>
          <Button
            variant={meta.tone === "destructive" ? "destructive" : "default"}
            disabled={busy}
            onClick={run}
            data-testid="application-action-confirm"
          >
            {busy && <Loader2 size={14} className="animate-spin mr-2" />}
            {meta.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ApprovalResultDialog = ({ result, onClose }) => (
  <Dialog open onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-w-lg" data-testid="approval-result-dialog">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="text-emerald-500" size={22} /> Partner approved
        </DialogTitle>
        <DialogDescription>
          {result.partner.business_name} is live. Share these credentials with the owner — the temp password will
          <b> not be shown again</b>.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {[
          ["Partner ID",   result.partner.id],
          ["Warehouse",    `${result.warehouse.name}`],
          ["Owner email",  result.partner.owner_email],
          ["Temp password", result.temp_password],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
              <div className="text-sm font-mono text-foreground mt-0.5 break-all">{v}</div>
            </div>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(v); toast.success(`Copied ${k}`); }}
              className="p-2 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground"
              data-testid={`copy-${k.toLowerCase().replace(/\s+/g, "-")}`}
              title="Copy"
            >
              <Copy size={14} />
            </button>
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button onClick={onClose} data-testid="approval-result-close">Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const ApplicationDrawer = ({ app, onClose, onChange }) => {
  const [busy, setBusy] = useState(null);
  const [dialogMode, setDialogMode] = useState(null);
  const [approvalResult, setApprovalResult] = useState(null);

  const runSimple = async (action) => {
    setBusy(action);
    try {
      const { data } = await api.post(`/admin/mart-partner/applications/${app.id}/${action}`);
      if (action === "approve") setApprovalResult(data);
      onChange(action === "approve" ? data.application : data);
      if (action !== "approve") toast.success("Marked under review");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Something went wrong");
    } finally { setBusy(null); }
  };

  const canAct = !["approved", "rejected"].includes(app.status);
  const canApprove = ["submitted", "under_review", "additional_info_required"].includes(app.status);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="application-drawer-scrim" />
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-2xl z-50 bg-card border-l border-border shadow-2xl overflow-y-auto"
        data-testid="application-drawer"
      >
        <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-6 py-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText size={13} /> {app.reference || "— no reference —"}
            </div>
            <h2 className="text-xl font-semibold mt-1">{app.business_name}</h2>
            <div className="mt-2"><StatusPill status={app.status} /></div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm" data-testid="drawer-close">✕</button>
        </header>

        <div className="p-6 space-y-8">
          {/* Additional-info message shown prominently if it exists */}
          {app.additional_info_message && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <div className="font-semibold text-amber-300 mb-1">Info requested from applicant</div>
              <p className="text-amber-100/80">{app.additional_info_message}</p>
            </div>
          )}
          {app.rejection_reason && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
              <div className="font-semibold text-rose-300 mb-1">Rejection reason</div>
              <p className="text-rose-100/80">{app.rejection_reason}</p>
            </div>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Business</h3>
            <InfoRow icon={Building2} label="Type"          value={app.business_type?.replace(/_/g, " ")} />
            <InfoRow icon={Building2} label="Legal name"    value={app.legal_name} />
            <InfoRow icon={FileText}  label="Reg. number"   value={app.registration_number} />
            <InfoRow icon={FileText}  label="Tax ID"        value={app.tax_id} />
            <InfoRow icon={Building2} label="Years"         value={app.years_in_business} />
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Contact & Owner</h3>
            <InfoRow icon={Mail}  label="Contact"     value={`${app.primary_contact_name} · ${app.primary_contact_email}`} />
            <InfoRow icon={Phone} label="Phone"       value={app.primary_contact_phone} />
            <InfoRow icon={Building2} label="Owner"   value={`${app.owner_name} · ${app.owner_id_type || "—"} ${app.owner_id_number || ""}`} />
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Warehouse</h3>
            <InfoRow icon={MapPin}     label="Address"        value={`${app.warehouse_address_line}, ${app.warehouse_city}`} />
            <InfoRow icon={Building2}  label="Property"       value={`${app.property_type || "—"} · ${app.property_size_sqm || "?"} m² · ${app.service_area_km || "?"} km radius`} />
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Payouts</h3>
            <InfoRow icon={Wallet} label="Bank"            value={app.bank_name ? `${app.bank_name} · ${app.bank_account_holder || ""}` : "—"} />
            <InfoRow icon={Wallet} label="Account number"  value={app.bank_account_number} />
            <InfoRow icon={Wallet} label="Mobile money"    value={app.mobile_money_number ? `${app.mobile_money_provider} · ${app.mobile_money_number}` : "—"} />
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Timeline</h3>
            <InfoRow icon={FileText} label="Submitted at"   value={fmtDate(app.submitted_at)} />
            <InfoRow icon={FileText} label="Reviewed at"    value={fmtDate(app.reviewed_at)} />
          </section>
        </div>

        {/* Action bar */}
        {canAct && (
          <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {app.status !== "under_review" && (
              <Button variant="secondary" size="sm" disabled={busy === "mark-under-review"} onClick={() => runSimple("mark-under-review")} data-testid="action-mark-under-review">
                {busy === "mark-under-review" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Mark reviewing
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setDialogMode("request-info")} data-testid="action-request-info">
              <Info size={14} /> Request info
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDialogMode("reject")} data-testid="action-reject">
              <XCircle size={14} /> Reject
            </Button>
            {canApprove && (
              <Button size="sm" disabled={busy === "approve"} onClick={() => runSimple("approve")} data-testid="action-approve">
                {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
              </Button>
            )}
          </div>
        )}
      </aside>

      {dialogMode && (
        <ActionDialog
          mode={dialogMode}
          application={app}
          onClose={() => setDialogMode(null)}
          onDone={(updated) => { setDialogMode(null); onChange(updated); }}
        />
      )}
      {approvalResult && (
        <ApprovalResultDialog result={approvalResult} onClose={() => setApprovalResult(null)} />
      )}
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Main page                                   */
/* -------------------------------------------------------------------------- */

export const ModulePartnerApplications = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");   // "" = all
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ module: "mart", limit: "100" });
      if (status) params.set("status", status);
      const { data } = await api.get(`/admin/mart-partner/applications?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error("Failed to load applications");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((a) =>
      [a.reference, a.business_name, a.primary_contact_email, a.warehouse_city, a.owner_name]
        .some((f) => (f || "").toString().toLowerCase().includes(needle))
    );
  }, [items, q]);

  const onItemChange = (updated) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    setSelected((cur) => (cur && cur.id === updated.id ? updated : cur));
  };

  return (
    <div className="space-y-6" data-testid="partner-applications-page">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">MART · Super Admin Review</p>
          <h1 className="text-2xl font-semibold mt-1">Partner Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} total · Stage 2 of the 3-stage partner onboarding flow
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-border hover:bg-muted" data-testid="applications-refresh" title="Refresh">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterButton value=""                          active={status === ""}                         onClick={setStatus}>All</FilterButton>
        <FilterButton value="submitted"                 active={status === "submitted"}                onClick={setStatus}>Submitted</FilterButton>
        <FilterButton value="under_review"              active={status === "under_review"}             onClick={setStatus}>Under review</FilterButton>
        <FilterButton value="additional_info_required"  active={status === "additional_info_required"} onClick={setStatus}>Info requested</FilterButton>
        <FilterButton value="approved"                  active={status === "approved"}                 onClick={setStatus}>Approved</FilterButton>
        <FilterButton value="rejected"                  active={status === "rejected"}                 onClick={setStatus}>Rejected</FilterButton>

        <div className="ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reference, business, email…"
            className="pl-9 pr-4 h-9 w-72 rounded-lg bg-background border border-border text-sm"
            data-testid="applications-search"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">
                <Loader2 className="animate-spin inline mr-2" size={14} /> Loading…
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">
                No applications match this filter.
              </td></tr>
            )}
            {!loading && filtered.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelected(a)}
                className="border-t border-border hover:bg-muted/50 cursor-pointer"
                data-testid={`application-row-${a.reference || a.id}`}
              >
                <td className="px-4 py-3 font-mono text-xs">{a.reference || "—"}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.business_name}</div>
                  <div className="text-xs text-muted-foreground">{a.primary_contact_email}</div>
                </td>
                <td className="px-4 py-3">{a.warehouse_city}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.submitted_at)}</td>
                <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-muted-foreground" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ApplicationDrawer
          app={selected}
          onClose={() => setSelected(null)}
          onChange={onItemChange}
        />
      )}
    </div>
  );
};

export default ModulePartnerApplications;
