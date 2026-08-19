/**
 * JobChat — shared in-ride chat panel used by both the driver PWA and the
 * public customer tracking page.
 *
 * Contract:
 *   listMessages(after?)  → { items, presets, job_status }
 *   sendMessage({ preset_key? | text? }) → { id, sender, ... }
 *
 * The parent owns the API bindings so the same visual shell works for
 * driver JWT auth (Authorization header) or the public share-token auth
 * (?t= query param). `mySender` is the string this side identifies as
 * ('driver' | 'customer').
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, MessageCircle, X } from "lucide-react";

const ACCENT = "#FF7A00";

const timeFmt = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const JobChat = ({
  open, onClose,
  listMessages, sendMessage,
  mySender, presetsOverride = null,
  onUnreadChange = null,
  chatClosed = false,
  poll = 3000,
}) => {
  const [messages, setMessages] = useState([]);
  const [presets,  setPresets]  = useState({});
  const [draft,    setDraft]    = useState("");
  const [busy,     setBusy]     = useState(false);
  const scrollRef   = useRef(null);
  const lastSeenRef = useRef(null);   // ISO of last message read while open
  const unreadRef   = useRef(0);

  const applyIncoming = useCallback((items, isInitial) => {
    // Compute unread delta OUTSIDE the setState updater so we never call
    // `onUnreadChange` (a parent setState) from inside a React updater
    // — that's the "setState during render of another component" warning.
    if (!isInitial && !open) {
      const inbound = items.filter((m) => m.sender !== mySender);
      if (inbound.length) {
        unreadRef.current += inbound.length;
        onUnreadChange?.(unreadRef.current);
      }
    }
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...items.filter((m) => !seen.has(m.id))];
    });
  }, [open, mySender, onUnreadChange]);

  // Initial load + polling. We over-fetch on the first tick to seed presets,
  // then use ?after= for the increment.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let cursor = null;

    const tick = async (initial) => {
      try {
        const data = await listMessages(cursor);
        if (cancelled) return;
        if (data.presets) setPresets(data.presets);
        const items = data.items || [];
        if (items.length) {
          cursor = items[items.length - 1].created_at;
          applyIncoming(items, initial);
        }
      } catch { /* silent — network blips are common on 3G */ }
    };

    tick(true);
    timer = setInterval(() => tick(false), poll);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [listMessages, poll, applyIncoming]);

  // When the sheet opens, clear unread + remember the "last seen" timestamp.
  useEffect(() => {
    if (open) {
      unreadRef.current = 0;
      onUnreadChange?.(0);
      lastSeenRef.current = new Date().toISOString();
      // Scroll to bottom on next paint.
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [open, onUnreadChange]);

  // Auto-scroll on new message while open.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, open]);

  const effectivePresets = presetsOverride || presets;

  const doSend = async (payload) => {
    if (chatClosed) return toast.error("Chat is closed for this job.");
    setBusy(true);
    try {
      const msg = await sendMessage(payload);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setDraft("");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : detail?.message || "Failed to send");
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur"
         data-testid="jobchat-sheet" onClick={onClose}>
      <div className="w-full max-w-[440px] max-h-[85vh] rounded-t-[36px] bg-neutral-950 border-t border-white/10 flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-12 h-1 rounded-full bg-white/20 mt-3 mb-2" />
        <div className="px-6 pt-2 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)" }}>
              <MessageCircle size={14} color="#000" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {mySender === "driver" ? "Message the customer" : "Message the rider"}
              </div>
              <div className="text-[10px] text-white/40">
                {chatClosed ? "Chat closed — job ended" : "Live · replies in seconds"}
              </div>
            </div>
          </div>
          <button onClick={onClose} data-testid="jobchat-close"
                  className="w-9 h-9 rounded-full bg-white/5 grid place-items-center"><X size={16} /></button>
        </div>

        {/* Messages */}
        <div ref={scrollRef}
             className="flex-1 overflow-y-auto px-5 py-3 space-y-2"
             data-testid="jobchat-messages">
          {messages.length === 0 ? (
            <div className="text-center text-xs text-white/40 py-10">
              Say hi to get things moving.
            </div>
          ) : messages.map((m) => {
            const mine = m.sender === mySender;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}
                   data-testid={`jobchat-bubble-${m.sender}`}>
                <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-snug
                                 ${mine ? "text-black" : "text-white bg-white/[0.08] border border-white/10"}`}
                     style={mine ? { background: `linear-gradient(135deg, #FFB454, ${ACCENT})` } : {}}>
                  {m.text}
                  <div className={`text-[9px] uppercase tracking-widest mt-1 opacity-70 text-right`}>
                    {timeFmt(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Presets */}
        <div className="px-5 pt-3 pb-1 flex gap-2 overflow-x-auto" data-testid="jobchat-presets">
          {Object.entries(effectivePresets).map(([k, label]) => (
            <button key={k} onClick={() => doSend({ preset_key: k })} disabled={busy || chatClosed}
                    data-testid={`jobchat-preset-${k}`}
                    className="whitespace-nowrap text-xs px-3 py-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40">
              {label}
            </button>
          ))}
        </div>

        {/* Compose */}
        <div className="px-5 py-4 flex items-center gap-2 border-t border-white/5 mt-2">
          <input
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft.trim() && doSend({ text: draft.trim() })}
            placeholder={chatClosed ? "Chat closed" : "Type a message…"}
            disabled={busy || chatClosed}
            data-testid="jobchat-input"
            className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm outline-none focus:border-orange-500/60 disabled:opacity-50"
          />
          <button onClick={() => draft.trim() && doSend({ text: draft.trim() })}
                  disabled={busy || chatClosed || !draft.trim()}
                  data-testid="jobchat-send"
                  className="w-12 h-12 rounded-2xl text-black disabled:opacity-40 grid place-items-center"
                  style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)" }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobChat;
