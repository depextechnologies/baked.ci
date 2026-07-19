import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth, useApp } from "../../contexts/BakedContexts";
import { formatMoney } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Search, Truck, ShoppingBag, Home as HomeIcon, Car, ShieldCheck, ChevronRight, Sparkles, Package, Utensils, ShoppingCart } from "lucide-react";

const TABS = [
  { code: "deliveries", label: "Deliveries", icon: Truck },
  { code: "orders", label: "Orders", icon: ShoppingBag },
  { code: "property", label: "Property", icon: HomeIcon },
  { code: "vehicle", label: "Vehicle", icon: Car },
];

const MODULE_LOGO = { mart: ShoppingCart, food: Utensils, shop: ShoppingBag, express: Truck };
const MODULE_TONE = { mart: "#77BC1F", food: "#FF7043", shop: "#1D9BF0", express: "#FCC44C" };

export const MobileActivities = () => {
  const nav = useNavigate();
  const { customer } = useAuth();
  const { country } = useApp();
  const [tab, setTab] = useState("deliveries");
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");
  const [moduleFilter, setModuleFilter] = useState("all");

  useEffect(() => {
    if (!customer) return;
    api.get("/orders/me").then((r) => setOrders(r.data || [])).catch(() => setOrders([]));
  }, [customer]);

  const deliveries = useMemo(() => {
    let arr = orders;
    if (filter === "active") arr = arr.filter((o) => ["confirmed", "preparing", "picked_up", "on_the_way"].includes(o.status));
    if (filter === "completed") arr = arr.filter((o) => o.status === "delivered");
    if (filter === "cancelled") arr = arr.filter((o) => o.status === "cancelled");
    return arr;
  }, [orders, filter]);

  const filteredOrders = useMemo(() => {
    if (moduleFilter === "all") return orders;
    return orders.filter((o) => o.module === moduleFilter);
  }, [orders, moduleFilter]);

  const counts = useMemo(() => ({
    active: orders.filter((o) => ["confirmed", "preparing", "picked_up", "on_the_way"].includes(o.status)).length,
    completed: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  }), [orders]);

  if (!customer) return <div className="min-h-[70vh] flex items-center justify-center text-sm text-muted-foreground">Please sign in to view your activities.</div>;

  const ccy = country?.currency_symbol || country?.currency;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-act-back" onClick={() => nav("/profile")} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">Activities</div><div className="text-[11px] text-muted-foreground">All your baked activities in one place</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Search"><Search size={16} /></button>
      </div>

      {/* Top tabs */}
      <div className="px-4 border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mb-px">
          {TABS.map((tp) => { const Icon = tp.icon; const isAct = tab === tp.code; return (
            <button key={tp.code} data-testid={`m-act-tab-${tp.code}`} onClick={() => setTab(tp.code)} className="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap motion-fast border-b-2" style={isAct ? { borderColor: "#77BC1F", color: "#77BC1F" } : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }}>
              <Icon size={13} /> {tp.label}
            </button>
          );})}
        </div>
      </div>

      {/* Deliveries */}
      {tab === "deliveries" && (
        <div className="pt-3">
          <div className="px-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[["active", "Active", counts.active], ["completed", "Completed", counts.completed], ["cancelled", "Cancelled", counts.cancelled]].map(([code, label, count]) => { const isAct = filter === code; return (
              <button key={code} data-testid={`m-act-filter-${code}`} onClick={() => setFilter(code)} className={`shrink-0 baked-chip px-3 py-1.5 text-[11px] font-bold motion-fast ${isAct ? "text-black" : "bg-secondary text-muted-foreground"}`} style={isAct ? { backgroundColor: "#77BC1F" } : {}}>
                {label} <span className="opacity-70">· {count}</span>
              </button>
            );})}
          </div>

          {/* Real-time tracking banner */}
          {counts.active > 0 && (
            <div className="px-4 mt-3">
              <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#77BC1F55", background: "linear-gradient(135deg, #77BC1F22 0%, hsl(var(--card)) 60%)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}><Truck size={19} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">Real-time tracking</div>
                    <div className="text-[11px] text-muted-foreground">Follow your active deliveries live</div>
                  </div>
                  <Button data-testid="m-act-track-now" size="sm" onClick={() => { const first = orders.find((o) => ["confirmed", "preparing", "picked_up", "on_the_way"].includes(o.status)); if (first) nav(`/orders/${first.id}/track`); }} className="baked-btn font-bold text-black h-9" style={{ backgroundColor: "#77BC1F" }}>Track now</Button>
                </div>
              </div>
            </div>
          )}

          {/* Delivery list */}
          <div className="px-4 mt-3 space-y-2.5">
            {deliveries.length === 0 ? (
              <div className="baked-card bg-card border border-border p-8 text-center">
                <Package size={30} className="mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-semibold">No {filter} deliveries</div>
                <div className="text-[11px] text-muted-foreground mt-1">Place an order and it will appear here.</div>
              </div>
            ) : deliveries.map((o) => (
              <button key={o.id} data-testid={`m-act-del-${o.id}`} onClick={() => nav(`/orders/${o.id}/track`)} className="w-full baked-card bg-card border border-border p-3.5 text-left motion-fast active:scale-[0.99]">
                <div className="flex items-center justify-between">
                  <div className="baked-chip px-2 py-0.5 text-[9px] font-bold uppercase" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>{o.status.replace(/_/g, " ")}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{o.number}</div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${MODULE_TONE[o.module] || "#77BC1F"}22`, color: MODULE_TONE[o.module] || "#77BC1F" }}>{(() => { const M = MODULE_LOGO[o.module] || ShoppingCart; return <M size={16} />; })()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{(o.items || []).length} items · {(o.module || "mart").toUpperCase()}bakēd</div>
                    <div className="text-[10px] text-muted-foreground truncate">Drop: {o.address?.line1 || "—"}, {o.address?.city || ""}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="text-sm font-bold">{formatMoney(o.total, o.currency, ccy)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      {tab === "orders" && (
        <div className="pt-3">
          <div className="px-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {["all", "food", "mart", "shop"].map((m) => { const isAct = moduleFilter === m; return (
              <button key={m} data-testid={`m-act-modf-${m}`} onClick={() => setModuleFilter(m)} className={`shrink-0 baked-chip px-3 py-1.5 text-[11px] font-bold uppercase motion-fast ${isAct ? "text-black" : "bg-secondary text-muted-foreground"}`} style={isAct ? { backgroundColor: "#77BC1F" } : {}}>
                {m}
              </button>
            );})}
          </div>

          <div className="px-4 mt-3">
            <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#77BC1F55", background: "linear-gradient(135deg, #77BC1F22 0%, hsl(var(--card)) 60%)" }}>
              <div className="text-sm font-bold">All your orders in one place</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">View, track and reorder your Food, Grocery and Shopping orders.</div>
            </div>
          </div>

          <div className="px-4 mt-3 space-y-2.5">
            {filteredOrders.length === 0 ? (
              <div className="baked-card bg-card border border-border p-8 text-center">
                <ShoppingBag size={30} className="mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-semibold">No orders yet</div>
                <div className="text-[11px] text-muted-foreground mt-1">Your recent orders across MART, FOOD & SHOP will appear here.</div>
                <Button onClick={() => nav("/")} className="baked-btn mt-4 h-9 px-4 font-bold text-black text-xs" style={{ backgroundColor: "#77BC1F" }}>Browse Stores</Button>
              </div>
            ) : filteredOrders.map((o) => { const M = MODULE_LOGO[o.module] || ShoppingCart; const tone = MODULE_TONE[o.module] || "#77BC1F"; return (
              <button key={o.id} data-testid={`m-act-ord-${o.id}`} onClick={() => nav(`/orders/${o.id}`)} className="w-full baked-card bg-card border border-border p-3.5 text-left flex items-center gap-3 motion-fast active:scale-[0.99]">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}><M size={17} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-bold truncate">{(o.module || "mart").toUpperCase()}bakēd</div>
                    <span className="baked-chip px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ backgroundColor: o.status === "delivered" ? "#77BC1F22" : "#1D9BF022", color: o.status === "delivered" ? "#77BC1F" : "#1D9BF0" }}>{o.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{o.number} · {(o.items || []).length} items</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short" })}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatMoney(o.total, o.currency, ccy)}</div>
                  <ChevronRight size={13} className="text-muted-foreground inline mt-1" />
                </div>
              </button>
            );})}
          </div>
        </div>
      )}

      {/* Property empty state */}
      {tab === "property" && <EmptyModule module="IMMO" icon={HomeIcon} tabs={["Saved Properties", "Viewing Requests", "Agent Contacts", "Submitted Offers"]} desc="Save properties, schedule visits, connect with agents and submit offers — all from your profile." />}
      {tab === "vehicle" && <EmptyModule module="AUTO" icon={Car} tabs={["Saved Vehicles", "Dealer Contacts", "Test Drive Requests", "Purchase Requests"]} desc="Save vehicles, request test drives, connect with dealers and manage purchase requests." />}
    </div>
  );
};

const EmptyModule = ({ module, icon: Icon, tabs, desc }) => (
  <div className="p-4">
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 opacity-40 pointer-events-none">
      {tabs.map((t) => <span key={t} className="shrink-0 baked-chip px-3 py-1.5 text-[11px] font-bold bg-secondary text-muted-foreground">{t}</span>)}
    </div>
    <div className="baked-card bg-card border border-border p-8 text-center mt-4">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={26} /></div>
      <div className="text-base font-bold">{module}bakēd is launching soon</div>
      <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed max-w-xs mx-auto">{desc}</div>
      <div className="mt-4 inline-flex items-center gap-1.5 baked-chip px-3 py-1 text-[10px] font-bold" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}><Sparkles size={11} /> COMING SOON</div>
    </div>
  </div>
);
