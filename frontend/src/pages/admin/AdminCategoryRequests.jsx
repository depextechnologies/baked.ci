/**
 * Super Admin — Category Requests (Phase 1).
 *
 * Partner-store submits new category → SA reviews → approve merges into
 * mart_categories, reject requires notes. Nested under MARTbakēd module.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayersIcon, CheckCircle2, XCircle, X } from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return Array.isArray(d) ? d.map(x => x?.msg).filter(Boolean).join(" · ") : (d || e?.message || "Error");
};
const STATUS = {
  pending:  { label: "Pending",  color: "#FCC44C" },
  approved: { label: "Approved", color: "#77BC1F" },
  rejected: { label: "Rejected", color: "#FF4C52" },
};

export const AdminCategoryRequests = () => {
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [status, setStatus] = useState("pending");
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState("");
  const [icon, setIcon] = useState("");

  const load = async () => {
    const { data } = await adminApi.get(`/admin/mart/category-requests?status=${status}`);
    setItems(data.items || []); setBuckets(data.buckets || {});
  };
  useEffect(() => { load(); }, [status]);

  const act = async (verb) => {
    if ((verb === "reject") && !notes.trim()) return toast.error("Rejection notes required");
    try {
      await adminApi.post(`/admin/mart/category-requests/${active.id}/${verb}`, { notes: notes || null, icon: icon || null });
      toast.success(`Request ${verb === "approve" ? "approved" : "rejected"}`);
      setActive(null); setNotes(""); setIcon(""); load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-category-requests">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd</div>
        <h2 className="text-xl font-bold flex items-center gap-2"><LayersIcon size={18} /> Category Requests</h2>
        <p className="text-xs text-muted-foreground">Every new category a partner or supplier proposes lands here for approval before it goes live in the marketplace.</p>
      </div>
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map(s => {
          const meta = STATUS[s]; const on = status === s;
          return (
            <button key={s} onClick={() => setStatus(s)} data-testid={`cat-req-tab-${s}`}
                    className="px-3 h-9 rounded-lg text-xs font-medium"
                    style={{ background: on ? `${meta.color}22` : "transparent", color: on ? meta.color : "var(--muted-foreground)",
                             border: "1px solid " + (on ? meta.color : "var(--border)") }}>
              {meta.label} <span className="opacity-75">({buckets[s] || 0})</span>
            </button>
          );
        })}
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr>
            <th className="text-left p-3">Proposed name</th>
            <th className="text-left p-3">Requester</th>
            <th className="text-left p-3">Type</th>
            <th className="text-left p-3">Country</th>
            <th className="text-left p-3">Reason</th>
            <th className="text-left p-3">Submitted</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No {STATUS[status].label.toLowerCase()} requests.</td></tr>
              : items.map(r => (
                <tr key={r.id} className="border-t border-border" data-testid={`cat-req-row-${r.id}`}>
                  <td className="p-3 font-medium">{r.name}<div className="text-[10px] text-muted-foreground font-mono">{r.slug_hint}</div></td>
                  <td className="p-3 text-xs">{r.requester_name || r.partner_name || r.supplier_name || "—"}</td>
                  <td className="p-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: (r.requester_kind === "supplier") ? "rgba(29,155,240,0.15)" : "rgba(119,188,31,0.15)",
                        color: (r.requester_kind === "supplier") ? "#1D9BF0" : "#77BC1F",
                      }}
                      data-testid={`cat-req-kind-${r.id}`}>
                      {r.requester_kind || "partner"}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{r.country}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-md truncate">{r.reason || "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right">
                    {r.status === "pending"
                      ? <button onClick={() => { setActive(r); setNotes(""); setIcon(""); }} className="text-xs px-3 h-8 rounded-lg font-medium" style={{ background: "#77BC1F", color: "#0a1200" }} data-testid={`cat-req-review-${r.id}`}>Review</button>
                      : r.review_notes && <span className="text-[10px] text-muted-foreground">{r.review_notes}</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Review category request</div>
                <div className="text-lg font-bold">{active.name}</div>
                <div className="text-xs text-muted-foreground">
                  Requested by <span className="font-medium">{active.requester_name || active.partner_name || active.supplier_name}</span>
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold tracking-wider"
                    style={{
                      background: (active.requester_kind === "supplier") ? "rgba(29,155,240,0.15)" : "rgba(119,188,31,0.15)",
                      color: (active.requester_kind === "supplier") ? "#1D9BF0" : "#77BC1F",
                    }}>
                    {active.requester_kind || "partner"}
                  </span>
                </div>
              </div>
              <button onClick={() => setActive(null)}><X size={16} /></button>
            </div>
            <div className="text-xs text-muted-foreground whitespace-pre-wrap">{active.reason || "No reason provided."}</div>
            <input placeholder="Icon (lucide name, optional)" value={icon} onChange={e => setIcon(e.target.value)} className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="cat-req-icon" />
            <textarea placeholder="Review notes (required to reject)" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="cat-req-notes" />
            <div className="flex justify-end gap-2">
              <button onClick={() => act("reject")} className="px-4 h-10 rounded-lg text-sm" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="cat-req-reject"><XCircle size={14} className="inline mr-1" /> Reject</button>
              <button onClick={() => act("approve")} className="px-4 h-10 rounded-lg text-sm font-medium" style={{ background: "#77BC1F", color: "#0a1200" }} data-testid="cat-req-approve"><CheckCircle2 size={14} className="inline mr-1" /> Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategoryRequests;
