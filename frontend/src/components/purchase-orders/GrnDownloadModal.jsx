/**
 * GrnDownloadModal — shared "Download GRN" dialog used by Partner, Supplier,
 * and Super Admin PO detail pages (Phase 4).
 *
 * Given an `apiClient` (an axios instance already carrying the caller's auth
 * header) and a `basePath` like `/partner/purchase-orders/po_xxx`, it lists
 * one consolidated GRN plus every registered receipt, each with PDF + Excel
 * download buttons. Downloads run through the client so credentials travel
 * with them; the blob is materialised into an anchor + auto-click.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FileText, X, Download, FileSpreadsheet, Clock } from "lucide-react";
import { toast } from "sonner";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

const btnCls = "px-3 h-9 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition";
const btnStyle = {
  color: "#77BC1F",
  background: "rgba(119,188,31,.10)",
  borderColor: "rgba(119,188,31,.5)",
};
const btnStyleDisabled = { ...btnStyle, opacity: 0.5 };

export const GrnDownloadModal = ({
  poCode, basePath, apiClient, onClose,
  variant = "default", // "default" | "partner" | "supplier" | "admin" — used only for testid prefix
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState(null); // e.g. "consolidated:pdf" | receipt.id + ":xlsx"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`${basePath}/grn`);
      setData(data);
    } catch (e) { toast.error(errMsg(e)); onClose(); }
    finally { setLoading(false); }
  }, [apiClient, basePath, onClose]);
  useEffect(() => { load(); }, [load]);

  const download = async (url, filename, key) => {
    setBusyKey(key);
    try {
      const res = await apiClient.get(url, { responseType: "blob" });
      const blob = new Blob([res.data], { type: res.headers?.["content-type"] || "application/octet-stream" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success(`Downloaded ${filename}`);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusyKey(null); }
  };

  const testid = (suffix) => `${variant === "default" ? "grn" : `${variant}-grn`}-${suffix}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: "#0F1A0A", color: "#F1F5F9", border: "1px solid rgba(148,163,184,.25)" }}
        data-testid={testid("modal")}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(119,188,31,.15)", color: "#77BC1F" }}>
            <FileText size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "#94A3B8" }}>Goods Received Notes</div>
            <div className="text-lg font-bold">Download GRN · <span className="font-mono">{poCode}</span></div>
          </div>
          <button onClick={onClose} data-testid={testid("close")} className="p-1 rounded hover:bg-white/10" style={{ color: "#94A3B8" }}><X size={18} /></button>
        </div>

        {loading && <div className="text-sm p-6 text-center" style={{ color: "#94A3B8" }} data-testid={testid("loading")}>Loading GRNs…</div>}

        {!loading && data && (
          <div className="space-y-3">
            {/* Consolidated */}
            <div className="rounded-lg p-4 flex items-center gap-3 flex-wrap"
              style={{ background: "rgba(119,188,31,.08)", border: "1px solid rgba(119,188,31,.35)" }}
              data-testid={testid("row-consolidated")}>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "#77BC1F" }}>Consolidated</div>
                <div className="text-sm font-medium font-mono">{data.consolidated.reference}</div>
                <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                  Cumulative snapshot of every receipt against this PO.
                </div>
              </div>
              <button onClick={() => download(`${basePath}/grn.pdf`, `${data.consolidated.reference}.pdf`, "consolidated:pdf")}
                disabled={busyKey === "consolidated:pdf"}
                className={btnCls}
                style={busyKey === "consolidated:pdf" ? btnStyleDisabled : btnStyle}
                data-testid={testid("consolidated-pdf")}>
                <Download size={12} /> {busyKey === "consolidated:pdf" ? "…" : "PDF"}
              </button>
              <button onClick={() => download(`${basePath}/grn.xlsx`, `${data.consolidated.reference}.xlsx`, "consolidated:xlsx")}
                disabled={busyKey === "consolidated:xlsx"}
                className={btnCls}
                style={busyKey === "consolidated:xlsx" ? btnStyleDisabled : btnStyle}
                data-testid={testid("consolidated-xlsx")}>
                <FileSpreadsheet size={12} /> {busyKey === "consolidated:xlsx" ? "…" : "Excel"}
              </button>
            </div>

            {/* Per-receipt */}
            {data.receipts.length === 0 && (
              <div className="text-xs italic p-4 text-center rounded" style={{ color: "#94A3B8", border: "1px dashed rgba(148,163,184,.4)" }}
                data-testid={testid("no-receipts")}>
                No receipts registered yet. Once the buyer records goods received, per-receipt GRNs appear here.
              </div>
            )}
            {data.receipts.map((r) => (
              <div key={r.id} className="rounded-lg p-4 flex items-center gap-3 flex-wrap"
                style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(148,163,184,.20)" }}
                data-testid={testid(`row-receipt-${r.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1" style={{ color: "#94A3B8" }}>
                    <Clock size={10} /> Receipt #{r.sequence}
                  </div>
                  <div className="text-sm font-medium font-mono">{r.reference}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
                    Received {new Date(r.received_at).toLocaleString()}
                    {r.notes && <span> · {r.notes}</span>}
                  </div>
                </div>
                <button onClick={() => download(`${basePath}/receipts/${r.id}/grn.pdf`, `${r.reference}.pdf`, `${r.id}:pdf`)}
                  disabled={busyKey === `${r.id}:pdf`}
                  className={btnCls}
                  style={busyKey === `${r.id}:pdf` ? btnStyleDisabled : btnStyle}
                  data-testid={testid(`receipt-${r.id}-pdf`)}>
                  <Download size={12} /> {busyKey === `${r.id}:pdf` ? "…" : "PDF"}
                </button>
                <button onClick={() => download(`${basePath}/receipts/${r.id}/grn.xlsx`, `${r.reference}.xlsx`, `${r.id}:xlsx`)}
                  disabled={busyKey === `${r.id}:xlsx`}
                  className={btnCls}
                  style={busyKey === `${r.id}:xlsx` ? btnStyleDisabled : btnStyle}
                  data-testid={testid(`receipt-${r.id}-xlsx`)}>
                  <FileSpreadsheet size={12} /> {busyKey === `${r.id}:xlsx` ? "…" : "Excel"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 h-9 rounded-lg text-xs font-semibold" style={{ background: "rgba(148,163,184,.15)", color: "#F1F5F9" }} data-testid={testid("done")}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default GrnDownloadModal;
