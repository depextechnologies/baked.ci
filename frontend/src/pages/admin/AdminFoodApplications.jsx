/**
 * Super-admin FOOD applications queue at /admin/modules/food/applications.
 *
 * Lists all FOODbakēd partner applications with status/country filter + search.
 * Clicking a row opens a full detail drawer showing:
 *   - Applicant info + restaurant details
 *   - Documents with per-doc Verify/Reject controls (rejection_reason required)
 *   - Bank / payout details (country-scoped presentation)
 *   - Admin actions: Start review · Request correction · Approve · Reject
 *
 * Approval triggers backend to create the FOOD restaurant + shell partner +
 * activation email; the modal shows the activation URL in non-prod for QA.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, Search, Loader2, X, CheckCircle2, XCircle, RefreshCw,
  FileText, ExternalLink, AlertTriangle, Shield, Utensils, Clock, Banknote,
  MapPin, Phone, Mail, ChevronRight,
} from "lucide-react";
import { adminApi } from "../../contexts/AdminContext";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const errMsg = (e) => e?.response?.data?.detail || e?.message || "Erreur · Error";

const STATUSES = [
  { code: "",                 fr: "Tous · All",             color: "#6b7280" },
  { code: "draft",            fr: "Brouillon · Draft",       color: "#71717a" },
  { code: "submitted",        fr: "Soumis · Submitted",      color: "#3b82f6" },
  { code: "under_review",     fr: "En cours · Reviewing",    color: "#f59e0b" },
  { code: "needs_correction", fr: "Corrections · Corrections", color: "#f97316" },
  { code: "approved",         fr: "Approuvé · Approved",     color: "#00A651" },
  { code: "rejected",         fr: "Rejeté · Rejected",       color: "#ef4444" },
];

const _statusColor = (code) => (STATUSES.find((s) => s.code === code) || {}).color || "#6b7280";
const _statusFr    = (code) => (STATUSES.find((s) => s.code === code) || {}).fr    || code;

const StatusBadge = ({ code, testId }) => (
  <span data-testid={testId} className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider"
        style={{ backgroundColor: `${_statusColor(code)}22`, color: _statusColor(code) }}>
    {_statusFr(code)}
  </span>
);

export const AdminFoodApplications = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (country) params.set("country", country);
      if (q) params.set("q", q);
      const { data } = await adminApi.get(`/admin/food/applications?${params}`);
      setRows(data);
    } catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [status, country, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4" data-testid="admin-food-applications">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck size={20} /> Demandes de restaurants · Restaurant applications</h1>
        <p className="text-xs text-muted-foreground">File d'attente FOODbakēd — approbation, rejet, demande de correction.</p>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher · Search"
                 className="h-9 w-full pl-8 pr-3 rounded-lg border border-border bg-card text-sm"
                 data-testid="admin-food-app-search" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="admin-food-app-status" className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          {STATUSES.map((s) => <option key={s.code} value={s.code}>{s.fr}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} data-testid="admin-food-app-country" className="h-9 rounded-lg border border-border bg-card px-3 text-sm">
          <option value="">Tous pays · All countries</option>
          <option value="CI">Côte d'Ivoire</option>
          <option value="IN">India</option>
          <option value="LR">Liberia</option>
        </select>
      </div>
      {err && <div className="text-xs text-red-500">{err}</div>}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Restaurant / Applicant</th>
                <th className="px-3 py-2">Pays</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Soumis</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={() => setOpenId(a.id)}
                    data-testid={`admin-food-app-row-${a.id}`}>
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium">{a.restaurant_details?.name || <span className="italic text-muted-foreground">(sans nom)</span>}</div>
                    <div className="text-[11px] text-muted-foreground">{a.applicant_name} · {a.applicant_email}</div>
                  </td>
                  <td className="px-3 py-2 text-sm">{a.country}</td>
                  <td className="px-3 py-2"><StatusBadge code={a.status} testId={`admin-food-app-status-${a.id}`} /></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-right"><ChevronRight size={14} className="text-muted-foreground" /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">Aucune demande · No applications match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <ApplicationDetail
          appId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); }}
        />
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// Detail panel — right-side drawer
// ---------------------------------------------------------------------------

const ApplicationDetail = ({ appId, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [activationUrl, setActivationUrl] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await adminApi.get(`/admin/food/applications/${appId}`); setData(data); }
    catch (e) { setErr(errMsg(e)); }
    finally { setLoading(false); }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  const act = async (action, extra = {}) => {
    setBusy(true); setErr("");
    try {
      const { data } = await adminApi.patch(`/admin/food/applications/${appId}`, { action, ...extra });
      setData(data);
      if (data._activation_url) setActivationUrl(data._activation_url);
      onChanged?.();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  const reviewDoc = async (docId, status, rejection_reason) => {
    setBusy(true); setErr("");
    try {
      await adminApi.patch(`/admin/food/applications/${appId}/documents/${docId}`, { status, rejection_reason });
      await load(); onChanged?.();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="text-white inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>
    </div>
  );
  if (!data) return null;

  const app = data.application;
  const rd  = app.restaurant_details || {};
  const t   = app.timing || {};
  const mc  = app.menu_cuisines || {};
  const b   = data.bank || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" data-testid="admin-food-app-drawer">
      <div className="w-full max-w-2xl h-full bg-card border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border z-10 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Demande · Application</div>
            <div className="font-bold truncate">{rd.name || "(sans nom)"} · {app.country}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge code={app.status} />
            <button onClick={onClose} data-testid="admin-food-app-drawer-close" className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center"><X size={16} /></button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}

          {activationUrl && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-700 space-y-2" data-testid="admin-food-app-activation-url">
              <div className="font-semibold">Activation email envoyé · Activation email sent.</div>
              <div className="break-all">Dev preview: <a href={activationUrl} target="_blank" rel="noreferrer" className="underline">{activationUrl}</a></div>
              {app.created_restaurant_id && (
                <div className="pt-1">
                  <a href={`/admin/modules/food/restaurants?rid=${encodeURIComponent(app.created_restaurant_id)}`}
                     className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-green-600 text-white font-semibold hover:bg-green-700"
                     data-testid="admin-food-app-view-restaurant">
                    <Store size={12} /> Voir le restaurant · View restaurant →
                  </a>
                </div>
              )}
            </div>
          )}

          <section>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Utensils size={14} /> Détails du restaurant</h3>
            <div className="rounded-xl border border-border p-3 text-sm space-y-1">
              <Row icon={Store} label="Nom" value={rd.name} />
              <Row icon={MapPin} label="Adresse" value={[rd.address, rd.city].filter(Boolean).join(", ")} />
              <Row icon={Phone}  label="Téléphone resto" value={rd.phone} />
              <Row icon={Mail}   label="Applicant" value={`${app.applicant_name || "?"} — ${app.applicant_email}`} />
              <Row icon={Phone}  label="Téléphone applicant" value={app.applicant_phone} />
              <Row icon={FileText} label="Description" value={rd.description} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><FileText size={14} /> Documents ({data.documents.length})</h3>
            <div className="space-y-2">
              {data.documents.length === 0 && <div className="text-xs text-muted-foreground italic">Aucun document téléversé.</div>}
              {data.documents.map((d) => <DocReviewRow key={d.id} doc={d} onReview={reviewDoc} busy={busy} />)}
              {data.doc_requirements.filter((r) => r.is_required && !data.documents.some((d) => d.doc_type === r.doc_type)).map((r) => (
                <div key={r.doc_type} className="rounded-lg border border-red-200 bg-red-50/40 p-2 text-[11px] text-red-500" data-testid={`admin-food-app-missing-${r.doc_type}`}>
                  Manquant · Missing: <b>{r.label_fr}</b>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Clock size={14} /> Horaires · Timing</h3>
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              Préparation · Prep: {t.prep_time_min ? `${t.prep_time_min}–${t.prep_time_max} min` : "—"}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Utensils size={14} /> Menu & Cuisines</h3>
            <div className="rounded-xl border border-border p-3 text-xs space-y-1">
              <Row label="Cuisines" value={(mc.cuisines || []).join(", ")} />
              <Row label="Prix moyen" value={mc.avg_price} />
              <Row label="Notes" value={mc.menu_notes} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><Banknote size={14} /> Informations bancaires</h3>
            <div className="rounded-xl border border-border p-3 text-xs space-y-1">
              <Row label="Méthode" value={b.method} />
              <Row label="Titulaire" value={b.account_holder} />
              <Row label="Banque" value={b.bank_name} />
              {(b.details && Object.keys(b.details).length > 0) && Object.entries(b.details).map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </div>
          </section>

          {app.correction_notes && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-700">
              <div className="font-semibold">Corrections demandées</div>{app.correction_notes}
            </div>
          )}
          {app.decision_notes && (
            <div className="rounded-lg bg-gray-100 p-3 text-xs">
              <div className="font-semibold">Notes admin</div>{app.decision_notes}
            </div>
          )}

          <AdminActions app={app} busy={busy} onAct={act} />
        </div>
      </div>
    </div>
  );
};

const Row = ({ icon: I, label, value }) => (
  <div className="flex items-start gap-2">
    {I && <I size={12} className="text-muted-foreground mt-0.5" />}
    <span className="text-muted-foreground text-[11px] uppercase tracking-wider w-32 shrink-0">{label}</span>
    <span className="text-sm">{value || <span className="italic text-muted-foreground/70">—</span>}</span>
  </div>
);

const DocReviewRow = ({ doc, onReview, busy }) => {
  const [expanded, setExpanded] = useState(doc.status === "rejected");
  const [reason, setReason] = useState(doc.rejection_reason || "");
  const color = doc.status === "verified" ? "#00A651" : doc.status === "rejected" ? "#ef4444" : "#a1a1aa";
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid={`admin-food-app-doc-${doc.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{doc.file_name || doc.doc_type}</div>
            <div className="text-[11px] text-muted-foreground">{doc.doc_type}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a href={`${API_BASE}${doc.file_url}?_=${Date.now()}`} target="_blank" rel="noreferrer" data-testid={`admin-food-app-doc-view-${doc.id}`}
             className="h-7 px-2 rounded bg-secondary hover:bg-secondary/70 text-[10px] font-semibold inline-flex items-center gap-1">
            <ExternalLink size={10} /> Voir
          </a>
          <span className="px-2 py-1 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${color}22`, color }}>
            {doc.status}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onReview(doc.id, "verified")} disabled={busy} data-testid={`admin-food-app-doc-verify-${doc.id}`}
                className="h-7 px-2 rounded text-[10px] font-semibold bg-green-500/10 text-green-500 hover:bg-green-500/20 disabled:opacity-50 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Vérifier</button>
        <button onClick={() => setExpanded((s) => !s)} data-testid={`admin-food-app-doc-reject-toggle-${doc.id}`}
                className="h-7 px-2 rounded text-[10px] font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 inline-flex items-center gap-1"><XCircle size={11} /> Rejeter</button>
        <button onClick={() => onReview(doc.id, "pending")} disabled={busy}
                className="h-7 px-2 rounded text-[10px] font-semibold bg-secondary hover:bg-secondary/70 inline-flex items-center gap-1"><RefreshCw size={11} /> Remettre en attente</button>
      </div>
      {expanded && (
        <div className="flex gap-2 items-center">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif du rejet · Rejection reason"
                 className="h-8 flex-1 rounded border border-border bg-secondary/40 px-2 text-xs" data-testid={`admin-food-app-doc-reason-${doc.id}`} />
          <button onClick={() => reason && onReview(doc.id, "rejected", reason)} disabled={!reason || busy} data-testid={`admin-food-app-doc-reject-${doc.id}`}
                  className="h-8 px-3 rounded bg-red-500 text-white text-xs font-semibold disabled:opacity-50">Confirmer</button>
        </div>
      )}
    </div>
  );
};

const AdminActions = ({ app, busy, onAct }) => {
  const [notes, setNotes] = useState("");
  const canStartReview = app.status === "submitted";
  const canReview      = app.status === "submitted" || app.status === "under_review";
  const canApprove     = canReview;
  return (
    <div className="rounded-2xl bg-secondary/30 p-4 space-y-3" data-testid="admin-food-app-actions">
      <div className="text-sm font-bold flex items-center gap-2"><Shield size={14} /> Actions</div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Notes / motif (requis pour Rejeter et Demander une correction)"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                data-testid="admin-food-app-notes" />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !canStartReview} onClick={() => onAct("start_review")} data-testid="admin-food-app-start-review"
                className="h-9 px-3 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1">
          <Loader2 size={12} /> Commencer l'examen
        </button>
        <button disabled={busy || !canReview || !notes} onClick={() => onAct("request_correction", { notes })} data-testid="admin-food-app-correction"
                className="h-9 px-3 rounded-lg bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1">
          <RefreshCw size={12} /> Demander une correction
        </button>
        <button disabled={busy || !canReview || !notes} onClick={() => onAct("reject", { reason: notes })} data-testid="admin-food-app-reject"
                className="h-9 px-3 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1">
          <XCircle size={12} /> Rejeter
        </button>
        <button disabled={busy || !canApprove} onClick={() => onAct("approve", { notes })} data-testid="admin-food-app-approve"
                className="h-9 px-3 rounded-lg text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1" style={{ backgroundColor: "#00A651" }}>
          <CheckCircle2 size={12} /> Approuver
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground">L'approbation crée automatiquement le restaurant + le compte partenaire + envoie l'e-mail d'activation. · Approval creates restaurant + partner + sends activation email.</div>
    </div>
  );
};

const Store = MapPin; // reuse icon

export default AdminFoodApplications;
