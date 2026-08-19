/**
 * MARTbakēd Supplier Onboarding Wizard — 9-step public application.
 *
 * Backend contract (see /app/backend/shared/suppliers/routes.py):
 *   POST  /martbaked/sellers/apply/start       — creates draft + returns application id
 *   POST  /martbaked/sellers/apply/otp/request — sends OTP, dev echoes dev_code
 *   POST  /martbaked/sellers/apply/otp/verify  — flips phone_verified=true
 *   PATCH /martbaked/sellers/apply/{id}/step   — saves any of steps 2..8
 *   POST  /martbaked/sellers/apply/{id}/submit — flips status → submitted
 *   GET   /martbaked/sellers/apply/{id}        — full snapshot for review step
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Phone, Building2, User2, MapPin,
  Tags, Truck, Landmark, FileText, ClipboardCheck, Plus, Trash2, Info,
} from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "./SellerApp";
import { WarehouseLocationPicker } from "@/apps/partner-hub/WarehouseLocationPicker";

const STEPS = [
  { n: 1, label: "Phone",       icon: Phone },
  { n: 2, label: "Business",    icon: Building2 },
  { n: 3, label: "Owner",       icon: User2 },
  { n: 4, label: "Location",    icon: MapPin },
  { n: 5, label: "Categories",  icon: Tags },
  { n: 6, label: "Coverage",    icon: Truck },
  { n: 7, label: "Banking",     icon: Landmark },
  { n: 8, label: "Documents",   icon: FileText },
  { n: 9, label: "Review",      icon: ClipboardCheck },
];

const BUSINESS_TYPES = [
  { v: "manufacturer", label: "Manufacturer" },
  { v: "distributor",  label: "Distributor" },
  { v: "wholesaler",   label: "Wholesaler" },
  { v: "supplier",     label: "Supplier" },
  { v: "retailer",     label: "Retailer" },
  { v: "brand_owner",  label: "Brand Owner" },
  { v: "producer",     label: "Producer" },
  { v: "importer",     label: "Importer" },
  { v: "other",        label: "Other" },
];

const CONTACT_RELS = [
  { v: "owner",                     label: "Owner" },
  { v: "director",                  label: "Director" },
  { v: "authorised_representative", label: "Authorised Representative" },
  { v: "procurement_contact",       label: "Procurement Contact" },
  { v: "other",                     label: "Other" },
];

const DOC_TYPES = [
  { v: "business_registration",     label: "Business Registration" },
  { v: "tax_certificate",           label: "Tax Certificate" },
  { v: "business_licence",          label: "Business Licence" },
  { v: "owner_id",                  label: "Owner ID" },
  { v: "product_certification",     label: "Product Certification" },
  { v: "manufacturer_authorisation",label: "Manufacturer Authorisation" },
  { v: "catalogue",                 label: "Catalogue" },
  { v: "other",                     label: "Other" },
];

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" · ");
  return d?.message || e?.message || "Something went wrong.";
};

/* -------------------------------------------------------------------------- */
/*                              Wizard root                                    */
/* -------------------------------------------------------------------------- */

export const SellerApplyWizard = () => {
  const [params] = useSearchParams();
  // Resume via ?app=<id> or start-fresh flow
  const [appId, setAppId] = useState(params.get("app") || null);
  const [current, setCurrent] = useState(1);
  const [supplier, setSupplier] = useState(null);
  const [appCode, setAppCode] = useState(null);
  const [full, setFull] = useState({ contacts: [], documents: [], supply_locations: [], categories: [], bank_info: null });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Load existing application state (for step navigation / resume)
  const refresh = async (id) => {
    const target = id || appId;
    if (!target) return;
    try {
      const { data } = await sellerApi.get(`/martbaked/sellers/apply/${target}`);
      setSupplier(data.supplier);
      setAppCode(data.application.application_code);
      setFull({
        contacts: data.contacts || [],
        documents: data.documents || [],
        supply_locations: data.supply_locations || [],
        categories: data.categories || [],
        bank_info: data.bank_info,
      });
      setCurrent(Math.min(9, data.application.current_step || 1));
    } catch (e) { toast.error(errMsg(e)); }
  };

  useEffect(() => { if (appId) refresh(appId); }, []);

  if (submitted) {
    return (
      <section className="pl-section">
        <div className="pl-container max-w-2xl text-center">
          <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6"
            style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
            <CheckCircle2 size={40} />
          </div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Application submitted!</h1>
          <p className="pl-body mt-4">
            Your application code is <span className="font-mono font-bold" style={{ color: "var(--pl-accent)" }}>{appCode}</span>.
            Please keep this code — you&apos;ll need it to track your status.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <Link to={`/martbaked/sellers/application-status?code=${appCode}`} className="pl-btn pl-btn-primary" data-testid="wizard-goto-status">
              Track application <ArrowRight size={16} />
            </Link>
            <Link to="/martbaked/sellers" className="pl-btn pl-btn-secondary" data-testid="wizard-back-home">Back to home</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pl-section">
      <div className="pl-container max-w-4xl">
        <div className="mb-8">
          <div className="pl-eyebrow mb-2">MARTbakēd supplier onboarding</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Apply as a supplier</h1>
          {appCode && (
            <div className="mt-3 text-xs" style={{ color: "var(--pl-fg-muted)" }}>
              Application <span className="font-mono">{appCode}</span>
              {supplier && <> · {supplier.business_name}</>}
            </div>
          )}
        </div>

        {/* Progress rail */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max pb-2" data-testid="wizard-progress-rail">
            {STEPS.map((s) => {
              const done = current > s.n;
              const active = current === s.n;
              const Icon = s.icon;
              return (
                <button key={s.n} type="button"
                  onClick={() => { if (appId && s.n < current) setCurrent(s.n); }}
                  disabled={!appId || s.n > current}
                  data-testid={`wizard-step-${s.n}`}
                  className="flex items-center gap-2 px-3 h-9 rounded-lg text-xs font-medium whitespace-nowrap"
                  style={{
                    background: active ? "var(--pl-accent)" : done ? "var(--pl-accent-soft)" : "transparent",
                    color: active ? "#0a1200" : done ? "var(--pl-accent)" : "var(--pl-fg-muted)",
                    border: `1px solid ${active ? "var(--pl-accent)" : "var(--pl-border-strong)"}`,
                    cursor: (!appId || s.n > current) ? "not-allowed" : "pointer",
                    opacity: (!appId || s.n > current) ? 0.6 : 1,
                  }}>
                  {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  {s.n}. {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pl-card p-8">
          {current === 1 && <StepPhone appId={appId} setAppId={setAppId} setSupplier={setSupplier} setAppCode={setAppCode} onNext={() => { setCurrent(2); refresh(); }} supplier={supplier} />}
          {current === 2 && <StepBusiness appId={appId} supplier={supplier} onNext={() => setCurrent(3)} onPrev={() => setCurrent(1)} refresh={refresh} />}
          {current === 3 && <StepOwner appId={appId} contact={full.contacts.find((c) => c.is_primary)} onNext={() => setCurrent(4)} onPrev={() => setCurrent(2)} refresh={refresh} />}
          {current === 4 && <StepLocation appId={appId} loc={full.supply_locations.find((l) => l.is_business_location)} supplier={supplier} onNext={() => setCurrent(5)} onPrev={() => setCurrent(3)} refresh={refresh} />}
          {current === 5 && <StepCategories appId={appId} existing={full.categories} onNext={() => setCurrent(6)} onPrev={() => setCurrent(4)} refresh={refresh} supplier={supplier} />}
          {current === 6 && <StepCoverage appId={appId} existing={full.supply_locations.filter((l) => !l.is_business_location)} supplier={supplier} onNext={() => setCurrent(7)} onPrev={() => setCurrent(5)} refresh={refresh} />}
          {current === 7 && <StepBanking appId={appId} bank={full.bank_info} onNext={() => setCurrent(8)} onPrev={() => setCurrent(6)} refresh={refresh} />}
          {current === 8 && <StepDocuments appId={appId} existing={full.documents} onNext={() => setCurrent(9)} onPrev={() => setCurrent(7)} refresh={refresh} />}
          {current === 9 && <StepReview appId={appId} supplier={supplier} full={full} onPrev={() => setCurrent(8)} onSubmit={async () => {
            try {
              setBusy(true);
              await sellerApi.post(`/martbaked/sellers/apply/${appId}/submit`);
              setSubmitted(true);
            } catch (e) { toast.error(errMsg(e)); }
            finally { setBusy(false); }
          }} busy={busy} />}
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Common bits                                   */
/* -------------------------------------------------------------------------- */

const Field = ({ label, children, hint, testId }) => (
  <div data-testid={testId}>
    <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>{label}</label>
    <div className="mt-2">{children}</div>
    {hint && <div className="text-xs mt-1" style={{ color: "var(--pl-fg-subtle)" }}>{hint}</div>}
  </div>
);

const inputStyle = { background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" };
const Input = React.forwardRef((props, ref) => (
  <input ref={ref} {...props} className={`w-full px-4 h-11 rounded-xl text-sm ${props.className || ""}`} style={{ ...inputStyle, ...(props.style || {}) }} />
));
const Textarea = (props) => (
  <textarea {...props} className={`w-full px-4 py-3 rounded-xl text-sm ${props.className || ""}`} style={{ ...inputStyle, ...(props.style || {}) }} />
);
const Select = ({ children, ...p }) => (
  <select {...p} className={`w-full px-4 h-11 rounded-xl text-sm ${p.className || ""}`} style={{ ...inputStyle, ...(p.style || {}) }}>{children}</select>
);

const NavRow = ({ onPrev, onNext, nextLabel = "Continue", busy, nextTestId, disabled }) => (
  <div className="flex items-center justify-between pt-6 mt-6" style={{ borderTop: "1px solid var(--pl-border)" }}>
    {onPrev ? (
      <button type="button" onClick={onPrev} className="pl-btn pl-btn-ghost" data-testid="wizard-btn-prev"><ArrowLeft size={14} /> Back</button>
    ) : <div />}
    <button type="submit" onClick={onNext} disabled={busy || disabled} className="pl-btn pl-btn-primary" data-testid={nextTestId || "wizard-btn-next"}>
      {busy ? "Saving…" : nextLabel} <ArrowRight size={14} />
    </button>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                              Step 1 — Phone                                 */
/* -------------------------------------------------------------------------- */

const StepPhone = ({ appId, setAppId, setSupplier, setAppCode, onNext, supplier }) => {
  // Sub-phases: A) new applicant form B) OTP entry
  const [phase, setPhase] = useState(appId && supplier?.phone_verified ? "done" : (appId ? "otp" : "form"));
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ business_email: "", business_name: "", business_type: "manufacturer", country: "CI" });
  const [cc, setCc] = useState("+225");
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState(null);
  const [devCode, setDevCode] = useState(null);
  const [code, setCode] = useState("");

  useEffect(() => { if (supplier?.phone_verified) setPhase("done"); }, [supplier?.phone_verified]);

  const startApp = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await sellerApi.post("/martbaked/sellers/apply/start", form);
      setAppId(data.application.id);
      setAppCode(data.application.application_code);
      setSupplier(data.supplier);
      window.history.replaceState(null, "", `/martbaked/sellers/apply?app=${data.application.id}`);
      setPhase("otp");
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d?.code === "already_active") toast.error("Already registered — please log in instead.");
      else if (d?.code === "already_submitted") toast.info(`Application ${d.application_code} already exists.`);
      else toast.error(errMsg(e));
    } finally { setBusy(false); }
  };

  const requestOtp = async () => {
    setBusy(true);
    try {
      const { data } = await sellerApi.post("/martbaked/sellers/apply/otp/request", {
        application_id: appId, country_code: cc, phone,
      });
      setChallengeId(data.challenge_id);
      if (data.dev_code) setDevCode(data.dev_code);
      toast.success(`OTP sent to ${data.masked_phone}`);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    setBusy(true);
    try {
      await sellerApi.post("/martbaked/sellers/apply/otp/verify", {
        application_id: appId, challenge_id: challengeId, code,
      });
      toast.success("Phone verified");
      setPhase("done");
      onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  if (phase === "form") {
    return (
      <form onSubmit={startApp} className="space-y-5" data-testid="wizard-step1-form">
        <StepHeader icon={Phone} title="Let's get started" subtitle="Tell us who you are — we'll create your draft application." />
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Legal business name" testId="wizard-field-business-name">
            <Input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Acme Foods Ltd" data-testid="wizard-input-business-name" />
          </Field>
          <Field label="Business email" testId="wizard-field-business-email">
            <Input required type="email" value={form.business_email} onChange={(e) => setForm({ ...form, business_email: e.target.value })} placeholder="ops@acme.example" data-testid="wizard-input-business-email" />
          </Field>
          <Field label="Business type" testId="wizard-field-business-type">
            <Select value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} data-testid="wizard-input-business-type">
              {BUSINESS_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Country" testId="wizard-field-country">
            <Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="wizard-input-country">
              <option value="CI">Côte d&apos;Ivoire (CI)</option>
              <option value="IN">India (IN)</option>
            </Select>
          </Field>
        </div>
        <NavRow onNext={startApp} busy={busy} nextLabel="Create draft" nextTestId="wizard-step1-create" />
      </form>
    );
  }

  return (
    <div className="space-y-5" data-testid="wizard-step1-otp">
      <StepHeader icon={Phone} title="Verify your phone" subtitle="We'll send a one-time code to confirm your business phone number." />
      {!challengeId ? (
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <Field label="Country code" testId="wizard-field-cc">
            <Select value={cc} onChange={(e) => setCc(e.target.value)} data-testid="wizard-input-cc">
              <option value="+225">+225 (CI)</option>
              <option value="+231">+231 (LR)</option>
            </Select>
          </Field>
          <Field label="Business phone" testId="wizard-field-phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0700900001" data-testid="wizard-input-phone" />
          </Field>
          <button type="button" onClick={requestOtp} disabled={busy || !phone} className="pl-btn pl-btn-primary" data-testid="wizard-otp-send">
            {busy ? "Sending…" : "Send code"} <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {devCode && (
            <div className="text-xs p-3 rounded-lg flex items-center gap-2" style={{ background: "rgba(252,196,76,.15)", color: "#FCC44C" }} data-testid="wizard-otp-devcode">
              <Info size={14} /> <strong>DEV mode:</strong> use code <span className="font-mono text-base">{devCode}</span>
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <Field label="6-digit code" testId="wizard-field-otp">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="123456" className="font-mono tracking-widest text-center" data-testid="wizard-input-otp" />
            </Field>
            <div className="md:col-span-2 flex gap-2">
              <button type="button" onClick={() => { setChallengeId(null); setDevCode(null); setCode(""); }} className="pl-btn pl-btn-ghost" data-testid="wizard-otp-resend">Resend</button>
              <button type="button" onClick={verifyOtp} disabled={busy || code.length !== 6} className="pl-btn pl-btn-primary" data-testid="wizard-otp-verify">
                {busy ? "Verifying…" : "Verify"} <CheckCircle2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StepHeader = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-start gap-4 pb-4" style={{ borderBottom: "1px solid var(--pl-border)" }}>
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
      <Icon size={20} />
    </div>
    <div>
      <div className="pl-h3" style={{ color: "var(--pl-fg)" }}>{title}</div>
      <div className="text-sm mt-1" style={{ color: "var(--pl-fg-muted)" }}>{subtitle}</div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                              Step 2 — Business                              */
/* -------------------------------------------------------------------------- */

const StepBusiness = ({ appId, supplier, onNext, onPrev, refresh }) => {
  const [f, setF] = useState({
    trading_name: supplier?.trading_name || "",
    business_type: supplier?.business_type || "manufacturer",
    business_type_other: supplier?.business_type_other || "",
    registration_number: supplier?.registration_number || "",
    tax_id: supplier?.tax_id || "",
    website: supplier?.website || "",
    years_in_operation: supplier?.years_in_operation || "",
    default_currency: supplier?.default_currency || "XOF",
  });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault(); setBusy(true);
    try {
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, {
        step: 2, ...f,
        years_in_operation: f.years_in_operation ? Number(f.years_in_operation) : null,
      });
      await refresh();
      onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-5" data-testid="wizard-step2-form">
      <StepHeader icon={Building2} title="Business information" subtitle="Tell us about your company." />
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Trading name"><Input value={f.trading_name} onChange={(e) => setF({ ...f, trading_name: e.target.value })} placeholder="Acme" data-testid="wizard-input-trading-name" /></Field>
        <Field label="Business type">
          <Select value={f.business_type} onChange={(e) => setF({ ...f, business_type: e.target.value })} data-testid="wizard-input-business-type-2">
            {BUSINESS_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </Select>
        </Field>
        {f.business_type === "other" && (
          <Field label="Specify"><Input value={f.business_type_other} onChange={(e) => setF({ ...f, business_type_other: e.target.value })} data-testid="wizard-input-business-type-other" /></Field>
        )}
        <Field label="Registration number"><Input value={f.registration_number} onChange={(e) => setF({ ...f, registration_number: e.target.value })} placeholder="RCCM-CI-XXXX" data-testid="wizard-input-reg-num" /></Field>
        <Field label="Tax ID / VAT"><Input value={f.tax_id} onChange={(e) => setF({ ...f, tax_id: e.target.value })} data-testid="wizard-input-tax-id" /></Field>
        <Field label="Website"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://acme.example" data-testid="wizard-input-website" /></Field>
        <Field label="Years in operation"><Input type="number" min={0} value={f.years_in_operation} onChange={(e) => setF({ ...f, years_in_operation: e.target.value })} data-testid="wizard-input-years" /></Field>
        <Field label="Default currency">
          <Select value={f.default_currency} onChange={(e) => setF({ ...f, default_currency: e.target.value })} data-testid="wizard-input-currency">
            <option value="XOF">XOF · CFA franc</option>
            <option value="USD">USD · US Dollar</option>
            <option value="EUR">EUR · Euro</option>
          </Select>
        </Field>
      </div>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step2-next" />
    </form>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Step 3 — Owner                                */
/* -------------------------------------------------------------------------- */

const StepOwner = ({ appId, contact, onNext, onPrev, refresh }) => {
  const [c, setC] = useState({
    full_name: contact?.full_name || "",
    position: contact?.position || "",
    phone: contact?.phone || "",
    email: contact?.email || "",
    nationality: contact?.nationality || "CI",
    id_type: contact?.id_type || "",
    id_number: contact?.id_number || "",
    id_document_url: contact?.id_document_url || "",
    relationship: contact?.relationship || "owner",
  });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault(); setBusy(true);
    try {
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, { step: 3, contact: c });
      await refresh();
      onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-5" data-testid="wizard-step3-form">
      <StepHeader icon={User2} title="Owner / authorised representative" subtitle="Who is authorised to act on behalf of your business?" />
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Full name"><Input required value={c.full_name} onChange={(e) => setC({ ...c, full_name: e.target.value })} data-testid="wizard-input-owner-name" /></Field>
        <Field label="Position"><Input value={c.position} onChange={(e) => setC({ ...c, position: e.target.value })} placeholder="CEO / Director / …" data-testid="wizard-input-owner-position" /></Field>
        <Field label="Phone"><Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} data-testid="wizard-input-owner-phone" /></Field>
        <Field label="Email"><Input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} data-testid="wizard-input-owner-email" /></Field>
        <Field label="Relationship">
          <Select value={c.relationship} onChange={(e) => setC({ ...c, relationship: e.target.value })} data-testid="wizard-input-owner-relationship">
            {CONTACT_RELS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Nationality">
          <Select value={c.nationality} onChange={(e) => setC({ ...c, nationality: e.target.value })} data-testid="wizard-input-owner-nationality">
                        <option value="CI">CI</option><option value="IN">IN</option>
          </Select>
        </Field>
        <Field label="ID type"><Input value={c.id_type} onChange={(e) => setC({ ...c, id_type: e.target.value })} placeholder="National ID / Passport" data-testid="wizard-input-owner-id-type" /></Field>
        <Field label="ID number"><Input value={c.id_number} onChange={(e) => setC({ ...c, id_number: e.target.value })} data-testid="wizard-input-owner-id-number" /></Field>
        <Field label="ID document URL" hint="Upload separately and paste a link — full upload coming in Phase 2B."><Input value={c.id_document_url} onChange={(e) => setC({ ...c, id_document_url: e.target.value })} placeholder="https://…" data-testid="wizard-input-owner-id-url" /></Field>
      </div>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step3-next" />
    </form>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Step 4 — Location                              */
/* -------------------------------------------------------------------------- */

const StepLocation = ({ appId, loc, supplier, onNext, onPrev, refresh }) => {
  const [pin, setPin] = useState(loc ? {
    latitude: loc.latitude, longitude: loc.longitude, formatted_address: loc.address,
    city: loc.city, country_code: loc.country || supplier?.country, postal_code: loc.postal_code,
  } : null);
  const [radius, setRadius] = useState(loc?.service_radius_km || 25);
  const [label, setLabel] = useState(loc?.label || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!pin || !pin.latitude || !pin.longitude) return toast.error("Pick a location on the map first.");
    setBusy(true);
    try {
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, {
        step: 4,
        business_location: {
          label: label || supplier?.business_name,
          address: pin.formatted_address, city: pin.city,
          country: (pin.country_code || supplier?.country || "CI").toUpperCase(),
          latitude: pin.latitude, longitude: pin.longitude,
          postal_code: pin.postal_code, service_radius_km: Number(radius),
        },
      });
      await refresh(); onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="wizard-step4-form">
      <StepHeader icon={MapPin} title="Business location" subtitle="Search or drop a pin on the map. We'll use this to match you with nearby dark stores." />
      <Field label="Label" hint="A friendly name for this location.">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={supplier?.business_name || "Warehouse HQ"} data-testid="wizard-input-loc-label" />
      </Field>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--pl-border-strong)" }}>
        <WarehouseLocationPicker value={pin} onChange={setPin} country={(supplier?.country || "CI")} />
      </div>
      <Field label="Service / supply radius (km)" hint="How far are you willing to deliver from this location?">
        <Input type="number" min={1} max={500} value={radius} onChange={(e) => setRadius(e.target.value)} data-testid="wizard-input-loc-radius" />
      </Field>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} disabled={!pin?.latitude} nextTestId="wizard-step4-next" />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Step 5 — Categories                              */
/* -------------------------------------------------------------------------- */

const StepCategories = ({ appId, existing, supplier, onNext, onPrev, refresh }) => {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState(new Set((existing || []).filter((c) => c.category_id).map((c) => c.category_id)));
  const [customs, setCustoms] = useState((existing || []).filter((c) => !c.category_id).map((c) => ({ requested_name: c.requested_name, reason: c.reason || "" })));
  const [newCustom, setNewCustom] = useState({ requested_name: "", reason: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await sellerApi.get(`/mart/categories?country=${supplier?.country || "CI"}`);
        const cats = Array.isArray(data) ? data : (data.items || []);
        setAvailable(cats);
      } catch (e) { /* silent — page still usable via custom */ }
    })();
  }, [supplier?.country]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const categories = [
        ...Array.from(selected).map((id) => ({ category_id: id })),
        ...customs.map((c) => ({ requested_name: c.requested_name, reason: c.reason || null })),
      ];
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, { step: 5, categories });
      await refresh(); onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="wizard-step5-form">
      <StepHeader icon={Tags} title="Products & categories" subtitle="Pick from our approved categories or request new ones. Super Admin will review new category requests." />

      <Field label="Approved categories" hint={`${available.length} categories available in ${supplier?.country || "CI"}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-y-auto" data-testid="wizard-cat-list">
          {available.length === 0 && <div className="col-span-3 text-sm p-4" style={{ color: "var(--pl-fg-muted)" }}>No categories yet — use the custom request below.</div>}
          {available.map((c) => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)}
              className="text-left px-3 py-2 rounded-xl text-sm"
              style={{
                background: selected.has(c.id) ? "var(--pl-accent-soft)" : "var(--pl-bg-elevated)",
                color: selected.has(c.id) ? "var(--pl-accent)" : "var(--pl-fg)",
                border: `1px solid ${selected.has(c.id) ? "var(--pl-accent)" : "var(--pl-border-strong)"}`,
              }} data-testid={`wizard-cat-${c.id}`}>
              {selected.has(c.id) && <CheckCircle2 size={12} className="inline mr-1" />}
              {c.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Request new category" hint="If your products don't fit any existing category, request a new one. Super Admin will approve/reject.">
        <div className="flex flex-wrap gap-2">
          <Input value={newCustom.requested_name} onChange={(e) => setNewCustom({ ...newCustom, requested_name: e.target.value })} placeholder="New category name" className="flex-1 min-w-[200px]" data-testid="wizard-input-new-cat-name" />
          <Input value={newCustom.reason} onChange={(e) => setNewCustom({ ...newCustom, reason: e.target.value })} placeholder="Why is this needed?" className="flex-1 min-w-[200px]" data-testid="wizard-input-new-cat-reason" />
          <button type="button" onClick={() => {
            if (!newCustom.requested_name.trim()) return;
            setCustoms([...customs, newCustom]);
            setNewCustom({ requested_name: "", reason: "" });
          }} className="pl-btn pl-btn-secondary" data-testid="wizard-add-custom-cat"><Plus size={14} /> Add</button>
        </div>
      </Field>

      {customs.length > 0 && (
        <div className="space-y-2" data-testid="wizard-custom-cats-list">
          {customs.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
              <Tags size={14} style={{ color: "var(--pl-accent)" }} />
              <div className="flex-1 text-sm">
                <div className="font-medium" style={{ color: "var(--pl-fg)" }}>{c.requested_name}</div>
                {c.reason && <div className="text-xs" style={{ color: "var(--pl-fg-muted)" }}>{c.reason}</div>}
              </div>
              <button type="button" onClick={() => setCustoms(customs.filter((_, idx) => idx !== i))} className="text-xs" style={{ color: "#FF4C52" }} data-testid={`wizard-remove-custom-cat-${i}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step5-next" />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Step 6 — Coverage                                */
/* -------------------------------------------------------------------------- */

const StepCoverage = ({ appId, existing, supplier, onNext, onPrev, refresh }) => {
  const [rows, setRows] = useState((existing || []).map((l) => ({
    kind: l.kind || "supply_city", label: l.label || "", city: l.city || "",
    country: l.country || supplier?.country || "CI", zone: l.zone || "",
  })));
  const [busy, setBusy] = useState(false);
  const add = () => setRows([...rows, { kind: "supply_city", label: "", city: "", country: supplier?.country || "CI", zone: "" }]);
  const upd = (i, patch) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const del = (i) => setRows(rows.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    try {
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, {
        step: 6, supply_locations: rows.filter((r) => r.city || r.zone || r.country).map((r) => ({
          kind: r.kind, label: r.label || `${r.city || r.zone || r.country}`,
          city: r.city, country: r.country, zone: r.zone,
        })),
      });
      await refresh(); onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="wizard-step6-form">
      <StepHeader icon={Truck} title="Where can you supply?" subtitle="Cities, zones or countries you can reliably deliver to. Super Admin will authorise the actual dark-store links later." />
      <div className="space-y-2" data-testid="wizard-coverage-rows">
        {rows.length === 0 && <div className="text-sm p-4 rounded-xl" style={{ color: "var(--pl-fg-muted)", background: "var(--pl-bg-elevated)" }}>No coverage areas yet — click <em>Add area</em>.</div>}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 rounded-xl items-end" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
            <Field label="Kind">
              <Select value={r.kind} onChange={(e) => upd(i, { kind: e.target.value })} data-testid={`wizard-coverage-kind-${i}`}>
                <option value="supply_city">City</option>
                <option value="supply_zone">Zone / neighbourhood</option>
                <option value="supply_country">Country-wide</option>
              </Select>
            </Field>
            <Field label="City"><Input value={r.city} onChange={(e) => upd(i, { city: e.target.value })} placeholder="Abidjan" data-testid={`wizard-coverage-city-${i}`} /></Field>
            <Field label="Zone"><Input value={r.zone} onChange={(e) => upd(i, { zone: e.target.value })} placeholder="Cocody" data-testid={`wizard-coverage-zone-${i}`} /></Field>
            <Field label="Country">
              <Select value={r.country} onChange={(e) => upd(i, { country: e.target.value })} data-testid={`wizard-coverage-country-${i}`}>
                            <option value="CI">CI</option><option value="IN">IN</option>
              </Select>
            </Field>
            <button type="button" onClick={() => del(i)} className="pl-btn pl-btn-ghost h-11" data-testid={`wizard-coverage-del-${i}`}><Trash2 size={14} /> Remove</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="pl-btn pl-btn-secondary" data-testid="wizard-coverage-add"><Plus size={14} /> Add area</button>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step6-next" />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Step 7 — Banking                                */
/* -------------------------------------------------------------------------- */

const StepBanking = ({ appId, bank, onNext, onPrev, refresh }) => {
  const [f, setF] = useState({
    bank_name: bank?.bank_name || "", account_holder: bank?.account_holder || "",
    account_number: bank?.account_number || "", iban: bank?.iban || "",
    swift_bic: bank?.swift_bic || "", mobile_money_provider: bank?.mobile_money_provider || "",
    mobile_money_number: bank?.mobile_money_number || "",
    preferred_method: bank?.preferred_method || "bank_transfer",
    billing_address: bank?.billing_address || "", billing_city: bank?.billing_city || "",
    billing_country: bank?.billing_country || "CI",
  });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault(); setBusy(true);
    try {
      await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, { step: 7, bank_info: f });
      await refresh(); onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-5" data-testid="wizard-step7-form">
      <StepHeader icon={Landmark} title="Banking & payment" subtitle="How would you like to be paid?" />
      <Field label="Preferred method">
        <Select value={f.preferred_method} onChange={(e) => setF({ ...f, preferred_method: e.target.value })} data-testid="wizard-input-pay-method">
          <option value="bank_transfer">Bank transfer</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="cheque">Cheque</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <div className="grid md:grid-cols-2 gap-5">
        <Field label="Bank name"><Input value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} placeholder="Ecobank CI" data-testid="wizard-input-bank-name" /></Field>
        <Field label="Account holder"><Input value={f.account_holder} onChange={(e) => setF({ ...f, account_holder: e.target.value })} data-testid="wizard-input-account-holder" /></Field>
        <Field label="Account number"><Input value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} data-testid="wizard-input-account-number" /></Field>
        <Field label="IBAN"><Input value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} data-testid="wizard-input-iban" /></Field>
        <Field label="SWIFT / BIC"><Input value={f.swift_bic} onChange={(e) => setF({ ...f, swift_bic: e.target.value })} data-testid="wizard-input-swift" /></Field>
        <Field label="Mobile Money provider"><Input value={f.mobile_money_provider} onChange={(e) => setF({ ...f, mobile_money_provider: e.target.value })} placeholder="Orange Money / MTN / …" data-testid="wizard-input-mm-provider" /></Field>
        <Field label="Mobile Money number"><Input value={f.mobile_money_number} onChange={(e) => setF({ ...f, mobile_money_number: e.target.value })} data-testid="wizard-input-mm-number" /></Field>
        <Field label="Billing city"><Input value={f.billing_city} onChange={(e) => setF({ ...f, billing_city: e.target.value })} data-testid="wizard-input-billing-city" /></Field>
        <Field label="Billing country">
          <Select value={f.billing_country} onChange={(e) => setF({ ...f, billing_country: e.target.value })} data-testid="wizard-input-billing-country">
                        <option value="CI">CI</option><option value="IN">IN</option>
          </Select>
        </Field>
      </div>
      <Field label="Billing address"><Textarea rows={2} value={f.billing_address} onChange={(e) => setF({ ...f, billing_address: e.target.value })} data-testid="wizard-input-billing-address" /></Field>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step7-next" />
    </form>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Step 8 — Documents                                */
/* -------------------------------------------------------------------------- */

const StepDocuments = ({ appId, existing, onNext, onPrev, refresh }) => {
  const [rows, setRows] = useState([{ document_type: "business_registration", title: "", file_url: "" }]);
  const [busy, setBusy] = useState(false);
  const upd = (i, patch) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const save = async () => {
    const clean = rows.filter((r) => r.file_url && r.file_url.trim());
    if (clean.length === 0 && (existing || []).length === 0) {
      return toast.error("Please upload at least one document.");
    }
    setBusy(true);
    try {
      if (clean.length > 0) {
        await sellerApi.patch(`/martbaked/sellers/apply/${appId}/step`, { step: 8, documents: clean });
      }
      await refresh(); onNext();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="wizard-step8-form">
      <StepHeader icon={FileText} title="Supporting documents" subtitle="Upload your certificates and paste the links here. Full file upload arrives in Phase 2B." />
      {existing && existing.length > 0 && (
        <Field label="Already uploaded">
          <div className="space-y-2" data-testid="wizard-docs-existing">
            {existing.map((d) => (
              <div key={d.id} className="px-4 py-3 rounded-xl flex items-center gap-3" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
                <FileText size={14} style={{ color: "var(--pl-accent)" }} />
                <div className="flex-1 text-sm">
                  <div className="font-medium" style={{ color: "var(--pl-fg)" }}>{d.title || d.document_type}</div>
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--pl-fg-muted)" }}>Open document</a>
                </div>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--pl-fg-subtle)" }}>{d.verification_status}</span>
              </div>
            ))}
          </div>
        </Field>
      )}
      <div className="space-y-3" data-testid="wizard-docs-new">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl items-end" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
            <Field label="Type">
              <Select value={r.document_type} onChange={(e) => upd(i, { document_type: e.target.value })} data-testid={`wizard-doc-type-${i}`}>
                {DOC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Title"><Input value={r.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder="RCCM Certificate" data-testid={`wizard-doc-title-${i}`} /></Field>
            <Field label="File URL"><Input value={r.file_url} onChange={(e) => upd(i, { file_url: e.target.value })} placeholder="https://drive.example/..." data-testid={`wizard-doc-url-${i}`} /></Field>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows([...rows, { document_type: "other", title: "", file_url: "" }])} className="pl-btn pl-btn-secondary" data-testid="wizard-docs-add"><Plus size={14} /> Add another</button>
      <NavRow onPrev={onPrev} onNext={save} busy={busy} nextTestId="wizard-step8-next" />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             Step 9 — Review                                  */
/* -------------------------------------------------------------------------- */

const StepReview = ({ appId, supplier, full, onPrev, onSubmit, busy }) => {
  const [confirmed, setConfirmed] = useState(false);
  const owner = (full.contacts || []).find((c) => c.is_primary);
  const bizLoc = (full.supply_locations || []).find((l) => l.is_business_location);
  const coverage = (full.supply_locations || []).filter((l) => !l.is_business_location);
  const bank = full.bank_info;
  return (
    <div className="space-y-5" data-testid="wizard-step9-form">
      <StepHeader icon={ClipboardCheck} title="Final review" subtitle="Check everything looks right. You can still go back to edit any section." />
      <div className="grid md:grid-cols-2 gap-5">
        <ReviewCard title="Business">
          <ReviewRow label="Name" value={supplier?.business_name} />
          <ReviewRow label="Trading name" value={supplier?.trading_name || "—"} />
          <ReviewRow label="Type" value={supplier?.business_type} />
          <ReviewRow label="Email" value={supplier?.business_email} />
          <ReviewRow label="Phone" value={supplier?.business_phone || "—"} />
          <ReviewRow label="Website" value={supplier?.website || "—"} />
          <ReviewRow label="Registration" value={supplier?.registration_number || "—"} />
          <ReviewRow label="Tax ID" value={supplier?.tax_id || "—"} />
          <ReviewRow label="Country" value={supplier?.country} />
          <ReviewRow label="Currency" value={supplier?.default_currency} />
        </ReviewCard>
        <ReviewCard title="Owner">
          {owner ? (<>
            <ReviewRow label="Name" value={owner.full_name} />
            <ReviewRow label="Position" value={owner.position || "—"} />
            <ReviewRow label="Email" value={owner.email || "—"} />
            <ReviewRow label="Phone" value={owner.phone || "—"} />
            <ReviewRow label="Relationship" value={owner.relationship} />
          </>) : <div className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>Owner info missing.</div>}
        </ReviewCard>
        <ReviewCard title="Business location">
          {bizLoc ? (<>
            <ReviewRow label="Label" value={bizLoc.label} />
            <ReviewRow label="Address" value={bizLoc.address || "—"} />
            <ReviewRow label="City" value={`${bizLoc.city || "—"} · ${bizLoc.country || "—"}`} />
            <ReviewRow label="Coordinates" value={bizLoc.latitude ? `${bizLoc.latitude.toFixed(4)}, ${bizLoc.longitude.toFixed(4)}` : "—"} />
            <ReviewRow label="Radius" value={bizLoc.service_radius_km ? `${bizLoc.service_radius_km} km` : "—"} />
          </>) : <div className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>Location missing.</div>}
        </ReviewCard>
        <ReviewCard title="Categories">
          <div className="text-sm" style={{ color: "var(--pl-fg)" }}>
            {full.categories.length === 0 && <span style={{ color: "var(--pl-fg-muted)" }}>None selected.</span>}
            {full.categories.map((c, i) => (
              <div key={i}>{c.category_id ? `✓ (existing) ${c.category_id}` : `⏳ Requested: ${c.requested_name}`}</div>
            ))}
          </div>
        </ReviewCard>
        <ReviewCard title="Coverage">
          <div className="text-sm" style={{ color: "var(--pl-fg)" }}>
            {coverage.length === 0 && <span style={{ color: "var(--pl-fg-muted)" }}>No coverage areas.</span>}
            {coverage.map((l, i) => <div key={i}>{l.kind} · {l.city || l.zone || l.country}</div>)}
          </div>
        </ReviewCard>
        <ReviewCard title="Documents">
          <div className="text-sm">
            {(full.documents || []).length === 0 && <span style={{ color: "var(--pl-fg-muted)" }}>No documents uploaded.</span>}
            {(full.documents || []).map((d) => <div key={d.id} style={{ color: "var(--pl-fg)" }}>{d.title || d.document_type}</div>)}
          </div>
        </ReviewCard>
        <ReviewCard title="Banking">
          {bank ? (<>
            <ReviewRow label="Method" value={bank.preferred_method} />
            <ReviewRow label="Bank" value={bank.bank_name || "—"} />
            <ReviewRow label="Holder" value={bank.account_holder || "—"} />
            <ReviewRow label="Account" value={bank.account_number ? `${bank.account_number.slice(0, 4)}…${bank.account_number.slice(-2)}` : "—"} />
          </>) : <div className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>Not set.</div>}
        </ReviewCard>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl cursor-pointer" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }} data-testid="wizard-confirm-label">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" data-testid="wizard-confirm-checkbox" />
        <span className="text-sm" style={{ color: "var(--pl-fg)" }}>I confirm that the information provided is accurate and complete, and I am authorised to submit this application on behalf of the business.</span>
      </label>

      <div className="flex items-center justify-between pt-6 mt-6" style={{ borderTop: "1px solid var(--pl-border)" }}>
        <button type="button" onClick={onPrev} className="pl-btn pl-btn-ghost" data-testid="wizard-btn-prev"><ArrowLeft size={14} /> Back</button>
        <button type="button" onClick={onSubmit} disabled={!confirmed || busy} className="pl-btn pl-btn-primary" data-testid="wizard-submit">
          {busy ? "Submitting…" : "Submit application"} <CheckCircle2 size={14} />
        </button>
      </div>
    </div>
  );
};

const ReviewCard = ({ title, children }) => (
  <div className="pl-card p-5" data-testid={`wizard-review-${title.toLowerCase().replace(/\s+/g, "-")}`}>
    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--pl-fg-muted)" }}>{title}</div>
    {children}
  </div>
);

const ReviewRow = ({ label, value }) => (
  <div className="flex justify-between gap-3 text-xs py-1">
    <span style={{ color: "var(--pl-fg-muted)" }}>{label}</span>
    <span className="text-right" style={{ color: "var(--pl-fg)" }}>{value || "—"}</span>
  </div>
);

export default SellerApplyWizard;
