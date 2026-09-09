import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { useLocalePath } from "../../i18n/routes";
import { Button } from "../../components/ui/button";
import { ArrowLeft, MessageSquare, Phone, Mail, HelpCircle, Send, Plus, ShoppingBag, Truck, Wallet2, CreditCard, Home as HomeIcon, Car, User as UserIcon, MoreHorizontal, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

export const MobileHelpSupport = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const { customer } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "order", subject: "", description: "", priority: "normal" });

  const CATEGORIES = [
    { code: "order", label: t("help.cat_order"), icon: ShoppingBag, tone: "#77BC1F", desc: t("help.cat_order_desc") },
    { code: "delivery", label: t("help.cat_delivery"), icon: Truck, tone: "#1D9BF0", desc: t("help.cat_delivery_desc") },
    { code: "wallet", label: t("help.cat_wallet"), icon: Wallet2, tone: "#FCC44C", desc: t("help.cat_wallet_desc") },
    { code: "payment", label: t("help.cat_payment"), icon: CreditCard, tone: "#A659FF", desc: t("help.cat_payment_desc") },
    { code: "property", label: t("help.cat_property"), icon: HomeIcon, tone: "#FF4C52", desc: t("help.cat_property_desc") },
    { code: "vehicle", label: t("help.cat_vehicle"), icon: Car, tone: "#5da116", desc: t("help.cat_vehicle_desc") },
    { code: "account", label: t("help.cat_account"), icon: UserIcon, tone: "#8b8b8b", desc: t("help.cat_account_desc") },
    { code: "other", label: t("help.cat_other"), icon: MoreHorizontal, tone: "#8b8b8b", desc: t("help.cat_other_desc") },
  ];
  const STATUS_STYLE = {
    open:        { color: "#FCC44C", bg: "#FCC44C22", label: t("help.status_open") },
    in_progress: { color: "#1D9BF0", bg: "#1D9BF022", label: t("help.status_in_progress") },
    resolved:    { color: "#77BC1F", bg: "#77BC1F22", label: t("help.status_resolved") },
    closed:      { color: "#8b8b8b", bg: "#8b8b8b22", label: t("help.status_closed") },
  };

  const load = async () => {
    try {
      const { data } = await api.get("/customers/me/tickets");
      setTickets(data.tickets);
      setCounts(data.counts);
    } catch (e) { void e; }
  };
  useEffect(() => { if (customer) load(); }, [customer]);

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim()) return toast.error(t("help.submit_error_required"));
    try {
      await api.post("/customers/me/tickets", form);
      toast.success(t("help.submit_success"));
      setCreating(false);
      setForm({ category: "order", subject: "", description: "", priority: "normal" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("help.submit_failed")); }
  };

  if (!customer) return <GuestSignInPrompt title={t("help.signin_title")} message={t("help.signin_body")} testid="m-help-signin" />;

  const supportEmail = "support@baked.app";
  const supportPhone = "+225 27 00 00 00 00";

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-help-back" onClick={() => nav(path("profile"))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("help.title")}</div><div className="text-[11px] text-muted-foreground">{t("help.subtitle")}</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label={t("help.info_aria")}><HelpCircle size={16} /></button>
      </div>

      <div className="px-4">
        <div className="text-sm font-bold mb-2">{t("help.quick_actions")}</div>
        <div className="grid grid-cols-3 gap-2">
          <button data-testid="m-help-chat" onClick={() => toast(t("help.live_chat_toast"))} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><MessageSquare size={17} /></div>
            <div className="text-[11px] font-bold">{t("help.live_chat")}</div>
            <div className="text-[9px] text-muted-foreground">{t("help.live_chat_soon")}</div>
          </button>
          <a data-testid="m-help-call" href={`tel:${supportPhone}`} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95 block">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#1D9BF022", color: "#1D9BF0" }}><Phone size={17} /></div>
            <div className="text-[11px] font-bold">{t("help.call_support")}</div>
            <div className="text-[9px] text-muted-foreground">{t("help.call_avail")}</div>
          </a>
          <a data-testid="m-help-email" href={`mailto:${supportEmail}`} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95 block">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Mail size={17} /></div>
            <div className="text-[11px] font-bold">{t("help.email_us")}</div>
            <div className="text-[9px] text-muted-foreground">{t("help.email_reply")}</div>
          </a>
        </div>
      </div>

      {!creating && (
        <div className="px-4 mt-4">
          <Button data-testid="m-help-new" onClick={() => setCreating(true)} className="w-full h-12 baked-btn font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            <Plus size={16} className="mr-1.5" /> {t("help.open_ticket")}
          </Button>
        </div>
      )}

      {creating && (
        <div className="px-4 mt-4">
          <div className="baked-card bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-bold">{t("help.new_ticket_title")}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("help.category")}</div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => { const Icon = c.icon; const isAct = form.category === c.code; return (
                <button key={c.code} data-testid={`m-help-cat-${c.code}`} onClick={() => setForm({ ...form, category: c.code })} className={`baked-card border p-2.5 text-left flex items-center gap-2 motion-fast ${isAct ? "" : "border-border"}`} style={isAct ? { borderColor: c.tone, backgroundColor: `${c.tone}14` } : {}}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.tone}22`, color: c.tone }}><Icon size={13} /></div>
                  <div className="min-w-0"><div className="text-[11px] font-bold truncate">{c.label}</div><div className="text-[9px] text-muted-foreground truncate">{c.desc}</div></div>
                </button>
              );})}
            </div>
            <label className="block text-xs"><span className="text-muted-foreground">{t("help.field_subject")}</span>
              <input data-testid="m-help-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={120} placeholder={t("help.field_subject_placeholder")} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">{t("help.field_description")}</span>
              <textarea data-testid="m-help-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder={t("help.field_description_placeholder")} className="baked-input w-full bg-secondary p-3 mt-1 text-xs" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">{t("help.field_priority")}</span>
              <select data-testid="m-help-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1">
                <option value="low">{t("help.priority_low")}</option>
                <option value="normal">{t("help.priority_normal")}</option>
                <option value="high">{t("help.priority_high")}</option>
                <option value="urgent">{t("help.priority_urgent")}</option>
              </select></label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="ghost" onClick={() => setCreating(false)} className="h-11">{t("help.cancel")}</Button>
              <Button data-testid="m-help-submit" onClick={submit} className="baked-btn h-11 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}><Send size={13} className="mr-1.5" /> {t("help.submit")}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="text-sm font-bold mb-2">{t("help.counters_title")}</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { code: "open", label: t("help.status_open") },
            { code: "in_progress", label: t("help.status_in_progress") },
            { code: "resolved", label: t("help.status_resolved") },
          ].map((s) => { const st = STATUS_STYLE[s.code]; return (
            <div key={s.code} className="baked-card bg-card border border-border p-3 text-center">
              <div className="text-2xl font-bold" style={{ color: st.color }}>{counts[s.code] || 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          );})}
        </div>
      </div>

      <div className="px-4 mt-4">
        {tickets.length === 0 ? (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <Sparkles size={32} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">{t("help.empty_title")}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("help.empty_body")}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((tk) => { const cat = CATEGORIES.find((c) => c.code === tk.category) || CATEGORIES[7]; const Icon = cat.icon; const st = STATUS_STYLE[tk.status] || STATUS_STYLE.open; return (
              <div key={tk.id} data-testid={`m-help-ticket-${tk.id}`} className="baked-card bg-card border border-border p-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cat.tone}22`, color: cat.tone }}><Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><div className="text-sm font-bold truncate">{tk.subject}</div></div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">{tk.number}</span>
                    <span className="baked-chip px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{tk.description}</div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground mt-1" />
              </div>
            );})}
          </div>
        )}
      </div>

      <div className="px-4 mt-6">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <ShieldCheck size={18} style={{ color: "#77BC1F" }} />
          <div>
            <div className="text-sm font-bold">{t("help.still_need_help_title")}</div>
            <div className="text-[11px] text-muted-foreground">{t("help.still_need_help_body")}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
