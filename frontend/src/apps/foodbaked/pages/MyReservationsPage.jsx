/**
 * MyReservationsPage — the logged-in customer's reservation history.
 *
 * Route: /foodbaked/reservations/me (mounted in App.jsx).
 * Uses the global Baked customer auth (Authorization: Bearer …). Guest
 * reservations placed with the same phone/email are auto-claimed by the
 * backend on first fetch, so nothing is lost.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Loader2, ChevronLeft, Calendar, Clock, Users, XCircle, CheckCircle2, AlertTriangle, Utensils, Star } from "lucide-react";
import { useAuth } from "../../../contexts/BakedContexts";
import ReviewModal from "../components/ReviewModal";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_MAP = {
  pending:   { fr: "En attente",    en: "Pending",    color: "#f59e0b" },
  confirmed: { fr: "Confirmée",     en: "Confirmed",  color: GREEN },
  rejected:  { fr: "Refusée",       en: "Rejected",   color: "#ef4444" },
  cancelled: { fr: "Annulée",       en: "Cancelled",  color: "#a1a1aa" },
  completed: { fr: "Terminée",      en: "Completed",  color: "#3b82f6" },
  no_show:   { fr: "Non-présenté",  en: "No-show",    color: "#ef4444" },
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const MyReservationsPage = () => {
  const { customer, loading: authLoading } = useAuth() || {};
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reviewedIds, setReviewedIds] = useState(new Set());
  const [eligibleReservationIds, setEligibleReservationIds] = useState(new Set());
  const [reviewCtx, setReviewCtx] = useState(null); // { kind:"reservation", id, restaurant_name }

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await axios.get(`${API}/api/food/customer/reservations`, { headers: authHeaders() });
      setList(data.reservations || []);
      // Eligibility (which reservations still need a review) — best-effort.
      try {
        const el = await axios.get(`${API}/api/food/customer/reviews/eligible`, { headers: authHeaders() });
        const rs = new Set((el.data?.reservations || []).map((r) => r.id));
        setEligibleReservationIds(rs);
      } catch { /* silent */ }
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (customer) load(); }, [customer, load]);

  const cancel = async (id) => {
    if (!window.confirm("Annuler cette réservation ? · Cancel this reservation?")) return;
    setBusyId(id); setErr("");
    try {
      await axios.post(`${API}/api/food/customer/reservations/${id}/cancel`, { reason: "customer" }, { headers: authHeaders() });
      await load();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setBusyId(null); }
  };

  if (authLoading) return <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin mr-2" /> Chargement · Loading…</div>;
  if (!customer) return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="reservations-signin-gate">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-xl font-bold">Se connecter · Sign in</h1>
        <p className="text-sm text-muted-foreground">Connectez-vous pour voir vos réservations. · Sign in to see your reservations.</p>
      </div>
    </div>
  );

  const upcoming = list.filter((r) => ["pending", "confirmed"].includes(r.status));
  const past     = list.filter((r) => !["pending", "confirmed"].includes(r.status));

  return (
    <div className="baked-container py-8 space-y-6" data-testid="my-reservations-page">
      <Link to="/food" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronLeft size={12} /> Retour · Back</Link>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Mes réservations <span className="text-muted-foreground text-lg font-medium">· My reservations</span></h1>
        <p className="text-sm text-muted-foreground">Suivez vos réservations FOODbakēd. · Track your FOODbakēd bookings.</p>
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}
      {loading && <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>}

      {!loading && list.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="reservations-empty">
          Aucune réservation pour l'instant. · No reservations yet.
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-3" data-testid="reservations-upcoming">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">À venir · Upcoming</h2>
          {upcoming.map((r) => (
            <ReservationCard key={r.id} r={r} onCancel={cancel} busy={busyId === r.id} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3" data-testid="reservations-past">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Historique · History</h2>
          {past.map((r) => (
            <ReservationCard key={r.id} r={r} onCancel={cancel} busy={false}
                             canReview={r.status === "completed" && eligibleReservationIds.has(r.id) && !reviewedIds.has(r.id)}
                             alreadyReviewed={r.status === "completed" && !eligibleReservationIds.has(r.id) && !reviewedIds.has(r.id) ? false : reviewedIds.has(r.id)}
                             onReview={() => setReviewCtx({ kind: "reservation", id: r.id, restaurant_name: r.restaurant?.name })} />
          ))}
        </section>
      )}

      {reviewCtx && (
        <ReviewModal context={reviewCtx}
                     onClose={() => setReviewCtx(null)}
                     onSubmit={() => {
                       setReviewedIds(new Set([...reviewedIds, reviewCtx.id]));
                       setEligibleReservationIds((s) => { const n = new Set(s); n.delete(reviewCtx.id); return n; });
                     }} />
      )}
    </div>
  );
};

const ReservationCard = ({ r, onCancel, busy, canReview, alreadyReviewed, onReview }) => {
  const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
  const canCancel = ["pending", "confirmed"].includes(r.status);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4" data-testid={`reservation-card-${r.id}`}>
      <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden shrink-0">
        {r.restaurant?.image && <img src={r.restaurant.image} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-semibold text-sm truncate">{r.restaurant?.name || r.restaurant_id}</div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${st.color}22`, color: st.color }} data-testid={`reservation-status-${r.id}`}>
            {st.fr} · {st.en}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmtDate(r.reservation_at)}</span>
          <span className="inline-flex items-center gap-1"><Users size={11} /> {r.party_size}</span>
          <span className="font-mono">{r.booking_reference}</span>
        </div>
        {r.rejection_reason && <div className="text-[11px] text-red-500 mt-1"><em>Motif :</em> {r.rejection_reason}</div>}
      </div>
      {canReview && (
        <button onClick={onReview} data-testid={`reservation-review-${r.id}`}
                className="h-9 px-3 rounded-lg text-xs font-semibold text-black inline-flex items-center gap-1"
                style={{ backgroundColor: GREEN }}>
          <Star size={12} /> Laisser un avis
        </button>
      )}
      {alreadyReviewed && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }} data-testid={`reservation-reviewed-${r.id}`}>
          <CheckCircle2 size={10} className="inline mr-1" /> Avis publié
        </span>
      )}
      {canCancel && (
        <button onClick={() => onCancel(r.id)} disabled={busy} data-testid={`reservation-cancel-${r.id}`}
                className="h-9 px-3 rounded-lg text-xs font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Annuler
        </button>
      )}
    </div>
  );
};

export default MyReservationsPage;
