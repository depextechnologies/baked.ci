import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../contexts/AdminContext";
import { Button } from "../../components/ui/button";
import { Users, ShoppingBag, DollarSign, Globe, Sparkles, Trash2, PlusCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

const fmtMoney = (n, ccy) => `${(n || 0).toLocaleString("en-GB")} ${ccy || ""}`.trim();
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "-");

// ============ DASHBOARD ============
export const AdminDashboard = () => {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get("/admin/dashboard").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const kpis = [
    { label: "Customers", value: data.customers.total, sub: `${data.customers.verified} verified`, icon: Users, color: "#1D9BF0" },
    { label: "Orders (all-time)", value: data.orders.total, sub: `${data.orders.last_7d} last 7d`, icon: ShoppingBag, color: "#77BC1F" },
    { label: "Active countries", value: data.footprint.countries, sub: `${data.footprint.products} products`, icon: Globe, color: "#FCC44C" },
    { label: "AI calls", value: data.footprint.ai_calls, sub: "cumulative", icon: Sparkles, color: "#A659FF" },
  ];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-muted-foreground">Platform-wide KPIs updated in real time.</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="baked-card bg-card border border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</div>
                  <div className="text-3xl font-bold mt-2">{k.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{k.sub}</div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${k.color}22`, color: k.color }}><Icon size={20} /></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="baked-card bg-card border border-border p-5">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2"><DollarSign size={16} style={{ color: "#77BC1F" }} /> Revenue by currency</div>
        {data.revenue.length === 0 ? <div className="text-xs text-muted-foreground">No paid orders yet.</div> : (
          <div className="grid gap-2">
            {data.revenue.map((r) => (
              <div key={r.currency} className="flex items-center justify-between text-sm">
                <span className="font-medium">{r.currency}</span>
                <span className="text-muted-foreground">{r.count} orders</span>
                <span className="font-bold">{fmtMoney(r.revenue, r.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ COUNTRIES ============
const emptyCountry = { code: "", name: "", flag: "", currency: "", currency_symbol: "", locale: "", phone_code: "", timezone: "", active: true, primary: false, min_order: 0, delivery_fee: 0, free_delivery_over: 0, delivery_eta_min: "10-15 min" };
export const AdminCountries = () => {
  const [items, setItems] = useState([]); const [editing, setEditing] = useState(null);
  const load = async () => setItems((await adminApi.get("/admin/countries")).data);
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!editing.code || !editing.name) return toast.error("Code and name required");
    await adminApi.post("/admin/countries", editing); toast.success("Saved"); setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Countries</h1><Button data-testid="admin-country-add" onClick={() => setEditing({ ...emptyCountry })} className="baked-btn font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}><PlusCircle size={16} className="mr-2" /> Add Country</Button></div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Code</th><th className="text-left p-3">Name</th><th className="text-left p-3">Currency</th><th className="text-left p-3">Locale</th><th className="text-left p-3">Active</th><th /></tr></thead>
          <tbody>{items.map((c) => (
            <tr key={c.code} className="border-t border-border">
              <td className="p-3 font-mono">{c.flag} {c.code}</td><td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.currency} ({c.currency_symbol})</td><td className="p-3">{c.locale}</td>
              <td className="p-3">{c.active ? "✓" : "—"}</td><td className="p-3 text-right"><button onClick={() => setEditing({ ...emptyCountry, ...c })} className="text-xs text-primary hover:underline">Edit</button></td>
            </tr>))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="baked-card bg-card border border-border p-5 space-y-3">
          <div className="text-sm font-semibold">{editing.name ? `Edit ${editing.name}` : "New country"}</div>
          <div className="grid grid-cols-2 gap-3">
            {["code","name","flag","currency","currency_symbol","locale","phone_code","timezone","delivery_eta_min"].map((f) => (
              <label key={f} className="text-xs"><span className="text-muted-foreground">{f}</span><input value={editing[f] || ""} onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" /></label>
            ))}
            {["min_order","delivery_fee","free_delivery_over"].map((f) => (
              <label key={f} className="text-xs"><span className="text-muted-foreground">{f}</span><input type="number" value={editing[f] || 0} onChange={(e) => setEditing({ ...editing, [f]: parseFloat(e.target.value) || 0 })} className="baked-input w-full bg-secondary px-2 py-1.5 mt-1" /></label>
            ))}
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
          </div>
          <div className="flex gap-2"><Button data-testid="admin-country-save" onClick={save} className="baked-btn font-semibold" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>Save</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
};

// ============ CITIES ============
export const AdminCities = () => {
  const [items, setItems] = useState([]); const [name, setName] = useState(""); const [country, setCountry] = useState("CI");
  const [countries, setCountries] = useState([]);
  const load = async () => setItems((await adminApi.get("/admin/cities")).data);
  useEffect(() => { load(); adminApi.get("/admin/countries").then((r) => setCountries(r.data)); }, []);
  const add = async () => { if (!name) return; await adminApi.post("/admin/cities", { name, country }); setName(""); toast.success("City added"); load(); };
  const del = async (id) => { await adminApi.delete(`/admin/cities/${id}`); load(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Cities</h1></div>
      <div className="baked-card bg-card border border-border p-4 flex flex-wrap gap-2 items-end">
        <label className="text-xs flex-1 min-w-[180px]"><span className="text-muted-foreground">City name</span><input value={name} onChange={(e) => setName(e.target.value)} className="baked-input w-full bg-secondary px-3 py-2 mt-1" /></label>
        <label className="text-xs"><span className="text-muted-foreground">Country</span><select value={country} onChange={(e) => setCountry(e.target.value)} className="baked-input bg-secondary px-3 py-2 mt-1 block">{countries.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
        <Button data-testid="admin-city-add" onClick={add} className="baked-btn font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}><PlusCircle size={16} className="mr-2" /> Add</Button>
      </div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Country</th><th /></tr></thead>
          <tbody>{items.map((c) => (
            <tr key={c.id} className="border-t border-border"><td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.country}</td><td className="p-3 text-right"><button onClick={() => del(c.id)} className="text-xs text-red-500 hover:underline"><Trash2 size={12} className="inline" /></button></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ============ ROLES ============
export const AdminRoles = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { adminApi.get("/admin/roles").then((r) => setItems(r.data)); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Roles & Permissions</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((r) => (
          <div key={r.code} className="baked-card bg-card border border-border p-4">
            <div className="flex items-center justify-between"><div className="font-semibold">{r.label}</div><code className="text-[10px] text-muted-foreground">{r.code}</code></div>
            <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
            <div className="mt-3 flex flex-wrap gap-1">{(r.permissions || []).map((p) => <span key={p} className="text-[10px] baked-chip px-2 py-0.5 bg-secondary text-muted-foreground">{p}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ FINANCE ============
export const AdminFinance = () => {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.get("/admin/finance?days=30").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Finance</h1><p className="text-sm text-muted-foreground">Rolling {data.days}-day revenue and order totals across currencies.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        {data.totals.map((t) => (
          <div key={t.currency} className="baked-card bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{t.currency}</div>
            <div className="text-3xl font-bold mt-2">{fmtMoney(t.revenue, t.currency)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{t.orders} orders · avg {fmtMoney(t.avg_order, t.currency)}</div>
          </div>
        ))}
        {data.totals.length === 0 && <div className="text-sm text-muted-foreground">No paid orders yet.</div>}
      </div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border text-sm font-semibold">Daily series</div>
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Day</th><th className="text-left p-3">Currency</th><th className="text-right p-3">Orders</th><th className="text-right p-3">Revenue</th></tr></thead>
          <tbody>{data.series.map((s, i) => (<tr key={i} className="border-t border-border"><td className="p-3">{s.day}</td><td className="p-3">{s.currency}</td><td className="p-3 text-right">{s.orders}</td><td className="p-3 text-right font-medium">{fmtMoney(s.revenue, s.currency)}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ============ AI COMMAND CENTER ============
const emptyPrompt = { name: "", feature: "", body: "", model: "claude-sonnet-4-6", active: true };
export const AdminAICommand = () => {
  const [items, setItems] = useState([]); const [editing, setEditing] = useState(null);
  const load = async () => setItems((await adminApi.get("/admin/ai/prompts")).data);
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (editing.id) await adminApi.patch(`/admin/ai/prompts/${editing.id}`, editing);
    else await adminApi.post("/admin/ai/prompts", editing);
    toast.success("Saved"); setEditing(null); load();
  };
  const del = async (id) => { await adminApi.delete(`/admin/ai/prompts/${id}`); load(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">AI Command Center</h1><p className="text-sm text-muted-foreground">Prompt library governing every AI-powered feature.</p></div><Button data-testid="admin-prompt-add" onClick={() => setEditing({ ...emptyPrompt })} className="baked-btn font-semibold" style={{ backgroundColor: "#A659FF", color: "white" }}><PlusCircle size={16} className="mr-2" /> New prompt</Button></div>
      <div className="grid gap-3">
        {items.map((p) => (
          <div key={p.id} className="baked-card bg-card border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><div className="font-semibold">{p.name}</div><code className="text-[10px] text-muted-foreground">{p.feature}</code>{p.active && <span className="text-[10px] baked-chip px-2 py-0.5 bg-[#77BC1F22] text-[#77BC1F]">Active</span>}</div>
                <div className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{p.body}</div>
              </div>
              <div className="flex gap-2"><button onClick={() => setEditing(p)} className="text-xs text-primary hover:underline">Edit</button><button onClick={() => del(p.id)} className="text-xs text-red-500 hover:underline"><Trash2 size={12} className="inline" /></button></div>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="baked-card bg-card border border-border p-5 space-y-3">
          <div className="text-sm font-semibold">{editing.id ? "Edit prompt" : "New prompt"}</div>
          <input placeholder="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <input placeholder="Feature (e.g. product_search)" value={editing.feature} onChange={(e) => setEditing({ ...editing, feature: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <textarea placeholder="Prompt body" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={6} className="baked-input w-full bg-secondary px-3 py-2 text-sm" />
          <input placeholder="Model" value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2"><Button onClick={save} data-testid="admin-prompt-save" className="baked-btn font-semibold" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>Save</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
};

// ============ AI BUSINESS INSIGHTS ============
export const AdminInsights = () => {
  const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    try { const { data } = await adminApi.post("/admin/ai/insights", { scope: "platform" }); setResult(data); toast.success("Insights generated"); }
    catch (e) { toast.error(e?.response?.data?.detail || "AI insights failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">AI Business Insights</h1><p className="text-sm text-muted-foreground">Claude Sonnet 4.6 reading your platform KPIs live.</p></div><Button data-testid="admin-insights-run" onClick={run} disabled={busy} className="baked-btn font-semibold" style={{ backgroundColor: "#A659FF", color: "white" }}><Sparkles size={16} className="mr-2" /> {busy ? "Thinking…" : "Run insights"}</Button></div>
      {result?.output && (
        <div className="baked-card bg-card border border-border p-5 space-y-4">
          {result.output.headline && <div className="text-lg font-bold">{result.output.headline}</div>}
          {result.output.insights?.length > 0 && (<div><div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Insights</div><ul className="list-disc list-inside text-sm space-y-1">{result.output.insights.map((i, k) => <li key={k}>{i}</li>)}</ul></div>)}
          {result.output.recommended_actions?.length > 0 && (<div><div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 mt-4">Recommended actions</div><ul className="list-disc list-inside text-sm space-y-1">{result.output.recommended_actions.map((i, k) => <li key={k}>{i}</li>)}</ul></div>)}
          {result.output.risks?.length > 0 && (<div><div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 mt-4">Risks</div><ul className="list-disc list-inside text-sm space-y-1 text-yellow-500">{result.output.risks.map((i, k) => <li key={k}>{i}</li>)}</ul></div>)}
        </div>
      )}
      {result?.kpis && (<div className="baked-card bg-card border border-border p-5"><div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">KPIs fed to the model</div><pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground overflow-x-auto">{JSON.stringify(result.kpis, null, 2)}</pre></div>)}
    </div>
  );
};

// ============ AUDIT LOGS ============
export const AdminAudit = () => {
  const [items, setItems] = useState([]); const [q, setQ] = useState("");
  const load = async () => setItems((await adminApi.get(`/admin/audit-logs${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Audit Logs</h1>
        <div className="flex items-center gap-2"><div className="relative"><Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter action" className="baked-input pl-7 pr-3 py-1.5 bg-secondary text-sm" /></div><Button onClick={load} variant="outline" className="baked-btn"><RefreshCw size={14} /></Button></div></div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Actor</th><th className="text-left p-3">Action</th><th className="text-left p-3">Target</th></tr></thead>
          <tbody>{items.map((a) => (<tr key={a.id} className="border-t border-border"><td className="p-3 text-xs text-muted-foreground">{fmtDate(a.created_at)}</td><td className="p-3 text-xs">{a.actor_email || a.actor_id}<div className="text-[10px] text-muted-foreground">{a.actor_kind}</div></td><td className="p-3 font-mono text-xs">{a.action}</td><td className="p-3 text-xs text-muted-foreground">{a.target_id || "-"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ============ CUSTOMERS ============
export const AdminCustomers = () => {
  const [items, setItems] = useState([]); const [q, setQ] = useState("");
  const load = async () => setItems((await adminApi.get(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Customers</h1>
        <div className="flex items-center gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone / email / name" className="baked-input px-3 py-1.5 bg-secondary text-sm" /><Button onClick={load} className="baked-btn font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}>Search</Button></div></div>
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Identity</th><th className="text-left p-3">Providers</th><th className="text-left p-3">Country</th><th className="text-left p-3">Verified</th><th className="text-left p-3">Joined</th></tr></thead>
          <tbody>{items.map((c) => (<tr key={c.id} className="border-t border-border"><td className="p-3"><div className="font-medium">{c.name || c.phone || c.email}</div><div className="text-[10px] text-muted-foreground">{c.phone || c.email}</div></td><td className="p-3 text-xs">{(c.auth_providers || []).join(", ")}</td><td className="p-3 text-xs">{c.country}</td><td className="p-3 text-xs">{c.verified ? "✓" : "—"}</td><td className="p-3 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
};

// ============ ADMIN USERS ============
export const AdminUsers = () => {
  const [items, setItems] = useState([]); const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "admin" });
  const load = async () => setItems((await adminApi.get("/admin/admins")).data);
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.email || !form.password || !form.name) return toast.error("Fill all fields");
    try { await adminApi.post("/admin/admins", form); toast.success("Admin created"); setCreating(false); setForm({ email: "", password: "", name: "", role: "admin" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const remove = async (id) => { await adminApi.delete(`/admin/admins/${id}`); load(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Admin Users</h1><Button data-testid="admin-user-add" onClick={() => setCreating(true)} className="baked-btn font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}><PlusCircle size={16} className="mr-2" /> Add admin</Button></div>
      {creating && (
        <div className="baked-card bg-card border border-border p-5 space-y-3">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="baked-input w-full bg-secondary px-3 py-2" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="baked-input bg-secondary px-3 py-2 block"><option value="admin">admin</option><option value="super_admin">super_admin</option></select>
          <div className="flex gap-2"><Button data-testid="admin-user-save" onClick={create} className="baked-btn font-semibold" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>Create</Button><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div>
        </div>
      )}
      <div className="baked-card bg-card border border-border overflow-hidden">
        <table className="w-full text-sm"><thead className="bg-secondary/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-left p-3">Since</th><th /></tr></thead>
          <tbody>{items.map((a) => (<tr key={a.id} className="border-t border-border"><td className="p-3 font-medium">{a.name}</td><td className="p-3">{a.email}</td><td className="p-3 text-xs uppercase">{a.role}</td><td className="p-3 text-xs text-muted-foreground">{fmtDate(a.created_at)}</td><td className="p-3 text-right"><button onClick={() => remove(a.id)} className="text-xs text-red-500 hover:underline"><Trash2 size={12} className="inline" /></button></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
};
