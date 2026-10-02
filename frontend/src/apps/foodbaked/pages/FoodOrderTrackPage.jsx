/**
 * FoodOrderTrackPage — /foodbaked/orders/:orderId/track
 *
 * FOOD-themed live tracking: polls the aggregated endpoint
 *   GET /api/food/customer/orders/{id}/track
 * which returns { order, delivery } where `delivery` mirrors the SEND
 * express_booking lifecycle (searching → offering → driver_assigned →
 * arriving → picked_up → in_transit → delivered). The map, driver chip
 * and ETA logic are visually FOOD but power themselves from the same
 * substrate the SEND tracker uses — no second delivery engine.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import {
  Loader2, MapPin, Clock, Phone, ChevronLeft, Utensils,
  Receipt, CheckCircle2, Package, Bike, UserCheck, ChefHat, Store,
} from "lucide-react";

const GREEN = "#00A651";
const API = process.env.REACT_APP_BACKEND_URL;
const GMAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

// Reuse the SEND WS: food_delivery is just another express_booking row, so
// `/api/express/ws/bookings/{booking_id}` already pushes snapshot + live
// `driver_location` frames exactly as the SEND tracker expects.
const wsUrl = (bookingId) => {
  const base = API || "";
  return `${base.replace(/^http/i, "ws")}/api/express/ws/bookings/${bookingId}`;
};

// FOOD-coloured markers (same visual language as SEND but swap yellow → green)
const DriverMapMarker = () => (
  <div className="relative">
    <div className="absolute -inset-1.5 rounded-full animate-ping" style={{ backgroundColor: GREEN, opacity: 0.35 }} />
    <div className="relative w-10 h-10 rounded-full flex items-center justify-center shadow-2xl border-2"
         style={{ backgroundColor: GREEN, borderColor: "#0a0a0a" }} data-testid="food-track-driver-pin">
      <Bike size={16} color="#0a0a0a" strokeWidth={2.5} />
    </div>
  </div>
);
const PickupMarker = () => (
  <div className="flex flex-col items-center" data-testid="food-track-pickup-pin">
    <div className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center"
         style={{ backgroundColor: "#0a0a0a", color: GREEN }}>
      <Store size={14} />
    </div>
  </div>
);
const DropMarker = () => (
  <div className="flex flex-col items-center" data-testid="food-track-drop-pin">
    <div className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center bg-white"
         style={{ color: "#0a0a0a" }}>
      <MapPin size={14} />
    </div>
  </div>
);

const authHeaders = () => {
  const t = typeof window !== "undefined" ? localStorage.getItem("baked_access_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const hasToken = () =>
  typeof window !== "undefined" && !!localStorage.getItem("baked_access_token");

const isFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

// Order-level status pipeline (FOOD facing)
const FOOD_STAGES_FR = [
  { key: "placed",            label: "Commande passée",                icon: Receipt },
  { key: "accepted",          label: "Acceptée par le restaurant",     icon: UserCheck },
  { key: "preparing",         label: "En préparation",                 icon: ChefHat },
  { key: "ready",             label: "Prête pour le livreur",          icon: Package },
  { key: "out_for_delivery",  label: "En livraison",                   icon: Bike },
  { key: "delivered",         label: "Livrée",                         icon: CheckCircle2 },
];
const FOOD_STAGES_EN = [
  { key: "placed",            label: "Order placed",                   icon: Receipt },
  { key: "accepted",          label: "Restaurant accepted",            icon: UserCheck },
  { key: "preparing",         label: "Preparing",                      icon: ChefHat },
  { key: "ready",             label: "Ready for pickup",               icon: Package },
  { key: "out_for_delivery",  label: "On the way",                     icon: Bike },
  { key: "delivered",         label: "Delivered",                      icon: CheckCircle2 },
];

const DRIVER_STATUS_FR = {
  searching_driver:       "Recherche d'un livreur…",
  offering_driver:        "Un livreur est en train de répondre",
  driver_assigned:        "Livreur attribué — il part vers le restaurant",
  driver_en_route_pickup: "Livreur en route vers le restaurant",
  picked_up:              "Votre commande vient d'être récupérée",
  en_route_customer:      "Votre livreur est en route",
  delivered:              "Commande livrée",
};
const DRIVER_STATUS_EN = {
  searching_driver:       "Looking for a driver…",
  offering_driver:        "A driver is responding",
  driver_assigned:        "Driver on the way to the restaurant",
  driver_en_route_pickup: "Driver heading to the restaurant",
  picked_up:              "Driver has picked up your order",
  en_route_customer:      "Your driver is on the way",
  delivered:              "Order delivered",
};


const FoodOrderTrackPage = () => {
  const { orderId } = useParams();
  const nav = useNavigate();
  const fr = isFr();
  const stages = fr ? FOOD_STAGES_FR : FOOD_STAGES_EN;

  const [data, setData]   = useState(null);
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(true);
  const [liveLoc, setLiveLoc] = useState(null); // real-time driver_location from WS
  const wsRef = useRef(null);

  const load = useCallback(async () => {
    if (!hasToken()) { setLoading(false); return; }
    try {
      const { data } = await axios.get(`${API}/api/food/customer/orders/${orderId}/track`,
                                        { headers: authHeaders() });
      setData(data);
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  }, [orderId]);

  // Initial fetch + poll every 5s. The WS below drives the map pin; this
  // GET keeps order status chips and driver chip fresh if the socket drops.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // --- Live driver_location via the SEND booking WS -------------------
  // Opens once we know the delivery booking id. Reconnects automatically if
  // the socket drops. Mirrors the SEND tracker lifecycle so a single bug
  // fix in SEND benefits FOOD too.
  const bookingId = data?.delivery?.booking_id;
  useEffect(() => {
    if (!bookingId) return;
    let stopped = false;
    let reconnectTimer;
    const open = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl(bookingId));
      wsRef.current = ws;
      ws.onclose = () => { if (!stopped) reconnectTimer = setTimeout(open, 3000); };
      ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "snapshot" && msg.driver_location) {
            setLiveLoc({ lat: msg.driver_location.lat, lng: msg.driver_location.lng });
          } else if (msg.type === "location") {
            setLiveLoc({ lat: msg.driver_location.lat, lng: msg.driver_location.lng });
          }
        } catch { /* ignore malformed */ }
      };
    };
    open();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) { try { wsRef.current.close(); } catch (e) { /* ignore */ } }
    };
  }, [bookingId]);

  if (!hasToken()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">
          {fr ? "Veuillez vous connecter pour suivre votre commande." : "Please sign in to track your order."}
        </div>
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={14} /> {fr ? "Chargement…" : "Loading…"}
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-red-500" data-testid="food-track-error">{err || (fr ? "Introuvable" : "Not found")}</div>
      </div>
    );
  }

  const { order, delivery } = data;
  const activeIdx = Math.max(0, stages.findIndex((s) => s.key === order.status));
  const driverStatus = delivery?.status;
  const driverLabel  = driverStatus ? ((fr ? DRIVER_STATUS_FR : DRIVER_STATUS_EN)[driverStatus] || driverStatus) : null;

  // Live-map geometry: pickup = restaurant, drop = customer address, driver
  // = live WS position (preferred) else last snapshot's driver_location.
  const pickup = delivery?.pickup?.lat != null ? delivery.pickup : null;
  const drop   = delivery?.drop?.lat   != null ? delivery.drop   : null;
  const driverLoc = liveLoc || (delivery?.driver_location?.lat != null ? delivery.driver_location : null);
  const driverAssigned = !!delivery?.driver;
  const showMap = GMAPS_KEY && pickup && drop && (driverAssigned || driverLoc);
  const mapCenter = driverLoc
    ? { lat: Number(driverLoc.lat), lng: Number(driverLoc.lng) }
    : (pickup && drop
        ? { lat: (Number(pickup.lat) + Number(drop.lat)) / 2,
            lng: (Number(pickup.lng) + Number(drop.lng)) / 2 }
        : null);

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="food-track-page">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => nav(-1)} className="h-9 w-9 rounded-full bg-secondary hover:bg-secondary/70 flex items-center justify-center" data-testid="food-track-back">
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {fr ? "Suivi de commande" : "Order tracking"}
          </div>
          <div className="font-mono text-sm font-bold truncate" data-testid="food-track-order-number">
            {order.order_number}
          </div>
        </div>
        <div className="ml-auto text-xs font-semibold text-right">
          <div className="text-muted-foreground">{order.restaurant?.name}</div>
          <div className="text-base" style={{ color: GREEN }}>
            {Number(order.grand_total || 0).toLocaleString(fr ? "fr-FR" : "en-US")} {order.currency}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-5">
        {showMap && (
          <section className="rounded-2xl overflow-hidden border border-border bg-card" data-testid="food-track-map">
            <div className="h-56 w-full relative">
              <APIProvider apiKey={GMAPS_KEY}>
                <Map
                  defaultCenter={mapCenter}
                  center={mapCenter}
                  defaultZoom={14}
                  mapId="food-track-map"
                  gestureHandling="greedy"
                  disableDefaultUI
                  styles={[{ featureType: "poi", stylers: [{ visibility: "off" }] }]}
                >
                  {pickup && (
                    <AdvancedMarker position={{ lat: Number(pickup.lat), lng: Number(pickup.lng) }}>
                      <PickupMarker />
                    </AdvancedMarker>
                  )}
                  {drop && (
                    <AdvancedMarker position={{ lat: Number(drop.lat), lng: Number(drop.lng) }}>
                      <DropMarker />
                    </AdvancedMarker>
                  )}
                  {driverLoc && (
                    <AdvancedMarker position={{ lat: Number(driverLoc.lat), lng: Number(driverLoc.lng) }}>
                      <DriverMapMarker />
                    </AdvancedMarker>
                  )}
                </Map>
              </APIProvider>
            </div>
            <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GREEN }} /> {fr ? "Livreur" : "Driver"}
              </span>
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-black" /> {fr ? "Restaurant" : "Restaurant"}
              </span>
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white border border-black" /> {fr ? "Vous" : "You"}
              </span>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="food-track-stages">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Utensils size={14} /> {fr ? "Progression" : "Progress"}
          </div>
          <ol className="space-y-2">
            {stages.map((s, i) => {
              const active = i <= activeIdx;
              const current = i === activeIdx;
              return (
                <li key={s.key} className="flex items-center gap-3" data-testid={`food-track-stage-${s.key}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${active ? "text-black" : "bg-secondary text-muted-foreground"}`}
                       style={active ? { backgroundColor: GREEN } : undefined}>
                    <s.icon size={14} />
                  </div>
                  <div className={`text-sm ${current ? "font-bold" : active ? "font-semibold" : "text-muted-foreground"}`}>
                    {s.label}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {delivery && delivery.booking_id && (
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="food-track-driver">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Bike size={14} /> {fr ? "Votre livreur" : "Your driver"}
            </div>
            {delivery.driver ? (
              <div className="flex items-center gap-3">
                {delivery.driver.photo_url ? (
                  <img src={delivery.driver.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-base font-semibold">
                    {(delivery.driver.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" data-testid="food-track-driver-name">{delivery.driver.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {delivery.driver.vehicle} {delivery.driver.plate ? `· ${delivery.driver.plate}` : ""} {delivery.driver.rating ? `· ${Number(delivery.driver.rating).toFixed(1)}★` : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {fr ? "Nous cherchons un livreur à proximité." : "We're looking for a nearby driver."}
              </div>
            )}
            {driverLabel && (
              <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 text-xs" data-testid="food-track-driver-status">
                {driverLabel}
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm" data-testid="food-track-summary">
          <div className="font-semibold flex items-center gap-2"><Receipt size={14} /> {fr ? "Résumé" : "Summary"}</div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            <span>{order.delivery_address?.line1 || order.delivery_address?.formatted_address || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock size={12} /> {new Date(order.placed_at).toLocaleString(fr ? "fr-FR" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
          {order.customer_snapshot?.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone size={12} /> {order.customer_snapshot.phone}
            </div>
          )}
          <ul className="pt-2 space-y-1">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between text-xs">
                <span>{it.quantity}× {it.name}</span>
                <span className="font-mono">{Number(it.line_total).toLocaleString(fr ? "fr-FR" : "en-US")}</span>
              </li>
            ))}
          </ul>
        </section>

        {order.status === "delivered" && (
          <Link to={`/profile/activities`}
                data-testid="food-track-review-cta"
                className="block w-full h-11 rounded-xl text-center text-black text-sm font-semibold inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: GREEN }}>
            <CheckCircle2 size={14} /> {fr ? "Laisser un avis" : "Leave a review"}
          </Link>
        )}
      </main>
    </div>
  );
};

export default FoodOrderTrackPage;
