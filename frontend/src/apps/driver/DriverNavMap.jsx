/**
 * DriverNavMap — live Google Maps route + smooth interpolated driver marker.
 *
 * Two run modes:
 *
 *   1. Driver PWA (job page): browser geolocation supplies the driver
 *      position. Directions is fetched once and refreshed only on
 *      *meaningful* motion (see REFRESH_DEVIATION_M, REFRESH_INTERVAL_MS)
 *      or when the destination endpoint changes (pickup → dropoff).
 *
 *   2. Customer tracking page: parent passes `livePosition` (a
 *      { lat, lng, heading, speed_mps, ts } object) that arrives via WS.
 *      Marker moves smoothly using requestAnimationFrame between the
 *      last two positions with a small buffer (~2.5s) so the vehicle
 *      never teleports, even if WS updates are bursty.
 *
 * Directions API stays *decoupled* from the high-frequency marker updates:
 * we only call `svc.route(...)` on meaningful deviation / endpoint change /
 * a slow 45s validation heartbeat — never on every GPS tick.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Navigation, MapPin, Route as RouteIcon, Clock, ExternalLink, Loader2, Wifi, WifiOff } from "lucide-react";
import { useDriverTheme } from "./useDriverTheme";

const ORANGE = "#FF7A00";
const AMBER  = "#FFB454";

// Directions refresh policy — the Uber trick: don't recompute on every tick.
const REFRESH_DEVIATION_M = 150;   // recompute if the driver moves >150m from the last-drawn origin
const REFRESH_INTERVAL_MS = 45000; // …or every 45s as a slow validation

const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dlat = toRad(b.lat - a.lat);
  const dlng = toRad(b.lng - a.lng);
  const s = Math.sin(dlat / 2) ** 2
          + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const bearingBetween = (a, b) => {
  if (!a || !b) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/* ------------------------------------------------------------------------- */
/*  Driver marker with rotation                                               */
/* ------------------------------------------------------------------------- */

const DriverPin = ({ heading = 0 }) => (
  <div style={{
    width: 40, height: 40, borderRadius: 999,
    background: "linear-gradient(135deg, #FFB454, #FF7A00)",
    boxShadow: "0 8px 24px -6px rgba(255,122,0,0.7), 0 0 0 4px rgba(255,122,0,0.25)",
    display: "grid", placeItems: "center",
    transform: `rotate(${heading}deg)`, transition: "transform 500ms ease-out",
  }}>
    <Navigation size={18} color="#000" style={{ transform: "rotate(-45deg)" }} />
  </div>
);

const DestPin = ({ variant }) => (
  <div style={{ width: 32, height: 40, position: "relative", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))" }}>
    <div style={{
      width: 32, height: 32, borderRadius: 16,
      background: variant === "dropoff" ? "#0a0a0a" : "#fff",
      border: "2px solid #FF7A00",
      display: "grid", placeItems: "center",
    }}>
      <MapPin size={16} color={variant === "dropoff" ? "#FFB454" : "#FF7A00"} />
    </div>
    <div style={{
      position: "absolute", left: "50%", bottom: -6, transform: "translateX(-50%)",
      width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
      borderTop: `8px solid ${variant === "dropoff" ? "#0a0a0a" : "#fff"}`,
    }} />
  </div>
);

/* ------------------------------------------------------------------------- */
/*  Smooth position — rAF interpolation between the last two known points    */
/* ------------------------------------------------------------------------- */

const useSmoothPosition = (target, { minDurationMs = 400, maxDurationMs = 3000 } = {}) => {
  const [pos, setPos]       = useState(target || null);
  const fromRef             = useRef(target || null);
  const toRef               = useRef(target || null);
  const startRef            = useRef(0);
  const durRef              = useRef(minDurationMs);
  const rafRef              = useRef(null);
  const [heading, setHead]  = useState(target?.heading ?? 0);

  useEffect(() => {
    if (!target) return;
    // First-ever position → snap.
    if (!fromRef.current) {
      fromRef.current = target; toRef.current = target;
      setPos(target); if (typeof target.heading === "number") setHead(target.heading);
      return;
    }
    const from = pos || fromRef.current;
    const to   = target;
    const km = haversineKm(from, to) || 0;
    // Adaptive: shorter for tiny nudges, longer for real motion. Never longer
    // than maxDurationMs — beyond that we'd feel laggy relative to reality.
    let dur = Math.max(minDurationMs, Math.min(maxDurationMs, 250 + km * 3600));  // 1km → ~3.85s
    if (km < 0.001) dur = minDurationMs;
    fromRef.current = from;
    toRef.current   = to;
    startRef.current = performance.now();
    durRef.current = dur;
    // Heading — server-provided wins, otherwise derive from bearing.
    setHead(typeof to.heading === "number" ? to.heading : bearingBetween(from, to));

    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / durRef.current);
      // easeOutCubic for that gliding stop.
      const e = 1 - Math.pow(1 - t, 3);
      const lat = fromRef.current.lat + (toRef.current.lat - fromRef.current.lat) * e;
      const lng = fromRef.current.lng + (toRef.current.lng - fromRef.current.lng) * e;
      setPos({ lat, lng });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target?.lat, target?.lng, target?.heading]);

  return { pos, heading };
};

/* ------------------------------------------------------------------------- */
/*  Directions polyline + auto-fit                                            */
/* ------------------------------------------------------------------------- */

const Route = ({ origin, destination, onMeta, colorKey }) => {
  const map = useMap();
  const onMetaRef = useRef(onMeta);
  const rendererRef = useRef(null);
  const lastOriginRef = useRef(null);
  const lastFetchRef = useRef(0);
  useEffect(() => { onMetaRef.current = onMeta; }, [onMeta]);

  const compute = useCallback((from, to) => {
    if (!map || !from || !to || !window.google?.maps) return;
    const svc = new window.google.maps.DirectionsService();
    if (!rendererRef.current) {
      rendererRef.current = new window.google.maps.DirectionsRenderer({
        map, suppressMarkers: true, preserveViewport: true,
        polylineOptions: { strokeColor: colorKey === "dropoff" ? AMBER : ORANGE, strokeWeight: 5, strokeOpacity: 0.95 },
      });
    }
    svc.route({
      origin: from, destination: to,
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (res, status) => {
      if (status === "OK" && res) {
        rendererRef.current.setDirections(res);
        lastOriginRef.current = from;
        lastFetchRef.current  = Date.now();
        const leg = res.routes?.[0]?.legs?.[0];
        if (leg && onMetaRef.current) {
          onMetaRef.current({
            distance_km:  leg.distance?.value / 1000,
            duration_min: Math.round(leg.duration?.value / 60),
          });
        }
      }
    });
  }, [map, colorKey]);

  // Recompute policy — decoupled from marker updates on purpose.
  useEffect(() => {
    if (!origin || !destination) return;
    const last  = lastOriginRef.current;
    const now   = Date.now();
    const km    = last ? (haversineKm(last, origin) || 0) : Infinity;
    const stale = now - lastFetchRef.current > REFRESH_INTERVAL_MS;
    if (!last || km * 1000 >= REFRESH_DEVIATION_M || stale) compute(origin, destination);
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, compute]);

  // Re-render (destination color) when direction changes pickup → dropoff.
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setOptions({ polylineOptions: {
      strokeColor: colorKey === "dropoff" ? AMBER : ORANGE, strokeWeight: 5, strokeOpacity: 0.95,
    }});
  }, [colorKey]);

  useEffect(() => () => { rendererRef.current?.setMap(null); rendererRef.current = null; }, []);
  return null;
};

const FitBounds = ({ points, once = false }) => {
  const map = useMap();
  const didRef = useRef(false);
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    if (once && didRef.current) return;
    const valid = points.filter(Boolean);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(15);
    } else {
      const b = new window.google.maps.LatLngBounds();
      valid.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 90);
    }
    didRef.current = true;
  }, [map, JSON.stringify(points), once]);
  return null;
};

/* ------------------------------------------------------------------------- */
/*  Browser-geolocation watcher (driver PWA only)                             */
/* ------------------------------------------------------------------------- */

const useBrowserGeolocation = (fallback, enabled) => {
  const [pos, setPos] = useState(null);
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (g) => {
        setPos({
          lat: g.coords.latitude,
          lng: g.coords.longitude,
          heading: g.coords.heading ?? null,
          speed_mps: g.coords.speed ?? null,
        });
        setGranted(true);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { pos: pos || (enabled ? fallback : null), granted };
};

/* ------------------------------------------------------------------------- */
/*  Public NavMap                                                             */
/* ------------------------------------------------------------------------- */

export const DriverNavMap = ({
  job,
  onMeta,
  livePosition = null,        // customer-side WS-fed position { lat, lng, heading?, speed_mps? }
  driverPosition = null,      // customer-side fallback (server snapshot)
  onDriverPositionChange = null,  // driver-PWA callback — called on every GPS fix (unthrottled)
  connectionState = null,     // 'live' | 'reconnecting' | null — badge overlay
  className = "h-56",         // override to "absolute inset-0" for full-bleed dashboard use
  rounded = true,             // set false when embedded in a full-bleed surface
  chromeless = false,         // when true, don't render top chips / bottom pill — the
                              // parent (e.g. DriverTripSheet) is drawing its own chrome.
}) => {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const { theme } = useDriverTheme();
  // Two mapIds — one calibrated for the SENDbakēd dark palette and one for
  // the light theme (Google's Cloud Console default light works well). We
  // key the <Map> off theme so it fully remounts on toggle, dropping the
  // old canvas cleanly rather than trying to restyle inline.
  const mapId = theme === "light" ? "baked-driver-nav-light" : "baked-driver-nav";

  const goingTo = useMemo(() => {
    const dropStages = new Set(["picked_up", "arriving_dropoff"]);
    return dropStages.has(job.status) ? "dropoff" : "pickup";
  }, [job.status]);

  const pickup  = useMemo(() => ({ lat: job.pickup.lat,  lng: job.pickup.lng  }), [job.pickup.lat,  job.pickup.lng]);
  const dropoff = useMemo(() => ({ lat: job.dropoff.lat, lng: job.dropoff.lng }), [job.dropoff.lat, job.dropoff.lng]);
  const destination = goingTo === "dropoff" ? dropoff : pickup;

  // Priority: live WS > server snapshot > browser geolocation > pickup fallback
  const external = useMemo(() => (
    livePosition?.lat != null && livePosition?.lng != null ? {
      lat: livePosition.lat, lng: livePosition.lng,
      heading: livePosition.heading ?? null, speed_mps: livePosition.speed_mps ?? null,
    } : (driverPosition?.lat != null && driverPosition?.lng != null ? {
      lat: driverPosition.lat, lng: driverPosition.lng, heading: null, speed_mps: null,
    } : null)
  ), [livePosition?.lat, livePosition?.lng, livePosition?.heading, livePosition?.speed_mps,
      driverPosition?.lat, driverPosition?.lng]);

  const browser = useBrowserGeolocation(pickup, /* enabled */ !external);
  const rawDriverPos = external || browser.pos;

  // Report every GPS fix upwards (driver PWA uses this to publish over WS).
  const lastFixRef = useRef(null);
  useEffect(() => {
    if (!external && browser.pos && onDriverPositionChange) {
      const last = lastFixRef.current;
      // Nudge upstream only when the fix actually differs — avoids infinite loops.
      if (!last || last.lat !== browser.pos.lat || last.lng !== browser.pos.lng) {
        lastFixRef.current = browser.pos;
        onDriverPositionChange(browser.pos);
      }
    }
  }, [browser.pos?.lat, browser.pos?.lng, external, onDriverPositionChange]);

  // Smooth marker (rAF-interpolated). Snap-first mode when we have no driver yet.
  const { pos: smoothPos, heading } = useSmoothPosition(rawDriverPos, {
    minDurationMs: external ? 800 : 300,   // customer-side gets a longer glide
    maxDurationMs: external ? 3000 : 1200,
  });

  const [meta, setMeta] = useState(null);
  const handleMeta = useCallback((m) => { setMeta(m); if (onMeta) onMeta(m); }, [onMeta]);

  const fbKm = useMemo(() => haversineKm(smoothPos, destination), [smoothPos, destination]);
  const distance = meta?.distance_km ?? fbKm ?? null;
  const duration = meta?.duration_min ?? (fbKm != null ? Math.round(fbKm * 3) : null);

  const openInGoogle = () => {
    const q = `${destination.lat},${destination.lng}`;
    const origin = smoothPos ? `${smoothPos.lat},${smoothPos.lng}` : "";
    const url = `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin}` : ""}&destination=${q}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!apiKey) {
    return (
      <div className="h-52 rounded-3xl border border-white/10 grid place-items-center text-xs text-white/50 p-4"
           data-testid="driver-job-map-missing">
        Live navigation needs a Google Maps API key. Add <code className="text-white">REACT_APP_GOOGLE_MAPS_API_KEY</code>.
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${rounded ? "rounded-3xl border border-white/10" : ""} ${className.includes("absolute") || className.includes("fixed") ? "" : "relative"} ${className}`}
         data-testid="driver-job-map">
      <APIProvider apiKey={apiKey}>
        <Map
          key={mapId /* remount on theme change so styles cleanly swap */}
          style={{ width: "100%", height: "100%" }}
          defaultCenter={smoothPos || pickup}
          defaultZoom={13}
          mapId={mapId}
          gestureHandling="greedy"
          disableDefaultUI
        >
          {/* Fit ONCE on mount so the smooth-moving marker doesn't force
              constant recenter — that's what makes AI-slop maps feel janky. */}
          <FitBounds points={[smoothPos, destination]} once />
          {smoothPos && (
            <Route origin={smoothPos} destination={destination}
                   onMeta={handleMeta} colorKey={goingTo} />
          )}
          {smoothPos && (
            <AdvancedMarker position={smoothPos}>
              <DriverPin heading={heading} />
            </AdvancedMarker>
          )}
          <AdvancedMarker position={destination}>
            <DestPin variant={goingTo} />
          </AdvancedMarker>
        </Map>
      </APIProvider>

      {/* Distance + ETA + open-in-google chips */}
      {!chromeless && (
      <div className="absolute top-3 left-3 right-3 flex items-center gap-2 flex-wrap pointer-events-none">
        {distance == null ? (
          <div className="pointer-events-auto flex items-center gap-1.5 bg-card/85 backdrop-blur-md rounded-full px-3 py-1.5 border border-border"
               data-testid="driver-map-loading">
            <Loader2 size={12} className="animate-spin text-orange-500" />
            <span className="text-[10px] font-bold text-foreground/80">Fetching route…</span>
          </div>
        ) : (
          <>
            <div className="pointer-events-auto flex items-center gap-1.5 bg-card/85 backdrop-blur-md rounded-full px-3 py-1.5 border border-border"
                 data-testid="driver-map-distance">
              <RouteIcon size={12} color={ORANGE} />
              <span className="text-[10px] font-bold text-foreground">{distance.toFixed(1)} km</span>
            </div>
            {duration != null && (
              <div className="pointer-events-auto flex items-center gap-1.5 bg-card/85 backdrop-blur-md rounded-full px-3 py-1.5 border border-border"
                   data-testid="driver-map-eta">
                <Clock size={12} color={ORANGE} />
                <span className="text-[10px] font-bold text-foreground">{duration} min</span>
              </div>
            )}
          </>
        )}
        {/* Live / reconnecting badge for customer view */}
        {connectionState && (
          <div className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 border
                          ${connectionState === "live" ? "bg-emerald-500/20 border-emerald-500/40"
                                                       : "bg-amber-500/20 border-amber-500/40"}`}
               data-testid={`send-track-conn-${connectionState}`}>
            {connectionState === "live" ? <Wifi size={12} className="text-emerald-400" />
                                        : <WifiOff size={12} className="text-amber-400" />}
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/90">
              {connectionState === "live" ? "Live" : "Reconnecting"}
            </span>
          </div>
        )}
        <button onClick={openInGoogle}
                data-testid="driver-map-open-google"
                className="pointer-events-auto ml-auto flex items-center gap-1.5 bg-orange-500 rounded-full px-3 py-1.5">
          <ExternalLink size={12} color="#000" />
          <span className="text-[10px] font-bold text-black">Navigate</span>
        </button>
      </div>
      )}

      {/* Going-to label */}
      {!chromeless && (
      <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
        <div className="inline-flex items-center gap-2 bg-card/85 backdrop-blur-md rounded-full px-3 py-1.5 border border-border">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: goingTo === "dropoff" ? AMBER : ORANGE }} />
          <span className="text-[10px] font-medium text-foreground/90 uppercase tracking-widest">
            {goingTo === "dropoff" ? "To drop-off" : "To pickup"}
          </span>
        </div>
      </div>
      )}
    </div>
  );
};

export default DriverNavMap;
