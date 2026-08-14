/**
 * RestockSuggestionsPage — Partner Portal (Phase 4b).
 *
 * Shows the partner's own admin-generated replenishment suggestions with:
 *   * Bucket tabs (Suggested / Converted to PO / Cancelled)
 *   * Multi-select checkboxes
 *   * "Create Draft PO(s)" action that groups by primary supplier + creates
 *     one draft PO per supplier. Rows without an active supplier are shown
 *     in-place with a warning badge so buyers know why they were skipped.
 *
 * Depends on:
 *   GET  /api/partner/replenishments
 *   POST /api/partner/replenishments/convert-to-draft-po
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, CheckSquare, Square, PackageSearch, AlertTriangle, ArrowRight,
  Building2, Store, ClipboardCheck, X, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { partnerApi } from "./PartnerPortalApp";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

const BUCKETS = [
  { code: "suggested",        label: "To convert", color: "#77BC1F" },
  { code: "converted_to_po",  label: "Converted",  color: "#3B82F6" },
  { code: "cancelled",        label: "Cancelled",  color: "#94A3B8" },
];

export const RestockSuggestionsPage = () => {
  const nav = useNavigate();
  const [status, setStatus] = useState("suggested");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await partnerApi.get(`/partner/replenishments`, { params: { status } });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
      setSelected(new Set());
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  const selectableIds = useMemo(
    () => items.filter((it) => it.status === "suggested" && it.primary_supplier).map((it) => it.id),
    [items]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  };

  // Group preview: how many POs would be created, grouped by supplier
  const preview = useMemo(() => {
    const groups = {};
    let skipped = 0;
    for (const it of items) {
      if (!selected.has(it.id)) continue;
      if (!it.primary_supplier) { skipped += 1; continue; }
      const k = it.primary_supplier.id;
      groups[k] = groups[k] || { supplier: it.primary_supplier, warehouse: it.warehouse, count: 0, subtotal: 0, currency: it.primary_supplier.currency };
      groups[k].count += 1;
      groups[k].subtotal += it.suggested_qty * (it.primary_supplier.unit_cost || 0);
    }
    return { groups: Object.values(groups), skipped };
  }, [items, selected]);

  const convert = async () => {
    setBusy(true);
    try {
      const { data } = await partnerApi.post(`/partner/replenishments/convert-to-draft-po`, {
        suggestion_ids: Array.from(selected),
      });
      setResult(data);
      setConfirmOpen(false);
      if (data.created_pos.length > 0) toast.success(`${data.created_pos.length} draft PO(s) created`);
      else toast.error("No draft POs created — see skipped list");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="restock-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MARTbakēd · Restock</div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Sparkles size={18} className="text-primary" /> Restock Suggestions</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Turn low-stock alerts into ready-to-review draft POs — one click, no re-typing.
            Selected items are grouped by primary supplier; you can tweak quantities before submitting each draft.
          </p>
        </div>
        <button onClick={load} className="baked-btn baked-btn-ghost" data-testid="restock-refresh">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)}
              data-testid={`restock-bucket-${b.code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--muted-foreground)",
                border: `1px solid ${on ? b.color : "var(--border)"}`,
              }}>
              {b.label} <span className="opacity-75">({buckets[b.code] || 0})</span>
            </button>
          );
        })}
      </div>

      {/* Bulk-select bar */}
      {status === "suggested" && items.length > 0 && (
        <div className="baked-card bg-card border border-border p-3 flex items-center gap-4 flex-wrap">
          <button onClick={toggleAll} className="text-xs flex items-center gap-2 font-medium text-foreground" data-testid="restock-select-all">
            {allSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} className="text-muted-foreground" />}
            {allSelected ? "Unselect all" : `Select all convertible (${selectableIds.length})`}
          </button>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs font-medium text-foreground" data-testid="restock-selected-count">
            {selected.size} selected
          </span>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                → {preview.groups.length} draft PO(s){preview.skipped > 0 && ` · ${preview.skipped} skipped`}
              </span>
              <button onClick={() => setConfirmOpen(true)} className="ml-auto baked-btn baked-btn-primary" data-testid="restock-convert-open">
                <ArrowRight size={14} /> Create Draft PO(s)
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 w-10"></th>
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">Warehouse</th>
              <th className="text-right p-3">Current</th>
              <th className="text-right p-3">Suggested qty</th>
              <th className="text-left p-3">Primary supplier</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground" data-testid="restock-empty">
                No restock suggestions in this bucket. When inventory dips below its threshold, admin generates
                a suggestion here that you can convert to a draft PO in one click.
              </td></tr>
            )}
            {items.map((it) => {
              const sel = selected.has(it.id);
              const canPick = it.status === "suggested" && !!it.primary_supplier;
              return (
                <tr key={it.id} className="border-t border-border" data-testid={`restock-row-${it.id}`}>
                  <td className="p-3">
                    <button
                      onClick={() => canPick && toggle(it.id)}
                      disabled={!canPick}
                      className="disabled:opacity-30"
                      data-testid={`restock-check-${it.id}`}>
                      {sel ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} className="text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="font-medium leading-snug text-foreground">{it.product?.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{it.product?.sku_code || "—"}</div>
                    {it.reason && <div className="text-[10px] text-muted-foreground italic">{it.reason}</div>}
                  </td>
                  <td className="p-3 text-xs text-foreground">
                    <div className="flex items-center gap-1"><Store size={11} className="text-muted-foreground" />{it.warehouse?.code}</div>
                    <div className="text-[10px] text-muted-foreground">{it.warehouse?.city}</div>
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-foreground">{it.current_qty}</td>
                  <td className="p-3 text-right font-mono font-semibold text-foreground">{it.suggested_qty}</td>
                  <td className="p-3">
                    {it.primary_supplier ? (
                      <>
                        <div className="flex items-center gap-1 text-xs"><Building2 size={11} className="text-muted-foreground" /><span className="font-medium">{it.primary_supplier.business_name}</span></div>
                        <div className="text-[10px] font-mono text-muted-foreground">{it.primary_supplier.code} · {Number(it.primary_supplier.unit_cost).toFixed(2)} {it.primary_supplier.currency}/unit</div>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "rgba(255,76,82,.12)", color: "#FF4C52" }}
                        data-testid={`restock-nosupplier-${it.id}`}>
                        <AlertTriangle size={10} /> No approved supplier
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {it.status === "converted_to_po" && it.converted_po_id && (
                      <button onClick={() => nav(`/partner-portal/purchase-orders`)}
                        className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "rgba(59,130,246,.12)", color: "#3B82F6" }}
                        data-testid={`restock-po-link-${it.id}`}>
                        View draft PO →
                      </button>
                    )}
                    {it.status === "suggested" && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                        style={{ background: "rgba(119,188,31,.12)", color: "#77BC1F" }}>
                        Ready
                      </span>
                    )}
                    {it.status === "cancelled" && (
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cancelled</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmOpen(false)}>
          <div className="baked-card bg-card border border-border p-6 max-w-lg w-full" data-testid="restock-confirm-modal">
            <div className="flex items-center gap-2">
              <ArrowRight size={18} className="text-primary" />
              <div className="text-lg font-bold">Create draft PO(s)</div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              We&apos;ll create <span className="font-semibold text-primary">{preview.groups.length}</span> draft PO(s)
              from your <span className="font-semibold">{selected.size}</span> selected suggestion(s).
              Drafts are <strong>not submitted yet</strong> — you&apos;ll review and submit each in the Purchase Orders page.
            </p>

            <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
              {preview.groups.map((g, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 flex items-center gap-3">
                  <PackageSearch size={16} className="text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{g.supplier.business_name} <span className="text-[10px] font-mono text-muted-foreground">{g.supplier.code}</span></div>
                    <div className="text-[10px] text-muted-foreground">
                      {g.count} line(s) · {g.warehouse?.code} · est. {g.subtotal.toFixed(2)} {g.currency} (pre-tax)
                    </div>
                  </div>
                </div>
              ))}
              {preview.skipped > 0 && (
                <div className="text-[11px] rounded p-3 flex items-center gap-2"
                  style={{ background: "rgba(255,76,82,.10)", color: "#FF4C52" }}>
                  <AlertTriangle size={12} />
                  {preview.skipped} item(s) will be skipped (no primary supplier configured yet).
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmOpen(false)} className="baked-btn baked-btn-ghost" data-testid="restock-confirm-abort">Never mind</button>
              <button onClick={convert} disabled={busy} className="baked-btn baked-btn-primary" data-testid="restock-confirm-go">
                {busy ? "Creating…" : <><ClipboardCheck size={14} /> Yes, create drafts</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {result && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setResult(null)}>
          <div className="baked-card bg-card border border-border p-6 max-w-lg w-full" data-testid="restock-result-modal">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={18} className="text-primary" />
              <div className="text-lg font-bold">Conversion complete</div>
              <button onClick={() => setResult(null)} className="ml-auto" data-testid="restock-result-close"><X size={16} /></button>
            </div>
            {result.created_pos.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Draft POs created — review & submit them next:</div>
                {result.created_pos.map((po) => (
                  <button key={po.po_id} onClick={() => nav(`/partner-portal/purchase-orders`)}
                    className="w-full text-left border border-border rounded-lg p-3 flex items-center gap-3 hover:border-primary transition"
                    data-testid={`restock-result-po-${po.po_code}`}>
                    <PackageSearch size={16} className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono font-semibold">{po.po_code}</div>
                      <div className="text-[10px] text-muted-foreground">{po.supplier.business_name} · {po.line_count} line(s) · {po.grand_total.toFixed(2)} {po.currency}</div>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No draft POs were created.</div>
            )}
            {result.skipped.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#FF4C52" }}>
                  Skipped ({result.skipped.length})
                </div>
                <ul className="text-xs space-y-1">
                  {result.skipped.map((s) => (
                    <li key={s.suggestion_id} className="text-muted-foreground">
                      <span className="font-mono">{s.suggestion_id}</span> — <span className="italic">{s.reason.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button onClick={() => nav(`/partner-portal/purchase-orders`)} className="baked-btn baked-btn-primary" data-testid="restock-result-goto">
                Open Purchase Orders <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestockSuggestionsPage;
