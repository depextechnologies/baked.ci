/**
 * AdminReturns — Super Admin inbox for Returns & Refunds (Phase 7B).
 *
 * Two tabs:
 *   1. "Requests" — list of returns, filterable by status/module, with inline
 *      Approve / Partial / Reject action buttons. Also exposes an "Escalate stale"
 *      bulk action that moves SLA-expired partner cases into the admin queue.
 *   2. "Policies" — list + edit the configurable per-module/country/category/product
 *      windows and auto-approval thresholds.
 *
 * Admin override authority: every request can be re-decided here, including
 * one already approved by the partner — this is the final word.
 */
import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../contexts/AdminContext";
import { Loader2, Filter, AlertTriangle, Clock, Check, X, Flag, Shield } from "lucide-react";
import { toast } from "sonner";

const STATUS_TONE = {
  refunded: "#00A651", approved: "#00A651", partial_approved: "#F59E0B",
  approved_pending_payout: "#F59E0B", awaiting_partner: "#3B82F6",
  awaiting_admin: "#3B82F6", rejected: "#EF4444", cancelled: "#9CA3AF",
};

const Pill = ({ status }) => (
  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: `${STATUS_TONE[status] || "#6B7280"}22`, color: STATUS_TONE[status] || "#6B7280" }}
        data-testid={`admin-ret-status-${status}`}>
    {status.replace(/_/g, " ")}
  </span>
);

const fmt = (v, c) => `${Math.round(Number(v || 0)).toLocaleString()} ${c || ""}`;

// -------------------------------------------------------------------------
// Request detail drawer
// -------------------------------------------------------------------------
const Drawer = ({ id, onClose }) => {
  const [data, setData] = useState(null);
  const [decision, setDecision] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await adminApi.get(`/admin/returns/${id}`);
      setData(data);
      setAmount(String(data.return.requested_amount || ""));
    } catch { toast.error("Load failed"); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const act = async () => {
    if (!decision) return;
    if (decision !== "approve" && !reason.trim()) {
      toast.error("Reason required"); return;
    }
    setSaving(true);
    try {
      const body = { decision, reason: reason || undefined };
      if (decision === "partial") body.approved_amount = Number(amount);
      await adminApi.post(`/admin/returns/${id}/decision`, body);
      toast.success("Decision saved");
      onClose(true);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setSaving(false); }
  };

  const flag = async (level) => {
    if (!data) return;
    const cid = data.return.customer_id;
    try {
      if (level === null) {
        await adminApi.delete(`/admin/returns/flag/${cid}`);
        toast.success("Flag cleared");
      } else {
        await adminApi.post(`/admin/returns/flag/${cid}`,
          { risk_level: level, reason: "Pattern of refunds" });
        toast.success(`Customer flagged (${level})`);
      }
      load();
    } catch { toast.error("Flag failed"); }
  };

  if (!data) {
    return <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center">
      <Loader2 className="animate-spin text-white" /></div>;
  }
  const r = data.return;
  const closed = ["refunded", "cancelled", "rejected"].includes(r.status);

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/60" data-testid="admin-ret-drawer">
      <div className="w-full max-w-xl bg-background border-l border-border overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Return</div>
            <div className="font-mono text-sm font-bold">#{r.number}</div>
          </div>
          <button onClick={() => onClose(false)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
                  data-testid="admin-ret-drawer-close"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <Pill status={r.status} />
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase">Requested</div>
              <div className="text-lg font-bold">{fmt(r.requested_amount, r.currency)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground uppercase text-[10px]">Module</div>
              <div className="font-semibold">{r.order_module}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase text-[10px]">Order</div>
              <div className="font-mono text-[11px] truncate">{r.order_id}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase text-[10px]">Refund to</div>
              <div className="font-semibold">{r.refund_destination}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase text-[10px]">Partner</div>
              <div className="font-mono text-[11px] truncate">{r.partner_id || "—"}</div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Items</div>
            <div className="rounded-xl border border-border bg-card p-3 space-y-1 text-xs">
              {data.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between">
                  <span>{it.qty}× {it.name_snapshot} <span className="text-muted-foreground text-[10px]">({it.reason_code})</span></span>
                  <span className="font-mono">{fmt(it.line_amount, r.currency)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence */}
          {data.evidence.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Evidence</div>
              <div className="space-y-1 text-xs">
                {data.evidence.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    {e.kind === "photo"
                      ? <a href={e.url} target="_blank" rel="noreferrer" className="underline text-xs break-all">{e.url}</a>
                      : <span className="text-xs">{e.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Audit trail</div>
            <ol className="relative border-l border-border ml-2 space-y-2" data-testid="admin-ret-audit">
              {data.audit.map((a) => (
                <li key={a.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#00A651]" />
                  <div className="text-xs font-semibold">{a.actor_type} · {a.action.replace(/_/g, " ")}</div>
                  {a.note && <div className="text-[11px] text-muted-foreground">{a.note}</div>}
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Flag toolbox */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1 self-center">Customer</span>
            {data.flag ? (
              <>
                <span className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-[10px] bg-red-100 text-red-700" data-testid="admin-ret-flagged">
                  <Flag size={10} /> {data.flag.risk_level}
                </span>
                <button className="h-7 px-2 rounded-full text-[10px] border border-border" onClick={() => flag(null)}
                        data-testid="admin-ret-unflag">Clear flag</button>
              </>
            ) : (
              <>
                <button className="h-7 px-2 rounded-full text-[10px] border border-border inline-flex items-center gap-1"
                        onClick={() => flag("review")} data-testid="admin-ret-flag-review">
                  <Flag size={10} /> Flag for review
                </button>
                <button className="h-7 px-2 rounded-full text-[10px] border border-red-200 text-red-700 inline-flex items-center gap-1"
                        onClick={() => flag("block")} data-testid="admin-ret-flag-block">
                  <Shield size={10} /> Block auto-refund
                </button>
              </>
            )}
          </div>

          {/* Decision */}
          {!closed && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-widest">Admin decision</div>
              <div className="flex gap-2">
                {["approve", "partial", "reject"].map((d) => (
                  <button key={d} onClick={() => setDecision(d)} data-testid={`admin-ret-dec-${d}`}
                          className={`flex-1 h-9 rounded-lg text-xs font-semibold border ${
                            decision === d ? "bg-foreground text-background border-foreground" : "border-border bg-card"
                          }`}>
                    {d}
                  </button>
                ))}
              </div>
              {decision === "partial" && (
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                       data-testid="admin-ret-amount"
                       className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs" />
              )}
              {decision !== "approve" && decision && (
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                          data-testid="admin-ret-reason"
                          placeholder="Reason (required)"
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs" />
              )}
              <button onClick={act} disabled={!decision || saving}
                      data-testid="admin-ret-submit"
                      className="w-full h-10 rounded-lg bg-[#00A651] text-black text-xs font-bold disabled:opacity-50">
                {saving ? "…" : "Submit decision"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Policies editor
// -------------------------------------------------------------------------
const EMPTY_POLICY = {
  module: "food", country: "", category_id: "", product_id: "",
  window_hours: 2, auto_approve_threshold: 2000, threshold_currency: "XOF",
  is_returnable: true, notes: "",
};

const PoliciesTab = () => {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ ...EMPTY_POLICY });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await adminApi.get("/admin/return-policies");
      setRows(data.items || []);
    } catch { toast.error("Load failed"); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.post("/admin/return-policies", {
        ...draft,
        country: draft.country || null,
        category_id: draft.category_id || null,
        product_id: draft.product_id || null,
      });
      toast.success("Policy saved");
      setDraft({ ...EMPTY_POLICY });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this policy row?")) return;
    try {
      await adminApi.delete(`/admin/return-policies/${id}`);
      load();
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="space-y-6" data-testid="admin-policies-tab">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold mb-3">Add / update policy</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <select value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })}
                  data-testid="pol-module"
                  className="h-9 rounded border border-border bg-background px-2">
            <option value="food">food</option><option value="mart">mart</option><option value="shop">shop</option>
          </select>
          <input placeholder="country (CI, FR, …)" value={draft.country}
                 onChange={(e) => setDraft({ ...draft, country: e.target.value.toUpperCase() })}
                 data-testid="pol-country"
                 className="h-9 rounded border border-border bg-background px-2" />
          <input placeholder="category_id (optional)" value={draft.category_id}
                 onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}
                 data-testid="pol-category"
                 className="h-9 rounded border border-border bg-background px-2" />
          <input placeholder="product_id (optional)" value={draft.product_id}
                 onChange={(e) => setDraft({ ...draft, product_id: e.target.value })}
                 data-testid="pol-product"
                 className="h-9 rounded border border-border bg-background px-2" />
          <input type="number" placeholder="window hours" value={draft.window_hours}
                 onChange={(e) => setDraft({ ...draft, window_hours: Number(e.target.value) })}
                 data-testid="pol-window"
                 className="h-9 rounded border border-border bg-background px-2" />
          <input type="number" placeholder="auto-approve <" value={draft.auto_approve_threshold}
                 onChange={(e) => setDraft({ ...draft, auto_approve_threshold: Number(e.target.value) })}
                 data-testid="pol-threshold"
                 className="h-9 rounded border border-border bg-background px-2" />
          <input placeholder="currency" value={draft.threshold_currency}
                 onChange={(e) => setDraft({ ...draft, threshold_currency: e.target.value })}
                 className="h-9 rounded border border-border bg-background px-2" />
          <label className="flex items-center gap-2 h-9 px-2 text-xs">
            <input type="checkbox" checked={draft.is_returnable}
                   onChange={(e) => setDraft({ ...draft, is_returnable: e.target.checked })} />
            Returnable
          </label>
        </div>
        <button onClick={save} disabled={saving}
                data-testid="pol-save"
                className="mt-3 h-9 px-4 bg-[#00A651] text-black text-xs font-bold rounded disabled:opacity-50">
          {saving ? "…" : "Save policy"}
        </button>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-xs" data-testid="admin-policies-table">
          <thead className="bg-card">
            <tr className="text-left text-[10px] uppercase text-muted-foreground">
              <th className="p-2">Module</th><th className="p-2">Country</th>
              <th className="p-2">Category</th><th className="p-2">Product</th>
              <th className="p-2">Window</th><th className="p-2">Threshold</th>
              <th className="p-2">Returnable</th><th className="p-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-2 font-semibold">{p.module}</td>
                <td className="p-2">{p.country || "—"}</td>
                <td className="p-2 text-muted-foreground font-mono text-[11px]">{p.category_id || "—"}</td>
                <td className="p-2 text-muted-foreground font-mono text-[11px]">{p.product_id || "—"}</td>
                <td className="p-2">{p.window_hours}h</td>
                <td className="p-2">{fmt(p.auto_approve_threshold, p.threshold_currency)}</td>
                <td className="p-2">{p.is_returnable ? "yes" : "no"}</td>
                <td className="p-2">
                  {!p.id.startsWith("pol_default_") && (
                    <button onClick={() => del(p.id)} className="text-red-600 text-[11px]"
                            data-testid={`pol-delete-${p.id}`}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
export const AdminReturns = () => {
  const [tab, setTab] = useState("requests");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("");
  const [moduleF, setModuleF] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/returns", {
        params: { ...(statusF ? { status: statusF } : {}),
                  ...(moduleF ? { module: moduleF } : {}) },
      });
      setRows(data.items || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tab === "requests") load(); }, [tab, statusF, moduleF]);

  const escalate = async () => {
    try {
      const { data } = await adminApi.post("/admin/returns/escalate-stale", {});
      toast.success(`Escalated ${data.escalated} case(s)`);
      load();
    } catch { toast.error("Escalate failed"); }
  };

  return (
    <div className="space-y-5" data-testid="admin-returns-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Returns & Refunds</h1>
          <p className="text-xs text-muted-foreground">
            Review customer refund requests, override partner decisions and tune policies per module/country.
          </p>
        </div>
        <div className="flex gap-2">
          {["requests", "policies"].map((k) => (
            <button key={k} onClick={() => setTab(k)}
                    data-testid={`admin-ret-tab-${k}`}
                    className={`h-9 px-3 rounded-full text-xs font-semibold ${
                      tab === k ? "bg-foreground text-background" : "bg-card border border-border"
                    }`}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {tab === "requests" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-muted-foreground" />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
                    data-testid="admin-ret-filter-status"
                    className="h-9 rounded border border-border bg-background px-2 text-xs">
              <option value="">All statuses</option>
              {["awaiting_partner", "awaiting_admin", "approved", "partial_approved",
                "refunded", "rejected", "cancelled"].map((s) =>
                <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={moduleF} onChange={(e) => setModuleF(e.target.value)}
                    data-testid="admin-ret-filter-module"
                    className="h-9 rounded border border-border bg-background px-2 text-xs">
              <option value="">All modules</option>
              <option value="food">food</option>
              <option value="mart">mart</option>
              <option value="shop">shop</option>
            </select>
            <div className="ml-auto">
              <button onClick={escalate} data-testid="admin-ret-escalate"
                      className="h-9 px-3 rounded-lg bg-amber-500 text-black text-xs font-semibold inline-flex items-center gap-1">
                <AlertTriangle size={13} /> Escalate stale (SLA)
              </button>
            </div>
          </div>

          {loading && <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>}
          {!loading && rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
                 data-testid="admin-ret-empty">
              No returns yet.
            </div>
          )}
          {!loading && rows.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-xs" data-testid="admin-returns-table">
                <thead className="bg-card">
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="p-2">Number</th><th className="p-2">Module</th>
                    <th className="p-2">Status</th><th className="p-2">Requested</th>
                    <th className="p-2">Approved</th><th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary cursor-pointer"
                        onClick={() => setOpenId(r.id)}
                        data-testid={`admin-ret-row-${r.id}`}>
                      <td className="p-2 font-mono">#{r.number}</td>
                      <td className="p-2">{r.order_module}</td>
                      <td className="p-2"><Pill status={r.status} /></td>
                      <td className="p-2 font-mono">{fmt(r.requested_amount, r.currency)}</td>
                      <td className="p-2 font-mono">{r.approved_amount != null ? fmt(r.approved_amount, r.currency) : "—"}</td>
                      <td className="p-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "policies" && <PoliciesTab />}

      {openId && <Drawer id={openId} onClose={(reload) => { setOpenId(null); if (reload) load(); }} />}
    </div>
  );
};

export default AdminReturns;
