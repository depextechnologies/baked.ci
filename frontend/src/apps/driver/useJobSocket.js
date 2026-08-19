/**
 * useJobSocket — one hook, two modes (driver publisher, customer subscriber).
 *
 * Handles:
 *  • WSS URL construction from REACT_APP_BACKEND_URL
 *  • Exponential-backoff reconnect (min 1s, max 20s, resets after 10s stable)
 *  • Server ping → auto pong (kept internal)
 *  • Visibility change → reconnect on foreground
 *  • Optional fallback polling when the socket is not open
 *  • `send(frame)` for driver publishers
 *  • `connected` state + `onFrame(frame)` callback for consumers
 *
 * The hook is safe to mount/unmount at will — pending reconnects are
 * cancelled on cleanup and no stale timers survive a job transition.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 20000;
const STABLE_RESET_MS = 10000;
const FALLBACK_POLL_MS = 5000;

const wsUrlFor = (path) => {
  const base = process.env.REACT_APP_BACKEND_URL || "";
  return base.replace(/^http/i, "ws") + path;
};

export const useJobSocket = ({
  enabled = true,
  path,                 // e.g. "/api/ws/driver/jobs/JID?token=..."
  onFrame,              // (frame) => void — every server frame (hello/location/job_status)
  onConnectionChange,   // (connected: boolean) => void
  fallbackPoll,         // async () => void — called every 5s while disconnected
}) => {
  const wsRef        = useRef(null);
  const retryRef     = useRef(RETRY_MIN_MS);
  const reconnectTO  = useRef(null);
  const stableTO     = useRef(null);
  const pollTO       = useRef(null);
  const closedByUser = useRef(false);
  const onFrameRef   = useRef(onFrame);
  const onConnRef    = useRef(onConnectionChange);
  const pollRef      = useRef(fallbackPoll);
  const [connected, setConnected] = useState(false);

  // Keep callback refs fresh without retriggering the effect below.
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { onConnRef.current  = onConnectionChange; }, [onConnectionChange]);
  useEffect(() => { pollRef.current    = fallbackPoll; }, [fallbackPoll]);

  const stopPolling = useCallback(() => {
    if (pollTO.current) { clearInterval(pollTO.current); pollTO.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTO.current || !pollRef.current) return;
    // Fire immediately, then on interval — matches the "gap between disconnect
    // and reconnect" case where the last frame is 30s+ old.
    Promise.resolve(pollRef.current?.()).catch(() => {});
    pollTO.current = setInterval(() => { Promise.resolve(pollRef.current?.()).catch(() => {}); }, FALLBACK_POLL_MS);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !path) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN
                       || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    const url = wsUrlFor(path);
    let ws;
    try { ws = new WebSocket(url); } catch { scheduleReconnect(); return; }
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true); onConnRef.current?.(true);
      stopPolling();
      // If the socket stays up for STABLE_RESET_MS reset the backoff to min.
      if (stableTO.current) clearTimeout(stableTO.current);
      stableTO.current = setTimeout(() => { retryRef.current = RETRY_MIN_MS; }, STABLE_RESET_MS);
    };

    ws.onmessage = (ev) => {
      let frame;
      try { frame = JSON.parse(ev.data); } catch { return; }
      if (frame?.type === "ping") {
        // Symmetric heartbeat — reply with pong so the server can detect
        // dead sockets without waiting on Cloudflare's idle killer.
        try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* ignore */ }
        return;
      }
      onFrameRef.current?.(frame);
    };

    const handleClose = () => {
      wsRef.current = null;
      if (stableTO.current) { clearTimeout(stableTO.current); stableTO.current = null; }
      setConnected(false); onConnRef.current?.(false);
      startPolling();
      if (!closedByUser.current) scheduleReconnect();
    };
    ws.onclose = handleClose;
    ws.onerror = () => { try { ws.close(); } catch { /* onclose fires next */ } };
  }, [enabled, path, startPolling, stopPolling]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTO.current) return;
    const delay = retryRef.current;
    retryRef.current = Math.min(RETRY_MAX_MS, Math.floor(retryRef.current * 1.8));
    reconnectTO.current = setTimeout(() => {
      reconnectTO.current = null;
      connect();
    }, delay);
  }, [connect]);

  // Foreground → force reconnect. Safari suspends WS in the background so
  // by the time the user comes back the socket is likely dead.
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      // Cancel any pending backoff and try now.
      if (reconnectTO.current) { clearTimeout(reconnectTO.current); reconnectTO.current = null; }
      retryRef.current = RETRY_MIN_MS;
      connect();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, connect]);

  // Boot / teardown per (enabled + path).
  useEffect(() => {
    if (!enabled || !path) return;
    closedByUser.current = false;
    retryRef.current = RETRY_MIN_MS;
    connect();
    return () => {
      closedByUser.current = true;
      if (reconnectTO.current) clearTimeout(reconnectTO.current);
      reconnectTO.current = null;
      if (stableTO.current) clearTimeout(stableTO.current);
      stableTO.current = null;
      stopPolling();
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
      setConnected(false);
    };
  }, [enabled, path, connect, stopPolling]);

  const send = useCallback((frame) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(frame)); return true; } catch { return false; }
  }, []);

  return { connected, send };
};
