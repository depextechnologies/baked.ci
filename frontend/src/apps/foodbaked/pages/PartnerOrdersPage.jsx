/**
 * PartnerOrdersPage — /partner/food/orders
 * 6 tabs with live badges, driven by the realtime bus and partnerApi.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, Clock, Package, Truck, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { partnerApi, useFoodPartner } from "../../../contexts/FoodPartnerContext";
import { useRestaurantNotifications } from "../components/RestaurantNotificationEngine";

const GREEN = "#00A651";

const TABS = [
  { k: "new",        fr: "Nouvelles",     en: "New",        icon: Clock },
  { k: "accepted",   fr: "Acceptées",     en: "Accepted",   icon: PlayCircle },
  { k: "preparing",  fr: "En préparation", en: "Preparing", icon: Package },
  { k: "ready",      fr: "Prêtes",        en: "Ready",      icon: Truck },
  { k: "completed",  fr: "Terminées",     en: "Completed",  icon: CheckCircle2 },
  { k: "cancelled",  fr: "Annulées",      en: "Cancelled",  icon: XCircle },
];

const nextActionFor = (status) => {
  if (status === "placed")    return { label_fr: "Accepter",       label_en: "Accept",       action: "accept" };
  if (status === "accepted")  return { label_fr: "Démarrer",       label_en: "Start preparing", action: "preparing" };
  if (status === "preparing") return { label_fr: "Marquer prêt",   label_en: "Mark ready",   action: "ready" };
  return null;
};

export const PartnerOrdersPage = () => {
  const { restaurant } = useFoodPartner() || {};
  const { updatesVersion } = useRestaurantNotifications() || {};
  const [tab, setTab] = useState("new");
  const [data, setData] = useState({ orders: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  const isFr = (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true); setErr("");
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurant.id}/orders?status=${tab}`);
      setData(data);
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  }, [restaurant?.id, tab]);

  useEffect(() => { load(); }, [load, updatesVersion]);

  const act = async (oid, action, reason) => {
    setBusyId(oid);
    try {
      await partnerApi.patch(`/food/manage/${restaurant.id}/orders/${oid}`, { action, reason });
      await load();
    } catch (e) { setErr(e.response?.data?.detail || e.message); }
    finally { setBusyId(null); }
  };

  if (!restaurant) return null;

  return (
    <div className="space-y-5" data-testid="partner-orders-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{isFr ? "Commandes" : "Orders"}</h1>
          <p className="text-sm text-muted-foreground">{isFr ? "Suivez et traitez vos commandes en temps réel." : "Track and handle your incoming orders in real time."}</p>
        </div>
        <button onClick={load} className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-secondary text-xs inline-flex items-center gap-2" data-testid="partner-orders-refresh">
          <RefreshCw size={12} /> {isFr ? "Rafraîchir" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1" translate="no" data-testid="partner-orders-tabs">
        {TABS.map((tt) => {
          const on = tab === tt.k;
          const n = data.counts?.[tt.k] || 0;
          return (
            <button key={tt.k} onClick={() => setTab(tt.k)}
                    className={`px-3 h-9 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${on ? "text-black" : "text-muted-foreground hover:text-foreground"}`}
                    style={on ? { backgroundColor: GREEN } : undefined}
                    data-testid={`partner-orders-tab-${tt.k}`}>
              <tt.icon size={11} /> {isFr ? tt.fr : tt.en} {n > 0 && <span className="ml-1">({n})</span>}
            </button>
          );
        })}
      </div>

      {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> …</div>
      ) : data.orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground" data-testid="partner-orders-empty">
          {isFr ? "Aucune commande ici pour l'instant." : "No orders here yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {data.orders.map((o) => (
            <OrderCard key={o.id} o={o} isFr={isFr} busy={busyId === o.id}
                       restaurantId={restaurant.id}
                       onAct={(a, reason) => act(o.id, a, reason)} />
          ))}
        </div>
      )}
    </div>
  );
};

const OrderCard = ({ o, isFr, busy, onAct, restaurantId }) => {
  const next = nextActionFor(o.status);
  const typeLabel = o.order_type === "pickup" ? (isFr ? "À emporter" : "Pickup") : (isFr ? "Livraison" : "Delivery");
  // Show the Live Driver sub-card from the moment the kitchen starts cooking
  // (that's when dispatch_bridge fires) until the order is delivered.
  const showDriver = (
    o.order_type !== "pickup"
    && ["preparing", "ready", "out_for_delivery", "delivered"].includes(o.status)
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3" data-testid={`partner-order-row-${o.id}`}>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-sm font-semibold">{o.order_number}</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{typeLabel}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-black" style={{ backgroundColor: `${GREEN}33`, color: GREEN }}>{o.status}</span>
            <span className="text-[11px] text-muted-foreground">{o.items_count} {isFr ? "article(s)" : "item(s)"}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {new Date(o.placed_at).toLocaleString(isFr ? "fr-FR" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="text-lg font-bold" style={{ color: GREEN }}>
          {Number(o.grand_total || 0).toLocaleString(isFr ? "fr-FR" : "en-US")} {o.currency}
        </div>
        {o.status === "placed" && (
          <button onClick={() => onAct("reject", "Rejeté par le restaurant")}
                  disabled={busy} data-testid={`partner-order-reject-${o.id}`}
                  className="h-9 px-3 rounded-lg text-xs font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 inline-flex items-center gap-1">
            <XCircle size={12} /> {isFr ? "Refuser" : "Reject"}
          </button>
        )}
        {next && (
          <button onClick={() => onAct(next.action)} disabled={busy}
                  data-testid={`partner-order-next-${o.id}`}
                  className="h-9 px-4 rounded-lg text-xs font-semibold text-black disabled:opacity-50 inline-flex items-center gap-1"
                  style={{ backgroundColor: GREEN }}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} {isFr ? next.label_fr : next.label_en}
          </button>
        )}
      </div>
      {showDriver && (
        <LiveDriverCard orderId={o.id} restaurantId={restaurantId} isFr={isFr} />
      )}
    </div>
  );
};

export default PartnerOrdersPage;

// ---------------------------------------------------------------------------
// Pass 2 — Live Driver sub-card
// ---------------------------------------------------------------------------

const DRIVER_STATUS_LABEL_FR = {
  searching_driver:        "Recherche d'un livreur",
  offering_driver:         "Livreur en cours de notification",
  driver_assigned:         "Livreur attribué",
  driver_en_route_pickup:  "Livreur en route vers le restaurant",
  arrived_at_pickup:       "Livreur arrivé — remettez la commande",
  picked_up:               "Commande récupérée",
  en_route_customer:       "En route vers le client",
  delivered:               "Livré",
  cancelled:               "Annulé",
};
const DRIVER_STATUS_LABEL_EN = {
  searching_driver:        "Looking for a driver",
  offering_driver:         "Notifying a driver",
  driver_assigned:         "Driver assigned",
  driver_en_route_pickup:  "Driver heading to the restaurant",
  arrived_at_pickup:       "Driver arrived — hand over the order",
  picked_up:               "Picked up",
  en_route_customer:       "On the way to the customer",
  delivered:               "Delivered",
  cancelled:               "Cancelled",
};

export const LiveDriverCard = ({ orderId, restaurantId, isFr, onPickupConfirmed }) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin]         = useState("");
  const [confirming, setConfirming] = useState(false);
  const [err, setErr]         = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await partnerApi.get(`/food/manage/${restaurantId}/orders/${orderId}/delivery`);
      setData(data);
    } catch (e) { /* swallow */ }
    finally { setLoading(false); }
  }, [orderId, restaurantId]);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  const confirmPickup = async () => {
    setConfirming(true); setErr("");
    try {
      await partnerApi.post(`/food/manage/${restaurantId}/orders/${orderId}/confirm-pickup`, { pin });
      setPin("");
      await load();
      onPickupConfirmed?.();
    } catch (e) {
      setErr(e.response?.data?.detail || e.message);
    } finally { setConfirming(false); }
  };

  if (loading) return null;
  if (!data || !data.booking_id) return null;   // Pickup orders / dispatch didn't start
  const status = data.status;
  const label  = (isFr ? DRIVER_STATUS_LABEL_FR : DRIVER_STATUS_LABEL_EN)[status] || status;
  const d = data.driver;

  return (
    <div className="w-full mt-3 pt-3 border-t border-border/60" data-testid={`partner-order-driver-${orderId}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {isFr ? "Livreur" : "Driver"}
        </div>
        <div className="text-sm font-semibold">{label}</div>
      </div>

      {d ? (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          {d.photo_url ? (
            <img src={d.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold">
              {(d.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" data-testid={`partner-order-driver-name-${orderId}`}>{d.name || "—"}</div>
            <div className="text-[11px] text-muted-foreground">
              {d.vehicle || ""} {d.plate ? `· ${d.plate}` : ""} {d.rating ? `· ${Number(d.rating).toFixed(1)}★` : ""}
            </div>
          </div>
          {d.phone && (
            <a href={`tel:${d.phone}`} className="h-8 px-3 rounded-lg bg-secondary hover:bg-secondary/70 text-[11px] font-semibold inline-flex items-center">
              {isFr ? "Appeler" : "Call"}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {isFr ? "Nous notifions les livreurs disponibles…" : "Notifying available drivers…"}
        </div>
      )}

      {data.pickup_pin && (status === "driver_assigned" || status === "driver_en_route_pickup" || status === "arrived_at_pickup") && (
        <div className="mt-3 rounded-xl bg-primary/5 border border-primary/20 p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {isFr ? "Code de remise au livreur" : "Pickup code"}
          </div>
          <div className="text-3xl font-bold tracking-widest font-mono" style={{ color: GREEN }} data-testid={`partner-order-pickup-pin-${orderId}`}>
            {data.pickup_pin}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {isFr
              ? "Lisez ce code au livreur à l'arrivée, puis saisissez-le ci-dessous pour confirmer la remise."
              : "Read this code to the driver on arrival, then enter it below to confirm handover."}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                   placeholder="----" maxLength={4}
                   className="h-10 w-28 rounded-lg border border-border bg-secondary/40 px-3 text-center font-mono text-lg tracking-widest"
                   data-testid={`partner-order-pickup-input-${orderId}`} />
            <button onClick={confirmPickup} disabled={pin.length !== 4 || confirming}
                    data-testid={`partner-order-pickup-confirm-${orderId}`}
                    className="h-10 px-4 rounded-lg text-black text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: GREEN }}>
              {confirming && <Loader2 size={12} className="animate-spin" />}
              {isFr ? "Confirmer la remise" : "Confirm handover"}
            </button>
          </div>
          {err && <div className="text-xs text-red-500 mt-1" data-testid={`partner-order-pickup-err-${orderId}`}>{err}</div>}
        </div>
      )}
    </div>
  );
};
