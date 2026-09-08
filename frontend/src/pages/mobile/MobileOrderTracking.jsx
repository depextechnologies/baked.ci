import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useApp } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { OrderTimeline } from "../../components/mobile/OrderTimeline";
import { TrackingMap } from "../../components/mobile/TrackingMap";
import { Button } from "../../components/ui/button";
import { ArrowLeft, HelpCircle, Phone, MessageSquare, Share2, Truck, Star, MapPin, ShoppingBag, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const MobileOrderTracking = () => {
  const { t: L } = useTranslation("customer");
  const { id } = useParams();
  const nav = useNavigate();
  const { country } = useApp();
  const [t, setT] = useState(null);
  const timerRef = useRef(null);
  const ccy = country?.currency_symbol || country?.currency;

  const load = async () => {
    try {
      const { data } = await api.get(`/orders/${id}/tracking`);
      setT(data);
      if (data.stage === "delivered") {
        // Auto-navigate to delivered when it completes
        setTimeout(() => nav(`/orders/${id}/delivered`, { replace: true }), 800);
      }
    } catch (e) { void e; }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 4000);  // poll every 4s for demo
    return () => timerRef.current && clearInterval(timerRef.current);
    // eslint-disable-next-line
  }, [id]);

  if (!t) return <div className="p-8 text-sm text-muted-foreground">Loading tracking…</div>;

  const order = t.order;
  const etaMin = t.eta_seconds != null ? Math.max(0, Math.round(t.eta_seconds / 60)) : null;
  const stageLabel = ({ placed: "Order placed", preparing: "Preparing your order", picked_up: "Picked up from store", on_the_way: "On the way", delivered: "Delivered!" })[t.stage] || t.stage;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "MARTbakēd delivery", text: `Track my order ${order.number}`, url: window.location.href }); } catch { /* ignore */ }
    } else {
      navigator.clipboard?.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  return (
    <div className="pb-32">
      {/* Sub header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-ot-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0 text-base font-bold">{L("orders.track_order")}</div>
        <button data-testid="m-ot-share" onClick={share} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Share status"><Share2 size={16} /></button>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Support"><HelpCircle size={16} /></button>
      </div>

      {/* Status hero */}
      <div className="px-4">
        <div className="baked-card overflow-hidden border p-4" style={{
          borderColor: "#77BC1F55",
          background: "linear-gradient(135deg, #77BC1F22 0%, hsl(var(--card)) 60%)",
        }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "#77BC1F" }}>Status</div>
          <div className="text-xl font-bold mt-0.5">{stageLabel}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {etaMin != null ? <>Arriving in <b style={{ color: "#77BC1F" }}>{etaMin} min</b></> : "Delivered"}
            {" · "}Order <span className="font-mono">{order.number}</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="px-4 mt-4">
        {t.geo ? <TrackingMap store={t.geo.store} destination={t.geo.destination} driver={t.geo.driver} height={260} /> : null}
      </div>

      {/* Driver card */}
      {t.driver && (
        <div className="px-4 mt-4">
          <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
            <img src={t.driver.photo} alt={t.driver.name} className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: "#77BC1F" }} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your delivery partner</div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold truncate">{t.driver.name}</span>
                <span className="baked-chip px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-0.5" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
                  <Star size={9} fill="#FCC44C" strokeWidth={0} /> {t.driver.rating}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">{t.driver.vehicle} · <span className="font-mono">{t.driver.vehicle_reg}</span></div>
            </div>
            <a href={`tel:${t.driver.phone}`} data-testid="m-ot-call" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }} aria-label="Call driver"><Phone size={16} /></a>
            <button data-testid="m-ot-chat" className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary" aria-label="Chat driver"><MessageSquare size={16} /></button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-3">Order progress</div>
        <div className="baked-card bg-card border border-border p-4">
          <OrderTimeline timeline={t.timeline} stage={t.stage} />
        </div>
      </section>

      {/* Delivery + summary */}
      <section className="px-4 mt-5">
        <div className="baked-card bg-card border border-border divide-y divide-border">
          <Detail icon={MapPin} label="Delivering to" value={`${order.address?.line1 || ""} · ${order.address?.city || ""}`} />
          <Detail icon={ShoppingBag} label={`${order.items?.length || 0} items`} value={formatMoney(order.total, order.currency, ccy)} onClick={() => nav(`/orders/${order.id}`)} />
        </div>
      </section>

      <div className="px-4 mt-4 text-[11px] text-muted-foreground text-center">
        Need help? <span style={{ color: "#77BC1F" }} className="font-semibold">Contact support</span>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button data-testid="m-ot-orders" onClick={() => nav("/orders")} variant="outline" className="baked-btn h-12 font-semibold">All orders</Button>
          <Button data-testid="m-ot-shop" onClick={() => nav("/")} className="baked-btn h-12 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            <Truck size={16} className="mr-1.5" /> Continue shopping
          </Button>
        </div>
      </div>
    </div>
  );
};

const Detail = ({ icon: Icon, label, value, onClick }) => (
  <button onClick={onClick} disabled={!onClick} className="w-full px-4 py-3 flex items-start gap-3 text-left disabled:cursor-default">
    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={14} /></div>
    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-xs font-semibold mt-0.5">{value}</div></div>
    {onClick && <ChevronRight size={14} className="text-muted-foreground mt-1" />}
  </button>
);
