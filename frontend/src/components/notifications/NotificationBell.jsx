/**
 * NotificationBell — top-nav badge + dropdown for every portal (Phase 5b).
 *
 * Polls `${basePath}` every 20s for unread count + latest 40 notifications.
 * On click of the bell we open a dropdown, on click of a row we mark it read
 * and (optionally) navigate to its link. "Mark all read" clears the badge.
 *
 * Consumer wires it into their portal header:
 *   <NotificationBell apiClient={partnerApi} basePath="/partner/notifications" />
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Circle, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";

const errMsg = (e) => e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || "Error";

const POLL_MS = 20000;

const KIND_COLORS = {
  po_submitted:        "#3B82F6",
  po_acknowledged:     "#8B5CF6",
  po_shipped:          "#FCC44C",
  po_received:         "#22C55E",
  invoice_draft_ready: "#77BC1F",
  invoice_submitted:   "#3B82F6",
  invoice_approved:    "#22C55E",
  invoice_disputed:    "#FF4C52",
};

export const NotificationBell = ({ apiClient, basePath, onNavigate, align = "right" }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await apiClient.get(basePath, { params: { limit: 40 } });
      setItems(data.items || []);
      setUnread(data.unread_count || 0);
    } catch { /* silent — bell must never spam toasts on background polls */ }
  }, [apiClient, basePath]);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetch]);

  // Click-outside to close
  useEffect(() => {
    const onClick = (e) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = async (n) => {
    setBusy(true);
    try {
      await apiClient.post(`${basePath}/${n.id}/read`);
      setItems((old) => old.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread((u) => Math.max(0, u - (n.is_read ? 0 : 1)));
      if (n.link && onNavigate) { onNavigate(n.link); setOpen(false); }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      await apiClient.post(`${basePath}/read-all`);
      setItems((old) => old.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div ref={wrapRef} className="relative" data-testid="notification-bell">
      <button onClick={() => { setOpen((o) => !o); if (!open) fetch(); }}
        className="relative p-2 rounded-lg hover:bg-white/5 transition"
        data-testid="notification-bell-btn"
        aria-label={`Notifications (${unread} unread)`}>
        <Bell size={18} className={unread > 0 ? "text-primary" : "text-muted-foreground"} />
        {unread > 0 && (
          <span data-testid="notification-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "#FF4C52" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-2 w-96 max-h-[70vh] overflow-y-auto rounded-xl shadow-xl border z-50`}
          style={{ background: "#0F1A0A", borderColor: "rgba(148,163,184,.25)", color: "#F1F5F9" }}
          data-testid="notification-dropdown">
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(148,163,184,.15)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: "#94A3B8" }}>Notifications</div>
              <div className="text-sm font-bold">{unread > 0 ? `${unread} unread` : "You're all caught up"}</div>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} disabled={busy}
                className="text-xs px-3 h-8 rounded-lg font-medium flex items-center gap-1"
                style={{ background: "rgba(119,188,31,.12)", color: "#77BC1F", border: "1px solid rgba(119,188,31,.4)" }}
                data-testid="notification-mark-all-read">
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          {items.length === 0 && (
            <div className="p-8 text-center text-xs" style={{ color: "#94A3B8" }} data-testid="notification-empty">
              Nothing here yet. New POs, invoice submissions and approvals will show up here in real time.
            </div>
          )}

          <ul>
            {items.map((n) => {
              const color = KIND_COLORS[n.kind] || "#94A3B8";
              return (
                <li key={n.id}
                  className="p-3 border-b hover:bg-white/5 cursor-pointer transition"
                  style={{ borderColor: "rgba(148,163,184,.10)" }}
                  onClick={() => markRead(n)}
                  data-testid={`notification-row-${n.id}`}>
                  <div className="flex items-start gap-2">
                    <div className="mt-1">
                      {n.is_read
                        ? <Check size={12} style={{ color: "#94A3B8" }} />
                        : <Circle size={10} style={{ color }} fill={color} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color }}>{n.kind.replace(/_/g, " ")}</span>
                        {n.link && <ExternalLink size={10} style={{ color: "#94A3B8" }} />}
                      </div>
                      <div className={`text-sm font-medium ${n.is_read ? "opacity-70" : ""}`}>{n.title}</div>
                      {n.body && <div className={`text-xs mt-0.5 ${n.is_read ? "opacity-60" : ""}`} style={{ color: "#94A3B8" }}>{n.body}</div>}
                      <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#64748B" }}>
                        <Clock size={9} />
                        {new Date(n.created_at).toLocaleString()}
                        {n.actor_label && <span> · by {n.actor_label}</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
