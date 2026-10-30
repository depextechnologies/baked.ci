/**
 * PartnerReservationSettingsPage — configure the restaurant's reservation
 * capacity, slot interval, party-size range, lead time, opening hours,
 * blackout dates, and audio-notification preferences.
 *
 * Route: /partner/food/settings
 */
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Save, PlusCircle, XCircle, Volume2, AlertTriangle, Clock } from "lucide-react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";
import { useRestaurantNotifications } from "../components/RestaurantNotificationEngine";

const GREEN = "#00A651";
const DAYS = [
  { key: "mon", fr: "Lundi",    en: "Monday" },
  { key: "tue", fr: "Mardi",    en: "Tuesday" },
  { key: "wed", fr: "Mercredi", en: "Wednesday" },
  { key: "thu", fr: "Jeudi",    en: "Thursday" },
  { key: "fri", fr: "Vendredi", en: "Friday" },
  { key: "sat", fr: "Samedi",   en: "Saturday" },
  { key: "sun", fr: "Dimanche", en: "Sunday" },
];

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
    {children}
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </label>
);

export const PartnerReservationSettingsPage = () => {
  const { restaurant, refresh } = useFoodPartner() || {};
  const { testSound, audioReady, armAudio } = useRestaurantNotifications() || {};
  const [state, setState]         = useState(null);
  const [enabled, setEnabled]     = useState(false);
  const [pausedUntil, setPaused]  = useState(null);
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState(0);
  const [err, setErr]             = useState("");

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurant.id}/reservation-settings`);
      setState(data.settings);
      setEnabled(!!data.enabled);
      setPaused(data.paused_until);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
  }, [restaurant?.id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await partnerApi.put(`/food/manage/${restaurant.id}/reservation-settings`, state);
      setSavedAt(Date.now());
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async () => {
    setSaving(true); setErr("");
    try {
      const { data } = await partnerApi.patch(`/food/manage/${restaurant.id}/reservation-toggle`, { enabled: !enabled });
      setEnabled(data.enabled);
      setPaused(data.paused_until);
      await refresh?.();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setSaving(false); }
  };

  const pause = async (hours) => {
    setSaving(true); setErr("");
    try {
      const { data } = await partnerApi.patch(`/food/manage/${restaurant.id}/reservation-toggle`, { pause_hours: hours });
      setPaused(data.paused_until);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setSaving(false); }
  };

  const setField = (k, v) => setState((s) => ({ ...s, [k]: v }));
  const setDayRange = (key, idx, side, value) => setState((s) => {
    const hours = { ...(s.hours || {}) };
    const day = [...(hours[key] || [])];
    day[idx] = side === "start" ? [value, day[idx][1]] : [day[idx][0], value];
    hours[key] = day;
    return { ...s, hours };
  });
  const addDayRange = (key) => setState((s) => {
    const hours = { ...(s.hours || {}) };
    hours[key] = [...(hours[key] || []), ["12:00", "14:30"]];
    return { ...s, hours };
  });
  const removeDayRange = (key, idx) => setState((s) => {
    const hours = { ...(s.hours || {}) };
    hours[key] = (hours[key] || []).filter((_, i) => i !== idx);
    return { ...s, hours };
  });
  const closeDay = (key) => setState((s) => ({ ...s, hours: { ...(s.hours || {}), [key]: [] } }));

  const addBlackout = (iso) => setState((s) => {
    const set = new Set(s.blackout_dates || []);
    set.add(iso);
    return { ...s, blackout_dates: Array.from(set).sort() };
  });
  const removeBlackout = (iso) => setState((s) => ({ ...s, blackout_dates: (s.blackout_dates || []).filter((x) => x !== iso) }));

  if (!state) return <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>;

  return (
    <div className="space-y-5" data-testid="partner-reservation-settings-page">
      <div>
        <h1 className="text-2xl font-bold">Paramètres réservations <span className="text-muted-foreground text-lg font-medium">· Reservation settings</span></h1>
        <p className="text-sm text-muted-foreground">Configurez la disponibilité de votre restaurant. · Configure your reservation availability.</p>
      </div>

      {err && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

      {/* Enable + pause */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="text-sm font-semibold">Accepter les réservations · Accept reservations</div>
            <div className="text-xs text-muted-foreground">Activez pour afficher le bouton "Réserver" sur votre page. · Show the "Book" button on your page.</div>
          </div>
          <button onClick={toggleEnabled} disabled={saving}
                  data-testid="partner-reservations-toggle"
                  className={`h-9 px-4 rounded-lg text-sm font-semibold ${enabled ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
            {enabled ? "Désactiver · Turn off" : "Activer · Turn on"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock size={12} /> Pause temporaire · Temporary pause</span>
          {[1, 2, 4, 12, 24].map((h) => (
            <button key={h} onClick={() => pause(h)} disabled={saving}
                    className="h-8 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80"
                    data-testid={`partner-reservations-pause-${h}h`}>{h}h</button>
          ))}
          {pausedUntil && (
            <>
              <span className="text-[11px] text-orange-600 ml-2">Pause jusqu'à {new Date(pausedUntil).toLocaleString()}</span>
              <button onClick={() => pause(0)} disabled={saving}
                      className="h-8 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80"
                      data-testid="partner-reservations-pause-clear">Reprendre · Resume</button>
            </>
          )}
        </div>
      </div>

      {/* Capacity + windows */}
      <div className="rounded-2xl border border-border bg-card p-4 grid gap-4 md:grid-cols-2">
        <Field label="Capacité par créneau · Slot capacity" hint="Nombre max. de couverts par créneau · Max seats per slot">
          <input type="number" min={1} value={state.slot_capacity}
                 onChange={(e) => setField("slot_capacity", parseInt(e.target.value || 0, 10))}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-settings-capacity" />
        </Field>
        <Field label="Intervalle des créneaux · Slot interval">
          <select value={state.slot_interval_minutes}
                  onChange={(e) => setField("slot_interval_minutes", parseInt(e.target.value, 10))}
                  className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                  data-testid="partner-settings-interval">
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </Field>
        <Field label="Personnes min · Min party">
          <input type="number" min={1} max={40} value={state.min_party_size}
                 onChange={(e) => setField("min_party_size", parseInt(e.target.value || 1, 10))}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-settings-min-party" />
        </Field>
        <Field label="Personnes max · Max party">
          <input type="number" min={1} max={40} value={state.max_party_size}
                 onChange={(e) => setField("max_party_size", parseInt(e.target.value || 1, 10))}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-settings-max-party" />
        </Field>
        <Field label="Délai minimum · Min lead time (min)">
          <input type="number" min={0} value={state.min_lead_time_minutes}
                 onChange={(e) => setField("min_lead_time_minutes", parseInt(e.target.value || 0, 10))}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-settings-lead" />
        </Field>
        <Field label="Réservations à l'avance · Advance days" hint="Jours d'ouverture des réservations · Days ahead">
          <input type="number" min={1} max={365} value={state.advance_booking_days}
                 onChange={(e) => setField("advance_booking_days", parseInt(e.target.value || 1, 10))}
                 className="h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="partner-settings-advance" />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!state.auto_confirm} onChange={(e) => setField("auto_confirm", e.target.checked)} data-testid="partner-settings-auto-confirm" />
          <span>Confirmer automatiquement les nouvelles réservations · Auto-confirm new reservations</span>
        </label>
      </div>

      {/* Hours */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">Horaires de réservation · Reservation hours</div>
        <div className="text-xs text-muted-foreground">Ajoutez plusieurs plages par jour (déjeuner + dîner). · Multiple ranges per day (lunch + dinner).</div>
        {DAYS.map((d) => {
          const ranges = state.hours?.[d.key] || [];
          const closed = ranges.length === 0;
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-2 py-1" data-testid={`partner-settings-day-${d.key}`}>
              <div className="w-28 text-sm font-medium">{d.fr}</div>
              {closed ? (
                <>
                  <span className="text-xs text-muted-foreground flex-1">Fermé · Closed</span>
                  <button onClick={() => addDayRange(d.key)} className="h-8 px-3 rounded-lg text-xs bg-secondary hover:bg-secondary/80" data-testid={`partner-settings-day-open-${d.key}`}>Ouvrir · Open</button>
                </>
              ) : (
                <>
                  {ranges.map((r, idx) => (
                    <div key={idx} className="inline-flex items-center gap-1">
                      <input type="time" value={r[0]} onChange={(e) => setDayRange(d.key, idx, "start", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                      <span className="text-xs">→</span>
                      <input type="time" value={r[1]} onChange={(e) => setDayRange(d.key, idx, "end", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                      <button onClick={() => removeDayRange(d.key, idx)} className="text-red-500 hover:opacity-80"><XCircle size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => addDayRange(d.key)} className="h-7 px-2 rounded-lg text-[11px] bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1"><PlusCircle size={11} /> Ajouter</button>
                  <button onClick={() => closeDay(d.key)} className="h-7 px-2 rounded-lg text-[11px] bg-red-500/10 text-red-500 ml-auto">Fermer · Close</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Blackout dates */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold">Dates bloquées · Blackout dates</div>
        <div className="flex flex-wrap gap-2">
          {(state.blackout_dates || []).map((d) => (
            <span key={d} className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-500 inline-flex items-center gap-1" data-testid={`partner-settings-blackout-${d}`}>
              {d} <button onClick={() => removeBlackout(d)}><XCircle size={11} /></button>
            </span>
          ))}
          <BlackoutAdder onAdd={addBlackout} />
        </div>
      </div>

      {/* Notification sounds */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold inline-flex items-center gap-2"><Volume2 size={14} /> Notifications sonores · Sound alerts</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!state.sound_new_reservation} onChange={(e) => setField("sound_new_reservation", e.target.checked)} data-testid="partner-settings-sound-reservation" />
          <span>Alerte sonore pour nouvelles réservations · Sound for new reservations</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!state.sound_new_order} onChange={(e) => setField("sound_new_order", e.target.checked)} data-testid="partner-settings-sound-order" />
          <span>Alerte sonore pour nouvelles commandes · Sound for new orders</span>
        </label>
        <label className="block text-sm space-y-1">
          <span>Volume · Volume</span>
          <input type="range" min={0} max={1} step={0.1} value={state.sound_volume}
                 onChange={(e) => setField("sound_volume", parseFloat(e.target.value))}
                 className="w-full"
                 data-testid="partner-settings-volume" />
        </label>
        <div className="flex gap-2">
          <button onClick={async () => { if (!audioReady) await armAudio?.(); testSound?.(); }}
                  className="h-9 px-4 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1"
                  data-testid="partner-settings-test-sound">
            <Volume2 size={12} /> Tester le son · Test sound
          </button>
          {!audioReady && <span className="text-[11px] text-orange-600 self-center">Les navigateurs bloquent le son avant interaction · Browsers block audio before interaction</span>}
        </div>
      </div>

      <div className="sticky bottom-4 bg-background/60 backdrop-blur p-2 rounded-2xl flex items-center gap-3">
        <button onClick={save} disabled={saving}
                data-testid="partner-settings-save"
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: GREEN }}>
          {saving && <Loader2 size={14} className="animate-spin" />} <Save size={14} /> Enregistrer · Save
        </button>
        {savedAt > 0 && Date.now() - savedAt < 4000 && <span className="text-xs text-green-600" data-testid="partner-settings-saved">Enregistré · Saved</span>}
      </div>
    </div>
  );
};

const BlackoutAdder = ({ onAdd }) => {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input type="date" value={v} onChange={(e) => setV(e.target.value)} className="h-7 rounded border border-border bg-secondary/40 px-2 text-xs" data-testid="partner-settings-blackout-input" />
      <button onClick={() => { if (v) { onAdd(v); setV(""); } }} className="h-7 px-2 rounded-lg text-[11px] bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1" data-testid="partner-settings-blackout-add"><PlusCircle size={11} /> Ajouter</button>
    </span>
  );
};

export default PartnerReservationSettingsPage;
