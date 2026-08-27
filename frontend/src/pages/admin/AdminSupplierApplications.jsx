/**
 * Super Admin — MARTbakēd Supplier Applications review UI.
 *
 * Buckets: draft / submitted / under_review / action_required / approved / rejected
 * Actions: approve · reject (notes required) · request info (notes required) · suspend / unsuspend
 * Detail drawer surfaces the full supplier snapshot + audit trail.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, CheckCircle2, X, AlertTriangle, Search, ExternalLink,
  FileText, MapPin, User2, Landmark, Tags, ShieldCheck, PauseCircle, PlayCircle,
  Warehouse as WarehouseIcon, Star,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const BUCKETS = [
  { code: "submitted",       label: "Submitted",       color: "#3B82F6" },
  { code: "under_review",    label: "Under Review",    color: "#8B5CF6" },
  { code: "action_required", label: "Action Required", color: "#F97316" },
  { code: "approved",        label: "Approved",        color: "#77BC1F" },
  { code: "rejected",        label: "Rejected",        color: "#FF4C52" },
  { code: "draft",           label: "Draft",           color: "#6B7280" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

export const AdminSupplierApplications = ({ embedded = false }) => {
  const [status, setStatus] = useState("submitted");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [action, setAction] = useState(null); // "approve" | "reject" | "request-info" | "suspend" | "unsuspend"
  const [notes, setNotes] = useState("");
  const nav = useNavigate();

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/suppliers/applications`, {
        params: { status, q: q || undefined },
      });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [status]);

  const openDetail = async (a) => {
    setActive(a); setDetail(null); setAction(null); setNotes("");
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/suppliers/applications/${a.id}`);
      setDetail(data);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const act = async (verb) => {
    if ((verb === "reject" || verb === "request-info" || verb === "suspend") && !notes.trim()) {
      return toast.error("Notes are required for this action.");
    }
    try {
      if (verb === "suspend" || verb === "unsuspend") {
        await adminApi.post(`/admin/modules/mart/suppliers/${detail.supplier.id}/${verb}`, { notes: notes || null });
      } else {
        await adminApi.post(`/admin/modules/mart/suppliers/applications/${active.id}/${verb}`, { notes: notes || null });
      }
      toast.success(`Application ${verb === "request-info" ? "action-required" : verb + "d"}`);
      setActive(null); setDetail(null); setAction(null); setNotes("");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-supplier-applications">
      {!embedded && (
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">MARTbakēd</div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Building2 size={18} /> Supplier Applications</h2>
          <p className="text-xs text-muted-foreground">Review, approve or request changes for MARTbakēd supplier applications. Suppliers are governed here — separate from Dark Store Partners.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          return (
            <button key={b.code} onClick={() => setStatus(b.code)} data-testid={`supplier-bucket-${b.code}`}
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
        <div className="flex-1" />
        <div className="flex items-center gap-2 min-w-[280px]">
          <Search size={14} className="text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search name, email, application code…"
            className="baked-input px-3 py-2 bg-secondary text-sm w-full" data-testid="supplier-search-input" />
          <button onClick={load} className="text-xs px-3 h-8 rounded-lg bg-secondary hover:bg-secondary/70" data-testid="supplier-search-btn">Search</button>
        </div>
      </div>

      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Business</th>
              <th className="text-left p-3">Application</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Submitted</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!busy && items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No {BUCKETS.find((b) => b.code === status)?.label.toLowerCase()} applications.</td></tr>}
            {items.map((it) => {
              const meta = BUCKETS.find((b) => b.code === it.status) || BUCKETS[0];
              return (
                <tr key={it.id} className="border-t border-border" data-testid={`supplier-row-${it.application_code}`}>
                  <td className="p-3">
                    <div className="font-medium">{it.supplier.business_name}</div>
                    {it.supplier.trading_name && <div className="text-[10px] text-muted-foreground">{it.supplier.trading_name}</div>}
                    <div className="text-[10px] text-muted-foreground">{it.supplier.business_email}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{it.application_code}</td>
                  <td className="p-3 text-xs">{it.supplier.business_type}</td>
                  <td className="p-3 text-xs">{it.supplier.country}</td>
                  <td className="p-3 text-xs text-muted-foreground">{it.submitted_at ? new Date(it.submitted_at).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
                  </td>
                  <td className="p-3 text-right">
                    {it.supplier?.status === "approved" ? (
                      <button onClick={() => nav(`/admin/modules/mart/suppliers/${it.supplier.id}`)}
                        className="text-xs px-3 h-8 rounded-lg font-medium"
                        style={{ background: "#77BC1F", color: "#0a1200" }}
                        data-testid={`supplier-open-${it.application_code}`}>Open workspace</button>
                    ) : (
                      <button onClick={() => openDetail(it)} className="text-xs px-3 h-8 rounded-lg font-medium"
                        style={{ background: "#77BC1F", color: "#0a1200" }}
                        data-testid={`supplier-review-${it.application_code}`}>Review</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {active && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="w-full max-w-3xl bg-card border-l border-border h-full flex flex-col" data-testid="supplier-detail-drawer">
            {!detail ? (
              <div className="p-8 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-6 border-b border-border bg-card z-10">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#77BC1F22", color: "#77BC1F" }}>
                    <Building2 size={22} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-mono text-muted-foreground">{detail.application.application_code}</div>
                    <div className="text-lg font-bold">{detail.supplier.business_name}</div>
                    <div className="text-xs text-muted-foreground">{detail.supplier.business_email} · {detail.supplier.country}</div>
                  </div>
                  <button onClick={() => setActive(null)} data-testid="supplier-detail-close"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Status banner */}
                  <div className="p-4 rounded-xl flex items-center gap-3"
                    style={{ background: `${(BUCKETS.find((b) => b.code === detail.supplier.status) || {}).color || "#3B82F6"}22`, color: (BUCKETS.find((b) => b.code === detail.supplier.status) || {}).color || "#3B82F6" }}>
                    <ShieldCheck size={16} />
                    <div className="text-sm font-semibold uppercase tracking-widest">
                      {(BUCKETS.find((b) => b.code === detail.supplier.status) || {}).label || detail.supplier.status}
                    </div>
                    {detail.supplier.code && <div className="text-xs ml-auto font-mono">Supplier {detail.supplier.code}</div>}
                  </div>

                  {/* Business */}
                  <DetailCard title="Business information" icon={Building2}>
                    <Row label="Legal name" value={detail.supplier.business_name} />
                    <Row label="Trading name" value={detail.supplier.trading_name || "—"} />
                    <Row label="Business type" value={detail.supplier.business_type} />
                    <Row label="Registration" value={detail.supplier.registration_number || "—"} />
                    <Row label="Tax ID" value={detail.supplier.tax_id || "—"} />
                    <Row label="Website" value={detail.supplier.website ? <a href={detail.supplier.website} className="underline" target="_blank" rel="noreferrer">{detail.supplier.website}</a> : "—"} />
                    <Row label="Years in operation" value={detail.supplier.years_in_operation || "—"} />
                    <Row label="Phone verified" value={detail.supplier.phone_verified ? "✓ Yes" : "—"} />
                    <Row label="Business phone" value={detail.supplier.business_phone || "—"} />
                    <Row label="Default currency" value={detail.supplier.default_currency} />
                  </DetailCard>

                  {/* Owner */}
                  {detail.contacts?.length > 0 && (
                    <DetailCard title="Owner / representative" icon={User2}>
                      {detail.contacts.map((c) => (
                        <div key={c.id} className="space-y-1 pb-3 mb-3 border-b border-border last:border-none last:mb-0 last:pb-0">
                          <Row label="Name" value={c.full_name} />
                          <Row label="Position" value={c.position || "—"} />
                          <Row label="Email" value={c.email || "—"} />
                          <Row label="Phone" value={c.phone || "—"} />
                          <Row label="Relationship" value={c.relationship} />
                          {c.id_document_url && <Row label="ID Document" value={<a href={c.id_document_url} className="underline" target="_blank" rel="noreferrer"><ExternalLink size={12} className="inline" /> Open</a>} />}
                        </div>
                      ))}
                    </DetailCard>
                  )}

                  {/* Locations */}
                  {detail.supply_locations?.length > 0 && (
                    <DetailCard title="Locations & coverage" icon={MapPin}>
                      {detail.supply_locations.map((l) => (
                        <div key={l.id} className="flex justify-between gap-3 py-1.5 text-xs">
                          <div>
                            <span className="font-medium text-foreground">{l.label || l.city || l.zone || l.country}</span>
                            <span className="text-muted-foreground"> · {l.kind}</span>
                          </div>
                          <span className="text-muted-foreground text-right">{l.city || "—"} · {l.country || "—"}{l.latitude ? ` · ${l.latitude.toFixed(3)}, ${l.longitude.toFixed(3)}` : ""}</span>
                        </div>
                      ))}
                    </DetailCard>
                  )}

                  {/* Categories */}
                  {detail.categories?.length > 0 && (
                    <DetailCard title="Category interests" icon={Tags}>
                      <div className="flex flex-wrap gap-2">
                        {detail.categories.map((c) => (
                          <span key={c.id} className="text-xs px-3 py-1 rounded-full"
                            style={{ background: c.status === "pending" ? "rgba(252,196,76,.15)" : "rgba(119,188,31,.15)",
                                     color: c.status === "pending" ? "#FCC44C" : "#77BC1F" }}>
                            {c.category_id ? "✓ " + c.category_id : "⏳ " + c.requested_name}
                          </span>
                        ))}
                      </div>
                    </DetailCard>
                  )}

                  {/* Documents */}
                  {detail.documents?.length > 0 && (
                    <DetailCard title="Documents" icon={FileText}>
                      {detail.documents.map((d) => (
                        <div key={d.id} className="flex justify-between items-center gap-3 py-1.5 text-xs">
                          <div>
                            <span className="font-medium text-foreground">{d.title || d.document_type}</span>
                            <span className="text-muted-foreground"> · {d.document_type}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <a href={d.file_url} target="_blank" rel="noreferrer" className="underline"><ExternalLink size={12} className="inline" /> Open</a>
                            <span className="text-[10px] uppercase text-muted-foreground">{d.verification_status}</span>
                          </div>
                        </div>
                      ))}
                    </DetailCard>
                  )}

                  {/* Banking */}
                  {detail.bank_info && (
                    <DetailCard title="Banking & payment" icon={Landmark}>
                      <Row label="Method" value={detail.bank_info.preferred_method} />
                      <Row label="Bank" value={detail.bank_info.bank_name || "—"} />
                      <Row label="Holder" value={detail.bank_info.account_holder || "—"} />
                      <Row label="Account" value={detail.bank_info.account_number ? `••••${detail.bank_info.account_number.slice(-4)}` : "—"} />
                      <Row label="Mobile Money" value={detail.bank_info.mobile_money_provider ? `${detail.bank_info.mobile_money_provider} · ${detail.bank_info.mobile_money_number || "—"}` : "—"} />
                    </DetailCard>
                  )}

                  {/* Warehouse assignments — Social.docx §9 */}
                  {(detail.supplier?.status === "approved" || detail.supplier?.status === "suspended") && (
                    <SupplierWarehousesCard supplierId={detail.supplier.id} />
                  )}

                  {/* Audit trail */}
                  <DetailCard title="Audit trail" icon={ShieldCheck}>
                    {(detail.audit_trail || []).length === 0 && <div className="text-xs text-muted-foreground">No actions yet.</div>}
                    <div className="space-y-2">
                      {(detail.audit_trail || []).map((a) => (
                        <div key={a.id} className="flex items-center gap-3 text-xs">
                          <span className="font-mono text-muted-foreground min-w-[130px]">{new Date(a.created_at).toLocaleString()}</span>
                          <span className="font-semibold uppercase" style={{ color: "#77BC1F" }}>{a.action}</span>
                          {a.from_status && <span className="text-muted-foreground">{a.from_status} → {a.to_status}</span>}
                          {a.notes && <span className="text-muted-foreground italic truncate">— {a.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </DetailCard>

                  {/* Action panel */}
                </div>

                <div className="p-4 border-t border-border bg-card z-10 shadow-lg" data-testid="supplier-action-footer">
                    {!action ? (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {["submitted", "under_review", "action_required"].includes(detail.application.status) && (
                          <>
                            <button onClick={() => setAction("reject")} className="pl-btn" style={{ background: "#FF4C52", color: "#fff", border: "1px solid #FF4C52" }} data-testid="supplier-btn-reject"><X size={14} /> Reject</button>
                            <button onClick={() => setAction("request-info")} className="pl-btn pl-btn-ghost" style={{ background: "rgba(148,163,184,.12)", color: "var(--pl-fg)", border: "1px solid rgba(148,163,184,.35)" }} data-testid="supplier-btn-request-info"><AlertTriangle size={14} /> Request info</button>
                            <button onClick={() => setAction("approve")} className="pl-btn" style={{ background: "#F5F5F0", color: "#0A1200", border: "2px solid #0A1200", fontWeight: 700 }} data-testid="supplier-btn-approve"><CheckCircle2 size={14} /> Approve</button>
                          </>
                        )}
                        {detail.supplier.status === "approved" && (
                          <button onClick={() => setAction("suspend")} className="pl-btn pl-btn-ghost" style={{ color: "#F97316" }} data-testid="supplier-btn-suspend"><PauseCircle size={14} /> Suspend</button>
                        )}
                        {detail.supplier.status === "suspended" && (
                          <button onClick={() => act("unsuspend")} className="pl-btn pl-btn-primary" data-testid="supplier-btn-unsuspend"><PlayCircle size={14} /> Unsuspend</button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3" data-testid={`supplier-action-panel-${action}`}>
                        <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
                          {action === "approve" ? "Approve — this activates the supplier, generates the seller_slug, and unlocks the portal activation link"
                            : action === "reject" ? "Reject (notes required)"
                            : action === "request-info" ? "Request additional information (notes required)"
                            : "Suspend supplier (notes required)"}
                        </div>
                        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                          placeholder="Notes..." className="baked-input px-3 py-2 bg-secondary text-sm w-full"
                          data-testid="supplier-action-notes" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setAction(null); setNotes(""); }} className="pl-btn pl-btn-ghost" data-testid="supplier-action-cancel">Cancel</button>
                          <button onClick={() => act(action)}
                            className="pl-btn"
                            style={action === "reject"
                              ? { background: "#FF4C52", color: "#fff", border: "1px solid #FF4C52" }
                              : action === "approve"
                              ? { background: "#F5F5F0", color: "#0A1200", border: "2px solid #0A1200", fontWeight: 700 }
                              : { background: "rgba(148,163,184,.15)", color: "var(--pl-fg)", border: "1px solid rgba(148,163,184,.35)" }}
                            data-testid="supplier-action-confirm">Confirm {action}</button>
                        </div>
                      </div>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DetailCard = ({ title, icon: Icon, children }) => (
  <div className="rounded-xl border border-border p-4 bg-secondary/20">
    <div className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
      <Icon size={12} /> {title}
    </div>
    <div>{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 text-xs py-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value ?? "—"}</span>
  </div>
);

// Social.docx §9 — Warehouse assignments for a supplier
const SupplierWarehousesCard = ({ supplierId }) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/modules/mart/suppliers/${supplierId}/warehouses`);
      setData(data);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supplierId]);

  const assign = async (warehouse_id, is_primary) => {
    try {
      await adminApi.post(`/admin/modules/mart/suppliers/${supplierId}/warehouses`, {
        warehouse_id, is_primary,
      });
      toast.success(is_primary ? "Assigned as primary" : "Assigned");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const unassign = async (warehouse_id, code) => {
    if (!window.confirm(`Unassign ${code}?`)) return;
    try {
      await adminApi.delete(`/admin/modules/mart/suppliers/${supplierId}/warehouses/${warehouse_id}`);
      toast.success("Unassigned");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const setPrimary = async (warehouse_id) => assign(warehouse_id, true);

  return (
    <DetailCard title="Warehouse assignments" icon={WarehouseIcon}>
      <p className="text-[11px] text-muted-foreground mb-3">
        Bind this supplier to specific darkstores or fulfilment centres. Only assigned
        warehouses will see this supplier in their replenishment flows.
      </p>
      {busy && !data ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div data-testid="supplier-assignments-list">
            {(data?.assignments || []).length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2" data-testid="supplier-assignments-empty">
                No warehouses assigned yet.
              </div>
            ) : (
              (data.assignments).map(a => (
                <div key={a.id}
                     className="flex items-center gap-2 py-2 text-xs"
                     style={{ borderBottom: "1px solid var(--border, rgba(148,163,184,.15))" }}
                     data-testid={`supplier-assignment-${a.warehouse_id}`}>
                  <WarehouseIcon size={12} style={{ color: a.is_primary ? "#77BC1F" : "var(--muted-foreground)" }} />
                  <span className="font-mono">{a.warehouse?.code}</span>
                  <span className="text-muted-foreground">{a.warehouse?.name}</span>
                  {a.is_primary && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1"
                          style={{ background: "rgba(119,188,31,.15)", color: "#77BC1F" }}>
                      <Star size={10} /> Primary
                    </span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {!a.is_primary && (
                      <button onClick={() => setPrimary(a.warehouse_id)}
                              className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                              style={{ color: "#77BC1F", border: "1px solid rgba(119,188,31,.4)" }}
                              data-testid={`supplier-assignment-primary-${a.warehouse_id}`}>
                        Make primary
                      </button>
                    )}
                    <button onClick={() => unassign(a.warehouse_id, a.warehouse?.code)}
                            className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                            style={{ color: "#FF4C52", border: "1px solid rgba(255,76,82,.4)" }}
                            data-testid={`supplier-assignment-remove-${a.warehouse_id}`}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add form */}
          {(() => {
            const unassigned = (data?.eligible || []).filter(w => !w.is_assigned);
            return unassigned.length > 0 ? (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] uppercase tracking-widest mb-2 text-muted-foreground">
                  Add warehouse
                </div>
                <div className="space-y-1">
                  {unassigned.map(w => (
                    <div key={w.id} className="flex items-center gap-2 py-1.5 text-xs"
                         data-testid={`supplier-eligible-${w.id}`}>
                      <span className="font-mono">{w.code}</span>
                      <span className="text-muted-foreground flex-1">{w.name}</span>
                      <button onClick={() => assign(w.id, false)}
                              className="text-[10px] uppercase tracking-widest px-2 py-1 rounded"
                              style={{ background: "rgba(148,163,184,.15)", color: "var(--foreground, inherit)" }}
                              data-testid={`supplier-eligible-assign-${w.id}`}>
                        Assign
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </>
      )}
    </DetailCard>
  );
};

export default AdminSupplierApplications;
