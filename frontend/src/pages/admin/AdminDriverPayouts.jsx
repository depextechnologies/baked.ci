/**
 * AdminDriverPayouts — SENDbakēd driver payout console.
 *
 * Lists every DriverWithdrawal newest-first with tabs for
 * pending / paid / failed / all. Pending rows expose two actions:
 *   - Mark paid   → POST /admin/drivers/withdrawals/{id}/mark-paid
 *   - Mark failed → POST /admin/drivers/withdrawals/{id}/mark-failed { note }
 *
 * KPI strip surfaces the sum of pending payouts per currency so ops can
 * eyeball outstanding cash before opening their bank.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";
import {
  Wallet, Search, CheckCircle2, XCircle, Clock, RefreshCw, Landmark, Phone as PhoneIcon,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  pending: { label: "Pending", bg: "#FFB4541F", color: "#FFB454" },
  paid:    { label: "Paid",    bg: "#77BC1F22", color: "#77BC1F" },
  failed:  { label: "Failed",  bg: "#EF444422", color: "#EF4444" },
};

const fmtMoney = (amt, cur) =>
  cur === "INR" ? `₹${Number(amt || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                : `${Number(amt || 0).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

const TABS = [
  { code: "pending", label: "Pending" },
  { code: "paid",    label: "Paid" },
  { code: "failed",  label: "Failed" },
  { code: "all",     label: "All" },
];

export const AdminDriverPayouts = () => {
  const [data, setData]     = useState(null);
  const [tab, setTab]       = useState("pending");
  const [q, setQ]           = useState("");
  const [busyId, setBusyId] = useState(null);
  const [failing, setFailing] = useState(null); // withdrawal object being marked-failed

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("status", tab);
    if (q.trim())     params.set("q", q.trim());
    const url = `/admin/drivers/withdrawals${params.toString() ? `?${params}` : ""}`;
    try { setData((await adminApi.get(url)).data); }
    catch (e) { toast.error(e?.response?.data?.detail?.message || "Failed to load payouts"); }
  }, [tab, q]);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (w) => {
    setBusyId(w.id);
    try {
      await adminApi.post(`/admin/drivers/withdrawals/${w.id}/mark-paid`);
      toast.success(`Marked ${fmtMoney(w.amount, w.currency)} as paid`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail?.message || "Failed to mark paid"); }
    finally { setBusyId(null); }
  };

  const markFailed = async (w, note) => {
    setBusyId(w.id);
    try {
      await adminApi.post(`/admin/drivers/withdrawals/${w.id}/mark-failed`, { note });
      toast.success("Marked as failed");
      setFailing(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail?.message || "Failed to mark failed"); }
    finally { setBusyId(null); }
  };

  const buckets       = data?.buckets || {};
  const pendingTotals = data?.pending_totals || {};
  const rows          = data?.items || [];

  return (
    <div className="space-y-4" data-testid="admin-driver-payouts">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Wallet size={18} /> Driver payouts</h2>
          <p className="text-xs text-muted-foreground">SENDbakēd driver withdrawal requests. Mark each row as paid or failed after processing at the bank.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} data-testid="payouts-refresh">
          <RefreshCw size={14} className="mr-2" /> Refresh
        </Button>
      </div>

      {/* KPI strip — sum of pending amounts per currency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(pendingTotals).length === 0 ? (
          <div className="col-span-full baked-card bg-card border border-border p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending outflow</div>
            <div className="text-lg font-bold mt-1">No pending payouts</div>
          </div>
        ) : Object.entries(pendingTotals).map(([cur, amt]) => (
          <div key={cur} className="baked-card bg-card border border-border p-4" data-testid={`payouts-kpi-${cur}`}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending · {cur}</div>
            <div className="text-2xl font-bold mt-1">{fmtMoney(amt, cur)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Across {buckets.pending || 0} requests</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-lg bg-secondary/40 border border-border">
          {TABS.map((t) => {
            const active = tab === t.code;
            const count  = t.code === "all"
              ? Object.values(buckets).reduce((s, n) => s + n, 0)
              : (buckets[t.code] ?? 0);
            return (
              <button key={t.code} onClick={() => setTab(t.code)}
                      data-testid={`payouts-tab-${t.code}`}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${active ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-secondary" : "bg-secondary/50"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search driver name or phone"
                 data-testid="payouts-search"
                 className="baked-input bg-secondary pl-7 pr-3 py-1.5 text-xs w-64" />
        </div>
      </div>

      {/* Table */}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Bank</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Requested</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody data-testid="payouts-table-body">
            {!data ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground" data-testid="payouts-empty">
                No {tab === "all" ? "" : tab} payout requests yet.
              </td></tr>
            ) : rows.map((w) => {
              const st = STATUS_META[w.status] || STATUS_META.pending;
              return (
                <tr key={w.id} className="border-t border-border" data-testid={`payouts-row-${w.id}`}>
                  <td className="p-3">
                    <div className="font-medium">{w.driver?.name || "—"}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <PhoneIcon size={10} /> {w.driver?.phone_e164} · {w.driver?.country}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-xs flex items-center gap-1.5">
                      <Landmark size={12} className="text-muted-foreground" /> {w.bank?.holder || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {w.bank?.account_masked || "—"} · {w.bank?.ifsc || "—"}
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold" data-testid={`payouts-amount-${w.id}`}>
                    {fmtMoney(w.amount, w.currency)}
                  </td>
                  <td className="p-3 text-xs">
                    {fmtDate(w.requested_at)}
                    {w.processed_at && (
                      <div className="text-[10px] text-muted-foreground">Processed {fmtDate(w.processed_at)}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] baked-chip px-2 py-0.5 font-semibold inline-flex items-center gap-1"
                          style={{ backgroundColor: st.bg, color: st.color }}
                          data-testid={`payouts-status-${w.id}`}>
                      {w.status === "paid"    && <CheckCircle2 size={10} />}
                      {w.status === "failed"  && <XCircle size={10} />}
                      {w.status === "pending" && <Clock size={10} />}
                      {st.label}
                    </span>
                    {w.status === "failed" && w.failure_note && (
                      <div className="text-[10px] text-muted-foreground mt-1 max-w-[200px] truncate" title={w.failure_note}>
                        {w.failure_note}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    {w.status === "pending" ? (
                      <>
                        <Button size="sm" className="baked-btn h-7 text-xs"
                                style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}
                                disabled={busyId === w.id}
                                onClick={() => markPaid(w)}
                                data-testid={`payouts-mark-paid-${w.id}`}>
                          <CheckCircle2 size={12} className="mr-1" /> Mark paid
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-500/40"
                                disabled={busyId === w.id}
                                onClick={() => setFailing(w)}
                                data-testid={`payouts-mark-failed-${w.id}`}>
                          <XCircle size={12} className="mr-1" /> Mark failed
                        </Button>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {failing && (
        <MarkFailedDialog withdrawal={failing}
                          onCancel={() => setFailing(null)}
                          onConfirm={(note) => markFailed(failing, note)}
                          busy={busyId === failing.id} />
      )}
    </div>
  );
};

const MarkFailedDialog = ({ withdrawal, onCancel, onConfirm, busy }) => {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onCancel} data-testid="payouts-fail-dialog">
      <div className="w-full max-w-md baked-card bg-card border border-border p-5"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 grid place-items-center"><XCircle size={18} className="text-red-500" /></div>
          <div className="flex-1">
            <div className="text-base font-semibold">Mark payout as failed</div>
            <div className="text-xs text-muted-foreground mt-1">
              {withdrawal.driver?.name} · {fmtMoney(withdrawal.amount, withdrawal.currency)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Reason (optional)</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    rows={3} placeholder="e.g. IFSC invalid, retried on 12 Feb"
                    data-testid="payouts-fail-note"
                    className="baked-input w-full bg-secondary p-2 text-sm" />
          <div className="text-[10px] text-muted-foreground mt-1">
            The driver will see this note in their wallet. Funds return to their available balance.
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} data-testid="payouts-fail-cancel">Cancel</Button>
          <Button className="baked-btn" style={{ backgroundColor: "#EF4444", color: "#fff" }}
                  disabled={busy} onClick={() => onConfirm(note.trim())}
                  data-testid="payouts-fail-confirm">
            Confirm failure
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminDriverPayouts;
