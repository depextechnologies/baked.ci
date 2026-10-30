/**
 * PartnerPauseCard — Phase 4 delivery/pickup pause control.
 *
 * Lets the restaurant partner pause taking NEW orders for a service for
 * 15 min / 30 min / 1 h / until manual. Independent toggles for delivery
 * and pickup so a kitchen that runs out of a delivery driver can keep
 * accepting pickup orders.
 *
 * Live state via `/food/manage/{rid}/service-status`. Writes via
 * `/food/manage/{rid}/pause` + `/resume`. A WS `food.service.paused` /
 * `food.service.resumed` frame also arrives from the notification engine
 * when another device of the same partner toggles — we re-fetch on that
 * event to stay in sync.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, Bike, ShoppingBag, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { partnerApi } from "../../../contexts/FoodPartnerContext";
import { useRestaurantNotifications } from "./RestaurantNotificationEngine";

const GREEN = "#00A651";
const AMBER = "#F59E0B";

const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

const PRESETS = [
  { label_fr: "15 min",         label_en: "15 min",      minutes: 15 },
  { label_fr: "30 min",         label_en: "30 min",      minutes: 30 },
  { label_fr: "1 heure",        label_en: "1 hour",      minutes: 60 },
  { label_fr: "Jusqu'à reprise", label_en: "Until I resume", minutes: 0 },
];

const SERVICES = [
  { key: "delivery", label_fr: "Livraison", label_en: "Delivery", icon: Bike },
  { key: "pickup",   label_fr: "À emporter",label_en: "Pickup",   icon: ShoppingBag },
];

const _fmtCountdown = (iso) => {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  if (target <= now) return null;
  const secs = Math.floor((target - now) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
};

const PartnerPauseCard = ({ restaurantId }) => {
  const isFr = detectFr();
  const { updatesVersion } = useRestaurantNotifications();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");  // "delivery" / "pickup" when a write is in flight
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);   // forces re-render for the countdown every second

  const fetchStatus = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurantId}/service-status`);
      setStatus(data); setErr("");
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    }
  }, [restaurantId, isFr]);

  // Re-fetch when the WS fires a pause/resume frame from another device.
  useEffect(() => { fetchStatus(); }, [fetchStatus, updatesVersion]);

  // Countdown ticker — a single setInterval that only runs while a pause
  // is active, to avoid a 1 Hz re-render for every partner forever.
  useEffect(() => {
    if (!status) return;
    const anyActive = status.delivery_paused || status.pickup_paused;
    if (!anyActive) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const pause = async (service, minutes) => {
    setBusy(service); setErr("");
    try {
      const { data } = await partnerApi.post(`/food/manage/${restaurantId}/pause`, { service, minutes });
      setStatus(data);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    } finally { setBusy(""); }
  };

  const resume = async (service) => {
    setBusy(service); setErr("");
    try {
      const { data } = await partnerApi.post(`/food/manage/${restaurantId}/resume`, { service, minutes: 0 });
      setStatus(data);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    } finally { setBusy(""); }
  };

  const anyPaused = status?.delivery_paused || status?.pickup_paused;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4" data-testid="partner-pause-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Pause size={16} />
            {isFr ? "Pause du service" : "Service pause"}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isFr
              ? "Mettez en pause la prise de NOUVELLES commandes. Les commandes acceptées continuent normalement."
              : "Pause NEW orders. Already-accepted orders keep flowing."}
          </p>
        </div>
        {anyPaused && (
          <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded"
                style={{ background: `${AMBER}22`, color: AMBER }}
                data-testid="partner-pause-badge">
            {isFr ? "En pause" : "Paused"}
          </span>
        )}
      </div>

      {err && (
        <div className="text-xs text-red-500 inline-flex items-center gap-1">
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {SERVICES.map((svc) => {
          const Icon = svc.icon;
          const key  = svc.key;
          const paused = !!(status && status[`${key}_paused`]);
          const until  = status && status[`${key}_paused_until`];
          void tick;  // referenced so the useEffect re-render ticks the countdown
          const countdown = paused && until ? _fmtCountdown(until) : null;
          return (
            <div key={key} className="rounded-xl border border-border p-3 bg-background/40 space-y-3"
                 data-testid={`partner-pause-service-${key}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold inline-flex items-center gap-2">
                  <Icon size={14} /> {isFr ? svc.label_fr : svc.label_en}
                </div>
                <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded ${paused ? "" : ""}`}
                      style={paused ? { background: `${AMBER}22`, color: AMBER } : { background: `${GREEN}22`, color: GREEN }}
                      data-testid={`partner-pause-${key}-badge`}>
                  {paused ? (isFr ? "En pause" : "Paused") : (isFr ? "Actif" : "Active")}
                </span>
              </div>
              {paused ? (
                <div className="space-y-2">
                  {countdown ? (
                    <div className="text-xs inline-flex items-center gap-1 text-muted-foreground">
                      <Clock size={12} /> {isFr ? "Reprise dans" : "Resumes in"} <strong className="font-semibold text-foreground">{countdown}</strong>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{isFr ? "Pause manuelle · pas de reprise automatique" : "Manual pause · no auto-resume"}</div>
                  )}
                  <button onClick={() => resume(key)} disabled={busy === key}
                          className="h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1 text-white"
                          style={{ background: GREEN }}
                          data-testid={`partner-pause-${key}-resume`}>
                    {busy === key ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    {isFr ? "Reprendre" : "Resume now"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.minutes}
                            onClick={() => pause(key, p.minutes)}
                            disabled={busy === key}
                            data-testid={`partner-pause-${key}-${p.minutes}`}
                            className="h-8 px-3 rounded-full border border-border text-[11px] font-semibold hover:border-amber-500 hover:text-amber-500 disabled:opacity-50">
                      {busy === key ? <Loader2 size={12} className="animate-spin inline mr-1" /> : <Pause size={12} className="inline mr-1" />}
                      {isFr ? p.label_fr : p.label_en}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PartnerPauseCard;
