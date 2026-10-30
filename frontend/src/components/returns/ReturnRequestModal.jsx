/**
 * ReturnRequestModal — unified "Signaler un problème / Report an issue" wizard.
 *
 * Props:
 *   orderId      : string
 *   orderModule  : "food" | "mart" | "shop"
 *   orderNumber? : string (for display)
 *   onClose      : () => void
 *   onCreated?   : (ret) => void
 *
 * The modal:
 *   1. Hits /api/returns/eligibility to confirm the window is still open.
 *   2. Lets the diner pick a reason + optional items + evidence URLs.
 *   3. Offers Wallet (default) vs Original payment method.
 *   4. Submits POST /api/returns and shows the resolved status / amount.
 *
 * French-first; English only when i18n language is EN.
 */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { X, Loader2, Check, AlertTriangle, Camera, Wallet2, CreditCard } from "lucide-react";

const API   = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const REASON_CODES = [
  { code: "missing_item",   fr: "Article manquant",            en: "Missing item" },
  { code: "wrong_item",     fr: "Mauvais article",             en: "Wrong item",       requiresPhoto: true },
  { code: "wrong_order",    fr: "Mauvaise commande",           en: "Wrong order" },
  { code: "cold_food",      fr: "Nourriture froide",           en: "Cold food" },
  { code: "poor_quality",   fr: "Mauvaise qualité",            en: "Poor quality",     requiresPhoto: true },
  { code: "damaged",        fr: "Produit endommagé",           en: "Damaged packaging", requiresPhoto: true },
  { code: "late_delivery",  fr: "Livraison en retard",         en: "Late delivery" },
  { code: "changed_mind",   fr: "Changement d'avis",           en: "Changed mind" },
  { code: "other",          fr: "Autre",                       en: "Other" },
];

const fmtMoney = (v, c) => `${Math.round(Number(v || 0)).toLocaleString()} ${c || ""}`;

const ReturnRequestModal = ({ orderId, orderModule, orderNumber, onClose, onCreated }) => {
  const { i18n } = useTranslation("customer");
  const fr = (i18n.language || "fr").toLowerCase().startsWith("fr");

  const [loading, setLoading]       = useState(true);
  const [eligibility, setElig]      = useState(null);
  const [reasonCode, setReason]     = useState("");
  const [reasonText, setText]       = useState("");
  const [evidence, setEvidence]     = useState("");
  const [destination, setDest]      = useState("wallet");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/returns/eligibility`, {
          headers: authHeaders(),
          params: { order_id: orderId, order_module: orderModule },
        });
        setElig(data);
      } catch {
        setElig({ can_return: false, reason: "load_error" });
      } finally { setLoading(false); }
    })();
  }, [orderId, orderModule]);

  const reason = useMemo(() => REASON_CODES.find((r) => r.code === reasonCode), [reasonCode]);
  const photoRequired = Boolean(reason?.requiresPhoto);
  const canSubmit = reasonCode && (!photoRequired || evidence.trim().length > 0) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API}/api/returns`, {
        order_id: orderId,
        order_module: orderModule,
        reason_code: reasonCode,
        reason_text: reasonText || null,
        refund_destination: destination,
        evidence_urls: evidence.trim() ? [evidence.trim()] : [],
      }, { headers: { ...authHeaders(), "Content-Type": "application/json" } });
      setDone(data);
      onCreated?.(data);
    } catch (e) {
      const detail = e?.response?.data?.detail || "unknown";
      toast.error(fr ? `Erreur: ${detail}` : `Error: ${detail}`);
    } finally { setSubmitting(false); }
  };

  // ----- Render ------------------------------------------------------------
  const Shell = ({ children }) => (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4"
      data-testid="return-request-modal"
    >
      <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-2xl max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {fr ? "Retour & Remboursement" : "Return & Refund"}
            </div>
            <h3 className="text-base font-bold">
              {fr ? "Signaler un problème" : "Report an issue"}
              {orderNumber && <span className="text-xs font-mono text-muted-foreground ml-2">#{orderNumber}</span>}
            </h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
                  data-testid="return-modal-close">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );

  if (loading) {
    return <Shell><div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div></Shell>;
  }

  if (done) {
    const statusLabel = {
      refunded:                 fr ? "Remboursé en portefeuille" : "Refunded to wallet",
      approved:                 fr ? "Approuvé" : "Approved",
      approved_pending_payout:  fr ? "Approuvé — remboursement en cours" : "Approved — refund processing",
      awaiting_partner:         fr ? "En attente du restaurant" : "Awaiting partner",
      awaiting_admin:           fr ? "En attente de l'équipe BAKĒD" : "Awaiting BAKĒD team",
    }[done.status] || done.status;
    return (
      <Shell>
        <div className="text-center py-6" data-testid="return-done-card">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
            <Check size={28} />
          </div>
          <div className="mt-3 font-semibold text-base">{fr ? "Demande enregistrée" : "Request submitted"}</div>
          <div className="text-xs text-muted-foreground mt-1 font-mono">#{done.number}</div>
          <div className="mt-4 text-sm">{statusLabel}</div>
          {done.approved_amount && (
            <div className="text-lg font-bold mt-1">{fmtMoney(done.approved_amount, "XOF")}</div>
          )}
          {done.auto_approved && (
            <div className="mt-3 text-[11px] text-muted-foreground max-w-sm mx-auto">
              {fr ? "Votre demande a été approuvée automatiquement. Le montant est crédité instantanément."
                  : "Your claim was auto-approved. Funds are credited instantly."}
            </div>
          )}
          <button onClick={onClose} className="mt-5 h-10 px-5 rounded-xl text-sm font-semibold text-black" style={{ backgroundColor: GREEN }}
                  data-testid="return-done-ok">
            {fr ? "OK" : "OK"}
          </button>
        </div>
      </Shell>
    );
  }

  if (!eligibility?.can_return) {
    const whyMap = {
      not_delivered:   fr ? "Cette commande n'est pas encore livrée." : "This order isn't delivered yet.",
      not_returnable:  fr ? "Les retours ne sont pas disponibles pour cette commande." : "Returns aren't available for this order.",
    };
    const reasonLabel = eligibility?.window_closed
      ? (fr ? "Le délai de retour est écoulé." : "The return window has closed.")
      : (whyMap[eligibility?.reason] || (fr ? "Non éligible au retour." : "Not eligible for return."));
    return (
      <Shell>
        <div className="text-center py-5" data-testid="return-ineligible">
          <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-amber-100 text-amber-600">
            <AlertTriangle size={22} />
          </div>
          <div className="mt-3 text-sm font-semibold">{reasonLabel}</div>
          {eligibility?.already_open && (
            <div className="text-[11px] text-muted-foreground mt-1">
              {fr ? "Une demande est déjà en cours pour cette commande." : "A request is already open for this order."}
            </div>
          )}
          <a
            href="mailto:support@baked.africa"
            data-testid="return-contact-support"
            className="inline-flex mt-5 h-10 px-5 items-center rounded-xl text-sm font-semibold border border-border hover:bg-secondary"
          >
            {fr ? "Contacter l'assistance" : "Contact Support"}
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-xs text-muted-foreground">
          {fr ? "Fermeture du délai :" : "Window closes:"}{" "}
          <span className="font-mono">
            {new Date(eligibility.window_closes_at).toLocaleString(fr ? "fr-FR" : "en-GB",
              { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Reason selection */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {fr ? "Motif" : "Reason"}
          </div>
          <div className="grid grid-cols-2 gap-2" data-testid="return-reason-grid">
            {REASON_CODES.map((r) => (
              <button
                key={r.code}
                onClick={() => setReason(r.code)}
                data-testid={`return-reason-${r.code}`}
                className={`text-left px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  reasonCode === r.code ? "border-[color:var(--food-accent)] bg-[color:var(--food-accent)]/10"
                                        : "border-border bg-card hover:bg-secondary"
                }`}
                style={{ "--food-accent": GREEN }}
              >
                {fr ? r.fr : r.en}
                {r.requiresPhoto && (
                  <span className="block text-[9px] text-muted-foreground mt-0.5">
                    {fr ? "Photo requise" : "Photo required"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Evidence */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <Camera size={12} />
            {fr ? "Photo (URL)" : "Photo (URL)"}
            {photoRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type="url"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="https://…"
            data-testid="return-evidence-url"
            className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">
            {fr ? "Détails (optionnel)" : "Details (optional)"}
          </label>
          <textarea
            rows={3}
            value={reasonText}
            onChange={(e) => setText(e.target.value)}
            placeholder={fr ? "Décrivez brièvement ce qui s'est passé…" : "Briefly describe what happened…"}
            data-testid="return-reason-text"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Destination */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {fr ? "Remboursement vers" : "Refund to"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDest("wallet")}
              data-testid="return-dest-wallet"
              className={`px-3 py-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 ${
                destination === "wallet" ? "border-[color:var(--food-accent)] bg-[color:var(--food-accent)]/10"
                                         : "border-border bg-card"
              }`}
              style={{ "--food-accent": GREEN }}
            >
              <Wallet2 size={16} />
              {fr ? "Portefeuille BAKĒD" : "BAKĒD Wallet"}
              <span className="text-[9px] text-muted-foreground font-normal">
                {fr ? "Instantané" : "Instant"}
              </span>
            </button>
            <button
              onClick={() => setDest("original")}
              data-testid="return-dest-original"
              className={`px-3 py-3 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 ${
                destination === "original" ? "border-[color:var(--food-accent)] bg-[color:var(--food-accent)]/10"
                                           : "border-border bg-card"
              }`}
              style={{ "--food-accent": GREEN }}
            >
              <CreditCard size={16} />
              {fr ? "Moyen initial" : "Original method"}
              <span className="text-[9px] text-muted-foreground font-normal">
                {fr ? "3–5 jours" : "3–5 days"}
              </span>
            </button>
          </div>
        </div>

        {/* Auto-approve hint */}
        {eligibility.auto_approve_threshold && (
          <div className="text-[11px] text-muted-foreground rounded-lg bg-card border border-border px-3 py-2">
            {fr
              ? `Les remboursements inférieurs à ${fmtMoney(eligibility.auto_approve_threshold, eligibility.threshold_currency)} sont approuvés instantanément.`
              : `Refunds below ${fmtMoney(eligibility.auto_approve_threshold, eligibility.threshold_currency)} are approved instantly.`}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          data-testid="return-submit"
          className="w-full h-11 rounded-xl text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: GREEN }}
        >
          {submitting
            ? (fr ? "Envoi…" : "Submitting…")
            : (fr ? "Envoyer la demande" : "Submit request")}
        </button>
      </div>
    </Shell>
  );
};

export default ReturnRequestModal;
