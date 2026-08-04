import React, { useMemo, useState, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MapPin, Clock, Route as RouteIcon, Maximize2 } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { vehicleImage } from "../../lib/expressAssets";

/**
 * ExpressWizardShell — persistent 45/55 layout for the desktop booking flow
 * per Fixing_Prompt.docx.
 *
 * On desktop (md+): 45% left = children (step form), 55% right = live Google
 * Map that persists across every step.
 * On mobile: full-screen children with a compact interactive map card at the
 * top so users always see pickup/drop/route context.
 *
 * The map subscribes to the ExpressBooking draft (pickup, drop, vehicle_code)
 * and evolves as the user progresses through the wizard, matching the
 * ride-sharing UX described in the spec.
 */

const YELLOW = "#FCC44C";
const COUNTRY_CENTER = {
  CI: { lat: 5.36, lng: -4.0083 },
  LR: { lat: 6.3005, lng: -10.7969 },
};

// ---------- Sub-components ----------

const Pin = ({ label, tone = YELLOW }) => (
  <div className="flex flex-col items-center" style={{ transform: "translate(-50%,-100%)" }}>
    <div className="w-7 h-7 rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: "#0a0a0a" }} />
    <div className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-black" style={{ backgroundColor: tone }}>{label}</div>
  </div>
);

const VehicleThumb = ({ code }) => (
  <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
    <img src={vehicleImage(code)} alt="" className="h-6 w-auto object-contain" />
    <span className="text-[10px] uppercase font-bold text-white tracking-wide">{code.replace("_", " ")}</span>
  </div>
);

/**
 * Google Directions polyline drawn between pickup and drop using the
 * DirectionsService — decoupled so we don't reload it if the same pair is
 * re-rendered on step change.
 */
const RoutePolyline = ({ pickup, drop, onMeta }) => {
  const map = useMap();
  const onMetaRef = React.useRef(onMeta);
  React.useEffect(() => { onMetaRef.current = onMeta; }, [onMeta]);
  useEffect(() => {
    if (!map || !pickup || !drop || !window.google?.maps) return;
    const svc = new window.google.maps.DirectionsService();
    const renderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: YELLOW, strokeWeight: 5, strokeOpacity: 0.9 },
    });
    svc.route(
      {
        origin: { lat: pickup.latitude, lng: pickup.longitude },
        destination: { lat: drop.latitude, lng: drop.longitude },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, status) => {
        if (status === "OK" && res) {
          renderer.setDirections(res);
          const leg = res.routes?.[0]?.legs?.[0];
          if (leg && onMetaRef.current) onMetaRef.current({ distance_km: leg.distance?.value / 1000, duration_min: Math.round(leg.duration?.value / 60) });
        }
      },
    );
    return () => renderer.setMap(null);
    // Depend only on lat/lng primitives so the effect doesn't fire on every
    // parent re-render when `pickup`/`drop` object identity changes.
  }, [map, pickup?.latitude, pickup?.longitude, drop?.latitude, drop?.longitude]);
  return null;
};

/**
 * Auto-fit bounds to include both markers whenever pickup or drop changes.
 */
const FitBounds = ({ pickup, drop }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    if (pickup && drop) {
      const b = new window.google.maps.LatLngBounds();
      b.extend({ lat: pickup.latitude, lng: pickup.longitude });
      b.extend({ lat: drop.latitude, lng: drop.longitude });
      map.fitBounds(b, 80);
    } else if (pickup) {
      map.setCenter({ lat: pickup.latitude, lng: pickup.longitude });
      map.setZoom(15);
    }
  }, [map, pickup, drop]);
  return null;
};

// ---------- Main map ----------

export const WizardMap = ({ compact = false, draft: draftOverride = null }) => {
  const { country } = useApp();
  const { draft: parcelDraft } = useExpressBooking();
  // Accept an external draft (e.g. movers) so a single shell serves every
  // EXPRESSbakēd booking flow. Falls back to the parcel context for the
  // original Parcel wizard.
  const draft = draftOverride || parcelDraft;
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const [meta, setMeta] = useState(null);

  const center = useMemo(() => {
    if (draft?.pickup) return { lat: draft.pickup.latitude, lng: draft.pickup.longitude };
    return COUNTRY_CENTER[country?.code || "CI"];
  }, [draft?.pickup, country?.code]);

  // Haversine fallback so distance/ETA chips still show when Directions API
  // is unavailable (e.g. legacy Directions API not enabled on the key).
  const fallback = useMemo(() => {
    const p = draft?.pickup, d = draft?.drop;
    if (!p || !d) return null;
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dlat = toRad(d.latitude - p.latitude);
    const dlng = toRad(d.longitude - p.longitude);
    const a = Math.sin(dlat / 2) ** 2 + Math.cos(toRad(p.latitude)) * Math.cos(toRad(d.latitude)) * Math.sin(dlng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(a));
    return { distance_km: km, duration_min: Math.round(km * 3) };
  }, [draft?.pickup, draft?.drop]);

  const distance = meta?.distance_km ?? fallback?.distance_km ?? null;
  const duration = meta?.duration_min ?? fallback?.duration_min ?? null;

  if (!apiKey) {
    return <div className="w-full h-full bg-secondary rounded-2xl flex items-center justify-center text-xs text-muted-foreground p-4">Set REACT_APP_GOOGLE_MAPS_API_KEY to enable the live map.</div>;
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border ${compact ? "h-40" : "h-full min-h-[520px]"}`} data-testid="exp-wizard-map">
      <APIProvider apiKey={apiKey} libraries={["places"]}>
        <Map
          style={{ width: "100%", height: "100%" }}
          defaultCenter={center}
          defaultZoom={13}
          mapId="baked-express-wizard"
          gestureHandling="greedy"
          disableDefaultUI
        >
          <FitBounds pickup={draft?.pickup} drop={draft?.drop} />
          {draft?.pickup && draft?.drop && (
            <RoutePolyline pickup={draft.pickup} drop={draft.drop} onMeta={setMeta} />
          )}
          {draft?.pickup && (
            <AdvancedMarker position={{ lat: draft.pickup.latitude, lng: draft.pickup.longitude }}>
              <Pin label="A" />
            </AdvancedMarker>
          )}
          {draft?.drop && (
            <AdvancedMarker position={{ lat: draft.drop.latitude, lng: draft.drop.longitude }}>
              <Pin label="B" />
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>

      {/* Overlay: distance + ETA + vehicle chip */}
      {(distance != null || draft?.vehicle_code) && (
        <div className="absolute top-3 left-3 right-3 flex items-center gap-2 flex-wrap pointer-events-none">
          {distance != null && (
            <div className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
              <RouteIcon size={12} color={YELLOW} />
              <span className="text-[10px] font-bold text-white">{distance.toFixed(1)} km</span>
            </div>
          )}
          {duration != null && (
            <div className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
              <Clock size={12} color={YELLOW} />
              <span className="text-[10px] font-bold text-white">{duration} min</span>
            </div>
          )}
          {draft?.vehicle_code && <VehicleThumb code={draft.vehicle_code} />}
        </div>
      )}

      {compact && (
        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md rounded-full w-8 h-8 flex items-center justify-center pointer-events-none">
          <Maximize2 size={13} color={YELLOW} />
        </div>
      )}
      {!draft?.pickup && (
        <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-3 flex items-center gap-2 pointer-events-none">
          <MapPin size={14} color={YELLOW} />
          <div className="text-[11px] text-white">Choose pickup &amp; drop to see the route on the map.</div>
        </div>
      )}
    </div>
  );
};

// ---------- Shell ----------

/**
 * Wraps a step body with the persistent map. Use *inside* the existing
 * `<div className="min-h-screen bg-background flex flex-col">` — replaces
 * the previous form-only content region.
 *
 * Usage:
 *   <ExpressWizardShell>
 *     <form>…</form>
 *   </ExpressWizardShell>
 *
 * Mobile: compact map on top of children. Desktop: 45% children / 55% map,
 * with the map sticky so it never scrolls out of view.
 */
export const ExpressWizardShell = ({ children, draft = null }) => (
  <div className="flex-1 grid grid-cols-1 md:grid-cols-[45%_1fr] gap-4 px-4 md:px-6 pt-2 pb-6">
    {/* Mobile-only compact map card, appears above form */}
    <div className="md:hidden order-1">
      <WizardMap compact draft={draft} />
    </div>
    {/* Form column */}
    <div className="order-2 md:order-1 flex flex-col min-w-0">{children}</div>
    {/* Desktop persistent map (55%) */}
    <div className="hidden md:block order-2 sticky top-4 self-start h-[calc(100vh-140px)] min-h-[420px]">
      <WizardMap draft={draft} />
    </div>
  </div>
);

export default ExpressWizardShell;
