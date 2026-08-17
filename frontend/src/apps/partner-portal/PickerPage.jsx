/**
 * Picker/Packer/Dispatch — tablet-first item-scan screen.
 *
 * Two-column layout (queue + active order). The scan input is always
 * focused so a USB barcode gun's keyboard emulation works out of the
 * box; on-screen keyboard also works — just tap the input and type.
 *
 * Route:
 *   /partner-portal/picker                         → queue only (no active)
 *   /partner-portal/picker/{partner_order_id}      → queue + active order
 *
 * RBAC: owner + manager + supervisor + packer.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ScanLine, Package, Plus, Minus, CheckCircle2, Loader2, RefreshCw,
  ClipboardCheck, ChevronRight, AlertCircle,
} from "lucide-react";
import { partnerApi } from "./PartnerPortalApp";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  return "Something went wrong";
};

const money = (n, cur = "XOF") => `${Number(n).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

const STATUS_META = {
  accepted: { bg: "rgba(120,120,255,.15)", fg: "#aab6ff", label: "Accepted" },
  packing:  { bg: "rgba(255,190,60,.15)",  fg: "#ffbf3c", label: "Packing" },
  ready:    { bg: "rgba(90,210,150,.15)",  fg: "#7ee6b0", label: "Ready" },
};

const ScanFeedback = ({ status }) => {
  // Small transient badge that flashes green/red after each scan.
  if (!status) return null;
  const color = status.ok ? "#7ee6b0" : "#ff9090";
  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1 rounded-full text-xs animate-pulse"
      style={{ background: `${color}22`, color, border: `1px solid ${color}` }}
      data-testid="picker-scan-feedback">
      {status.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {status.msg}
    </div>
  );
};

export const PickerPage = () => {
  const { partnerOrderId } = useParams();
  const nav = useNavigate();

  const [queue, setQueue] = useState({ items: [], buckets: { accepted: 0, packing: 0 } });
  const [active, setActive] = useState(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [scanFeedback, setScanFeedback] = useState(null);
  const [busyComplete, setBusyComplete] = useState(false);
  const scanRef = useRef(null);

  const loadQueue = useCallback(async () => {
    try {
      const { data } = await partnerApi.get("/partner/picker/queue");
      setQueue(data);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  const loadActive = useCallback(async (id) => {
    if (!id) { setActive(null); return; }
    setLoadingActive(true);
    try {
      const { data } = await partnerApi.get(`/partner/picker/orders/${id}`);
      setActive(data);
    } catch (e) {
      toast.error(errMsg(e));
      setActive(null);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { loadActive(partnerOrderId); }, [partnerOrderId, loadActive]);

  // Keep the scan input focused whenever an order is active — critical for
  // barcode-gun workflow (guns emit "code + Enter" as keyboard events).
  useEffect(() => {
    if (active && scanRef.current) scanRef.current.focus();
  }, [active?.id]);

  const flashScan = (ok, msg) => {
    setScanFeedback({ ok, msg });
    setTimeout(() => setScanFeedback(null), 1500);
  };

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    const code = scanValue.trim();
    if (!code || !active) return;
    try {
      const { data } = await partnerApi.post(`/partner/picker/orders/${active.id}/scan`, { code });
      setActive(data);
      flashScan(true, "Scanned");
      // If order flipped from accepted → packing, refresh the queue counts.
      if (active.status !== data.status) loadQueue();
    } catch (err) {
      flashScan(false, errMsg(err));
    } finally {
      setScanValue("");
      if (scanRef.current) scanRef.current.focus();
    }
  };

  const setItemQty = async (order_item_id, picked_qty) => {
    if (picked_qty < 0) return;
    try {
      const { data } = await partnerApi.post(`/partner/picker/orders/${active.id}/set-item`,
        { order_item_id, picked_qty });
      setActive(data);
      if (active.status !== data.status) loadQueue();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const completeOrder = async () => {
    if (!active) return;
    setBusyComplete(true);
    try {
      const { data } = await partnerApi.post(`/partner/picker/orders/${active.id}/complete`);
      toast.success(`${data.order_number} marked ready for handoff`);
      setActive(null);
      nav("/partner-portal/picker");
      loadQueue();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusyComplete(false); }
  };

  const openOrder = (id) => nav(`/partner-portal/picker/${id}`);

  const allComplete = useMemo(
    () => active && active.lines.length > 0 && active.lines.every(l => l.is_complete),
    [active],
  );

  return (
    <div className="space-y-6" data-testid="picker-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Fulfilment</div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--ph-fg)" }}>
            <ScanLine size={22} /> Picker
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ph-fg-muted)" }}>
            Scan each item into the pack. Tap the input and use a barcode gun or type manually.
          </p>
        </div>
        <button onClick={loadQueue} className="ph-btn" style={{ background: "var(--ph-bg-elevated)", color: "var(--ph-fg)", border: "1px solid var(--ph-border)" }} data-testid="picker-refresh">
          <RefreshCw size={14} /> Refresh queue
        </button>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(280px, 380px) 1fr" }}>
        {/* ---------- Queue column ---------- */}
        <div className="space-y-3" data-testid="picker-queue">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg-muted)" }}>
            <Package size={12} /> Queue
            <span className="ml-2 opacity-70">
              {queue.buckets.accepted} accepted · {queue.buckets.packing} packing
            </span>
          </div>
          {queue.items.length === 0 && (
            <div className="rounded-2xl p-6 text-sm text-center" data-testid="picker-queue-empty"
              style={{ background: "var(--ph-bg-elevated)", border: "1px dashed var(--ph-border)", color: "var(--ph-fg-muted)" }}>
              Nothing to pick right now. Accepted orders will appear here.
            </div>
          )}
          {queue.items.map((o) => {
            const isActive = active?.id === o.id;
            const meta = STATUS_META[o.status] || STATUS_META.accepted;
            return (
              <button key={o.id} onClick={() => openOrder(o.id)}
                data-testid={`picker-queue-item-${o.id}`}
                className="w-full text-left rounded-2xl p-4 transition-all"
                style={{
                  background: isActive ? "var(--ph-warm-soft)" : "var(--ph-bg-elevated)",
                  border: `1px solid ${isActive ? "var(--ph-accent-warm)" : "var(--ph-border)"}`,
                }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--ph-fg)" }}>{o.order_number}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--ph-fg-muted)" }}>
                      {o.item_count} items · {money(o.subtotal, o.currency)}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: meta.bg, color: meta.fg }}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ph-border)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${o.progress_pct}%`, background: o.progress_pct === 100 ? "#7ee6b0" : "var(--ph-accent-warm)" }} />
                  </div>
                  <div className="text-[10px] mt-1 flex items-center justify-between" style={{ color: "var(--ph-fg-muted)" }}>
                    <span>{o.picked_units}/{o.required_units} picked</span>
                    <ChevronRight size={12} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ---------- Active order column ---------- */}
        <div className="space-y-4" data-testid="picker-active">
          {!active && !loadingActive && (
            <div className="rounded-3xl p-10 text-center"
              style={{ background: "var(--ph-bg-elevated)", border: "1px dashed var(--ph-border)" }}
              data-testid="picker-empty">
              <ScanLine size={40} style={{ color: "var(--ph-fg-subtle)", margin: "0 auto 12px" }} />
              <div className="text-lg font-semibold" style={{ color: "var(--ph-fg)" }}>Pick an order to start scanning</div>
              <div className="text-sm mt-2" style={{ color: "var(--ph-fg-muted)" }}>
                Select an order from the queue on the left.
              </div>
            </div>
          )}
          {loadingActive && (
            <div className="rounded-3xl p-12 text-center" style={{ background: "var(--ph-bg-elevated)" }}>
              <Loader2 className="animate-spin mx-auto" size={24} style={{ color: "var(--ph-accent-warm)" }} />
            </div>
          )}
          {active && (
            <>
              {/* Progress hero */}
              <div className="rounded-3xl p-6"
                style={{ background: "var(--ph-bg-elevated)", border: "1px solid var(--ph-border)" }}
                data-testid="picker-progress-card">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Now picking</div>
                    <div className="text-2xl font-bold mt-1" style={{ color: "var(--ph-fg)" }}>
                      {active.order_number}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--ph-fg-muted)" }}>
                      {active.customer_address?.line1}
                      {active.customer_address?.city ? ` · ${active.customer_address.city}` : ""}
                      {active.delivery_slot_label ? ` · ${active.delivery_slot_label}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold" style={{ color: allComplete ? "#7ee6b0" : "var(--ph-accent-warm)" }}
                      data-testid="picker-progress-pct">
                      {active.progress_pct}%
                    </div>
                    <div className="text-xs" style={{ color: "var(--ph-fg-muted)" }}>
                      {active.picked_units}/{active.required_units} units
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: "var(--ph-border)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${active.progress_pct}%`, background: allComplete ? "#7ee6b0" : "var(--ph-accent-warm)" }} />
                </div>
              </div>

              {/* Scan input */}
              <form onSubmit={handleScanSubmit}
                className="relative flex items-center gap-3 rounded-2xl p-4"
                style={{ background: "var(--ph-card)", border: "2px solid var(--ph-accent-warm)" }}
                data-testid="picker-scan-form">
                <ScanLine size={20} style={{ color: "var(--ph-accent-warm)" }} />
                <input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  placeholder="Scan or type barcode / SKU · then Enter"
                  autoFocus
                  className="flex-1 bg-transparent text-lg outline-none"
                  style={{ color: "var(--ph-fg)" }}
                  data-testid="picker-scan-input"
                />
                <button type="submit" className="ph-btn ph-btn-warm" data-testid="picker-scan-submit">
                  Scan
                </button>
                <ScanFeedback status={scanFeedback} />
              </form>

              {/* Line items */}
              <div className="space-y-2" data-testid="picker-lines">
                {active.lines.map((l) => (
                  <div key={l.id}
                    data-testid={`picker-line-${l.id}`}
                    className="rounded-2xl p-4 flex items-center gap-4"
                    style={{
                      background: l.is_complete ? "rgba(90,210,150,.08)" : "var(--ph-bg-elevated)",
                      border: `1px solid ${l.is_complete ? "rgba(90,210,150,.4)" : "var(--ph-border)"}`,
                    }}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: "var(--ph-card)" }}>
                      {l.image ? <img src={l.image} alt={l.name} className="w-full h-full object-cover" />
                              : <Package size={20} style={{ color: "var(--ph-fg-subtle)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate" style={{ color: "var(--ph-fg)" }}>{l.name}</div>
                      <div className="text-[11px] flex items-center gap-2 mt-0.5" style={{ color: "var(--ph-fg-muted)" }}>
                        {l.brand ? <span>{l.brand}</span> : null}
                        {l.sku_code && <span className="font-mono">{l.sku_code}</span>}
                        {l.ean_upc && <span className="font-mono opacity-75">{l.ean_upc}</span>}
                        {l.unit && <span>· {l.unit}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setItemQty(l.id, Math.max(0, l.picked_qty - 1))}
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}
                        aria-label="decrement" data-testid={`picker-line-minus-${l.id}`}>
                        <Minus size={14} />
                      </button>
                      <div className="min-w-[64px] text-center font-mono text-lg"
                        style={{ color: l.is_complete ? "#7ee6b0" : "var(--ph-fg)" }}
                        data-testid={`picker-line-qty-${l.id}`}>
                        {l.picked_qty}<span className="opacity-50">/{l.required_qty}</span>
                      </div>
                      <button onClick={() => setItemQty(l.id, Math.min(l.required_qty, l.picked_qty + 1))}
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--ph-card)", color: "var(--ph-fg-muted)", border: "1px solid var(--ph-border)" }}
                        aria-label="increment" data-testid={`picker-line-plus-${l.id}`}>
                        <Plus size={14} />
                      </button>
                      {l.is_complete && <CheckCircle2 size={18} style={{ color: "#7ee6b0" }} />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Complete CTA */}
              <div className="sticky bottom-0 -mx-10 px-10 py-4"
                style={{ background: "linear-gradient(to top, var(--ph-bg) 60%, transparent)" }}>
                <button onClick={completeOrder}
                  disabled={!allComplete || busyComplete}
                  className="ph-btn ph-btn-warm w-full justify-center"
                  style={{ opacity: allComplete ? 1 : 0.55, cursor: allComplete ? "pointer" : "not-allowed" }}
                  data-testid="picker-complete-btn">
                  {busyComplete ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                  {allComplete ? "Mark ready for handoff" : `Pick all items to continue (${active.picked_units}/${active.required_units})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PickerPage;
