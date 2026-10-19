import { useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { secureToken } from '@/lib/storage';

const TERMINAL = ['delivered', 'cancelled', 'completed', 'failed'];
const BACKOFF = [1000, 2000, 5000, 10000, 15000];
const HEARTBEAT_MS = 20000;
const POLL_MS = 10000;

// Authenticated per-booking WebSocket with heartbeat, exponential reconnect and HTTP polling fallback.
export function useBookingSocket(bookingId: string) {
  const [booking, setBooking] = useState<any>(null);
  const [live, setLive] = useState(false);
  const [lastFix, setLastFix] = useState<number | null>(null);
  const terminal = TERMINAL.includes(booking?.status);
  const terminalRef = useRef(false);
  terminalRef.current = terminal;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let failures = 0;
    let beat: ReturnType<typeof setInterval> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const apply = (b: any) => {
      setBooking((prev: any) => {
        const moved = b?.driver_location && JSON.stringify(b.driver_location) !== JSON.stringify(prev?.driver_location);
        if (moved) setLastFix(Date.now());
        return { ...prev, ...b };
      });
    };
    const fetchOnce = () => api<any>(`/express/bookings/${bookingId}`).then(apply).catch(() => {});
    const startPoll = () => { if (!poll) poll = setInterval(fetchOnce, POLL_MS); };
    const stopPoll = () => { if (poll) clearInterval(poll); poll = undefined; };

    const connect = async () => {
      if (stopped || terminalRef.current) return;
      const token = await secureToken.get();
      const url = `${API_URL.replace(/^http/, 'ws')}/express/ws/customer/bookings/${bookingId}?token=${encodeURIComponent(token || '')}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0; failures = 0; setLive(true); stopPoll();
        beat = setInterval(() => ws?.readyState === 1 && ws.send('ping'), HEARTBEAT_MS);
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data));
          if (m.type === 'snapshot') { apply(m); if (TERMINAL.includes(m.status)) { terminalRef.current = true; ws?.close(); } }
        } catch { /* ignore malformed frame */ }
      };
      ws.onclose = (e) => {
        setLive(false); if (beat) clearInterval(beat);
        if (stopped || terminalRef.current || e.code === 4403) { if (e.code === 4403) fetchOnce(); return; }
        if (++failures > 6) { startPoll(); return; }
        startPoll();
        retry = setTimeout(connect, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
      };
      ws.onerror = () => ws?.close();
    };

    fetchOnce();
    connect();
    return () => { stopped = true; ws?.close(); if (beat) clearInterval(beat); if (retry) clearTimeout(retry); stopPoll(); };
  }, [bookingId]);

  return { booking, live, lastFix, terminal, refresh: () => api<any>(`/express/bookings/${bookingId}`).then((b) => setBooking(b)) };
}
