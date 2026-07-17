import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon URLs (Webpack strips them from the package)
// We'll draw our own DivIcons anyway.
delete L.Icon.Default.prototype._getIconUrl;

const storeIcon = () => L.divIcon({
  className: "",
  html: `<div style="width:34px;height:34px;background:#77BC1F;border:3px solid #0a1200;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4)"><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#0a1200' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 9l1-5h16l1 5'/><path d='M4 9v11h16V9'/><path d='M9 22V12h6v10'/></svg></div>`
});
const destIcon = () => L.divIcon({
  className: "",
  html: `<div style="width:34px;height:34px;background:#FF4C52;border:3px solid #0a1200;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4)"><svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z'/><circle cx='12' cy='9' r='2.5'/></svg></div>`
});
const driverIcon = () => L.divIcon({
  className: "",
  html: `<div style="position:relative"><div style="width:44px;height:44px;background:#1D9BF0;border:4px solid #0a1200;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(29,155,240,.6);animation:pulse 1.6s ease-in-out infinite"><svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='5.5' cy='17.5' r='3.5'/><circle cx='18.5' cy='17.5' r='3.5'/><path d='M15 6a1 1 0 1 0 0-2h-1v3l-3 5H5l6-3'/></svg></div><style>@keyframes pulse{0%,100%{transform:scale(1);box-shadow:0 6px 16px rgba(29,155,240,.6)}50%{transform:scale(1.1);box-shadow:0 8px 24px rgba(29,155,240,.9)}}</style></div>`
});

/**
 * Lightweight Leaflet map (no react-leaflet needed) — displays store, destination and a live driver marker.
 * Uses OpenStreetMap tiles. Auto-fits bounds.
 */
export const TrackingMap = ({ store, destination, driver, height = 240 }) => {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    if (!ref.current || !store || !destination) return;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, {
        zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false, doubleClickZoom: false,
      }).setView([store.lat, store.lng], 14);

      // Use CARTO Dark tiles for cohesion with app dark theme
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 20,
      }).addTo(mapRef.current);

      // Route polyline
      const line = L.polyline([[store.lat, store.lng], [destination.lat, destination.lng]], {
        color: "#77BC1F", weight: 4, opacity: 0.85, dashArray: "8, 8", lineCap: "round",
      }).addTo(mapRef.current);
      markersRef.current.line = line;

      markersRef.current.store = L.marker([store.lat, store.lng], { icon: storeIcon() }).addTo(mapRef.current).bindTooltip(store.name || "Store", { direction: "top", offset: [0, -18], className: "leaflet-baked-tip" });
      markersRef.current.dest = L.marker([destination.lat, destination.lng], { icon: destIcon() }).addTo(mapRef.current).bindTooltip("You", { direction: "top", offset: [0, -18], className: "leaflet-baked-tip" });
    }

    if (driver) {
      if (!markersRef.current.driver) {
        markersRef.current.driver = L.marker([driver.lat, driver.lng], { icon: driverIcon(), zIndexOffset: 1000 }).addTo(mapRef.current);
      } else {
        markersRef.current.driver.setLatLng([driver.lat, driver.lng]);
      }
    }

    // Fit bounds
    try {
      const group = L.featureGroup([markersRef.current.store, markersRef.current.dest, ...(markersRef.current.driver ? [markersRef.current.driver] : [])]);
      mapRef.current.fitBounds(group.getBounds().pad(0.35), { animate: true });
    } catch { /* ignore */ }
  }, [store, destination, driver]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current = {}; } }, []);

  return <div ref={ref} style={{ width: "100%", height, borderRadius: 18, overflow: "hidden", background: "#0a0a0a" }} />;
};
