/**
 * PortalShopOrders — seller portal SHOP order lifecycle.
 *
 * Lets the supplier drive fulfilment across paid → packing → shipped and
 * enter the customer's delivery PIN to close the loop (shipped → delivered).
 * The PIN itself is never surfaced to the seller by the backend — they must
 * ask the customer at the door and type it here.
 *
 * Backend contract:
 *   GET  /api/shop/portal/orders?status=…             list + buckets
 *   GET  /api/shop/portal/orders/{id}                 detail + line items
 *   POST /api/shop/portal/orders/{id}/status          {status: packing|shipped}
 *   POST /api/shop/portal/orders/{id}/deliver         {pin} → delivered
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, PackageOpen, Truck, CheckCircle2, Lock, ChevronLeft, ShieldCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const BUCKETS = [
  { code: "paid",            label: "Ready to pack", color: "#3B82F6", icon: PackageOpen },
  { code: "packing",         label: "Packing",       color: "#8B5CF6", icon: PackageOpen },
  { code: "shipped",         label: "Shipped",       color: "#FCC44C", icon: Truck },
  { code: "delivered",       label: "Delivered",     color: "#77BC1F", icon: CheckCircle2 },
  { code: "cancelled",       label: "Cancelled",     color: "#FF4C52", icon: X },
];

export const PortalShopOrders = () => {
  const [status, setStatus] = useState("paid");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await portalApi.get("/shop/portal/orders", { params: { status } });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  if (openId) return <SupplierShopOrderDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div className="space-y-6" data-testid="portal-shop-orders">
      <div>
        <div className="pl-eyebrow mb-2">SHOP fulfilment</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Marketplace orders</h1>
        <p className="pl-body mt-2">
          Move each order through the fulfilment funnel. At the door, ask the customer for their delivery PIN — only entering it here marks the order delivered.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          const Icon = b.icon;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)}
              data-testid={`sp-shop-bucket-${b.code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{
                background: on ? b.color : "transparent",
                color: on ? "#0a0a0a" : "var(--pl-fg)",
                border: `1px solid ${on ? b.color : "var(--pl-border)"}`,
              }}>
              <Icon size={13} /> {b.label} <span className="opacity-70">({buckets[b.code] || 0})</span>
            </button>
          );
        })}
      </div>

      {busy ? (
        <div className="pl-body text-sm">Loading orders…</div>
      ) : items.length === 0 ? (
        <div className="pl-card p-6 text-center">
          <ShoppingBag size={28} className="mx-auto opacity-40 mb-2" />
          <div className="pl-body text-sm">No orders in this bucket yet.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((o) => (
            <button key={o.id} data-testid={`sp-shop-order-${o.id}`}
              onClick={() => setOpenId(o.id)}
              className="pl-card p-4 text-left hover:border-amber-400/50 transition-colors flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--pl-fg)" }}>{o.number}</div>
                <div className="text-xs opacity-70">
                  {new Date(o.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{o.snapshot?.item_count || 0} items
                </div>
              </div>
              <StatusPill status={o.status} />
              <div className="text-sm font-mono" style={{ color: "var(--pl-fg)" }}>
                {Number(o.total).toLocaleString()} {o.currency}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const StatusPill = ({ status }) => {
  const meta = BUCKETS.find((b) => b.code === status)
    || { color: "#71717A", label: (status || "").replace(/_/g, " ") };
  return (
    <span className="baked-chip px-2 py-1 text-[10px] font-bold uppercase"
          style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}>
      {(status || "").replace(/_/g, " ")}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Detail drawer — advance status, enter PIN.
// ---------------------------------------------------------------------------

const SupplierShopOrderDetail = ({ id, onBack }) => {
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await portalApi.get(`/shop/portal/orders/${id}`);
      setOrder(data);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const move = async (target) => {
    setBusy(true);
    try {
      await portalApi.post(`/shop/portal/orders/${id}/status`, { status: target });
      toast.success(`Marked ${target}`);
      await load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const deliver = async () => {
    if (!pin || pin.length < 4) { toast.error("Enter the customer's PIN"); return; }
    setBusy(true);
    try {
      await portalApi.post(`/shop/portal/orders/${id}/deliver`, { pin });
      toast.success("Order delivered ✓");
      setPin("");
      await load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d?.code === "wrong_pin") {
        toast.error(`${d.message} — ${d.attempts_remaining} attempts remaining`);
      } else if (d?.code === "pin_locked") {
        toast.error(d.message);
      } else {
        toast.error(errMsg(e));
      }
    } finally { setBusy(false); }
  };

  const nextAction = useMemo(() => {
    if (!order) return null;
    if (order.status === "paid") return { label: "Start packing", to: "packing" };
    if (order.status === "packing") return { label: "Mark shipped", to: "shipped" };
    return null;
  }, [order]);

  if (!order) return <div className="pl-body p-6">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="sp-shop-order-detail">
      <button onClick={onBack} className="pl-body text-sm flex items-center gap-1 hover:underline">
        <ChevronLeft size={14} /> Back
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="pl-eyebrow mb-1">Order</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>{order.number}</h1>
          <div className="pl-body text-xs mt-1">
            Placed {new Date(order.created_at).toLocaleString()}
            {order.delivered_at && ` · Delivered ${new Date(order.delivered_at).toLocaleString()}`}
          </div>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="pl-card p-4">
          <div className="pl-eyebrow mb-2">Delivery address</div>
          {order.delivery_address ? (
            <div className="text-sm space-y-0.5" style={{ color: "var(--pl-fg)" }}>
              <div>{order.delivery_address.formatted_address || order.delivery_address.line1}</div>
              {order.delivery_address.city && <div className="opacity-70">{order.delivery_address.city}</div>}
              {order.instructions && <div className="opacity-70 italic text-xs mt-2">"{order.instructions}"</div>}
            </div>
          ) : <div className="pl-body text-sm">No address on file.</div>}
        </div>
        <div className="pl-card p-4">
          <div className="pl-eyebrow mb-2">Totals</div>
          <div className="text-sm space-y-1">
            <Row label="Subtotal" value={`${Number(order.subtotal).toLocaleString()} ${order.currency}`} />
            <Row label="Delivery" value={`${Number(order.delivery_fee).toLocaleString()} ${order.currency}`} />
            <div className="h-px my-2" style={{ background: "var(--pl-border)" }} />
            <Row label="Total" value={`${Number(order.total).toLocaleString()} ${order.currency}`} strong />
            <div className="pl-body text-xs opacity-70 pt-2">
              Payment: {order.payment_provider || "—"} · {order.payment_status}
            </div>
          </div>
        </div>
      </div>

      <div className="pl-card p-4">
        <div className="pl-eyebrow mb-3">Line items</div>
        <ul className="space-y-2">
          {(order.items || []).map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate" style={{ color: "var(--pl-fg)" }}>{it.title}</div>
                <div className="text-xs opacity-70 truncate">
                  SKU {it.sku} · qty {it.quantity}
                  {!it.is_mine && <span className="ml-2 text-amber-400">· other seller line</span>}
                </div>
              </div>
              <div className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--pl-fg)" }}>
                {Number(it.line_total).toLocaleString()} {it.currency}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="pl-card p-5 space-y-4">
        <div className="pl-eyebrow">Next step</div>
        {nextAction && (
          <button data-testid={`sp-shop-action-${nextAction.to}`}
                  disabled={busy} onClick={() => move(nextAction.to)}
                  className="pl-btn pl-btn-primary">
            {nextAction.label}
          </button>
        )}
        {order.status === "shipped" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--pl-fg)" }}>
              <ShieldCheck size={16} className="text-amber-400" />
              <span>Ask the customer for their <strong>delivery PIN</strong> and enter it below.</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                data-testid="sp-shop-pin-input"
                inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="000000"
                className="h-11 w-40 rounded-lg px-3 font-mono tracking-[0.3em] text-lg text-center"
                style={{ background: "var(--pl-bg)", color: "var(--pl-fg)", border: "1px solid var(--pl-border)" }}
              />
              <button data-testid="sp-shop-deliver-btn"
                      disabled={busy || pin.length < 4}
                      onClick={deliver}
                      className="pl-btn pl-btn-primary flex items-center gap-2">
                <CheckCircle2 size={14} /> Confirm delivery
              </button>
            </div>
            {(order.delivery_pin_attempts || 0) > 0 && (
              <div className="text-xs text-amber-400 flex items-center gap-1">
                <Lock size={11} /> {order.delivery_pin_attempts} wrong attempt(s). Locked after 5.
              </div>
            )}
          </div>
        )}
        {order.status === "delivered" && (
          <div className="text-sm flex items-center gap-2" style={{ color: "#77BC1F" }}>
            <CheckCircle2 size={16} /> Delivered successfully.
          </div>
        )}
        {(order.status === "pending_payment") && (
          <div className="pl-body text-sm opacity-70">Waiting for payment before you can pack this order.</div>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between">
    <span className="pl-body text-xs">{label}</span>
    <span style={{ color: "var(--pl-fg)", fontWeight: strong ? 700 : 500 }}>{value}</span>
  </div>
);

export default PortalShopOrders;
