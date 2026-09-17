import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation2, Edit3, ChevronRight, Star, ShieldCheck, Clock, Info, PhoneCall, Home, DoorOpen, PenSquare, ArrowLeft, ArrowUp, ArrowDown, CheckCircle2, Package, Plus, Trash2, Truck, Bike } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { ExpressHeader, WizardProgress, ExpressFooter, useMoney } from "../../components/express/ExpressLayout";
import { CityAutocomplete } from "../../components/express/CityAutocomplete";
import { ExpressWizardShell } from "../../components/express/ExpressWizardShell";
import { vehicleImage } from "../../lib/expressAssets";

const useSteps = () => {
  const { t } = useTranslation("customer");
  return useMemo(() => ([
    { code: "location", label: t("send.wizard.step_location") },
    { code: "receiver", label: t("send.wizard.step_receiver") },
    { code: "details",  label: t("send.wizard.step_details") },
    { code: "book",     label: t("send.wizard.step_book") },
  ]), [t]);
};

// ---------------- STEP 1: Pickup & Drop ----------------
export const ExpressStepLocation = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { openAddressSelector } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const STEPS = useSteps();
  const isBetween = draft.service_type === "between_cities";

  const pickPickup = () => openAddressSelector({
    title: t("send.wizard.pickup_location"),
    onPick: (addr) => setDraft({ pickup: addr }),
  });
  const pickDrop = () => openAddressSelector({
    title: t("send.wizard.dropoff_location"),
    onPick: (addr) => setDraft({ drop: addr }),
  });

  const ok = draft.pickup && draft.drop;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_pickup_drop")} step={1} />
      <WizardProgress steps={STEPS} current={0} />
      <ExpressWizardShell>
        <div className="space-y-3">
          {isBetween ? (
            <>
              <div className="baked-card border p-3" style={{ borderColor: "#FCC44C55", backgroundColor: "#FCC44C0A" }}>
                <div className="text-sm font-bold">{t("send.wizard.between_note_title")}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{t("send.wizard.between_note_body")}</div>
              </div>
              <CityAutocomplete
                testid="exp-pickup-city"
                label={t("send.wizard.origin_city")}
                value={draft.pickup}
                onPick={(a) => setDraft({ pickup: a })}
                placeholder={t("send.wizard.between_city_placeholder")}
              />
              <CityAutocomplete
                testid="exp-drop-city"
                label={t("send.wizard.destination_city")}
                value={draft.drop}
                onPick={(a) => setDraft({ drop: a })}
                placeholder={t("send.wizard.between_city_placeholder")}
              />
              {ok && <BetweenCitiesRouteStrip pickup={draft.pickup} drop={draft.drop} />}
            </>
          ) : (
            <>
              <AddressField testid="exp-pickup" label={t("send.wizard.pickup_location")} address={draft.pickup} onEdit={pickPickup} tone="#FCC44C" hint={t("send.wizard.tap_to_choose")} />
              <AddressField testid="exp-drop" label={t("send.wizard.dropoff_location")} address={draft.drop} onEdit={pickDrop} tone="#FCC44C" hint={t("send.wizard.tap_to_choose")} />
            </>
          )}
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/receiver")} disabled={!ok} />
    </div>
  );
};

/**
 * Phase D — Between-Cities inline "route strip". Shows origin → destination
 * with the driving distance + ETA so the customer sees the trip metrics
 * before they reach Step 4. Uses the Google `DirectionsService` when the
 * map key is available; falls back to a haversine estimate otherwise.
 */
const BetweenCitiesRouteStrip = ({ pickup, drop }) => {
  const { t } = useTranslation("customer");
  const [meta, setMeta] = React.useState(null);

  useEffect(() => {
    setMeta(null);
    if (!pickup || !drop) return;
    let cancelled = false;
    (async () => {
      try {
        // The Places-New loader is async — DirectionsService may not exist
        // at first render. `importLibrary` waits for it without triggering
        // a second script load.
        if (window.google?.maps?.importLibrary) {
          await window.google.maps.importLibrary("routes");
        }
        if (!window.google?.maps?.DirectionsService) return;
        const svc = new window.google.maps.DirectionsService();
        svc.route({
          origin: { lat: pickup.latitude, lng: pickup.longitude },
          destination: { lat: drop.latitude, lng: drop.longitude },
          travelMode: window.google.maps.TravelMode.DRIVING,
        }, (res, status) => {
          if (cancelled || status !== "OK") return;
          const leg = res.routes?.[0]?.legs?.[0];
          if (!leg) return;
          setMeta({
            distance_km: (leg.distance?.value || 0) / 1000,
            duration_min: Math.round((leg.duration?.value || 0) / 60),
          });
        });
      } catch { /* fall through to haversine estimate */ }
    })();
    return () => { cancelled = true; };
  }, [pickup?.latitude, pickup?.longitude, drop?.latitude, drop?.longitude]);

  const fallback = React.useMemo(() => {
    if (!pickup || !drop) return null;
    const R = 6371, toRad = (x) => (x * Math.PI) / 180;
    const dlat = toRad(drop.latitude - pickup.latitude);
    const dlng = toRad(drop.longitude - pickup.longitude);
    const a = Math.sin(dlat / 2) ** 2 + Math.cos(toRad(pickup.latitude)) * Math.cos(toRad(drop.latitude)) * Math.sin(dlng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(a));
    return { distance_km: km, duration_min: Math.round(km * 1.2) };
  }, [pickup, drop]);

  const distance = meta?.distance_km ?? fallback?.distance_km;
  const duration = meta?.duration_min ?? fallback?.duration_min;

  return (
    <div
      data-testid="exp-between-route-strip"
      className="baked-card border p-3 flex items-center gap-3"
      style={{ borderColor: "#FCC44C55", backgroundColor: "#FCC44C0A" }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#FCC44C22" }}>
        <Navigation2 size={16} color="#FCC44C" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.trip_summary")}</div>
        <div className="text-xs font-semibold truncate">{pickup.line1 || pickup.formatted_address} → {drop.line1 || drop.formatted_address}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold" data-testid="exp-between-distance">{distance != null ? `${distance.toFixed(0)} km` : "…"}</div>
        <div className="text-[10px] text-muted-foreground" data-testid="exp-between-eta">{duration != null ? `${duration} min` : "…"}</div>
      </div>
    </div>
  );
};

const AddressField = ({ testid, label, address, onEdit, tone = "#FCC44C", hint }) => (
  <button data-testid={testid} onClick={onEdit} className="w-full baked-card border border-border p-4 flex items-start gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#FCC44C]">
    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}>
      <MapPin size={16} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-bold truncate mt-0.5">{address?.formatted_address || hint}</div>
      {address?.city && <div className="text-[11px] text-muted-foreground truncate">{[address.city, address.region, address.country].filter(Boolean).join(" · ")}</div>}
    </div>
    <Edit3 size={14} className="text-muted-foreground shrink-0 mt-1" />
  </button>
);

// ---------------- STEP 2: Receiver ----------------
export const ExpressStepReceiver = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { draft, setDraft } = useExpressBooking();
  const [prefs, setPrefs] = useState([]);
  const r = draft.receiver;
  const STEPS = useSteps();

  useEffect(() => { api.get("/express/delivery-preferences").then((rs) => setPrefs(rs.data)); }, []);

  const patch = (k, v) => setDraft({ receiver: { ...r, [k]: v } });
  const togglePref = (code) => {
    const set = new Set(r.preferences || []);
    if (set.has(code)) set.delete(code); else set.add(code);
    patch("preferences", Array.from(set));
  };

  // Phase D — receiver is now OPTIONAL. Customer may fill in or skip.
  const goNext = () => navigate("/send/book/details");
  const skip = () => {
    setDraft({ receiver: { name: "", phone: "", alt_phone: "", building: "", landmark: "", notes: "", preferences: [] } });
    goNext();
  };
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_receiver")} step={2} />
      <WizardProgress steps={STEPS} current={1} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{t("send.wizard.who_delivering_to")}</div>
          <Field label={t("send.wizard.receiver_name")}><input data-testid="exp-r-name" value={r.name} onChange={(e) => patch("name", e.target.value)} placeholder={t("send.wizard.receiver_name_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.phone_number")}><input data-testid="exp-r-phone" value={r.phone} onChange={(e) => patch("phone", e.target.value)} placeholder={t("send.wizard.phone_ph")} inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.alt_number")}><input data-testid="exp-r-alt-phone" value={r.alt_phone} onChange={(e) => patch("alt_phone", e.target.value)} placeholder={t("send.wizard.alt_ph")} inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.building_apt")}><input data-testid="exp-r-building" value={r.building} onChange={(e) => patch("building", e.target.value)} placeholder={t("send.wizard.building_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.landmark")}><input data-testid="exp-r-landmark" value={r.landmark} onChange={(e) => patch("landmark", e.target.value)} placeholder={t("send.wizard.landmark_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.delivery_notes")}><textarea data-testid="exp-r-notes" value={r.notes} onChange={(e) => patch("notes", e.target.value)} rows={3} placeholder={t("send.wizard.delivery_notes_ph")} className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" /></Field>

          <div>
            <div className="text-xs font-semibold mt-3 mb-2">{t("send.wizard.delivery_preferences")}</div>
            <div className="grid gap-2">
              {prefs.map((p) => {
                const active = (r.preferences || []).includes(p.code);
                const Icon = p.code === "call_before" ? PhoneCall : p.code === "leave_at_door" ? DoorOpen : PenSquare;
                return (
                  <button key={p.code} data-testid={`exp-r-pref-${p.code}`} onClick={() => togglePref(p.code)} className={`baked-card border p-3 flex items-center gap-3 text-left motion-fast active:scale-[0.995] ${active ? "border-[#FCC44C] bg-[#FCC44C14]" : "border-border"}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={15} /></div>
                    <div className="flex-1"><div className="text-sm font-semibold">{p.label}</div><div className="text-[10px] text-muted-foreground">{p.description}</div></div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${active ? "border-[#FCC44C] bg-[#FCC44C]" : "border-border"}`}>{active && <CheckCircle2 size={13} className="text-black" />}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ExpressWizardShell>
      <div className="border-t border-border bg-background/70 backdrop-blur px-4 pt-3 pb-4 flex items-center gap-2">
        <button
          data-testid="exp-receiver-skip"
          onClick={skip}
          className="h-11 px-4 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-[#FCC44C55] motion-fast"
        >
          {t("send.wizard.skip_for_now")}
        </button>
        <button
          data-testid="exp-receiver-continue"
          onClick={goNext}
          className="flex-1 h-11 rounded-2xl font-bold text-black motion-fast active:scale-[0.99]"
          style={{ backgroundColor: "#FCC44C" }}
        >
          {t("common.continue", { defaultValue: "Continuer" })}
        </button>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</div>
    {children}
  </label>
);

// ---------------- Route Summary strip reused across steps 3-4 ----------------
const RouteSummary = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { draft } = useExpressBooking();
  return (
    <div className="mx-4 mt-2 baked-card border border-border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.pickup")}</div>
          <div className="text-xs font-semibold truncate">{draft.pickup?.formatted_address || "—"}</div>
        </div>
      </div>
      <div className="border-t border-border" />
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.dropoff")}</div>
          <div className="text-xs font-semibold truncate">{draft.drop?.formatted_address || "—"}</div>
        </div>
        <button data-testid="exp-route-edit" onClick={() => navigate("/send/book/location")} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground">{t("send.wizard.route_edit")}</button>
      </div>
    </div>
  );
};

// ---------------- Shared: service-context header ----------------
const ServiceHeader = () => {
  const { t } = useTranslation("customer");
  const { draft } = useExpressBooking();
  if (!draft.service_type) return null;
  const tileKey = draft.service_type === "fresh_products" ? "fresh"
    : draft.service_type === "between_cities" ? "between_cities"
    : draft.service_type === "multiple_shipments" ? "multi"
    : draft.service_type;
  return (
    <div
      data-testid="exp-service-header"
      className="baked-card border p-3 mb-3 flex items-center gap-3"
      style={{ backgroundColor: "#FCC44C0A", borderColor: "#FCC44C33" }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#FCC44C22" }}>
        <Truck size={16} color="#FCC44C" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.service_label")}</div>
        <div className="text-sm font-bold leading-tight">{t(`send.tile.${tileKey}_title`)}</div>
      </div>
    </div>
  );
};

// ---------------- STEP 3: Item / Service Details (adaptive) ----------------
const FRESH_PRODUCT_TYPES = [
  { code: "fish",       labelKey: "send.wizard.fresh_product_fish" },
  { code: "meat",       labelKey: "send.wizard.fresh_product_meat" },
  { code: "vegetables", labelKey: "send.wizard.fresh_product_vegetables" },
  { code: "other",      labelKey: "send.wizard.fresh_product_other" },
];

/**
 * Phase E — Multi-stop trip builder.
 *
 * Shipments are stored on `draft.stops` as `[{id, pickup, drop}, …]`.
 * Shipment #1 is a live mirror of `draft.pickup` / `draft.drop` (Step 1)
 * so the customer never has to re-enter their first pair. Extra shipments
 * are collected here via the global `openAddressSelector` — same picker
 * Step 1 uses so keyboard/UX behaviour is identical.
 */
const MultiStopBuilder = () => {
  const { t } = useTranslation("customer");
  const { openAddressSelector } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const MAX_STOPS = 8;

  // Keep shipment #1 in perfect sync with the primary pickup/drop. If Step 1
  // is edited the trip builder auto-reflects the change without a full reset.
  useEffect(() => {
    if (!draft.pickup || !draft.drop) return;
    const first = { id: draft.stops?.[0]?.id || "stop_0", pickup: draft.pickup, drop: draft.drop };
    const rest = (draft.stops || []).slice(1);
    const next = [first, ...rest];
    // Cheap equality — avoid setting on every rerender if unchanged.
    const same = JSON.stringify(next) === JSON.stringify(draft.stops || []);
    if (!same) setDraft({ stops: next });
  }, [draft.pickup?.place_id, draft.drop?.place_id]); // eslint-disable-line

  const stops = draft.stops?.length ? draft.stops : (draft.pickup && draft.drop ? [{ id: "stop_0", pickup: draft.pickup, drop: draft.drop }] : []);

  const editStop = (idx, kind) => {
    openAddressSelector({
      title: kind === "pickup" ? t("send.wizard.pickup_location") : t("send.wizard.dropoff_location"),
      onPick: (addr) => {
        const next = stops.map((s, i) => i === idx ? { ...s, [kind]: addr } : s);
        setDraft({ stops: next });
      },
    });
  };

  const addShipment = () => {
    if (stops.length >= MAX_STOPS) return;
    openAddressSelector({
      title: t("send.wizard.new_pickup"),
      onPick: (pickup) => {
        openAddressSelector({
          title: t("send.wizard.new_dropoff"),
          onPick: (drop) => {
            setDraft({ stops: [...stops, { id: `stop_${Date.now()}`, pickup, drop }] });
          },
        });
      },
    });
  };

  const removeShipment = (idx) => {
    if (idx === 0) return; // first shipment is bound to Step 1
    setDraft({ stops: stops.filter((_, i) => i !== idx) });
  };

  const move = (idx, delta) => {
    if (idx === 0 && delta < 0) return;
    const j = idx + delta;
    if (j < 1 || j >= stops.length) return; // never displace shipment #1
    const next = stops.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft({ stops: next });
  };

  return (
    <div className="baked-card border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">{t("send.wizard.multi_trip_title")}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{t("send.wizard.multi_trip_sub", { count: stops.length })}</div>
        </div>
        <div className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>{stops.length}/{MAX_STOPS}</div>
      </div>

      <div className="mt-3 space-y-2">
        {stops.map((s, idx) => {
          const isFirst = idx === 0;
          return (
            <div
              key={s.id}
              data-testid={`exp-stop-${idx}`}
              className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
                  {idx + 1}
                </div>
                <div className="text-[11px] font-bold flex-1">{t("send.wizard.shipment_n", { n: idx + 1 })}</div>
                <div className="flex items-center gap-0.5">
                  <button
                    data-testid={`exp-stop-${idx}-up`}
                    onClick={() => move(idx, -1)}
                    disabled={idx <= 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-border disabled:opacity-30 hover:border-[#FCC44C55] motion-fast"
                    aria-label={t("send.wizard.move_up")}
                  ><ArrowUp size={12} /></button>
                  <button
                    data-testid={`exp-stop-${idx}-down`}
                    onClick={() => move(idx, +1)}
                    disabled={idx === 0 || idx >= stops.length - 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-border disabled:opacity-30 hover:border-[#FCC44C55] motion-fast"
                    aria-label={t("send.wizard.move_down")}
                  ><ArrowDown size={12} /></button>
                  {!isFirst && (
                    <button
                      data-testid={`exp-stop-${idx}-remove`}
                      onClick={() => removeShipment(idx)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center border border-border hover:border-red-400/40 hover:text-red-400 motion-fast"
                      aria-label={t("send.wizard.remove")}
                    ><Trash2 size={12} /></button>
                  )}
                </div>
              </div>

              <button
                data-testid={`exp-stop-${idx}-pickup`}
                onClick={() => !isFirst && editStop(idx, "pickup")}
                disabled={isFirst}
                className="w-full flex items-start gap-2 text-left rounded-xl border border-border bg-background/60 p-2 disabled:opacity-90 hover:border-[#FCC44C55] motion-fast"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.pickup")}</div>
                  <div className="text-xs font-semibold truncate">{s.pickup?.formatted_address || "—"}</div>
                </div>
                {!isFirst && <Edit3 size={12} className="text-muted-foreground shrink-0 mt-1" />}
              </button>
              <button
                data-testid={`exp-stop-${idx}-drop`}
                onClick={() => !isFirst && editStop(idx, "drop")}
                disabled={isFirst}
                className="w-full flex items-start gap-2 text-left rounded-xl border border-border bg-background/60 p-2 disabled:opacity-90 hover:border-[#FCC44C55] motion-fast"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.dropoff")}</div>
                  <div className="text-xs font-semibold truncate">{s.drop?.formatted_address || "—"}</div>
                </div>
                {!isFirst && <Edit3 size={12} className="text-muted-foreground shrink-0 mt-1" />}
              </button>
              {isFirst && (
                <div className="text-[10px] text-muted-foreground pl-1">{t("send.wizard.first_stop_hint")}</div>
              )}
            </div>
          );
        })}
      </div>

      <button
        data-testid="exp-multi-add"
        onClick={addShipment}
        disabled={stops.length >= MAX_STOPS}
        className="mt-3 w-full h-11 rounded-2xl border border-dashed border-border hover:border-[#FCC44C] hover:text-[#FCC44C] disabled:opacity-40 disabled:cursor-not-allowed motion-fast text-sm font-bold flex items-center justify-center gap-2"
      >
        <Plus size={14} />
        {stops.length >= MAX_STOPS ? t("send.wizard.multi_max_reached") : t("send.wizard.add_shipment")}
      </button>
    </div>
  );
};

export const ExpressStepDetails = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const [types, setTypes] = useState([]);
  const [tiers, setTiers] = useState([]);
  const p = draft.package;
  const STEPS = useSteps();
  const isFresh = draft.service_type === "fresh_products";
  const isMulti = draft.service_type === "multiple_shipments";
  const isBetween = draft.service_type === "between_cities";

  useEffect(() => {
    if (!isFresh) {
      api.get(`/express/package-types?country=${country?.code || "CI"}`).then((r) => setTypes(r.data));
    }
    api.get("/express/weight-tiers").then((r) => setTiers(r.data));
  }, [country?.code, isFresh]);

  const setPkg = (k, v) => setDraft({ package: { ...p, [k]: v } });
  const setFresh = (k, v) => setDraft({ package: { ...p, fresh: { ...(p.fresh || { unit: "kg" }), [k]: v } } });
  const setDim = (k, v) => setDraft({ package: { ...p, dimensions: { ...(p.dimensions || {}), [k]: v } } });

  const dimPlaceholder = (k) => {
    if (k === "length") return t("send.wizard.dim_length");
    if (k === "width") return t("send.wizard.dim_width");
    return t("send.wizard.dim_height");
  };

  // Details step never blocks the flow: weight_range gets a sensible default.
  const canContinue = isFresh
    ? Boolean(p.fresh?.type && p.fresh?.quantity)
    : Boolean(p.type && p.weight_range);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_details")} step={3} />
      <WizardProgress steps={STEPS} current={2} />
      <ExpressWizardShell>
        <div className="space-y-4">
          <ServiceHeader />

          {isMulti && <MultiStopBuilder />}
          {isBetween && (
            <div className="baked-card border p-3" style={{ borderColor: "#FCC44C55", backgroundColor: "#FCC44C0A" }}>
              <div className="text-sm font-bold">{t("send.wizard.between_note_title")}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{t("send.wizard.between_note_body")}</div>
            </div>
          )}

          {isFresh ? (
            <>
              <div>
                <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.fresh_product_type")}</div>
                <div className="flex flex-wrap gap-2">
                  {FRESH_PRODUCT_TYPES.map((tp) => {
                    const active = p.fresh?.type === tp.code;
                    return (
                      <button
                        key={tp.code}
                        data-testid={`exp-fresh-type-${tp.code}`}
                        onClick={() => setFresh("type", tp.code)}
                        className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}
                      >
                        {active && <CheckCircle2 size={11} className="inline mr-1" />}{t(tp.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.fresh_approx_quantity")}</div>
                <div className="flex gap-2">
                  <input
                    data-testid="exp-fresh-qty"
                    inputMode="decimal"
                    value={p.fresh?.quantity ?? ""}
                    onChange={(e) => setFresh("quantity", e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0"
                    className="flex-1 baked-input h-11 px-3 border border-border bg-secondary/40 text-sm"
                  />
                  <div className="flex rounded-2xl border border-border overflow-hidden">
                    {["kg", "tonnes"].map((u) => {
                      const active = (p.fresh?.unit || "kg") === u;
                      return (
                        <button
                          key={u}
                          data-testid={`exp-fresh-unit-${u}`}
                          onClick={() => setFresh("unit", u)}
                          className={`h-11 px-4 text-xs font-bold motion-fast ${active ? "text-black" : "text-muted-foreground"}`}
                          style={active ? { backgroundColor: "#FCC44C" } : {}}
                        >
                          {t(`send.wizard.unit_${u}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <Field label={t("send.wizard.additional_info")}>
                <textarea data-testid="exp-pkg-notes" value={p.notes} maxLength={150} onChange={(e) => setPkg("notes", e.target.value)} rows={3} placeholder={t("send.wizard.additional_info_ph")} className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" />
                <div className="text-[10px] text-muted-foreground text-right">{(p.notes || "").length}/150</div>
              </Field>
            </>
          ) : (
            <>
              <div>
                <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_type")}</div>
                <div className="flex flex-wrap gap-2">
                  {types.map((tp) => {
                    const active = p.type === tp.code;
                    return (
                      <button key={tp.code} data-testid={`exp-pkg-type-${tp.code}`} onClick={() => setPkg("type", tp.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                        {active && <CheckCircle2 size={11} className="inline mr-1" />}{tp.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_weight")}</div>
                <div className="flex flex-wrap gap-2">
                  {tiers.map((tr) => {
                    const active = p.weight_range === tr.code;
                    return (
                      <button key={tr.code} data-testid={`exp-pkg-weight-${tr.code}`} onClick={() => setPkg("weight_range", tr.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                        {tr.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_dimensions")} <span className="text-muted-foreground">{t("send.wizard.optional")}</span></div>
                <div className="grid grid-cols-3 gap-2">
                  {["length", "width", "height"].map((k) => (
                    <input key={k} data-testid={`exp-pkg-dim-${k}`} inputMode="numeric" value={p.dimensions?.[k] ?? ""} onChange={(e) => setDim(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={dimPlaceholder(k)} className="baked-input h-11 px-3 border border-border bg-secondary/40 text-sm" />
                  ))}
                </div>
              </div>
              <Field label={t("send.wizard.additional_info")}>
                <textarea data-testid="exp-pkg-notes" value={p.notes} maxLength={150} onChange={(e) => setPkg("notes", e.target.value)} rows={3} placeholder={t("send.wizard.additional_info_ph")} className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" />
                <div className="text-[10px] text-muted-foreground text-right">{(p.notes || "").length}/150</div>
              </Field>
            </>
          )}
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/vehicle")} disabled={!canContinue} />
    </div>
  );
};

// Back-compat alias: `/send/book/package` was the old Step 4; the exported
// symbol is preserved so any lingering route/link stays functional.
export const ExpressStepPackage = ExpressStepDetails;

// ---------------- STEP 4: Vehicle & Booking (merged) ----------------
export const ExpressStepBook = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country } = useApp();
  const { customer, openLogin } = useAuth();
  const { draft, setDraft, resetDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const [quotes, setQuotes] = useState({});   // { vehicle_code: quote }
  const [openInfo, setOpenInfo] = useState(null); // vehicle_code whose breakdown is expanded
  const [promo, setPromo] = useState(draft.promo_code || "");
  const [promoApplied, setPromoApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const money = useMoney();
  const STEPS = useSteps();

  // Fetch eligible vehicles for the current service_type. No hard-coding
  // — the config table on the backend is the only source of truth.
  useEffect(() => {
    const params = new URLSearchParams({ country: country?.code || "CI" });
    if (draft.service_type) params.set("service_type", draft.service_type);
    api.get(`/express/vehicles?${params.toString()}`).then((r) => {
      setVehicles(r.data);
      if (draft.vehicle_code && !r.data.some((v) => v.code === draft.vehicle_code)) {
        setDraft({ vehicle_code: null });
      }
    });
  }, [country?.code, draft.service_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch a live quote per eligible vehicle so the customer sees prices
  // side-by-side without opening a breakdown.
  const fetchQuotes = async (withPromo) => {
    if (!draft.pickup || !draft.drop || vehicles.length === 0) return;
    const isMultiTrip = draft.service_type === "multiple_shipments" && (draft.stops?.length || 0) >= 1;
    const entries = await Promise.all(vehicles.map(async (v) => {
      try {
        let data;
        if (isMultiTrip) {
          const stops = (draft.stops || []).map((s) => ({
            pickup: { lat: s.pickup.latitude, lng: s.pickup.longitude },
            drop:   { lat: s.drop.latitude,   lng: s.drop.longitude },
          }));
          ({ data } = await api.post("/express/quote/multi_stop", {
            country: country?.code || "CI",
            vehicle_code: v.code,
            stops,
            promo_code: withPromo || undefined,
          }));
        } else {
          ({ data } = await api.post("/express/quote/parcel", {
            country: country?.code || "CI",
            vehicle_code: v.code,
            pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
            drop_lat: draft.drop.latitude, drop_lng: draft.drop.longitude,
            promo_code: withPromo || undefined,
          }));
        }
        return [v.code, data];
      } catch { return [v.code, null]; }
    }));
    setQuotes(Object.fromEntries(entries));
  };
  useEffect(() => { fetchQuotes(); /* eslint-disable-line */ }, [vehicles, draft.pickup, draft.drop, draft.stops, country?.code]);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    await fetchQuotes(promo.trim());
    setPromoApplied(true);
    toast.info(t("send.wizard.promo_applied"));
  };

  const cheapestCode = useMemo(() => {
    const eligible = Object.entries(quotes).filter(([, q]) => q?.total != null);
    if (!eligible.length) return null;
    return eligible.sort((a, b) => a[1].total - b[1].total)[0][0];
  }, [quotes]);

  const selectedQuote = draft.vehicle_code ? quotes[draft.vehicle_code] : null;

  const book = async () => {
    if (!draft.vehicle_code) { toast.info(t("send.wizard.pick_vehicle_first", { defaultValue: "Choisissez un véhicule" })); return; }
    if (!customer) { openLogin("/send/book/vehicle"); return; }
    setBusy(true);
    try {
      // For Fresh Products, compact the produce type + quantity into
      // package_notes so the driver + admin see the payload without a
      // schema change.
      const p = draft.package || {};
      const freshLine = p.fresh?.type
        ? `[FRESH] ${p.fresh.type} · ${p.fresh.quantity || 0} ${p.fresh.unit || "kg"}`
        : "";
      const notes = [freshLine, p.notes].filter(Boolean).join("\n");
      const { data } = await api.post("/express/bookings/parcel", {
        country: country?.code || "CI",
        vehicle_code: draft.vehicle_code,
        service_type: draft.service_type,
        pickup: draft.pickup,
        drop: draft.drop,
        stops: draft.service_type === "multiple_shipments" && draft.stops?.length
          ? draft.stops.map((s) => ({
              pickup: { lat: s.pickup.latitude, lng: s.pickup.longitude, formatted_address: s.pickup.formatted_address, line1: s.pickup.line1 },
              drop:   { lat: s.drop.latitude,   lng: s.drop.longitude,   formatted_address: s.drop.formatted_address,   line1: s.drop.line1 },
            }))
          : undefined,
        receiver: draft.receiver,
        package_type: p.type || "general_parcel",
        package_weight_range: p.weight_range || "up_to_5kg",
        package_dimensions: p.dimensions,
        package_notes: notes || undefined,
        promo_code: selectedQuote?.promo?.code,
        payment_method: "cod",
      });
      resetDraft();
      navigate(`/send/booking/${data.id}?success=1`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("send.wizard.booking_failed"));
    } finally { setBusy(false); }
  };

  if (!draft.pickup || !draft.drop) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExpressHeader title={t("send.wizard.header_book")} step={4} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-sm font-semibold">{t("send.wizard.booking_incomplete")}</div>
          <button onClick={() => navigate("/send/book/location")} className="mt-4 baked-btn h-11 px-6 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.restart_booking")}</button>
        </div>
      </div>
    );
  }

  // Phase D — Send-by-Motorcycle deliberately cross-sells the 3 CARGO
  // alternatives after the primary bike. All other services just list
  // their eligible vehicles.
  const isMoto = draft.service_type === "moto";
  const primary = isMoto ? vehicles.filter((v) => v.code === "bike") : vehicles;
  const alternatives = isMoto ? vehicles.filter((v) => v.code !== "bike") : [];

  const renderCard = (v) => {
    const q = quotes[v.code];
    const isBest = v.code === cheapestCode;
    const selected = draft.vehicle_code === v.code;
    const displayName = v.name_fr || v.name;
    const info = openInfo === v.code;
    return (
      <div key={v.code} className={`baked-card border overflow-hidden motion-fast ${selected ? "border-[#FCC44C]" : "border-border hover:border-[#FCC44C44]"}`}>
        <button
          data-testid={`exp-veh-${v.code}`}
          onClick={() => setDraft({ vehicle_code: v.code })}
          className={`w-full p-3 flex items-center gap-3 text-left ${selected ? "bg-[#FCC44C14]" : ""}`}
        >
          <div className="w-20 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 55%, #FCC44C22, transparent 65%)` }}>
            <img src={vehicleImage(v.code)} alt={displayName} className="max-h-14 max-w-full w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" loading="lazy" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold">{displayName}</div>
              {isBest && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Star size={9} className="inline mr-0.5" />{t("send.wizard.best_badge")}</span>}
            </div>
            <div className="text-[11px] text-muted-foreground">{t("send.wizard.up_to_kg", { kg: v.max_weight_kg })} · {v.description}</div>
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: "#FCC44C" }}>{t("send.wizard.eta_range", { min: v.eta_min_min, max: v.eta_min_max })}</div>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            <div className="text-sm font-bold" data-testid={`exp-veh-price-${v.code}`}>{q ? money(q.total) : "…"}</div>
            <div className="text-[10px] text-muted-foreground">{t("send.wizard.est_short")}</div>
            {q && (
              <button
                data-testid={`exp-veh-info-${v.code}`}
                onClick={(e) => { e.stopPropagation(); setOpenInfo(info ? null : v.code); }}
                aria-label={t("send.wizard.info_price_breakdown")}
                className="w-6 h-6 rounded-full flex items-center justify-center border border-border hover:border-[#FCC44C55] hover:text-[#FCC44C] motion-fast"
              >
                <Info size={12} />
              </button>
            )}
          </div>
        </button>
        {info && q && (
          <div data-testid={`exp-veh-breakdown-${v.code}`} className="px-3 pb-3 pt-0">
            <div className="rounded-xl border border-dashed border-border p-3 space-y-1 text-xs">
              <Row label={t("send.wizard.base_fare")} value={money(q.base_fare)} />
              <Row label={t("send.wizard.distance", { km: q.distance_km })} value={money(q.distance_fare)} />
              <Row label={t("send.wizard.time", { min: q.duration_min })} value={money(q.time_fare)} />
              {q.extra_stop_surcharge > 0 && <Row label={t("send.wizard.extra_stop_surcharge", { count: q.extra_stops })} value={money(q.extra_stop_surcharge)} />}
              {q.surcharge > 0 && <Row label={t("send.wizard.surcharge")} value={money(q.surcharge)} />}
              <Row label={t("send.wizard.service_fee")} value={money(q.service_fee)} tone />
              <Row label={t("send.wizard.insurance")} value={money(q.insurance)} tone />
              {q.taxes > 0 && <Row label={t("send.wizard.taxes")} value={money(q.taxes)} tone />}
              {q.promo_discount > 0 && <Row label={t("send.wizard.promo_line", { code: q.promo?.code })} value={`− ${money(q.promo_discount)}`} tone="#FCC44C" />}
              <div className="border-t border-border my-1.5" />
              <Row label={<strong>{t("send.wizard.estimated_total")}</strong>} value={<strong data-testid={`exp-veh-total-${v.code}`}>{money(q.total)}</strong>} />
              <div className="text-[10px] text-muted-foreground mt-0.5">{t("send.wizard.all_prices_inclusive")}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const cta = customer
    ? (selectedQuote
        ? t("send.wizard.book_now_with_price", { price: money(selectedQuote.total) })
        : t("send.wizard.book_now_simple"))
    : t("send.wizard.sign_in_to_book");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_book")} step={4} />
      <WizardProgress steps={STEPS} current={3} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <ServiceHeader />

          {isMoto && primary.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{t("send.wizard.recommended_for_shipment")}</div>
              {primary.map(renderCard)}
            </div>
          )}
          {isMoto && alternatives.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mt-3 mb-2">{t("send.wizard.other_vehicle_options")}</div>
              <div className="space-y-2">{alternatives.map(renderCard)}</div>
            </div>
          )}
          {!isMoto && (
            <div className="space-y-2">
              {vehicles.length === 0 && (
                <div data-testid="exp-veh-empty" className="baked-card border border-border p-4 text-xs text-muted-foreground text-center">
                  {t("send.wizard.no_eligible_vehicles")}
                </div>
              )}
              {vehicles.map(renderCard)}
            </div>
          )}

          <div className="baked-card border border-border p-3">
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.have_promo")}</div>
            <div className="flex gap-2">
              <input data-testid="exp-est-promo-input" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder={t("send.wizard.promo_ph")} className="flex-1 baked-input h-10 px-3 border border-border bg-secondary/40 text-sm uppercase" />
              <button data-testid="exp-est-promo-apply" onClick={applyPromo} className="baked-btn h-10 px-4 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.apply")}</button>
            </div>
            {promoApplied && <div className="text-[10px] text-muted-foreground mt-1">{t("send.wizard.final_price_note")}</div>}
          </div>

          <div className="baked-card border p-3 flex items-center gap-3" style={{ borderColor: "#FCC44C44", backgroundColor: "#FCC44C0A" }}>
            <ShieldCheck size={16} style={{ color: "#FCC44C" }} />
            <div className="flex-1"><div className="text-xs font-bold">{t("send.wizard.insurance_included")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.goods_covered_up_to", { amount: money(50000) })}</div></div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={book} disabled={!draft.vehicle_code || busy} label={cta} loading={busy} testid="exp-est-book" />
    </div>
  );
};

// Back-compat alias — any legacy `/send/book/estimate` route now renders
// the new merged Vehicle & Booking step instead of a dead page.
export const ExpressStepEstimate = ExpressStepBook;
// Ditto for the old `/send/book/vehicle` route.
export const ExpressStepVehicle = ExpressStepBook;

const Row = ({ label, value, tone }) => (
  <div className="flex items-center justify-between">
    <div className={tone ? "text-muted-foreground" : ""}>{label}</div>
    <div className={typeof tone === "string" ? "font-semibold" : ""} style={typeof tone === "string" ? { color: tone } : undefined}>{value}</div>
  </div>
);

// ---------------- Booking Success / Live-tracking placeholder ----------------
export const ExpressBookingConfirmation = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const money = useMoney();
  const success = new URLSearchParams(window.location.search).get("success") === "1";
  const bookingId = window.location.pathname.split("/").pop();

  useEffect(() => {
    api.get(`/express/bookings/${bookingId}`).then((r) => setBooking(r.data)).catch(() => setBooking(null));
  }, [bookingId]);

  // Auto-redirect parcel bookings to live tracking (~1.2s after success paint).
  useEffect(() => {
    if (!booking || booking.booking_type !== "parcel" || !success) return;
    const timer = setTimeout(() => navigate(`/send/booking/${booking.id}/track`, { replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [booking, success, navigate]);

  if (!booking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("send.wizard.loading")}</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_confirmed")} onBack={() => navigate("/send")} />
      <div className="flex-1 px-4 py-6 space-y-4">
        {success && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={30} />
            </div>
            <div className="text-lg font-bold mt-3">{t("send.wizard.booking_successful")}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("send.wizard.booking_ref_note", { ref: booking.ref })}</p>
          </div>
        )}

        <div className="baked-card border border-border p-4 space-y-2">
          <div className="text-sm font-bold">{booking.booking_type === "movers" ? t("send.wizard.your_move") : t("send.wizard.your_delivery")}</div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.pickup")}</div><div className="text-xs font-semibold">{booking.pickup?.formatted_address}</div></div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.dropoff")}</div><div className="text-xs font-semibold">{booking.drop?.formatted_address}</div></div>
          </div>
          <div className="border-t border-border my-2" />
          {booking.booking_type === "movers" ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold capitalize">{booking.move_type?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.move_type")}</div></div>
              <div><div className="font-bold">{t("send.wizard.items_count", { count: (booking.items || []).reduce((s, i) => s + (i.qty || 0), 0) })}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.load_label")}</div></div>
              <div><div className="font-bold">{booking.scheduled_date || "—"}</div><div className="text-[10px] text-muted-foreground">{booking.time_slot_code || t("send.wizard.slot_label")}</div></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold">{booking.distance_km} km</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.distance_label")}</div></div>
              <div><div className="font-bold">{booking.duration_min} min</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.est_eta_label")}</div></div>
              <div><div className="font-bold capitalize">{booking.vehicle_code?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.vehicle_label")}</div></div>
            </div>
          )}
        </div>

        <div className="baked-card border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">{t("send.wizard.total_to_pay")}</div>
            <div className="text-sm font-bold" data-testid="exp-booking-total">{money(booking.total)}</div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{t("send.wizard.cod_short")}</div>
        </div>

        {booking.booking_type === "movers" ? (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">{t("send.wizard.move_confirmed")}</div><div className="text-[11px] text-muted-foreground">{t("send.wizard.move_call_note")}</div></div>
          </div>
        ) : (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <Truck size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">{t("send.wizard.searching_driver")}</div><div className="text-[11px] text-muted-foreground">{t("send.wizard.tracking_opens")}</div></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button data-testid="exp-booking-track" onClick={() => navigate(`/send/booking/${booking.id}/track`)} className="baked-btn h-11 border border-border font-semibold text-sm">{t("send.wizard.track_order")}</button>
          <button data-testid="exp-booking-home" onClick={() => navigate("/send")} className="baked-btn h-11 font-bold text-sm text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.book_another")}</button>
        </div>
      </div>
    </div>
  );
};
