/**
 * ReservationModal — customer-facing table-reservation flow.
 *
 * Bilingual FR-first: "Réserver une table · Book a table". Used from the
 * public restaurant detail page. Fields:
 *   1. date  (today + advance_booking_days)
 *   2. slot  (from GET /reservation-slots)
 *   3. party size (min/max from config)
 *   4. contact — auto-filled from `useAuth().customer` when logged in
 *   5. notes  (optional)
 *
 * If the caller has a `customer` in AuthCtx we prefill; otherwise the
 * flow works as a guest reservation. The backend endpoint accepts an
 * optional customer JWT — the frontend attaches it automatically if
 * present via the shared axios API wrapper.
 */
import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, Calendar, Clock, Users, User, Phone, Mail, MessageSquare, CheckCircle2, AlertTriangle } from "lucide-react";
import axios from "axios";
import { useAuth, useApp } from "../../contexts/BakedContexts";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const label = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });

const Field = ({ icon: Icon, label, hint, children, testId }) => (
  <label className="block space-y-1" data-testid={testId ? `${testId}-field` : undefined}>
    <div className="text-[11px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
      {Icon && <Icon size={11} />} <span>{label}</span>
    </div>
    {children}
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </label>
);

export const ReservationModal = ({ restaurant, onClose, onCreated }) => {
  const { customer, openLogin } = useAuth() || {};
  const { countryCode } = useApp() || {};
  const country = restaurant.country || countryCode || "CI";
  const [config, setConfig]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [selectedDate, setSelectedDate] = useState(today);
  const [party, setParty]         = useState(2);
  const [slots, setSlots]         = useState([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({
    guest_name: customer?.full_name || "",
    guest_phone: customer?.phone || "",
    guest_email: customer?.email || "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  // Load config once.
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { data } = await axios.get(
          `${API}/api/food/restaurants/${encodeURIComponent(restaurant.slug || restaurant.id)}/reservation-config`,
          { headers: authHeaders(), params: { country } },
        );
        if (!cancel) setConfig(data);
      } catch (e) {
        if (!cancel) setErr(e.response?.data?.detail || e.message || "Erreur · Error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [restaurant.slug, restaurant.id]);

  // Load slots when date or party changes.
  useEffect(() => {
    if (!config?.enabled) return;
    let cancel = false;
    (async () => {
      setSlotLoading(true); setErr(""); setSelectedSlot(null);
      try {
        const { data } = await axios.get(
          `${API}/api/food/restaurants/${encodeURIComponent(restaurant.slug || restaurant.id)}/reservation-slots`,
          { params: { date: isoDay(selectedDate), party_size: party, country }, headers: authHeaders() },
        );
        if (!cancel) setSlots(data.slots || []);
      } catch (e) {
        if (!cancel) setErr(e.response?.data?.detail || e.message || "Erreur · Error");
      } finally {
        if (!cancel) setSlotLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [config, restaurant.slug, restaurant.id, selectedDate, party]);

  const advance = config?.advance_booking_days ?? 30;
  const dateOptions = useMemo(() => {
    const out = [];
    for (let i = 0; i <= advance; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      out.push(d);
    }
    return out;
  }, [advance, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const partyRange = useMemo(() => {
    if (!config) return [];
    const min = config.min_party_size ?? 1;
    const max = config.max_party_size ?? 10;
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [config]);

  const submit = async () => {
    if (!selectedSlot) return;
    setBusy(true); setErr("");
    try {
      const { data } = await axios.post(
        `${API}/api/food/restaurants/${encodeURIComponent(restaurant.slug || restaurant.id)}/reservations`,
        {
          reservation_at: selectedSlot.iso,
          party_size: party,
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          guest_email: form.guest_email || null,
          notes: form.notes || null,
        },
        { headers: authHeaders(), params: { country } },
      );
      setCreated(data);
      onCreated?.(data);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message || "Erreur · Error");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = selectedSlot && form.guest_name.trim().length >= 2 && form.guest_phone.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-[120] flex items-end md:items-center md:justify-center" data-testid="food-reservation-modal">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" data-testid="food-reservation-backdrop" />
      <div className="relative w-full md:max-w-lg md:rounded-2xl md:border md:border-border bg-background overflow-hidden max-h-[92vh] flex flex-col">
        <header className="border-b border-border p-4 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">FOODbakēd · Reservations</div>
            <h2 className="text-lg font-bold">Réserver une table <span className="text-muted-foreground text-sm font-medium">· Book a table</span></h2>
            <div className="text-xs text-muted-foreground truncate">{restaurant.name}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center" data-testid="food-reservation-close"><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement · Loading…</div>}
          {!loading && !config?.enabled && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700 inline-flex items-center gap-2" data-testid="food-reservation-disabled"><AlertTriangle size={14} /> Ce restaurant n'accepte pas encore les réservations en ligne. · Not yet available.</div>
          )}
          {!loading && config?.enabled && config?.paused && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700 inline-flex items-center gap-2" data-testid="food-reservation-paused"><AlertTriangle size={14} /> Réservations temporairement suspendues. · Reservations paused.</div>
          )}

          {!created && !loading && config?.enabled && !config?.paused && (
            <>
              {/* Date */}
              <Field icon={Calendar} label="Date · Date" testId="food-reservation-date">
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-testid="food-reservation-dates">
                  {dateOptions.slice(0, 14).map((d) => {
                    const on = isoDay(d) === isoDay(selectedDate);
                    return (
                      <button key={d.toISOString()} onClick={() => setSelectedDate(d)}
                              className={`h-10 px-3 rounded-lg text-xs font-semibold whitespace-nowrap border ${on ? "text-white border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}
                              style={on ? { backgroundColor: GREEN } : undefined}
                              data-testid={`food-reservation-date-${isoDay(d)}`}>{label(d)}</button>
                    );
                  })}
                </div>
              </Field>

              {/* Party size */}
              <Field icon={Users} label="Personnes · Party size" testId="food-reservation-party">
                <div className="flex flex-wrap gap-2" data-testid="food-reservation-party-options">
                  {partyRange.map((p) => (
                    <button key={p} onClick={() => setParty(p)}
                            className={`w-10 h-10 rounded-lg text-sm font-semibold border ${party === p ? "text-white border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}
                            style={party === p ? { backgroundColor: GREEN } : undefined}
                            data-testid={`food-reservation-party-${p}`}>{p}</button>
                  ))}
                </div>
              </Field>

              {/* Slots */}
              <Field icon={Clock} label="Heure · Time" testId="food-reservation-slot">
                {slotLoading ? (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Chargement · Loading…</div>
                ) : slots.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Aucun créneau disponible · No slots available</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2" data-testid="food-reservation-slots">
                    {slots.map((s) => {
                      const on = selectedSlot?.iso === s.iso;
                      const disabled = !s.available;
                      return (
                        <button key={s.iso} onClick={() => setSelectedSlot(s)} disabled={disabled}
                                className={`h-10 rounded-lg text-xs font-semibold border ${on ? "text-white border-transparent" : disabled ? "border-border text-muted-foreground/40 line-through cursor-not-allowed" : "border-border text-muted-foreground hover:text-foreground"}`}
                                style={on ? { backgroundColor: GREEN } : undefined}
                                data-testid={`food-reservation-slot-${s.slot}`}>{s.slot}</button>
                      );
                    })}
                  </div>
                )}
              </Field>

              {/* Contact */}
              <Field icon={User} label="Nom complet · Full name" testId="food-reservation-name">
                <input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} required
                       className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                       data-testid="food-reservation-name-input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field icon={Phone} label="Téléphone · Phone" testId="food-reservation-phone">
                  <input type="tel" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} required placeholder="+225…"
                         className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                         data-testid="food-reservation-phone-input" />
                </Field>
                <Field icon={Mail} label="Email · Email (optionnel)" testId="food-reservation-email">
                  <input type="email" value={form.guest_email} onChange={(e) => setForm({ ...form, guest_email: e.target.value })}
                         className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                         data-testid="food-reservation-email-input" />
                </Field>
              </div>
              <Field icon={MessageSquare} label="Notes · Special requests (optionnel)" testId="food-reservation-notes">
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                          className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                          data-testid="food-reservation-notes-input" />
              </Field>

              {err && <div className="text-xs text-red-500 inline-flex items-center gap-1" data-testid="food-reservation-error"><AlertTriangle size={12} /> {err}</div>}

              {!customer && (
                <div className="rounded-lg bg-secondary/60 p-3 text-[11px] text-muted-foreground">
                  Réservez comme invité · Continue as guest. <button type="button" onClick={() => openLogin?.()} className="underline font-semibold" data-testid="food-reservation-login-cta">Ou connectez-vous · Sign in</button> pour retrouver vos réservations.
                </div>
              )}
            </>
          )}

          {created && (
            <div className="text-center space-y-3 py-4" data-testid="food-reservation-success">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
                <CheckCircle2 size={30} />
              </div>
              <div>
                <div className="text-xl font-bold">Demande envoyée · Request sent</div>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Le restaurant confirmera votre réservation sous peu. Un e-mail vous sera envoyé si vous en avez fourni un. · The restaurant will confirm shortly.</p>
              </div>
              <div className="inline-block text-xs px-3 py-1.5 rounded-full font-semibold" style={{ backgroundColor: `${GREEN}22`, color: GREEN }} data-testid="food-reservation-reference">
                {created.booking_reference}
              </div>
            </div>
          )}
        </div>

        {!created && !loading && config?.enabled && !config?.paused && (
          <footer className="border-t border-border p-4 flex items-center gap-3 shrink-0 bg-background">
            <button onClick={onClose} className="h-10 px-4 rounded-lg text-sm font-semibold bg-secondary hover:bg-secondary/80" data-testid="food-reservation-cancel">Annuler · Cancel</button>
            <button onClick={submit} disabled={!canSubmit || busy}
                    data-testid="food-reservation-submit"
                    className="flex-1 h-10 rounded-lg text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: GREEN }}>
              {busy && <Loader2 size={14} className="animate-spin" />} Réserver · Book
              {selectedSlot && <span className="text-[11px] opacity-80">· {selectedSlot.slot}</span>}
            </button>
          </footer>
        )}
        {created && (
          <footer className="border-t border-border p-4 flex gap-3 shrink-0 bg-background">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: GREEN }} data-testid="food-reservation-done">Terminer · Done</button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default ReservationModal;
