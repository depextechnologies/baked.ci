/**
 * DriverTripSheet — Uber-style trip lifecycle bottom sheet + status card
 * for the SENDbakēd Driver PWA, matching the 3 driver screenshots in
 * Fixing_Prompt.docx (StartNavigation / Arrived at Pickup / Start for Drop-off).
 *
 * ── Backend contract ────────────────────────────────────────────────────
 * The ExpressBooking state machine (see modules/express/routes.py) drives
 * the entire UI. We DO NOT introduce new statuses; we render different
 * layouts per existing status:
 *
 *   driver_assigned → NAVIGATING_TO_PICKUP  (Start Navigation card)
 *   arriving        → ARRIVED_AT_PICKUP    (Slide to Start for Drop-off)
 *   picked_up       → NAVIGATING_TO_DROPOFF (Picked up! head to drop-off)
 *   in_transit      → ARRIVED_AT_DROPOFF   (Slide to Complete Delivery)
 *
 * Each swipe hits POST /api/express/bookings/{id}/driver-status with the
 * driver JWT (route enforces "must be assigned driver") and the last known
 * GPS coordinates.
 *
 * ── Design notes ───────────────────────────────────────────────────────
 * All colors flow through Tailwind semantic tokens (bg-card, text-foreground,
 * border-border, text-muted-foreground) so the sheet automatically renders
 * correctly in both light and dark modes — see index.css :root / .dark
 * definitions. Brand colours (ORANGE / GREEN / BLUE / RED) stay as-is
 * because they represent state, not chrome.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowRight, Phone, MessageSquare, Loader2, CheckCircle2, Navigation as NavIcon,
  PackageCheck, Flag, ChevronsRight,
} from "lucide-react";

const ORANGE = "#FF8A1E";
const GREEN  = "#22c55e";
const BLUE   = "#3b82f6";

/* -------------------------------------------------------------------------- */
/*  SlideToConfirm — real drag-based confirmation                              */
/* -------------------------------------------------------------------------- */

/**
 * The button doesn't fire on tap. The driver must drag the thumb ≥80% of
 * the track. Anything less snaps back with a soft haptic vibration.
 * Uses pointer events so it works uniformly on touch + mouse (PWA on
 * Android/iOS + desktop for testing).
 */
export const SlideToConfirm = ({
  label,
  onConfirm,
  color = ORANGE,          // thumb + progress
  disabled = false,
  testid = "slide-to-confirm",
}) => {
  const trackRef = useRef(null);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  const xRef = useRef(0);      // mirror of `x` so onUp reads the freshest drag distance without waiting for a state flush
  const [x, setX] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const maxRef = useRef(0);   // recomputed on every drag start

  const reset = useCallback(() => {
    setX(0); xRef.current = 0; draggingRef.current = false;
  }, []);

  const onDown = (e) => {
    if (disabled || confirming) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    const rect = trackRef.current?.getBoundingClientRect();
    // thumb is 56px, plus 6px padding on each side
    maxRef.current = Math.max(0, (rect?.width || 0) - 56 - 12);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!draggingRef.current) return;
    const dx = Math.max(0, Math.min(maxRef.current, e.clientX - startXRef.current));
    xRef.current = dx;
    setX(dx);
  };
  const onUp = async () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const threshold = maxRef.current * 0.8;
    if (xRef.current >= threshold) {
      setX(maxRef.current);
      setConfirming(true);
      try {
        if (navigator.vibrate) navigator.vibrate(20);
        await onConfirm?.();
        setConfirmed(true);
      } catch {
        setConfirming(false);
        reset();
      }
    } else {
      // Bounce back
      setX(0); xRef.current = 0;
      if (navigator.vibrate) navigator.vibrate(10);
    }
  };

  return (
    <div
      ref={trackRef}
      data-testid={testid}
      className="relative h-16 rounded-2xl overflow-hidden select-none"
      style={{
        border: `1.5px solid ${disabled ? "hsl(var(--border))" : color + "80"}`,
        background: disabled ? "hsl(var(--muted))" : "hsl(var(--card))",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Progress trail */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${x + 56 + 12}px`,
          background: `linear-gradient(90deg, ${color}22, ${color}44)`,
          transition: draggingRef.current ? "none" : "width 260ms cubic-bezier(.2,.7,.2,1)",
        }}
      />

      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm font-bold tracking-wide text-foreground">
        {confirmed ? (
          <span className="flex items-center gap-2" style={{ color }}>
            <CheckCircle2 size={18} /> Confirmed
          </span>
        ) : confirming ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>{label}</>
        )}
      </div>

      {/* Thumb */}
      <button
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        disabled={disabled || confirming}
        data-testid={`${testid}-thumb`}
        aria-label={label}
        className="absolute top-1.5 left-1.5 h-[52px] w-[52px] rounded-xl grid place-items-center touch-none"
        style={{
          background: color,
          transform: `translateX(${x}px)`,
          transition: draggingRef.current ? "none" : "transform 260ms cubic-bezier(.2,.7,.2,1)",
          boxShadow: `0 10px 24px -8px ${color}80`,
        }}
      >
        <ChevronsRight size={22} color="#000" strokeWidth={2.5} />
      </button>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  External Google Maps launcher                                              */
/* -------------------------------------------------------------------------- */

/**
 * Opens native turn-by-turn navigation to the given lat/lng.
 * Uses platform-appropriate deep links so drivers get the native app
 * experience, and falls back to the web maps URL when the native app
 * isn't available (desktop tests, out-of-band environments).
 *
 * Android: geo:0,0?q=<lat>,<lng>(<label>)
 * iOS:     maps://?daddr=<lat>,<lng>&dirflg=d
 * Web:     https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving
 */
export const openNativeNavigation = ({ lat, lng, label, origin }) => {
  if (lat == null || lng == null) return;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const webUrl =
    `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin.lat},${origin.lng}` : ""}` +
    `&destination=${lat},${lng}&travelmode=driving`;

  const openWebFallback = () => window.open(webUrl, "_blank", "noopener,noreferrer");

  if (isAndroid) {
    // Try the Google Maps navigation intent; if the app isn't installed the
    // browser will silently do nothing so we open the web fallback after
    // a short delay (standard PWA pattern).
    const nav = `google.navigation:q=${lat},${lng}&mode=d`;
    const start = Date.now();
    window.location.href = nav;
    setTimeout(() => {
      // If we're still on the page after ~1.2s, Google Maps didn't take over.
      if (Date.now() - start < 2200 && document.visibilityState === "visible") {
        openWebFallback();
      }
    }, 1200);
    return;
  }
  if (isIOS) {
    // Apple Maps-friendly deep link that Google Maps also honours.
    const url = `maps://?daddr=${lat},${lng}&dirflg=d${label ? `&q=${encodeURIComponent(label)}` : ""}`;
    const start = Date.now();
    window.location.href = url;
    setTimeout(() => {
      if (Date.now() - start < 2200 && document.visibilityState === "visible") {
        openWebFallback();
      }
    }, 1200);
    return;
  }
  openWebFallback();
};

/* -------------------------------------------------------------------------- */
/*  Turn-by-turn instruction card                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fetches Google Directions ONCE per origin change ≥100m and surfaces the
 * next step (distance + text) plus overall distance + ETA. Values are
 * strictly dynamic — no hard-coded 450m / 8min.
 *
 * If google.maps hasn't loaded (or destination is missing) we render a
 * graceful placeholder so the sheet layout stays stable.
 */
const stripHtml = (html) => {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
};

export const useTurnByTurn = ({ origin, destination }) => {
  const [meta, setMeta] = useState(null);
  const lastOriginRef = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!origin || !destination || !window.google?.maps) return;
    // Only recompute if origin moved meaningfully.
    const last = lastOriginRef.current;
    if (last) {
      const dLat = (origin.lat - last.lat) * 111000;
      const dLng = (origin.lng - last.lng) * 111000 * Math.cos(origin.lat * Math.PI / 180);
      if (Math.hypot(dLat, dLng) < 100 && meta) return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin, destination,
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (res, status) => {
      inFlightRef.current = false;
      if (status === "OK" && res?.routes?.[0]?.legs?.[0]) {
        const leg = res.routes[0].legs[0];
        const step = leg.steps?.[0];
        setMeta({
          totalKm: leg.distance?.value != null ? leg.distance.value / 1000 : null,
          totalMin: leg.duration?.value != null ? Math.round(leg.duration.value / 60) : null,
          stepText: step ? stripHtml(step.instructions) : null,
          stepMeters: step?.distance?.value ?? null,
        });
        lastOriginRef.current = origin;
      }
    });
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  return meta;
};

const formatMeters = (m) => {
  if (m == null) return "—";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
};

/* -------------------------------------------------------------------------- */
/*  Contact tile (Call / Chat)                                                 */
/* -------------------------------------------------------------------------- */

const ContactActions = ({ name, phone, onChat, testidPrefix }) => (
  <div className="flex items-center gap-2 shrink-0">
    <a
      href={phone ? `tel:${phone}` : undefined}
      onClick={(e) => { if (!phone) { e.preventDefault(); toast.message("Phone number unavailable"); } }}
      data-testid={`${testidPrefix}-call`}
      aria-label={`Call ${name || ""}`}
      className="w-11 h-11 rounded-full grid place-items-center bg-secondary text-foreground border border-border hover:bg-accent"
    >
      <Phone size={16} />
    </a>
    <button
      type="button"
      onClick={onChat}
      data-testid={`${testidPrefix}-chat`}
      aria-label={`Chat with ${name || ""}`}
      className="w-11 h-11 rounded-full grid place-items-center bg-secondary text-foreground border border-border hover:bg-accent"
    >
      <MessageSquare size={16} />
    </button>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Public DriverTripSheet                                                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Multi-Stop trip sheet — mirrors booking.stops[] one leg at a time         */
/* -------------------------------------------------------------------------- */

/**
 * Delivery-PIN capture modal. Shown before the driver can confirm a drop
 * checkpoint — the receiver must share the 4-digit code they received by SMS.
 */
const DeliveryPinModal = ({ open, sequence, onClose, onSubmit }) => {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPin(""); }, [open]);
  if (!open) return null;
  const submit = async (e) => {
    e?.preventDefault?.();
    if (pin.length < 4) return;
    try {
      setBusy(true);
      await onSubmit(pin);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-end sm:place-items-center"
      data-testid="driver-multi-stop-pin-modal"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-orange-500">
          Livraison {sequence} · Delivery {sequence}
        </div>
        <h3 className="text-lg font-bold mt-2">
          Code de livraison / Delivery PIN
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Demandez au destinataire le code à 4 chiffres reçu par SMS.
          <br />
          Ask the receiver for the 4-digit code they received by SMS.
        </p>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          data-testid="driver-multi-stop-pin-input"
          className="mt-4 w-full h-14 px-4 rounded-xl border border-border bg-secondary text-foreground text-center text-2xl font-bold tracking-[0.4em]"
          placeholder="••••"
        />
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="driver-multi-stop-pin-cancel"
            className="flex-1 h-11 rounded-xl bg-secondary text-foreground border border-border font-semibold"
          >
            Annuler / Cancel
          </button>
          <button
            type="submit"
            disabled={pin.length < 4 || busy}
            data-testid="driver-multi-stop-pin-submit"
            className="flex-1 h-11 rounded-xl font-semibold text-black disabled:opacity-50"
            style={{ background: GREEN }}
          >
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Valider / Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Ordered checkpoint (pickup+drop pair) rendered inside the sheet. */
const CheckpointRow = ({ stop, currentSeq, currentLeg, onNavigate }) => {
  const legState = (leg) => {
    const s = stop[leg]?.status;
    if (s === "completed") return "done";
    if (stop.sequence === currentSeq && currentLeg === leg) return "current";
    return "upcoming";
  };
  const bullet = (state, tone) => {
    if (state === "done") {
      return (
        <span className="w-5 h-5 rounded-full grid place-items-center shrink-0"
              style={{ background: GREEN, color: "#000" }}>
          <CheckCircle2 size={12} strokeWidth={3} />
        </span>
      );
    }
    if (state === "current") {
      return (
        <span className="w-5 h-5 rounded-full ring-2 shrink-0"
              style={{ background: tone, boxShadow: `0 0 0 4px ${tone}22` }} />
      );
    }
    return <span className="w-5 h-5 rounded-full border border-border shrink-0" />;
  };
  const renderLeg = (leg, tone, labelFr, labelEn) => {
    const state = legState(leg);
    const isCurrent = state === "current";
    return (
      <div className="flex items-start gap-3">
        {bullet(state, tone)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: state === "done" ? GREEN : tone }}>
              {labelFr} {stop.sequence} · {labelEn} {stop.sequence}
            </span>
            {state === "done" && (
              <span className="text-[10px] text-muted-foreground">— Terminé</span>
            )}
          </div>
          <div className={`text-sm font-semibold truncate ${state === "upcoming" ? "text-muted-foreground" : "text-foreground"}`}>
            {stop[leg]?.building || stop[leg]?.address || "—"}
          </div>
          {stop[leg]?.address && stop[leg]?.building && (
            <div className="text-xs text-muted-foreground truncate">
              {stop[leg].address}
            </div>
          )}
          {leg === "drop" && stop.drop?.receiver_name && (
            <div className="text-xs text-muted-foreground truncate">
              → {stop.drop.receiver_name}
            </div>
          )}
        </div>
        {isCurrent && (
          <button
            type="button"
            onClick={() => onNavigate(stop[leg])}
            data-testid={`driver-multi-stop-navigate-${leg}-${stop.sequence}`}
            className="shrink-0 h-9 px-3 rounded-lg border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
          >
            <NavIcon size={12} /> Navigate
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {renderLeg("pickup", ORANGE, "Ramassage", "Pickup")}
      {renderLeg("drop", GREEN, "Livraison", "Delivery")}
    </div>
  );
};

/**
 * MultiStopTripSheet — rendered when booking.stops[] is present.
 *
 *  • Reads the SAME `booking.stops` payload as the customer.
 *  • Drives a single Slide-to-Confirm bound to the CURRENT leg.
 *  • Requires PIN entry for every drop leg.
 *  • POSTs `/express/bookings/{id}/stop-advance`.
 *  • Never allows the driver to skip a checkpoint.
 */
export const MultiStopTripSheet = ({
  booking,
  driverLoc,
  apiBase,
  token,
  onAdvanced,
  onDelivered,
}) => {
  const stops = booking?.stops || [];
  const progress = booking?.stops_progress || null;
  const [pinPromptFor, setPinPromptFor] = useState(null); // sequence number
  const [expanded, setExpanded] = useState(true);

  const current = useMemo(() => {
    if (progress?.current) return progress.current;
    // Fallback: derive locally
    for (const s of stops) {
      for (const leg of ["pickup", "drop"]) {
        if (s?.[leg]?.status !== "completed") return { sequence: s.sequence, leg };
      }
    }
    return null;
  }, [stops, progress]);

  const currentStop = useMemo(
    () => stops.find((s) => s.sequence === current?.sequence) || null,
    [stops, current],
  );
  const currentLegEntry = currentStop && current ? currentStop[current.leg] : null;

  const dest = useMemo(() => {
    if (!currentLegEntry) return null;
    const lat = Number(currentLegEntry.lat);
    const lng = Number(currentLegEntry.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [currentLegEntry]);

  const nav = useTurnByTurn({ origin: driverLoc, destination: dest });

  const submit = useCallback(async (pin) => {
    if (!current) return;
    try {
      const body = {
        sequence: current.sequence,
        leg: current.leg,
        ...(pin ? { delivery_pin: pin } : {}),
        ...(driverLoc ? { lat: driverLoc.lat, lng: driverLoc.lng } : {}),
      };
      const { data } = await axios.post(
        `${apiBase}/express/bookings/${booking.id}/stop-advance`,
        body,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setPinPromptFor(null);
      const isFinal = data?.status === "delivered";
      if (isFinal) {
        toast.success("Livraison finale — Booking completed! 🎉");
        onDelivered?.();
      } else {
        const labelFr = current.leg === "pickup" ? "Ramassage" : "Livraison";
        toast.success(`${labelFr} ${current.sequence} confirmé`);
        onAdvanced?.(data);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail?.message ||
                  err?.response?.data?.detail || err?.message || "Failed to confirm checkpoint";
      toast.error(String(msg));
    }
  }, [apiBase, booking?.id, current, driverLoc, onAdvanced, onDelivered, token]);

  const onSlide = useCallback(async () => {
    if (!current) return;
    if (current.leg === "drop") {
      setPinPromptFor(current.sequence);
      return;
    }
    await submit(null);
  }, [current, submit]);

  if (!current || !currentStop) {
    return (
      <div className="absolute inset-x-0 bottom-24 mx-3 pointer-events-auto rounded-2xl bg-card border border-border p-4 z-30 text-center"
           data-testid="driver-multi-stop-complete">
        <div className="text-sm font-semibold text-foreground">
          Tous les arrêts confirmés · All stops confirmed
        </div>
      </div>
    );
  }

  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? (stops.length * 2);
  const legLabelFr = current.leg === "pickup" ? "Ramassage" : "Livraison";
  const legLabelEn = current.leg === "pickup" ? "Pickup" : "Delivery";
  const slideLabelBase = current.leg === "pickup"
    ? `Confirmer le ramassage ${current.sequence} · Confirm Pickup ${current.sequence}`
    : `Confirmer la livraison ${current.sequence} · Confirm Delivery ${current.sequence}`;
  const slideColor = current.leg === "pickup" ? ORANGE : GREEN;
  const distanceLabel = nav?.totalKm != null ? `${nav.totalKm.toFixed(1)} km` : "—";
  const etaLabel = nav?.totalMin != null ? `${nav.totalMin} min` : "—";
  const focusName = currentLegEntry?.building
    || currentLegEntry?.address
    || (current.leg === "drop" ? currentStop.drop?.receiver_name : "");

  return (
    <>
      <DeliveryPinModal
        open={pinPromptFor != null}
        sequence={pinPromptFor}
        onClose={() => setPinPromptFor(null)}
        onSubmit={submit}
      />

      {/* Top pill */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-30"
           style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="px-4 flex items-center justify-center pointer-events-none">
          <div
            data-testid="driver-multi-stop-progress-pill"
            className="pointer-events-auto flex items-center gap-2 h-10 px-4 rounded-full bg-card/95 border border-border backdrop-blur-md text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN }} />
            <span className="text-foreground">
              Livraison multi-arrêts · {completed}/{total}
            </span>
          </div>
        </div>
      </div>

      {/* Current-stop hero card */}
      <div className="absolute left-0 right-0 pointer-events-none z-30 px-3"
           style={{ top: "calc(max(env(safe-area-inset-top), 12px) + 56px)" }}>
        <div
          className="pointer-events-auto rounded-2xl bg-card border border-border p-4 shadow-lg backdrop-blur-md"
          data-testid="driver-multi-stop-current-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full grid place-items-center shrink-0"
                 style={{ background: `${slideColor}22`, color: slideColor }}>
              {current.leg === "pickup" ? <PackageCheck size={22} /> : <Flag size={22} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold"
                   style={{ color: slideColor }}>
                Arrêt actuel · Current Stop
              </div>
              <div className="text-base font-bold text-foreground truncate">
                {legLabelFr} {current.sequence} · {legLabelEn} {current.sequence}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {focusName || "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold" style={{ color: GREEN }}>{distanceLabel}</div>
              <div className="text-[10px] text-muted-foreground">{etaLabel}</div>
            </div>
            <button
              type="button"
              onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
              data-testid="driver-multi-stop-navigate-btn"
              className="shrink-0 h-10 px-3 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
            >
              <NavIcon size={14} /> Navigate
            </button>
          </div>
        </div>
      </div>

      {/* Bottom sheet with ordered checkpoints */}
      <div className="absolute left-0 right-0 pointer-events-none z-30" style={{ bottom: 88 }}>
        <div
          className="pointer-events-auto mx-3 rounded-t-[28px] rounded-b-2xl bg-card border border-border shadow-2xl backdrop-blur-md p-4 max-h-[62vh] overflow-y-auto"
          data-testid="driver-multi-stop-bottom-sheet"
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            data-testid="driver-multi-stop-toggle"
            className="w-full flex items-center justify-center -mt-1 mb-2"
            aria-label={expanded ? "Collapse trip details" : "Expand trip details"}
          >
            <span className="block w-12 h-1.5 rounded-full bg-border" />
          </button>

          {/* Progress + shipment count */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-orange-500">
                {stops.length} colis · {stops.length} Shipment{stops.length > 1 ? "s" : ""}
              </div>
              <div className="text-sm font-bold text-foreground mt-1">
                {completed}/{total} points confirmés · checkpoints
              </div>
            </div>
            <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${total ? (completed / total) * 100 : 0}%`, background: GREEN }}
                data-testid="driver-multi-stop-progress-bar"
              />
            </div>
          </div>

          {expanded && (
            <div className="space-y-4">
              {stops.map((s, i) => (
                <div key={s.sequence || i}
                     className="pt-3 border-t border-border first:pt-0 first:border-t-0"
                     data-testid={`driver-multi-stop-row-${s.sequence}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                    Colis {s.sequence} · Shipment {s.sequence}
                  </div>
                  <CheckpointRow
                    stop={s}
                    currentSeq={current.sequence}
                    currentLeg={current.leg}
                    onNavigate={(entry) => openNativeNavigation({
                      lat: Number(entry?.lat),
                      lng: Number(entry?.lng),
                      label: entry?.building || entry?.address,
                      origin: driverLoc,
                    })}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <SlideToConfirm
              key={`ms-${current.sequence}-${current.leg}`}
              label={slideLabelBase}
              onConfirm={onSlide}
              color={slideColor}
              testid={`driver-multi-stop-slide-${current.leg}-${current.sequence}`}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const STAGE_CONFIG = {
  driver_assigned: {
    nextStatus:   "arriving",
    slideLabel:   "Slide to Arrive at Pickup",
    slideColor:   ORANGE,
    slideTestId:  "slide-arrive-pickup",
    stageLabel:   "On Trip · Pick up",
    stageColor:   GREEN,
    heading:      "Head to pickup",
    subheading:   (b) => `${b.pickup?.line1 || b.pickup?.formatted_address || "Pickup"}`,
    focus:        "pickup",
  },
  arriving: {
    nextStatus:   "picked_up",
    slideLabel:   "Slide to Start for Drop-off",
    slideColor:   ORANGE,
    slideTestId:  "slide-start-dropoff",
    stageLabel:   "On Trip · Pick up",
    stageColor:   GREEN,
    heading:      "Arrived at pick-up!",
    subheading:   () => "Please collect the order from the customer.",
    focus:        "pickup",
  },
  picked_up: {
    nextStatus:   "in_transit",
    slideLabel:   "Slide — I've Reached Drop-off",
    slideColor:   BLUE,
    slideTestId:  "slide-arrive-dropoff",
    stageLabel:   "On Trip · Drop off",
    stageColor:   GREEN,
    heading:      "Picked up!",
    subheading:   () => "Now head to drop-off. Stay safe and drive carefully.",
    focus:        "dropoff",
  },
  in_transit: {
    nextStatus:   "delivered",
    slideLabel:   "Slide to Complete Delivery",
    slideColor:   GREEN,
    slideTestId:  "slide-deliver",
    stageLabel:   "On Trip · Drop off",
    stageColor:   GREEN,
    heading:      "Arrived at drop-off",
    subheading:   () => "Hand over the package and confirm delivery.",
    focus:        "dropoff",
  },
};

/**
 * DriverTripSheet — the whole trip-time surface.
 *
 * Props:
 *   • booking:       the current ExpressBooking snapshot
 *   • driverLoc:     last known { lat, lng } (used for Directions + backend body)
 *   • apiBase:       `${REACT_APP_BACKEND_URL}/api` — passed in so we don't
 *                    depend on the DriverApp's driverApi axios instance
 *                    (keeps this file free of circular imports).
 *   • token:         driver JWT
 *   • onAdvanced:    (updated booking) → parent replaces its stale copy
 *   • onDelivered:   () → dismiss the sheet after delivery
 *   • onOpenChat:    open the JobChat modal for the given peer
 */
export const DriverTripSheet = (props) => {
  // Multi-stop bookings mirror the customer's stops[] payload as an ordered
  // list of pickup/drop checkpoints. Single-stop bookings continue on the
  // legacy STAGE_CONFIG state machine (backward-compatible). Split into two
  // subcomponents so React hooks stay unconditional in each render tree.
  const b = props.booking;
  const isMultiStop = Array.isArray(b?.stops) && b.stops.length >= 1
    && b?.service_type === "multiple_shipments";
  return isMultiStop
    ? <MultiStopTripSheet {...props} />
    : <SingleStopTripSheet {...props} />;
};

const SingleStopTripSheet = ({
  booking,
  driverLoc,
  apiBase,
  token,
  onAdvanced,
  onDelivered,
  onOpenChat,
}) => {
  const cfg = STAGE_CONFIG[booking?.status];
  const [expanded, setExpanded] = useState(true);

  // Turn-by-turn to the *current* focus destination.
  const dest = useMemo(() => {
    if (!cfg) return null;
    if (cfg.focus === "dropoff") {
      const d = booking.drop || booking.dropoff;
      return d ? { lat: Number(d.latitude), lng: Number(d.longitude) } : null;
    }
    const p = booking.pickup;
    return p ? { lat: Number(p.latitude), lng: Number(p.longitude) } : null;
  }, [booking, cfg]);

  const nav = useTurnByTurn({ origin: driverLoc, destination: dest });

  if (!cfg) return null;

  const advance = async () => {
    const body = { status: cfg.nextStatus,
                   ...(driverLoc ? { lat: driverLoc.lat, lng: driverLoc.lng } : {}) };
    const { data } = await axios.post(
      `${apiBase}/express/bookings/${booking.id}/driver-status`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (cfg.nextStatus === "delivered") {
      toast.success("Delivered — great job! 🎉");
      onDelivered?.();
    } else {
      const nextLabel = STAGE_CONFIG[cfg.nextStatus]?.heading || cfg.nextStatus;
      toast.success(nextLabel);
      onAdvanced?.({ ...booking, ...data, status: cfg.nextStatus });
    }
  };

  const currency = booking.currency_symbol || (booking.currency === "INR" ? "₹" : "");
  const earnings = booking.total != null ? `${currency}${Number(booking.total).toFixed(0)}` : "—";
  const distanceLabel = formatMeters(nav?.totalKm != null ? nav.totalKm * 1000 : null);
  const etaLabel = nav?.totalMin != null ? `${nav.totalMin} min` : "—";

  const focusName = cfg.focus === "dropoff"
    ? (booking.receiver?.name || "Recipient")
    : (booking.pickup?.building || booking.pickup?.line1 || "Merchant");
  const focusAddress = cfg.focus === "dropoff"
    ? (booking.drop?.formatted_address || booking.drop?.line1 || "")
    : (booking.pickup?.formatted_address || booking.pickup?.line1 || "");

  return (
    <>
      {/* ── Top: status pill (matches screenshots' "On Trip · Pick up" chip) ─ */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-30"
           style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="px-4 flex items-center justify-center pointer-events-none">
          <div
            data-testid="trip-status-pill"
            className="pointer-events-auto flex items-center gap-2 h-10 px-4 rounded-full bg-card/95 border border-border backdrop-blur-md text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: cfg.stageColor }} />
            <span className="text-foreground">{cfg.stageLabel}</span>
          </div>
        </div>
      </div>

      {/* ── Top: navigation instruction card ────────────────────────────── */}
      <div className="absolute left-0 right-0 pointer-events-none z-30 px-3"
           style={{ top: "calc(max(env(safe-area-inset-top), 12px) + 56px)" }}>
        <div
          className="pointer-events-auto rounded-2xl bg-card border border-border p-4 shadow-lg backdrop-blur-md"
          data-testid="trip-instruction-card"
        >
          {booking.status === "arriving" ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full grid place-items-center shrink-0"
                   style={{ background: `${GREEN}22`, color: GREEN }}>
                <CheckCircle2 size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-foreground">{cfg.heading}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {cfg.subheading(booking)}
                </div>
              </div>
              <button
                onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
                data-testid="trip-navigate-btn"
                className="shrink-0 h-10 px-4 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
              >
                <NavIcon size={14} /> Navigate
              </button>
            </div>
          ) : booking.status === "in_transit" ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full grid place-items-center shrink-0"
                   style={{ background: `${GREEN}22`, color: GREEN }}>
                <Flag size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-foreground">{cfg.heading}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {cfg.subheading(booking)}
                </div>
              </div>
              <button
                onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
                data-testid="trip-navigate-btn"
                className="shrink-0 h-10 px-4 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
              >
                <NavIcon size={14} /> Navigate
              </button>
            </div>
          ) : booking.status === "picked_up" ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full grid place-items-center shrink-0"
                   style={{ background: `${GREEN}22`, color: GREEN }}>
                <PackageCheck size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-foreground">{cfg.heading}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {cfg.subheading(booking)}
                </div>
              </div>
              <button
                onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
                data-testid="trip-navigate-btn"
                className="shrink-0 h-10 px-4 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
              >
                <NavIcon size={14} /> Navigate
              </button>
            </div>
          ) : (
            /* driver_assigned — big instruction card, matches Screenshot 3 */
            <div>
              {nav?.stepText ? (
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                       style={{ background: `${ORANGE}22`, color: ORANGE }}>
                    <NavIcon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-foreground leading-none">
                      {formatMeters(nav.stepMeters)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                      {nav.stepText}
                    </div>
                  </div>
                  <button
                    onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
                    data-testid="trip-navigate-btn"
                    className="shrink-0 h-10 px-3 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
                  >
                    <NavIcon size={14} /> Navigate
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full grid place-items-center shrink-0"
                       style={{ background: `${ORANGE}22`, color: ORANGE }}>
                    <NavIcon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-foreground">{cfg.heading}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {cfg.subheading(booking)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: GREEN }}>{distanceLabel}</div>
                    <div className="text-[10px] text-muted-foreground">{etaLabel} away</div>
                  </div>
                  <button
                    onClick={() => openNativeNavigation({ ...dest, label: focusName, origin: driverLoc })}
                    data-testid="trip-navigate-btn"
                    className="shrink-0 h-10 px-3 rounded-xl border border-border bg-secondary text-foreground flex items-center gap-1.5 text-xs font-semibold hover:bg-accent"
                  >
                    <NavIcon size={14} /> Navigate
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 pointer-events-none z-30"
        style={{ bottom: 88 /* clears the floating bottom nav */ }}
      >
        <div
          className="pointer-events-auto mx-3 rounded-t-[28px] rounded-b-2xl bg-card border border-border shadow-2xl backdrop-blur-md p-4"
          data-testid="trip-bottom-sheet"
        >
          {/* Grabber */}
          <button
            onClick={() => setExpanded((v) => !v)}
            data-testid="trip-sheet-toggle"
            className="w-full flex items-center justify-center -mt-1 mb-2"
            aria-label={expanded ? "Collapse trip details" : "Expand trip details"}
          >
            <span className="block w-12 h-1.5 rounded-full bg-border" />
          </button>

          {expanded && (
            <div className="space-y-3">
              {/* Focus (primary) block — matches "Pickup" / "Drop off" hero */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className="w-3 h-3 rounded-full ring-2"
                        style={{
                          background: cfg.focus === "dropoff" ? GREEN : ORANGE,
                          boxShadow: `0 0 0 4px ${cfg.focus === "dropoff" ? `${GREEN}22` : `${ORANGE}22`}`,
                        }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide"
                       style={{ color: cfg.focus === "dropoff" ? GREEN : ORANGE }}>
                    {cfg.focus === "dropoff" ? "Drop off" : "Pickup"}
                  </div>
                  <div className="text-base font-bold text-foreground truncate">{focusName}</div>
                  <div className="text-xs text-muted-foreground truncate">{focusAddress}</div>
                </div>
                <ContactActions
                  name={focusName}
                  phone={cfg.focus === "dropoff" ? booking.receiver?.phone : booking.pickup_contact_phone}
                  onChat={() => onOpenChat?.(cfg.focus)}
                  testidPrefix={`trip-${cfg.focus}`}
                />
              </div>

              {/* Secondary block: the OTHER end (pickup shown as completed if past it) */}
              {booking.status !== "driver_assigned" && cfg.focus === "dropoff" && booking.pickup && (
                <div className="pt-3 border-t border-border flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className="w-3 h-3 rounded-full grid place-items-center"
                          style={{ background: GREEN, color: "#000" }}>
                      <CheckCircle2 size={10} strokeWidth={3} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide"
                         style={{ color: GREEN }}>Pickup (Completed)</div>
                    <div className="text-sm font-semibold text-foreground truncate">
                      {booking.pickup?.building || booking.pickup?.line1 || "Merchant"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {booking.pickup?.formatted_address || booking.pickup?.line1}
                    </div>
                  </div>
                </div>
              )}
              {booking.status === "driver_assigned" && (booking.drop || booking.dropoff) && (
                <div className="pt-3 border-t border-border flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className="w-3 h-3 rounded-full ring-2"
                          style={{ background: GREEN, boxShadow: `0 0 0 4px ${GREEN}22` }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide"
                         style={{ color: GREEN }}>Drop off</div>
                    <div className="text-sm font-semibold text-foreground truncate">
                      {booking.receiver?.name || "Recipient"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(booking.drop || booking.dropoff)?.formatted_address ||
                       (booking.drop || booking.dropoff)?.line1}
                    </div>
                  </div>
                  <ContactActions
                    name={booking.receiver?.name}
                    phone={booking.receiver?.phone}
                    onChat={() => onOpenChat?.("dropoff")}
                    testidPrefix="trip-dropoff"
                  />
                </div>
              )}

              {/* Trip metric strip */}
              <div className="pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
                <TripMetric label={cfg.focus === "dropoff" ? "Remaining" : "Distance"}
                            value={distanceLabel}
                            color={GREEN}
                            testid="trip-metric-distance" />
                <TripMetric label={cfg.focus === "dropoff" ? "ETA to drop off" : "ETA"}
                            value={etaLabel}
                            color={GREEN}
                            testid="trip-metric-eta" />
                <TripMetric label="Est. earnings"
                            value={earnings}
                            color={GREEN}
                            testid="trip-metric-earnings" />
              </div>
            </div>
          )}

          {/* Slide-to-confirm — always visible.
              KEY is critical: it forces SlideToConfirm to remount on every
              stage so its internal `confirming` / `confirmed` state resets
              cleanly between transitions (regression from iter63). */}
          <div className="mt-4">
            <SlideToConfirm
              key={cfg.slideTestId}
              label={cfg.slideLabel}
              onConfirm={advance}
              color={cfg.slideColor}
              testid={cfg.slideTestId}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const TripMetric = ({ label, value, color, testid }) => (
  <div data-testid={testid}>
    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
      {label}
    </div>
    <div className="text-sm font-bold mt-0.5 text-foreground">
      <span style={{ color }}>{value}</span>
    </div>
  </div>
);

export default DriverTripSheet;
