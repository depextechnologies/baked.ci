import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wallet2, Sparkles, TrendingUp, ShieldCheck, Gift } from "lucide-react";
import { Button } from "../../components/ui/button";

/**
 * MobileWalletComingSoon — placeholder shown when the wallet chip in the mobile header is tapped.
 */
export const MobileWalletComingSoon = () => {
  const nav = useNavigate();
  return (
    <div className="min-h-[75vh] pb-8">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-wallet-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="text-base font-bold">BAKĒD Wallet</div>
      </div>

      <div className="px-4 mt-2">
        <div className="relative rounded-3xl overflow-hidden p-6" style={{ background: "linear-gradient(135deg, #0a1200 0%, #1a2b04 50%, #0a1200 100%)" }}>
          <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, #77BC1F55 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: "#77BC1F" }}>
              <Wallet2 size={12} /> Wallet balance
            </div>
            <div className="text-4xl font-bold text-white mt-2">£0.00</div>
            <div className="mt-1 text-[11px] text-white/60">Zero fees · Instant top-ups · Cross-app</div>
            <div className="mt-4 inline-flex items-center gap-1.5 baked-chip px-3 py-1.5 text-[10px] font-bold" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}>
              <Sparkles size={11} /> COMING SOON
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="text-sm font-bold mb-3">What you&apos;ll be able to do</div>
        <div className="grid gap-2.5">
          {[
            { icon: TrendingUp, title: "Top up once, spend everywhere", sub: "Same wallet across MART, FOOD, SHOP, EXPRESS, AUTO and IMMO." },
            { icon: ShieldCheck, title: "Instant refunds", sub: "Order issues resolved by crediting your wallet in seconds." },
            { icon: Gift, title: "Rewards & cashback", sub: "Earn credit on every order and redeem at checkout." },
          ].map((f, i) => { const Icon = f.icon; return (
            <div key={i} className="baked-card bg-card border border-border p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={16} /></div>
              <div><div className="text-sm font-semibold">{f.title}</div><div className="text-[11px] text-muted-foreground leading-snug">{f.sub}</div></div>
            </div>
          );})}
        </div>
      </div>

      <div className="px-4 mt-6">
        <Button data-testid="m-wallet-shop" onClick={() => nav("/")} className="baked-btn w-full h-12 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
          Continue shopping
        </Button>
        <div className="text-[11px] text-muted-foreground text-center mt-3">Wallet will unlock automatically once launched — no action needed from you.</div>
      </div>
    </div>
  );
};
