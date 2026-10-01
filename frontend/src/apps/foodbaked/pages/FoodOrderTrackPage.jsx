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
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  Loader2, MapPin, Clock, Phone, ChevronLeft, Utensils,
  Receipt, CheckCircle2, Package, Bike, UserCheck, ChefHat,
} from "lucide-react";

const GREEN = "#00A651";
const API = process.env.REACT_APP_BACKEND_URL;

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

  // Initial fetch + poll every 5s while the order is in flight. We refetch
  // more aggressively than the SEND WS because the FOOD cart drawer doesn't
  // own a persistent socket — the SEND track page does, but inside its own
  // module.
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

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
