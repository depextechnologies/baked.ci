/**
 * ReviewModal — customer-side "Laisser un avis" form.
 *
 * Props:
 *   context   = { kind: "order"|"reservation", id, restaurant_name, restaurant_slug }
 *   onClose   = fn
 *   onSubmit  = fn(review) — called after successful publish
 *
 * The parent hands us EITHER an order_id or a reservation_id. Backend runs
 * ownership + status guards, so we don't duplicate them here.
 */
import React, { useState } from "react";
import axios from "axios";
import { Star, Loader2, X, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const T = {
  fr: {
    title: "Laisser un avis",
    subtitle_order: "Votre commande {{r}}",
    subtitle_visit: "Votre visite chez {{r}}",
    rating_label: "Note globale",
    detail_label: "Détails (facultatif)",
    food: "Cuisine",
    service: "Service",
    ambience: "Ambiance",
    value: "Rapport qualité-prix",
    text_placeholder: "Racontez votre expérience aux futurs clients…",
    submit: "Publier mon avis",
    cancel: "Annuler",
    verified_order: "Commande vérifiée",
    verified_visit: "Visite vérifiée",
    thanks_title: "Merci !",
    thanks_body_published: "Votre avis est publié.",
    thanks_body_moderation: "Votre avis est en cours de vérification par notre équipe.",
    close: "Fermer",
  },
  en: {
    title: "Leave a review",
    subtitle_order: "Your order at {{r}}",
    subtitle_visit: "Your visit to {{r}}",
    rating_label: "Overall rating",
    detail_label: "Details (optional)",
    food: "Food",
    service: "Service",
    ambience: "Ambience",
    value: "Value for money",
    text_placeholder: "Tell future diners what you thought…",
    submit: "Publish my review",
    cancel: "Cancel",
    verified_order: "Verified order",
    verified_visit: "Verified visit",
    thanks_title: "Thanks!",
    thanks_body_published: "Your review is live.",
    thanks_body_moderation: "Your review is under review by our team.",
    close: "Close",
  },
};

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const useDict = () => {
  const [lang] = useState(() => (localStorage.getItem("i18nextLng") || "fr").toLowerCase().startsWith("fr") ? "fr" : "en");
  return { lang, t: T[lang] };
};

export const ReviewModal = ({ context, onClose, onSubmit }) => {
  const { t } = useDict();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [sub, setSub] = useState({ food: 0, service: 0, ambience: 0, value: 0 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // {status}

  const submit = async () => {
    if (rating < 1) { setErr(t.rating_label); return; }
    setBusy(true); setErr("");
    const payload = { rating, text: text.trim() || null };
    ["food", "service", "ambience", "value"].forEach((k) => {
      if (sub[k] > 0) payload[`${k}_rating`] = sub[k];
    });
    if (context.kind === "order") payload.order_id = context.id;
    else                          payload.reservation_id = context.id;
    try {
      const { data } = await axios.post(`${API}/api/food/customer/reviews`, payload, { headers: authHeaders() });
      setDone({ status: data.status });
      if (onSubmit) onSubmit(data);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally { setBusy(false); }
  };

  const isOrder = context.kind === "order";
  const subtitle = (isOrder ? t.subtitle_order : t.subtitle_visit).replace("{{r}}", context.restaurant_name || "");

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="review-modal" translate="no">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{done ? t.thanks_title : t.title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
              <CheckCircle2 size={10} /> {isOrder ? t.verified_order : t.verified_visit}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" data-testid="review-modal-close"><X size={18} /></button>
        </div>

        {done ? (
          <div className="text-sm space-y-3" data-testid="review-modal-thanks">
            <div className="rounded-xl border p-4" style={{ borderColor: GREEN, backgroundColor: `${GREEN}0f` }}>
              {done.status === "published" ? t.thanks_body_published : t.thanks_body_moderation}
            </div>
            <button onClick={onClose}
                    className="h-10 px-4 rounded-full text-black font-semibold text-sm"
                    style={{ backgroundColor: GREEN }}
                    data-testid="review-modal-close-thanks">{t.close}</button>
          </div>
        ) : (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{t.rating_label}</div>
              <StarRow value={rating} onChange={setRating} size={26} testId="review-rating-main" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[["food", t.food], ["service", t.service], ["ambience", t.ambience], ["value", t.value]].map(([k, label]) => (
                <div key={k}>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
                  <StarRow value={sub[k]} onChange={(v) => setSub({ ...sub, [k]: v })} size={16} testId={`review-rating-${k}`} />
                </div>
              ))}
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.detail_label}</div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000}
                        className="mt-1 w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                        placeholder={t.text_placeholder}
                        data-testid="review-text" />
              <div className="text-[10px] text-muted-foreground text-right mt-1">{text.length}/1000</div>
            </div>

            {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {String(err)}</div>}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={submit} disabled={busy || rating < 1}
                      className="h-10 px-5 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50"
                      style={{ backgroundColor: GREEN }}
                      data-testid="review-submit">
                {busy && <Loader2 size={12} className="animate-spin" />} {t.submit}
              </button>
              <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground" data-testid="review-cancel">{t.cancel}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StarRow = ({ value, onChange, size = 22, testId }) => (
  <div className="inline-flex gap-1" data-testid={testId}>
    {[1, 2, 3, 4, 5].map((i) => (
      <button key={i} type="button" onClick={() => onChange(i)}
              className="focus:outline-none"
              data-testid={`${testId}-star-${i}`}>
        <Star size={size}
              fill={i <= value ? "#f59e0b" : "none"}
              stroke={i <= value ? "#f59e0b" : "#a1a1aa"} />
      </button>
    ))}
  </div>
);

export default ReviewModal;
