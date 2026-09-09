import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { useLocalePath } from "../../i18n/routes";
import { formatMoney } from "../../lib/i18n";
import { ArrowLeft, HelpCircle, Star, ShoppingBag, TrendingUp, ShieldCheck, Sparkles, Gift } from "lucide-react";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

export const MobileRewards = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const { customer } = useAuth();
  const [r, setR] = useState(null);

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/rewards").then((res) => setR(res.data)).catch(() => setR(null));
  }, [customer]);

  if (!customer) return <GuestSignInPrompt title={t("rewards_page.signin_title")} message={t("rewards_page.signin_body")} testid="m-rewards-signin" />;
  if (!r) return <div className="p-8 text-sm text-muted-foreground">{t("rewards_page.loading")}</div>;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-rew-back" onClick={() => nav(path("profile"))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("rewards_page.title")}</div><div className="text-[11px] text-muted-foreground">{t("rewards_page.subtitle")}</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label={t("rewards_page.info_aria")}><HelpCircle size={16} /></button>
      </div>

      <div className="px-4">
        <div className="relative rounded-3xl overflow-hidden p-6 text-center" style={{ background: "linear-gradient(135deg, #0a1200 0%, #2a2000 60%, #0a1200 100%)" }}>
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #FCC44C55 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center border-4 mb-3" style={{ backgroundColor: "#FCC44C", color: "#0a1200", borderColor: "rgba(252,196,76,.3)" }}>
              <Star size={26} fill="#0a1200" strokeWidth={2.5} />
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/70">{t("rewards_page.available_points")}</div>
            <div className="text-5xl font-bold text-white mt-1" data-testid="m-rew-points">{r.points}</div>
            <div className="text-xs mt-1" style={{ color: "#FCC44C" }}>{t("rewards_page.worth_discount", { amount: formatMoney(r.worth, r.currency, r.currency_symbol) })}</div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">{t("rewards_page.how_title")}</div>
        <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#FCC44C55", background: "linear-gradient(135deg, #FCC44C1a 0%, hsl(var(--card)) 60%)" }}>
          <div className="text-center text-lg font-bold" style={{ color: "#FCC44C" }}>{t("rewards_page.conversion", { points: r.conversion_rate, amount: formatMoney(1, r.currency, r.currency_symbol) })}</div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: ShoppingBag, label: t("rewards_page.step_shop"), tone: "#77BC1F" },
              { icon: TrendingUp, label: t("rewards_page.step_earn"), tone: "#FCC44C" },
              { icon: Gift, label: t("rewards_page.step_redeem"), tone: "#1D9BF0" },
            ].map((s, i) => { const Icon = s.icon; return (
              <div key={i} className="text-center">
                <div className="w-11 h-11 mx-auto rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${s.tone}22`, color: s.tone }}><Icon size={16} /></div>
                <div className="text-[10px] font-semibold mt-1.5 leading-tight">{s.label}</div>
              </div>
            );})}
          </div>
        </div>
      </div>

      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">{t("rewards_page.recent_title")}</div>
          {r.recent?.length > 0 && <button className="text-xs font-semibold" style={{ color: "#77BC1F" }}>{t("rewards_page.view_all")}</button>}
        </div>
        {(!r.recent || r.recent.length === 0) ? (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <Sparkles size={30} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">{t("rewards_page.empty_title")}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{t("rewards_page.empty_body")}</div>
          </div>
        ) : (
          <div className="baked-card bg-card border border-border overflow-hidden">
            {r.recent.map((e) => { const isRedeem = e.kind === "redeemed" || e.points < 0; const dt = e.created_at ? new Date(e.created_at) : null; const dateStr = dt && !isNaN(dt) ? dt.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : t("rewards_page.recent_fallback"); return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: isRedeem ? "#77BC1F22" : "#FCC44C22", color: isRedeem ? "#77BC1F" : "#FCC44C" }}><Star size={13} fill={isRedeem ? "#77BC1F" : "#FCC44C"} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{e.label}</div><div className="text-[10px] text-muted-foreground">{dateStr}</div></div>
                <div className="text-sm font-bold" style={{ color: isRedeem ? "#77BC1F" : "#FCC44C" }}>{e.points > 0 ? `+${e.points}` : e.points}</div>
              </div>
            );})}
          </div>
        )}
      </div>

      <div className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">{t("rewards_page.use_title")}</div>
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-[11px] text-muted-foreground">{t("rewards_page.use_body")}</div>
          <div className="mt-3 space-y-2">
            {r.tiers.map((tier) => (
              <div key={tier.points} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/60">
                <div className="flex items-center gap-2 text-xs font-semibold"><Star size={12} style={{ color: "#FCC44C" }} fill="#FCC44C" /> {t("rewards_page.points_label", { n: tier.points })}</div>
                <div className="text-xs font-bold" style={{ color: "#77BC1F" }}>{t("rewards_page.discount_label", { amount: formatMoney(tier.worth, r.currency, r.currency_symbol) })}</div>
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
