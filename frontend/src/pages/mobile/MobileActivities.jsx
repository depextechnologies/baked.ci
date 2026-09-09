import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth, useApp } from "../../contexts/BakedContexts";
import { useLocalePath } from "../../i18n/routes";
import { formatMoney } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { ArrowLeft, Search, Truck, ShoppingBag, Home as HomeIcon, Car, ShieldCheck, ChevronRight, Sparkles, Package, Utensils, ShoppingCart } from "lucide-react";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";

const TABS_META = [
  { code: "deliveries", icon: Truck },
  { code: "orders", icon: ShoppingBag },
  { code: "property", icon: HomeIcon },
  { code: "vehicle", icon: Car },
];

const MODULE_LOGO = { mart: ShoppingCart, food: Utensils, shop: ShoppingBag, express: Truck };
const MODULE_TONE = { mart: "#77BC1F", food: "#FF7043", shop: "#FCC44C", express: "#FCC44C" };

// SHOP orders live at /api/shop/orders/me — normalise them into the shared
// row shape the Activities/Orders list understands (module, items, address).
const normaliseShopOrder = (o) => ({
  id: o.id,
  number: o.number,
  module: "shop",
  status: o.status,
  total: o.total,
  currency: o.currency,
  created_at: o.created_at,
  address: o.delivery_address || {},
  // Prefer the snapshot lines captured at checkout — cheapest source that
  // doesn't need a per-order round-trip on the list view.
  items: (o.snapshot?.lines || []).map((ln) => ({
    id: ln.variant_id,
    quantity: ln.quantity,
    line_total: ln.line_total,
    product: { name: ln.product_title, price: ln.unit_price },
  })),
});

export const MobileActivities = () => {
  const { t } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const [searchParams] = useSearchParams();
  const { customer } = useAuth();
  const { country } = useApp();

  const TABS = TABS_META.map((tp) => ({ ...tp, label: t(`activities.tab_${tp.code}`) }));
  // Support deep-links like /profile/activities?tab=orders so mailers /
  // notifications can jump straight to the merged order list.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return ["deliveries", "orders", "property", "vehicle"].includes(t) ? t : "deliveries";
  });
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("active");
  const [moduleFilter, setModuleFilter] = useState("all");

  useEffect(() => {
    if (!customer) return;
    // Merge MART/FOOD orders (/orders/me) with SHOP orders (/shop/orders/me)
    // so the customer sees every purchase in one place. Sort by most recent.
    Promise.all([
      api.get("/orders/me").then((r) => r.data || []).catch(() => []),
      api.get("/shop/orders/me").then((r) => (r.data?.items || []).map(normaliseShopOrder)).catch(() => []),
    ]).then(([mart, shop]) => {
      const merged = [...mart, ...shop].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setOrders(merged);
    });
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

  if (!customer) return <GuestSignInPrompt title={t("activities.signin_title")} message={t("activities.signin_body")} testid="m-activities-signin" />;

  const ccy = country?.currency_symbol || country?.currency;

  return (
    <div className="pb-24">
      <div className="px-4 pt-2 pb-3 flex items-center gap-2">
        <button data-testid="m-act-back" onClick={() => nav(path("profile"))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0"><div className="text-base font-bold">{t("activities.title")}</div><div className="text-[11px] text-muted-foreground">{t("activities.subtitle")}</div></div>
        <button className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center" aria-label={t("activities.search_aria")}><Search size={16} /></button>
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
            {[["active", t("activities.filter_active"), counts.active], ["completed", t("activities.filter_completed"), counts.completed], ["cancelled", t("activities.filter_cancelled"), counts.cancelled]].map(([code, label, count]) => { const isAct = filter === code; return (
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
                    <div className="text-sm font-bold">{t("activities.tracking_title")}</div>
                    <div className="text-[11px] text-muted-foreground">{t("activities.tracking_body")}</div>
                  </div>
                  <Button data-testid="m-act-track-now" size="sm" onClick={() => { const first = orders.find((o) => ["confirmed", "preparing", "picked_up", "on_the_way"].includes(o.status)); if (first) nav(path("orderTrack", { id: first.id })); }} className="baked-btn font-bold text-black h-9" style={{ backgroundColor: "#77BC1F" }}>{t("activities.track_now")}</Button>
                </div>
              </div>
            </div>
          )}

          {/* Delivery list */}
          <div className="px-4 mt-3 space-y-2.5">
            {deliveries.length === 0 ? (
              <div className="baked-card bg-card border border-border p-8 text-center">
                <Package size={30} className="mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-semibold">{t("activities.empty_deliveries", { state: filter === "active" ? t("activities.filter_active").toLowerCase() : filter === "completed" ? t("activities.filter_completed").toLowerCase() : t("activities.filter_cancelled").toLowerCase() })}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{t("activities.empty_deliveries_body")}</div>
              </div>
            ) : deliveries.map((o) => (
              <button key={o.id} data-testid={`m-act-del-${o.id}`} onClick={() => nav(path("orderTrack", { id: o.id }))} className="w-full baked-card bg-card border border-border p-3.5 text-left motion-fast active:scale-[0.99]">
                <div className="flex items-center justify-between">
                  <div className="baked-chip px-2 py-0.5 text-[9px] font-bold uppercase" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>{o.status.replace(/_/g, " ")}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{o.number}</div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${MODULE_TONE[o.module] || "#77BC1F"}22`, color: MODULE_TONE[o.module] || "#77BC1F" }}>{(() => { const M = MODULE_LOGO[o.module] || ShoppingCart; return <M size={16} />; })()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{t("activities.items_label", { count: (o.items || []).length })} · {(o.module || "mart").toUpperCase()}bakēd</div>
                    <div className="text-[10px] text-muted-foreground truncate">{t("activities.drop_label")} {o.address?.line1 || "—"}, {o.address?.city || ""}</div>
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
            {["all", "food", "mart", "shop"].map((m) => {
              const isAct = moduleFilter === m;
              const tone = m === "all" ? "#77BC1F" : (MODULE_TONE[m] || "#77BC1F");
              return (
                <button key={m} data-testid={`m-act-modf-${m}`} onClick={() => setModuleFilter(m)}
                        className={`shrink-0 baked-chip px-3 py-1.5 text-[11px] font-bold uppercase motion-fast ${isAct ? "text-black" : "bg-secondary text-muted-foreground"}`}
                        style={isAct ? { backgroundColor: tone } : {}}>
                  {m}
                </button>
              );
            })}
          </div>

          <div className="px-4 mt-3">
            <div className="baked-card overflow-hidden p-4 border" style={{ borderColor: "#77BC1F55", background: "linear-gradient(135deg, #77BC1F22 0%, hsl(var(--card)) 60%)" }}>
              <div className="text-sm font-bold">{t("activities.hero_orders_title")}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{t("activities.hero_orders_body")}</div>
            </div>
          </div>

          <div className="px-4 mt-3 space-y-2.5">
            {filteredOrders.length === 0 ? (
              <div className="baked-card bg-card border border-border p-8 text-center">
                <ShoppingBag size={30} className="mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-semibold">{t("activities.empty_orders")}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{t("activities.empty_orders_body")}</div>
                <Button onClick={() => nav("/")} className="baked-btn mt-4 h-9 px-4 font-bold text-black text-xs" style={{ backgroundColor: "#77BC1F" }}>{t("activities.browse_stores")}</Button>
              </div>
            ) : filteredOrders.map((o) => { const M = MODULE_LOGO[o.module] || ShoppingCart; const tone = MODULE_TONE[o.module] || "#77BC1F"; const orderRoute = o.module === "shop" ? `/shop/order/${o.id}` : path("order", { id: o.id });
              // Green pill for terminal-success states across modules
              // (MART: delivered · SHOP: shipped + delivered). Everything
              // else stays module-tone to signal in-progress.
              const isSuccess = o.status === "delivered" || (o.module === "shop" && o.status === "shipped");
              const pillTone = isSuccess ? "#77BC1F" : tone;
              return (
              <button key={o.id} data-testid={`m-act-ord-${o.id}`} onClick={() => nav(orderRoute)} className="w-full baked-card bg-card border border-border p-3.5 text-left flex items-center gap-3 motion-fast active:scale-[0.99]">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}><M size={17} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-bold truncate">{(o.module || "mart").toUpperCase()}bakēd</div>
                    <span data-testid={`m-act-ord-status-${o.id}`}
                          className="baked-chip px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{ backgroundColor: `${pillTone}22`, color: pillTone }}>
                      {(o.status || "").replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{o.number} · {t("activities.items_label", { count: (o.items || []).length })}</div>
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

const EmptyModule = ({ module, icon: Icon, tabs, desc }) => {
  const { t } = useTranslation("customer");
  return (
  <div className="p-4">
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 opacity-40 pointer-events-none">
      {tabs.map((tb) => <span key={tb} className="shrink-0 baked-chip px-3 py-1.5 text-[11px] font-bold bg-secondary text-muted-foreground">{tb}</span>)}
    </div>
    <div className="baked-card bg-card border border-border p-8 text-center mt-4">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={26} /></div>
      <div className="text-base font-bold">{t("activities.coming_soon_module", { module })}</div>
      <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed max-w-xs mx-auto">{desc}</div>
      <div className="mt-4 inline-flex items-center gap-1.5 baked-chip px-3 py-1 text-[10px] font-bold" style={{ backgroundColor: "#FCC44C", color: "#0a1200" }}><Sparkles size={11} /> {t("activities.coming_soon_badge")}</div>
    </div>
  </div>
  );
};