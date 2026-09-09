import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { useLocalePath } from "../../i18n/routes";
import { formatMoney } from "../../lib/i18n";
import { ArrowLeft, HelpCircle, Copy, Share2, MessageCircle, Mail, Smartphone, Users2, Sparkles, Gift, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

export const MobileRefer = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const { customer } = useAuth();
  const [r, setR] = useState(null);

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/referrals").then((res) => setR(res.data)).catch(() => setR(null));
  }, [customer]);

  const copy = (text, label) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    toast.success(label);
  };

  const shareVia = (channel) => {
    const url = r?.referral_link;
    const msg = t("refer.share_message", { code: r?.referral_code, url });
    if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    else if (channel === "sms") window.location.href = `sms:?body=${encodeURIComponent(msg)}`;
    else if (channel === "email") window.location.href = `mailto:?subject=${encodeURIComponent(t("refer.share_email_subject"))}&body=${encodeURIComponent(msg)}`;
    else if (channel === "native" && navigator.share) navigator.share({ title: t("refer.share_email_subject"), text: msg, url }).catch(() => {});
    else copy(msg, t("refer.message_copied"));
  };

  if (!customer) return <GuestSignInPrompt title={t("refer.signin_title")} message={t("refer.signin_body")} testid="m-refer-signin" />;
  if (!r) return <div className="p-8 text-sm text-muted-foreground">{t("refer.loading")}</div>;

  const ccy = (amount) => formatMoney(amount, r.currency, r.currency === "XOF" ? "CFA" : "£");

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-ref-back" onClick={() => nav(path("profile"))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("refer.title")}</div><div className="text-[11px] text-muted-foreground">{t("refer.subtitle")}</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label={t("refer.info_aria")}><HelpCircle size={16} /></button>
      </div>

      <div className="px-4">
        <div className="relative rounded-3xl overflow-hidden p-6 text-center" style={{ background: "linear-gradient(135deg, #0a1a3a 0%, #0a1200 50%, #1a0a3a 100%)" }}>
          <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #1D9BF055 0%, transparent 70%)" }} />
          <div className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, #77BC1F55 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center border-2 mb-3" style={{ backgroundColor: "#77BC1F", color: "#0a1200", borderColor: "rgba(119,188,31,.3)" }}>
              <Gift size={22} strokeWidth={2.5} />
            </div>
            <div className="text-lg font-bold text-white leading-tight">{t("refer.hero_earn", { amount: ccy(r.reward_per_referral) })}</div>
            <div className="text-[11px] text-white/60 mt-2">{t("refer.hero_body", { days: r.validity_days })}</div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("refer.code_label")}</div>
          <div className="mt-2 flex items-center gap-3">
            <div data-testid="m-ref-code" className="flex-1 text-2xl font-black font-mono tracking-wider" style={{ color: "#77BC1F" }}>{r.referral_code}</div>
            <button data-testid="m-ref-copy-code" onClick={() => copy(r.referral_code, t("refer.code_copied"))} className="w-11 h-11 rounded-2xl flex items-center justify-center bg-secondary motion-fast active:scale-95" aria-label={t("refer.copy_aria")}><Copy size={17} /></button>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("refer.link_label")}</div>
            <div className="mt-2 flex items-center gap-2">
              <div data-testid="m-ref-link" className="flex-1 text-[11px] font-mono text-muted-foreground truncate">{r.referral_link}</div>
              <button data-testid="m-ref-copy-link" onClick={() => copy(r.referral_link, t("refer.link_copied"))} className="text-xs font-bold px-3 h-9 rounded-lg motion-fast active:scale-95 text-black" style={{ backgroundColor: "#77BC1F" }}>{t("refer.copy_label")}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="text-sm font-bold mb-2">{t("refer.share_via")}</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { code: "whatsapp", icon: MessageCircle, label: t("refer.channel_whatsapp"), tone: "#25D366" },
            { code: "sms", icon: Smartphone, label: t("refer.channel_sms"), tone: "#1D9BF0" },
            { code: "email", icon: Mail, label: t("refer.channel_email"), tone: "#FCC44C" },
            { code: "native", icon: Share2, label: t("refer.channel_more"), tone: "#A659FF" },
          ].map((c) => { const Icon = c.icon; return (
            <button key={c.code} data-testid={`m-ref-share-${c.code}`} onClick={() => shareVia(c.code)} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95">
              <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1" style={{ backgroundColor: `${c.tone}22`, color: c.tone }}><Icon size={15} /></div>
              <div className="text-[10px] font-bold">{c.label}</div>
            </button>
          );})}
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="text-sm font-bold mb-2">{t("refer.stats_title")}</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="baked-card bg-card border border-border p-3 text-center">
            <div className="text-2xl font-bold" data-testid="m-ref-stat-joined">{r.friends_joined}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{t("refer.friends_joined")}</div>
          </div>
          <div className="baked-card bg-card border border-border p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: "#FCC44C" }} data-testid="m-ref-stat-pending">{r.pending}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{t("refer.pending")}</div>
          </div>
          <div className="baked-card bg-card border border-border p-3 text-center">
            <div className="text-2xl font-bold" style={{ color: "#77BC1F" }} data-testid="m-ref-stat-earned">{ccy(r.total_earned)}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{t("refer.total_earned")}</div>
          </div>
        </div>
        {r.friends_joined === 0 && (
          <div className="text-[11px] text-muted-foreground text-center mt-2">{t("refer.stats_hint", { days: r.validity_days })}</div>
        )}
      </div>

      <div className="px-4 mt-5">
        <div className="text-sm font-bold mb-2">{t("refer.how_title")}</div>
        <div className="baked-card bg-card border border-border p-4 space-y-4">
          {[
            { icon: Users2, title: t("refer.step_invite_title"), sub: t("refer.step_invite_sub"), tone: "#1D9BF0" },
            { icon: Sparkles, title: t("refer.step_join_title"), sub: t("refer.step_join_sub"), tone: "#FCC44C" },
            { icon: TrendingUp, title: t("refer.step_earn_title"), sub: t("refer.step_earn_sub", { amount: ccy(r.reward_per_referral) }), tone: "#77BC1F" },
          ].map((step, i) => { const Icon = step.icon; return (
            <div key={i} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${step.tone}22`, color: step.tone }}><Icon size={16} /></div>
              <div><div className="text-sm font-bold">{i + 1}. {step.title}</div><div className="text-[11px] text-muted-foreground">{step.sub}</div></div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
};
