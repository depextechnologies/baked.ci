import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import {
  PlusCircle, CheckCircle2, XCircle, PauseCircle, Play, FileText,
  Upload, Trash2, User as UserIcon, Store, Bike, Package, ClipboardList,
  Sparkles,
} from "lucide-react";

const fmtMoney = (n, ccy) => `${(n || 0).toLocaleString("en-US")} ${ccy || ""}`.trim();
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "-");

// ============ MODULE OVERVIEW (Dashboard) ============
export const ModuleOverview = () => {
  const { meta, code } = useOutletContext();
  const [data, setData] = useState(null);
  useEffect(() => {
    adminApi.get(`/admin/modules/${code}/stats`)
      .then((r) => setData(r.data))
      .catch(() => setData({ module: code, status: "coming_soon", kpis: {}, revenue: [] }));
  }, [code]);

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
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(data.kpis).map(([k, v]) => (
          <div key={k} className="baked-card bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{k.replace(/_/g, " ")}</div>
            <div className="text-3xl font-bold mt-2">{v}</div>
          </div>
        ))}
      </div>
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
    </div>
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

const emptyDriver = { name: "", phone: "", email: "", country: "CI", city: "", vehicle_type: "scooter", vehicle_reg: "", license_number: "" };

export const ModuleDrivers = () => {
  const { meta, code } = useOutletContext();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = async () => setItems((await adminApi.get(`/admin/modules/${code}/drivers`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [code]);
  const save = async () => {
    if (!editing.name || !editing.phone) return toast.error("Name & phone required");
    await adminApi.post(`/admin/modules/${code}/drivers`, editing);
    toast.success("Driver added"); setEditing(null); load();
  };
  const setStatus = async (did, status) => {
    await adminApi.patch(`/admin/modules/${code}/drivers/${did}`, { status });
    toast.success(`Driver ${status}`); load();
  };
  const del = async (did) => { await adminApi.delete(`/admin/modules/${code}/drivers/${did}`); load(); };
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
                <option value="bike">Bike</option><option value="scooter">Scooter</option><option value="car">Car</option><option value="van">Van</option>
              </select>
            </label>
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
              <th className="text-left p-3">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (<tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No drivers yet.</td></tr>) : items.map((d) => {
              const st = DRIVER_STATUS[d.status] || DRIVER_STATUS.pending;
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-3"><div className="font-medium">{d.name}</div><div className="text-[10px] text-muted-foreground">{d.license_number || "no license on file"}</div></td>
                  <td className="p-3 text-xs">{d.phone}<div className="text-muted-foreground">{d.email || ""}</div></td>
                  <td className="p-3 text-xs capitalize">{d.vehicle_type} <span className="text-muted-foreground">· {d.vehicle_reg || "—"}</span></td>
                  <td className="p-3 text-xs">{d.city ? `${d.city}, ` : ""}{d.country}</td>
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
