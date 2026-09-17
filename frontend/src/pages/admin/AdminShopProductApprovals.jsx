/**
 * Super Admin — SHOPbakēd Product Approvals.
 *
 * Route: /admin/modules/shop/approvals
 *
 * Sellers submit new SHOP products with status="pending_review". Admins
 * approve → status="active" (published) or reject → status="rejected".
 * Bulk actions available for the pending bucket.
 *
 * Backend: `/api/admin/modules/shop/product-requests` (see modules/shop/routes.py).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, CheckCircle2, XCircle, X, Package,
  Building2, Tags, ExternalLink,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const SHOP_ACCENT = "#FCC44C";

const BUCKETS = [
  { code: "pending",  label: "Pending",  color: "#3B82F6" },
  { code: "approved", label: "Approved", color: "#77BC1F" },
  { code: "rejected", label: "Rejected", color: "#FF4C52" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminShopProductApprovals = () => {
  const [bucket, setBucket] = useState("pending");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // "approve" | "reject"
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get("/admin/modules/shop/product-requests", {
        params: { bucket, country: "CI", limit: 200 },
      });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
      setSelected(new Set());
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [bucket]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (p) => {
    setActive(p); setDetail(null); setAction(null); setNotes("");
    try {
      const { data } = await adminApi.get(`/admin/modules/shop/product-requests/${p.id}`);
      setDetail(data);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const closeDrawer = () => { setActive(null); setDetail(null); setAction(null); setNotes(""); };

  const act = async (verb) => {
    if (verb === "reject" && !notes.trim()) {
      return toast.error("Rejection notes are required.");
    }
    try {
      await adminApi.post(`/admin/modules/shop/product-requests/${active.id}/${verb}`, { notes: notes || null });
      toast.success(verb === "approve" ? "Product approved" : "Product rejected");
      closeDrawer();
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const toggleOne = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };
  const bulkAction = async (verb) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      const { data } = await adminApi.post(`/admin/modules/shop/product-requests/bulk-${verb}`, { ids });
      const count = (data[verb === "approve" ? "approved" : "rejected"] || []).length;
      const blocked = (data.blocked || []).length;
      toast.success(`Bulk ${verb}: ${count} succeeded${blocked ? ` · ${blocked} blocked` : ""}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="space-y-5" data-testid="admin-shop-approvals">
      <div>
        <div className="text-xs uppercase tracking-widest" style={{ color: SHOP_ACCENT }}>SHOPbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck size={18} /> Product Approvals</h2>
        <p className="text-xs text-muted-foreground">Review products submitted by SHOP sellers. Approved products go live on the storefront immediately.</p>
      </div>

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const on = bucket === b.code;
          return (
            <button key={b.code} onClick={() => setBucket(b.code)}
              data-testid={`shop-approval-bucket-${b.code}`}
              className="px-3 h-9 rounded-lg text-xs font-medium"
              style={{
                background: on ? `${b.color}22` : "transparent",
                color: on ? b.color : "var(--muted-foreground)",
                border: `1px solid ${on ? b.color : "var(--border)"}`,
              }}>
              {b.label} <span className="opacity-70">({buckets[b.code] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {/* Bulk action bar */}
      {bucket === "pending" && selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border" data-testid="shop-approval-bulk-bar"
             style={{ background: `${SHOP_ACCENT}11`, borderColor: `${SHOP_ACCENT}66` }}>
          <div className="text-xs font-semibold">{selected.size} selected</div>
          <button onClick={() => bulkAction("approve")} data-testid="shop-approval-bulk-approve"
            className="h-8 px-3 rounded-lg text-xs font-semibold text-white hover:opacity-90"
            style={{ background: "#77BC1F" }}>
            <CheckCircle2 size={12} className="inline mr-1" /> Approve all
          </button>
          <button onClick={() => bulkAction("reject")} data-testid="shop-approval-bulk-reject"
            className="h-8 px-3 rounded-lg text-xs font-semibold text-white hover:opacity-90"
            style={{ background: "#FF4C52" }}>
            <XCircle size={12} className="inline mr-1" /> Reject all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden" data-testid="shop-approval-table">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              {bucket === "pending" && (
                <th className="w-10 pl-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    data-testid="shop-approval-select-all" />
                </th>
              )}
              <th className="text-left px-4 py-3">Product</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Variants</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {busy && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">Loading…</td></tr>}
            {!busy && items.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-xs">
                <Package size={22} className="mx-auto mb-2 opacity-50" />
                No products in this bucket.
              </td></tr>
            )}
            {!busy && items.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" data-testid={`shop-approval-row-${p.id}`} onClick={() => openDetail(p)}>
                {bucket === "pending" && (
                  <td className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      data-testid={`shop-approval-select-${p.id}`} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold">{p.title_fr || p.title}</div>
                  {p.title_fr && p.title && p.title_fr !== p.title && (
                    <div className="text-[11px] text-muted-foreground truncate">EN · {p.title}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {p.id}
                    {!p.title_fr && (
                      <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: "#FF4C5222", color: "#FF4C52" }}
                            data-testid={`shop-approval-missing-fr-${p.id}`}>
                        FR MISSING
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.supplier_id || "—"}</td>
                <td className="px-4 py-3 text-xs">{p.variant_count}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs font-semibold" style={{ color: SHOP_ACCENT }}>Review →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {active && (
        <div className="fixed inset-0 z-40 flex" data-testid="shop-approval-drawer" onClick={closeDrawer}>
          <div className="flex-1 bg-black/60" />
          <div className="w-full max-w-2xl bg-card border-l border-border h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-xs uppercase tracking-widest" style={{ color: SHOP_ACCENT }}>SHOP Product</div>
                <div className="text-lg font-bold truncate" data-testid="shop-approval-drawer-title">
                  {active.title_fr || active.title}
                </div>
                {active.title_fr && active.title && active.title_fr !== active.title && (
                  <div className="text-[11px] text-muted-foreground truncate">EN · {active.title}</div>
                )}
                {!active.title_fr && (
                  <div className="text-[11px] font-semibold mt-0.5" style={{ color: "#FF4C52" }}
                       data-testid="shop-approval-drawer-fr-missing">
                    ⚠ French title missing — customer will see the English fallback
                  </div>
                )}
              </div>
              <button onClick={closeDrawer} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary">
                <X size={16} />
              </button>
            </div>

            {!detail && <div className="p-6 text-xs text-muted-foreground">Loading detail…</div>}
            {detail && (
              <div className="p-5 space-y-5">
                {/* Images */}
                {detail.images?.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {detail.images.slice(0, 8).map((src, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden bg-secondary/40">
                        <img src={src} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Titles (FR + EN side-by-side) — lets admins catch broken French copy */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="shop-approval-titles-panel">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
                      <span>Titre · FR</span>
                      {!detail.title_fr && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "#FF4C5222", color: "#FF4C52" }}>
                          MISSING
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold whitespace-pre-wrap" data-testid="shop-approval-title-fr">
                      {detail.title_fr || <span className="text-muted-foreground italic">Non fourni — retombe sur l'anglais</span>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Title · EN</div>
                    <div className="text-sm font-semibold whitespace-pre-wrap" data-testid="shop-approval-title-en">
                      {detail.title}
                    </div>
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <MetaRow icon={Building2} label="Supplier" value={detail.supplier_id || "—"} mono />
                  <MetaRow icon={Tags} label="Category" value={detail.category_id || "—"} mono />
                  <MetaRow icon={Tags} label="Sub-category" value={detail.subcategory_id || "—"} mono />
                  <MetaRow label="Status" value={detail.status} />
                </div>

                {/* Descriptions (FR + EN side-by-side) */}
                {(detail.description || detail.description_fr) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="shop-approval-descriptions-panel">
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
                        <span>Description · FR</span>
                        {!detail.description_fr && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: "#FF4C5222", color: "#FF4C52" }}>
                            MISSING
                          </span>
                        )}
                      </div>
                      <div className="text-sm whitespace-pre-wrap" data-testid="shop-approval-description-fr">
                        {detail.description_fr || <span className="text-muted-foreground italic">Non fournie — retombe sur l'anglaise</span>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Description · EN</div>
                      <div className="text-sm whitespace-pre-wrap" data-testid="shop-approval-description-en">
                        {detail.description || <span className="text-muted-foreground italic">Not provided</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Variants */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Variants ({detail.variants?.length || 0})</div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <tr><th className="text-left px-3 py-2">SKU</th><th className="text-left px-3 py-2">Price</th><th className="text-left px-3 py-2">Stock</th><th className="text-left px-3 py-2">Attributes</th></tr>
                      </thead>
                      <tbody>
                        {detail.variants?.map((v) => (
                          <tr key={v.id} className="border-t border-border">
                            <td className="px-3 py-2 font-mono">{v.sku}{v.title_suffix ? ` · ${v.title_suffix}` : ""}</td>
                            <td className="px-3 py-2">{Number(v.price).toLocaleString()} {v.currency}</td>
                            <td className="px-3 py-2">{v.stock_qty}</td>
                            <td className="px-3 py-2 text-[10px] text-muted-foreground">
                              {Object.entries(v.attributes || {}).map(([k, val]) => `${k}=${val}`).join(" · ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-border">
                  {!action && (
                    <div className="flex gap-2">
                      <button onClick={() => setAction("approve")} data-testid="shop-approval-approve-btn"
                        className="flex-1 h-11 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                        style={{ background: "#77BC1F" }}>
                        <CheckCircle2 size={14} className="inline mr-1" /> Approve & publish
                      </button>
                      <button onClick={() => setAction("reject")} data-testid="shop-approval-reject-btn"
                        className="flex-1 h-11 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                        style={{ background: "#FF4C52" }}>
                        <XCircle size={14} className="inline mr-1" /> Reject
                      </button>
                      <a href={`/shop/p/${active.id}`} target="_blank" rel="noreferrer"
                        data-testid="shop-approval-preview"
                        className="h-11 px-4 rounded-xl text-sm font-semibold border border-border inline-flex items-center gap-1">
                        <ExternalLink size={13} /> Preview
                      </a>
                    </div>
                  )}
                  {action && (
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">
                        {action === "approve" ? "Approval notes (optional)" : "Rejection notes (required)"}
                      </div>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                        placeholder={action === "approve" ? "Optional internal note…" : "Why is this product being rejected?"}
                        data-testid="shop-approval-notes"
                        className="w-full p-3 rounded-lg bg-secondary border border-border text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => act(action)}
                          data-testid="shop-approval-confirm-btn"
                          className="flex-1 h-10 rounded-xl text-sm font-semibold text-white"
                          style={{ background: action === "approve" ? "#77BC1F" : "#FF4C52" }}>
                          Confirm {action}
                        </button>
                        <button onClick={() => { setAction(null); setNotes(""); }}
                          className="h-10 px-4 rounded-xl text-sm border border-border">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MetaRow = ({ icon: Icon, label, value, mono }) => (
  <div className="flex items-center gap-2">
    {Icon && <Icon size={14} className="text-muted-foreground shrink-0" />}
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-[11px] truncate" : "text-sm font-semibold"}>{value}</div>
    </div>
  </div>
);

export default AdminShopProductApprovals;
