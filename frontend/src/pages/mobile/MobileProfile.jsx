import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, useApp } from "../../contexts/BakedContexts";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Wallet2, ClipboardList, MapPin, Gift, Users2, LifeBuoy, Settings2, ChevronRight, Moon, Sun, LogOut, ShieldCheck, Edit3, BadgeCheck } from "lucide-react";
import { MODULES } from "../../lib/modules";

const Row = ({ icon: Icon, label, sub, onClick, tone = "#77BC1F", testid }) => (
  <button data-testid={testid} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 text-left motion-fast active:bg-secondary/50">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}><Icon size={16} /></div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold truncate">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
    <ChevronRight size={14} className="text-muted-foreground" />
  </button>
);

export const MobileProfile = () => {
  const { t } = useTranslation("customer");
  const { customer, logout, openLogin } = useAuth();
  const { country, language } = useApp();
  const nav = useNavigate();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark") || !document.documentElement.classList.contains("light"));
  const [stats, setStats] = useState({ addresses: 0, tickets_open: 0 });

  useEffect(() => {
    if (!customer) return;
    (async () => {
      try {
        const [ad, tk] = await Promise.all([
          api.get("/customers/me/addresses"),
          api.get("/customers/me/tickets"),
        ]);
        setStats({ addresses: ad.data.length, tickets_open: tk.data.counts?.open || 0 });
      } catch (e) { void e; }
    })();
  }, [customer]);

  const toggleTheme = () => {
    const root = document.documentElement;
    const now = !dark;
    root.classList.toggle("dark", now);
    root.classList.toggle("light", !now);
    setDark(now);
  };

  if (!customer) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><ShieldCheck size={36} /></div>
        <div className="text-lg font-bold">{t("profile.sign_in_prompt")}</div>
        <p className="text-xs text-muted-foreground mt-1">Your BAKĒD identity works across every service.</p>
        <Button data-testid="m-prof-login" onClick={() => openLogin("/profile")} className="baked-btn mt-6 h-11 px-6 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>{t("common:btn.sign_in")}</Button>
      </div>
    );
  }

  const initial = (customer.name || customer.email || customer.phone || "?").trim().charAt(0).toUpperCase();
  const memberTier = "Silver Member";
  const points = customer.reward_points ?? 0;

  return (
    <div className="pb-24">
      {/* Sub-header */}
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-prof-back" onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold">{t("profile.title")}</div>
          <div className="text-[11px] text-muted-foreground">{t("profile.greeting_guest")}</div>
        </div>
        <button data-testid="m-prof-settings-header" onClick={() => nav("/profile/settings")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Settings"><Settings2 size={16} /></button>
      </div>

      {/* Identity hero */}
      <div className="px-4">
        <div className="relative baked-card overflow-hidden p-5 border" style={{ borderColor: "#77BC1F44", background: "linear-gradient(135deg, #77BC1F22 0%, hsl(var(--card)) 55%)" }}>
          <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, #77BC1F44 0%, transparent 70%)" }} />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 border-2" style={{ backgroundColor: "#77BC1F", color: "#0a1200", borderColor: "#0a1200" }}>{initial}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-base font-bold truncate">{customer.name || "New shopper"}</div>
                {customer.verified && <BadgeCheck size={14} style={{ color: "#1D9BF0" }} />}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{customer.email || customer.phone || "—"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{customer.phone && customer.email ? customer.phone : ""}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="baked-chip px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>{memberTier}</span>
                <span className="baked-chip px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>{points} baked Points</span>
              </div>
            </div>
          </div>
          <div className="relative flex gap-2 mt-4">
            <button data-testid="m-prof-edit" onClick={() => nav("/profile/settings")} className="flex-1 h-10 rounded-xl bg-secondary text-xs font-semibold flex items-center justify-center gap-1.5 motion-fast active:scale-95">
              <Edit3 size={13} /> Edit Profile
            </button>
            {!customer.verified && (
              <button data-testid="m-prof-verify" className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 text-black motion-fast active:scale-95" style={{ backgroundColor: "#77BC1F" }}>
                <BadgeCheck size={13} /> Verify Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ecosystem strip */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">One identity across</div>
          <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
            {MODULES.map((m) => (
              <span key={m.code} className="text-[10px] font-bold" style={{ color: m.color }}>{m.label}<span className="opacity-60">·</span></span>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation list */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border overflow-hidden">
          <Row testid="m-prof-nav-wallet" icon={Wallet2} label={t("wallet.title")} sub={`${country?.currency_symbol || country?.currency || ""} 0.00 · ${t("wallet.coming_soon_title")}`} onClick={() => nav("/wallet")} tone="#1D9BF0" />
          <Row testid="m-prof-nav-activities" icon={ClipboardList} label={t("profile.activities")} sub="Orders, deliveries, property & vehicle inquiries" onClick={() => nav("/profile/activities")} tone="#A659FF" />
          <Row testid="m-prof-nav-addresses" icon={MapPin} label={t("profile.addresses")} sub={`${stats.addresses} saved`} onClick={() => nav("/profile/addresses")} tone="#77BC1F" />
          <Row testid="m-prof-nav-rewards" icon={Gift} label={t("profile.rewards")} sub={`${points} points`} onClick={() => nav("/profile/rewards")} tone="#FCC44C" />
          <Row testid="m-prof-nav-refer" icon={Users2} label={t("profile.refer")} sub="Invite friends, both earn rewards" onClick={() => nav("/profile/refer")} tone="#FF4C52" />
          <Row testid="m-prof-nav-help" icon={LifeBuoy} label={t("profile.help")} sub={stats.tickets_open ? `${stats.tickets_open} open tickets` : "24/7"} onClick={() => nav("/profile/help")} tone="#1D9BF0" />
          <Row testid="m-prof-nav-settings" icon={Settings2} label={t("profile.settings")} sub={`${t("profile.language")}, ${t("profile.notifications")}, ${t("profile.privacy")}`} onClick={() => nav("/profile/settings")} tone="#8b8b8b" />
        </div>
      </div>

      {/* Appearance toggle */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1D9BF022", color: "#1D9BF0" }}>{dark ? <Moon size={16} /> : <Sun size={16} />}</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">Dark Mode</div><div className="text-[11px] text-muted-foreground">Use dark theme across baked</div></div>
          <button data-testid="m-prof-dark-toggle" onClick={toggleTheme} role="switch" aria-checked={dark} className={`relative w-11 h-6 rounded-full motion-fast ${dark ? "bg-[#77BC1F]" : "bg-secondary"}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white motion-fast ${dark ? "translate-x-5" : ""}`} />
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 mt-4">
        <button data-testid="m-prof-logout" onClick={() => { logout(); nav("/"); }} className="w-full h-12 rounded-2xl border border-red-500/40 text-red-500 font-semibold flex items-center justify-center gap-2 motion-fast active:scale-[0.98]">
          <LogOut size={15} /> Log out
        </button>
        <div className="text-[10px] text-muted-foreground text-center mt-3">BAKĒD Platform v1.0 · {language.toUpperCase()} · {country?.code}</div>
      </div>
    </div>
  );
};
