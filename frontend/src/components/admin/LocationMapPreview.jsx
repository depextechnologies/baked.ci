/**
 * LocationMapPreview — read-only Google Map used by admin review drawers.
 *
 * Fixing_Prompt_2026-02-11_v2 §17-§18: operators must visually confirm the
 * dark-store pin BEFORE they approve an application. This component renders:
 *   - A compact map centred on the applicant-selected coordinates
 *   - A "Proposed Dark Store" marker (identical to the applicant's view)
 *   - Coordinates + accuracy badge + "View on Google Maps ↗" external link
 *   - Graceful empty state when an old row has no coords yet
 *
 * Interaction is intentionally disabled: clicks/drags do nothing so an admin
 * can't accidentally reposition the pin from inside the review drawer. Any
 * correction must go back to the applicant via a "Request info" action.
 */
import React from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { MapPin, ExternalLink, AlertTriangle } from "lucide-react";


export const LocationMapPreview = ({
  latitude, longitude, formatted_address, place_id, location_accuracy,
  country_code, region, postal_code,
  height = 220, mapId = "baked-review-preview",
}) => {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const hasCoords = latitude != null && longitude != null;
  const lat = hasCoords ? Number(latitude)  : null;
  const lng = hasCoords ? Number(longitude) : null;

  if (!apiKey) {
    return (
      <div className="rounded-lg p-3 text-xs border border-yellow-500/40 text-yellow-300 flex items-start gap-2"
           data-testid="admin-app-map-unavailable">
        <AlertTriangle size={12} className="mt-0.5" />
        Google Maps is not configured. Set REACT_APP_GOOGLE_MAPS_API_KEY to enable the review map.
      </div>
    );
  }

  if (!hasCoords) {
    return (
      <div className="rounded-lg p-4 text-xs border border-yellow-500/40 text-yellow-300 flex items-start gap-2"
           data-testid="admin-app-map-no-coords">
        <AlertTriangle size={12} className="mt-0.5" />
        <div>
          <div className="font-medium">No coordinates were captured for this application.</div>
          <div className="mt-1 text-yellow-300/70">
            This is a legacy application submitted before the map picker rolled out.
            Ask the applicant to re-submit with a pinned location, or set coordinates
            manually on the store once it&apos;s approved.
          </div>
        </div>
      </div>
    );
  }

  const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div className="space-y-2" data-testid="admin-app-map-preview">
      <div className="rounded-lg overflow-hidden relative"
           style={{ height, border: "1px solid var(--border)" }}>
        <APIProvider apiKey={apiKey}>
          <Map
            style={{ width: "100%", height: "100%" }}
            defaultCenter={{ lat, lng }}
            defaultZoom={16}
            mapId={mapId}
            // Read-only — admins cannot reposition. Zoom + pan stay enabled
            // so they can inspect the surroundings without moving the pin.
            gestureHandling="cooperative"
            disableDefaultUI={false}
            clickableIcons={false}
          >
            <AdvancedMarker position={{ lat, lng }} title="Proposed Dark Store"
                            data-testid="admin-app-map-marker">
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
          </Map>
        </APIProvider>
      </div>

      {/* Coord + accuracy card */}
      <div className="rounded-lg p-3 text-xs space-y-1 border border-border bg-card/60"
           data-testid="admin-app-map-meta">
        {formatted_address && (
          <div className="flex items-start gap-2">
            <MapPin size={12} className="mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0 flex-1 truncate">{formatted_address}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground pl-5"
             data-testid="admin-app-map-coords">
          <span className="font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
          {location_accuracy && (
            <span className="uppercase tracking-widest text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(220,127,30,.15)", color: "#DC7F1E" }}
                  data-testid="admin-app-map-accuracy">
              {location_accuracy}
            </span>
          )}
          {country_code && <span>· {country_code}</span>}
          {region && <span>· {region}</span>}
          {postal_code && <span>· {postal_code}</span>}
          {place_id && (
            <span className="font-mono truncate max-w-[140px]" title={place_id}>
              · pid:{place_id.slice(0, 12)}…
            </span>
          )}
        </div>
        <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1 pl-5 text-primary underline underline-offset-2"
           data-testid="admin-app-map-external-link">
          View on Google Maps <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
};

export default LocationMapPreview;
