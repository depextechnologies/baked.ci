/**
 * DriverNavMap — live Google Maps route + ETA for the driver JobPage.
 *
 * Origin  = driver's live position (navigator.geolocation.watchPosition)
 * Destination = job.pickup while status ∈ (accepted, arriving_pickup)
 *             = job.dropoff while status ∈ (picked_up, arriving_dropoff)
 *
 * The map re-fits when either endpoint changes. Distance + ETA are read
 * from the DirectionsService response and surfaced back to the parent
 * (JobPage) via `onMeta` so the pill overlay + stage-card can share the
 * same live values.
 *
 * A big "Open in Google Maps" button deep-links to the native app for
 * turn-by-turn — we intentionally don't try to render our own turn-by-turn
 * on top of the JS SDK.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Navigation, MapPin, Route as RouteIcon, Clock, ExternalLink, Loader2 } from "lucide-react";

const ORANGE = "#FF7A00";
const AMBER  = "#FFB454";

const DriverPin = () => (
  <div style={{
    width: 34, height: 34, borderRadius: 999,
    background: "linear-gradient(135deg, #FFB454, #FF7A00)",
    boxShadow: "0 8px 24px -6px rgba(255,122,0,0.7), 0 0 0 4px rgba(255,122,0,0.25)",
    display: "grid", placeItems: "center",
  }}>
    <Navigation size={16} color="#000" />
  </div>
);

const DestPin = ({ variant }) => (
  <div style={{
    width: 32, height: 40, position: "relative",
    filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))",
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 16,
      background: variant === "dropoff" ? "#0a0a0a" : "#fff",
      border: variant === "dropoff" ? "2px solid #FF7A00" : "2px solid #FF7A00",
      display: "grid", placeItems: "center",
    }}>
      <MapPin size={16} color={variant === "dropoff" ? "#FFB454" : "#FF7A00"} />
    </div>
    <div style={{
      position: "absolute", left: "50%", bottom: -6, transform: "translateX(-50%)",
      width: 0, height: 0,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderTop: `8px solid ${variant === "dropoff" ? "#0a0a0a" : "#fff"}`,
    }} />
  </div>
);

/* ------------------------------------------------------------------------- */
/*  Directions polyline + auto-fit                                            */
/* ------------------------------------------------------------------------- */

const Route = ({ origin, destination, onMeta, colorKey }) => {
  const map = useMap();
  const onMetaRef = useRef(onMeta);
  useEffect(() => { onMetaRef.current = onMeta; }, [onMeta]);
  useEffect(() => {
    if (!map || !origin || !destination || !window.google?.maps) return;
    const svc = new window.google.maps.DirectionsService();
    const renderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: colorKey === "dropoff" ? AMBER : ORANGE, strokeWeight: 5, strokeOpacity: 0.95 },
    });
    svc.route({
      origin:      { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode:  window.google.maps.TravelMode.DRIVING,
    }, (res, status) => {
      if (status === "OK" && res) {
        renderer.setDirections(res);
        const leg = res.routes?.[0]?.legs?.[0];
        if (leg && onMetaRef.current) {
          onMetaRef.current({
            distance_km:  leg.distance?.value / 1000,
            duration_min: Math.round(leg.duration?.value / 60),
          });
        }
      }
    });
    return () => renderer.setMap(null);
  }, [map, origin?.lat, origin?.lng, destination?.lat, destination?.lng, colorKey]);
  return null;
};

const FitBounds = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const valid = points.filter(Boolean);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
      map.setZoom(15);
      return;
    }
    const b = new window.google.maps.LatLngBounds();
    valid.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(b, 90);
  }, [map, JSON.stringify(points)]);
  return null;
};

/* ------------------------------------------------------------------------- */
/*  Haversine fallback so we still show a distance chip before Directions    */
/*  responds (or if the Directions API is unavailable).                       */
/* ------------------------------------------------------------------------- */

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

/* ------------------------------------------------------------------------- */
/*  Live driver geolocation                                                   */
/* ------------------------------------------------------------------------- */

const useDriverPosition = (fallback, enabled = true) => {
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setErr("no_geoloc"); return; }
    const id = navigator.geolocation.watchPosition(
      (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
      (e) => setErr(e?.message || "denied"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { pos: pos || (enabled ? fallback : null), granted: !!pos, err };
};

/* ------------------------------------------------------------------------- */
/*  Public NavMap                                                             */
/* ------------------------------------------------------------------------- */

export const DriverNavMap = ({ job, onMeta, driverPosition = null }) => {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // Which endpoint is the driver navigating toward right now?
  const goingTo = useMemo(() => {
    const dropStages = new Set(["picked_up", "arriving_dropoff"]);
    return dropStages.has(job.status) ? "dropoff" : "pickup";
  }, [job.status]);

  const pickup  = useMemo(() => ({ lat: job.pickup.lat,  lng: job.pickup.lng  }), [job.pickup.lat,  job.pickup.lng]);
  const dropoff = useMemo(() => ({ lat: job.dropoff.lat, lng: job.dropoff.lng }), [job.dropoff.lat, job.dropoff.lng]);
  const destination = goingTo === "dropoff" ? dropoff : pickup;

  // Two modes:
  //   - driver-app: read the browser geolocation (default).
  //   - customer-tracking: caller passes `driverPosition` from the server.
  const externalPos = useMemo(() => (
    driverPosition && driverPosition.lat != null && driverPosition.lng != null
      ? { lat: driverPosition.lat, lng: driverPosition.lng }
      : null
  ), [driverPosition?.lat, driverPosition?.lng]);
  const browser = useDriverPosition(pickup, /* enabled */ !externalPos);
  const driverPos = externalPos || browser.pos;
  const granted   = !!externalPos || browser.granted;

  const [meta, setMeta] = useState(null);
  const handleMeta = useCallback((m) => { setMeta(m); if (onMeta) onMeta(m); }, [onMeta]);

  // Haversine fallback in case Directions hasn't answered yet.
  const fbKm = useMemo(() => haversineKm(driverPos, destination), [driverPos, destination]);
  const distance = meta?.distance_km ?? fbKm ?? null;
  const duration = meta?.duration_min ?? (fbKm != null ? Math.round(fbKm * 3) : null);

  const openInGoogle = () => {
    const q = `${destination.lat},${destination.lng}`;
    const origin = granted && driverPos ? `${driverPos.lat},${driverPos.lng}` : "";
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
    <div className="relative rounded-3xl border border-white/10 overflow-hidden h-56"
         data-testid="driver-job-map">
      <APIProvider apiKey={apiKey}>
        <Map
          style={{ width: "100%", height: "100%" }}
          defaultCenter={driverPos || pickup}
          defaultZoom={13}
          mapId="baked-driver-nav"
          gestureHandling="greedy"
          disableDefaultUI
        >
          <FitBounds points={[driverPos, destination]} />
          {driverPos && (
            <Route origin={driverPos} destination={destination} onMeta={handleMeta} colorKey={goingTo} />
          )}
          {driverPos && (
            <AdvancedMarker position={driverPos}>
              <DriverPin />
            </AdvancedMarker>
          )}
          <AdvancedMarker position={destination}>
            <DestPin variant={goingTo} />
          </AdvancedMarker>
        </Map>
      </APIProvider>

      {/* Distance + ETA + open-in-google chips */}
      <div className="absolute top-3 left-3 right-3 flex items-center gap-2 flex-wrap pointer-events-none">
        {distance == null ? (
          <div className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10"
               data-testid="driver-map-loading">
            <Loader2 size={12} className="animate-spin text-orange-500" />
            <span className="text-[10px] font-bold text-white/80">Fetching route…</span>
          </div>
        ) : (
          <>
            <div className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10"
                 data-testid="driver-map-distance">
              <RouteIcon size={12} color={ORANGE} />
              <span className="text-[10px] font-bold text-white">{distance.toFixed(1)} km</span>
            </div>
            {duration != null && (
              <div className="pointer-events-auto flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10"
                   data-testid="driver-map-eta">
                <Clock size={12} color={ORANGE} />
                <span className="text-[10px] font-bold text-white">{duration} min</span>
              </div>
            )}
          </>
        )}
        <button onClick={openInGoogle}
                data-testid="driver-map-open-google"
                className="pointer-events-auto ml-auto flex items-center gap-1.5 bg-orange-500 rounded-full px-3 py-1.5">
          <ExternalLink size={12} color="#000" />
          <span className="text-[10px] font-bold text-black">Navigate</span>
        </button>
      </div>

      {/* Going-to label */}
      <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
        <div className="inline-flex items-center gap-2 bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: goingTo === "dropoff" ? AMBER : ORANGE }} />
          <span className="text-[10px] font-medium text-white/90 uppercase tracking-widest">
            {goingTo === "dropoff" ? "To drop-off" : "To pickup"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DriverNavMap;
