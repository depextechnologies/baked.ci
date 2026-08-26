/**
 * SENDbakēd dispatch hook — Phase A (2026-02)
 *
 * Owns three responsibilities for the driver PWA while they're logged in:
 *   1. GPS watch: navigator.geolocation.watchPosition → POST /driver/me/location
 *      every ~8s while on an active job, ~30s while online but idle,
 *      OFF entirely when offline.
 *   2. WebSocket to /api/driver/ws — receives `job_offer` events in real time.
 *   3. Poll fallback — hits GET /driver/me/offers/current every 10s while the
 *      socket is dead, so a WS blip never loses a legitimate offer.
 *
 * The hook is opinionated but stateless from the caller's perspective:
 *   const { offer, accept, decline, wsStatus, gpsPermission } = useSendbakedDispatch({ enabled, onJob });
 *
 * `onJob` is called with the booking snapshot when the driver accepts, so the
 * caller can navigate to the in-progress screen (existing /driver/job/live).
 */
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const WS_BASE  = `${process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws")}/api/driver/ws`;

const IDLE_PING_MS   = 30_000;    // online but no job
const ACTIVE_PING_MS = 8_000;     // in an active job
const POLL_MS        = 10_000;    // WS-down fallback
const WS_BACKOFF_MS  = [1_000, 3_000, 5_000, 10_000];  // exponential-ish reconnect

const authHeaders = () => {
  const t = localStorage.getItem("baked_driver_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const useSendbakedDispatch = ({ enabled, hasActiveJob, onJobAccepted } = {}) => {
  const [offer, setOffer]         = useState(null);
  const [wsStatus, setWsStatus]   = useState("idle"); // "idle" | "connecting" | "open" | "closed"
  const [gpsPermission, setGps]   = useState("unknown"); // "unknown" | "granted" | "denied"

  const wsRef       = useRef(null);
  const reconnectRef= useRef({ attempt: 0, timer: null });
  const pollRef     = useRef(null);
  const watchIdRef  = useRef(null);
  const lastPingRef = useRef(0);
  const lastCoordsRef = useRef(null);
  const busyRef       = useRef(false);   // avoid overlapping accept/decline

  /* -------- 1. GPS watch ------------------------------------------------- */
  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return undefined;
    const cadenceMs = hasActiveJob ? ACTIVE_PING_MS : IDLE_PING_MS;

    const send = async (pos) => {
      const now = Date.now();
      if (now - lastPingRef.current < cadenceMs) return;
      lastPingRef.current = now;
      const { latitude, longitude, heading, speed, accuracy } = pos.coords;
      if (latitude === 0 && longitude === 0) return;
      lastCoordsRef.current = { lat: latitude, lng: longitude };
      try {
        await axios.post(`${API_BASE}/driver/me/location`,
          { lat: latitude, lng: longitude,
            heading: Number.isFinite(heading) ? heading : null,
            speed:   Number.isFinite(speed)   ? speed   : null,
            accuracy: Number.isFinite(accuracy) ? accuracy : null },
          { headers: authHeaders() });
      } catch { /* ignore — will retry on next watchPosition tick */ }
    };

    const success = (pos) => { setGps("granted"); send(pos); };
    const error   = (err) => {
      if (err && err.code === 1) setGps("denied");
    };

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000,
    });
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      lastPingRef.current = 0;
    };
  }, [enabled, hasActiveJob]);

  /* -------- 2. WebSocket + reconnect ------------------------------------ */
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const connect = () => {
      const token = localStorage.getItem("baked_driver_token");
      if (!token) return;
      setWsStatus("connecting");
      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setWsStatus("open");
        reconnectRef.current.attempt = 0;
        // Keep-alive so intermediaries don't kill the socket.
        const beat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25_000);
        ws.__beat = beat;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === "job_offer" && msg.payload) {
            setOffer((prev) =>
              prev && prev.booking_id === msg.payload.booking_id ? prev : msg.payload);
          }
          if (msg.event === "offer_cancelled" || msg.event === "offer_expired") {
            setOffer(null);
          }
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        if (ws.__beat) clearInterval(ws.__beat);
        wsRef.current = null;
        if (cancelled) return;
        setWsStatus("closed");
        const wait = WS_BACKOFF_MS[Math.min(reconnectRef.current.attempt, WS_BACKOFF_MS.length - 1)];
        reconnectRef.current.attempt += 1;
        reconnectRef.current.timer = setTimeout(connect, wait);
      };
      ws.onerror = () => { /* let onclose handle reconnect */ };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
      reconnectRef.current.attempt = 0;
      if (wsRef.current) {
        if (wsRef.current.__beat) clearInterval(wsRef.current.__beat);
        wsRef.current.close(1000, "unmount");
        wsRef.current = null;
      }
      setWsStatus("idle");
    };
  }, [enabled]);

  /* -------- 3. Poll fallback -------------------------------------------- */
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = async () => {
      if (wsStatus === "open") return;      // WS delivers events, no polling needed
      if (offer) return;                    // already have one in view
      try {
        const { data } = await axios.get(`${API_BASE}/driver/me/offers/current`, { headers: authHeaders() });
        if (data.offer) setOffer(data.offer);
      } catch { /* ignore */ }
    };
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [enabled, wsStatus, offer]);

  /* -------- 4. Server-driven countdown expiry --------------------------- */
  useEffect(() => {
    if (!offer?.expires_at) return undefined;
    const when = new Date(offer.expires_at).getTime();
    const remain = when - Date.now();
    if (remain <= 0) { setOffer(null); return undefined; }
    const t = setTimeout(() => setOffer(null), remain + 500);
    return () => clearTimeout(t);
  }, [offer]);

  const accept = useCallback(async () => {
    if (!offer || busyRef.current) return { ok: false, reason: "no_offer" };
    busyRef.current = true;
    try {
      const { data } = await axios.post(
        `${API_BASE}/driver/me/offers/${offer.booking_id}/accept`,
        {}, { headers: authHeaders() });
      setOffer(null);
      if (onJobAccepted) onJobAccepted(data);
      return { ok: true, booking: data };
    } catch (err) {
      setOffer(null);   // whatever the reason, this offer is done
      return { ok: false, reason: err?.response?.data?.detail?.code || "error", err };
    } finally { busyRef.current = false; }
  }, [offer, onJobAccepted]);

  const decline = useCallback(async () => {
    if (!offer || busyRef.current) return { ok: false, reason: "no_offer" };
    busyRef.current = true;
    try {
      await axios.post(
        `${API_BASE}/driver/me/offers/${offer.booking_id}/decline`,
        {}, { headers: authHeaders() });
      setOffer(null);
      return { ok: true };
    } catch (err) {
      setOffer(null);
      return { ok: false, reason: err?.response?.data?.detail?.code || "error" };
    } finally { busyRef.current = false; }
  }, [offer]);

  return { offer, accept, decline, wsStatus, gpsPermission, lastCoords: lastCoordsRef.current };
};
