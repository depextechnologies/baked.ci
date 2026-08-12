/**
 * WarehouseLocationPicker — MARTbakēd Dark Store map-based location capture.
 *
 * Fixing_Prompt_2026-02-11_v2 §1-§9, §16-§17. Renders an interactive Google
 * Map with:
 *   - Places autocomplete search (scoped to the currently supported country)
 *   - "Use my current location" GPS button (graceful denial fallback)
 *   - Draggable marker + click-to-move
 *   - Reverse geocoding on every move so the address field stays authoritative
 *   - Country validation (rejects picks outside CI with a friendly message)
 *   - "Confirm this location" gate before the parent form advances
 *
 * The parent form owns the location state via `value` + `onChange`. The
 * component ONLY mutates through `onChange({ latitude, longitude,
 * formatted_address, city, region, country_code, postal_code, place_id,
 * location_accuracy })`. Nothing else on the form ever needs to know how
 * the pin got there.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { toast } from "sonner";
import { Search, Crosshair, MapPin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  fetchAutocompleteSuggestions, fetchPlaceDetails, reverseGeocode, normalizePlace,
} from "@/lib/googleMaps";

// Supported countries — mirrors backend SUPPORTED_COUNTRIES (defaults to CI).
const SUPPORTED = ["CI"];
const COUNTRY_CENTER = {
  CI: { lat: 5.345317, lng: -4.024429 }, // Abidjan
};


const InlineMap = ({ value, onPick, country }) => {
  const map = useMap();
  const center = value?.latitude
    ? { lat: Number(value.latitude), lng: Number(value.longitude) }
    : (COUNTRY_CENTER[country] || COUNTRY_CENTER.CI);

  // Recenter the map when the parent state jumps (e.g. GPS or autocomplete pick).
  useEffect(() => {
    if (!map || !value?.latitude) return;
    map.panTo({ lat: Number(value.latitude), lng: Number(value.longitude) });
    if ((map.getZoom() || 0) < 14) map.setZoom(16);
  }, [map, value?.latitude, value?.longitude]);

  const handleClick = useCallback(async (e) => {
    // e.detail.latLng on the vis.gl adapter
    const ll = e?.detail?.latLng;
    if (!ll) return;
    const { lat, lng } = ll;
    try {
      const place = await reverseGeocode({ lat, lng });
      onPick({ ...place, location_accuracy: "APPROXIMATE" });
    } catch {
      // Reverse geocode failed — still keep the coordinates so the applicant
      // can proceed with a manual address entry.
      onPick({ latitude: lat, longitude: lng, location_accuracy: "APPROXIMATE" });
    }
  }, [onPick]);

  return (
    <Map
      style={{ width: "100%", height: "100%" }}
      defaultCenter={center}
      defaultZoom={value?.latitude ? 16 : 12}
      mapId="baked-store-picker"
      gestureHandling="greedy"
      onClick={handleClick}
      clickableIcons={false}
      data-testid="apply-map"
    >
      {value?.latitude && (
        <AdvancedMarker
          position={{ lat: Number(value.latitude), lng: Number(value.longitude) }}
          draggable
          onDragEnd={async (e) => {
            const ll = e?.latLng;
            if (!ll) return;
            const lat = typeof ll.lat === "function" ? ll.lat() : ll.lat;
            const lng = typeof ll.lng === "function" ? ll.lng() : ll.lng;
            try {
              const place = await reverseGeocode({ lat, lng });
              onPick({ ...place, location_accuracy: "APPROXIMATE" });
            } catch {
              onPick({ latitude: lat, longitude: lng, location_accuracy: "APPROXIMATE" });
            }
          }}
          title="Proposed Dark Store"
          data-testid="apply-map-marker"
        >
          <div style={{
            transform: "translate(-50%, -100%)", display: "inline-flex",
            flexDirection: "column", alignItems: "center", pointerEvents: "none",
          }}>
            <div style={{
              background: "#DC7F1E", color: "#0a0a0f", padding: "4px 10px",
              borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
            }}>
              Proposed Dark Store
            </div>
            <div style={{
              width: 0, height: 0, borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent", borderTop: "8px solid #DC7F1E",
              marginTop: -1,
            }} />
          </div>
        </AdvancedMarker>
      )}
    </Map>
  );
};


export const WarehouseLocationPicker = ({ value, onChange, country = "CI" }) => {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [openList, setOpenList] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const searchTimer = useRef(null);
  const sessionToken = useRef(null);

  // Any change resets the confirm gate — the applicant must re-confirm.
  useEffect(() => { setConfirmed(false); }, [value?.latitude, value?.longitude]);

  // Places autocomplete — debounced 250ms.
  useEffect(() => {
    if (!query.trim() || query.length < 3) { setSuggestions([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      // A fresh session token per search "session" gets us Google's cheaper
      // per-session billing.
      if (!sessionToken.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
      }
      const items = await fetchAutocompleteSuggestions({
        input: query, countryCode: country, sessionToken: sessionToken.current,
      });
      setSuggestions(items);
      setOpenList(true);
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [query, country]);

  const applyPick = (place) => {
    if (place.country && !SUPPORTED.includes(place.country.toUpperCase())) {
      toast.error("This location is currently outside the MARTbakēd service area.");
      return;
    }
    onChange({
      latitude: place.latitude, longitude: place.longitude,
      formatted_address: place.formatted_address,
      city: place.city, region: place.region,
      country_code: (place.country || country).toUpperCase(),
      postal_code: place.postal_code, place_id: place.place_id,
      location_accuracy: place.location_accuracy || "ROOFTOP",
    });
    setQuery(place.formatted_address || "");
    setOpenList(false);
    // Rotate the session token after a successful pick.
    sessionToken.current = null;
  };

  const pickSuggestion = async (s) => {
    try {
      const place = await fetchPlaceDetails({ suggestion: s });
      applyPick({ ...place, location_accuracy: "ROOFTOP" });
    } catch (e) {
      toast.error("Could not load that place — try another.");
      console.error(e);
    }
  };

  const useGps = () => {
    if (!navigator.geolocation) {
      return toast.error("GPS is not available in this browser.");
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const place = await reverseGeocode({
            lat: pos.coords.latitude, lng: pos.coords.longitude,
          });
          applyPick({ ...place, location_accuracy: pos.coords.accuracy < 30 ? "ROOFTOP" : "APPROXIMATE" });
        } catch {
          onChange({
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
            country_code: country, location_accuracy: "APPROXIMATE",
          });
        } finally { setGpsBusy(false); }
      },
      () => {
        setGpsBusy(false);
        toast.info("Location permission was not granted. You can search for your location manually on the map.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  };

  if (!apiKey) {
    return (
      <div className="rounded-xl p-4 text-xs border border-red-500/40 text-red-300"
           data-testid="apply-map-unavailable">
        Google Maps is not configured. Set REACT_APP_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  const picked = value?.latitude != null && value?.longitude != null;
  const outsideSupported = value?.country_code && !SUPPORTED.includes(value.country_code.toUpperCase());

  return (
    <div className="space-y-4" data-testid="apply-location-picker">
      {/* Search + GPS row */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ph-fg-subtle)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setOpenList(true)}
            onBlur={() => setTimeout(() => setOpenList(false), 200)}
            placeholder="Search store location — street, neighborhood, landmark"
            className="w-full pl-9 pr-3 h-12 rounded-xl text-sm"
            style={{
              background: "var(--ph-card)", color: "var(--ph-fg)",
              border: "1px solid var(--ph-border-strong)",
            }}
            data-testid="apply-location-search"
          />
          {openList && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-xl overflow-hidden max-h-72 overflow-y-auto"
                 style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border-strong)" }}
                 data-testid="apply-location-suggestions">
              {suggestions.map((s) => (
                <button key={s.placeId} type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-start gap-2"
                        style={{ color: "var(--ph-fg)", borderBottom: "1px solid var(--ph-border)" }}
                        data-testid={`apply-location-suggestion-${s.placeId}`}>
                  <MapPin size={12} className="mt-0.5 flex-shrink-0" style={{ color: "var(--ph-fg-subtle)" }} />
                  <div className="min-w-0">
                    <div className="truncate">{s.mainText || s.description}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--ph-fg-subtle)" }}>{s.secondaryText}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={useGps} disabled={gpsBusy}
                data-testid="apply-location-gps"
                className="h-12 px-4 rounded-xl text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap"
                style={{
                  background: "var(--ph-warm-soft)", color: "var(--ph-accent-warm)",
                  border: "1px solid var(--ph-accent-warm)",
                }}>
          {gpsBusy ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          {gpsBusy ? "Locating…" : "Use my current location"}
        </button>
      </div>

      {/* Map */}
      <div className="h-72 md:h-96 rounded-2xl overflow-hidden relative"
           style={{ border: "1px solid var(--ph-border-strong)" }}>
        <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
          <InlineMap value={value} onPick={applyPick} country={country} />
        </APIProvider>
        {!picked && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="rounded-full px-4 py-2 text-xs backdrop-blur"
                 style={{ background: "rgba(0,0,0,.55)", color: "#fff" }}>
              Search above or tap the map to drop a pin
            </div>
          </div>
        )}
      </div>

      {/* Location card + confirm */}
      {picked && (
        <div className="rounded-xl p-4 space-y-3"
             style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border-strong)" }}
             data-testid="apply-location-card">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="mt-0.5" style={{ color: "var(--ph-accent-warm)" }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: "var(--ph-fg)" }}
                   data-testid="apply-location-formatted-address">
                {value.formatted_address || "Custom pin"}
              </div>
              <div className="text-[11px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5"
                   style={{ color: "var(--ph-fg-subtle)" }}>
                <span data-testid="apply-location-coords">
                  {Number(value.latitude).toFixed(5)}, {Number(value.longitude).toFixed(5)}
                </span>
                {value.city && <span>{value.city}</span>}
                {value.region && <span>· {value.region}</span>}
                {value.country_code && <span>· {value.country_code}</span>}
                {value.location_accuracy && (
                  <span className="uppercase tracking-widest">· {value.location_accuracy}</span>
                )}
              </div>
            </div>
          </div>

          {outsideSupported && (
            <div className="flex items-start gap-2 p-2 rounded"
                 style={{ background: "rgba(255,90,90,.10)", color: "#ff9090" }}
                 data-testid="apply-location-country-error">
              <AlertTriangle size={12} className="mt-0.5" />
              <div className="text-[11px]">
                This location is currently outside the MARTbakēd service area
                ({value.country_code}). Please pick a location in Côte d&apos;Ivoire.
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button"
                    onClick={() => { onChange({}); setQuery(""); setConfirmed(false); }}
                    className="h-9 px-3 rounded-lg text-xs"
                    style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }}
                    data-testid="apply-location-change">
              Change location
            </button>
            <button type="button" disabled={outsideSupported}
                    onClick={() => { setConfirmed(true); toast.success("Location confirmed"); }}
                    className="h-9 px-4 rounded-lg text-xs inline-flex items-center gap-1 disabled:opacity-40"
                    style={{ background: confirmed ? "rgba(120,255,120,.15)" : "var(--ph-accent-warm)",
                             color:      confirmed ? "#8ce68a" : "#0a0a0f" }}
                    data-testid="apply-location-confirm">
              <CheckCircle2 size={12} />
              {confirmed ? "Location confirmed" : "Confirm this location"}
            </button>
          </div>
          {/* Signals to parent form that user has passed the confirm gate. */}
          <input type="hidden" value={confirmed ? "1" : ""} data-testid="apply-location-confirmed-flag" readOnly />
        </div>
      )}
    </div>
  );
};

export default WarehouseLocationPicker;
