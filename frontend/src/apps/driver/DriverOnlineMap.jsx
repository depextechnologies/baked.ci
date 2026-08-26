/**
 * DriverOnlineMap — full-screen map surface for the SENDbakēd driver home
 * while they're Online. Renders a dark-styled Google Map centered on the
 * driver's live GPS position with a single "you are here" marker.
 *
 * Layout (matches Fixing_Prompt Screenshot 1):
 *   ── top: [☰] [You are Online pill] [🔔]
 *   ── middle: full-bleed dark map
 *   ── right: floating actions — recenter · safety · open-in-navigation
 *
 * The map is intentionally read-only. It's not a routing/navigation view —
 * that's what /driver/nav is for. This surface only communicates "the app is
 * listening for jobs, here's where you are".
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { Menu, Bell, ChevronDown, Locate, ShieldCheck, Navigation as NavIcon } from "lucide-react";

const MAP_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
// NOTE: no `mapId` — inline `styles` require the legacy map style path.
// If you later register a cloud-based Map ID with matching dark styling,
// pass it here and the DARK_STYLES fallback becomes unnecessary.

// Dark theme approximated from Screenshot 1 — full palette so the map looks
// deliberately branded rather than the vendor default night mode.
const DARK_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#0e0e0e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0e0e0e" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#6b6b6b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#242424" }] },
  { featureType: "road.highway",  elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "water",  elementType: "geometry", stylers: [{ color: "#050d1a" }] },
  { featureType: "poi",    elementType: "labels.text.fill", stylers: [{ color: "#4b6a89" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#122217" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1f1f1f" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#333" }] },
];

const FALLBACK_CENTER = { lat: 28.6139, lng: 77.209 }; // New Delhi (matches CI driver default too)

const DriverMarker = () => (
  <div
    aria-label="You"
    style={{
      width: 20, height: 20, borderRadius: "50%",
      background: "#34d365",
      boxShadow: "0 0 0 6px rgba(52,211,101,.25), 0 0 0 12px rgba(52,211,101,.12), 0 2px 6px rgba(0,0,0,.55)",
      border: "2px solid #0a0a0a",
    }}
  />
);

// Small helper to recenter the map imperatively when the user taps the Locate FAB.
const Recenter = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
  }, [map, target]);
  return null;
};

export const DriverOnlineMap = ({
  driverCoords,             // { lat, lng } | null — from watchPosition
  onMenu,
  onNotifications,
  chipLabel = "You are Online",
  hasUnread = false,
}) => {
  const [recenterKey, setRecenterKey] = useState(0);      // bump to force pan back to driver
  const [safetyOpen, setSafetyOpen] = useState(false);
  const lastCoordsRef = useRef(driverCoords);
  if (driverCoords) lastCoordsRef.current = driverCoords;

  const center = useMemo(
    () => driverCoords || lastCoordsRef.current || FALLBACK_CENTER,
    [driverCoords],
  );

  const openInMaps = () => {
    if (!driverCoords) return;
    const url = `https://www.google.com/maps/@${driverCoords.lat},${driverCoords.lng},15z`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="absolute inset-0 bg-black" data-testid="driver-online-map">
      {MAP_KEY ? (
        <APIProvider apiKey={MAP_KEY}>
          <Map
            defaultCenter={center}
            defaultZoom={15}
            styles={DARK_STYLES}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
          >
            {/* Re-mounting Recenter is enough to trigger the effect. */}
            <Recenter key={recenterKey} target={driverCoords} />
          </Map>
          {/* Overlay a "you are here" pulse at the map centre — the map always
              pans/centres on the driver so this stays visually anchored to their
              actual position, and it works without a Cloud Map ID. */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            aria-hidden
          >
            <DriverMarker />
          </div>
        </APIProvider>
      ) : (
        <div className="w-full h-full grid place-items-center text-white/50 text-sm px-6 text-center">
          Add REACT_APP_GOOGLE_MAPS_API_KEY to render the live map.
        </div>
      )}

      {/* Top overlay — menu · chip · bell */}
      <div className="absolute top-0 left-0 right-0 pt-[max(env(safe-area-inset-top),12px)] px-4 flex items-center gap-3">
        <button
          onClick={onMenu}
          data-testid="driver-map-menu"
          aria-label="Menu"
          className="w-11 h-11 rounded-full bg-neutral-900/85 border border-white/10 backdrop-blur grid place-items-center"
        >
          <Menu size={18} />
        </button>
        <div
          className="flex-1 h-11 px-4 rounded-full bg-neutral-900/85 border border-white/10 backdrop-blur flex items-center justify-center gap-2 text-sm"
          data-testid="driver-map-online-chip"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>You are <span className="font-semibold" style={{ color: "#34d365" }}>Online</span></span>
          <ChevronDown size={14} className="opacity-60" />
        </div>
        <button
          onClick={onNotifications}
          data-testid="driver-map-bell"
          aria-label="Notifications"
          className="relative w-11 h-11 rounded-full bg-neutral-900/85 border border-white/10 backdrop-blur grid place-items-center"
        >
          <Bell size={18} />
          {hasUnread && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" />}
        </button>
      </div>

      {/* Right rail — FABs */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 pointer-events-none">
        {[
          { icon: Locate,       onClick: () => setRecenterKey((k) => k + 1), test: "driver-map-recenter", label: "Recenter" },
          { icon: ShieldCheck,  onClick: () => setSafetyOpen(true),          test: "driver-map-safety",   label: "Safety" },
          { icon: NavIcon,      onClick: openInMaps,                          test: "driver-map-navigate", label: "Open in Maps" },
        ].map(({ icon: Icon, onClick, test, label }) => (
          <button
            key={test}
            onClick={onClick}
            data-testid={test}
            aria-label={label}
            className="pointer-events-auto w-11 h-11 rounded-full bg-neutral-900/85 border border-white/10 backdrop-blur grid place-items-center hover:bg-neutral-800"
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      {safetyOpen && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm grid place-items-center px-6"
          onClick={() => setSafetyOpen(false)}
          data-testid="driver-map-safety-sheet"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-950 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl grid place-items-center"
                 style={{ background: "rgba(255,138,30,.15)", color: "#FF8A1E" }}>
              <ShieldCheck size={22} />
            </div>
            <div className="text-lg font-bold mt-3">Driver Safety</div>
            <div className="text-xs text-white/60 mt-1.5 leading-relaxed">
              Emergency SOS is coming with Phase C. For now, tap-and-hold your phone&apos;s side button to
              trigger your device&apos;s built-in emergency contact.
            </div>
            <button
              onClick={() => setSafetyOpen(false)}
              className="mt-5 w-full h-11 rounded-xl text-sm font-semibold"
              style={{ background: "linear-gradient(135deg,#FF9A2B,#FF7A00)", color: "#0a0a0a" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
