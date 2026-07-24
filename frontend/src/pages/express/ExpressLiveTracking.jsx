import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { ArrowLeft, MapPin, Phone, Star, Bike, Truck, CheckCircle2, Package } from "lucide-react";
import { useMoney } from "../../components/express/ExpressLayout";

/**
 * ExpressLiveTracking — customer-facing live view of a parcel booking.
 *
 * Opens a WebSocket to /api/express/ws/bookings/{id} which pushes:
 *   - initial snapshot
 *   - subsequent status transitions
 *   - live driver_location + eta_seconds while in motion
 *
 * Works in both DEMO_MODE (backend simulator advances the lifecycle in ~2 min)
 * and production (advances only when the driver app hits the status endpoint).
 */

const YELLOW = "#FCC44C";
const YELLOW_TINT = "#FCC44C22";

// Timeline order used for the stepper (indexes progress dot fill).
const STEPS = [
  { code: "searching",       label: "Finding driver" },
  { code: "driver_assigned", label: "Driver assigned" },
  { code: "arriving",        label: "Arriving" },
  { code: "picked_up",       label: "Picked up" },
  { code: "in_transit",      label: "In transit" },
  { code: "delivered",       label: "Delivered" },
];

const stepIndex = (status) => {
  const i = STEPS.findIndex((s) => s.code === status);
  return i === -1 ? 0 : i;
};

// Compute WebSocket URL from REACT_APP_BACKEND_URL — swap https→wss / http→ws
const wsUrl = (bookingId) => {
  const base = process.env.REACT_APP_BACKEND_URL || "";
  const wsBase = base.replace(/^http/i, "ws");
  return `${wsBase}/api/express/ws/bookings/${bookingId}`;
};

const DriverMarker = ({ vehicleCode }) => {
  const Icon = vehicleCode === "bike" || vehicleCode === "scooter" ? Bike : Truck;
  return (
    <div className="relative">
      <div className="absolute -inset-1.5 rounded-full animate-ping" style={{ backgroundColor: YELLOW, opacity: 0.35 }} />
      <div className="relative w-11 h-11 rounded-full flex items-center justify-center shadow-2xl border-2" style={{ backgroundColor: YELLOW, borderColor: "#0a0a0a" }}>
        <Icon size={18} color="#0a0a0a" strokeWidth={2.5} />
      </div>
    </div>
  );
};

const PinDot = ({ label }) => (
  <div className="flex flex-col items-center">
    <div className="w-6 h-6 rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: "#0a0a0a" }} />
    <div className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-black" style={{ backgroundColor: YELLOW }}>{label}</div>
  </div>
);

export const ExpressLiveTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const money = useMoney();
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // -- WebSocket lifecycle -----------------------------------------------
  useEffect(() => {
    if (!id) return;
    let stopped = false;
    let reconnectTimer;

    const open = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl(id));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) reconnectTimer = setTimeout(open, 3000);
      };
      ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "snapshot") {
            setState((prev) => ({ ...(prev || {}), ...msg }));
          } else if (msg.type === "location") {
            setState((prev) => prev ? { ...prev, driver_location: msg.driver_location, eta_seconds: msg.eta_seconds } : prev);
          }
        } catch { /* ignore malformed frames */ }
      };
    };
    open();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) { try { wsRef.current.close(); } catch (e) { /* ignore */ } }
    };
  }, [id]);

  const idx = stepIndex(state?.status);
  const delivered = state?.status === "delivered";

  // Map centering — prefer driver location, else midpoint of pickup+drop
  const mapCenter = useMemo(() => {
    if (state?.driver_location) return { lat: state.driver_location.lat, lng: state.driver_location.lng };
    if (state?.pickup && state?.drop) return {
      lat: (state.pickup.latitude + state.drop.latitude) / 2,
      lng: (state.pickup.longitude + state.drop.longitude) / 2,
    };
    if (state?.pickup) return { lat: state.pickup.latitude, lng: state.pickup.longitude };
    return { lat: 5.36, lng: -4.0083 };
  }, [state]);

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading live tracking…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-3 h-14 flex items-center gap-2">
          <button data-testid="exp-track-back" onClick={() => navigate("/express/bookings")} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-secondary motion-fast active:scale-95">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">EXPRESSbakēd · Live</div>
            <div className="text-sm font-bold">Tracking <span className="text-foreground/60">{state.ref}</span></div>
          </div>
          <div className="min-w-[64px] text-right">
            <span
              data-testid="exp-track-ws-status"
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ backgroundColor: connected ? "#77BC1F22" : "#FF4C5222", color: connected ? "#77BC1F" : "#FF4C52" }}
            >
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* Map hero */}
      <div className="relative h-72 md:h-80 border-b border-border" data-testid="exp-track-map">
        {apiKey ? (
          <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
            <Map
              style={{ width: "100%", height: "100%" }}
              center={mapCenter}
              defaultZoom={13}
              mapId="baked-express-track"
              gestureHandling="greedy"
              disableDefaultUI
            >
              {state.pickup && (
                <AdvancedMarker position={{ lat: state.pickup.latitude, lng: state.pickup.longitude }}>
                  <PinDot label="A" />
                </AdvancedMarker>
              )}
              {state.drop && (
                <AdvancedMarker position={{ lat: state.drop.latitude, lng: state.drop.longitude }}>
                  <PinDot label="B" />
                </AdvancedMarker>
              )}
              {state.driver_location && (
                <AdvancedMarker position={{ lat: state.driver_location.lat, lng: state.driver_location.lng }}>
                  <DriverMarker vehicleCode={state.vehicle_code} />
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Set REACT_APP_GOOGLE_MAPS_API_KEY to enable the live map.</div>
        )}
      </div>

      {/* Status + ETA card */}
      <div className="px-4 py-4 space-y-4">
        <div className="baked-card border border-border p-4" data-testid="exp-track-status-card">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: delivered ? "#77BC1F22" : YELLOW_TINT }}>
              {delivered ? <CheckCircle2 size={20} color="#77BC1F" /> : <Package size={20} color={YELLOW} />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold" data-testid="exp-track-status-label">
                {STEPS[idx]?.label || "Awaiting driver"}
              </div>
              <div className="text-[11px] text-muted-foreground" data-testid="exp-track-eta">
                {delivered ? "Delivery completed" :
                 state.eta_seconds != null ? `ETA ~ ${Math.max(0, Math.round(state.eta_seconds / 60))} min` :
                 "We're locking in your driver"}
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-4 flex items-center gap-1" data-testid="exp-track-stepper">
            {STEPS.map((s, i) => {
              const done = i < idx || delivered;
              const active = i === idx && !delivered;
              return (
                <React.Fragment key={s.code}>
                  <div
                    className={`h-1.5 flex-1 rounded-full transition-colors`}
                    style={{
                      backgroundColor: done ? YELLOW : active ? YELLOW : "hsl(var(--border))",
                      opacity: active ? 0.9 : 1,
                    }}
                    title={s.label}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Driver card */}
        {state.driver_snapshot ? (
          <div className="baked-card border border-border p-4 flex items-center gap-3" data-testid="exp-track-driver-card">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold" style={{ backgroundColor: YELLOW_TINT, color: YELLOW }}>
              {(state.driver_snapshot.name || "?").split(" ").map(x => x[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" data-testid="exp-track-driver-name">{state.driver_snapshot.name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="inline-flex items-center gap-1"><Star size={11} color="#FCC44C" /> {state.driver_snapshot.rating?.toFixed(1)}</span>
                <span>·</span>
                <span className="capitalize">{state.driver_snapshot.vehicle_type?.replace("_", " ")}</span>
                <span>·</span>
                <span>{state.driver_snapshot.vehicle_reg || "—"}</span>
              </div>
            </div>
            {state.driver_snapshot.phone && (
              <a data-testid="exp-track-driver-call" href={`tel:${state.driver_snapshot.phone}`} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: YELLOW }}>
                <Phone size={14} color="#0a0a0a" />
              </a>
            )}
          </div>
        ) : (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: YELLOW_TINT }}>
              <Bike size={18} color={YELLOW} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">Finding the nearest driver</div>
              <div className="text-[11px] text-muted-foreground">You&apos;ll see their details the moment they accept.</div>
            </div>
          </div>
        )}

        {/* Route summary */}
        <div className="baked-card border border-border p-4 space-y-2" data-testid="exp-track-route">
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: YELLOW }} className="mt-1" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pickup</div>
              <div className="text-xs font-semibold">{state.pickup?.formatted_address || state.pickup?.line1}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: YELLOW }} className="mt-1" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Drop-off</div>
              <div className="text-xs font-semibold">{state.drop?.formatted_address || state.drop?.line1}</div>
            </div>
          </div>
          <div className="border-t border-border my-2" />
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><div className="font-bold">{state.distance_km ?? "—"} km</div><div className="text-[10px] text-muted-foreground">Distance</div></div>
            <div><div className="font-bold">{state.duration_min ?? "—"} min</div><div className="text-[10px] text-muted-foreground">Trip est.</div></div>
            <div><div className="font-bold capitalize">{state.vehicle_code?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">Vehicle</div></div>
          </div>
          <div className="border-t border-border my-2" />
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">Total</div>
            <div className="text-sm font-bold">{money(state.total)}</div>
          </div>
          <div className="text-[10px] text-muted-foreground">Cash on Delivery · pay to the driver</div>
        </div>

        {delivered && (
          <button
            data-testid="exp-track-done"
            onClick={() => navigate("/express")}
            className="w-full rounded-2xl h-12 font-bold text-black"
            style={{ backgroundColor: YELLOW }}
          >
            Book another delivery
          </button>
        )}
      </div>
    </div>
  );
};

export default ExpressLiveTracking;
