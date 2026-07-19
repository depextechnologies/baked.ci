import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { Button } from "../../components/ui/button";
import { ArrowLeft, MessageSquare, Phone, Mail, HelpCircle, Send, Plus, ShoppingBag, Truck, Wallet2, CreditCard, Home as HomeIcon, Car, User as UserIcon, MoreHorizontal, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { code: "order", label: "Order Issue", icon: ShoppingBag, tone: "#77BC1F", desc: "Wrong item, missing, quality" },
  { code: "delivery", label: "Delivery Issue", icon: Truck, tone: "#1D9BF0", desc: "Late, driver issue, damaged" },
  { code: "wallet", label: "Wallet Issue", icon: Wallet2, tone: "#FCC44C", desc: "Balance, transactions, top-up" },
  { code: "payment", label: "Payment Issue", icon: CreditCard, tone: "#A659FF", desc: "Failed, refund, charged twice" },
  { code: "property", label: "Property Inquiry", icon: HomeIcon, tone: "#FF4C52", desc: "IMMObakēd support" },
  { code: "vehicle", label: "Vehicle Inquiry", icon: Car, tone: "#5da116", desc: "AUTObakēd support" },
  { code: "account", label: "Account Issue", icon: UserIcon, tone: "#8b8b8b", desc: "Login, verification, personal info" },
  { code: "other", label: "Other", icon: MoreHorizontal, tone: "#8b8b8b", desc: "Something else" },
];

const STATUS_STYLE = {
  open:        { color: "#FCC44C", bg: "#FCC44C22", label: "Open" },
  in_progress: { color: "#1D9BF0", bg: "#1D9BF022", label: "In progress" },
  resolved:    { color: "#77BC1F", bg: "#77BC1F22", label: "Resolved" },
  closed:      { color: "#8b8b8b", bg: "#8b8b8b22", label: "Closed" },
};

export const MobileHelpSupport = () => {
  const nav = useNavigate();
  const { customer } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "order", subject: "", description: "", priority: "normal" });

  const load = async () => {
    try {
      const { data } = await api.get("/customers/me/tickets");
      setTickets(data.tickets);
      setCounts(data.counts);
    } catch (e) { void e; }
  };
  useEffect(() => { if (customer) load(); }, [customer]);

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim()) return toast.error("Subject and description are required");
    try {
      await api.post("/customers/me/tickets", form);
      toast.success("Ticket submitted — we'll get back to you shortly");
      setCreating(false);
      setForm({ category: "order", subject: "", description: "", priority: "normal" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to submit"); }
  };

  if (!customer) return <div className="p-8 text-sm text-muted-foreground">Please sign in to open a support ticket.</div>;

  const supportEmail = "support@baked.app";
  const supportPhone = "+225 27 00 00 00 00";

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-help-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">Help & Support</div><div className="text-[11px] text-muted-foreground">We&apos;re here to help you, always</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Info"><HelpCircle size={16} /></button>
      </div>

      {/* Quick actions */}
      <div className="px-4">
        <div className="text-sm font-bold mb-2">Quick actions</div>
        <div className="grid grid-cols-3 gap-2">
          <button data-testid="m-help-chat" onClick={() => toast("Live chat launches soon — please open a ticket meanwhile")} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><MessageSquare size={17} /></div>
            <div className="text-[11px] font-bold">Live Chat</div>
            <div className="text-[9px] text-muted-foreground">Soon</div>
          </button>
          <a data-testid="m-help-call" href={`tel:${supportPhone}`} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95 block">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#1D9BF022", color: "#1D9BF0" }}><Phone size={17} /></div>
            <div className="text-[11px] font-bold">Call Support</div>
            <div className="text-[9px] text-muted-foreground">24 / 7</div>
          </a>
          <a data-testid="m-help-email" href={`mailto:${supportEmail}`} className="baked-card bg-card border border-border p-3 text-center motion-fast active:scale-95 block">
            <div className="w-10 h-10 mx-auto rounded-2xl flex items-center justify-center mb-1.5" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Mail size={17} /></div>
            <div className="text-[11px] font-bold">Email Us</div>
            <div className="text-[9px] text-muted-foreground">1 day reply</div>
          </a>
        </div>
      </div>

      {/* File a new ticket */}
      {!creating && (
        <div className="px-4 mt-4">
          <Button data-testid="m-help-new" onClick={() => setCreating(true)} className="w-full h-12 baked-btn font-bold text-black" style={{ backgroundColor: "#77BC1F" }}>
            <Plus size={16} className="mr-1.5" /> Open a new ticket
          </Button>
        </div>
      )}

      {/* New ticket form */}
      {creating && (
        <div className="px-4 mt-4">
          <div className="baked-card bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-bold">Open a new ticket</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => { const Icon = c.icon; const isAct = form.category === c.code; return (
                <button key={c.code} data-testid={`m-help-cat-${c.code}`} onClick={() => setForm({ ...form, category: c.code })} className={`baked-card border p-2.5 text-left flex items-center gap-2 motion-fast ${isAct ? "" : "border-border"}`} style={isAct ? { borderColor: c.tone, backgroundColor: `${c.tone}14` } : {}}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.tone}22`, color: c.tone }}><Icon size={13} /></div>
                  <div className="min-w-0"><div className="text-[11px] font-bold truncate">{c.label}</div><div className="text-[9px] text-muted-foreground truncate">{c.desc}</div></div>
                </button>
              );})}
            </div>
            <label className="block text-xs"><span className="text-muted-foreground">Subject</span>
              <input data-testid="m-help-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={120} placeholder="Short summary" className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">Description</span>
              <textarea data-testid="m-help-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Tell us what happened, including order numbers or dates if available" className="baked-input w-full bg-secondary p-3 mt-1 text-xs" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">Priority</span>
              <select data-testid="m-help-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1">
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="ghost" onClick={() => setCreating(false)} className="h-11">Cancel</Button>
              <Button data-testid="m-help-submit" onClick={submit} className="baked-btn h-11 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}><Send size={13} className="mr-1.5" /> Submit</Button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket counters */}
      <div className="px-4 mt-4">
        <div className="text-sm font-bold mb-2">Your support tickets</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { code: "open", label: "Open" },
            { code: "in_progress", label: "In progress" },
            { code: "resolved", label: "Resolved" },
          ].map((s) => { const st = STATUS_STYLE[s.code]; return (
            <div key={s.code} className="baked-card bg-card border border-border p-3 text-center">
              <div className="text-2xl font-bold" style={{ color: st.color }}>{counts[s.code] || 0}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          );})}
        </div>
      </div>

      {/* Tickets list */}
      <div className="px-4 mt-4">
        {tickets.length === 0 ? (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <Sparkles size={32} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">No tickets yet</div>
            <div className="text-xs text-muted-foreground mt-1">When you open a ticket it will appear here.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => { const cat = CATEGORIES.find((c) => c.code === t.category) || CATEGORIES[7]; const Icon = cat.icon; const st = STATUS_STYLE[t.status] || STATUS_STYLE.open; return (
              <div key={t.id} data-testid={`m-help-ticket-${t.id}`} className="baked-card bg-card border border-border p-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cat.tone}22`, color: cat.tone }}><Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold truncate">{t.subject}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">{t.number}</span>
                    <span className="baked-chip px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground mt-1" />
              </div>
            );})}
          </div>
        )}
      </div>

      {/* Trust */}
      <div className="px-4 mt-6">
        <div className="baked-card bg-card border border-border p-4 flex items-center gap-3">
          <ShieldCheck size={18} style={{ color: "#77BC1F" }} />
          <div>
            <div className="text-sm font-bold">Still need help?</div>
            <div className="text-[11px] text-muted-foreground">Our support team is available 24/7 across every baked service.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
