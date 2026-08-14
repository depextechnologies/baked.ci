/**
 * Documents — drag-and-drop uploads via /api/supplier/uploads + /me/documents.
 *
 * The upload endpoint returns { storage_path, file_url, size_bytes, content_type,
 * original_filename }. We then attach metadata (type / title / expiry) and
 * POST /me/documents to register it.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText, Upload, Trash2, ExternalLink, AlertTriangle, CheckCircle2,
  Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };

const DOC_TYPES = [
  { v: "business_registration", label: "Business Registration" },
  { v: "tax_certificate",       label: "Tax Certificate" },
  { v: "business_licence",      label: "Business Licence" },
  { v: "owner_id",              label: "Owner ID" },
  { v: "product_certification", label: "Product Certification" },
  { v: "manufacturer_authorisation", label: "Manufacturer Authorisation" },
  { v: "catalogue",             label: "Catalogue" },
  { v: "other",                 label: "Other" },
];

const humanBytes = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.round(ms / (24 * 3600 * 1000));
};

const STATUS_META = {
  verified: { color: "#77BC1F", label: "Verified", icon: CheckCircle2 },
  pending:  { color: "#FCC44C", label: "Pending",  icon: Clock },
  rejected: { color: "#FF4C52", label: "Rejected", icon: AlertTriangle },
};

export const PortalDocuments = () => {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]); // uploads awaiting metadata form

  const load = useCallback(async () => {
    try {
      const { data } = await portalApi.get("/supplier/me/documents");
      setItems(data.items);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6" data-testid="portal-documents">
      <div>
        <div className="pl-eyebrow mb-2">Documents</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Certificates & catalogues</h1>
        <p className="pl-body mt-2">Upload registration certificates, tax certificates, product certifications and catalogues. We accept PDF, DOCX, XLSX, CSV, TXT and image formats up to 20 MB.</p>
      </div>

      <Dropzone
        onFilesQueued={(files) => setPending((cur) => [...cur, ...files])}
        setBusy={setBusy} busy={busy}
      />

      {pending.length > 0 && (
        <div className="space-y-3" data-testid="portal-documents-pending">
          {pending.map((p, i) => (
            <PendingUploadForm
              key={p._id}
              file={p}
              onCancel={() => setPending((cur) => cur.filter((x) => x._id !== p._id))}
              onSaved={() => { setPending((cur) => cur.filter((x) => x._id !== p._id)); load(); }}
            />
          ))}
        </div>
      )}

      <div className="pl-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pl-border)" }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Document</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Type</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Expiry</th>
              <th className="text-center px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Status</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10" style={{ color: "var(--pl-fg-muted)" }} data-testid="portal-documents-empty">
                No documents yet. Drop files above to upload your first document.
              </td></tr>
            )}
            {items.map((d) => {
              const meta = STATUS_META[d.verification_status] || STATUS_META.pending;
              const StatIcon = meta.icon;
              const dLeft = daysUntil(d.expires_on);
              const expiring = dLeft !== null && dLeft < 30;
              const expired = dLeft !== null && dLeft < 0;
              return (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--pl-border)" }} data-testid={`portal-doc-row-${d.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileText size={16} style={{ color: "var(--pl-accent)" }} />
                      <div>
                        <div className="font-medium" style={{ color: "var(--pl-fg)" }}>{d.title || d.original_filename || d.document_type}</div>
                        {d.original_filename && d.title && d.title !== d.original_filename && (
                          <div className="text-xs font-mono" style={{ color: "var(--pl-fg-muted)" }}>{d.original_filename}</div>
                        )}
                        <div className="text-xs" style={{ color: "var(--pl-fg-subtle)" }}>{humanBytes(d.size_bytes)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{DOC_TYPES.find((t) => t.v === d.document_type)?.label || d.document_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    {d.expires_on ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: "var(--pl-fg)" }}>{d.expires_on}</span>
                        {expired && <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid={`portal-doc-expired-${d.id}`}>Expired</span>}
                        {!expired && expiring && <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: "rgba(249,115,22,.15)", color: "#F97316" }} data-testid={`portal-doc-expiring-${d.id}`}>{dLeft}d left</span>}
                      </div>
                    ) : <span className="text-xs" style={{ color: "var(--pl-fg-subtle)" }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-1 rounded"
                      style={{ background: `${meta.color}22`, color: meta.color }} data-testid={`portal-doc-status-${d.id}`}>
                      <StatIcon size={11} /> {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={async () => {
                        try {
                          const t = localStorage.getItem("supplier_token");
                          const resp = await fetch(`${process.env.REACT_APP_BACKEND_URL}${d.file_url}`, { headers: { Authorization: `Bearer ${t}` } });
                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                          const blob = await resp.blob();
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        } catch (e) { toast.error("Could not open file"); }
                      }} className="pl-btn pl-btn-ghost px-2 h-8" title="Open" data-testid={`portal-doc-open-${d.id}`}>
                        <ExternalLink size={12} />
                      </button>
                      <button onClick={async () => {
                        if (!window.confirm(`Delete "${d.title || d.original_filename}"?`)) return;
                        try { await portalApi.delete(`/supplier/me/documents/${d.id}`); toast.success("Deleted"); load(); }
                        catch (e) { toast.error(errMsg(e)); }
                      }} className="pl-btn pl-btn-ghost px-2 h-8" style={{ color: "#FF4C52" }} title="Delete" data-testid={`portal-doc-del-${d.id}`}>
                        <Trash2 size={12} />
                      </button>
                    </div>
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

/* -------------------------------------------------------------------------- */
/*                                Dropzone                                     */
/* -------------------------------------------------------------------------- */

const Dropzone = ({ onFilesQueued, busy, setBusy }) => {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(true);
    const uploaded = [];
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("kind", f.type.startsWith("image/") ? "image" : "document");
        const { data } = await portalApi.post("/supplier/uploads", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploaded.push({ ...data, _id: `${Date.now()}-${Math.random()}`, native_name: f.name });
      } catch (e) {
        toast.error(`${f.name}: ${errMsg(e)}`);
      }
    }
    setBusy(false);
    if (uploaded.length > 0) {
      toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded — add details below.`);
      onFilesQueued(uploaded);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className="rounded-2xl p-8 text-center cursor-pointer transition-all"
      style={{
        background: drag ? "var(--pl-accent-soft)" : "var(--pl-bg-elevated)",
        border: `2px dashed ${drag ? "var(--pl-accent)" : "var(--pl-border-strong)"}`,
      }}
      data-testid="portal-documents-dropzone">
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)}
        data-testid="portal-documents-file-input" />
      {busy ? (
        <div className="flex items-center justify-center gap-3" style={{ color: "var(--pl-accent)" }}>
          <Loader2 size={20} className="animate-spin" /> Uploading…
        </div>
      ) : (
        <div>
          <Upload size={28} className="mx-auto mb-3" style={{ color: "var(--pl-accent)" }} />
          <div className="font-medium" style={{ color: "var(--pl-fg)" }}>Drag files here, or click to browse</div>
          <div className="text-xs mt-1" style={{ color: "var(--pl-fg-muted)" }}>PDF · DOCX · XLSX · CSV · TXT · Images · up to 20 MB</div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                          Pending upload metadata form                       */
/* -------------------------------------------------------------------------- */

const PendingUploadForm = ({ file, onCancel, onSaved }) => {
  const [form, setForm] = useState({
    document_type: "business_registration",
    title: file.native_name || file.original_filename || "",
    issued_on: "", expires_on: "",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await portalApi.post("/supplier/me/documents", {
        document_type: form.document_type,
        title: form.title || file.original_filename,
        file_url: file.file_url,
        storage_path: file.storage_path,
        original_filename: file.original_filename,
        size_bytes: file.size_bytes,
        content_type: file.content_type,
        issued_on: form.issued_on || null,
        expires_on: form.expires_on || null,
      });
      toast.success("Document saved");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="pl-card p-5 space-y-4" data-testid={`portal-pending-${file._id}`}>
      <div className="flex items-center gap-3">
        <FileText size={16} style={{ color: "var(--pl-accent)" }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: "var(--pl-fg)" }}>{file.original_filename || file.native_name}</div>
          <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{humanBytes(file.size_bytes)}</div>
        </div>
      </div>
      <div className="grid md:grid-cols-4 gap-3">
        <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Type</label>
          <select value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid={`pending-type-${file._id}`}>
            {DOC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select></div>
        <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid={`pending-title-${file._id}`} /></div>
        <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Issued on</label>
          <input type="date" value={form.issued_on} onChange={(e) => setForm({ ...form, issued_on: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid={`pending-issued-${file._id}`} /></div>
        <div><label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Expires on</label>
          <input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
            className="w-full mt-2 px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid={`pending-expires-${file._id}`} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="pl-btn pl-btn-ghost" data-testid={`pending-cancel-${file._id}`}>Discard</button>
        <button onClick={save} disabled={busy} className="pl-btn pl-btn-primary" data-testid={`pending-save-${file._id}`}>
          {busy ? "Saving…" : "Save document"}
        </button>
      </div>
    </div>
  );
};

export default PortalDocuments;
