import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { ArrowLeft, HelpCircle, Star, ShieldCheck, MapPin, Truck, RotateCcw, ShoppingBag, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export const MobileOrderDelivered = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const { country } = useApp();
  const [t, setT] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const ccy = country?.currency_symbol || country?.currency;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/orders/${id}/tracking`);
        setT(data);
        if (data.order?.rating) { setRating(data.order.rating); setSubmitted(true); }
      } catch (e) { void e; }
    })();
  }, [id]);

  const submitRating = async (r) => {
    setRating(r);
    try {
      await api.post(`/orders/${id}/rate`, { rating: r, comment });
      setSubmitted(true);
      toast.success("Thanks for the feedback!");
    } catch { toast.error("Could not submit rating"); }
  };

  if (!t) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const order = t.order;
  const deliveredAt = t.timeline.find((s) => s.code === "delivered")?.at;
  const placedAt = t.timeline.find((s) => s.code === "placed")?.at;
  const durationMin = deliveredAt && placedAt ? Math.max(1, Math.round((new Date(deliveredAt) - new Date(placedAt)) / 60000)) : null;

  return (
    <div className="pb-32">
      {/* Sub header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-od-back" onClick={() => nav("/")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0 text-base font-bold">Order Delivered</div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Support"><HelpCircle size={16} /></button>
      </div>

      {/* Success hero */}
      <div className="px-4">
        <div className="baked-card overflow-hidden p-6 text-center border" style={{
          borderColor: "#77BC1F55",
          background: "linear-gradient(180deg, #77BC1F22 0%, hsl(var(--card)) 60%)",
        }}>
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>
            <PackageCheck size={30} strokeWidth={2.5} />
          </div>
          <div className="text-2xl font-bold mt-3">Order Delivered!</div>
          <div className="text-xs text-muted-foreground mt-1">Hope you enjoyed your shopping. Thank you for choosing MARTbakēd.</div>
          <div className="text-[11px] font-mono mt-3 baked-chip inline-block px-3 py-1 bg-secondary">Order · <b>{order.number}</b></div>
        </div>
      </div>

      {/* Rating card */}
      <div className="px-4 mt-5">
        <div className="baked-card bg-card border border-border p-5 text-center">
          <div className="text-sm font-bold">How was your delivery?</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{submitted ? "Thanks for helping us serve you better." : "Tap a star to rate"}</div>
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                data-testid={`m-od-star-${n}`}
                onClick={() => !submitted && submitRating(n)}
                disabled={submitted}
                className="motion-fast active:scale-90"
                aria-label={`Rate ${n} stars`}
              >
                <Star size={30} strokeWidth={1.5} fill={n <= rating ? "#FCC44C" : "transparent"} color={n <= rating ? "#FCC44C" : "hsl(var(--muted-foreground))"} />
              </button>
            ))}
          </div>
          {!submitted && (
            <>
              <textarea data-testid="m-od-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Tell us more (optional)" className="mt-4 w-full baked-input bg-secondary px-3 py-2 text-xs" />
              {rating > 0 && (
                <Button data-testid="m-od-submit" onClick={() => submitRating(rating)} className="baked-btn h-10 mt-3 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>Submit rating</Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Freshness guarantee */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><ShieldCheck size={18} /></div>
          <div>
            <div className="text-sm font-bold">Freshness guaranteed</div>
            <div className="text-[11px] text-muted-foreground">If any item isn&apos;t fresh, contact support within 24 hours for an instant refund.</div>
          </div>
        </div>
      </div>

      {/* Delivery summary */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">Delivery summary</div>
        <div className="baked-card bg-card border border-border divide-y divide-border">
          {t.driver && (
            <div className="px-4 py-3 flex items-center gap-3">
              <img src={t.driver.photo} alt={t.driver.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Delivered by</div>
                <div className="text-xs font-semibold">{t.driver.name} <span className="text-muted-foreground">· ⭐ {t.driver.rating}</span></div>
              </div>
            </div>
          )}
          <Detail icon={Truck} label="Delivery time" value={durationMin ? `${durationMin} min · ${new Date(deliveredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Delivered"} />
          <Detail icon={MapPin} label="Address" value={`${order.address?.line1 || ""} · ${order.address?.city || ""}`} />
        </div>
      </section>

      {/* Order summary */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><ShoppingBag size={14} /> Order summary <span className="text-xs text-muted-foreground font-normal">· {order.items?.length} items</span></div>
        <div className="baked-card bg-card border border-border p-4 space-y-2">
          {order.items?.slice(0, 3).map((it, i) => (
            <div key={i} className="flex items-center gap-3">
              {it.image && <img src={it.image} alt={it.name} className="w-9 h-9 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0"><div className="text-xs font-semibold truncate">{it.name}</div><div className="text-[10px] text-muted-foreground">Qty {it.quantity}</div></div>
              <div className="text-xs font-bold">{formatMoney(it.line_total, order.currency, ccy)}</div>
            </div>
          ))}
          {order.items?.length > 3 && <div className="text-[10px] text-muted-foreground text-center pt-1">+ {order.items.length - 3} more items</div>}
          <div className="h-px bg-border" />
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold">{formatMoney(order.subtotal, order.currency, ccy)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Delivery</span><span className="font-semibold">{order.delivery_fee === 0 ? <span style={{ color: "#77BC1F" }}>FREE</span> : formatMoney(order.delivery_fee, order.currency, ccy)}</span></div>
            <div className="flex items-center justify-between text-sm font-bold pt-1"><span>Total paid</span><span>{formatMoney(order.total, order.currency, ccy)}</span></div>
          </div>
        </div>
      </section>

      {/* Sticky footer */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button data-testid="m-od-reorder" onClick={() => nav("/")} variant="outline" className="baked-btn h-12 font-semibold"><RotateCcw size={14} className="mr-1.5" /> Reorder</Button>
          <Button data-testid="m-od-shop" onClick={() => nav("/")} className="baked-btn h-12 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>Continue Shopping</Button>
        </div>
      </div>
    </div>
  );
};

const Detail = ({ icon: Icon, label, value }) => (
  <div className="px-4 py-3 flex items-start gap-3">
    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={14} /></div>
    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-xs font-semibold mt-0.5">{value}</div></div>
  </div>
);
