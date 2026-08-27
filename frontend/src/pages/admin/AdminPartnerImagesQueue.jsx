/**
 * AdminPartnerImagesQueue — Phase 3 (2026-02-28) — Fixing_Prompt.docx v4.
 *
 * Review queue for supplier-uploaded product galleries. Suppliers modify
 * `partner_products.images[]` via the Phase 2 endpoints; approval mirrors
 * those images onto the linked `mart_products.images[]` so the customer
 * PDP sees them immediately.
 *
 * Backend:
 *   GET  /api/admin/mart-partner/partner-products/pending-images
 *   POST /api/admin/mart-partner/partner-products/{id}/images/approve
 *   POST /api/admin/mart-partner/partner-products/{id}/images/reject { note }
 *
 * Mounted at /admin/partner-images.
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Image as ImageIcon, RefreshCw } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const API = process.env.REACT_APP_BACKEND_URL;
const absUrl = (u) => (u?.startsWith("/api/") ? `${API}${u}` : u);

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminPartnerImagesQueue = () => {
  const [country, setCountry] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);      // { row, action, note }

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = country ? { country } : {};
      const { data } = await adminApi.get(
        "/admin/mart-partner/partner-products/pending-images", { params },
      );
      setItems(data.items || []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [country]);
  useEffect(() => { load(); }, [load]);

  const decide = async (row, action, note) => {
    try {
      const body = action === "reject" ? { note: (note || "").trim() } : undefined;
      await adminApi.post(
        `/admin/mart-partner/partner-products/${row.partner_product_id}/images/${action}`,
        body,
      );
      toast.success(action === "approve" ? "Gallery approved — live on PDP" : "Gallery rejected");
      setReviewing(null);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="admin-partner-images-queue">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Approval queue</div>
          <h1 className="text-2xl font-bold text-foreground">Partner Image Reviews</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Supplier-uploaded galleries awaiting sign-off. Approving mirrors the images onto the master product so the customer PDP updates instantly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className="h-9 px-3 text-sm rounded-lg bg-card border border-border text-foreground"
                  data-testid="admin-images-country-filter">
            <option value="">All countries</option>
            <option value="CI">Côte d&apos;Ivoire</option>
            <option value="IN">India</option>
          </select>
          <button onClick={load}
                  className="h-9 px-3 text-sm rounded-lg bg-card border border-border text-foreground flex items-center gap-1.5"
                  data-testid="admin-images-refresh">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ImageIcon size={26} className="mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3" data-testid="admin-images-empty">
            {busy ? "Loading…" : "No pending galleries. All caught up."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((row) => (
            <ReviewCard key={row.partner_product_id} row={row}
                        onApprove={() => decide(row, "approve")}
                        onReject={() => setReviewing({ row, note: "" })} />
          ))}
        </div>
      )}

      {/* Reject-with-note modal */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
             style={{ background: "rgba(6,8,14,.7)", backdropFilter: "blur(6px)" }}
             onClick={() => setReviewing(null)}
             data-testid="admin-reject-modal">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">Reject gallery</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tell the supplier what to fix. This note is delivered to their portal instantly.
            </p>
            <textarea value={reviewing.note}
                      onChange={(e) => setReviewing({ ...reviewing, note: e.target.value })}
                      rows={4}
                      placeholder="e.g. Primary image is blurry — please re-shoot at higher resolution."
                      className="mt-3 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                      data-testid="admin-reject-note-input" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setReviewing(null)}
                      className="px-4 h-10 rounded-lg text-sm text-muted-foreground"
                      data-testid="admin-reject-cancel">Cancel</button>
              <button disabled={!reviewing.note.trim()}
                      onClick={() => decide(reviewing.row, "reject", reviewing.note)}
                      className="px-4 h-10 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: "#FF4C52" }}
                      data-testid="admin-reject-submit">
                Send rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReviewCard = ({ row, onApprove, onReject }) => (
  <div className="rounded-2xl border border-border bg-card p-5"
       data-testid={`review-card-${row.partner_product_id}`}>
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground">{row.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.partner_name} · {row.country || "—"}
          {row.sku_code && <> · SKU {row.sku_code}</>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onReject}
                className="h-9 px-3 text-sm rounded-lg border flex items-center gap-1.5"
                style={{ borderColor: "#FF4C52", color: "#FF4C52" }}
                data-testid={`review-reject-${row.partner_product_id}`}>
          <XCircle size={14} /> Reject
        </button>
        <button onClick={onApprove}
                className="h-9 px-3 text-sm rounded-lg font-medium text-white flex items-center gap-1.5"
                style={{ background: "#77BC1F" }}
                data-testid={`review-approve-${row.partner_product_id}`}>
          <CheckCircle2 size={14} /> Approve
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <ImageColumn label="Currently live" testid={`review-master-${row.partner_product_id}`}
                   images={row.master_images} />
      <ImageColumn label="Supplier proposed" testid={`review-partner-${row.partner_product_id}`}
                   images={row.partner_images} highlight />
    </div>
  </div>
);

const ImageColumn = ({ label, images, testid, highlight = false }) => (
  <div className="rounded-xl border p-3"
       style={{ borderColor: highlight ? "var(--primary, #77BC1F)" : "hsl(var(--border))",
                background: "hsl(var(--background))" }}
       data-testid={testid}>
    <div className="text-[10px] uppercase tracking-widest font-semibold mb-2"
         style={{ color: highlight ? "#77BC1F" : "hsl(var(--muted-foreground))" }}>
      {label}
    </div>
    {(!images || images.length === 0) ? (
      <div className="h-24 grid place-items-center text-xs text-muted-foreground">
        No images
      </div>
    ) : (
      <div className="grid grid-cols-4 gap-2">
        {images.slice(0, 8).map((src, i) => (
          <div key={src + i} className="aspect-square rounded-lg overflow-hidden bg-black/10 relative">
            <img src={absUrl(src)} alt="" className="w-full h-full object-cover" loading="lazy" />
            {i === 0 && (
              <span className="absolute top-1 left-1 text-[8px] uppercase tracking-widest px-1 py-0.5 rounded"
                    style={{ background: "rgba(0,0,0,.6)", color: "white" }}>1°</span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

export default AdminPartnerImagesQueue;
