/**
 * PartnerReservationsPage — the restaurant's reservation inbox.
 *
 * Route: /partner/food/reservations. Also mounted in the admin surface
 * under /admin/modules/food/restaurants/{rid}/reservations via the
 * ReservationInbox component below.
 *
 * Uses the shared `useRestaurantNotifications()` hook so real-time
 * updates re-fetch the list without a page refresh.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Filter, Search, Users, Calendar, Phone, Mail, MessageSquare, CheckCircle2, XCircle, Check, X, AlertTriangle, Clock } from "lucide-react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";
import { useRestaurantNotifications } from "../components/RestaurantNotificationEngine";

const GREEN = "#00A651";

const STATUS_MAP = {
  pending:   { fr: "En attente",    en: "Pending",    color: "#f59e0b" },
  confirmed: { fr: "Confirmée",     en: "Confirmed",  color: GREEN },
  rejected:  { fr: "Refusée",       en: "Rejected",   color: "#ef4444" },
  cancelled: { fr: "Annulée",       en: "Cancelled",  color: "#a1a1aa" },
  completed: { fr: "Terminée",      en: "Completed",  color: "#3b82f6" },
  no_show:   { fr: "Non-présenté",  en: "No-show",    color: "#ef4444" },
};
const TABS = [
  { key: "pending",    fr: "À traiter",  en: "Pending" },
  { key: "confirmed",  fr: "Confirmées", en: "Confirmed" },
  { key: "all",        fr: "Toutes",     en: "All" },
];

const fmt = (iso) => new Date(iso).toLocaleString(undefined, {
  weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});
const isoDay = (d) => d.toISOString().slice(0, 10);

export const PartnerReservationsPage = () => {
  const { restaurant } = useFoodPartner() || {};
  const { updatesVersion } = useRestaurantNotifications() || {};
  const [list, setList]         = useState([]);
  const [counts, setCounts]     = useState({ pending: 0, today: 0, upcoming: 0 });
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [tab, setTab]           = useState("pending");
  const [dateFilter, setDateFilter] = useState("");
  const [q, setQ]               = useState("");
  const [busyId, setBusyId]     = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, reason }

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true); setErr("");
    try {
      const params = {};
      if (tab !== "all") params.status = tab;
      if (dateFilter) params.date = dateFilter;
      if (q) params.q = q;
      const { data } = await partnerApi.get(`/food/manage/${restaurant.id}/reservations`, { params });
      setList(data.reservations || []);
      setCounts(data.counts || counts);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setLoading(false); }
  }, [restaurant?.id, tab, dateFilter, q, counts]);

  useEffect(() => { load(); }, [load, updatesVersion]);

  const act = async (id, action, reason) => {
    setBusyId(id); setErr("");
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/reservations/${id}`, { action, reason });
      await load();
      if (rejecting?.id === id) setRejecting(null);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setBusyId(null); }
  };

  if (!restaurant) return null;

  return (
    <div className="space-y-5" data-testid="partner-reservations-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Réservations <span className="text-muted-foreground text-lg font-medium">· Reservations</span></h1>
          <p className="text-sm text-muted-foreground">Gérez les demandes de table en temps réel. · Manage table requests in real time.</p>
        </div>
        <div className="flex gap-3 text-xs">
          <StatChip label="En attente · Pending" value={counts.pending} color="#f59e0b" testId="partner-reservations-count-pending" />
          <StatChip label="Aujourd'hui · Today" value={counts.today} color={GREEN} testId="partner-reservations-count-today" />
          <StatChip label="À venir · Upcoming" value={counts.upcoming} color="#3b82f6" testId="partner-reservations-count-upcoming" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg overflow-hidden border border-border">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`h-9 px-3 text-xs font-semibold ${tab === t.key ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
                    style={tab === t.key ? { backgroundColor: GREEN } : undefined}
                    data-testid={`partner-reservations-tab-${t.key}`}>
              {t.fr} · {t.en}
            </button>
          ))}
        </div>
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
               className="h-9 rounded-lg border border-border bg-secondary/40 px-2 text-xs"
               data-testid="partner-reservations-date" />
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Nom · phone · ref"
                 className="h-9 pl-7 pr-3 rounded-lg border border-border bg-secondary/40 text-xs w-52"
                 data-testid="partner-reservations-search" />
        </div>
        {(dateFilter || q) && (
          <button onClick={() => { setDateFilter(""); setQ(""); }} className="text-xs text-muted-foreground hover:text-foreground" data-testid="partner-reservations-clear">Effacer · Clear</button>
        )}
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="partner-reservations-empty">
          Aucune réservation ici. · Nothing here.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const st = STATUS_MAP[r.status];
            const canConfirm = r.status === "pending";
            const canReject  = r.status === "pending";
            const canCancel  = ["pending", "confirmed"].includes(r.status);
            const canComplete = r.status === "confirmed";
            const canNoShow  = r.status === "confirmed";
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`partner-reservation-${r.id}`}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-sm">{r.guest_name}</div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${st.color}22`, color: st.color }} data-testid={`partner-reservation-status-${r.id}`}>
                        {st.fr} · {st.en}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">{r.booking_reference}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmt(r.reservation_at)}</span>
                      <span className="inline-flex items-center gap-1"><Users size={11} /> {r.party_size}</span>
                      <span className="inline-flex items-center gap-1"><Phone size={11} /> {r.guest_phone}</span>
                      {r.guest_email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {r.guest_email}</span>}
                    </div>
                    {r.notes && <div className="text-[11px] mt-2 italic text-muted-foreground inline-flex items-start gap-1"><MessageSquare size={11} className="mt-0.5" /> {r.notes}</div>}
                    {r.rejection_reason && <div className="text-[11px] mt-1 text-red-500"><em>Motif :</em> {r.rejection_reason}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canConfirm && <ActionBtn onClick={() => act(r.id, "confirm")} busy={busyId === r.id} kind="confirm" testId={`partner-reservation-confirm-${r.id}`}><Check size={12} /> Confirmer</ActionBtn>}
                    {canReject  && <ActionBtn onClick={() => setRejecting({ id: r.id, reason: "" })} busy={busyId === r.id} kind="reject" testId={`partner-reservation-reject-${r.id}`}><X size={12} /> Refuser</ActionBtn>}
                    {canComplete && <ActionBtn onClick={() => act(r.id, "complete")} busy={busyId === r.id} kind="complete" testId={`partner-reservation-complete-${r.id}`}><CheckCircle2 size={12} /> Terminée</ActionBtn>}
                    {canNoShow && <ActionBtn onClick={() => act(r.id, "no_show")} busy={busyId === r.id} kind="noshow" testId={`partner-reservation-noshow-${r.id}`}><Clock size={12} /> No-show</ActionBtn>}
                    {canCancel && !canConfirm && <ActionBtn onClick={() => act(r.id, "cancel")} busy={busyId === r.id} kind="cancel" testId={`partner-reservation-cancel-${r.id}`}><XCircle size={12} /> Annuler</ActionBtn>}
                  </div>
                </div>
                {rejecting?.id === r.id && (
                  <div className="mt-3 rounded-lg bg-secondary/60 p-3 space-y-2" data-testid={`partner-reservation-reject-form-${r.id}`}>
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Motif du refus · Rejection reason</div>
                    <textarea value={rejecting.reason} onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })} rows={2}
                              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs"
                              placeholder="Complet · Fully booked, etc." />
                    <div className="flex gap-2">
                      <button onClick={() => setRejecting(null)} className="h-8 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80">Annuler</button>
                      <button onClick={() => act(r.id, "reject", rejecting.reason.trim() || null)} disabled={busyId === r.id}
                              className="h-8 px-3 rounded-lg text-xs bg-red-500 text-white inline-flex items-center gap-1 disabled:opacity-50">
                        {busyId === r.id && <Loader2 size={11} className="animate-spin" />} Confirmer le refus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatChip = ({ label, value, color, testId }) => (
  <div className="rounded-full px-3 py-1 border border-border bg-card" data-testid={testId}>
    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
    <span className="ml-2 font-bold" style={{ color }}>{value}</span>
  </div>
);

const ActionBtn = ({ children, onClick, busy, kind, testId }) => {
  const styles = {
    confirm:  { backgroundColor: `${GREEN}22`, color: GREEN, hover: "hover:bg-green-500/25" },
    reject:   { backgroundColor: "#ef44441a", color: "#ef4444", hover: "hover:bg-red-500/25" },
    cancel:   { backgroundColor: "#a1a1aa22", color: "#71717a", hover: "hover:bg-secondary/80" },
    complete: { backgroundColor: "#3b82f61a", color: "#3b82f6", hover: "" },
    noshow:   { backgroundColor: "#f973161a", color: "#f97316", hover: "" },
  }[kind] || { backgroundColor: "#a1a1aa22", color: "#71717a", hover: "" };
  return (
    <button onClick={onClick} disabled={busy} data-testid={testId}
            className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 ${styles.hover}`}
            style={{ backgroundColor: styles.backgroundColor, color: styles.color }}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : children}
    </button>
  );
};

export default PartnerReservationsPage;
