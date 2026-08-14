/**
 * Business Profile — supplier view + edit.
 *
 * Editing any critical field (business_name / tax_id / registration_number)
 * flips the supplier + application status to `action_required` on the
 * backend. Show a warning modal before saving those changes.
 */
import React, { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { AlertTriangle, Save, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { portalApi, errMsg } from "../SellerPortalApp";

const BUSINESS_TYPES = [
  "manufacturer", "distributor", "wholesaler", "supplier", "retailer",
  "brand_owner", "producer", "importer", "other",
];

const CRITICAL_FIELDS = new Set(["business_name", "tax_id", "registration_number"]);

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };

const Field = ({ label, children, critical, testId }) => (
  <div data-testid={testId}>
    <label className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "var(--pl-fg-muted)" }}>
      {label}
      {critical && <ShieldCheck size={11} style={{ color: "#F97316" }} title="Editing this flags your account for re-verification" />}
    </label>
    <div className="mt-2">{children}</div>
  </div>
);

const Input = React.forwardRef((props, ref) => (
  <input ref={ref} {...props}
    className={`w-full px-4 h-11 rounded-xl text-sm ${props.className || ""}`}
    style={{ ...inputStyle, ...(props.style || {}) }} />
));

export const PortalProfile = () => {
  const { supplier, refresh } = useOutletContext();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setF({
      business_name: supplier.business_name || "",
      trading_name: supplier.trading_name || "",
      business_type: supplier.business_type || "manufacturer",
      registration_number: supplier.registration_number || "",
      tax_id: supplier.tax_id || "",
      business_email: supplier.business_email || "",
      business_phone: supplier.business_phone || "",
      website: supplier.website || "",
      years_in_operation: supplier.years_in_operation || "",
      default_currency: supplier.default_currency || "XOF",
    });
  }, [supplier]);

  const changed = Object.entries(f).filter(([k, v]) => {
    const cur = supplier[k];
    if (cur == null && (v === "" || v == null)) return false;
    return String(cur ?? "") !== String(v ?? "");
  }).map(([k]) => k);

  const criticalChanged = changed.some((k) => CRITICAL_FIELDS.has(k));

  const submit = async () => {
    if (criticalChanged && !confirmOpen) { setConfirmOpen(true); return; }
    setBusy(true);
    try {
      const patch = {};
      changed.forEach((k) => {
        const v = f[k];
        patch[k] = v === "" ? null : (k === "years_in_operation" ? Number(v) : v);
      });
      const { data } = await portalApi.patch("/supplier/me/profile", patch);
      toast.success(data.critical_re_verification
        ? "Saved — Super Admin will re-verify critical changes."
        : "Profile saved");
      setConfirmOpen(false);
      await refresh();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="portal-profile">
      <div>
        <div className="pl-eyebrow mb-2">Business profile</div>
        <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Company details</h1>
        <p className="pl-body mt-2">Keep your business information up to date. Editing legal identity fields triggers a Super Admin re-verification.</p>
      </div>

      <div className="pl-card p-6 grid md:grid-cols-2 gap-6">
        <Field label="Legal business name" critical testId="profile-field-business-name">
          <Input value={f.business_name || ""} onChange={(e) => setF({ ...f, business_name: e.target.value })} data-testid="profile-input-business-name" />
        </Field>
        <Field label="Trading name">
          <Input value={f.trading_name || ""} onChange={(e) => setF({ ...f, trading_name: e.target.value })} data-testid="profile-input-trading-name" />
        </Field>
        <Field label="Business type">
          <select value={f.business_type} onChange={(e) => setF({ ...f, business_type: e.target.value })}
            className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="profile-input-business-type">
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Business email">
          <Input type="email" value={f.business_email || ""} onChange={(e) => setF({ ...f, business_email: e.target.value })} data-testid="profile-input-business-email" />
        </Field>
        <Field label="Business phone">
          <Input value={f.business_phone || ""} onChange={(e) => setF({ ...f, business_phone: e.target.value })} data-testid="profile-input-business-phone" />
        </Field>
        <Field label="Website">
          <Input value={f.website || ""} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://…" data-testid="profile-input-website" />
        </Field>
        <Field label="Registration number" critical testId="profile-field-reg-num">
          <Input value={f.registration_number || ""} onChange={(e) => setF({ ...f, registration_number: e.target.value })} data-testid="profile-input-reg-num" />
        </Field>
        <Field label="Tax ID / VAT" critical testId="profile-field-tax-id">
          <Input value={f.tax_id || ""} onChange={(e) => setF({ ...f, tax_id: e.target.value })} data-testid="profile-input-tax-id" />
        </Field>
        <Field label="Years in operation">
          <Input type="number" min={0} value={f.years_in_operation || ""} onChange={(e) => setF({ ...f, years_in_operation: e.target.value })} data-testid="profile-input-years" />
        </Field>
        <Field label="Default currency">
          <select value={f.default_currency} onChange={(e) => setF({ ...f, default_currency: e.target.value })}
            className="w-full px-4 h-11 rounded-xl text-sm" style={inputStyle} data-testid="profile-input-currency">
            <option value="XOF">XOF · CFA franc</option>
            <option value="USD">USD · US Dollar</option>
            <option value="EUR">EUR · Euro</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>
          {changed.length === 0 ? "No changes yet" : `${changed.length} field${changed.length > 1 ? "s" : ""} changed`}
          {criticalChanged && <span className="ml-2" style={{ color: "#F97316" }}>· critical change will trigger re-verification</span>}
        </div>
        <button onClick={submit} disabled={busy || changed.length === 0} className="pl-btn pl-btn-primary" data-testid="profile-save-btn">
          <Save size={14} /> {busy ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Critical-change confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && setConfirmOpen(false)}>
          <div className="pl-card p-8 max-w-lg mx-4" data-testid="profile-critical-modal">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(249,115,22,.15)", color: "#F97316" }}>
              <AlertTriangle size={26} />
            </div>
            <h2 className="pl-h3" style={{ color: "var(--pl-fg)" }}>Re-verification required</h2>
            <p className="pl-body mt-3">
              You&apos;re about to change legal identity fields ({[...CRITICAL_FIELDS].filter((k) => changed.includes(k)).join(", ")}).
              Your account will be flagged for Super Admin review and portal access remains available while we re-verify.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="pl-btn pl-btn-ghost" onClick={() => setConfirmOpen(false)} data-testid="profile-critical-cancel">Cancel</button>
              <button className="pl-btn pl-btn-primary" onClick={submit} disabled={busy} data-testid="profile-critical-confirm">
                {busy ? "Saving…" : "Save anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalProfile;
