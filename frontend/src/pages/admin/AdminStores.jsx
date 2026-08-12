/**
 * AdminStores — platform-wide Dark Store CRUD + lifecycle actions.
 * (Fixing_Prompt §29/§30 — operators onboard, approve, activate, suspend
 * and close stores without ever touching the DB.)
 *
 * Data:
 *   GET    /api/admin/stores?status=&city=&partner_id=&q=
 *   GET    /api/admin/stores/_meta/transitions
 *   POST   /api/admin/stores
 *   PATCH  /api/admin/stores/{id}
 *   POST   /api/admin/stores/{id}/lifecycle   { action, reason }
 *   DELETE /api/admin/stores/{id}
 */
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search, Plus, X, Warehouse as WarehouseIcon, MapPin, Building2,
  CheckCircle2, PauseCircle, Wrench, XCircle, Loader2, RefreshCw,
} from "lucide-react";
import { adminApi as api } from "@/contexts/AdminContext";


/* ----------------------------- Meta ----------------------------- */

const STATUS_META = {
  pending:                   { color: "#94a3b8", label: "Pending" },
  under_review:              { color: "#facc15", label: "Under review" },
  additional_info_required:  { color: "#facc15", label: "Info required" },
  approved:                  { color: "#5eead4", label: "Approved" },
  rejected:                  { color: "#f87171", label: "Rejected" },
  setup_required:            { color: "#7edcff", label: "Setup required" },
  setup_in_progress:         { color: "#7edcff", label: "Setup in progress" },
  active:                    { color: "#4ade80", label: "Active" },
  temporarily_suspended:     { color: "#fb923c", label: "Suspended" },
  maintenance:               { color: "#fbbf24", label: "Maintenance" },
  closed:                    { color: "#94a3b8", label: "Closed" },
};

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d.map(x => x?.msg).filter(Boolean).join(" · ");
  if (typeof d === "object" && d?.message) return d.message;
  return d || e?.message || "Something went wrong";
};


/* ----------------------------- Status pill ----------------------------- */

const StatusPill = ({ status, size = "sm" }) => {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded uppercase tracking-widest whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]"}`}
      style={{ background: `${m.color}15`, color: m.color, border: `1px solid ${m.color}44` }}
      data-testid={`store-status-${status}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
};


/* ----------------------------- Create Modal ----------------------------- */

const CreateStoreModal = ({ open, onClose, onCreated, partners }) => {
  const [f, setF] = useState({
    partner_id: "", name: "", address_line: "", city: "", country: "CI",
    region: "", service_area_km: 7, warehouse_capacity_sqm: "",
    time_zone: "Africa/Abidjan", store_type: "dark_store",
    contact_email: "", contact_phone: "", initial_status: "pending",
  });
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setF({ ...f, [k]: e.target?.value ?? e });

  const submit = async () => {
    if (!f.partner_id || !f.name || !f.address_line || !f.city) {
      return toast.error("Partner, name, address and city are required");
    }
    setBusy(true);
    try {
      const payload = { ...f };
      // Trim empties → backend expects nulls
      Object.keys(payload).forEach(k => { if (payload[k] === "") delete payload[k]; });
      if (payload.service_area_km) payload.service_area_km = Number(payload.service_area_km);
      if (payload.warehouse_capacity_sqm) payload.warehouse_capacity_sqm = Number(payload.warehouse_capacity_sqm);
      const { data } = await api.post("/admin/stores", payload);
      toast.success(`Store ${data.code} created`);
      onCreated(data);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
         data-testid="admin-store-create-modal">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Stores</div>
            <h2 className="text-lg font-semibold">Onboard a new dark store</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border"
                  data-testid="admin-store-create-close"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Partner</label>
            <select value={f.partner_id} onChange={upd("partner_id")}
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
                    data-testid="admin-store-partner">
              <option value="">— Select a partner —</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.business_name || p.owner_email} · {p.country || "—"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Store name" value={f.name} onChange={upd("name")} testid="admin-store-name" placeholder="Cocody Dark Store"/>
            <Field label="Store type" value={f.store_type} onChange={upd("store_type")} placeholder="dark_store" />
            <Field label="Address line" value={f.address_line} onChange={upd("address_line")} testid="admin-store-address" placeholder="12 Rue des Jardins"/>
            <Field label="City" value={f.city} onChange={upd("city")} testid="admin-store-city" placeholder="Cocody"/>
            <Field label="Region" value={f.region} onChange={upd("region")} placeholder="Abidjan Autonomous District" />
            <Field label="Country (ISO-2)" value={f.country} onChange={upd("country")} maxLength={2}/>
            <Field label="Service area (km)" value={f.service_area_km} onChange={upd("service_area_km")} type="number"/>
            <Field label="Warehouse capacity (sqm)" value={f.warehouse_capacity_sqm} onChange={upd("warehouse_capacity_sqm")} type="number"/>
            <Field label="Time zone" value={f.time_zone} onChange={upd("time_zone")} placeholder="Africa/Abidjan"/>
            <Field label="Contact email" value={f.contact_email} onChange={upd("contact_email")} type="email"/>
            <Field label="Contact phone" value={f.contact_phone} onChange={upd("contact_phone")} placeholder="+225…"/>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Initial status</label>
              <select value={f.initial_status} onChange={upd("initial_status")}
                      className="mt-1 w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
                      data-testid="admin-store-initial-status">
                {["pending", "approved", "setup_in_progress", "active"].map(s =>
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                )}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1">
                Defaults to <b>Pending</b>. Bump to <b>Active</b> only for pre-approved partners.
              </div>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg text-sm border border-border">Cancel</button>
          <button onClick={submit} disabled={busy}
                  className="h-10 px-5 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-50"
                  data-testid="admin-store-create-submit">
            {busy ? <Loader2 size={14} className="inline animate-spin mr-2" /> : null}
            {busy ? "Creating…" : "Create store"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, testid, type = "text", placeholder, maxLength }) => (
  <div>
    <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
    <input value={value ?? ""} onChange={onChange} type={type} placeholder={placeholder} maxLength={maxLength}
           className="mt-1 w-full h-10 px-3 rounded-lg bg-background border border-border text-sm"
           data-testid={testid} />
  </div>
);


/* ----------------------------- Store detail drawer ----------------------------- */

const ACTION_ICON = {
  approved:               CheckCircle2,
  active:                 CheckCircle2,
  under_review:           RefreshCw,
  temporarily_suspended:  PauseCircle,
  maintenance:            Wrench,
  closed:                 XCircle,
  rejected:               XCircle,
};

const StoreDrawer = ({ store, transitions, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const allowed = transitions?.transitions?.[store.status] || [];

  const act = async (action) => {
    if (!window.confirm(`Transition ${store.code} → ${STATUS_META[action].label}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/stores/${store.id}/lifecycle`,
        { action, reason: reason || undefined });
      toast.success(`Store is now ${STATUS_META[action].label}`);
      setReason("");
      onChanged(data);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const hardDelete = async () => {
    if (!window.confirm(`Permanently delete ${store.code}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/stores/${store.id}`);
      toast.success("Store removed");
      onClose(true);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="admin-store-drawer">
      <div className="flex-1 bg-black/60" onClick={() => onClose(false)} />
      <div className="w-full max-w-md bg-card border-l border-border h-full overflow-y-auto flex flex-col">
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Store</div>
            <div className="text-lg font-semibold truncate">{store.name}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <code className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-foreground"
                    data-testid="admin-store-drawer-code">{store.code}</code>
              <StatusPill status={store.status} />
            </div>
          </div>
          <button onClick={() => onClose(false)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-border"
                  data-testid="admin-store-drawer-close"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <Detail label="Partner" value={store.partner_name || store.partner_id} />
          <Detail label="Address" value={`${store.address_line}, ${store.city}${store.region ? ", " + store.region : ""}`} />
          <Detail label="Country" value={store.country} />
          <Detail label="Contact"
                  value={[store.contact_email, store.contact_phone].filter(Boolean).join(" · ") || "—"} />
          <Detail label="Coordinates"
                  value={store.latitude && store.longitude ? `${store.latitude}, ${store.longitude}` : "—"} />
          {store.latitude && store.longitude && (
            <a href={`https://www.google.com/maps?q=${store.latitude},${store.longitude}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
               style={{ color: "var(--primary)" }}
               data-testid="admin-store-view-on-map">
              <MapPin size={12} /> View on Google Maps ↗
            </a>
          )}
          <Detail label="Service area" value={store.service_area_km ? `${store.service_area_km} km` : "—"} />
          <Detail label="Capacity" value={store.warehouse_capacity_sqm ? `${store.warehouse_capacity_sqm} sqm` : "—"} />
          <Detail label="Time zone" value={store.time_zone || "—"} />
          <Detail label="Store type" value={store.store_type || "—"} />
          <Detail label="Created" value={store.created_at ? new Date(store.created_at).toLocaleString() : "—"} />
        </div>

        <div className="p-4 mt-auto border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Lifecycle</div>
          {allowed.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This is a terminal state — no further transitions available.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {allowed.map(a => {
                  const Icon = ACTION_ICON[a] || RefreshCw;
                  const m = STATUS_META[a];
                  return (
                    <button key={a} disabled={busy} onClick={() => act(a)}
                            data-testid={`admin-store-action-${a}`}
                            className="h-11 rounded-lg text-xs px-3 flex items-center gap-2 justify-center"
                            style={{
                              background: `${m.color}22`, color: m.color,
                              border: `1px solid ${m.color}55`,
                            }}>
                      <Icon size={14} />
                      <span className="uppercase tracking-widest">{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional reason (for audit log)"
                        className="w-full text-xs p-2 rounded-lg bg-background border border-border resize-none"
                        data-testid="admin-store-action-reason" />
            </>
          )}
          {(store.status === "pending" || store.status === "rejected" || store.status === "closed") && (
            <button onClick={hardDelete} disabled={busy}
                    className="mt-3 w-full h-9 rounded-lg text-xs text-red-400 border border-red-400/40"
                    data-testid="admin-store-hard-delete">
              Delete permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Detail = ({ label, value }) => (
  <div>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="mt-0.5 break-words">{value}</div>
  </div>
);


/* ----------------------------- Page ----------------------------- */

export const AdminStores = () => {
  const [data,     setData]     = useState({ items: [], total: 0, status_counts: {} });
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState({ status: "", country: "", q: "" });
  const [meta,     setMeta]     = useState({ statuses: [], transitions: {}, operational: [] });
  const [partners, setPartners] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const [{ data: list }, { data: transitions }] = await Promise.all([
        api.get("/admin/stores", { params }),
        api.get("/admin/stores/_meta/transitions"),
      ]);
      setData(list);
      setMeta(transitions);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  };

  // Partner picklist is loaded once — used in the create modal.
  const loadPartners = async () => {
    try {
      const { data } = await api.get("/admin/stores/_meta/partners", { params: { limit: 200 } });
      setPartners(data.items || []);
    } catch (e) {
      console.warn("Could not load partner picklist:", errMsg(e));
    }
  };

  useEffect(() => { load(); loadPartners(); }, []);
  useEffect(() => { load(); }, [filters.status, filters.country]);

  const filtered = useMemo(() => {
    if (!filters.q) return data.items;
    const q = filters.q.toLowerCase();
    return data.items.filter(s =>
      (s.code || "").toLowerCase().includes(q) ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q) ||
      (s.partner_name || "").toLowerCase().includes(q)
    );
  }, [data.items, filters.q]);

  const selected = data.items.find(s => s.id === selectedId);

  const kpi = (status) => data.status_counts?.[status] || 0;

  return (
    <div data-testid="admin-stores-page">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Platform Governance</div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <WarehouseIcon size={22} /> Stores
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onboard, approve, activate, suspend or close dark stores across every partner. Store codes are auto-generated.
          </p>
        </div>
        <button onClick={() => setCreating(true)}
                data-testid="admin-stores-create-btn"
                className="h-10 px-4 rounded-lg text-sm inline-flex items-center gap-2 bg-primary text-primary-foreground">
          <Plus size={14} /> New store
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Active",        keys: ["active"],                                         color: "#4ade80" },
          { label: "Setup",         keys: ["setup_required", "setup_in_progress"],           color: "#7edcff" },
          { label: "Under review",  keys: ["pending", "under_review", "additional_info_required"], color: "#facc15" },
          { label: "On hold",       keys: ["temporarily_suspended", "maintenance"],           color: "#fb923c" },
          { label: "Terminated",    keys: ["rejected", "closed"],                             color: "#94a3b8" },
        ].map(k => {
          const total = k.keys.reduce((s, x) => s + kpi(x), 0);
          return (
            <div key={k.label} className="rounded-xl p-3 border border-border bg-card"
                 data-testid={`admin-stores-kpi-${k.label.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
              <div className="text-2xl font-semibold mt-1" style={{ color: k.color }}>{total}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input placeholder="Search by code, name, city, or partner…"
                 value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                 className="w-full h-10 pl-9 pr-3 rounded-lg bg-card border border-border text-sm"
                 data-testid="admin-stores-search" />
        </div>
        <select value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="h-10 px-3 rounded-lg bg-card border border-border text-sm"
                data-testid="admin-stores-filter-status">
          <option value="">All statuses</option>
          {meta.statuses.map(s => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
        </select>
        <select value={filters.country}
                onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                className="h-10 px-3 rounded-lg bg-card border border-border text-sm"
                data-testid="admin-stores-filter-country">
          <option value="">All countries</option>
          <option value="CI">Côte d&apos;Ivoire</option>
          <option value="GH">Ghana</option>
          <option value="NG">Nigeria</option>
          <option value="SN">Senegal</option>
          <option value="CM">Cameroon</option>
        </select>
        <button onClick={load} className="h-10 px-3 rounded-lg text-sm border border-border"
                data-testid="admin-stores-refresh">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="grid grid-cols-[130px_1fr_160px_160px_120px] gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
          <div>Store code</div>
          <div>Name / partner</div>
          <div>City · Country</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        {loading && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground" data-testid="admin-stores-empty">
            No stores match your filters. Adjust filters or onboard a new store.
          </div>
        )}
        {filtered.map(s => (
          <div key={s.id} data-testid={`admin-store-row-${s.code}`}
               className="grid grid-cols-[130px_1fr_160px_160px_120px] gap-3 px-4 py-3 items-center border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
               onClick={() => setSelectedId(s.id)}>
            <code className="text-[11px] px-1.5 py-0.5 rounded bg-secondary inline-flex items-center gap-1">
              <WarehouseIcon size={10} /> {s.code}
            </code>
            <div className="min-w-0">
              <div className="text-sm truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Building2 size={10} /> {s.partner_name || s.partner_id}
              </div>
            </div>
            <div className="text-xs flex items-center gap-1 text-muted-foreground">
              <MapPin size={10} /> {s.city} · {s.country}
            </div>
            <div><StatusPill status={s.status} /></div>
            <div className="text-right">
              <button className="text-xs text-primary underline underline-offset-2"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
                      data-testid={`admin-store-manage-${s.code}`}>
                Manage
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground mt-3">
        Showing <b>{filtered.length}</b> of <b>{data.total}</b> stores.
      </div>

      {creating && (
        <CreateStoreModal
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => load()}
          partners={partners}
        />
      )}
      {selected && (
        <StoreDrawer
          store={selected}
          transitions={meta}
          onClose={(refresh) => { setSelectedId(null); if (refresh) load(); }}
          onChanged={(updated) => {
            // Merge the updated row without a full refresh.
            setData(d => ({
              ...d,
              items: d.items.map(x => x.id === updated.id ? { ...x, ...updated } : x),
            }));
          }}
        />
      )}
    </div>
  );
};

export default AdminStores;
