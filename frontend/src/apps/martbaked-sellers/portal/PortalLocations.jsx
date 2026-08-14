/**
 * Supply Locations — supplier adds cities / zones / countries they can deliver to.
 * SA still gates the actual dark-store linkage; approval_status starts pending.
 */
import React, { useCallback, useEffect, useState } from "react";
import { MapPinned, Plus, Trash2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };

const KINDS = [
  { v: "supply_city", label: "City" },
  { v: "supply_zone", label: "Zone / neighbourhood" },
  { v: "supply_country", label: "Country-wide" },
];

const STATUS_META = {
  pending: { color: "#FCC44C", label: "Pending SA approval", icon: Clock },
  approved: { color: "#77BC1F", label: "Approved", icon: CheckCircle2 },
  rejected: { color: "#FF4C52", label: "Rejected", icon: XCircle },
};

export const PortalLocations = () => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ kind: "supply_city", city: "", zone: "", country: "CI", service_radius_km: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await portalApi.get("/supplier/me/supply-locations");
      setItems(data.items);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.city && !form.zone && !form.country) return toast.error("Enter a city, zone or country");
    setBusy(true);
    try {
      await portalApi.post("/supplier/me/supply-locations", {
        kind: form.kind,
        city: form.city || null, zone: form.zone || null,
        country: form.country, label: form.city || form.zone || form.country,
        service_radius_km: form.service_radius_km ? Number(form.service_radius_km) : null,
      });
      toast.success("Location added — pending Super Admin approval");
      setForm({ kind: "supply_city", city: "", zone: "", country: "CI", service_radius_km: "" });
      load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const del = async (row) => {
    if (!window.confirm(`Remove "${row.label}"?`)) return;
    try { await portalApi.delete(`/supplier/me/supply-locations/${row.id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-6" data-testid="portal-locations">
      <div>
        <div className="pl-eyebrow mb-2">Supply locations</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Where you can deliver</h1>
        <p className="pl-body mt-2">Add the cities, zones or countries you can supply to. Super Admin curates the actual dark-store links.</p>
      </div>

      <form onSubmit={add} className="pl-card p-6 grid md:grid-cols-6 gap-3 items-end" data-testid="portal-locations-form">
        <div className="md:col-span-1">
          <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Kind</label>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="portal-loc-kind">
            {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>City</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Abidjan"
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="portal-loc-city" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Zone</label>
          <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Cocody"
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="portal-loc-zone" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Country</label>
          <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="portal-loc-country">
            <option value="CI">CI</option><option value="LR">LR</option>
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Radius (km)</label>
          <input type="number" min={1} value={form.service_radius_km} onChange={(e) => setForm({ ...form, service_radius_km: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="portal-loc-radius" />
        </div>
        <button type="submit" disabled={busy} className="pl-btn pl-btn-primary h-11" data-testid="portal-loc-add">
          <Plus size={14} /> {busy ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="pl-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Kind</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>City / zone</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Country</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Radius</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Status</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10" style={{ color: "var(--pl-fg-muted)" }} data-testid="portal-locations-empty">
                No coverage areas yet. Add your first above.
              </td></tr>
            )}
            {items.map((l) => {
              const m = STATUS_META[l.approval_status] || STATUS_META.pending;
              const Icon = m.icon;
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--pl-border)" }} data-testid={`portal-loc-row-${l.id}`}>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--pl-fg-muted)" }}>{KINDS.find((k) => k.v === l.kind)?.label || l.kind}</td>
                  <td className="px-4 py-3" style={{ color: "var(--pl-fg)" }}>{l.city || l.zone || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--pl-fg)" }}>{l.country || "—"}</td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--pl-fg-muted)" }}>{l.service_radius_km ? `${l.service_radius_km} km` : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${m.color}22`, color: m.color }} data-testid={`portal-loc-status-${l.id}`}>
                      <Icon size={11} /> {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => del(l)} className="pl-btn pl-btn-ghost px-2 h-8" style={{ color: "#FF4C52" }} data-testid={`portal-loc-del-${l.id}`}><Trash2 size={12} /></button>
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

export default PortalLocations;
