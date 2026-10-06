/**
 * PartnerWalletPage — /partner/food/wallet
 *
 * Read-only wallet overview for the restaurant partner.
 *   - KPIs: pending (unsettled delivered orders), eligible balance, paid to-date, next payout.
 *   - Commission + payout schedule info (view-only; changes require contacting BAKĒD).
 *   - Transactions list (order credits, refund debits, payout debits).
 *   - Payouts history.
 *
 * French-first; English only when EN selected.
 */
import React, { useEffect, useMemo, useState } from "react";
import { partnerApi } from "../../../contexts/FoodPartnerContext";
import { useTranslation } from "react-i18next";
import {
  Loader2, Wallet2, Clock, Check, Percent, CalendarClock, Receipt,
  TrendingUp, PauseCircle, ArrowDownRight, ArrowUpRight, HelpCircle,
} from "lucide-react";

const GREEN = "#00A651";

const fmt = (v, c = "XOF") =>
  `${Math.round(Number(v || 0)).toLocaleString()} ${c || ""}`.trim();

const SCHEDULE_LABEL = {
  daily:   { fr: "Quotidien — paiement nocturne",   en: "Daily — night payout" },
  weekly:  { fr: "Hebdomadaire",                    en: "Weekly" },
  monthly: { fr: "Mensuel",                         en: "Monthly" },
  custom:  { fr: "Personnalisé",                    en: "Custom" },
};
const WEEKDAY_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const WEEKDAY_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const describeSchedule = (sched, fr) => {
  if (!sched?.type) return fr ? "Non configuré" : "Not configured";
  const base = (SCHEDULE_LABEL[sched.type] || {})[fr ? "fr" : "en"] || sched.type;
  const cfg = sched.config || {};
  const parts = [base];
  if (sched.type === "weekly" && cfg.weekday !== undefined) {
    parts.push(`· ${(fr ? WEEKDAY_FR : WEEKDAY_EN)[cfg.weekday] || cfg.weekday}`);
  }
  if (sched.type === "monthly" && cfg.day_of_month) {
    parts.push(fr ? `· le ${cfg.day_of_month}` : `· day ${cfg.day_of_month}`);
  }
  if (cfg.time_hhmm) parts.push(`· ${cfg.time_hhmm}`);
  return parts.join(" ");
};

const KPI = ({ label, value, sub, icon: Icon, tone = GREEN, testId }) => (
  <div className="rounded-2xl border border-border bg-card p-4" data-testid={testId}>
    <div className="flex items-center justify-between">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
           style={{ backgroundColor: `${tone}22`, color: tone }}>
        <Icon size={14} />
      </div>
    </div>
    <div className="mt-2 text-xl font-bold">{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
  </div>
);

const TxnKindPill = ({ kind, fr }) => {
  const map = {
    order_net: { fr: "Commande", en: "Order",    tone: GREEN,     icon: ArrowUpRight },
    refund:    { fr: "Remb.",    en: "Refund",   tone: "#EF4444", icon: ArrowDownRight },
    payout:    { fr: "Virement", en: "Payout",   tone: "#3B82F6", icon: ArrowDownRight },
    adjustment:{ fr: "Ajustement", en: "Adj.",   tone: "#F59E0B", icon: ArrowUpRight },
  };
  const m = map[kind] || { fr: kind, en: kind, tone: "#6B7280", icon: ArrowUpRight };
  const Ico = m.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${m.tone}22`, color: m.tone }}
          data-testid={`wallet-txn-kind-${kind}`}>
      <Ico size={10} /> {fr ? m.fr : m.en}
    </span>
  );
};

const PayoutStatus = ({ status, fr }) => {
  const map = {
    scheduled: { fr: "Programmé",     en: "Scheduled", tone: "#3B82F6" },
    hold:      { fr: "En attente",    en: "On hold",   tone: "#F59E0B" },
    paid:      { fr: "Payé",          en: "Paid",      tone: GREEN },
    failed:    { fr: "Échec",         en: "Failed",    tone: "#EF4444" },
    cancelled: { fr: "Annulé",        en: "Cancelled", tone: "#9CA3AF" },
  };
  const m = map[status] || { fr: status, en: status, tone: "#6B7280" };
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${m.tone}22`, color: m.tone }}>
      {fr ? m.fr : m.en}
    </span>
  );
};

const PartnerWalletPage = () => {
  const { i18n } = useTranslation("partner");
  const fr = (i18n.language || "fr").toLowerCase().startsWith("fr");

  const [summary, setSummary] = useState(null);
  const [txns, setTxns]       = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([
        partnerApi.get("/food/partner/wallet/summary"),
        partnerApi.get("/food/partner/wallet/transactions", { params: { limit: 100 } }),
        partnerApi.get("/food/partner/wallet/payouts"),
      ]);
      setSummary(s.data);
      setTxns(t.data.items || []);
      setPayouts(p.data.items || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Load failed");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="py-20 flex justify-center" data-testid="partner-wallet-loading">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (err || !summary) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
           data-testid="partner-wallet-error">
        {fr ? "Impossible de charger le portefeuille." : "Could not load the wallet."}
      </div>
    );
  }

  const commissionValue = summary.commission_rate != null
    ? `${summary.commission_rate}%`
    : (fr ? "Non défini" : "Not set");
  const scheduleText = describeSchedule(summary.payout_schedule, fr);
  const paused = summary.payout_schedule?.is_paused;

  return (
    <div className="space-y-6" data-testid="partner-wallet-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet2 size={22} style={{ color: GREEN }} />
            {fr ? "Portefeuille" : "Wallet"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {fr ? "Suivi de vos revenus, commissions et virements."
                : "Track your earnings, commission and payouts."}
          </p>
        </div>
        {paused && (
          <span className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold"
                data-testid="partner-wallet-paused">
            <PauseCircle size={12} /> {fr ? "Virements en pause" : "Payouts paused"}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4" data-testid="partner-wallet-kpis">
        <KPI testId="partner-wallet-kpi-pending"
             label={fr ? "En attente" : "Pending"}
             value={fmt(summary.pending_amount, summary.currency)}
             sub={fr ? "Commandes livrées non encore réglées"
                     : "Delivered orders not yet in a payout"}
             icon={Clock} tone="#F59E0B" />
        <KPI testId="partner-wallet-kpi-balance"
             label={fr ? "Solde éligible" : "Eligible balance"}
             value={fmt(summary.balance, summary.currency)}
             sub={fr ? "Solde net disponible pour virement"
                     : "Net balance available for payout"}
             icon={Wallet2} />
        <KPI testId="partner-wallet-kpi-paid"
             label={fr ? "Payé à ce jour" : "Paid to-date"}
             value={fmt(summary.paid_to_date, summary.currency)}
             sub={fr ? "Total déjà versé" : "Total paid out so far"}
             icon={Check} tone="#3B82F6" />
        <KPI testId="partner-wallet-kpi-next"
             label={fr ? "Prochain virement" : "Next payout"}
             value={summary.next_payout
               ? fmt(summary.next_payout.net, summary.next_payout.currency)
               : "—"}
             sub={summary.next_payout?.scheduled_for
               ? new Date(summary.next_payout.scheduled_for).toLocaleDateString(fr ? "fr-FR" : "en-GB")
               : (fr ? "Aucun virement programmé" : "No payout scheduled")}
             icon={CalendarClock} tone={GREEN} />
      </div>

      {/* Commercial terms banner (view-only) */}
      <div className="rounded-2xl border border-border bg-card p-4" data-testid="partner-wallet-terms">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} />
          <h2 className="text-sm font-semibold">
            {fr ? "Conditions commerciales" : "Commercial terms"}
          </h2>
          <span className="ml-auto text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <HelpCircle size={11} />
            {fr ? "Contactez BAKĒD pour modifier" : "Contact BAKĒD to change"}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
              {fr ? "Taux de commission" : "Commission rate"}
            </div>
            <div className="text-base font-semibold flex items-center gap-1">
              <Percent size={14} className="opacity-70" />
              <span data-testid="partner-wallet-commission">{commissionValue}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
              {fr ? "Fréquence de virement" : "Payout schedule"}
            </div>
            <div className="text-base font-semibold" data-testid="partner-wallet-schedule">
              {scheduleText}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
              {fr ? "Montant minimum" : "Minimum payout"}
            </div>
            <div className="text-base font-semibold">
              {fmt(summary.payout_schedule?.min_payout_amount || 0, summary.currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-2xl border border-border overflow-hidden" data-testid="partner-wallet-txns-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-card">
          <Receipt size={14} />
          <h2 className="text-sm font-semibold">{fr ? "Transactions" : "Transactions"}</h2>
          <span className="text-[11px] text-muted-foreground ml-2">({txns.length})</span>
        </div>
        {txns.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {fr ? "Aucune transaction." : "No transactions yet."}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-secondary/40">
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="p-2">{fr ? "Date" : "Date"}</th>
                <th className="p-2">{fr ? "Type" : "Kind"}</th>
                <th className="p-2">{fr ? "Description" : "Description"}</th>
                <th className="p-2 text-right">{fr ? "Montant" : "Amount"}</th>
                <th className="p-2 text-right">{fr ? "Solde" : "Balance"}</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const amt = Number(t.amount);
                return (
                  <tr key={t.id} className="border-t border-border" data-testid={`partner-wallet-txn-${t.id}`}>
                    <td className="p-2 text-muted-foreground">
                      {new Date(t.created_at).toLocaleString(fr ? "fr-FR" : "en-GB",
                        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-2"><TxnKindPill kind={t.kind} fr={fr} /></td>
                    <td className="p-2 text-xs">{t.description || "—"}</td>
                    <td className="p-2 text-right font-mono font-semibold"
                        style={{ color: amt >= 0 ? GREEN : "#EF4444" }}>
                      {amt >= 0 ? "+" : ""}{fmt(amt, t.currency)}
                    </td>
                    <td className="p-2 text-right font-mono text-muted-foreground">
                      {fmt(t.balance_after, t.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Payouts */}
      <div className="rounded-2xl border border-border overflow-hidden" data-testid="partner-wallet-payouts-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-card">
          <CalendarClock size={14} />
          <h2 className="text-sm font-semibold">{fr ? "Historique des virements" : "Payouts history"}</h2>
          <span className="text-[11px] text-muted-foreground ml-2">({payouts.length})</span>
        </div>
        {payouts.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {fr ? "Aucun virement pour le moment." : "No payouts yet."}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-secondary/40">
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="p-2">{fr ? "Numéro" : "Number"}</th>
                <th className="p-2">{fr ? "Période" : "Period"}</th>
                <th className="p-2">{fr ? "Statut" : "Status"}</th>
                <th className="p-2 text-right">{fr ? "Brut" : "Gross"}</th>
                <th className="p-2 text-right">{fr ? "Commission" : "Commission"}</th>
                <th className="p-2 text-right">{fr ? "Net" : "Net"}</th>
                <th className="p-2">{fr ? "Référence" : "Reference"}</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-border" data-testid={`partner-wallet-payout-${p.id}`}>
                  <td className="p-2 font-mono">#{p.number}</td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(p.period_start).toLocaleDateString(fr ? "fr-FR" : "en-GB")} →{" "}
                    {new Date(p.period_end).toLocaleDateString(fr ? "fr-FR" : "en-GB")}
                  </td>
                  <td className="p-2"><PayoutStatus status={p.status} fr={fr} /></td>
                  <td className="p-2 text-right font-mono">{fmt(p.gross, p.currency)}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.commission, p.currency)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{fmt(p.net, p.currency)}</td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">{p.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PartnerWalletPage;
