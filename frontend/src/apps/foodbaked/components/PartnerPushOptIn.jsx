/**
 * PartnerPushOptIn — Phase 4b wake-the-phone card.
 *
 * One toggle. When enabled:
 *   1. Register the `/sw-partner-push.js` service worker.
 *   2. Prompt the OS for Notification permission.
 *   3. Fetch the VAPID public key from the backend.
 *   4. Call `PushManager.subscribe()` → serialize the result → POST it.
 *
 * The card is also the surface where the partner can:
 *   • see device count (`subscriptions`),
 *   • switch the toggle off (unsubscribes locally + server-side),
 *   • test the push (dispatches a self-ping that confirms end-to-end).
 *
 * We only call `navigator.serviceWorker.register` from inside the handler
 * — never on mount — so the user's gesture is attached and iOS Safari
 * accepts the subsequent notification prompt.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, AlertTriangle, Smartphone, CheckCircle2 } from "lucide-react";
import { partnerApi } from "../../../contexts/FoodPartnerContext";

const GREEN = "#00A651";
const AMBER = "#F59E0B";

const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

// Convert the URL-safe base64 VAPID key the server returns into the
// Uint8Array shape PushManager.subscribe() expects.
const _urlB64ToUint8 = (b64) => {
  const padding = "=".repeat((4 - b64.length % 4) % 4);
  const base = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const SUPPORTED = (typeof window !== "undefined")
  && "serviceWorker" in navigator
  && "PushManager" in window
  && "Notification" in window;

const PartnerPushOptIn = ({ restaurantId }) => {
  const isFr = detectFr();
  const [status, setStatus] = useState(null);        // {configured, subscriptions}
  const [permission, setPermission] = useState(SUPPORTED ? Notification.permission : "unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurantId}/push/status`);
      setStatus(data);
    } catch (_) { /* non-fatal */ }

    if (!SUPPORTED) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-partner-push.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } else {
        setSubscribed(false);
      }
    } catch (_) { setSubscribed(false); }
  }, [restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = async () => {
    setBusy(true); setErr("");
    try {
      // Step 1 — register the service worker.
      const reg = await navigator.serviceWorker.register("/sw-partner-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // Step 2 — ask the OS for notification permission. Safari requires
      // this call to live inside the user-gesture handler, which it does.
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        throw new Error(isFr
          ? "Autorisation refusée dans votre navigateur."
          : "Permission denied in your browser.");
      }

      // Step 3 — fetch our VAPID public key.
      const { data: vp } = await partnerApi.get(`/food/manage/${restaurantId}/push/vapid-public-key`);
      const applicationServerKey = _urlB64ToUint8(vp.public_key);

      // Step 4 — subscribe through the browser push service.
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,                        // required by all push services
        applicationServerKey,
      });

      // Step 5 — persist on the server so our backend can push to it.
      const payload = sub.toJSON();                   // {endpoint, keys:{p256dh,auth}}
      await partnerApi.post(`/food/manage/${restaurantId}/push/subscribe`, {
        endpoint: payload.endpoint,
        keys: payload.keys,
        user_agent: navigator.userAgent,
      });

      setSubscribed(true);
      await refresh();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    } finally { setBusy(false); }
  };

  const unsubscribe = async () => {
    setBusy(true); setErr("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-partner-push.js");
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await partnerApi.post(`/food/manage/${restaurantId}/push/unsubscribe`, { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      await refresh();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || (isFr ? "Erreur" : "Error"));
    } finally { setBusy(false); }
  };

  if (!SUPPORTED) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4" data-testid="partner-push-unsupported">
        <div className="text-sm font-semibold inline-flex items-center gap-2"><BellOff size={14} /> {isFr ? "Push non supporté" : "Push unsupported"}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {isFr
            ? "Votre navigateur ne supporte pas les notifications push. Essayez Chrome, Edge ou Safari (iOS 16.4+)."
            : "Your browser doesn't support push notifications. Try Chrome, Edge or Safari (iOS 16.4+)."}
        </p>
      </div>
    );
  }

  const configured = status?.configured;
  const deviceCount = status?.subscriptions || 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="partner-push-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Bell size={16} /> {isFr ? "Notifications sur le téléphone" : "Phone notifications"}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            {isFr
              ? "Recevez une alerte dès qu'une commande arrive — même quand l'onglet est fermé ou le téléphone verrouillé."
              : "Get a push the second an order lands — even when the tab is closed or your phone is locked."}
          </p>
        </div>
        {subscribed && (
          <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded inline-flex items-center gap-1"
                style={{ background: `${GREEN}22`, color: GREEN }}
                data-testid="partner-push-on-badge">
            <CheckCircle2 size={12} /> {isFr ? "Actif" : "On"}
          </span>
        )}
      </div>

      {!configured && (
        <div className="text-xs text-amber-500 inline-flex items-center gap-1" data-testid="partner-push-unconfigured">
          <AlertTriangle size={12} />
          {isFr
            ? "Le serveur n'est pas configuré pour les push. Contactez l'équipe BAKĒD."
            : "Server not configured for push. Contact the BAKĒD team."}
        </div>
      )}

      {err && (
        <div className="text-xs text-red-500 inline-flex items-center gap-1" data-testid="partner-push-err">
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        {!subscribed ? (
          <button onClick={subscribe}
                  disabled={busy || !configured}
                  data-testid="partner-push-enable"
                  className="h-9 px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-2 text-white disabled:opacity-50"
                  style={{ background: GREEN }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            {isFr ? "Activer les notifications" : "Enable notifications"}
          </button>
        ) : (
          <button onClick={unsubscribe}
                  disabled={busy}
                  data-testid="partner-push-disable"
                  className="h-9 px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-2 bg-secondary disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <BellOff size={14} />}
            {isFr ? "Désactiver sur cet appareil" : "Disable on this device"}
          </button>
        )}
        {deviceCount > 0 && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1" data-testid="partner-push-device-count">
            <Smartphone size={11} /> {deviceCount} {isFr ? `appareil${deviceCount > 1 ? "s" : ""} inscrit${deviceCount > 1 ? "s" : ""}` : `device${deviceCount > 1 ? "s" : ""} subscribed`}
          </span>
        )}
        {permission === "denied" && (
          <span className="text-[11px] text-amber-500" style={{ color: AMBER }}>
            {isFr
              ? "Permission refusée — autorisez les notifications dans les réglages du navigateur."
              : "Permission denied — enable notifications in your browser settings."}
          </span>
        )}
      </div>
    </div>
  );
};

export default PartnerPushOptIn;
