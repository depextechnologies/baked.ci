/**
 * FOODbakēd — Restaurant Notification Engine.
 *
 * Shared partner-portal component. Opens ONE WebSocket to
 * `/api/food/manage/{rid}/ws?token=<partner_jwt>` and:
 *
 *   • On {type: "food.reservation.created"}
 *       → queues the reservation, plays a ~10s notification chime and
 *         renders a modal with Accept / Reject buttons. Never blocks
 *         additional incoming events; queue is drained in FIFO order.
 *
 *   • On {type: "food.reservation.updated"}
 *       → bumps a version counter that other components can listen to
 *         (partner reservations page re-fetches).
 *
 *   • On {type: "food.order.created"}
 *       → reserved for the future order pipeline. Structure supports
 *         both events without changes.
 *
 * Sound: procedurally-generated Web Audio chime (no asset required).
 * The audio graph is created lazily after a user gesture to avoid the
 * autoplay block. The visual modal ALWAYS shows regardless of audio.
 *
 * The BACKEND is the source of truth — if the WS drops the reservation
 * is still persisted server-side; the partner's Reservations page will
 * show it on next fetch or reconnect.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { X, Check, Loader2, AlertTriangle, Users, Calendar, Phone, MessageSquare, Volume2, VolumeX } from "lucide-react";
import { partnerApi } from "../../../contexts/FoodPartnerContext";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const NotificationCtx = createContext(null);
export const useRestaurantNotifications = () => useContext(NotificationCtx) || {};

const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

const wsUrl = (rid, token) => {
  const base = API.replace(/^http/, "ws");
  return `${base}/api/food/manage/${encodeURIComponent(rid)}/ws?token=${encodeURIComponent(token || "")}`;
};

// ---------------------------------------------------------------------------
// Web-Audio chime — no asset, autoplay-safe (call `unlock()` once after a
// user gesture, then trigger via `playChime(volume)` which loops up to 10s).
// ---------------------------------------------------------------------------

const useChime = () => {
  const ctxRef = useRef(null);
  const stopRef = useRef(null);

  const unlock = useCallback(async () => {
    if (ctxRef.current) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      ctxRef.current = new Ctx();
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      return true;
    } catch { return false; }
  }, []);

  const playChime = useCallback((volume = 0.8) => {
    const ctx = ctxRef.current;
    if (!ctx) return () => {};
    stopRef.current?.(); // stop any previous chime
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    gain.connect(ctx.destination);
    let cancelled = false;
    const startAt = ctx.currentTime;
    const beep = (t) => {
      if (cancelled) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.25);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1.0, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(env); env.connect(gain);
      osc.start(t); osc.stop(t + 0.6);
    };
    // 10 seconds of double-beeps every ~1.2s = ~8 patterns.
    for (let i = 0; i < 9; i++) {
      beep(startAt + i * 1.2);
      beep(startAt + i * 1.2 + 0.35);
    }
    const stop = () => { cancelled = true; try { gain.disconnect(); } catch {} };
    stopRef.current = stop;
    // Auto-stop after 10s
    setTimeout(stop, 10500);
    return stop;
  }, []);

  const stopChime = useCallback(() => { stopRef.current?.(); }, []);

  return { unlock, playChime, stopChime };
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const RestaurantNotificationProvider = ({ restaurantId, token, children }) => {
  const [queue, setQueue] = useState([]);           // pending reservations awaiting action
  const [orderQueue, setOrderQueue] = useState([]); // pending FOOD orders awaiting Accept/Reject
  const [audioReady, setAudioReady] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [settings, setSettings] = useState({ sound_new_reservation: true, sound_new_order: true, sound_volume: 0.8 });
  const [updatesVersion, setUpdatesVersion] = useState(0); // consumers subscribe to this to refetch
  const [wsStatus, setWsStatus] = useState("idle"); // idle | connecting | open | closed
  const wsRef = useRef(null);
  // Refs for values read inside WS onmessage — avoids stale closure when the
  // partner enables alerts or changes settings AFTER the WS already connected.
  const audioReadyRef = useRef(false);
  const settingsRef = useRef(settings);
  const seenEventIdsRef = useRef(new Set()); // de-dup across WS reconnects
  const { unlock, playChime, stopChime } = useChime();

  useEffect(() => { audioReadyRef.current = audioReady; }, [audioReady]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Load settings once
  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancel = false;
    partnerApi.get(`/food/manage/${restaurantId}/reservation-settings`).then(({ data }) => {
      if (cancel) return;
      const s = data.settings || {};
      setSettings({
        sound_new_reservation: s.sound_new_reservation ?? true,
        sound_new_order:       s.sound_new_order ?? true,
        sound_volume:          s.sound_volume ?? 0.8,
      });
    }).catch(() => {});
    return () => { cancel = true; };
  }, [restaurantId, token]);

  // Establish WS
  useEffect(() => {
    if (!restaurantId || !token) return;
    let cancelled = false;
    let backoff = 1000;

    const connect = () => {
      if (cancelled) return;
      setWsStatus("connecting");
      let ws;
      try { ws = new WebSocket(wsUrl(restaurantId, token)); } catch { setWsStatus("closed"); return; }
      wsRef.current = ws;
      ws.onopen = () => { if (cancelled) return; setWsStatus("open"); backoff = 1000; };
      ws.onmessage = (ev) => {
        try {
          const frame = JSON.parse(ev.data);
          // De-dup on event id or (type + entity_id) across WS reconnects / rerenders
          const dedupKey = frame.event_id || `${frame.type}:${frame.reservation?.id || frame.order?.id || ""}`;
          if (dedupKey && seenEventIdsRef.current.has(dedupKey)) return;
          if (dedupKey) {
            seenEventIdsRef.current.add(dedupKey);
            if (seenEventIdsRef.current.size > 500) {
              // Trim oldest half to cap memory on long-running sessions.
              seenEventIdsRef.current = new Set(Array.from(seenEventIdsRef.current).slice(-250));
            }
          }
          const s = settingsRef.current;
          const ready = audioReadyRef.current;
          if (frame.type === "food.reservation.created") {
            const res = frame.reservation;
            setQueue((q) => q.some((x) => x.id === res.id) ? q : [...q, res]);
            if (s.sound_new_reservation && ready) playChime(s.sound_volume);
            setUpdatesVersion((v) => v + 1);
          } else if (frame.type === "food.reservation.updated") {
            setUpdatesVersion((v) => v + 1);
          } else if (frame.type === "food.order.created") {
            const o = frame.order;
            if (o && o.id) {
              setOrderQueue((q) => q.some((x) => x.id === o.id) ? q : [...q, o]);
              if (s.sound_new_order && ready) playChime(s.sound_volume);
              setUpdatesVersion((v) => v + 1);
            }
          } else if (frame.type === "food.order.updated") {
            setUpdatesVersion((v) => v + 1);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setWsStatus("closed");
        const wait = Math.min(backoff, 15000);
        setTimeout(connect, wait);
        backoff = Math.min(backoff * 2, 15000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();
    return () => {
      cancelled = true;
      try { wsRef.current?.close(); } catch {}
    };
    // Values are read via refs inside onmessage so changing audioReady /
    // settings does NOT need to re-establish the WS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, token]);

  const armAudio = useCallback(async () => {
    const ok = await unlock();
    setAudioReady(ok);
    setAudioBlocked(!ok);
  }, [unlock]);

  const testSound = useCallback(async () => {
    if (!audioReady) await armAudio();
    playChime(settings.sound_volume);
  }, [audioReady, armAudio, playChime, settings.sound_volume]);

  const dismiss = useCallback((id) => {
    setQueue((q) => q.filter((r) => r.id !== id));
    stopChime();
  }, [stopChime]);

  const dismissOrder = useCallback((id) => {
    setOrderQueue((q) => q.filter((o) => o.id !== id));
    stopChime();
  }, [stopChime]);

  const actOnOrder = useCallback(async (order, action, reason) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurantId}/orders/${order.id}`, { action, reason });
      dismissOrder(order.id);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.response?.data?.detail || e.message || "Erreur");
    }
  }, [restaurantId, dismissOrder]);

  const act = useCallback(async (reservation, action, reason) => {
    try {
      await partnerApi.patch(`/food/manage/${restaurantId}/reservations/${reservation.id}`, { action, reason });
      dismiss(reservation.id);
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.response?.data?.detail || e.message || "Erreur");
    }
  }, [restaurantId, dismiss]);

  const updateSettings = useCallback(async (patch) => {
    const { data } = await partnerApi.put(`/food/manage/${restaurantId}/reservation-settings`, patch);
    setSettings({
      sound_new_reservation: data.sound_new_reservation ?? true,
      sound_new_order:       data.sound_new_order ?? true,
      sound_volume:          data.sound_volume ?? 0.8,
    });
    return data;
  }, [restaurantId]);

  const value = useMemo(() => ({
    wsStatus,
    audioReady,
    audioBlocked,
    armAudio,
    testSound,
    settings,
    updateSettings,
    updatesVersion,
    queue,
    dismiss,
    act,
    orderQueue,
    dismissOrder,
    actOnOrder,
  }), [wsStatus, audioReady, audioBlocked, armAudio, testSound, settings, updateSettings, updatesVersion, queue, dismiss, act, orderQueue, dismissOrder, actOnOrder]);

  const current = queue[0] || null;
  const currentOrder = orderQueue[0] || null;

  return (
    <NotificationCtx.Provider value={value}>
      {children}
      {!audioReady && (
        <button
          onClick={armAudio}
          data-testid="partner-arm-audio"
          className="fixed bottom-4 right-4 z-[150] h-10 px-4 rounded-full text-xs font-semibold shadow-lg inline-flex items-center gap-2 text-white"
          style={{ backgroundColor: GREEN }}
        >
          <Volume2 size={13} /> {detectFr() ? "Activer les alertes" : "Enable alerts"}
        </button>
      )}
      {current && (
        <IncomingModal
          reservation={current}
          onAccept={() => act(current, "confirm")}
          onReject={(reason) => act(current, "reject", reason)}
          onDismiss={() => dismiss(current.id)}
          extra={queue.length - 1}
        />
      )}
      {currentOrder && (
        <IncomingOrderModal
          order={currentOrder}
          onAccept={() => actOnOrder(currentOrder, "accept")}
          onReject={(reason) => actOnOrder(currentOrder, "reject", reason)}
          onDismiss={() => dismissOrder(currentOrder.id)}
          extra={orderQueue.length - 1}
        />
      )}
    </NotificationCtx.Provider>
  );
};

// ---------------------------------------------------------------------------
// Incoming FOOD ORDER modal
// ---------------------------------------------------------------------------

const IncomingOrderModal = ({ order, onAccept, onReject, onDismiss, extra }) => {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const isFr = detectFr();
  const accept = async () => { setBusy(true); try { await onAccept(); } finally { setBusy(false); } };
  const reject = async () => { setBusy(true); try { await onReject(reason.trim() || "Unspecified"); } finally { setBusy(false); } };
  const typeLabel = order.order_type === "pickup"
    ? (isFr ? "À emporter" : "Pickup")
    : (isFr ? "Livraison" : "Delivery");

  const REASONS_FR = ["Restaurant trop occupé", "Article indisponible", "Fermeture imminente", "Impossible de préparer", "Autre"];
  const REASONS_EN = ["Too busy",                "Item unavailable",     "Closing soon",         "Unable to fulfil",       "Other"];
  const reasons = isFr ? REASONS_FR : REASONS_EN;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-testid="new-food-order-modal" translate="no">
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between" style={{ backgroundColor: `${GREEN}1a` }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: GREEN }}>{isFr ? "Nouvelle commande" : "New order"}</div>
            <div className="text-lg font-bold font-mono" data-testid="partner-order-modal-number">{order.order_number}</div>
          </div>
          <button onClick={onDismiss} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground">{typeLabel}</div>
            <div className="text-xs text-muted-foreground">{order.items_count} {isFr ? "article(s)" : "item(s)"}</div>
          </div>
          <div className="text-3xl font-bold" style={{ color: GREEN }} data-testid="partner-order-modal-total">
            {Number(order.grand_total || 0).toLocaleString(isFr ? "fr-FR" : "en-US")} <span className="text-base font-semibold text-muted-foreground">{order.currency}</span>
          </div>
          {extra > 0 && (
            <div className="text-[10px] text-muted-foreground" data-testid="partner-order-modal-queue">
              {isFr ? `+${extra} autre(s) en attente` : `+${extra} more waiting`}
            </div>
          )}
          {rejecting ? (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{isFr ? "Motif" : "Reason"}</div>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-border bg-secondary/40 px-3 h-9 text-sm"
                      data-testid="reject-reason-input">
                <option value="">—</option>
                {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setRejecting(false)} className="flex-1 h-10 rounded-lg bg-secondary text-sm font-semibold" disabled={busy}>
                  {isFr ? "Annuler" : "Cancel"}
                </button>
                <button onClick={reject} className="flex-1 h-10 rounded-lg bg-red-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                        disabled={busy || !reason} data-testid="partner-order-modal-reject-confirm">
                  {busy && <Loader2 size={12} className="animate-spin" />} {isFr ? "Confirmer le refus" : "Confirm rejection"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRejecting(true)} disabled={busy}
                      className="flex-1 h-11 rounded-lg bg-red-500/10 text-red-500 text-sm font-semibold inline-flex items-center justify-center gap-2"
                      data-testid="partner-order-modal-reject">
                <X size={14} /> {isFr ? "Refuser" : "Reject"}
              </button>
              <button onClick={accept} disabled={busy}
                      className="flex-1 h-11 rounded-lg text-black text-sm font-semibold inline-flex items-center justify-center gap-2"
                      style={{ backgroundColor: GREEN }}
                      data-testid="partner-order-modal-accept">
                {busy && <Loader2 size={12} className="animate-spin" />} <Check size={14} /> {isFr ? "Accepter" : "Accept"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Incoming modal
// ---------------------------------------------------------------------------

const IncomingModal = ({ reservation, onAccept, onReject, onDismiss, extra }) => {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const isFr = detectFr();

  const when = new Date(reservation.reservation_at || "").toLocaleString(isFr ? "fr-FR" : "en-US", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const accept = async () => { setBusy(true); try { await onAccept(); } finally { setBusy(false); } };
  const reject = async () => { setBusy(true); try { await onReject(reason.trim() || null); } finally { setBusy(false); } };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" data-testid="partner-notification-modal">
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="absolute inset-0 bg-black/60" data-testid="partner-notification-backdrop" />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between" style={{ backgroundColor: `${GREEN}12` }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: GREEN }}>{isFr ? "Nouvelle réservation" : "New reservation"}</div>
            <div className="text-lg font-bold">{reservation.guest_name}</div>
          </div>
          <button onClick={onDismiss} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center" data-testid="partner-notification-close"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex items-center gap-2"><Calendar size={14} className="text-muted-foreground" /> <span>{when}</span></div>
          <div className="flex items-center gap-2"><Users size={14} className="text-muted-foreground" /> <span>{reservation.party_size} {isFr ? "personnes" : "people"}</span></div>
          <div className="flex items-center gap-2"><Phone size={14} className="text-muted-foreground" /> <span>{reservation.guest_phone}</span></div>
          {reservation.notes && <div className="flex items-start gap-2"><MessageSquare size={14} className="text-muted-foreground mt-0.5" /> <span className="italic">{reservation.notes}</span></div>}
          <div className="text-[10px] font-mono text-muted-foreground pt-2">{reservation.booking_reference}</div>
          {rejecting && (
            <div className="space-y-2 pt-1">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{isFr ? "Motif" : "Reason"}</div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                        className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs"
                        placeholder={isFr ? "Complet, etc." : "Fully booked, etc."} data-testid="partner-notification-reason" />
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          {!rejecting ? (
            <>
              <button onClick={() => setRejecting(true)} disabled={busy}
                      className="flex-1 h-10 rounded-lg text-sm font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="partner-notification-reject">
                <X size={14} /> {isFr ? "Refuser" : "Reject"}
              </button>
              <button onClick={accept} disabled={busy}
                      className="flex-1 h-10 rounded-lg text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ backgroundColor: GREEN }}
                      data-testid="partner-notification-accept">
                {busy && <Loader2 size={14} className="animate-spin" />} <Check size={14} /> {isFr ? "Accepter" : "Accept"}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setRejecting(false)} disabled={busy}
                      className="flex-1 h-10 rounded-lg text-sm font-semibold bg-secondary hover:bg-secondary/80"
                      data-testid="partner-notification-reject-cancel">
                {isFr ? "Retour" : "Back"}
              </button>
              <button onClick={reject} disabled={busy}
                      className="flex-1 h-10 rounded-lg text-sm font-semibold bg-red-500 text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="partner-notification-reject-confirm">
                {busy && <Loader2 size={14} className="animate-spin" />} {isFr ? "Confirmer" : "Confirm"}
              </button>
            </>
          )}
        </div>
        {extra > 0 && (
          <div className="px-5 py-2 border-t border-border text-[11px] text-muted-foreground text-center" data-testid="partner-notification-queue-count">
            {isFr ? `+${extra} en attente` : `+${extra} pending`}
          </div>
        )}
      </div>
    </div>
  );
};

export default RestaurantNotificationProvider;
