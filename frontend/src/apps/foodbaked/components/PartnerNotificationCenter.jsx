/**
 * PartnerNotificationCenter — Phase 4 history/drawer for partner alerts.
 *
 * Subscribes to the already-running WebSocket (via useRestaurantNotifications
 * which fires `updatesVersion` + maintains the queue), locally captures
 * every WS frame it hasn't seen, and shows a persistent list the partner
 * can scroll + mark as read.
 *
 * No new DB table: all history lives in localStorage keyed by restaurantId.
 * Capped at 50 entries so storage never blows out.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Package, CalendarClock, Pause, Play, Check, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRestaurantNotifications } from "./RestaurantNotificationEngine";
import { partnerApi } from "../../../contexts/FoodPartnerContext";

const GREEN = "#00A651";

const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

const KEY = (rid) => `partner_notif_history_${rid}`;
const CAP = 50;

const EVENT_META = {
  "food.order.created":        { icon: Package,        label_fr: "Nouvelle commande",       label_en: "New order",            tone: "ok" },
  "food.order.updated":        { icon: Package,        label_fr: "Commande mise à jour",    label_en: "Order updated",        tone: "info" },
  "food.reservation.created":  { icon: CalendarClock,  label_fr: "Nouvelle réservation",    label_en: "New reservation",      tone: "ok" },
  "food.reservation.updated":  { icon: CalendarClock,  label_fr: "Réservation mise à jour", label_en: "Reservation updated",  tone: "info" },
  "food.service.paused":       { icon: Pause,          label_fr: "Service en pause",        label_en: "Service paused",       tone: "warn" },
  "food.service.resumed":      { icon: Play,           label_fr: "Service repris",          label_en: "Service resumed",      tone: "ok" },
};

const TONE_BG = { ok: "rgba(0,166,81,.12)", warn: "rgba(245,158,11,.12)", info: "rgba(100,116,139,.14)" };
const TONE_FG = { ok: "#00A651",            warn: "#F59E0B",              info: "#64748B" };

export const useNotificationHistory = (restaurantId) => {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY(restaurantId)) || "[]"); } catch { return []; }
  });

  const persist = useCallback((xs) => {
    try { localStorage.setItem(KEY(restaurantId), JSON.stringify(xs.slice(0, CAP))); } catch { /* quota */ }
  }, [restaurantId]);

  const push = useCallback((frame) => {
    setItems((xs) => {
      // Dedup on event_id / entity id
      const key = frame.event_id || `${frame.type}:${frame.order?.id || frame.reservation?.id || ""}`;
      if (key && xs.some((x) => x._key === key)) return xs;
      const entry = {
        _key: key,
        type: frame.type,
        ts: new Date().toISOString(),
        read: false,
        entity_id: frame.order?.id || frame.reservation?.id || null,
        snapshot: frame.order || frame.reservation || null,
        service: frame.service || null,
        paused_until: frame.delivery_paused_until || frame.pickup_paused_until || null,
      };
      const next = [entry, ...xs].slice(0, CAP);
      persist(next);
      return next;
    });
  }, [persist]);

  const markAllRead = useCallback(() => {
    setItems((xs) => {
      const next = xs.map((x) => ({ ...x, read: true }));
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(KEY(restaurantId)); } catch { /* ignore */ }
  }, [restaurantId]);

  const unread = useMemo(() => items.filter((x) => !x.read).length, [items]);

  return { items, push, markAllRead, clear, unread };
};

const PartnerNotificationCenter = ({ restaurantId, open, onClose }) => {
  const isFr = detectFr();
  const nav = useNavigate();
  const { queue, orderQueue, updatesVersion } = useRestaurantNotifications();
  const { items, push, markAllRead, clear } = useNotificationHistory(restaurantId);

  // Mirror new queue entries into the history. `queue` + `orderQueue` are
  // the active (actionable) items; we snapshot them into history on first
  // sight. Dedup is handled by push().
  useEffect(() => {
    (queue || []).forEach((r) => push({ type: "food.reservation.created", reservation: r }));
    (orderQueue || []).forEach((o) => push({ type: "food.order.created", order: o }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.length, orderQueue?.length, updatesVersion]);

  // Mark everything read whenever the drawer opens, so the bell badge resets.
  useEffect(() => { if (open) markAllRead(); }, [open, markAllRead]);

  if (!open) return null;

  const relLabel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return isFr ? "À l'instant" : "Just now";
    if (m < 60) return isFr ? `il y a ${m} min` : `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return isFr ? `il y a ${h} h` : `${h}h ago`;
    return new Date(iso).toLocaleString(isFr ? "fr-FR" : "en-US");
  };

  const jumpTo = (entry) => {
    onClose();
    if (entry.type.startsWith("food.order.") && entry.entity_id) nav(`/partner/food/orders`);
    else if (entry.type.startsWith("food.reservation.")) nav(`/partner/food/reservations/bookings`);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}
         data-testid="partner-notif-drawer">
      <div className="w-full max-w-md h-full bg-background border-l border-border flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{isFr ? "Notifications" : "Notifications"}</div>
            <h2 className="text-lg font-bold">{isFr ? "Centre de notifications" : "Notification center"}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center"
                  data-testid="partner-notif-close"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-border flex items-center justify-between">
          <button onClick={markAllRead} className="h-8 px-3 rounded-lg text-xs font-semibold bg-secondary"
                  data-testid="partner-notif-mark-read">
            <Check size={12} className="inline mr-1" /> {isFr ? "Tout marquer lu" : "Mark all read"}
          </button>
          <button onClick={clear} className="h-8 px-3 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10"
                  data-testid="partner-notif-clear">
            {isFr ? "Vider" : "Clear"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground" data-testid="partner-notif-empty">
              <Bell className="mx-auto mb-2 opacity-50" />
              {isFr ? "Pas encore de notifications." : "No notifications yet."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const meta = EVENT_META[it.type] || EVENT_META["food.order.updated"];
                const Icon = meta.icon;
                const title = isFr ? meta.label_fr : meta.label_en;
                return (
                  <li key={it._key} onClick={() => jumpTo(it)}
                      className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-secondary/60"
                      data-testid={`partner-notif-item-${it._key}`}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                         style={{ background: TONE_BG[meta.tone], color: TONE_FG[meta.tone] }}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {it.snapshot?.order_number || it.snapshot?.customer_name || it.entity_id || "—"}
                        {it.service ? ` · ${it.service}` : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{relLabel(it.ts)}</div>
                    </div>
                    {!it.read && <span className="w-2 h-2 rounded-full mt-2" style={{ background: GREEN }} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerNotificationCenter;
