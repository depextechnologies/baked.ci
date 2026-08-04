/**
 * Partner — Orders page (Slice 6).
 * List orders in status tabs, view detail, and transition through the
 * packing/handoff flow. On handoff, backend credits the partner's wallet
 * (net of a 10% platform commission).
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingBag, ChevronRight, Package } from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};

const money = (n, cur = "XOF") => `${Number(n).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

const STATUS_TABS = [
  { key: "new",         label: "New" },
  { key: "accepted",    label: "Accepted" },
  { key: "packing",     label: "Packing" },
  { key: "ready",       label: "Ready" },
  { key: "handed_off",  label: "Handed off" },
  { key: "completed",   label: "Completed" },
  { key: "cancelled",   label: "Cancelled" },
];

const STATUS_COLORS = {
  new:        { bg: "var(--ph-accent-soft)", fg: "var(--ph-accent)" },
  accepted:   { bg: "rgba(120,120,255,.15)", fg: "#aab6ff" },
  packing:    { bg: "rgba(255,190,60,.15)",  fg: "#ffbf3c" },
  ready:      { bg: "rgba(90,210,150,.15)",  fg: "#7ee6b0" },
  handed_off: { bg: "rgba(90,210,255,.15)",  fg: "#7edcff" },
  completed:  { bg: "rgba(120,255,120,.12)", fg: "#8ce68a" },
  cancelled:  { bg: "rgba(255,90,90,.15)",   fg: "#ff9090" },
};

const NEXT_ACTIONS = {
  new:        [{ status: "accepted", label: "Accept" },      { status: "cancelled", label: "Cancel" }],
  accepted:   [{ status: "packing",  label: "Start packing" },{ status: "cancelled", label: "Cancel" }],
  packing:    [{ status: "ready",    label: "Mark ready" },  { status: "cancelled", label: "Cancel" }],
  ready:      [{ status: "handed_off", label: "Hand off to driver" }, { status: "cancelled", label: "Cancel" }],
  handed_off: [{ status: "completed", label: "Mark completed" }],
  completed:  [],
  cancelled:  [],
};

/* -------------------------- Order detail drawer -------------------------- */

const OrderDrawer = ({ orderId, onClose, onChange }) => {
  const [order, setOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!orderId) { setOrder(null); return; }
    partnerApi.get(`/partner/orders/${orderId}`).then(r => setOrder(r.data));
  }, [orderId]);

  const transition = async (status) => {
    try {
      const body = { status };
      if (status === "cancelled") {
        const reason = cancelReason || window.prompt("Cancellation reason?");
        if (!reason) return;
        body.reason = reason;
      }
      const { data } = await partnerApi.post(`/partner/orders/${orderId}/status`, body);
      setOrder(data);
      onChange();
      toast.success(`Order ${status.replace(/_/g, " ")}`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!orderId) return null;
  const c = STATUS_COLORS[order?.status || "new"];

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="order-drawer">
      <div className="flex-1" style={{ background: "rgba(0,0,0,.6)" }} onClick={onClose} />
      <aside className="w-full max-w-xl h-full overflow-y-auto"
             style={{ background: "var(--ph-bg-elevated)", borderLeft: "1px solid var(--ph-border-strong)" }}>
        {!order ? (
          <div className="p-10 text-sm" style={{ color: "var(--ph-fg-muted)" }}>Loading…</div>
        ) : (
          <>
            <div className="p-6" style={{ borderBottom: "1px solid var(--ph-border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="ph-eyebrow">Order</div>
                  <h2 className="ph-h2 mt-1" style={{ color: "var(--ph-fg)" }}>{order.order_number}</h2>
                </div>
                <button onClick={onClose} className="text-sm px-3 h-9 rounded-lg"
                        style={{ color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border-strong)" }}
                        data-testid="drawer-close">Close</button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: c.bg, color: c.fg }}>{order.status.replace(/_/g, " ")}</span>
                <span className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
                  Payment: {order.payment_status} · {order.payment_method}
                </span>
              </div>
            </div>

            <div className="p-6">
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>Delivery</div>
              <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{order.address?.label}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-muted)" }}>
                {order.address?.line1}, {order.address?.city}
              </div>
              {order.delivery_slot_label && (
                <div className="text-xs mt-2" style={{ color: "var(--ph-fg-subtle)" }}>Slot: {order.delivery_slot_label}</div>
              )}
              {order.instructions && (
                <div className="text-xs mt-2 p-2 rounded" style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)" }}>
                  Note: {order.instructions}
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>Items</div>
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
                {order.items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 p-3" style={{ borderBottom: "1px solid var(--ph-border)" }}>
                    {it.image
                      ? <img src={it.image} alt="" className="w-10 h-10 rounded object-cover" />
                      : <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: "var(--ph-bg-elevated)" }}><Package size={14} /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{it.name}</div>
                      <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>{it.brand} · {it.unit}</div>
                    </div>
                    <div className="text-xs" style={{ color: "var(--ph-fg-muted)" }}>× {it.quantity}</div>
                    <div className="text-sm font-mono w-24 text-right" style={{ color: "var(--ph-fg)" }}>{money(it.line_total, order.currency)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl p-4" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
                <div className="flex justify-between text-sm py-1" style={{ color: "var(--ph-fg-muted)" }}>
                  <span>Your slice subtotal</span><span>{money(order.subtotal, order.currency)}</span>
                </div>
                <div className="flex justify-between text-xs py-1" style={{ color: "var(--ph-fg-subtle)" }}>
                  <span>Items to pack</span><span>{order.item_count}</span>
                </div>
                {order.consolidation_status && order.consolidation_status !== "not_applicable" && (
                  <div className="flex justify-between text-xs py-1" style={{ color: "var(--ph-accent-warm)" }}>
                    <span>Multi-store order</span><span>consolidated delivery</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-2 mt-2"
                     style={{ color: "var(--ph-fg-subtle)", borderTop: "1px solid var(--ph-border)" }}>
                  <span>Customer paid (grand total)</span><span>{money(order.customer_total, order.currency)}</span>
                </div>
              </div>
            </div>

            {NEXT_ACTIONS[order.status]?.length > 0 && (
              <div className="p-6 sticky bottom-0" style={{ background: "var(--ph-bg-elevated)", borderTop: "1px solid var(--ph-border-strong)" }}>
                {order.status === "new" || order.status === "accepted" || order.status === "packing" || order.status === "ready" ? (
                  <input placeholder="Cancellation reason (optional)"
                         value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                         className="w-full mb-3 px-3 h-10 rounded-lg text-sm"
                         style={{ background: "var(--ph-card)", color: "var(--ph-fg)", border: "1px solid var(--ph-border-strong)" }}
                         data-testid="drawer-cancel-reason" />
                ) : null}
                <div className="flex gap-2">
                  {NEXT_ACTIONS[order.status].map(a => (
                    <button key={a.status}
                            onClick={() => transition(a.status)}
                            className="flex-1 h-11 rounded-lg text-sm font-medium"
                            style={{
                              background: a.status === "cancelled" ? "rgba(255,90,90,.15)" : "var(--ph-accent-warm)",
                              color:      a.status === "cancelled" ? "#ff9090" : "#0a0a0f",
                              border:     a.status === "cancelled" ? "1px solid #ff9090" : "none",
                            }}
                            data-testid={`drawer-action-${a.status}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
};

/* ------------------------------ Main page ------------------------------- */

export const OrdersPage = () => {
  const [tab, setTab] = useState("new");
  const [data, setData] = useState({ items: [], total: 0, buckets: {} });
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    const { data } = await partnerApi.get(`/partner/orders?status=${tab}`);
    setData(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  return (
    <div data-testid="portal-orders-page">
      <div className="ph-eyebrow">Orders</div>
      <h1 className="ph-h1 mt-2" style={{ color: "var(--ph-fg)" }}>Fulfilment queue</h1>
      <p className="ph-body mt-2 max-w-2xl">
        Accept new orders, pack them from the shelves in your warehouse, and hand off to drivers. Revenue lands in your Wallet on handoff (net of a 10% platform fee).
      </p>

      <div className="mt-8 flex gap-2 overflow-x-auto">
        {STATUS_TABS.map(t => {
          const on = tab === t.key;
          const count = data.buckets?.[t.key] ?? 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    data-testid={`orders-tab-${t.key}`}
                    className="flex items-center gap-2 px-4 h-10 rounded-lg text-sm whitespace-nowrap"
                    style={{
                      background: on ? "var(--ph-warm-soft)" : "var(--ph-card)",
                      color:      on ? "var(--ph-accent-warm)" : "var(--ph-fg-muted)",
                      border:     "1px solid " + (on ? "var(--ph-accent-warm)" : "var(--ph-border)"),
                    }}>
              {t.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(255,255,255,.06)", color: on ? "var(--ph-accent-warm)" : "var(--ph-fg-subtle)" }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl overflow-hidden" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
        {data.items.length === 0 ? (
          <div className="p-10 text-center">
            <ShoppingBag size={28} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto" }} />
            <p className="text-sm mt-3" style={{ color: "var(--ph-fg-muted)" }}>
              {tab === "new" ? "No incoming orders. New orders will appear here." : `No ${tab.replace(/_/g, " ")} orders.`}
            </p>
          </div>
        ) : data.items.map(o => {
          const c = STATUS_COLORS[o.status];
          return (
            <button key={o.id} onClick={() => setOpenId(o.id)}
                    data-testid={`order-row-${o.order_number}`}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[.02]"
                    style={{ borderBottom: "1px solid var(--ph-border)" }}>
              <div>
                <div className="text-sm" style={{ color: "var(--ph-fg)" }}>{o.order_number}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>
                  {o.items.length} item(s) · {new Date(o.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex-1" />
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                    style={{ background: c.bg, color: c.fg }}>{o.status.replace(/_/g, " ")}</span>
              <div className="font-mono text-sm w-28 text-right" style={{ color: "var(--ph-fg)" }}>{money(o.subtotal, o.currency)}</div>
              <ChevronRight size={16} style={{ color: "var(--ph-fg-subtle)" }} />
            </button>
          );
        })}
      </div>

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} onChange={load} />
    </div>
  );
};
