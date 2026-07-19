import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { Button } from "../../components/ui/button";
import { ArrowLeft, MapPin, Plus, Trash2, Edit3, Home, Building2, Warehouse, Users2, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { MODULES } from "../../lib/modules";

const LABELS = [
  { code: "Home", icon: Home },
  { code: "Office", icon: Building2 },
  { code: "Warehouse", icon: Warehouse },
  { code: "Family", icon: Users2 },
  { code: "Other", icon: MapPin },
];

const emptyAddr = { label: "Home", line1: "", line2: "", city: "", country: "CI", instructions: "", is_default: false };

export const MobileAddresses = () => {
  const nav = useNavigate();
  const { country } = useApp();
  const { customer } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { try { const { data } = await api.get("/customers/me/addresses"); setItems(data); } catch { toast.error("Failed to load addresses"); } };
  useEffect(() => { if (customer) load(); }, [customer]);

  const save = async () => {
    if (!editing.line1?.trim()) return toast.error("Please enter a street address");
    try {
      if (editing.id) await api.patch(`/customers/me/addresses/${editing.id}`, editing);
      else await api.post("/customers/me/addresses", { ...editing, country: editing.country || country?.code || "CI" });
      toast.success("Address saved");
      setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    try { await api.delete(`/customers/me/addresses/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const setDefault = async (a) => {
    try { await api.patch(`/customers/me/addresses/${a.id}`, { ...a, is_default: true }); toast.success("Default address updated"); load(); }
    catch { toast.error("Failed"); }
  };

  if (!customer) return <div className="p-8 text-sm text-muted-foreground">Please sign in to manage addresses.</div>;

  const iconFor = (label) => (LABELS.find((l) => l.code === label) || LABELS[4]).icon;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-addr-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">Addresses</div><div className="text-[11px] text-muted-foreground">Manage your saved locations</div></div>
      </div>

      {/* Add new */}
      {!editing && (
        <div className="px-4">
          <button data-testid="m-addr-add" onClick={() => setEditing({ ...emptyAddr, city: country?.code === "CI" ? "Abidjan" : "London", country: country?.code || "CI" })} className="w-full baked-card border-2 border-dashed border-border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.99] hover:border-[#77BC1F]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Plus size={20} /></div>
            <div><div className="text-sm font-bold">Add new address</div><div className="text-[11px] text-muted-foreground">Save locations for faster checkout and bookings</div></div>
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 space-y-3">
          <div className="baked-card bg-card border border-border p-4 space-y-3">
            <div className="text-sm font-bold">{editing.id ? "Edit address" : "New address"}</div>
            {/* Label selector */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {LABELS.map((l) => { const Icon = l.icon; const isAct = editing.label === l.code; return (
                <button key={l.code} data-testid={`m-addr-label-${l.code}`} onClick={() => setEditing({ ...editing, label: l.code })} className={`shrink-0 flex items-center gap-1.5 px-3 h-9 baked-chip text-xs font-semibold motion-fast ${isAct ? "text-black" : "bg-secondary text-muted-foreground"}`} style={isAct ? { backgroundColor: "#77BC1F" } : {}}>
                  <Icon size={13} /> {l.code}
                </button>
              );})}
            </div>
            <label className="block text-xs"><span className="text-muted-foreground">Street & building *</span>
              <input data-testid="m-addr-line1" value={editing.line1} onChange={(e) => setEditing({ ...editing, line1: e.target.value })} placeholder="e.g. 12 Rue des Jardins" className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <label className="block text-xs"><span className="text-muted-foreground">Apartment / floor (optional)</span>
              <input data-testid="m-addr-line2" value={editing.line2 || ""} onChange={(e) => setEditing({ ...editing, line2: e.target.value })} placeholder="Apt 3B" className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs"><span className="text-muted-foreground">City</span>
                <input data-testid="m-addr-city" value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
              <label className="text-xs"><span className="text-muted-foreground">Country (ISO)</span>
                <input data-testid="m-addr-country" value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value.toUpperCase() })} className="baked-input w-full bg-secondary px-3 py-2.5 mt-1" /></label>
            </div>
            <label className="block text-xs"><span className="text-muted-foreground">Delivery instructions</span>
              <textarea data-testid="m-addr-instructions" value={editing.instructions || ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} rows={2} placeholder="Ring the bell twice, leave at reception…" className="baked-input w-full bg-secondary px-3 py-2 mt-1 text-xs" /></label>
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="m-addr-default" type="checkbox" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} className="accent-[#77BC1F] w-4 h-4" />
              <span>Set as default address</span>
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="ghost" onClick={() => setEditing(null)} className="h-11">Cancel</Button>
              <Button data-testid="m-addr-save" onClick={save} className="baked-btn h-11 font-bold text-black" style={{ backgroundColor: "#77BC1F" }}><Check size={14} className="mr-1" /> Save address</Button>
            </div>
          </div>
        </div>
      )}

      {/* Saved list */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold">{items.length} Saved {items.length === 1 ? "address" : "addresses"}</div>
          <div className="text-[10px] text-muted-foreground">Used across all baked services</div>
        </div>
        {items.length === 0 && !editing && (
          <div className="baked-card bg-card border border-border p-8 text-center">
            <MapPin size={32} className="mx-auto text-muted-foreground mb-2" />
            <div className="text-sm font-semibold">No saved addresses yet</div>
            <div className="text-xs text-muted-foreground mt-1">Add your first location to check out faster.</div>
          </div>
        )}
        <div className="space-y-2.5">
          {items.map((a) => { const Icon = iconFor(a.label); return (
            <div key={a.id} data-testid={`m-addr-item-${a.id}`} className="baked-card bg-card border border-border p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={16} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold">{a.label}</div>
                    {a.is_default && <span className="baked-chip px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>DEFAULT</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.country}</div>
                  {a.instructions && <div className="text-[10px] text-muted-foreground mt-1">📝 {a.instructions}</div>}
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-border">
                <button data-testid={`m-addr-edit-${a.id}`} onClick={() => setEditing(a)} className="flex-1 text-xs font-semibold flex items-center justify-center gap-1 h-8 rounded-lg bg-secondary/60 hover:bg-secondary motion-fast"><Edit3 size={11} /> Edit</button>
                {!a.is_default && <button data-testid={`m-addr-default-${a.id}`} onClick={() => setDefault(a)} className="flex-1 text-xs font-semibold flex items-center justify-center gap-1 h-8 rounded-lg bg-secondary/60 hover:bg-secondary motion-fast"><Star size={11} /> Set default</button>}
                <button data-testid={`m-addr-del-${a.id}`} onClick={() => del(a.id)} className="flex-1 text-xs font-semibold flex items-center justify-center gap-1 h-8 rounded-lg text-red-500 bg-red-500/10 hover:bg-red-500/20 motion-fast"><Trash2 size={11} /> Delete</button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {/* Ecosystem strip */}
      <div className="px-4 mt-6">
        <div className="baked-card bg-card border border-border p-4">
          <div className="text-sm font-bold">One address book. Every baked service.</div>
          <div className="text-[11px] text-muted-foreground mt-1">Use the same saved locations for deliveries, food orders, groceries, property inquiries, vehicle inquiries and more.</div>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {MODULES.map((m) => <span key={m.code} className="text-[10px] font-bold" style={{ color: m.color }}>{m.label}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
};
