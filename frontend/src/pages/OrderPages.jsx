import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { formatMoney } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { CheckCircle2, MapPin, Clock, CreditCard, Package } from "lucide-react";

export const OrderDetailPage = () => {
  const { id } = useParams();
  const { language } = useApp();
  const [order, setOrder] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { api.get(`/orders/${id}`).then(r => setOrder(r.data)).catch(() => setOrder(null)); }, [id]);
  if (!order) return <div className="baked-container my-16 text-center text-muted-foreground">Loading…</div>;

  const paid = ["succeeded", "authorized"].includes(order.payment_status);
  return (
    <div className="baked-container my-8">
      {/* Success banner */}
      <div className="baked-card border p-6 flex items-start gap-4" style={{ backgroundColor: paid ? "#77BC1F14" : undefined, borderColor: paid ? "#77BC1F55" : "hsl(var(--border))" }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: paid ? "#77BC1F" : "hsl(var(--muted))", color: "#0a1200" }}>
          <CheckCircle2 size={28} />
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold">{language === "en" ? "Order confirmed!" : "Commande confirmée !"}</div>
          <div className="text-sm text-muted-foreground">#{order.number} — {order.status.toUpperCase()} · {order.payment_status.toUpperCase()}</div>
          <div className="text-xs text-muted-foreground mt-1">{language === "en" ? "We'll deliver in" : "Livraison en"} <span className="font-semibold text-foreground">{order.delivery_slot_label}</span></div>
        </div>
        <Button onClick={() => navigate("/")} variant="outline" className="baked-btn border-border">{language === "en" ? "Continue shopping" : "Continuer les achats"}</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] mt-6">
        <div className="space-y-5">
          {/* Address */}
          <section className="baked-card bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-2"><MapPin size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Delivery address" : "Adresse de livraison"}</h3></div>
            <div className="text-sm">{order.address?.label} — {order.address?.line1}, {order.address?.city}, {order.country}</div>
            {order.instructions && <div className="text-xs text-muted-foreground mt-2">📝 {order.instructions}</div>}
          </section>
          {/* Slot */}
          <section className="baked-card bg-card border border-border p-5">
            <div className="flex items-center gap-2 mb-2"><Clock size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Delivery time" : "Créneau"}</h3></div>
            <div className="text-sm">{order.delivery_slot_label}</div>
          </section>
          {/* Items */}
          <section className="baked-card bg-card border border-border">
            <div className="p-5 border-b border-border flex items-center gap-2"><Package size={18} style={{ color: "#77BC1F" }} /><h3 className="font-semibold">{language === "en" ? "Items" : "Articles"}</h3></div>
            <div className="divide-y divide-border">
              {order.items.map((it, i) => (
                <div key={i} className="p-4 flex items-center gap-4">
                  {it.image && <img src={it.image} alt={it.name} className="w-14 h-14 rounded-xl object-cover" />}
                  <div className="flex-1"><div className="text-sm font-semibold">{it.name}</div><div className="text-[11px] text-muted-foreground">{it.brand} · {it.unit}</div></div>
                  <div className="text-xs">{it.quantity} × {formatMoney(it.price, order.currency, order.address?.currency_symbol)}</div>
                  <div className="text-sm font-bold w-24 text-right">{formatMoney(it.line_total, order.currency)}</div>
                </div>
              ))}
            </div>
          </section>
          {/* Fulfilment breakdown — only shows when the order was routed to 1+ partners */}
          {order.partners?.length > 0 && (
            <section className="baked-card bg-card border border-border p-5" data-testid="order-partners-panel">
              <div className="flex items-center gap-2 mb-3">
                <Package size={18} style={{ color: "#77BC1F" }} />
                <h3 className="font-semibold">
                  {order.partner_count > 1
                    ? (language === "en" ? `Sourced from ${order.partner_count} stores` : `Provient de ${order.partner_count} boutiques`)
                    : (language === "en" ? "Fulfilled by" : "Assuré par")}
                </h3>
              </div>
              {order.partner_count > 1 && (
                <p className="text-[11px] text-muted-foreground mb-3">
                  {language === "en"
                    ? "We're consolidating your items so you receive one delivery."
                    : "Nous regroupons vos articles pour une livraison unique."}
                </p>
              )}
              <div className="space-y-2">
                {order.partners.map(p => (
                  <div key={p.partner_id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-secondary/40">
                    <div className="flex-1">
                      <div className="font-medium">{p.partner_name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.item_count} item(s) · {p.status.replace(/_/g, " ")}</div>
                    </div>
                    <div className="text-xs font-mono">{formatMoney(p.subtotal, order.currency)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside>
          <div className="baked-card bg-card border border-border p-5 sticky top-24 space-y-2">
            <div className="text-sm font-semibold mb-2">{language === "en" ? "Payment" : "Paiement"}</div>
            <div className="flex items-center gap-2 text-sm"><CreditCard size={16} /> {order.payment_method.toUpperCase()}</div>
            <div className="text-xs text-muted-foreground">Ref: {order.payment_provider_ref || "-"}</div>
            <div className="h-px bg-border my-3" />
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(order.subtotal, order.currency)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery</span><span>{order.delivery_fee === 0 ? "FREE" : formatMoney(order.delivery_fee, order.currency)}</span></div>
            <div className="h-px bg-border" />
            <div className="flex justify-between font-bold"><span>Total</span><span>{formatMoney(order.total, order.currency)}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export const OrdersListPage = () => {
  const [orders, setOrders] = useState([]);
  const { language } = useApp();
  useEffect(() => { api.get("/orders/me").then(r => setOrders(r.data)); }, []);
  return (
    <div className="baked-container my-8">
      <h1 className="text-3xl font-bold mb-6">{language === "en" ? "Your orders" : "Vos commandes"}</h1>
      {orders.length === 0 && <div className="text-sm text-muted-foreground">{language === "en" ? "No orders yet." : "Aucune commande."}</div>}
      <div className="grid gap-3">
        {orders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="baked-card bg-card border border-border p-4 flex items-center gap-4 hover:border-[#77BC1F]/60 motion-fast">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><Package size={18} /></div>
            <div className="flex-1"><div className="text-sm font-semibold">#{o.number}</div><div className="text-[11px] text-muted-foreground">{o.items.length} items · {o.delivery_slot_label}</div></div>
            <div className="text-sm font-bold">{formatMoney(o.total, o.currency)}</div>
            <div className={`text-[10px] px-2 py-1 baked-chip ${o.status === "confirmed" ? "bg-[#77BC1F22] text-[#77BC1F]" : "bg-secondary text-muted-foreground"}`}>{o.status}</div>
          </Link>
        ))}
      </div>
    </div>
  );
};
