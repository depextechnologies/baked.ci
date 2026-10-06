/**
 * AdminVendorSettlement — Super Admin controls for FOODbakēd commissions + payouts.
 *
 * Two tabs:
 *   1. "Vendors"  — pick a restaurant, edit commission rate (with history),
 *      configure payout schedule, pause/resume payouts, trigger a payout.
 *   2. "Payouts"  — flat list of every payout across vendors with mark-paid
 *      / hold / release actions.
 *
 * French-first UI, EN fallback.
 */
import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../contexts/AdminContext";
import { toast } from "sonner";
import {
  Loader2, Percent, CalendarClock, Pause, Play, Check, X, History,
  AlertTriangle, Search, PlayCircle, Clock,
} from "lucide-react";

const fmt = (v, c = "XOF") =>
  `${Math.round(Number(v || 0)).toLocaleString()} ${c || ""}`.trim();

const SCHEDULES = [
  { value: "daily",   label: "Daily — night" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom",  label: "Custom" },
];

// -------------------------------------------------------------------------
// Settlement drawer for a single restaurant
// -------------------------------------------------------------------------
const RestaurantDrawer = ({ restaurant, onClose }) => {
  const [commission, setCommission] = useState(null);
  const [payoutCfg, setPayoutCfg]   = useState(null);
  const [rate, setRate]   = useState("");
  const [note, setNote]   = useState("");
  const [cfgDraft, setCfgDraft] = useState({
    schedule_type: "weekly",
    schedule_cfg: { weekday: 3, time_hhmm: "19:00" },
    payout_method: "mobile_money",
    payout_destination: "",
    min_payout_amount: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const rid = restaurant.id;

  const load = async () => {
    const [c, p] = await Promise.all([
      adminApi.get(`/admin/vendor-settlement/food/${rid}/commission`),
      adminApi.get(`/admin/vendor-settlement/food/${rid}/payout-config`),
    ]);
    setCommission(c.data);
    setPayoutCfg(p.data.config);
    if (p.data.config) {
      setCfgDraft({
        schedule_type: p.data.config.schedule_type,
        schedule_cfg: p.data.config.schedule_cfg || {},
        payout_method: p.data.config.payout_method || "",
        payout_destination: p.data.config.payout_destination || "",
        min_payout_amount: Number(p.data.config.min_payout_amount || 0),
        notes: p.data.config.notes || "",
      });
    }
    if (c.data.current) setRate(String(c.data.current.rate_percent));
  };
  useEffect(() => { load(); }, [rid]); // eslint-disable-line

  const saveRate = async () => {
    if (!rate) return;
    setSaving(true);
    try {
      await adminApi.post(`/admin/vendor-settlement/food/${rid}/commission`,
        { rate_percent: Number(rate), note: note || null });
      toast.success("Commission updated");
      setNote("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
    finally { setSaving(false); }
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await adminApi.post(`/admin/vendor-settlement/food/${rid}/payout-config`, cfgDraft);
      toast.success("Schedule saved");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
    finally { setSaving(false); }
  };

  const pause = async () => {
    const reason = window.prompt("Pause reason?") || "";
    await adminApi.post(`/admin/vendor-settlement/food/${rid}/payouts/pause`, { reason });
    toast.success("Payouts paused");
    load();
  };
  const resume = async () => {
    await adminApi.post(`/admin/vendor-settlement/food/${rid}/payouts/resume`, {});
    toast.success("Payouts resumed");
    load();
  };
  const generate = async () => {
    try {
      const { data } = await adminApi.post(
        `/admin/vendor-settlement/food/${rid}/payouts/generate`, {});
      toast.success(`Payout ${data.number} drafted (net ${fmt(data.net)})`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/60" data-testid="admin-vs-drawer">
      <div className="w-full max-w-2xl bg-background border-l border-border overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Settlement</div>
            <div className="font-bold">{restaurant.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground">{rid}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
                  data-testid="admin-vs-drawer-close"><X size={16} /></button>
        </div>

        {!commission ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <div className="p-5 space-y-6 text-sm">
            {/* Commission editor */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Percent size={14} />
                <h3 className="font-semibold">Commission rate</h3>
                {commission.current && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Current: <span className="font-semibold text-foreground">{commission.current.rate_percent}%</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">New rate (%)</label>
                  <input type="number" step="0.1" value={rate}
                         onChange={(e) => setRate(e.target.value)}
                         data-testid="admin-vs-rate"
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase text-muted-foreground">Internal note</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)}
                         data-testid="admin-vs-note"
                         placeholder="e.g. negotiated at launch call"
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
              </div>
              <button onClick={saveRate} disabled={saving || !rate}
                      data-testid="admin-vs-save-rate"
                      className="mt-3 h-9 px-4 rounded bg-[#00A651] text-black text-xs font-bold disabled:opacity-50">
                Save commission
              </button>

              {commission.history.length > 0 && (
                <details className="mt-4">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1">
                    <History size={11} /> History ({commission.history.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-[11px]" data-testid="admin-vs-history">
                    {commission.history.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-2 border-t border-border pt-1">
                        <div>
                          <span className="font-semibold">{h.rate_percent}%</span>
                          <span className="text-muted-foreground ml-2">
                            {new Date(h.effective_from).toLocaleDateString()}
                            {h.effective_until && ` → ${new Date(h.effective_until).toLocaleDateString()}`}
                          </span>
                        </div>
                        {h.note && <span className="text-muted-foreground italic truncate max-w-[50%]">"{h.note}"</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* Payout schedule */}
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock size={14} />
                <h3 className="font-semibold">Payout schedule</h3>
                {payoutCfg?.is_paused && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    <Pause size={10} /> Paused
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Type</label>
                  <select value={cfgDraft.schedule_type}
                          onChange={(e) => setCfgDraft({ ...cfgDraft, schedule_type: e.target.value })}
                          data-testid="admin-vs-sched-type"
                          className="h-9 w-full rounded border border-border bg-background px-2 text-xs">
                    {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {cfgDraft.schedule_type === "weekly" && (
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">Weekday (0=Mon)</label>
                    <input type="number" min={0} max={6} value={cfgDraft.schedule_cfg.weekday ?? 3}
                           onChange={(e) => setCfgDraft({ ...cfgDraft,
                             schedule_cfg: { ...cfgDraft.schedule_cfg, weekday: Number(e.target.value) } })}
                           data-testid="admin-vs-sched-weekday"
                           className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                  </div>
                )}
                {cfgDraft.schedule_type === "monthly" && (
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">Day of month</label>
                    <input type="number" min={1} max={31} value={cfgDraft.schedule_cfg.day_of_month ?? 1}
                           onChange={(e) => setCfgDraft({ ...cfgDraft,
                             schedule_cfg: { ...cfgDraft.schedule_cfg, day_of_month: Number(e.target.value) } })}
                           className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Time (HH:MM)</label>
                  <input value={cfgDraft.schedule_cfg.time_hhmm || "19:00"}
                         onChange={(e) => setCfgDraft({ ...cfgDraft,
                           schedule_cfg: { ...cfgDraft.schedule_cfg, time_hhmm: e.target.value } })}
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Method</label>
                  <input value={cfgDraft.payout_method}
                         onChange={(e) => setCfgDraft({ ...cfgDraft, payout_method: e.target.value })}
                         placeholder="mobile_money / bank_transfer"
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Destination</label>
                  <input value={cfgDraft.payout_destination}
                         onChange={(e) => setCfgDraft({ ...cfgDraft, payout_destination: e.target.value })}
                         placeholder="e.g. +225 07 xx xx"
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Min amount</label>
                  <input type="number" value={cfgDraft.min_payout_amount}
                         onChange={(e) => setCfgDraft({ ...cfgDraft, min_payout_amount: Number(e.target.value) })}
                         className="h-9 w-full rounded border border-border bg-background px-2 text-xs" />
                </div>
              </div>
              <textarea rows={2} value={cfgDraft.notes}
                        onChange={(e) => setCfgDraft({ ...cfgDraft, notes: e.target.value })}
                        placeholder="Internal notes"
                        className="mt-2 w-full rounded border border-border bg-background p-2 text-xs" />
              <div className="mt-3 flex gap-2 flex-wrap">
                <button onClick={saveSchedule} disabled={saving}
                        data-testid="admin-vs-save-sched"
                        className="h-9 px-4 rounded bg-[#00A651] text-black text-xs font-bold disabled:opacity-50">
                  Save schedule
                </button>
                {payoutCfg?.is_paused ? (
                  <button onClick={resume} data-testid="admin-vs-resume"
                          className="h-9 px-3 rounded bg-card border border-border text-xs font-semibold inline-flex items-center gap-1">
                    <Play size={12} /> Resume payouts
                  </button>
                ) : (
                  <button onClick={pause} data-testid="admin-vs-pause"
                          className="h-9 px-3 rounded bg-card border border-border text-xs font-semibold inline-flex items-center gap-1">
                    <Pause size={12} /> Pause payouts
                  </button>
                )}
                <button onClick={generate} data-testid="admin-vs-generate"
                        className="h-9 px-3 rounded bg-amber-500 text-black text-xs font-semibold inline-flex items-center gap-1 ml-auto">
                  <PlayCircle size={12} /> Generate payout now
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------------------
// Payouts tab
// -------------------------------------------------------------------------
const PayoutsTab = () => {
  const [rows, setRows] = useState([]);
  const [statusF, setStatusF] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/vendor-settlement/payouts", {
        params: statusF ? { status: statusF } : {},
      });
      setRows(data.items || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [statusF]);

  const markPaid = async (id) => {
    const reference = window.prompt("Reference / transaction ID") || "";
    try {
      await adminApi.post(`/admin/vendor-settlement/payouts/${id}/mark-paid`, { reference });
      toast.success("Marked paid");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };
  const hold = async (id) => {
    await adminApi.post(`/admin/vendor-settlement/payouts/${id}/hold`, {});
    load();
  };
  const release = async (id) => {
    await adminApi.post(`/admin/vendor-settlement/payouts/${id}/release`, {});
    load();
  };

  return (
    <div className="space-y-3" data-testid="admin-vs-payouts-tab">
      <div className="flex items-center gap-2">
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
                className="h-9 rounded border border-border bg-background px-2 text-xs"
                data-testid="admin-vs-payouts-filter">
          <option value="">All statuses</option>
          {["scheduled", "hold", "paid", "failed", "cancelled"].map((s) =>
            <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {loading && <div className="py-6 flex justify-center"><Loader2 className="animate-spin" /></div>}
      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No payouts.
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-xs" data-testid="admin-vs-payouts-table">
            <thead className="bg-card">
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="p-2">#</th><th className="p-2">Vendor</th>
                <th className="p-2">Period</th><th className="p-2">Status</th>
                <th className="p-2 text-right">Gross</th><th className="p-2 text-right">Net</th>
                <th className="p-2">Reference</th><th className="p-2 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border" data-testid={`admin-vs-payout-${p.id}`}>
                  <td className="p-2 font-mono">#{p.number}</td>
                  <td className="p-2 font-mono text-[11px]">{p.restaurant_id}</td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(p.period_start).toLocaleDateString()} → {new Date(p.period_end).toLocaleDateString()}
                  </td>
                  <td className="p-2 font-semibold">{p.status}</td>
                  <td className="p-2 text-right font-mono">{fmt(p.gross, p.currency)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{fmt(p.net, p.currency)}</td>
                  <td className="p-2 font-mono text-[11px]">{p.reference || "—"}</td>
                  <td className="p-2">
                    {p.status === "scheduled" && (
                      <>
                        <button onClick={() => markPaid(p.id)}
                                data-testid={`admin-vs-pay-${p.id}`}
                                className="text-[11px] text-[#00A651] font-semibold mr-2">Pay</button>
                        <button onClick={() => hold(p.id)}
                                data-testid={`admin-vs-hold-${p.id}`}
                                className="text-[11px] text-amber-600">Hold</button>
                      </>
                    )}
                    {p.status === "hold" && (
                      <button onClick={() => release(p.id)}
                              data-testid={`admin-vs-release-${p.id}`}
                              className="text-[11px] text-[#00A651] font-semibold">Release</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------------------
// Vendors tab
// -------------------------------------------------------------------------
const VendorsTab = () => {
  const [q, setQ]       = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openR, setOpenR] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/food/restaurants");
      setRows(data.items || data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    rows.filter((r) => !q || (r.name || "").toLowerCase().includes(q.toLowerCase())),
    [rows, q]);

  return (
    <div className="space-y-3" data-testid="admin-vs-vendors-tab">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search restaurants"
                 data-testid="admin-vs-vendor-search"
                 className="h-9 rounded border border-border bg-background pl-7 pr-3 text-xs min-w-[220px]" />
        </div>
        <span className="text-[11px] text-muted-foreground">{filtered.length} vendor(s)</span>
      </div>
      {loading && <div className="py-6 flex justify-center"><Loader2 className="animate-spin" /></div>}
      {!loading && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-card">
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="p-2">Restaurant</th><th className="p-2">Country</th>
                <th className="p-2">Status</th><th className="p-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid={`admin-vs-vendor-row-${r.id}`}>
                  <td className="p-2 font-semibold">{r.name}</td>
                  <td className="p-2">{r.country}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => setOpenR(r)}
                            data-testid={`admin-vs-vendor-open-${r.id}`}
                            className="h-7 px-3 rounded bg-foreground text-background text-[11px] font-semibold">
                      Settlement
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openR && <RestaurantDrawer restaurant={openR} onClose={() => setOpenR(null)} />}
    </div>
  );
};

// -------------------------------------------------------------------------
// Page shell
// -------------------------------------------------------------------------
export const AdminVendorSettlement = () => {
  const [tab, setTab] = useState("vendors");
  return (
    <div className="space-y-5" data-testid="admin-vs-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Vendor Settlement</h1>
          <p className="text-xs text-muted-foreground">
            Negotiated commissions and payout schedules per restaurant. Changes never recalculate historical orders.
          </p>
        </div>
        <div className="flex gap-2">
          {[
            { k: "vendors", l: "Vendors" },
            { k: "payouts", l: "Payouts" },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
                    data-testid={`admin-vs-tab-${t.k}`}
                    className={`h-9 px-3 rounded-full text-xs font-semibold ${
                      tab === t.k ? "bg-foreground text-background" : "bg-card border border-border"
                    }`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>
      {tab === "vendors" && <VendorsTab />}
      {tab === "payouts" && <PayoutsTab />}
    </div>
  );
};

export default AdminVendorSettlement;
