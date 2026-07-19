import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { ArrowLeft, HelpCircle, Star, ShoppingBag, TrendingUp, ShieldCheck, Sparkles, Gift } from "lucide-react";

export const MobileRewards = () => {
  const nav = useNavigate();
  const { customer } = useAuth();
  const [r, setR] = useState(null);

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/rewards").then((res) => setR(res.data)).catch(() => setR(null));
  }, [customer]);

  if (!customer) return <div className="min-h-[70vh] flex items-center justify-center text-sm text-muted-foreground">Please sign in to view your rewards.</div>;
  if (!r) return <div className="p-8 text-sm text-muted-foreground">Loading rewards…</div>;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-rew-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">baked Rewards</div><div className="text-[11px] text-muted-foreground">Earn every time you shop. Redeem for discounts.</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Info"><HelpCircle size={16} /></button>
      </div>

      {/* Points hero */}
      <div className="px-4">
        <div className="relative rounded-3xl overflow-hidden p-6 text-center" style={{ background: "linear-gradient(135deg, #0a1200 0%, #2a2000 60%, #0a1200 100%)" }}>
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #FCC44C55 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center border-4 mb-3" style={{ backgroundColor: "#FCC44C", color: "#0a1200", borderColor: "rgba(252,196,76,.3)" }}>
              <Star size={26} fill="#0a1200" strokeWidth={2.5} />
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/70">Available points</div>
            <div className="text-5xl font-bold text-white mt-1" data-testid="m-rew-points">{r.points}</div>
            <div className="text-xs mt-1" style={{ color: "#FCC44C" }}>Worth {formatMoney(r.worth, r.currency, r.currency_symbol)} discount</div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">How it works</div>
        <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#FCC44C55", background: "linear-gradient(135deg, #FCC44C1a 0%, hsl(var(--card)) 60%)" }}>
          <div className="text-center text-lg font-bold" style={{ color: "#FCC44C" }}>{r.conversion_rate} Points = {formatMoney(1, r.currency, r.currency_symbol)} Discount</div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: ShoppingBag, label: "Shop with baked", tone: "#77BC1F" },
              { icon: TrendingUp, label: "Earn points", tone: "#FCC44C" },
              { icon: Gift, label: "Redeem at checkout", tone: "#1D9BF0" },
            ].map((s, i) => { const Icon = s.icon; return (
              <div key={i} className="text-center">
                <div className="w-11 h-11 mx-auto rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${s.tone}22`, color: s.tone }}><Icon size={16} /></div>
                <div className="text-[10px] font-semibold mt-1.5 leading-tight">{s.label}</div>
              </div>
            );})}
          </div>
        </div>
      </div>

      {/* Recent points */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">Recent points earned</div>
          {r.recent?.length > 0 && <button className="text-xs font-semibold" style={{ color: "#77BC1F" }}>View all</button>}
        </div>
        {(!r.recent || r.recent.length === 0) ? (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <Sparkles size={30} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">No points earned yet</div>
            <div className="text-[11px] text-muted-foreground mt-1">Start shopping to earn baked Points on every order.</div>
          </div>
        ) : (
          <div className="baked-card bg-card border border-border overflow-hidden">
            {r.recent.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Star size={13} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{e.label}</div><div className="text-[10px] text-muted-foreground">{new Date(e.at).toLocaleDateString()}</div></div>
                <div className="text-sm font-bold" style={{ color: "#FCC44C" }}>+{e.points}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Use your points */}
      <div className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">Use your points</div>
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-[11px] text-muted-foreground">Use points at checkout for instant discount.</div>
          <div className="mt-3 space-y-2">
            {r.tiers.map((t) => (
              <div key={t.points} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/60">
                <div className="flex items-center gap-2 text-xs font-semibold"><Star size={12} style={{ color: "#FCC44C" }} fill="#FCC44C" /> {t.points} points</div>
                <div className="text-xs font-bold" style={{ color: "#77BC1F" }}>{formatMoney(t.worth, r.currency, r.currency_symbol)} discount</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border grid gap-1.5 text-[11px] text-muted-foreground">
            {r.policies.map((p, i) => <div key={i} className="flex items-start gap-1.5"><ShieldCheck size={11} className="mt-0.5 shrink-0" style={{ color: "#77BC1F" }} /> {p}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};
