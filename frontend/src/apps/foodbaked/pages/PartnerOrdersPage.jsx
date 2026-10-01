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
                       onAct={(a, reason) => act(o.id, a, reason)} />
          ))}
        </div>
      )}
    </div>
  );
};

const OrderCard = ({ o, isFr, busy, onAct }) => {
  const next = nextActionFor(o.status);
  const typeLabel = o.order_type === "pickup" ? (isFr ? "À emporter" : "Pickup") : (isFr ? "Livraison" : "Delivery");
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4 flex-wrap" data-testid={`partner-order-row-${o.id}`}>
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
  );
};

export default PartnerOrdersPage;
