import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp, useAuth, useCart } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { ArrowLeft, MapPin, Zap, Clock, CalendarClock, ChevronRight, Banknote, Wallet2, CreditCard, Apple, ShieldCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PhoneLoginDialog } from "../../components/auth/PhoneLoginDialog";

const SLOTS = [
  { code: "express",   icon: Zap,          eta: "10-15 min",  label: "Express",  sub: "Fastest option" },
  { code: "superfast", icon: Clock,        eta: "20-30 min",  label: "Super Fast", sub: "Popular pick" },
  { code: "standard",  icon: Clock,        eta: "30-45 min",  label: "Standard",  sub: "Save on fees" },
  { code: "later",     icon: CalendarClock, eta: "Choose time", label: "Schedule",  sub: "Pick a slot" },
];

export const MobileCheckout = () => {
  const nav = useNavigate();
  const { country } = useApp();
  const { customer } = useAuth();
  const { cart, clear } = useCart();
  const [loginOpen, setLoginOpen] = useState(false);
  const [address, setAddress] = useState({ line1: "", city: country?.code === "CI" ? "Abidjan" : "London", country: country?.code || "CI", instructions: "" });
  const [slot, setSlot] = useState("express");
  const [payment, setPayment] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const ccy = country?.currency_symbol || country?.currency;

  useEffect(() => {
    if (!cart.items?.length) { nav("/cart"); }
  }, [cart, nav]);

  const subtotal = cart.subtotal || 0;
  const deliveryFee = subtotal >= (country?.free_delivery_over || 999999) ? 0 : (country?.delivery_fee || 0);
  const packingFee = 200;
  const total = subtotal + deliveryFee + packingFee;

  const placeOrder = async () => {
    if (!customer) { setLoginOpen(true); return; }
    if (!address.line1) { toast.error("Enter a delivery address"); return; }
    setPlacing(true);
    try {
      const { data } = await api.post("/orders", {
        address,
        delivery_slot: slot,
        payment_method: payment,
        instructions: address.instructions,
      });
      toast.success("Order placed!");
      await clear();
      nav(`/orders/${data.id}/confirmation`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not place order");
    } finally { setPlacing(false); }
  };

  const PAYMENTS = [
    { code: "cod",    icon: Banknote,   label: "Cash on Delivery", sub: "Pay when your order arrives", available: true },
    { code: "wallet", icon: Wallet2,    label: "BAKĒD Wallet", sub: "Coming soon", available: false },
    { code: "card",   icon: CreditCard, label: "Card", sub: "Coming soon", available: false },
    { code: "apple",  icon: Apple,      label: "Apple Pay", sub: "Coming soon", available: false },
  ];

  return (
    <div className="pb-40">
      {/* Sub header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-co-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold">Checkout</div>
          <div className="text-[11px] text-muted-foreground">Almost there — review and confirm.</div>
        </div>
      </div>

      {/* Delivery address */}
      <section className="px-4 mt-2">
        <div className="text-sm font-bold mb-2">Delivery Address</div>
        <div className="baked-card bg-card border border-border p-4">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><MapPin size={14} /></div>
            <div className="flex-1 min-w-0">
              <input data-testid="m-co-addr-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} placeholder="Street, building, apartment #" className="w-full bg-transparent text-sm font-medium outline-none border-b border-border pb-1.5" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input data-testid="m-co-addr-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="City" className="baked-input bg-secondary px-3 py-2 text-xs" />
                <input data-testid="m-co-addr-country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value.toUpperCase() })} placeholder="ISO" className="baked-input bg-secondary px-3 py-2 text-xs" />
              </div>
              <textarea data-testid="m-co-addr-instructions" value={address.instructions} onChange={(e) => setAddress({ ...address, instructions: e.target.value })} rows={2} placeholder="Delivery instructions (optional)" className="mt-2 w-full baked-input bg-secondary px-3 py-2 text-xs" />
            </div>
          </div>
        </div>
      </section>

      {/* Delivery slot */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">Delivery Slot</div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {SLOTS.map((s) => {
            const Icon = s.icon;
            const isAct = slot === s.code;
            return (
              <button key={s.code} data-testid={`m-co-slot-${s.code}`} onClick={() => setSlot(s.code)} className={`shrink-0 w-40 baked-card border p-3 text-left motion-fast ${isAct ? "" : "border-border"}`} style={isAct ? { borderColor: "#77BC1F", backgroundColor: "#77BC1F14" } : {}}>
                <Icon size={18} style={{ color: isAct ? "#77BC1F" : "hsl(var(--muted-foreground))" }} />
                <div className="text-sm font-bold mt-1">{s.eta}</div>
                <div className="text-[10px] text-muted-foreground">{s.label} · {s.sub}</div>
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">Your order will be delivered in <b style={{ color: "#77BC1F" }}>{SLOTS.find((s) => s.code === slot)?.eta}</b>. Fresh & fast to your doorstep.</div>
      </section>

      {/* Payment method */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">Payment Method</div>
        <div className="baked-card bg-card border border-border overflow-hidden">
          {PAYMENTS.map((p, i) => {
            const Icon = p.icon;
            const isAct = payment === p.code;
            return (
              <button
                key={p.code}
                data-testid={`m-co-pay-${p.code}`}
                disabled={!p.available}
                onClick={() => p.available && setPayment(p.code)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${i > 0 ? "border-t border-border" : ""} ${p.available ? "" : "opacity-50"}`}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: isAct ? "#77BC1F22" : "hsl(var(--secondary))", color: isAct ? "#77BC1F" : "hsl(var(--foreground))" }}><Icon size={15} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground">{p.sub}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isAct ? "" : "border-border"}`} style={isAct ? { borderColor: "#77BC1F", backgroundColor: "#77BC1F" } : {}}>
                  {isAct && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Order summary */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><ShoppingBag size={14} /> Order summary <span className="text-xs text-muted-foreground font-normal">· {cart.item_count} items</span></div>
        <div className="baked-card bg-card border border-border p-4">
          <div className="space-y-2 text-xs">
            <Row label="Subtotal" value={formatMoney(subtotal, country?.currency, ccy)} />
            <Row label="Delivery fee" value={deliveryFee === 0 ? <span style={{ color: "#77BC1F" }}>FREE</span> : formatMoney(deliveryFee, country?.currency, ccy)} />
            <Row label="Packing fee" value={formatMoney(packingFee, country?.currency, ccy)} />
            <div className="h-px bg-border my-2" />
            <div className="flex items-center justify-between text-sm font-bold pt-1">
              <span>Total (Incl. VAT)</span><span data-testid="m-co-total">{formatMoney(total, country?.currency, ccy)}</span>
            </div>
          </div>
          <button onClick={() => nav("/cart")} className="text-xs font-semibold mt-3 flex items-center gap-1" style={{ color: "#77BC1F" }}>Edit cart <ChevronRight size={12} /></button>
        </div>
      </section>

      {/* Trust strip */}
      <div className="px-4 mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><ShieldCheck size={11} /> 100% Secure</span>
        <span className="flex items-center gap-1"><Zap size={11} /> Fast delivery</span>
      </div>

      {/* Sticky pay footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground">Total Payable</div>
            <div className="text-lg font-bold leading-none">{formatMoney(total, country?.currency, ccy)}</div>
          </div>
          <Button data-testid="m-co-pay" disabled={placing || !address.line1} onClick={placeOrder} className="baked-btn h-12 px-6 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            {placing ? "Placing…" : payment === "cod" ? "Place Order" : "Pay Now"}
          </Button>
        </div>
      </div>

      <PhoneLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);
