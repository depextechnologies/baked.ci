/**
 * Product Requests — supplier proposes SKUs not yet in the master catalogue.
 * Super Admin reviews and either creates a master product (auto-linking the
 * supplier at proposed cost) or rejects with notes.
 */
import React, { useCallback, useEffect, useState } from "react";
import { PlusSquare, Plus, Clock, CheckCircle2, XCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };

const STATUS_META = {
  pending:  { color: "#FCC44C", label: "Pending",   icon: Clock },
  approved: { color: "#77BC1F", label: "Approved",  icon: CheckCircle2 },
  rejected: { color: "#FF4C52", label: "Rejected",  icon: XCircle },
  withdrawn:{ color: "#94A3B8", label: "Withdrawn", icon: XCircle },
};

export const PortalProductRequests = () => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reqs, cats] = await Promise.all([
        portalApi.get("/supplier/me/product-requests"),
        portalApi.get("/supplier/me/categories"),
      ]);
      setItems(reqs.data.items);
      const cs = Array.isArray(cats.data) ? cats.data : (cats.data.items || []);
      setCategories(cs);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6" data-testid="portal-product-requests">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="pl-eyebrow mb-2">Product requests</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Propose new products</h1>
          <p className="pl-body mt-2">If your SKU isn&apos;t already in our master catalogue, submit it here. Super Admin reviews and, on approval, auto-links it to your catalogue at your proposed cost.</p>
        </div>
        <button onClick={() => setShowForm(true)} disabled={categories.length === 0}
          className="pl-btn pl-btn-primary" data-testid="prod-req-new-btn"
          title={categories.length === 0 ? "Loading categories…" : "Propose a new product"}>
          <Plus size={14} /> {categories.length === 0 ? "Loading…" : "New request"}
        </button>
      </div>

      {showForm && <NewRequestForm categories={categories} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="prod-req-list">
        {items.length === 0 && !showForm && (
          <div className="col-span-3 pl-card p-8 text-center" style={{ color: "var(--pl-fg-muted)" }} data-testid="prod-req-empty">
            No product requests yet. Click <em>New request</em> to propose your first product.
          </div>
        )}
        {items.map((r) => {
          const m = STATUS_META[r.status] || STATUS_META.pending;
          const Icon = m.icon;
          return (
            <div key={r.id} className="pl-card p-5 space-y-3" data-testid={`prod-req-card-${r.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
                  <Package size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ color: "var(--pl-fg)" }}>{r.proposed_name}</div>
                  <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{r.proposed_manufacturer || "—"} · {r.proposed_pack_size || ""}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded shrink-0"
                  style={{ background: `${m.color}22`, color: m.color }} data-testid={`prod-req-status-${r.id}`}>
                  <Icon size={11} /> {m.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--pl-fg-muted)" }}>
                <div><div className="text-[10px] uppercase tracking-widest">Cost</div><div style={{ color: "var(--pl-fg)" }}>{r.proposed_cost_price ? `${r.proposed_cost_price} ${r.proposed_currency}` : "—"}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest">MOQ</div><div style={{ color: "var(--pl-fg)" }}>{r.proposed_moq || "—"}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest">Lead</div><div style={{ color: "var(--pl-fg)" }}>{r.proposed_lead_time_days != null ? `${r.proposed_lead_time_days} d` : "—"}</div></div>
              </div>
              {r.review_notes && (
                <div className="text-xs p-2 rounded-lg" style={{
                  background: r.status === "approved" ? "rgba(119,188,31,.10)" : "rgba(255,76,82,.10)",
                  color: r.status === "approved" ? "#77BC1F" : "#FF4C52",
                }} data-testid={`prod-req-review-${r.id}`}>
                  <strong>SA note:</strong> {r.review_notes}
                </div>
              )}
              {r.created_master_product_id && (
                <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>
                  Master product created: <span className="font-mono">{r.created_master_product_id.slice(0, 12)}…</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                New request form                             */
/* -------------------------------------------------------------------------- */

const NewRequestForm = ({ categories, onCancel, onSaved }) => {
  const [f, setF] = useState({
    proposed_name: "", proposed_category_id: "",
    proposed_ean_upc: "", proposed_manufacturer: "",
    proposed_pack_size: "", proposed_net_qty: "",
    proposed_short_description: "",
    proposed_cost_price: "", proposed_moq: "", proposed_lead_time_days: "",
    image_url: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.proposed_name.trim()) return toast.error("Product name is required");
    setBusy(true);
    try {
      const payload = {};
      Object.entries(f).forEach(([k, v]) => {
        if (v === "" || v == null) return;
        if (["proposed_cost_price"].includes(k)) payload[k] = Number(v);
        else if (["proposed_moq", "proposed_lead_time_days"].includes(k)) payload[k] = parseInt(v, 10);
        else payload[k] = v;
      });
      await portalApi.post("/supplier/me/product-requests", payload);
      toast.success("Product request submitted");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const uploadImg = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("kind", "image");
      const { data } = await portalApi.post("/supplier/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setF((cur) => ({ ...cur, image_url: data.file_url }));
      toast.success("Image uploaded");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setImgUploading(false); }
  };

  return (
    <form onSubmit={submit} className="pl-card p-6 space-y-4" data-testid="prod-req-form">
      <div className="flex items-center gap-3">
        <PlusSquare size={20} style={{ color: "var(--pl-accent)" }} />
        <div>
          <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Propose new product</div>
          <div className="pl-h3" style={{ color: "var(--pl-fg)" }}>Tell us about it</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <FormField label="Product name *"><input required value={f.proposed_name} onChange={(e) => setF({ ...f, proposed_name: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-name" /></FormField>
        <FormField label="Category">
          <select value={f.proposed_category_id} onChange={(e) => setF({ ...f, proposed_category_id: e.target.value })}
            className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-category">
            <option value="">Select category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Manufacturer / brand"><input value={f.proposed_manufacturer} onChange={(e) => setF({ ...f, proposed_manufacturer: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-mfr" /></FormField>
        <FormField label="EAN / UPC"><input value={f.proposed_ean_upc} onChange={(e) => setF({ ...f, proposed_ean_upc: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm font-mono" style={inputStyle} data-testid="prod-req-ean" /></FormField>
        <FormField label="Pack size"><input value={f.proposed_pack_size} onChange={(e) => setF({ ...f, proposed_pack_size: e.target.value })} placeholder="12x500ml" className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-pack" /></FormField>
        <FormField label="Net qty"><input value={f.proposed_net_qty} onChange={(e) => setF({ ...f, proposed_net_qty: e.target.value })} placeholder="500 ml" className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-net" /></FormField>
        <FormField label="Cost price"><input type="number" min={0} step="0.01" value={f.proposed_cost_price} onChange={(e) => setF({ ...f, proposed_cost_price: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-cost" /></FormField>
        <FormField label="MOQ"><input type="number" min={1} value={f.proposed_moq} onChange={(e) => setF({ ...f, proposed_moq: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-moq" /></FormField>
        <FormField label="Lead time (days)"><input type="number" min={0} value={f.proposed_lead_time_days} onChange={(e) => setF({ ...f, proposed_lead_time_days: e.target.value })} className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-lead" /></FormField>
        <FormField label="Product photo">
          <div className="flex items-center gap-3">
            <input type="file" accept="image/*" onChange={uploadImg}
              className="text-xs" style={{ color: "var(--pl-fg-muted)" }} data-testid="prod-req-image-file" />
            {imgUploading && <span className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>Uploading…</span>}
            {f.image_url && !imgUploading && <span className="text-xs" style={{ color: "#77BC1F" }}>✓ Uploaded</span>}
          </div>
        </FormField>
      </div>
      <FormField label="Short description">
        <textarea rows={2} value={f.proposed_short_description} onChange={(e) => setF({ ...f, proposed_short_description: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-desc" />
      </FormField>
      <FormField label="Notes to reviewer">
        <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-sm" style={inputStyle} data-testid="prod-req-notes" />
      </FormField>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="pl-btn pl-btn-ghost" data-testid="prod-req-cancel">Cancel</button>
        <button type="submit" disabled={busy} className="pl-btn pl-btn-primary" data-testid="prod-req-submit">
          {busy ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
};

const FormField = ({ label, children }) => (
  <div>
    <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>{label}</label>
    <div className="mt-2">{children}</div>
  </div>
);

export default PortalProductRequests;
