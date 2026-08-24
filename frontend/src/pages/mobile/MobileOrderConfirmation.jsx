import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { OrderTimeline } from "../../components/mobile/OrderTimeline";
import { Button } from "../../components/ui/button";
import { ArrowLeft, HelpCircle, CheckCircle2, ChevronRight, ShoppingBag, Truck, MapPin, ChevronDown, ChevronUp, Star, Sparkles } from "lucide-react";
import confetti from "../../lib/confetti";

export const MobileOrderConfirmation = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { country } = useApp();
  const [tracking, setTracking] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const ccy = country?.currency_symbol || country?.currency;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/orders/${id}/tracking`);
        setTracking(data);
        confetti(0.4); // celebrate
      } catch (e) { void e; }
    })();
  }, [id]);

  if (!tracking) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const order = tracking.order;

  return (
    <div className="pb-32">
      {/* Sub-header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-oc-back" onClick={() => nav("/")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0 text-base font-bold">Order Confirmation</div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Support"><HelpCircle size={16} /></button>
      </div>

      {/* Success hero */}
      <div className="px-4">
        <div className="baked-card relative overflow-hidden p-6 text-center border" style={{
          borderColor: "#77BC1F55",
          background: "linear-gradient(180deg, #77BC1F22 0%, hsl(var(--card)) 60%)",
        }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, #77BC1F44 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>
              <CheckCircle2 size={32} strokeWidth={2.5} />
            </div>
            <div className="text-2xl font-bold mt-3">Order Confirmed!</div>
            <div className="text-xs text-muted-foreground mt-1">Thank you for shopping with MARTbakēd.</div>
            <div className="text-[11px] font-mono mt-3 baked-chip inline-block px-3 py-1 bg-secondary">Order ID · <b>{order.number}</b></div>
          </div>
        </div>
      </div>

      {/* Estimated delivery */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Truck size={20} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Estimated delivery</div>
            <div className="text-xl font-bold leading-none mt-0.5">{country?.delivery_eta_min}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">We&apos;re getting your order ready.</div>
          </div>
        </div>
      </div>

      {/* baked Points earned */}
      {(order.points_earned > 0 || order.points_redeemed > 0) && (
        <div className="px-4 mt-4">
          <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#FCC44C55", background: "linear-gradient(135deg, #FCC44C14 0%, hsl(var(--card)) 65%)" }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}><Star size={18} fill="#0a1200" strokeWidth={2.5} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">BAKĒD Rewards</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {order.points_earned > 0 && <>You earned <b style={{ color: "#FCC44C" }}>+{order.points_earned} pts</b></>}
                  {order.points_redeemed > 0 && <>{order.points_earned > 0 ? " · " : ""}Redeemed <b style={{ color: "#77BC1F" }}>{order.points_redeemed} pts</b></>}
                </div>
              </div>
              <button data-testid="m-oc-view-rewards" onClick={() => nav("/profile/rewards")} className="text-xs font-bold px-3 h-9 rounded-lg" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}>View</button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-3">Order status</div>
        <div className="baked-card bg-card border border-border p-4">
          <OrderTimeline timeline={tracking.timeline} stage={tracking.stage} />
        </div>
      </section>

      {/* Order summary */}
      <section className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold flex items-center gap-1.5"><ShoppingBag size={14} /> Order summary <span className="text-xs text-muted-foreground font-normal">· {order.items?.length} items</span></div>
          <button onClick={() => setExpanded((x) => !x)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#77BC1F" }}>
            {expanded ? "Hide" : "View items"} {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        <div className="baked-card bg-card border border-border p-4">
          {expanded && (
            <div className="mb-3 space-y-2 border-b border-border pb-3">
              {order.items?.map((it, i) => (
                <div key={i} className="flex items-center gap-3">
                  {it.image && <img src={it.image} alt={it.name} className="w-10 h-10 rounded-lg object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground">Qty {it.quantity} · {it.unit || "1 pc"}</div>
                  </div>
                  <div className="text-xs font-bold">{formatMoney(it.line_total, order.currency, ccy)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 text-xs">
            <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency, ccy)} />
            <Row label="Delivery fee" value={order.delivery_fee === 0 ? <span style={{ color: "#77BC1F" }}>FREE</span> : formatMoney(order.delivery_fee, order.currency, ccy)} />
            {order.points_discount > 0 && <Row label={`Points discount (${order.points_redeemed} pts)`} value={<span style={{ color: "#77BC1F" }}>− {formatMoney(order.points_discount, order.currency, ccy)}</span>} />}
            <div className="h-px bg-border my-2" />
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total paid</span>
              <span data-testid="m-oc-total">{formatMoney(order.total, order.currency, ccy)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Delivery details */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">Delivery details</div>
        <div className="baked-card bg-card border border-border divide-y divide-border">
          <Detail icon={MapPin} label="Delivering to" value={`${order.address?.line1 || ""} · ${order.address?.city || ""}`} />
          <Detail icon={Truck} label="Slot" value={order.delivery_slot_label} />
          <Detail icon={ShoppingBag} label="Payment" value={order.payment_method === "cod" ? "Cash on Delivery" : order.payment_method} />
        </div>
      </section>

      {/* Sticky footer actions */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button data-testid="m-oc-continue" onClick={() => nav("/")} variant="outline" className="baked-btn h-12 font-semibold">Continue Shopping</Button>
          <Button data-testid="m-oc-track" onClick={() => nav(`/orders/${order.id}/track`)} className="baked-btn h-12 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            <Truck size={16} className="mr-1.5" /> Track Order
          </Button>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);
const Detail = ({ icon: Icon, label, value }) => (
  <div className="px-4 py-3 flex items-start gap-3">
    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={14} /></div>
    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-xs font-semibold mt-0.5">{value}</div></div>
    <ChevronRight size={14} className="text-muted-foreground mt-1" />
  </div>
);
