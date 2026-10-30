/**
 * PartnerReservationsDashboard — activation status hub + checklist + counts.
 *
 * Route: /partner/food/reservations (index).
 * Shows:
 *   • Post-approval banner "Configurez les réservations" when
 *     reservations_enabled && !reservation_public.
 *   • Live checklist of the minimum config remaining (hours, slots,
 *     party size, capacity/tables).
 *   • Pending / today / upcoming counts (from /reservations list API).
 *   • "Activer les réservations" CTA — only enabled when all checklist
 *     items pass.
 *   • Deep links to Bookings, Settings, Floor & Tables sub-pages.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, Loader2, CalendarClock, Settings, LayoutGrid, ListChecks, Power } from "lucide-react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";
import { useRestaurantNotifications } from "../components/RestaurantNotificationEngine";

const GREEN = "#00A651";

const CHECKLIST_LABELS = {
  fr: {
    hours:    "Jours et horaires de réservation configurés",
    slots:    "Créneaux configurés (15/30/60 min)",
    party:    "Taille de groupe min/max configurée",
    capacity: "Capacité configurée (au moins une table active ou capacité par créneau)",
  },
  en: {
    hours:    "Reservation days and hours configured",
    slots:    "Slots configured (15/30/60 min)",
    party:    "Min/max party size configured",
    capacity: "Capacity configured (at least one active table or slot capacity)",
  },
};

const T = {
  fr: {
    title: "Réservations",
    subtitle: "Vue d'ensemble et activation",
    banner_title: "Les réservations sont disponibles pour votre restaurant.",
    banner_body: "Configurez vos horaires, vos tables et vos disponibilités pour activer la réservation en ligne.",
    banner_cta: "Configurer les réservations",
    incomplete: "Terminez la configuration des réservations avant de les rendre disponibles aux clients.",
    active_title: "Réservations en ligne actives",
    active_body: "Les clients peuvent réserver une table sur la fiche restaurant.",
    activate: "Activer les réservations",
    deactivate: "Désactiver les réservations",
    settings: "Paramètres",
    floor: "Espaces et tables",
    bookings: "Demandes de réservation",
    counts_pending: "En attente",
    counts_today: "Aujourd'hui",
    counts_upcoming: "À venir",
    checklist_title: "Configuration minimale",
    active_tables_line: "{{tables}} table(s) active(s), {{seats}} places",
  },
  en: {
    title: "Reservations",
    subtitle: "Overview & activation",
    banner_title: "Reservations are available for your restaurant.",
    banner_body: "Configure your hours, tables and availability to activate online reservations.",
    banner_cta: "Configure Reservations",
    incomplete: "Complete your reservation setup before making reservations available to customers.",
    active_title: "Online reservations are active",
    active_body: "Customers can book a table from your restaurant page.",
    activate: "Activate Reservations",
    deactivate: "Deactivate Reservations",
    settings: "Settings",
    floor: "Floor & Tables",
    bookings: "Booking requests",
    counts_pending: "Pending",
    counts_today: "Today",
    counts_upcoming: "Upcoming",
    checklist_title: "Minimum configuration",
    active_tables_line: "{{tables}} active table(s), {{seats}} seats",
  },
};

const useLangDict = () => {
  const [lang] = useState(() => {
    const v = (localStorage.getItem("i18nextLng") || "fr").toLowerCase();
    return v.startsWith("fr") ? "fr" : "en";
  });
  return { lang, t: T[lang] };
};

export const PartnerReservationsDashboard = () => {
  const { restaurant } = useFoodPartner() || {};
  const { updatesVersion } = useRestaurantNotifications() || {};
  const { lang, t } = useLangDict();
  const [status, setStatus] = useState(null);
  const [counts, setCounts] = useState({ pending: 0, today: 0, upcoming: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true); setErr("");
    try {
      const [sRes, rRes] = await Promise.all([
        partnerApi.get(`/food/manage/${restaurant.id}/reservation-status`),
        partnerApi.get(`/food/manage/${restaurant.id}/reservations`),
      ]);
      setStatus(sRes.data);
      setCounts(rRes.data.counts || counts);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Error");
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  useEffect(() => { load(); }, [load, updatesVersion]);

  const activate = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await partnerApi.post(`/food/manage/${restaurant.id}/reservation-activate`);
      setStatus(data);
    } catch (e) {
      const d = e.response?.data?.detail;
      if (typeof d === "object" && d?.checklist) setStatus(d.checklist);
      setErr(typeof d === "string" ? d : (t.incomplete));
    } finally { setBusy(false); }
  };

  const deactivate = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await partnerApi.post(`/food/manage/${restaurant.id}/reservation-deactivate`);
      setStatus(data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Error");
    } finally { setBusy(false); }
  };

  if (!restaurant) return null;
  const isEnabled = !!status?.enabled;
  const isPublic  = !!status?.public;
  const allOk     = !!status?.all_ok;

  return (
    <div className="space-y-6" data-testid="partner-reservations-dashboard">
      <div>
        <h1 className="text-2xl font-bold" translate="no">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {!isEnabled && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="partner-reservations-capability-off">
          {lang === "fr"
            ? "La capacité de réservation n'est pas activée pour votre restaurant. Contactez l'équipe FOODbakēd si vous souhaitez l'activer."
            : "Reservation capability is not enabled for your restaurant. Contact the FOODbakēd team to enable it."}
        </div>
      )}

      {isEnabled && !isPublic && (
        <div className="rounded-2xl border p-5" style={{ borderColor: GREEN, backgroundColor: `${GREEN}0f` }} data-testid="partner-reservations-approval-banner">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="text-base font-semibold">{t.banner_title}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.banner_body}</div>
            </div>
            <Link to="/partner/food/reservations/settings"
                  className="h-10 px-4 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
                  style={{ backgroundColor: GREEN }}
                  data-testid="partner-reservations-configure-cta">
              <Settings size={14} /> {t.banner_cta}
            </Link>
          </div>
        </div>
      )}

      {isEnabled && isPublic && (
        <div className="rounded-2xl border p-5" style={{ borderColor: GREEN, backgroundColor: `${GREEN}0f` }} data-testid="partner-reservations-active-banner">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="text-base font-semibold inline-flex items-center gap-2"><CheckCircle2 size={16} style={{ color: GREEN }} /> {t.active_title}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.active_body}</div>
            </div>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label={t.counts_pending}  value={counts.pending}  color="#f59e0b" testId="dashboard-count-pending"  />
        <StatTile label={t.counts_today}    value={counts.today}    color={GREEN}   testId="dashboard-count-today"    />
        <StatTile label={t.counts_upcoming} value={counts.upcoming} color="#3b82f6" testId="dashboard-count-upcoming" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5" data-testid="partner-reservations-checklist">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm font-semibold inline-flex items-center gap-2"><ListChecks size={16} /> {t.checklist_title}</div>
          {isEnabled && !isPublic && allOk && (
            <button onClick={activate} disabled={busy || !allOk}
                    className="h-9 px-4 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: GREEN }}
                    data-testid="partner-reservations-activate-btn">
              {busy && <Loader2 size={12} className="animate-spin" />} <Power size={12} /> {t.activate}
            </button>
          )}
          {isEnabled && isPublic && (
            <button onClick={deactivate} disabled={busy}
                    className="h-9 px-4 rounded-full text-xs bg-red-500/10 text-red-500 font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                    data-testid="partner-reservations-deactivate-btn">
              {busy && <Loader2 size={12} className="animate-spin" />} <Power size={12} /> {t.deactivate}
            </button>
          )}
        </div>
        {isEnabled && !isPublic && !allOk && (
          <div className="mt-2 text-xs text-red-500" data-testid="partner-reservations-incomplete-msg">{t.incomplete}</div>
        )}
        <ul className="mt-4 space-y-2">
          {loading ? (
            <li className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> …</li>
          ) : (status?.items || []).map((it) => (
            <li key={it.key} className="flex items-center gap-2 text-sm" data-testid={`partner-reservations-check-${it.key}`}>
              {it.ok ? <CheckCircle2 size={14} style={{ color: GREEN }} /> : <Circle size={14} className="text-muted-foreground" />}
              <span className={it.ok ? "" : "text-muted-foreground"}>{CHECKLIST_LABELS[lang][it.key]}</span>
            </li>
          ))}
        </ul>
        {status && (
          <div className="mt-4 text-[11px] text-muted-foreground">
            {t.active_tables_line.replace("{{tables}}", status.active_tables).replace("{{seats}}", status.total_seats)}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <QuickCard to="/partner/food/reservations/bookings" icon={CalendarClock} label={t.bookings} testId="dashboard-link-bookings" />
        <QuickCard to="/partner/food/reservations/floor"    icon={LayoutGrid}    label={t.floor}    testId="dashboard-link-floor" />
        <QuickCard to="/partner/food/reservations/settings" icon={Settings}      label={t.settings} testId="dashboard-link-settings" />
      </div>
    </div>
  );
};

const StatTile = ({ label, value, color, testId }) => (
  <div className="rounded-2xl border border-border bg-card p-4" data-testid={testId}>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
  </div>
);

const QuickCard = ({ to, icon: Icon, label, testId }) => (
  <Link to={to} className="rounded-2xl border border-border bg-card p-4 hover:bg-secondary/60 transition-colors inline-flex items-center gap-3" data-testid={testId}>
    <div className="h-9 w-9 rounded-lg bg-secondary/60 inline-flex items-center justify-center"><Icon size={16} /></div>
    <div className="text-sm font-semibold">{label}</div>
  </Link>
);

export default PartnerReservationsDashboard;
