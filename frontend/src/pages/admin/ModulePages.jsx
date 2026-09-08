import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import {
  PlusCircle, CheckCircle2, XCircle, PauseCircle, Play, FileText,
  Upload, Trash2, User as UserIcon, Store, Bike, Package, ClipboardList,
  Sparkles, Activity, Truck, Timer, RefreshCw, Search, MapPin, Phone,
} from "lucide-react";

const fmtMoney = (n, ccy) => `${(n || 0).toLocaleString("en-US")} ${ccy || ""}`.trim();
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "-");

// ============ MODULE OVERVIEW (Dashboard) ============
// Express KPI tile config — colour-coded to match the operational state so
// operators can eyeball the fleet at a glance (green = healthy, yellow =
// pending action, red = attention).
const EXPRESS_KPI_META = {
  active_bookings:   { label: "Active bookings",    icon: Activity, color: "#FCC44C" },
  searching_now:     { label: "Searching for driver", icon: Search, color: "#FF9500" },
  completed_today:   { label: "Completed today",    icon: CheckCircle2, color: "#77BC1F" },
  cancelled_today:   { label: "Cancelled today",    icon: XCircle, color: "#FF4C52" },
  drivers_available: { label: "Drivers available",  icon: Bike,     color: "#1D9BF0" },
  avg_trip_min:      { label: "Avg trip (min)",     icon: Timer,    color: "#9B87F5" },
};

const humanKpiLabel = (k) => k.replace(/_/g, " ");

export const ModuleOverview = () => {
  const { meta, code } = useOutletContext();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState(null);
  const isExpress = code === "express";

  const loadStats = () => adminApi.get(`/admin/modules/${code}/stats`)
    .then((r) => setData(r.data))
    .catch(() => setData({ module: code, status: "coming_soon", kpis: {}, revenue: [] }));

  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, [code]);

  // Live-refresh every 20s for Express so the dashboard reflects the running
  // simulator without a manual reload. Other modules stay static (cheap).
  useEffect(() => {
    if (!isExpress) return undefined;
    adminApi.get(`/admin/modules/express/bookings?limit=5`).then((r) => setRecent(r.data.items)).catch(() => {});
    const t = setInterval(() => {
      loadStats();
      adminApi.get(`/admin/modules/express/bookings?limit=5`).then((r) => setRecent(r.data.items)).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpress, code]);

  if (data?.status === "coming_soon") {
    return (
      <div className="baked-card bg-card border border-border p-10 text-center">
        <Sparkles size={36} className="mx-auto mb-3" style={{ color: meta.color }} />
        <div className="text-lg font-semibold">Coming soon</div>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          {meta.label}bakēd is on the roadmap. The BAKĒD platform is configuration-driven —
          enabling this module is a matter of seeding its catalogue and switching on the feature flag.
        </p>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-5" data-testid={`overview-${code}`}>
      {/* KPI grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(data.kpis).map(([k, v]) => {
          const cfg = isExpress ? EXPRESS_KPI_META[k] : null;
          const IconEl = cfg?.icon;
          const tint = cfg?.color || meta.color;
          return (
            <div key={k} data-testid={`kpi-${k}`} className="baked-card bg-card border border-border p-4 flex items-center gap-3">
              {IconEl && (
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tint}22`, color: tint }}>
                  <IconEl size={18} />
                </div>
              )}
              <div className="flex-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{cfg?.label || humanKpiLabel(k)}</div>
                <div className="text-3xl font-bold mt-1 tabular-nums">{v}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue table */}
      {data.revenue?.length > 0 && (
        <div className="baked-card bg-card border border-border p-5">
          <div className="text-sm font-semibold mb-3">Revenue by currency</div>
          <div className="grid gap-2">
            {data.revenue.map((r) => (
              <div key={r.currency} className="flex items-center justify-between text-sm">
                <span className="font-medium">{r.currency}</span>
                <span className="text-muted-foreground">{r.count} orders</span>
                <span className="font-bold">{fmtMoney(r.revenue, r.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent bookings preview (Express only) — links to the full Bookings tab */}
      {isExpress && (
        <div className="baked-card bg-card border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-sm font-bold">Recent bookings</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Live · refreshes every 20s</div>
            </div>
            <button data-testid="overview-view-all-bookings" onClick={() => navigate(`/admin/modules/express/bookings`)} className="text-xs font-semibold text-primary hover:underline">
              View all →
            </button>
          </div>
          <div className="divide-y divide-border">
            {recent === null && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
            {recent && recent.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground italic">No bookings yet — trigger a customer parcel to see it appear here in real time.</div>}
            {recent && recent.map((b) => (
              <div key={b.id} className="p-3 flex items-center gap-3 hover:bg-secondary/40 motion-fast cursor-pointer" onClick={() => navigate(`/admin/modules/express/bookings?ref=${b.ref}`)}>
                <StatusPill status={b.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{b.ref} <span className="text-muted-foreground font-normal">· {b.receiver_name || "—"}</span></div>
                  <div className="text-[10px] text-muted-foreground truncate">{b.pickup || "—"} → {b.drop || "—"}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-xs font-bold">{fmtMoney(b.total, b.currency_symbol)}</div>
                  <div className="text-[10px] text-muted-foreground">{b.driver_name || <span className="italic">no driver</span>}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Reusable coloured status chip so both the overview preview and the bookings
// table stay visually consistent with the customer-facing tracking view.
const STATUS_TONE = {
  searching:       { color: "#FF9500", bg: "#FF950022", label: "Searching" },
  driver_assigned: { color: "#1D9BF0", bg: "#1D9BF022", label: "Assigned" },
  arriving:        { color: "#1D9BF0", bg: "#1D9BF022", label: "Arriving" },
  picked_up:       { color: "#9B87F5", bg: "#9B87F522", label: "Picked up" },
  in_transit:      { color: "#9B87F5", bg: "#9B87F522", label: "In transit" },
  delivered:       { color: "#77BC1F", bg: "#77BC1F22", label: "Delivered" },
  cancelled:       { color: "#FF4C52", bg: "#FF4C5222", label: "Cancelled" },
  confirmed:       { color: "#77BC1F", bg: "#77BC1F22", label: "Confirmed" },
};

const StatusPill = ({ status }) => {
  const t = STATUS_TONE[status] || { color: "#8b8b8b", bg: "#8b8b8b22", label: (status || "").toUpperCase() };
  return (
    <span className="text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap" style={{ backgroundColor: t.bg, color: t.color }}>
      {t.label}
    </span>
  );
};

// ============ MODULE VENDORS (Partner Stores) — pending → approved → active ============
const STATUS_STYLES = {
  pending:   { color: "#FCC44C", bg: "#FCC44C22", label: "PENDING" },
  approved:  { color: "#1D9BF0", bg: "#1D9BF022", label: "APPROVED" },
  active:    { color: "#77BC1F", bg: "#77BC1F22", label: "ACTIVE" },
  rejected:  { color: "#FF4C52", bg: "#FF4C5222", label: "REJECTED" },
  suspended: { color: "#8b8b8b", bg: "#8b8b8b22", label: "SUSPENDED" },
};

const emptyVendor = { name: "", contact_name: "", contact_email: "", contact_phone: "", country: "CI", city: "", address: "", commission_pct: 15, notes: "" };

export const ModuleVendors = () => {
  const { meta, code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [inspect, setInspect] = useState(null); // vendor being inspected in the side drawer
  const [docForm, setDocForm] = useState({ kind: "license", label: "", url: "", note: "" });

  const load = async () => {
    const url = filter === "all" ? `/admin/modules/${code}/vendors` : `/admin/modules/${code}/vendors?status=${filter}`;
    const { data } = await adminApi.get(url);
    setItems(data);
    if (inspect) setInspect(data.find((v) => v.id === inspect.id) || null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code, filter]);

  const save = async () => {
    if (!editing.name) return toast.error("Name required");
    await adminApi.post(`/admin/modules/${code}/vendors`, editing);
    toast.success("Vendor created (pending review)"); setEditing(null); load();
  };

  const act = async (vid, action, reason) => {
    try {
      const { data } = await adminApi.post(`/admin/modules/${code}/vendors/${vid}/${action}`, reason ? { reason } : {});
      toast.success(`Vendor ${action}d`);
      setInspect(data);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  const addDocument = async () => {
    if (!docForm.label) return toast.error("Document label required");
    try {
      const { data } = await adminApi.post(`/admin/modules/${code}/vendors/${inspect.id}/documents`, docForm);
      setInspect(data);
      setDocForm({ kind: "license", label: "", url: "", note: "" });
      toast.success("Document added");
      load();
    } catch (e) { toast.error("Failed to add document"); }
  };

  const counts = useMemo(() => {
    const m = { all: items.length };
    for (const s of Object.keys(STATUS_STYLES)) m[s] = 0;
    items.forEach((i) => { m[i.status] = (m[i.status] || 0) + 1; });
    return m;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">Vendors <span className="text-muted-foreground font-normal text-sm">· Partner stores for {meta.label}bakēd</span></h2>
          <p className="text-xs text-muted-foreground">Workflow: <b>pending</b> → approve → <b>approved</b> → activate → <b>active</b>.</p>
        </div>
        <Button data-testid="vendor-add" onClick={() => setEditing({ ...emptyVendor })} className="baked-btn font-semibold" style={{ backgroundColor: meta.color, color: "#0a1200" }}>
          <PlusCircle size={16} className="mr-2" /> Add vendor
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "approved", "active", "rejected", "suspended"].map((s) => {
          const isAct = filter === s;
          const style = s === "all" ? { color: "#e5e5e5", bg: "#3a3a3a" } : STATUS_STYLES[s];
          return (
            <button key={s} data-testid={`vendor-filter-${s}`} onClick={() => setFilter(s)}
              className={`text-[11px] uppercase tracking-wider px-3 py-1.5 baked-chip motion-fast ${isAct ? "font-bold" : "opacity-70 hover:opacity-100"}`}
              style={{ backgroundColor: isAct ? style.color : style.bg || style.color + "22", color: isAct ? "#0a1200" : style.color }}>
              {s} <span className="opacity-60">· {counts[s] || 0}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Vendor</th>
              <th className="text-left p-3">Location</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">Commission</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Applied</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No vendors yet — add your first partner store.</td></tr>
            ) : items.map((v) => {
              const st = STATUS_STYLES[v.status] || STATUS_STYLES.pending;
              return (
                <tr key={v.id} data-testid={`vendor-row-${v.id}`} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={() => setInspect(v)}>
                  <td className="p-3">
                    <div className="font-medium">{v.name}</div>
                    <div className="text-[10px] text-muted-foreground">{v.notes || "—"}</div>
                  </td>
                  <td className="p-3 text-xs">{v.city ? `${v.city}, ` : ""}{v.country}</td>
                  <td className="p-3 text-xs">
                    <div>{v.contact_name || "—"}</div>
                    <div className="text-muted-foreground">{v.contact_email || v.contact_phone || ""}</div>
                  </td>
                  <td className="p-3 text-xs">{v.commission_pct}%</td>
                  <td className="p-3"><span className="text-[10px] baked-chip px-2 py-0.5 font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span></td>
                  <td className="p-3 text-xs text-muted-foreground">{fmtDate(v.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {editing && (
        <div className="baked-card bg-card border border-border p-5 space-y-3">
          <div className="text-sm font-semibold">New vendor application</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["name", "Business name *"], ["contact_name", "Contact name"], ["contact_email", "Contact email"],
              ["contact_phone", "Contact phone"], ["city", "City"], ["address", "Address"], ["country", "Country (ISO)"],
            ].map(([k, label]) => (
              <label key={k} className="text-xs"><span className="text-muted-foreground">{label}</span>
                <input data-testid={`vendor-field-${k}`} value={editing[k] || ""} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" />
              </label>
            ))}
            <label className="text-xs"><span className="text-muted-foreground">Commission %</span>
              <input type="number" min={0} max={100} step={0.5} value={editing.commission_pct} onChange={(e) => setEditing({ ...editing, commission_pct: parseFloat(e.target.value) || 0 })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" />
            </label>
            <label className="text-xs col-span-2"><span className="text-muted-foreground">Internal notes</span>
              <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button data-testid="vendor-save" onClick={save} className="baked-btn font-semibold" style={{ backgroundColor: meta.color, color: "#0a1200" }}>Create (pending)</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Inspect drawer (as a stacked panel) */}
      {inspect && (
        <div className="baked-card bg-card border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Store size={16} className="text-muted-foreground" />
                <div className="text-lg font-bold">{inspect.name}</div>
                {(() => { const st = STATUS_STYLES[inspect.status] || STATUS_STYLES.pending; return (<span className="text-[10px] baked-chip px-2 py-0.5 font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>); })()}
              </div>
              <div className="text-xs text-muted-foreground">{inspect.address || "—"} · {inspect.city}, {inspect.country}</div>
            </div>
            <button onClick={() => setInspect(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </div>

          {/* Actions rail */}
          <div className="flex flex-wrap gap-2">
            {inspect.status === "pending" && (
              <>
                <Button data-testid="vendor-approve" onClick={() => act(inspect.id, "approve")} size="sm" className="baked-btn" style={{ backgroundColor: "#1D9BF0", color: "white" }}><CheckCircle2 size={14} className="mr-1" /> Approve</Button>
                <Button data-testid="vendor-reject" onClick={() => { const r = prompt("Rejection reason (optional):"); act(inspect.id, "reject", r || ""); }} size="sm" variant="outline" className="baked-btn"><XCircle size={14} className="mr-1" /> Reject</Button>
              </>
            )}
            {inspect.status === "approved" && (
              <Button data-testid="vendor-activate" onClick={() => act(inspect.id, "activate")} size="sm" className="baked-btn" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}><Play size={14} className="mr-1" /> Activate</Button>
            )}
            {inspect.status === "active" && (
              <Button data-testid="vendor-suspend" onClick={() => { const r = prompt("Suspension reason:"); act(inspect.id, "suspend", r || ""); }} size="sm" variant="outline" className="baked-btn"><PauseCircle size={14} className="mr-1" /> Suspend</Button>
            )}
            {inspect.status === "suspended" && (
              <Button data-testid="vendor-reactivate" onClick={() => act(inspect.id, "approve")} size="sm" className="baked-btn" style={{ backgroundColor: "#1D9BF0", color: "white" }}><CheckCircle2 size={14} className="mr-1" /> Re-approve</Button>
            )}
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><div className="text-muted-foreground">Contact</div><div className="font-medium">{inspect.contact_name || "—"}</div></div>
            <div><div className="text-muted-foreground">Email</div><div className="font-medium">{inspect.contact_email || "—"}</div></div>
            <div><div className="text-muted-foreground">Phone</div><div className="font-medium">{inspect.contact_phone || "—"}</div></div>
            <div><div className="text-muted-foreground">Commission</div><div className="font-medium">{inspect.commission_pct}%</div></div>
          </div>

          {inspect.approval_note && <div className="text-xs"><span className="text-muted-foreground">Approval note: </span>{inspect.approval_note}</div>}
          {inspect.rejection_reason && <div className="text-xs text-red-500"><span className="text-muted-foreground">Rejection reason: </span>{inspect.rejection_reason}</div>}
          {inspect.suspension_reason && <div className="text-xs text-yellow-500"><span className="text-muted-foreground">Suspension reason: </span>{inspect.suspension_reason}</div>}

          {/* Documents */}
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2"><FileText size={12} /> Documents</div>
            <div className="space-y-2">
              {(inspect.documents || []).length === 0 && <div className="text-xs text-muted-foreground">No documents uploaded.</div>}
              {(inspect.documents || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-3 py-2">
                  <div>
                    <div className="font-medium">{d.label} <span className="text-muted-foreground">· {d.kind}</span></div>
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{d.url}</a>}
                    {d.note && <div className="text-muted-foreground">{d.note}</div>}
                  </div>
                  <div className="text-muted-foreground">{fmtDate(d.uploaded_at)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <select data-testid="doc-kind" value={docForm.kind} onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })} className="baked-input bg-secondary px-2 py-1.5 text-xs">
                <option value="license">License</option>
                <option value="tax_id">Tax ID</option>
                <option value="id_card">ID Card</option>
                <option value="bank">Bank details</option>
                <option value="other">Other</option>
              </select>
              <input data-testid="doc-label" placeholder="Label" value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} className="baked-input bg-secondary px-2 py-1.5 text-xs" />
              <input data-testid="doc-url" placeholder="URL or reference" value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} className="baked-input bg-secondary px-2 py-1.5 text-xs" />
              <Button data-testid="doc-add" onClick={addDocument} size="sm" className="baked-btn" style={{ backgroundColor: meta.color, color: "#0a1200" }}><Upload size={12} className="mr-1" /> Add</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ MODULE PRODUCTS (MART) ============
export const ModuleProducts = () => {
  const { meta, code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const load = async () => setItems((await adminApi.get(`/admin/modules/${code}/products${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Package size={18} /> Catalogue</h2>
          <p className="text-xs text-muted-foreground">Read-only preview of the {code.toUpperCase()} product catalogue. Full CRUD in next phase.</p>
        </div>
        <div className="flex items-center gap-2">
          <input data-testid="products-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or brand" className="baked-input px-3 py-1.5 bg-secondary text-sm" />
          <Button onClick={load} className="baked-btn" style={{ backgroundColor: meta.color, color: "#0a1200" }}>Search</Button>
        </div>
      </div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Product</th>
              <th className="text-left p-3">Brand</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Price</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Stock</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (<tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No products found.</td></tr>) : items.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 flex items-center gap-3">
                  {p.image && <img alt={p.name} src={p.image} className="w-9 h-9 rounded-lg object-cover" />}
                  <div><div className="font-medium">{p.name}</div><div className="text-[10px] text-muted-foreground">{p.unit}</div></div>
                </td>
                <td className="p-3 text-xs">{p.brand}</td>
                <td className="p-3 text-xs">{p.category_slug}<div className="text-muted-foreground text-[10px]">{p.subcategory_slug}</div></td>
                <td className="p-3 text-xs">{fmtMoney(p.price, p.currency_symbol || p.currency)}</td>
                <td className="p-3 text-xs">{p.country}</td>
                <td className="p-3 text-xs">{p.in_stock ? <span className="text-[#77BC1F]">In stock</span> : <span className="text-red-500">Out</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============ MODULE ORDERS ============
export const ModuleOrders = () => {
  const { code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("all");
  const load = async () => setItems((await adminApi.get(`/admin/modules/${code}/orders${status !== "all" ? `?status=${status}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code, status]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardList size={18} /> Orders</h2>
          <p className="text-xs text-muted-foreground">Orders placed within the {code.toUpperCase()} module.</p>
        </div>
        <div className="flex gap-1">
          {["all", "pending", "confirmed", "delivered", "cancelled"].map((s) => (
            <button key={s} data-testid={`order-filter-${s}`} onClick={() => setStatus(s)} className={`text-[11px] uppercase tracking-wider px-3 py-1.5 baked-chip motion-fast ${status === s ? "bg-[#1D9BF0] text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Items</th>
              <th className="text-left p-3">Total</th>
              <th className="text-left p-3">Payment</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (<tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No orders yet.</td></tr>) : items.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="p-3 text-xs font-mono">{o.number}</td>
                <td className="p-3 text-xs text-muted-foreground">{fmtDate(o.created_at)}</td>
                <td className="p-3 text-xs">{o.customer_id?.slice(-8)}</td>
                <td className="p-3 text-xs">{(o.items || []).length}</td>
                <td className="p-3 text-xs font-semibold">{fmtMoney(o.total, o.currency)}</td>
                <td className="p-3 text-xs">{o.payment_method} · <span className="text-muted-foreground">{o.payment_status}</span></td>
                <td className="p-3"><span className="text-[10px] baked-chip px-2 py-0.5 uppercase bg-secondary text-muted-foreground">{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============ MODULE CUSTOMERS ============
export const ModuleCustomers = () => {
  const { meta, code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const load = async () => setItems((await adminApi.get(`/admin/modules/${code}/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><UserIcon size={18} /> Customers</h2>
          <p className="text-xs text-muted-foreground">Customers with ≥1 order or active cart in {meta.label}bakēd. Single identity, module-scoped view.</p>
        </div>
        <div className="flex items-center gap-2">
          <input data-testid="customers-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone / email / name" className="baked-input px-3 py-1.5 bg-secondary text-sm" />
          <Button onClick={load} className="baked-btn" style={{ backgroundColor: meta.color, color: "#0a1200" }}>Search</Button>
        </div>
      </div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Identity</th>
              <th className="text-left p-3">Country</th>
              <th className="text-left p-3">Orders in {code.toUpperCase()}</th>
              <th className="text-left p-3">Spent</th>
              <th className="text-left p-3">Verified</th>
              <th className="text-left p-3">Since</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (<tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No {code.toUpperCase()} customers yet — this list is populated by customers who order or add items to their cart in this module.</td></tr>) : items.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3">
                  <div className="font-medium">{c.name || c.phone || c.email}</div>
                  <div className="text-[10px] text-muted-foreground">{c.phone || c.email}</div>
                </td>
                <td className="p-3 text-xs">{c.country}</td>
                <td className="p-3 text-xs font-semibold">{c.module_stats?.orders || 0}</td>
                <td className="p-3 text-xs">
                  {(c.module_stats?.spent_by_ccy || []).length === 0 ? "—" : c.module_stats.spent_by_ccy.map((s) => (
                    <div key={s.currency}>{fmtMoney(s.total, s.currency)}</div>
                  ))}
                </td>
                <td className="p-3 text-xs">{c.verified ? "✓" : "—"}</td>
                <td className="p-3 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============ MODULE DRIVERS ============
const DRIVER_STATUS = {
  pending:   { color: "#FCC44C", bg: "#FCC44C22", label: "PENDING" },
  active:    { color: "#77BC1F", bg: "#77BC1F22", label: "ACTIVE" },
  inactive:  { color: "#8b8b8b", bg: "#8b8b8b22", label: "INACTIVE" },
  suspended: { color: "#FF4C52", bg: "#FF4C5222", label: "SUSPENDED" },
};

const emptyDriver = { name: "", phone: "", email: "", country: "CI", city: "", vehicle_type: "scooter", vehicle_reg: "", license_number: "", current_lat: "", current_lng: "", rating: 4.8 };

const EXPRESS_VEHICLES = [
  { code: "bike",          label: "Bike" },
  { code: "scooter",       label: "Scooter" },
  { code: "three_wheeler", label: "3 Wheeler" },
  { code: "mini_truck",    label: "Mini Truck" },
  { code: "truck",         label: "Truck" },
];

export const ModuleDrivers = () => {
  const { meta, code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const isExpress = code === "express";
  const load = async () => setItems((await adminApi.get(`/admin/modules/${code}/drivers`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code]);
  const save = async () => {
    if (!editing.name || !editing.phone) return toast.error("Name & phone required");
    const payload = { ...editing };
    // Coerce numeric fields
    if (payload.current_lat === "" || payload.current_lat == null) delete payload.current_lat;
    else payload.current_lat = Number(payload.current_lat);
    if (payload.current_lng === "" || payload.current_lng == null) delete payload.current_lng;
    else payload.current_lng = Number(payload.current_lng);
    if (payload.rating !== "" && payload.rating != null) payload.rating = Number(payload.rating);
    await adminApi.post(`/admin/modules/${code}/drivers`, payload);
    toast.success("Driver added"); setEditing(null); load();
  };
  const setStatus = async (did, status) => {
    await adminApi.patch(`/admin/modules/${code}/drivers/${did}`, { status });
    toast.success(`Driver ${status}`); load();
  };
  const toggleAvailability = async (d) => {
    await adminApi.patch(`/admin/modules/${code}/drivers/${d.id}`, { is_available: !d.is_available });
    toast.success(d.is_available ? "Driver marked busy" : "Driver marked available"); load();
  };
  const del = async (did) => { await adminApi.delete(`/admin/modules/${code}/drivers/${did}`); load(); };
  const vehicleOptions = isExpress
    ? EXPRESS_VEHICLES
    : [{ code: "bike", label: "Bike" }, { code: "scooter", label: "Scooter" }, { code: "car", label: "Car" }, { code: "van", label: "Van" }];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Bike size={18} /> Drivers</h2>
          <p className="text-xs text-muted-foreground">Delivery agents assigned to {meta.label}bakēd.</p>
        </div>
        <Button data-testid="driver-add" onClick={() => setEditing({ ...emptyDriver })} className="baked-btn" style={{ backgroundColor: meta.color, color: "#0a1200" }}><PlusCircle size={16} className="mr-2" /> Add driver</Button>
      </div>
      {editing && (
        <div className="baked-card bg-card border border-border p-5 space-y-3">
          <div className="text-sm font-semibold">New driver</div>
          <div className="grid grid-cols-2 gap-3">
            {[["name", "Full name *"], ["phone", "Phone *"], ["email", "Email"], ["city", "City"], ["country", "Country (ISO)"], ["vehicle_reg", "Vehicle reg"], ["license_number", "License #"]].map(([k, label]) => (
              <label key={k} className="text-xs"><span className="text-muted-foreground">{label}</span>
                <input data-testid={`driver-field-${k}`} value={editing[k] || ""} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" />
              </label>
            ))}
            <label className="text-xs"><span className="text-muted-foreground">Vehicle</span>
              <select data-testid="driver-field-vehicle_type" value={editing.vehicle_type} onChange={(e) => setEditing({ ...editing, vehicle_type: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1">
                {vehicleOptions.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
              </select>
            </label>
            {isExpress && (
              <>
                <label className="text-xs"><span className="text-muted-foreground">Current lat</span>
                  <input data-testid="driver-field-current_lat" value={editing.current_lat ?? ""} onChange={(e) => setEditing({ ...editing, current_lat: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" placeholder="e.g. 5.360" />
                </label>
                <label className="text-xs"><span className="text-muted-foreground">Current lng</span>
                  <input data-testid="driver-field-current_lng" value={editing.current_lng ?? ""} onChange={(e) => setEditing({ ...editing, current_lng: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" placeholder="e.g. -4.008" />
                </label>
                <label className="text-xs"><span className="text-muted-foreground">Rating (0-5)</span>
                  <input data-testid="driver-field-rating" type="number" step="0.1" min="0" max="5" value={editing.rating ?? 4.8} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" />
                </label>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button data-testid="driver-save" onClick={save} className="baked-btn" style={{ backgroundColor: meta.color, color: "#0a1200" }}>Create (pending)</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-left p-3">Location</th>
              {isExpress && <th className="text-left p-3">Availability</th>}
              {isExpress && <th className="text-left p-3">Rating</th>}
              <th className="text-left p-3">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (<tr><td colSpan={isExpress ? 8 : 6} className="p-8 text-center text-sm text-muted-foreground">No drivers yet.</td></tr>) : items.map((d) => {
              const st = DRIVER_STATUS[d.status] || DRIVER_STATUS.pending;
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-3"><div className="font-medium">{d.name}</div><div className="text-[10px] text-muted-foreground">{d.license_number || "no license on file"}</div></td>
                  <td className="p-3 text-xs">{d.phone}<div className="text-muted-foreground">{d.email || ""}</div></td>
                  <td className="p-3 text-xs capitalize">{(d.vehicle_type || "").replace("_", " ")} <span className="text-muted-foreground">· {d.vehicle_reg || "—"}</span></td>
                  <td className="p-3 text-xs">
                    <div>{d.city ? `${d.city}, ` : ""}{d.country}</div>
                    {isExpress && d.current_lat != null && (
                      <div className="text-[10px] text-muted-foreground">{Number(d.current_lat).toFixed(4)}, {Number(d.current_lng).toFixed(4)}</div>
                    )}
                  </td>
                  {isExpress && (
                    <td className="p-3">
                      <button
                        data-testid={`driver-avail-${d.id}`}
                        onClick={() => toggleAvailability(d)}
                        className="text-[10px] baked-chip px-2 py-0.5 font-semibold"
                        style={{
                          backgroundColor: d.is_available ? "#77BC1F22" : "#8b8b8b22",
                          color: d.is_available ? "#77BC1F" : "#8b8b8b",
                        }}
                      >
                        {d.is_available ? "AVAILABLE" : "BUSY"}
                      </button>
                    </td>
                  )}
                  {isExpress && (
                    <td className="p-3 text-xs font-semibold">★ {Number(d.rating || 0).toFixed(1)}</td>
                  )}
                  <td className="p-3"><span className="text-[10px] baked-chip px-2 py-0.5 font-semibold" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span></td>
                  <td className="p-3 text-right text-xs space-x-2">
                    {d.status !== "active" && <button data-testid={`driver-activate-${d.id}`} onClick={() => setStatus(d.id, "active")} className="text-[#77BC1F] hover:underline">Activate</button>}
                    {d.status === "active" && <button data-testid={`driver-suspend-${d.id}`} onClick={() => setStatus(d.id, "suspended")} className="text-yellow-500 hover:underline">Suspend</button>}
                    <button onClick={() => del(d.id)} className="text-red-500 hover:underline"><Trash2 size={12} className="inline" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============ PLACEHOLDER (Coming soon within a module) ============
export const ModuleComingSoon = ({ title = "Coming soon" }) => {
  const { meta } = useOutletContext();
  return (
    <div className="baked-card bg-card border border-border p-10 text-center">
      <Sparkles size={36} className="mx-auto mb-3" style={{ color: meta.color }} />
      <div className="text-lg font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        This section is on the roadmap for {meta.label}bakēd. It follows the PRD §7 Module-First Administration pattern.
      </p>
    </div>
  );
};

// ============ MODULE PRICING (Express Sub-feature C) ============
// Editable pricing engine — per-vehicle parcel rates + movers rates.
// Country switcher (CI / LR). All numeric inputs. PATCH on Save-per-row.
const PARCEL_FIELDS = [
  { key: "base_fare",        label: "Base fare",        hint: "Fixed pickup fee" },
  { key: "min_fare",         label: "Minimum fare",     hint: "Floor billed to customer" },
  { key: "price_per_km",     label: "Per km",           hint: "Distance rate" },
  { key: "price_per_min",    label: "Per minute",       hint: "Time rate" },
  { key: "waiting_fee",      label: "Waiting fee",      hint: "Per minute of driver wait" },
  { key: "peak_multiplier",  label: "Peak ×",           hint: "e.g. 1.25 = +25%", step: 0.05 },
  { key: "night_multiplier", label: "Night ×",          hint: "e.g. 1.15 = +15%", step: 0.05 },
  { key: "service_fee_pct",  label: "Service fee %",    hint: "Platform cut", step: 0.1 },
  { key: "insurance_pct",    label: "Insurance %",      hint: "of declared value", step: 0.1 },
  { key: "insurance_min",    label: "Insurance floor",  hint: "Min. insurance premium" },
  { key: "taxes_pct",        label: "Taxes %",          hint: "VAT / GST", step: 0.1 },
];

const MOVERS_FIELDS = [
  { key: "transport_base",         label: "Transport base" },
  { key: "price_per_km",           label: "Per km" },
  { key: "packing_per_item",       label: "Packing / item" },
  { key: "loading_unloading_base", label: "Loading base" },
  { key: "loading_per_item",       label: "Loading / item" },
  { key: "labour_per_mover",       label: "Labour / mover" },
  { key: "floor_fee",              label: "Fee per floor" },
  { key: "stair_fee",              label: "Stair fee" },
  { key: "toll_permits",           label: "Tolls / permits" },
  { key: "value_per_kg",           label: "Value / kg (est.)" },
  { key: "insurance_pct",          label: "Insurance %", step: 0.1 },
  { key: "insurance_min",          label: "Insurance floor" },
  { key: "taxes_pct",              label: "Taxes %", step: 0.1 },
  { key: "advance_flat",           label: "Advance (flat)" },
  { key: "advance_pct",            label: "Advance %", step: 0.1 },
];

const VEHICLE_LABELS = { bike: "Bike", scooter: "Scooter", three_wheeler: "3 Wheeler", mini_truck: "Mini Truck", truck: "Truck" };

const NumberCell = ({ value, onChange, step, testId }) => (
  <input
    type="number"
    data-testid={testId}
    value={value ?? ""}
    step={step ?? 1}
    onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    className="w-full bg-secondary rounded-md px-2 py-1.5 text-xs text-right tabular-nums border border-transparent focus:border-primary focus:outline-none"
  />
);

export const ModulePricing = () => {
  const { code } = useOutletContext();
  const navigate = useNavigate();
  useEffect(() => {
    // Guard: this page is for Express only. If a user lands here for
    // another module (via URL), bounce them to the overview.
    if (code !== "express") navigate(`/admin/modules/${code}`, { replace: true });
  }, [code, navigate]);

  const [country, setCountry] = useState("CI");
  const [data, setData] = useState(null);
  const [dirty, setDirty] = useState({});        // { rowKey: { field: value } }
  const [saving, setSaving] = useState(null);

  const load = async () => {
    try {
      const { data } = await adminApi.get(`/admin/modules/express/pricing?country=${country}`);
      setData(data);
      setDirty({});
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load pricing");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [country]);

  const rowKey = (vehicle_code) => `parcel:${vehicle_code}`;
  const moversKey = "movers";

  const setField = (rk, field, value) => setDirty((d) => ({ ...d, [rk]: { ...(d[rk] || {}), [field]: value } }));
  const clearRow = (rk) => setDirty((d) => { const nd = { ...d }; delete nd[rk]; return nd; });

  const saveParcelRow = async (vehicle_code) => {
    const rk = rowKey(vehicle_code);
    const changes = dirty[rk];
    if (!changes || Object.keys(changes).length === 0) return;
    setSaving(rk);
    try {
      await adminApi.patch(`/admin/modules/express/pricing/${country}/${vehicle_code}`, changes);
      toast.success(`Updated ${VEHICLE_LABELS[vehicle_code] || vehicle_code} pricing`);
      clearRow(rk);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveMovers = async () => {
    const changes = dirty[moversKey];
    if (!changes || Object.keys(changes).length === 0) return;
    setSaving(moversKey);
    try {
      await adminApi.patch(`/admin/modules/express/movers-pricing/${country}`, changes);
      toast.success("Updated movers pricing");
      clearRow(moversKey);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(null);
    }
  };

  if (!data) return <div className="text-sm text-muted-foreground p-6">Loading pricing…</div>;

  const parcelRuleByCode = Object.fromEntries((data.parcel_rules || []).map((r) => [r.vehicle_code, r]));
  const currency = data.currency_symbol || data.currency || "";

  return (
    <div className="space-y-6" data-testid="module-pricing">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold">Pricing Engine</h2>
          <p className="text-xs text-muted-foreground mt-1">
            All rates are configuration-driven — updates apply instantly to the next customer quote.
            <span className="ml-2 opacity-70">Currency <strong>{currency}</strong></span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* baked.ci ships to Côte d'Ivoire and India (India added for the QA
              team's location-based testing per India_Location.txt §1). LR
              records remain in the DB but are not surfaced here. */}
          {["CI", "IN"].map((c) => (
            <button
              key={c}
              data-testid={`pricing-country-${c.toLowerCase()}`}
              onClick={() => setCountry(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold motion-fast ${country === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {c === "CI" ? "🇨🇮 Côte d'Ivoire" : "🇮🇳 India"}
            </button>
          ))}
        </div>
      </div>

      {/* Parcel pricing table */}
      <div className="baked-card border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Parcel Delivery — Per Vehicle</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Applies to standard parcel bookings. Multipliers are absolute (1.25 = +25%). % fields are percents (8 = 8%).</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 sticky left-0 bg-secondary/40 z-10">Vehicle</th>
                {PARCEL_FIELDS.map((f) => (
                  <th key={f.key} className="text-right p-3 whitespace-nowrap" title={f.hint}>{f.label}</th>
                ))}
                <th className="text-right p-3">Active</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {(data.vehicles || []).map((v) => {
                const rule = parcelRuleByCode[v.code];
                const rk = rowKey(v.code);
                const pending = dirty[rk] || {};
                const val = (field) => (pending[field] !== undefined ? pending[field] : rule?.[field] ?? 0);
                const hasChanges = Object.keys(pending).length > 0;
                if (!rule) {
                  return (
                    <tr key={v.code} className="border-t border-border">
                      <td className="p-3 font-medium sticky left-0 bg-background">{VEHICLE_LABELS[v.code] || v.code}</td>
                      <td colSpan={PARCEL_FIELDS.length + 2} className="p-3 text-xs text-muted-foreground italic">No rule defined — reseed to create.</td>
                    </tr>
                  );
                }
                return (
                  <tr key={v.code} className="border-t border-border" data-testid={`pricing-row-${v.code}`}>
                    <td className="p-3 font-medium sticky left-0 bg-background">{VEHICLE_LABELS[v.code] || v.code}</td>
                    {PARCEL_FIELDS.map((f) => (
                      <td key={f.key} className="p-2 min-w-[110px]">
                        <NumberCell
                          value={val(f.key)}
                          step={f.step}
                          onChange={(n) => setField(rk, f.key, n)}
                          testId={`pricing-input-${v.code}-${f.key}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-right">
                      <input
                        type="checkbox"
                        data-testid={`pricing-active-${v.code}`}
                        checked={val("active") !== false}
                        onChange={(e) => setField(rk, "active", e.target.checked)}
                        className="accent-primary w-4 h-4"
                      />
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button
                        data-testid={`pricing-save-${v.code}`}
                        disabled={!hasChanges || saving === rk}
                        onClick={() => saveParcelRow(v.code)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md motion-fast ${hasChanges ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-secondary text-muted-foreground cursor-not-allowed"}`}
                      >
                        {saving === rk ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movers pricing card */}
      <div className="baked-card border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Packers & Movers</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">One rate set per country. Applied to every home-shifting quote for {country}.</div>
          </div>
          {(() => {
            const changes = dirty[moversKey];
            const hasChanges = changes && Object.keys(changes).length > 0;
            return (
              <button
                data-testid="pricing-save-movers"
                disabled={!hasChanges || saving === moversKey}
                onClick={saveMovers}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md motion-fast ${hasChanges ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground cursor-not-allowed"}`}
              >
                {saving === moversKey ? "Saving…" : "Save movers"}
              </button>
            );
          })()}
        </div>
        {data.movers_pricing ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {MOVERS_FIELDS.map((f) => {
              const pending = dirty[moversKey] || {};
              const current = pending[f.key] !== undefined ? pending[f.key] : data.movers_pricing[f.key];
              return (
                <label key={f.key} className="block text-xs">
                  <span className="text-muted-foreground block mb-1">{f.label}</span>
                  <NumberCell
                    value={current}
                    step={f.step}
                    onChange={(n) => setField(moversKey, f.key, n)}
                    testId={`pricing-movers-${f.key}`}
                  />
                </label>
              );
            })}
            <label className="flex items-center gap-2 text-xs mt-4">
              <input
                type="checkbox"
                data-testid="pricing-movers-active"
                checked={(dirty[moversKey]?.active ?? data.movers_pricing.active) !== false}
                onChange={(e) => setField(moversKey, "active", e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span>Active</span>
            </label>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground italic">No movers pricing configured for {country}.</div>
        )}
      </div>
    </div>
  );
};


// ============ MODULE BOOKINGS (Express Sub-feature D) ============
// Live table of every EXPRESSbakēd booking. Auto-refreshes every 15s so the
// simulator's status transitions appear in-place. Filters: status + country.
const EXPRESS_STATUS_FILTERS = [
  { code: "any",             label: "All" },
  { code: "active",          label: "Active" },
  { code: "searching",       label: "Searching" },
  { code: "driver_assigned", label: "Assigned" },
  { code: "arriving",        label: "Arriving" },
  { code: "picked_up",       label: "Picked up" },
  { code: "in_transit",      label: "In transit" },
  { code: "delivered",       label: "Delivered" },
  { code: "cancelled",       label: "Cancelled" },
];

const fmtRelative = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return d.toLocaleDateString();
};

export const ModuleBookings = () => {
  const { code } = useOutletContext();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("active");
  const [country, setCountry] = useState("any");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ status: filter, limit: "100" });
      if (country !== "any") params.set("country", country);
      if (q.trim()) params.set("q", q.trim());
      const r = await adminApi.get(`/admin/modules/express/bookings?${params.toString()}`);
      setData(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load bookings");
    } finally {
      setBusy(false);
    }
  };

  // Initial + on-filter-change fetch, plus a 15s live refresh so operators
  // can watch the simulator drive bookings through the lifecycle in real time.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, country]);
  useEffect(() => {
    if (code !== "express") return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, country, q]);

  if (code !== "express") {
    return <div className="text-sm text-muted-foreground p-6">Bookings tab is Express-only.</div>;
  }

  const items = data?.items || [];
  return (
    <div className="space-y-4" data-testid="express-bookings">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {EXPRESS_STATUS_FILTERS.map((s) => (
            <button
              key={s.code}
              data-testid={`bookings-filter-${s.code === "any" ? "all" : s.code}`}
              onClick={() => setFilter(s.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold motion-fast ${filter === s.code ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            data-testid="bookings-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-secondary rounded-md px-2 py-1.5 text-xs border border-transparent focus:border-primary focus:outline-none"
          >
            <option value="any">All countries</option>
            <option value="CI">🇨🇮 CI</option>
            <option value="LR">🇱🇷 LR</option>
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="bookings-search"
              placeholder="ref / receiver / phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="pl-7 bg-secondary rounded-md px-3 py-1.5 text-xs w-52 border border-transparent focus:border-primary focus:outline-none"
            />
          </div>
          <button data-testid="bookings-refresh" onClick={load} className="w-8 h-8 rounded-md bg-secondary hover:bg-secondary/70 flex items-center justify-center motion-fast" title="Refresh">
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Summary count */}
      <div className="text-[11px] text-muted-foreground">
        {busy && !data ? "Loading…" : `${data?.total ?? 0} booking${(data?.total ?? 0) === 1 ? "" : "s"}${filter !== "any" ? ` · ${EXPRESS_STATUS_FILTERS.find(s => s.code === filter)?.label.toLowerCase()}` : ""} · Auto-refresh 15s`}
      </div>

      {/* Table */}
      <div className="baked-card bg-card border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Ref</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Route</th>
              <th className="text-left p-3">Receiver</th>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-right p-3">Total</th>
              <th className="text-right p-3">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-xs text-muted-foreground italic">No bookings match the current filter.</td></tr>
            ) : items.map((b) => (
              <tr key={b.id} data-testid={`bookings-row-${b.id}`} className="border-t border-border hover:bg-secondary/30 motion-fast">
                <td className="p-3 whitespace-nowrap">
                  <div className="text-xs font-bold">{b.ref}</div>
                  <div className="text-[10px] text-muted-foreground">{b.booking_type} · {b.country}</div>
                </td>
                <td className="p-3"><StatusPill status={b.status} /></td>
                <td className="p-3 max-w-[280px]">
                  <div className="text-[11px] flex items-center gap-1 truncate"><MapPin size={10} className="shrink-0 text-muted-foreground" /> {b.pickup || "—"}</div>
                  <div className="text-[11px] flex items-center gap-1 truncate text-muted-foreground"><MapPin size={10} className="shrink-0" /> {b.drop || "—"}</div>
                  {b.distance_km != null && <div className="text-[9px] text-muted-foreground mt-0.5">{b.distance_km.toFixed(1)} km · {b.duration_min ?? "—"} min</div>}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <div className="text-xs font-medium">{b.receiver_name || "—"}</div>
                  {b.receiver_phone && <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone size={9} /> {b.receiver_phone}</div>}
                </td>
                <td className="p-3 text-xs capitalize whitespace-nowrap">
                  {b.vehicle_code ? (
                    <span className="inline-flex items-center gap-1">
                      {(b.vehicle_code === "bike" || b.vehicle_code === "scooter") ? <Bike size={11} /> : <Truck size={11} />}
                      {b.vehicle_code.replace("_", " ")}
                    </span>
                  ) : "—"}
                </td>
                <td className="p-3 text-xs whitespace-nowrap">
                  {b.driver_name ? (
                    <div>
                      <div className="font-medium">{b.driver_name}</div>
                      {b.eta_seconds != null && b.eta_seconds > 0 && <div className="text-[10px] text-muted-foreground">ETA {Math.round(b.eta_seconds / 60)}m</div>}
                    </div>
                  ) : <span className="text-muted-foreground italic">unassigned</span>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <div className="text-xs font-bold tabular-nums">{fmtMoney(b.total, b.currency_symbol)}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{b.payment_method || "cod"} · {b.payment_status}</div>
                </td>
                <td className="p-3 text-right whitespace-nowrap text-[11px] text-muted-foreground">{fmtRelative(b.updated_at)}</td>
                <td className="p-3 text-right">
                  <button
                    data-testid={`bookings-open-${b.id}`}
                    onClick={() => navigate(`/send/booking/${b.id}/track`)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

