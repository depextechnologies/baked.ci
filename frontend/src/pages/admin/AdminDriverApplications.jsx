/**
 * Super Admin — SENDbakēd Driver Applications review UI (Social.docx §5).
 *
 * Fixes the "new drivers get stuck in limbo" bug: previously no admin page
 * consumed the /api/admin/drivers endpoint, so every newly signed-up driver
 * was invisible even after submitting KYC.
 *
 * Buckets: onboarding · pending_review · approved · rejected · suspended
 * Actions: approve · reject (notes optional but recommended)
 *
 * Mounted at /admin/driver-applications.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bike, CheckCircle2, X, Search, User2, FileText, Phone, MapPin,
  Landmark, ShieldCheck, ExternalLink,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const BUCKETS = [
  { code: "onboarding",     label: "Onboarding",     color: "#94A3B8" },
  { code: "pending_review", label: "Pending Review", color: "#F97316" },
  { code: "approved",       label: "Approved",       color: "#77BC1F" },
  { code: "rejected",       label: "Rejected",       color: "#FF4C52" },
  { code: "suspended",      label: "Suspended",      color: "#8B5CF6" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Error";
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : "—";

export const AdminDriverApplications = () => {
  const [status, setStatus] = useState("pending_review");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [items, setItems] = useState([]);
  const [buckets, setBuckets] = useState({});
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [action, setAction] = useState(null);   // "approve" | "reject"
  const [notes, setNotes] = useState("");

  const load = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.get(`/admin/drivers`, {
        params: { status, q: q || undefined, country: country || undefined },
      });
      setItems(data.items || []);
      setBuckets(data.buckets || {});
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, country]);

  const act = async (verb) => {
    try {
      await adminApi.post(`/admin/drivers/${active.id}/${verb}`, { notes: notes || null });
      toast.success(verb === "approve" ? "Driver approved" : "Driver rejected");
      setAction(null); setNotes(""); setActive(null);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="p-6 space-y-4" data-testid="admin-driver-applications">
      <div className="flex items-center gap-3 justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">SENDbakēd</div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bike size={22} /> Driver Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve incoming driver signups. Newly-registered drivers land in{" "}
            <span className="font-semibold">Onboarding</span> until they submit KYC — then flip to{" "}
            <span className="font-semibold">Pending Review</span>.
          </p>
        </div>
      </div>

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-2" data-testid="driver-bucket-tabs">
        {BUCKETS.map((b) => {
          const on = status === b.code;
          return (
            <button
              key={b.code}
              onClick={() => setStatus(b.code)}
              className="px-3 h-9 rounded-lg text-xs uppercase tracking-widest font-semibold flex items-center gap-2"
              style={{
                background: on ? b.color : "transparent",
                color:      on ? "#0a0a0f" : b.color,
                border:     `1px solid ${b.color}`,
              }}
              data-testid={`driver-bucket-${b.code}`}>
              {b.label}
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: on ? "rgba(0,0,0,.2)" : `${b.color}22` }}>
                {buckets[b.code] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
          <input placeholder="Name or phone…" value={q}
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && load()}
                 className="pl-9 pr-3 h-9 rounded-lg w-full bg-secondary text-sm"
                 data-testid="driver-search-input" />
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)}
                className="h-9 rounded-lg bg-secondary text-sm px-3"
                data-testid="driver-country-filter">
          <option value="">All countries</option>
          <option value="CI">CI — Côte d&apos;Ivoire</option>
          <option value="IN">IN — India</option>
        </select>
        <button onClick={load} className="h-9 px-3 rounded-lg text-xs uppercase tracking-widest font-semibold bg-secondary"
                data-testid="driver-refresh">Refresh</button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm" data-testid="driver-applications-table">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Driver</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Country</th>
              <th className="text-left px-4 py-3">Vehicle</th>
              <th className="text-left px-4 py-3">KYC Step</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="text-left px-4 py-3">Signed up</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground" data-testid="driver-empty">
                No drivers in the <b>{status.replace(/_/g, " ")}</b> bucket.
              </td></tr>
            ) : items.map((d) => (
              <tr key={d.id} className="border-t border-border hover:bg-secondary/20 cursor-pointer"
                  onClick={() => { setActive(d); setAction(null); setNotes(""); }}
                  data-testid={`driver-row-${d.id}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{d.name || <span className="italic text-muted-foreground">Unnamed</span>}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{d.id}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{d.phone_e164}</td>
                <td className="px-4 py-3">{d.country}</td>
                <td className="px-4 py-3">{d.vehicle_type || "—"} {d.vehicle_plate ? <span className="text-xs text-muted-foreground">· {d.vehicle_plate}</span> : null}</td>
                <td className="px-4 py-3 text-xs">{d.kyc_step || "—"}</td>
                <td className="px-4 py-3 text-xs">{fmtDate(d.submitted_at)}</td>
                <td className="px-4 py-3 text-xs">{fmtDate(d.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-primary underline">Review →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {active && (
        <div className="fixed inset-0 z-40 flex justify-end" style={{ background: "rgba(0,0,0,.6)" }}
             onClick={() => setActive(null)}>
          <div className="w-full max-w-2xl bg-background border-l border-border h-full overflow-y-auto"
               onClick={(e) => e.stopPropagation()}
               data-testid="driver-drawer">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center overflow-hidden">
                  {active.selfie_url
                    ? <img src={active.selfie_url} alt="" className="w-full h-full object-cover" />
                    : <User2 size={28} className="text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <div className="text-lg font-bold">{active.name || "Unnamed driver"}</div>
                  <div className="text-xs text-muted-foreground font-mono">{active.phone_e164} · {active.country}</div>
                  <div className="mt-1">
                    <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{
                            background: (BUCKETS.find(b => b.code === active.status)?.color || "#666") + "22",
                            color: BUCKETS.find(b => b.code === active.status)?.color || "#666",
                          }}>
                      {active.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <button onClick={() => setActive(null)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border"
                        data-testid="driver-drawer-close"><X size={16} /></button>
              </div>

              <DetailCard title="Identity & KYC" icon={ShieldCheck}>
                <Row label="Name" value={active.name} />
                <Row label="Email" value={active.email} />
                <Row label="Gov ID" value={active.gov_id_type ? `${active.gov_id_type} · ${active.gov_id_number}` : "—"} />
                <Row label="Licence" value={active.licence_number} />
                <Row label="Licence expiry" value={active.licence_expiry ? new Date(active.licence_expiry).toLocaleDateString() : "—"} />
                <div className="flex gap-2 mt-3 flex-wrap">
                  {active.gov_id_front_url && <ImgLink url={active.gov_id_front_url} label="ID front" />}
                  {active.gov_id_back_url  && <ImgLink url={active.gov_id_back_url}  label="ID back" />}
                  {active.licence_front_url && <ImgLink url={active.licence_front_url} label="Licence" />}
                  {active.selfie_url && <ImgLink url={active.selfie_url} label="Selfie" />}
                </div>
              </DetailCard>

              <DetailCard title="Vehicle" icon={Bike}>
                <Row label="Type" value={active.vehicle_type} />
                <Row label="Plate" value={active.vehicle_plate} />
                {active.vehicle_reg_url && (
                  <div className="mt-2"><ImgLink url={active.vehicle_reg_url} label="Vehicle registration" /></div>
                )}
              </DetailCard>

              <DetailCard title="Banking & payouts" icon={Landmark}>
                <Row label="Account holder" value={active.bank_account_holder} />
                <Row label="Account" value={active.bank_account_number || "—"} />
                <Row label="IFSC / SWIFT" value={active.bank_ifsc_or_swift} />
              </DetailCard>

              <DetailCard title="Emergency contact" icon={Phone}>
                <Row label="Name" value={active.emergency_contact_name} />
                <Row label="Phone" value={active.emergency_contact_phone} />
              </DetailCard>

              {active.current_area && (
                <DetailCard title="Last known location" icon={MapPin}>
                  <Row label="Area" value={active.current_area} />
                  <Row label="Lat/Lng" value={active.current_lat != null ? `${active.current_lat}, ${active.current_lng}` : "—"} />
                </DetailCard>
              )}

              {active.reviewer_notes && (
                <DetailCard title="Reviewer notes" icon={FileText}>
                  <p className="text-xs italic">{active.reviewer_notes}</p>
                </DetailCard>
              )}

              {/* Action panel */}
              <div className="pt-4 border-t border-border sticky bottom-0 bg-background pb-4"
                   data-testid="driver-action-footer">
                {!action ? (
                  <div className="flex flex-wrap gap-2 justify-end">
                    {["pending_review", "rejected", "suspended"].includes(active.status) && (
                      <button onClick={() => setAction("approve")}
                              className="px-4 h-10 rounded-lg text-sm font-semibold flex items-center gap-2"
                              style={{ background: "#77BC1F", color: "#0a1200" }}
                              data-testid="driver-btn-approve">
                        <CheckCircle2 size={14} /> Approve
                      </button>
                    )}
                    {["pending_review", "approved"].includes(active.status) && (
                      <button onClick={() => setAction("reject")}
                              className="px-4 h-10 rounded-lg text-sm font-semibold flex items-center gap-2"
                              style={{ background: "#FF4C52", color: "#fff" }}
                              data-testid="driver-btn-reject">
                        <X size={14} /> Reject
                      </button>
                    )}
                    {active.status === "onboarding" && (
                      <div className="text-xs text-muted-foreground italic">
                        Driver hasn&apos;t submitted KYC yet — nothing to review.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {action === "approve" ? "Approve driver (optional notes)" : "Reject driver (please add a reason)"}
                    </div>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              placeholder={action === "approve" ? "e.g. Cleared all KYC docs" : "Reason for rejection…"}
                              className="w-full rounded-lg bg-secondary p-3 text-sm"
                              data-testid="driver-notes-input" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setAction(null); setNotes(""); }}
                              className="px-3 h-9 rounded-lg text-xs uppercase tracking-widest">Cancel</button>
                      <button onClick={() => act(action)}
                              className="px-4 h-9 rounded-lg text-xs uppercase tracking-widest font-semibold"
                              style={{ background: action === "approve" ? "#77BC1F" : "#FF4C52",
                                       color: action === "approve" ? "#0a1200" : "#fff" }}
                              data-testid="driver-action-confirm">
                        Confirm {action}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailCard = ({ title, icon: Icon, children }) => (
  <div className="rounded-xl border border-border p-4 bg-secondary/20">
    <div className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2 text-muted-foreground">
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

const ImgLink = ({ url, label }) => (
  <a href={url} target="_blank" rel="noreferrer"
     className="text-[10px] uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1"
     style={{ background: "rgba(148,163,184,.15)" }}>
    <ExternalLink size={10} /> {label}
  </a>
);

export default AdminDriverApplications;
