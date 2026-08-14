/**
 * Catalogue — Supplier ↔ master SKU linkage with cost, MOQ, lead-time.
 *
 * Left: existing catalogue rows (search, inline edit, activate/deactivate).
 * Right: "Add product" flow — type-ahead master product search then set cost.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { PackageSearch, Search, Plus, Trash2, Check, X, PowerOff, Power } from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };

export const PortalCatalogue = () => {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = { q: q || undefined, is_active: showActiveOnly ? true : undefined };
      const { data } = await portalApi.get("/supplier/me/catalogue", { params });
      setItems(data.items);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  }, [q, showActiveOnly]);

  useEffect(() => { load(); }, [load]);

  const beginEdit = (row) => {
    setEditingId(row.id);
    setEdit({
      supplier_sku: row.supplier_sku || "",
      cost_price: row.cost_price, moq: row.moq,
      lead_time_days: row.lead_time_days, notes: row.notes || "",
      is_active: row.is_active,
    });
  };
  const cancelEdit = () => { setEditingId(null); setEdit({}); };
  const saveEdit = async (id) => {
    try {
      await portalApi.patch(`/supplier/me/catalogue/${id}`, {
        supplier_sku: edit.supplier_sku || null,
        cost_price: Number(edit.cost_price),
        moq: Number(edit.moq),
        lead_time_days: Number(edit.lead_time_days),
        notes: edit.notes || null,
        is_active: edit.is_active,
      });
      toast.success("Updated");
      cancelEdit(); load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const toggleActive = async (row) => {
    try {
      await portalApi.patch(`/supplier/me/catalogue/${row.id}`, { is_active: !row.is_active });
      toast.success(row.is_active ? "Deactivated" : "Activated");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const del = async (row) => {
    if (!window.confirm(`Remove "${row.master?.name}" from your catalogue?`)) return;
    try {
      await portalApi.delete(`/supplier/me/catalogue/${row.id}`);
      toast.success("Removed");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-6" data-testid="portal-catalogue">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="pl-eyebrow mb-2">Product catalogue</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Your SKUs</h1>
          <p className="pl-body mt-2">Link the master products you supply and set your cost, MOQ and lead time.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="pl-btn pl-btn-primary" data-testid="catalogue-add-btn">
          <Plus size={14} /> Add product
        </button>
      </div>

      <div className="pl-card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[260px] px-3 h-11 rounded-xl" style={inputStyle}>
          <Search size={14} style={{ color: "var(--pl-fg-muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product name, master SKU, your SKU…"
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--pl-fg)" }}
            data-testid="catalogue-search-input" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--pl-fg-muted)" }}>
          <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} data-testid="catalogue-active-toggle" />
          Active only
        </label>
      </div>

      <div className="pl-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Product</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Your SKU</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Cost</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>MOQ</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Lead</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Status</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !busy && (
              <tr><td colSpan={7} className="text-center py-10" style={{ color: "var(--pl-fg-muted)" }} data-testid="catalogue-empty">
                No catalogue rows yet. Click <em>Add product</em> to link your first SKU.
              </td></tr>
            )}
            {items.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--pl-border)" }} data-testid={`catalogue-row-${row.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.master?.image_url && <img src={row.master.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
                      <div>
                        <div className="font-medium" style={{ color: "var(--pl-fg)" }}>{row.master?.name || "—"}</div>
                        <div className="text-xs font-mono" style={{ color: "var(--pl-fg-muted)" }}>{row.master?.sku || row.master_product_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input value={edit.supplier_sku} onChange={(e) => setEdit({ ...edit, supplier_sku: e.target.value })}
                        className="w-full px-2 h-8 rounded text-xs" style={inputStyle} data-testid={`catalogue-edit-sku-${row.id}`} />
                    ) : (
                      <div className="text-xs font-mono" style={{ color: "var(--pl-fg)" }}>{row.supplier_sku || "—"}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {isEditing ? (
                      <input type="number" min={0} step="0.01" value={edit.cost_price} onChange={(e) => setEdit({ ...edit, cost_price: e.target.value })}
                        className="w-24 px-2 h-8 rounded text-xs text-right" style={inputStyle} data-testid={`catalogue-edit-cost-${row.id}`} />
                    ) : (
                      <span style={{ color: "var(--pl-fg)" }}>{Number(row.cost_price).toFixed(2)} <span className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{row.currency}</span></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input type="number" min={1} value={edit.moq} onChange={(e) => setEdit({ ...edit, moq: e.target.value })}
                        className="w-16 px-2 h-8 rounded text-xs text-right" style={inputStyle} data-testid={`catalogue-edit-moq-${row.id}`} />
                    ) : (<span style={{ color: "var(--pl-fg)" }}>{row.moq}</span>)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input type="number" min={0} value={edit.lead_time_days} onChange={(e) => setEdit({ ...edit, lead_time_days: e.target.value })}
                        className="w-16 px-2 h-8 rounded text-xs text-right" style={inputStyle} data-testid={`catalogue-edit-lead-${row.id}`} />
                    ) : (<span style={{ color: "var(--pl-fg)" }}>{row.lead_time_days} d</span>)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: row.is_active ? "rgba(119,188,31,.15)" : "rgba(148,148,148,.15)",
                               color: row.is_active ? "#77BC1F" : "var(--pl-fg-muted)" }}
                      data-testid={`catalogue-status-${row.id}`}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(row.id)} className="pl-btn pl-btn-primary px-2 h-8" data-testid={`catalogue-save-${row.id}`}><Check size={12} /></button>
                          <button onClick={cancelEdit} className="pl-btn pl-btn-ghost px-2 h-8" data-testid={`catalogue-cancel-${row.id}`}><X size={12} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => beginEdit(row)} className="text-xs px-3 h-8 rounded-lg font-medium" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }} data-testid={`catalogue-edit-${row.id}`}>Edit</button>
                          <button onClick={() => toggleActive(row)} title={row.is_active ? "Deactivate" : "Activate"} className="pl-btn pl-btn-ghost px-2 h-8" data-testid={`catalogue-toggle-${row.id}`}>
                            {row.is_active ? <PowerOff size={12} /> : <Power size={12} />}
                          </button>
                          <button onClick={() => del(row)} title="Remove" className="pl-btn pl-btn-ghost px-2 h-8" style={{ color: "#FF4C52" }} data-testid={`catalogue-del-${row.id}`}><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {addOpen && <AddProductModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); load(); }} />}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Add-product modal                              */
/* -------------------------------------------------------------------------- */

const AddProductModal = ({ onClose, onAdded }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ supplier_sku: "", cost_price: "", moq: 1, lead_time_days: 0, notes: "" });
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await portalApi.get("/supplier/me/catalogue/master-products", {
          params: { q: q || undefined, limit: 20 },
        });
        setResults(data.items);
      } catch (e) { /* silent */ }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const save = async () => {
    if (!picked) return toast.error("Pick a master product first");
    if (!form.cost_price || Number(form.cost_price) < 0) return toast.error("Cost is required");
    setBusy(true);
    try {
      await portalApi.post("/supplier/me/catalogue", {
        master_product_id: picked.id,
        supplier_sku: form.supplier_sku || null,
        cost_price: Number(form.cost_price),
        moq: Math.max(1, Number(form.moq) || 1),
        lead_time_days: Math.max(0, Number(form.lead_time_days) || 0),
        notes: form.notes || null,
      });
      toast.success(`Linked ${picked.name}`);
      onAdded();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pl-card p-6 w-full max-w-2xl" data-testid="catalogue-add-modal">
        <div className="flex items-center gap-3 mb-4">
          <PackageSearch size={20} style={{ color: "var(--pl-accent)" }} />
          <div>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Link master product</div>
            <div className="pl-h3" style={{ color: "var(--pl-fg)" }}>Add to catalogue</div>
          </div>
        </div>

        {!picked ? (
          <>
            <div className="flex items-center gap-2 px-3 h-11 rounded-xl mb-3" style={inputStyle}>
              <Search size={14} style={{ color: "var(--pl-fg-muted)" }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 1 character…"
                className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--pl-fg)" }}
                data-testid="catalogue-add-search" />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1" data-testid="catalogue-add-results">
              {results.length === 0 && <div className="text-sm p-4 text-center" style={{ color: "var(--pl-fg-muted)" }}>Type to search master products in your country.</div>}
              {results.map((p) => (
                <button key={p.id} onClick={() => setPicked(p)} data-testid={`catalogue-add-result-${p.id}`}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left"
                  style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
                  {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" style={{ color: "var(--pl-fg)" }}>{p.name}</div>
                    <div className="text-xs font-mono" style={{ color: "var(--pl-fg-muted)" }}>{p.sku || p.id}</div>
                  </div>
                  {p.mrp && <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>MRP {p.mrp}</div>}
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={onClose} className="pl-btn pl-btn-ghost" data-testid="catalogue-add-close">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-lg mb-4 flex items-center gap-3" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
              {picked.image_url && <img src={picked.image_url} alt="" className="w-12 h-12 rounded object-cover" />}
              <div className="flex-1">
                <div className="font-medium" style={{ color: "var(--pl-fg)" }} data-testid="catalogue-add-picked-name">{picked.name}</div>
                <div className="text-xs font-mono" style={{ color: "var(--pl-fg-muted)" }}>{picked.sku || picked.id}</div>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs underline" style={{ color: "var(--pl-fg-muted)" }} data-testid="catalogue-add-change">Change</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Your SKU (optional)</label>
                <input value={form.supplier_sku} onChange={(e) => setForm({ ...form, supplier_sku: e.target.value })}
                  className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="catalogue-add-sku" /></div>
              <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Cost price *</label>
                <input type="number" min={0} step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="catalogue-add-cost" /></div>
              <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>MOQ</label>
                <input type="number" min={1} value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })}
                  className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="catalogue-add-moq" /></div>
              <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Lead time (days)</label>
                <input type="number" min={0} value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })}
                  className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="catalogue-add-lead" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="pl-btn pl-btn-ghost" data-testid="catalogue-add-cancel">Cancel</button>
              <button onClick={save} disabled={busy} className="pl-btn pl-btn-primary" data-testid="catalogue-add-save">
                <Plus size={14} /> {busy ? "Adding…" : "Add to catalogue"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PortalCatalogue;
