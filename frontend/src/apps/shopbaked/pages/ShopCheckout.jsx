/**
 * ShopCheckout — SHOPbakēd checkout page (Slice 9).
 *
 * Route: /shop/checkout
 *   1. Hydrate current SHOP cart via /api/shop/cart/me
 *   2. Show line items + subtotal
 *   3. Collect delivery address + instructions + payment method
 *   4. POST /api/shop/checkout → redirect to /shop/order/:id
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ShoppingBag, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

export const ShopCheckout = ({ basePath = "/shop" }) => {
  const [cart, setCart] = useState(null);
  const [addr, setAddr] = useState({ line1: "", city: "Abidjan" });
  const [instructions, setInstructions] = useState("");
  const [method, setMethod] = useState("cash_on_delivery");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/shop/cart/me").then(({ data }) => setCart(data))
      .catch((e) => {
        if (e?.response?.status === 401) toast.error("Please sign in to checkout");
        else toast.error("Failed to load cart");
      });
  }, []);

  const submit = async () => {
    if (!cart?.items?.length) return;
    setBusy(true);
    try {
      const { data } = await api.post("/shop/checkout", {
        payment_method: method,
        delivery_address: addr.line1 ? addr : null,
        instructions: instructions || null,
      });
      toast.success(`Order ${data.number} placed`);
      nav(`${basePath}/order/${data.id}`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : d?.message || "Checkout failed");
    } finally { setBusy(false); }
  };

  if (!cart) return <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-500">Loading cart…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6" data-testid="shopbaked-checkout">
      <Link to={basePath} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-amber-300 mb-4">
        <ArrowLeft size={12} /> Back to shop
      </Link>
      <h1 className="text-3xl font-bold text-neutral-100 mb-6">Checkout</h1>

      {cart.items.length === 0 ? (
        <div className="border border-neutral-800 rounded-xl p-8 text-center text-neutral-500"
             data-testid="shopbaked-checkout-empty">
          <ShoppingBag className="mx-auto mb-3" />
          Your cart is empty.
          <div className="mt-4"><Link to={basePath} className="pl-btn pl-btn-primary">Browse products</Link></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="border border-neutral-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">Delivery address</h2>
              <input className="pl-input w-full" placeholder="Street address, apt #"
                     value={addr.line1}
                     onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
                     data-testid="shopbaked-checkout-line1" />
              <input className="pl-input w-full mt-2" placeholder="City"
                     value={addr.city}
                     onChange={(e) => setAddr({ ...addr, city: e.target.value })}
                     data-testid="shopbaked-checkout-city" />
              <textarea className="pl-input w-full mt-2" placeholder="Delivery instructions (optional)"
                        value={instructions} rows={2}
                        onChange={(e) => setInstructions(e.target.value)}
                        data-testid="shopbaked-checkout-instructions" />
            </section>
            <section className="border border-neutral-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">Payment</h2>
              {[
                { code: "cash_on_delivery", label: "Cash on delivery", desc: "Pay in cash when the courier arrives." },
                { code: "stripe", label: "Card (Stripe)", desc: "Coming soon — landed order stays in pending until Slice 10." },
              ].map((p) => (
                <label key={p.code}
                       className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer mb-2 transition-colors ${
                         method === p.code ? "border-amber-400 bg-amber-400/5" : "border-neutral-800"
                       }`}
                       data-testid={`shopbaked-checkout-pay-${p.code}`}>
                  <input type="radio" checked={method === p.code}
                         onChange={() => setMethod(p.code)} className="mt-1" />
                  <div>
                    <div className="font-medium text-neutral-100">{p.label}</div>
                    <div className="text-xs text-neutral-500">{p.desc}</div>
                  </div>
                </label>
              ))}
            </section>
          </div>
          <aside className="border border-neutral-800 rounded-xl p-5 h-fit">
            <h2 className="text-sm font-semibold text-neutral-200 mb-3">Order summary</h2>
            <ul className="space-y-2 mb-4 text-sm">
              {cart.items.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-neutral-300 truncate">
                    {it.product?.title || it.variant.sku} × {it.quantity}
                  </span>
                  <span className="text-neutral-400 font-mono text-xs">
                    {it.line_total.toLocaleString()} {cart.currency}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-neutral-800 pt-3 flex justify-between font-semibold">
              <span className="text-neutral-100">Total</span>
              <span className="text-amber-300" data-testid="shopbaked-checkout-total">
                {cart.subtotal.toLocaleString()} {cart.currency}
              </span>
            </div>
            <button onClick={submit} disabled={busy}
                    className="pl-btn pl-btn-primary w-full mt-4"
                    data-testid="shopbaked-checkout-submit">
              {busy ? "Placing…" : "Place order"}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Order confirmation page — /shop/order/:orderId
// ---------------------------------------------------------------------------

export const ShopOrderConfirmation = ({ basePath = "/shop" }) => {
  const { pathname } = window.location;
  const orderId = pathname.split("/").filter(Boolean).pop();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/shop/orders/${orderId}`).then(({ data }) => setOrder(data))
      .catch((e) => setError(e?.response?.data?.detail || e.message));
  }, [orderId]);

  if (error) return <div className="mx-auto max-w-3xl px-4 py-8 text-red-400">Error: {String(error)}</div>;
  if (!order) return <div className="mx-auto max-w-3xl px-4 py-8 text-neutral-500">Loading order…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8" data-testid="shopbaked-order-confirmation">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-4">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-neutral-100">Order placed</h1>
        <div className="mt-2 text-sm text-neutral-500">
          Reference <span className="font-mono text-amber-300" data-testid="shopbaked-order-number">{order.number}</span>
        </div>
      </div>

      <section className="border border-neutral-800 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-neutral-500 text-xs uppercase tracking-widest">Status</div>
            <div className="mt-1 font-medium text-neutral-100 capitalize">{order.status.replace(/_/g, " ")}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs uppercase tracking-widest">Payment</div>
            <div className="mt-1 font-medium text-neutral-100 capitalize">{(order.payment_provider || "").replace(/_/g, " ")}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs uppercase tracking-widest">Total</div>
            <div className="mt-1 font-medium text-amber-300">{order.total.toLocaleString()} {order.currency}</div>
          </div>
        </div>
      </section>

      {order.delivery_pin && order.status !== "delivered" && (
        <section
          className="border rounded-xl p-5 mb-6 flex items-center gap-4"
          style={{ borderColor: "rgba(252,196,76,.5)", background: "rgba(252,196,76,.08)" }}
          data-testid="shopbaked-order-pin-card"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
               style={{ background: "rgba(252,196,76,.2)", color: "#FCC44C" }}>
            <ShieldCheck size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "#FCC44C" }}>
              Delivery PIN
            </div>
            <div className="text-3xl font-black tracking-[0.3em] text-neutral-100 mt-1"
                 data-testid="shopbaked-order-pin">{order.delivery_pin}</div>
            <p className="text-xs text-neutral-400 mt-1">
              Share this PIN with the delivery person at the door. We won't mark the order delivered until it's entered.
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Also sent by SMS to your registered phone.
            </p>
          </div>
        </section>
      )}
      {order.status === "delivered" && (
        <section className="border rounded-xl p-5 mb-6 flex items-center gap-3"
                 style={{ borderColor: "rgba(119,188,31,.5)", background: "rgba(119,188,31,.08)" }}>
          <CheckCircle2 size={22} className="text-emerald-400" />
          <div>
            <div className="text-sm font-semibold text-neutral-100">Delivered</div>
            {order.delivered_at && (
              <div className="text-xs text-neutral-400">
                {new Date(order.delivered_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="border border-neutral-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-neutral-200 mb-3">Items</h2>
        <ul className="space-y-3">
          {(order.items || []).map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <div className="text-neutral-100 font-medium">{it.title}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  SKU {it.sku} · qty {it.quantity}
                  {Object.keys(it.attributes || {}).length > 0 && (
                    <> · {Object.entries(it.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</>
                  )}
                </div>
              </div>
              <div className="text-neutral-300 font-mono text-xs whitespace-nowrap">
                {it.line_total.toLocaleString()} {it.currency}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center gap-3">
        <Link to={basePath} className="pl-btn pl-btn-primary">Continue shopping</Link>
      </div>
    </div>
  );
};

export default ShopCheckout;
