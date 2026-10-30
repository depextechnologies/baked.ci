/**
 * RestaurantAnalytics — reusable dashboard for FOODbakēd restaurant partners.
 *
 * Mounted twice (same shared component):
 *   • Super-admin:  /admin/modules/food/restaurants/:id/analytics
 *   • Partner:      /partner/food/analytics
 *
 * Props:
 *   restaurantId  — the food_restaurants.id
 *   api           — axios instance carrying the correct Bearer token
 *                   (adminApi for admin, partnerApi for partner)
 *
 * Data source: `GET /api/food/manage/{rid}/analytics?range=7d|30d|90d`
 * Charts: Recharts (already installed).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Clock, Utensils,
  Loader2, RefreshCw, Award, XCircle, CheckCircle2, Sparkles,
} from "lucide-react";

const GREEN  = "#00A651";
const errMsg = (e) => e?.response?.data?.detail || e?.message || "Erreur · Error";

const RANGES = [
  { code: "7d",  label: "7 j · 7 days" },
  { code: "30d", label: "30 j · 30 days" },
  { code: "90d", label: "90 j · 90 days" },
];

const STATUS_COLORS = {
  delivered:        GREEN,
  out_for_delivery: "#3b82f6",
  preparing:        "#f59e0b",
  placed:           "#a1a1aa",
  accepted:         "#22d3ee",
  ready:            "#8b5cf6",
  cancelled:        "#ef4444",
  rejected:         "#dc2626",
  refunded:         "#fb7185",
};

const STATUS_FR = {
  delivered: "Livré", out_for_delivery: "En livraison", preparing: "En prépa",
  placed: "Placé", accepted: "Accepté", ready: "Prêt",
  cancelled: "Annulé", rejected: "Rejeté", refunded: "Remboursé",
};

const fmtMoney = (v, cur) => {
  const n = Number(v || 0);
  const formatted = n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + "M" :
                    n >= 1_000     ? (n / 1_000).toFixed(1)   + "k" :
                                     n.toFixed(0);
  return `${formatted} ${cur}`;
};

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const KpiCard = ({ icon: Icon, label, value, sub, trend, testId }) => (
  <div className="rounded-2xl border border-border bg-card p-4" data-testid={testId}>
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${GREEN}18`, color: GREEN }}>
        <Icon size={18} />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
    <div className="mt-3 text-2xl font-bold">{value}</div>
    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    {trend !== undefined && (
      <div className={`text-[11px] inline-flex items-center gap-0.5 mt-1 ${trend >= 0 ? "text-green-500" : "text-red-500"}`}>
        {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(trend).toFixed(1)}%
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const RestaurantAnalytics = ({ restaurantId, api, testId = "restaurant-analytics" }) => {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data } = await api.get(`/food/manage/${restaurantId}/analytics?range=${range}`);
      setData(data);
    } catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [api, restaurantId, range]);

  useEffect(() => { load(); }, [load]);

  // Split daily series to compute trend vs previous period.
  const trend = useMemo(() => {
    if (!data?.daily?.length) return {};
    const half = Math.floor(data.daily.length / 2);
    const prev = data.daily.slice(0, half);
    const cur  = data.daily.slice(half);
    const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
    const trendPct = (a, b) => b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100;
    return {
      orders:   trendPct(sum(cur, "orders"),   sum(prev, "orders")),
      revenue:  trendPct(sum(cur, "revenue"),  sum(prev, "revenue")),
      earnings: trendPct(sum(cur, "earnings"), sum(prev, "earnings")),
    };
  }, [data]);

  if (loading && !data) return <div className="text-sm text-muted-foreground inline-flex items-center gap-2" data-testid={`${testId}-loading`}><Loader2 size={14} className="animate-spin" /> Chargement · Loading…</div>;
  if (err) return <div className="text-xs text-red-500" data-testid={`${testId}-error`}>{err}</div>;
  if (!data) return null;

  const cur = data.currency;
  const k = data.kpis;

  return (
    <div className="space-y-6" data-testid={testId}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Analytics · Performance</h1>
          <p className="text-xs text-muted-foreground">Commandes, revenus, plats populaires et temps de préparation · Orders, revenue, top items & prep trends</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-border p-1 text-xs" data-testid={`${testId}-range`}>
            {RANGES.map((r) => (
              <button key={r.code} onClick={() => setRange(r.code)}
                      data-testid={`${testId}-range-${r.code}`}
                      className={`px-3 py-1.5 rounded-full transition-colors ${range === r.code ? "text-white font-semibold" : "text-muted-foreground"}`}
                      style={range === r.code ? { backgroundColor: GREEN } : undefined}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={load} data-testid={`${testId}-refresh`} className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/70 inline-flex items-center justify-center" title="Actualiser">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={ShoppingBag} label="Commandes · Orders"    value={k.total_orders}     sub={`${k.delivered_orders} livrées · delivered`} trend={trend.orders}  testId={`${testId}-kpi-orders`} />
        <KpiCard icon={DollarSign}   label="Revenus bruts · Gross" value={fmtMoney(k.gross_revenue, cur)} sub={`Panier moyen · AOV ${fmtMoney(k.avg_order_value, cur)}`} trend={trend.revenue} testId={`${testId}-kpi-gross`} />
        <KpiCard icon={Sparkles}     label="Vos gains nets · Net"   value={fmtMoney(k.net_earnings, cur)}  sub="Après commissions & frais" trend={trend.earnings} testId={`${testId}-kpi-earnings`} />
        <KpiCard icon={Clock}        label="Prépa moyenne · Prep"   value={`${k.avg_prep_min} min`} sub={`${k.cancelled_orders} annulées · cancelled`} testId={`${testId}-kpi-prep`} />
      </div>

      {/* Orders + revenue area chart */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`${testId}-chart-daily`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Commandes & Revenus · Orders & Revenue</div>
            <div className="text-xs text-muted-foreground">Série quotidienne · Daily series</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-orders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.6} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis yAxisId="left"  tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, name) => name === "revenue" ? [fmtMoney(v, cur), "Revenus"] : [v, "Commandes"]} />
            <Area yAxisId="left"  type="monotone" dataKey="orders"  stroke={GREEN} fill="url(#grad-orders)" strokeWidth={2} />
            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Prep-time trend */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`${testId}-chart-prep`}>
        <div className="text-sm font-bold">Temps de préparation moyen · Avg prep time (min)</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} unit=" min" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="avg_prep_min" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top items + Status mix */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`${testId}-top-items`}>
          <div className="flex items-center gap-2">
            <Award size={16} className="text-amber-500" />
            <div className="text-sm font-bold">Plats les plus vendus · Top items</div>
          </div>
          {data.top_items.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-6 text-center">Aucune donnée pour cette période · No data for this period.</div>
          ) : (
            <ul className="space-y-2">
              {data.top_items.map((t, i) => {
                const max = data.top_items[0].qty;
                const pct = (t.qty / max) * 100;
                return (
                  <li key={i} className="text-xs" data-testid={`${testId}-top-item-${i}`}>
                    <div className="flex justify-between mb-1">
                      <span className="font-medium truncate flex items-center gap-2"><span className="text-muted-foreground w-4">{i + 1}.</span> {t.name}</span>
                      <span className="text-muted-foreground shrink-0">{t.qty} × · {fmtMoney(t.revenue, cur)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: GREEN }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`${testId}-status-mix`}>
          <div className="text-sm font-bold">Répartition des statuts · Order statuses</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.status_mix} dataKey="value" nameKey="name" outerRadius={80} innerRadius={45}>
                {data.status_mix.map((s, i) => <Cell key={i} fill={STATUS_COLORS[s.name] || "#a1a1aa"} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, name) => [v, STATUS_FR[name] || name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => STATUS_FR[v] || v} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Order type + payment mix + hourly */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MixCard title="Type · Type" data={data.type_mix} colors={{ delivery: "#3b82f6", pickup: GREEN }} labels={{ delivery: "Livraison", pickup: "Retrait" }} testId={`${testId}-type-mix`} />
        <MixCard title="Paiement · Payment" data={data.payment_mix} colors={{ cash: "#a1a1aa", card: "#3b82f6", mobile_money: "#f59e0b", upi: "#8b5cf6", wallet: GREEN }} labels={{ cash: "Espèces", card: "Carte", mobile_money: "Mobile Money", upi: "UPI", wallet: "Wallet" }} testId={`${testId}-payment-mix`} />
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={`${testId}-hourly`}>
          <div className="text-sm font-bold">Heures d'affluence · Peak hours</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.hourly.filter((h) => h.hour >= 6 && h.hour <= 23)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}h`} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v, "Commandes"]} labelFormatter={(v) => `${v}h`} />
              <Bar dataKey="orders" fill={GREEN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const MixCard = ({ title, data, colors, labels, testId }) => {
  const total = data.reduce((a, r) => a + r.value, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid={testId}>
      <div className="text-sm font-bold">{title}</div>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-6 text-center">Aucune donnée · No data.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={70} innerRadius={40}>
                {data.map((s, i) => <Cell key={i} fill={colors[s.name] || "#a1a1aa"} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, name) => [v, labels?.[name] || name]} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="space-y-1">
            {data.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[s.name] || "#a1a1aa" }} /> {labels?.[s.name] || s.name}</span>
                <span className="text-muted-foreground">{s.value} · {((s.value / total) * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default RestaurantAnalytics;
