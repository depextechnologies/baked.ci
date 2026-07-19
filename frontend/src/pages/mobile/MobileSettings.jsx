import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { Button } from "../../components/ui/button";
import { ArrowLeft, User as UserIcon, Phone, Mail, Bell, MessageCircle, Smartphone, Languages, DollarSign, Globe as GlobeIcon, Moon, Lock, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
  const nav = useNavigate();
  const { customer, refresh } = useAuth();
  const { country, language, setLanguage } = useApp();
  const [prefs, setPrefs] = useState(null);
  const [editing, setEditing] = useState(null); // "profile" | "phone" | "email"
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!customer) return;
    api.get("/customers/me/preferences").then((r) => setPrefs(r.data));
  }, [customer]);

  const setPref = async (k, v) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { await api.patch("/customers/me/preferences", { [k]: v }); } catch { toast.error("Failed to save"); }
  };

  const saveProfile = async () => {
    try {
      await api.patch("/customers/me", form);
      toast.success("Profile updated");
      setEditing(null);
      refresh?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const deleteAccount = async () => {
    const c = window.prompt("Type DELETE to permanently remove your account:");
    if (c !== "DELETE") return;
    try { await api.delete("/customers/me"); toast.success("Account deleted"); nav("/"); }
    catch { toast.error("Deletion failed"); }
  };

  if (!customer) return <div className="p-8 text-sm text-muted-foreground">Please sign in to access settings.</div>;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-set-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">Settings</div><div className="text-[11px] text-muted-foreground">Manage your preferences & account</div></div>
      </div>

      {/* Edit modal (inline card) */}
      {editing === "profile" && (
        <div className="px-4">
          <div className="baked-card bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-bold">Edit profile</div>
            <label className="block text-xs"><span className="text-muted-foreground">Name</span>
              <input data-testid="m-set-name" defaultValue={customer.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">Email</span>
              <input data-testid="m-set-email" type="email" defaultValue={customer.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => { setEditing(null); setForm({}); }} className="h-11">Cancel</Button>
              <Button data-testid="m-set-save-profile" onClick={saveProfile} className="baked-btn h-11 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <Section title="Account">
        <NavRow testid="m-set-nav-profile" icon={UserIcon} label="Edit profile" sub="Update your personal information" onClick={() => { setForm({ name: customer.name, email: customer.email }); setEditing("profile"); }} />
        <NavRow testid="m-set-nav-phone" icon={Phone} label="Phone number" value={customer.phone || "—"} onClick={() => toast("Phone changes require re-verification via OTP (coming soon)")} />
        <NavRow testid="m-set-nav-email" icon={Mail} label="Email address" value={customer.email || "Not set"} onClick={() => { setForm({ email: customer.email }); setEditing("profile"); }} />
      </Section>

      {prefs && (
        <>
          <Section title="Notifications">
            <ToggleRow testid="m-set-toggle-push" icon={Bell} label="Push notifications" sub="Receive notifications on your device" checked={!!prefs.push_notifications} onChange={(v) => setPref("push_notifications", v)} />
            <ToggleRow testid="m-set-toggle-email" icon={MessageCircle} label="Email notifications" sub="Order updates & receipts by email" checked={!!prefs.email_notifications} onChange={(v) => setPref("email_notifications", v)} />
            <ToggleRow testid="m-set-toggle-sms" icon={Smartphone} label="SMS notifications" sub="Delivery updates by SMS" checked={!!prefs.sms_notifications} onChange={(v) => setPref("sms_notifications", v)} />
          </Section>

          <Section title="App preferences">
            <NavRow testid="m-set-language" icon={Languages} label="Language" value={(prefs.language || language).toUpperCase()} onClick={() => { const next = language === "en" ? "fr" : "en"; setLanguage?.(next); setPref("language", next); }} />
            <NavRow testid="m-set-currency" icon={DollarSign} label="Currency" value={`${country?.currency_symbol || country?.currency}`} onClick={() => toast("Currency follows your region (auto)")} />
            <NavRow testid="m-set-region" icon={GlobeIcon} label="Region" value={country?.name || country?.code} onClick={() => toast("Change region from the country switcher in the header")} />
          </Section>

          <Section title="Appearance">
            <ToggleRow testid="m-set-toggle-dark" icon={Moon} label="Dark mode" sub="Use dark theme across baked" checked={!!prefs.dark_mode} onChange={(v) => {
              setPref("dark_mode", v);
              document.documentElement.classList.toggle("dark", v);
              document.documentElement.classList.toggle("light", !v);
            }} />
          </Section>

          <Section title="Privacy">
            <NavRow testid="m-set-privacy" icon={Lock} label="Data preferences" sub="Manage how we use your data" onClick={() => toast("Privacy centre coming soon")} />
            <NavRow testid="m-set-delete" icon={Trash2} label="Delete account" sub="Permanently delete your account" onClick={deleteAccount} danger />
          </Section>
        </>
      )}

      <div className="text-[10px] text-muted-foreground text-center mt-6">BAKĒD Platform v1.0 · Signed in as {customer.email || customer.phone}</div>
    </div>
  );
};
