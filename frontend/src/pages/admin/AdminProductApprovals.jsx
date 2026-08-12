/**
 * Admin — Partner Product Approval Queue
 *
 * Route: `/admin/modules/mart/approvals`.
 * Reviews custom SKUs submitted by partner stores. Approve / Reject /
 * Request Changes with mandatory notes.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MessageSquareWarning, Package, Clock } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Something went wrong");
};
const money = (n, c = "XOF") => `${Number(n || 0).toLocaleString()} ${c === "XOF" ? "CFA" : c}`;
const fmtDate = (s) => s ? new Date(s).toLocaleString() : "—";

const STATUS_META = {
  draft: { label: "Draft", color: "#8b8b8b" },
  pending: { label: "Pending", color: "#FCC44C" },
  approved: { label: "Approved", color: "#77BC1F" },
  rejected: { label: "Rejected", color: "#FF4C52" },
  changes_requested: { label: "Changes requested", color: "#1D9BF0" },
};

export const AdminProductApprovals = () => {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await adminApi.get(`/admin/mart/partner-products?status=${status}`);
    setItems(data.items || []);
    setBuckets(data.buckets || {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const act = async (verb) => {
    if (!active) return;
    if ((verb === "reject" || verb === "request-changes") && !notes.trim())
      return toast.error("Notes are required");
    setBusy(true);
    try {
      await adminApi.post(`/admin/mart/partner-products/${active.id}/${verb}`, { notes: notes || null });
      toast.success(`Product ${verb === "approve" ? "approved" : verb === "reject" ? "rejected" : "sent back for changes"}`);
      setActive(null); setNotes("");
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const TABS = ["pending", "approved", "rejected", "changes_requested"];

  return (
    <div className="space-y-5" data-testid="admin-product-approvals">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Package size={18} /> Partner Product Approvals</h2>
        <p className="text-xs text-muted-foreground">Every custom SKU created by a partner store lands here for review before it goes live.</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map(s => {
          const meta = STATUS_META[s];
          const count = buckets[s] || 0;
          const on = status === s;
          return (
            <button key={s} onClick={() => setStatus(s)}
                    data-testid={`approvals-tab-${s}`}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg ${on ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
                    style={on ? { backgroundColor: meta.color, color: "#0a1200" } : {}}>
              {meta.label} <span className="text-xs opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Product</th>
            <th className="text-left p-3">Partner</th>
            <th className="text-left p-3">SKU / Brand</th>
            <th className="text-left p-3">Price</th>
            <th className="text-left p-3">Submitted</th>
            <th className="text-left p-3">Status</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No products in this bucket.</td></tr>
              : items.map(p => (
                <tr key={p.id} className="border-t border-border" data-testid={`approval-row-${p.id}`}>
                  <td className="p-3 flex items-center gap-2">
                    {p.image ? <img src={p.image} alt="" className="w-9 h-9 rounded object-cover" /> : <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center"><Package size={16} /></div>}
                    <div>
                      <div className="font-medium">{p.name || "Untitled"}</div>
                      <div className="text-[10px] text-muted-foreground">{p.unit}</div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">{p.partner_name || p.partner_id}<div className="text-[10px] text-muted-foreground">{p.partner_country}</div></td>
                  <td className="p-3 text-xs font-mono">{p.sku_code || "—"}<div className="text-[10px] text-muted-foreground font-normal">{p.brand || ""}</div></td>
                  <td className="p-3 text-xs">{money(p.partner_price, p.currency)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{fmtDate(p.submitted_at)}</td>
                  <td className="p-3"><span className="baked-chip px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${STATUS_META[p.approval_status]?.color}22`, color: STATUS_META[p.approval_status]?.color }}>{STATUS_META[p.approval_status]?.label || p.approval_status}</span></td>
                  <td className="p-3">
                    <Button onClick={() => { setActive(p); setNotes(""); }} className="baked-btn bg-primary text-primary-foreground text-xs" data-testid={`approval-review-${p.id}`}>Review</Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Review dialog */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" data-testid="approval-drawer">
          <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Product review</div>
                <div className="text-lg font-bold">{active.name || "Untitled"}</div>
              </div>
              <button onClick={() => { setActive(null); setNotes(""); }} className="text-muted-foreground">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-[10px] uppercase text-muted-foreground">Partner</div><div>{active.partner_name}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Source</div><div>{active.source}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">SKU</div><div className="font-mono">{active.sku_code || "—"}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Price</div><div>{money(active.partner_price, active.currency)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Category</div><div>{active.category_slug || "—"}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Stock qty</div><div>{active.stock_qty}</div></div>
              <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground">Submitted</div><div className="text-xs">{fmtDate(active.submitted_at)}</div></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Review notes (required for reject / request changes)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                        className="baked-input w-full px-3 py-2 bg-secondary text-sm mt-1"
                        placeholder="Explain the reason…" data-testid="approval-notes" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button disabled={busy} onClick={() => act("request-changes")} className="baked-btn bg-[#1D9BF022] text-[#1D9BF0]" data-testid="approval-request-changes"><MessageSquareWarning size={14} className="mr-1" /> Request changes</Button>
              <Button disabled={busy} onClick={() => act("reject")} className="baked-btn bg-[#FF4C5222] text-[#FF4C52]" data-testid="approval-reject"><XCircle size={14} className="mr-1" /> Reject</Button>
              <Button disabled={busy} onClick={() => act("approve")} className="baked-btn bg-[#77BC1F] text-[#0a1200] font-semibold" data-testid="approval-approve"><CheckCircle2 size={14} className="mr-1" /> Approve</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductApprovals;
