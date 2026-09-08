import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { ArrowLeft, HelpCircle, Wallet2, Plus, ShoppingBag, Truck, Utensils, ShoppingCart as ShoppingIcon, Home as HomeIcon, Car, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { MODULES } from "../../lib/modules";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

const KIND_ICON = { mart: ShoppingIcon, food: Utensils, shop: ShoppingBag, express: Truck, auto: Car, immo: HomeIcon };
const KIND_TONE = { mart: "#77BC1F", food: "#FF7043", shop: "#1D9BF0", express: "#FCC44C", auto: "#A659FF", immo: "#FF4C52" };

export const MobileWallet = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const { customer } = useAuth();
  const [w, setW] = useState(null);

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/wallet").then((r) => setW(r.data)).catch(() => setW(null));
  }, [customer]);

  if (!customer) return <GuestSignInPrompt title="Sign in to view your wallet" message="Track your BAKĒD balance and transactions across every service." testid="m-wallet-signin" />;
  if (!w) return <div className="p-8 text-sm text-muted-foreground">Loading wallet…</div>;

  const soon = () => toast("Wallet operations launch soon — no action needed on your side.");

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-wallet-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("wallet.title")}</div><div className="text-[11px] text-muted-foreground">{t("wallet.transactions")}</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Wallet help"><HelpCircle size={16} /></button>
      </div>

      {/* Balance hero */}
      <div className="px-4">
        <div className="relative rounded-3xl overflow-hidden p-5" style={{ background: "linear-gradient(135deg, #0a1a3a 0%, #1a2b04 60%, #0a1200 100%)" }}>
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, #1D9BF055 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/70"><Wallet2 size={11} /> Available balance</div>
            <div className="text-4xl font-bold text-white mt-1.5">{formatMoney(w.balance, w.currency, w.currency_symbol)}</div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60"><ShieldCheck size={12} style={{ color: "#77BC1F" }} /> 100% Secure Wallet</div>
            <div className="mt-4 inline-flex items-center gap-1.5 baked-chip px-3 py-1 text-[10px] font-bold" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}><Sparkles size={11} /> WALLET COMING SOON</div>
          </div>
        </div>
      </div>

      {/* Quick action row */}
      <div className="px-4 mt-4 grid grid-cols-3 gap-2">
        {[
          { code: "top_up", icon: Plus, label: "Add Money", tone: "#77BC1F" },
          { code: "withdraw", icon: ArrowLeft, label: "Withdraw", tone: "#1D9BF0" },
          { code: "refunds", icon: HelpCircle, label: "Refunds", tone: "#FCC44C" },
        ].map((a) => { const Icon = a.icon; return (
          <button key={a.code} data-testid={`m-wallet-action-${a.code}`} disabled onClick={soon} className="baked-card bg-card border border-border p-3 text-center opacity-60 cursor-not-allowed">
            <div className="w-9 h-9 mx-auto rounded-2xl flex items-center justify-center mb-1" style={{ backgroundColor: `${a.tone}22`, color: a.tone }}><Icon size={15} /></div>
            <div className="text-[10px] font-bold">{a.label}</div>
            <div className="text-[9px] text-muted-foreground">Soon</div>
          </button>
        );})}
      </div>

      {/* Auto top-up */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Plus size={17} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Auto Top-Up</div>
            <div className="text-[11px] text-muted-foreground">Automatically add balance when it drops below a threshold</div>
          </div>
          <span className="baked-chip px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>SOON</span>
        </div>
      </div>

      {/* Transactions */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">Transaction history</div>
          {w.transactions.length > 0 && <button className="text-xs font-semibold" style={{ color: "#77BC1F" }}>View all</button>}
        </div>
        {w.transactions.length === 0 ? (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <Wallet2 size={30} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">{t("wallet.no_transactions")}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Once you place a paid order, it will show up here for your records.</div>
          </div>
        ) : (
          <div className="baked-card bg-card border border-border overflow-hidden">
            {w.transactions.slice(0, 10).map((t) => { const Icon = KIND_ICON[t.kind] || ShoppingIcon; const tone = KIND_TONE[t.kind] || "#77BC1F"; return (
              <button key={t.id} data-testid={`m-wallet-txn-${t.id}`} onClick={() => nav(`/orders/${t.order_id}`)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 text-left motion-fast active:bg-secondary/40">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}><Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">#{t.reference} · {new Date(t.at).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ color: "#FF7043" }}>{formatMoney(Math.abs(t.amount), t.currency, w.currency_symbol)}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">via {t.settled_via}</div>
                </div>
              </button>
            );})}
          </div>
        )}
        {w.transactions.length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground text-center">Paid orders shown for reference — they don&apos;t affect your wallet balance while the wallet is in preview.</div>
        )}
      </div>

      {/* Ecosystem strip */}
      <div className="px-4 mt-5">
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-sm font-bold">Use wallet across baked</div>
          <div className="text-[11px] text-muted-foreground mt-1">One wallet for the entire baked ecosystem.</div>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {MODULES.map((m) => (
              <div key={m.code} className="text-center">
                <div className="w-9 h-9 mx-auto rounded-xl flex items-center justify-center" style={{ backgroundColor: `${m.color}22`, color: m.color }}><m.icon size={14} /></div>
                <div className="text-[9px] font-bold mt-1" style={{ color: m.color }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust */}
      <div className="px-4 mt-4">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <ShieldCheck size={18} style={{ color: "#77BC1F" }} />
          <div><div className="text-sm font-bold">Safe. Secure. Always.</div><div className="text-[11px] text-muted-foreground">Your money is protected with secure transactions.</div></div>
        </div>
      </div>
    </div>
  );
};
