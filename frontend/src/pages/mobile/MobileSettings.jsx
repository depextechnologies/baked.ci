import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useLocalePath } from "../../i18n/routes";
import { Button } from "../../components/ui/button";
import { ArrowLeft, User as UserIcon, Phone, Mail, Bell, MessageCircle, Smartphone, Languages, DollarSign, Globe as GlobeIcon, Moon, Lock, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

const Section = ({ title, children }) => (
  <section className="mt-4">
    <div className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
    <div className="mx-4 baked-card bg-card border border-border overflow-hidden">{children}</div>
  </section>
);

const NavRow = ({ icon: Icon, label, sub, value, onClick, testid, danger }) => (
  <button data-testid={testid} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 text-left motion-fast active:bg-secondary/40">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: danger ? "#FF4C5222" : "#77BC1F22", color: danger ? "#FF4C52" : "#77BC1F" }}><Icon size={15} /></div>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-semibold ${danger ? "text-red-500" : ""}`}>{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
    {value && <div className="text-xs text-muted-foreground shrink-0">{value}</div>}
    <ChevronRight size={13} className="text-muted-foreground" />
  </button>
);

const ToggleRow = ({ icon: Icon, label, sub, checked, onChange, testid }) => (
  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#1D9BF022", color: "#1D9BF0" }}><Icon size={15} /></div>
    <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{label}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>
    <button data-testid={testid} onClick={() => onChange(!checked)} role="switch" aria-checked={checked} className={`relative w-11 h-6 rounded-full motion-fast ${checked ? "bg-[#77BC1F]" : "bg-secondary"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white motion-fast ${checked ? "translate-x-5" : ""}`} />
    </button>
  </div>
);

export const MobileSettings = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const { customer, refresh } = useAuth();
  const { country, language, setLanguage } = useApp();
  const [prefs, setPrefs] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/preferences").then((r) => setPrefs(r.data));
  }, [customer]);

  const setPref = async (k, v) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { await api.patch("/customers/me/preferences", { [k]: v }); } catch { toast.error(t("settings.save_failed")); }
  };

  const saveProfile = async () => {
    try {
      await api.patch("/customers/me", form);
      toast.success(t("settings.save_success"));
      setEditing(null);
      refresh?.();
    } catch (e) { toast.error(e?.response?.data?.detail || t("settings.save_failed")); }
  };

  const deleteAccount = async () => {
    const c = window.prompt(t("settings.delete_confirm_prompt"));
    if (c !== t("settings.delete_confirm_word") && c !== "DELETE") return;
    try { await api.delete("/customers/me"); toast.success(t("settings.delete_success")); nav("/"); }
    catch { toast.error(t("settings.delete_failed")); }
  };

  if (!customer) return <GuestSignInPrompt title={t("settings.signin_title")} message={t("settings.signin_body")} testid="m-settings-signin" />;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-set-back" onClick={() => nav(path("profile"))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("settings.title")}</div><div className="text-[11px] text-muted-foreground">{t("settings.subtitle")}</div></div>
      </div>

      {editing === "profile" && (
        <div className="px-4">
          <div className="baked-card bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-bold">{t("settings.edit_profile")}</div>
            <label className="block text-xs"><span className="text-muted-foreground">{t("settings.field_name")}</span>
              <input data-testid="m-set-name" defaultValue={customer.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">{t("settings.field_email")}</span>
              <input data-testid="m-set-email" type="email" defaultValue={customer.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => { setEditing(null); setForm({}); }} className="h-11">{t("settings.cancel")}</Button>
              <Button data-testid="m-set-save-profile" onClick={saveProfile} className="baked-btn h-11 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>{t("settings.save")}</Button>
            </div>
          </div>
        </div>
      )}

      <Section title={t("settings.section_account")}>
        <NavRow testid="m-set-nav-profile" icon={UserIcon} label={t("settings.edit_profile")} sub={t("settings.edit_profile_sub")} onClick={() => { setForm({ name: customer.name, email: customer.email }); setEditing("profile"); }} />
        <NavRow testid="m-set-nav-phone" icon={Phone} label={t("settings.phone_label")} value={customer.phone || "—"} onClick={() => toast(t("settings.phone_change_toast"))} />
        <NavRow testid="m-set-nav-email" icon={Mail} label={t("settings.field_email")} value={customer.email || t("settings.field_email_not_set")} onClick={() => { setForm({ email: customer.email }); setEditing("profile"); }} />
      </Section>

      {prefs && (
        <>
          <Section title={t("settings.section_notifications")}>
            <ToggleRow testid="m-set-toggle-push" icon={Bell} label={t("settings.push_label")} sub={t("settings.push_sub")} checked={!!prefs.push_notifications} onChange={(v) => setPref("push_notifications", v)} />
            <ToggleRow testid="m-set-toggle-email" icon={MessageCircle} label={t("settings.email_label")} sub={t("settings.email_sub")} checked={!!prefs.email_notifications} onChange={(v) => setPref("email_notifications", v)} />
            <ToggleRow testid="m-set-toggle-sms" icon={Smartphone} label={t("settings.sms_label")} sub={t("settings.sms_sub")} checked={!!prefs.sms_notifications} onChange={(v) => setPref("sms_notifications", v)} />
          </Section>

          <Section title={t("settings.section_app")}>
            <NavRow testid="m-set-language" icon={Languages} label={t("settings.language")} value={(prefs.language || language).toUpperCase()} onClick={() => { const next = language === "en" ? "fr" : "en"; setLanguage?.(next); setPref("language", next); }} />
            <NavRow testid="m-set-currency" icon={DollarSign} label={t("settings.currency")} value={`${country?.currency_symbol || country?.currency}`} onClick={() => toast(t("settings.currency_toast"))} />
            <NavRow testid="m-set-region" icon={GlobeIcon} label={t("settings.region")} value={country?.name || country?.code} onClick={() => toast(t("settings.region_toast"))} />
          </Section>

          <Section title={t("settings.section_appearance")}>
            <ToggleRow testid="m-set-toggle-dark" icon={Moon} label={t("settings.dark_mode")} sub={t("settings.dark_mode_sub")} checked={!!prefs.dark_mode} onChange={(v) => {
              setPref("dark_mode", v);
              document.documentElement.classList.toggle("dark", v);
              document.documentElement.classList.toggle("light", !v);
            }} />
          </Section>

          <Section title={t("settings.section_privacy")}>
            <NavRow testid="m-set-privacy" icon={Lock} label={t("settings.data_prefs")} sub={t("settings.data_prefs_sub")} onClick={() => toast(t("settings.data_prefs_toast"))} />
            <NavRow testid="m-set-delete" icon={Trash2} label={t("settings.delete_account")} sub={t("settings.delete_account_sub")} onClick={deleteAccount} danger />
          </Section>
        </>
      )}

      <div className="text-[10px] text-muted-foreground text-center mt-6">{t("settings.footer_version", { who: customer.email || customer.phone })}</div>
    </div>
  );
};
