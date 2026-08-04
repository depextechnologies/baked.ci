import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp, useAuth, useCart } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { checkOrderEligibility } from "../../lib/checkout";
import { Button } from "../../components/ui/button";
import { ArrowLeft, MapPin, Zap, Clock, CalendarClock, ChevronRight, Banknote, Wallet2, CreditCard, Apple, ShieldCheck, ShoppingBag, AlertCircle, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PhoneLoginDialog } from "../../components/auth/PhoneLoginDialog";

const SLOTS = [
  { code: "express",   icon: Zap,          eta: "10-15 min",  label: "Express",  sub: "Fastest option" },
  { code: "superfast", icon: Clock,        eta: "20-30 min",  label: "Super Fast", sub: "Popular pick" },
  { code: "standard",  icon: Clock,        eta: "30-45 min",  label: "Standard",  sub: "Save on fees" },
  { code: "later",     icon: CalendarClock, eta: "Choose time", label: "Schedule",  sub: "Pick a slot" },
];

// Convert the shared AddressSelector's activeAddress into the shape MobileCheckout tracks
// locally. Preserves rich Google Places fields so they land in the POST /orders payload.
const hydrateAddress = (active, country) => ({
  line1: active?.line1 || active?.formatted_address || "",
  city: active?.city || (country?.code === "CI" ? "Abidjan" : country?.code === "LR" ? "Monrovia" : ""),
  country: (active?.country || country?.code || "CI").toUpperCase(),
  instructions: active?.instructions || "",
  place_id: active?.place_id || null,
  formatted_address: active?.formatted_address || null,
  latitude: active?.latitude ?? null,
  longitude: active?.longitude ?? null,
  region: active?.region || null,
  postal_code: active?.postal_code || null,
});

export const MobileCheckout = () => {
  const nav = useNavigate();
  const { country, activeAddress, openAddressSelector } = useApp();
  const { customer } = useAuth();
  const { cart, loaded: cartLoaded, clear } = useCart();
  const [loginOpen, setLoginOpen] = useState(false);
  // Initialise the delivery address from the shared AddressSelector's activeAddress
  // so users don't have to retype what they already picked in the header.
  const [address, setAddress] = useState(() => hydrateAddress(activeAddress, country));
  const [slot, setSlot] = useState("express");
  const [payment, setPayment] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [rewards, setRewards] = useState(null);
  const [usePoints, setUsePoints] = useState(0);
  const [preview, setPreview] = useState(null);
  const ccy = country?.currency_symbol || country?.currency;

  // Keep the local form in sync when the user updates their active address via the pill
  useEffect(() => {
    if (activeAddress) setAddress(hydrateAddress(activeAddress, country));
  }, [activeAddress, country]);

  useEffect(() => {
    if (!cart.items?.length || !customer) return;
    api.get("/customers/me/rewards").then((r) => setRewards(r.data)).catch(() => setRewards(null));
  }, [customer, cart]);

  // Live preview of eligibility WITH points redemption
  useEffect(() => {
    if (!customer) return;
    api.get(`/mart/cart/eligibility?use_points=${usePoints}`).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  }, [customer, usePoints, cart]);

  useEffect(() => {
    // Only redirect if we're truly certain the cart is empty AND auth has settled.
    // The redirect is now guarded by a brief settle window to avoid the auth→cart race.
    if (cartLoaded && customer && !cart.items?.length) {
      const t = setTimeout(() => { if (!cart.items?.length) nav("/cart"); }, 600);
      return () => clearTimeout(t);
    }
  }, [cart, cartLoaded, customer, nav]);

  const subtotal = cart.subtotal || 0;
  const elig = checkOrderEligibility(subtotal, country);
  const { delivery_fee: deliveryFee, min_order: minOrder, shortfall, eligible: minOrderOk } = elig;
  const pointsDiscount = preview?.points_discount || 0;
  const pointsApplied = preview?.points_applied || 0;
  const maxRedeemable = preview?.points_max_redeemable ?? (rewards?.points || 0);
  const total = Math.max(0, elig.total - pointsDiscount);
  const pointsEarned = preview?.points_earned_preview || Math.floor(subtotal);

  const placeOrder = async () => {
    if (!customer) { setLoginOpen(true); return; }
    if (!address.line1) { toast.error("Enter a delivery address"); return; }
    if (!minOrderOk) { toast.error(`Add ${formatMoney(shortfall, country?.currency, ccy)} more to reach the ${formatMoney(minOrder, country?.currency, ccy)} minimum order`); return; }
    setPlacing(true);
    try {
      const { data } = await api.post("/orders", {
        address,
        delivery_slot: slot,
        payment_method: payment,
        instructions: address.instructions,
        use_points: pointsApplied,
      });
      toast.success(`Order placed! +${data.points_earned || 0} baked Points earned`);
      await clear();
      nav(`/orders/${data.id}/confirmation`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.code === "not_available_in_area") {
        const names = (detail.gaps || []).map(g => g.name).filter(Boolean).join(", ");
        toast.error(`${detail.message}${names ? ` (${names})` : ""}`, { duration: 6000 });
      } else {
        toast.error(typeof detail === "string" ? detail : "Could not place order");
      }
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

      {/* Rewards — Redeem Points tile */}
      {rewards && rewards.points > 0 && (
        <section className="px-4 mt-5">
          <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><Star size={14} style={{ color: "#FCC44C" }} fill="#FCC44C" /> Redeem baked Points</div>
          <div className="baked-card overflow-hidden border p-4" style={{ borderColor: "#FCC44C55", background: "linear-gradient(135deg, #FCC44C14 0%, hsl(var(--card)) 65%)" }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Available</div>
                <div className="text-lg font-bold" data-testid="m-co-points-available">{rewards.points} pts</div>
                <div className="text-[10px] text-muted-foreground">Worth {formatMoney(rewards.worth, rewards.currency, rewards.currency_symbol)} at checkout</div>
              </div>
              <button data-testid="m-co-points-max" onClick={() => setUsePoints(maxRedeemable)} disabled={maxRedeemable === 0} className="text-xs font-bold px-3 h-9 rounded-lg text-black disabled:opacity-40" style={{ backgroundColor: "#FCC44C" }}>Use max</button>
            </div>
            <div className="mt-4">
              <input
                data-testid="m-co-points-slider"
                type="range" min={0} max={maxRedeemable} step={rewards.conversion_rate || 100}
                value={Math.min(usePoints, maxRedeemable)}
                onChange={(e) => setUsePoints(Number(e.target.value))}
                className="w-full accent-[#FCC44C]"
              />
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="text-muted-foreground">0</span>
                <span className="font-semibold" data-testid="m-co-points-applied">Using <b style={{ color: "#FCC44C" }}>{pointsApplied}</b> pts → <b style={{ color: "#77BC1F" }}>−{formatMoney(pointsDiscount, country?.currency, ccy)}</b></span>
                <span className="text-muted-foreground">{maxRedeemable}</span>
              </div>
              {maxRedeemable === 0 && <div className="text-[10px] text-muted-foreground text-center mt-2">Redemption available on orders above the minimum threshold.</div>}
            </div>
          </div>
        </section>
      )}

      {/* Rewards — earning preview (always shown if authenticated) */}
      {rewards && (
        <section className="px-4 mt-3">
          <div className="baked-card p-3 flex items-center gap-3 border" style={{ borderColor: "#77BC1F55", background: "linear-gradient(135deg, #77BC1F14 0%, hsl(var(--card)) 65%)" }}>
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Sparkles size={16} /></div>
            <div className="text-[12px] leading-snug"><b style={{ color: "#77BC1F" }}>+{pointsEarned} baked Points</b> will be credited when this order is confirmed.</div>
          </div>
        </section>
      )}

      {/* Order summary */}
      <section className="px-4 mt-5">
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><ShoppingBag size={14} /> Order summary <span className="text-xs text-muted-foreground font-normal">· {cart.item_count} items</span></div>
        <div className="baked-card bg-card border border-border p-4">
          <div className="space-y-2 text-xs">
            <Row label="Subtotal" value={formatMoney(subtotal, country?.currency, ccy)} />
            <Row label="Delivery fee" value={deliveryFee === 0 ? <span style={{ color: "#77BC1F" }}>FREE</span> : formatMoney(deliveryFee, country?.currency, ccy)} />
            {pointsDiscount > 0 && <Row label={`Points discount (${pointsApplied} pts)`} value={<span style={{ color: "#77BC1F" }}>− {formatMoney(pointsDiscount, country?.currency, ccy)}</span>} />}
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

      {/* Min-order banner (only when below threshold) */}
      {!minOrderOk && (
        <div className="px-4 mt-3">
          <div data-testid="m-co-min-order-warning" className="baked-card p-3 flex items-start gap-2.5 border" style={{ backgroundColor: "#FCC44C1a", borderColor: "#FCC44C88" }}>
            <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#FCC44C" }} />
            <div className="text-[11px] leading-snug">
              Add <b style={{ color: "#FCC44C" }}>{formatMoney(shortfall, country?.currency, ccy)}</b> more to your basket to reach the <b>{formatMoney(minOrder, country?.currency, ccy)}</b> minimum.
            </div>
          </div>
        </div>
      )}

      {/* Sticky pay footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground">Total Payable</div>
            <div className="text-lg font-bold leading-none">{formatMoney(total, country?.currency, ccy)}</div>
          </div>
          <Button data-testid="m-co-pay" disabled={placing || !address.line1 || !minOrderOk} onClick={placeOrder} className="baked-btn h-12 px-6 font-bold text-black disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: "#77BC1F" }}>
            {placing ? "Placing…" : !minOrderOk ? "Add more" : payment === "cod" ? "Place Order" : "Pay Now"}
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
