/**
 * MARTbakēd Partner — Public Application flow (Stage 1).
 *
 * Route: /partner/apply — multi-step wizard that submits to
 *        POST /api/mart-partner/applications.
 *
 * The form is deliberately in a self-contained shell (uses the same
 * partner-hub CSS tokens for consistency) so it can later be extracted to
 * a dedicated `mart-partner-portal` app when we spin subdomains.
 */
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BakedLogo } from "@/components/layout/BakedLogo";
import { WarehouseLocationPicker } from "./WarehouseLocationPicker";
import "./partner-hub.css";

const STEPS = [
  { key: "business",  title: "Business",  desc: "Tell us about your store" },
  { key: "owner",     title: "Owner",     desc: "Contact & KYC" },
  { key: "warehouse", title: "Warehouse", desc: "Location & property" },
  { key: "bank",      title: "Bank",      desc: "Where to send payouts" },
  { key: "review",    title: "Review",    desc: "Confirm & submit" },
];

const emptyForm = {
  module: "mart",
  country: "CI",
  business_name: "",
  legal_name: "",
  business_type: "dark_store",
  registration_number: "",
  tax_id: "",
  years_in_business: "",
  primary_contact_name: "",
  primary_contact_email: "",
  primary_contact_phone: "",
  owner_name: "",
  owner_id_type: "CNI",
  owner_id_number: "",
  warehouse_address_line: "",
  warehouse_city: "",
  warehouse_latitude: null,
  warehouse_longitude: null,
  warehouse_country_code: "",
  warehouse_region: "",
  warehouse_postal_code: "",
  warehouse_place_id: "",
  warehouse_formatted_address: "",
  warehouse_location_accuracy: "",
  warehouse_confirmed: false,
  property_type: "leased",
  property_size_sqm: "",
  service_area_km: "",
  bank_name: "",
  bank_account_holder: "",
  bank_account_number: "",
  bank_swift_or_code: "",
  mobile_money_provider: "",
  mobile_money_number: "",
};

const FIELD = "px-4 h-11 rounded-xl w-full text-sm";
const fieldStyle = {
  background: "var(--ph-card)",
  color: "var(--ph-fg)",
  border: "1px solid var(--ph-border-strong)",
};

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-sm font-medium" style={{ color: "var(--ph-fg)" }}>{label}</span>
    {hint && <span className="block text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>{hint}</span>}
    <div className="mt-2">{children}</div>
  </label>
);

const TextInput = (props) => (
  <input {...props} className={FIELD} style={fieldStyle} data-testid={`apply-input-${props.name}`} />
);
const SelectInput = ({ children, ...props }) => (
  <select {...props} className={FIELD} style={fieldStyle} data-testid={`apply-select-${props.name}`}>
    {children}
  </select>
);

const BUSINESS_TYPES = [
  ["dark_store", "Dark Store"],
  ["supermarket", "Supermarket"],
  ["convenience_store", "Convenience Store"],
  ["grocery", "Grocery Store"],
  ["pharmacy", "Pharmacy"],
  ["specialty", "Specialty Store"],
  ["warehouse", "Warehouse"],
  ["fulfillment_center", "Fulfillment Centre"],
];

/* -------------------------------------------------------------------------- */
/*                                 Step forms                                 */
/* -------------------------------------------------------------------------- */

const BusinessStep = ({ f, set }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <Field label="Business name">
      <TextInput name="business_name" value={f.business_name}
        onChange={e => set("business_name", e.target.value)} placeholder="MiniMart Cocody" />
    </Field>
    <Field label="Legal name (optional)">
      <TextInput name="legal_name" value={f.legal_name}
        onChange={e => set("legal_name", e.target.value)} placeholder="MiniMart Cocody SARL" />
    </Field>
    <Field label="Business type">
      <SelectInput name="business_type" value={f.business_type} onChange={e => set("business_type", e.target.value)}>
        {BUSINESS_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectInput>
    </Field>
    <Field label="Country">
      <SelectInput name="country" value={f.country} onChange={e => set("country", e.target.value)}>
        <option value="CI">Côte d&apos;Ivoire</option>
      </SelectInput>
    </Field>
    <Field label="Registration number (optional)">
      <TextInput name="registration_number" value={f.registration_number}
        onChange={e => set("registration_number", e.target.value)} placeholder="RCCM-ABJ-2024-A-01234" />
    </Field>
    <Field label="Tax ID / CC (optional)">
      <TextInput name="tax_id" value={f.tax_id}
        onChange={e => set("tax_id", e.target.value)} placeholder="0123456789" />
    </Field>
    <Field label="Years in business">
      <TextInput type="number" min="0" max="200" name="years_in_business" value={f.years_in_business}
        onChange={e => set("years_in_business", e.target.value)} placeholder="e.g. 3" />
    </Field>
  </div>
);

const OwnerStep = ({ f, set }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    <Field label="Primary contact name">
      <TextInput name="primary_contact_name" value={f.primary_contact_name}
        onChange={e => set("primary_contact_name", e.target.value)} placeholder="Aïcha Konan" />
    </Field>
    <Field label="Primary contact email">
      <TextInput type="email" name="primary_contact_email" value={f.primary_contact_email}
        onChange={e => set("primary_contact_email", e.target.value)} placeholder="you@business.com" />
    </Field>
    <Field label="Primary contact phone" hint="Include country code, e.g. +225 for Côte d'Ivoire">
      <TextInput name="primary_contact_phone" value={f.primary_contact_phone}
        onChange={e => set("primary_contact_phone", e.target.value)} placeholder="+225 0102 030405" />
    </Field>
    <Field label="Owner name">
      <TextInput name="owner_name" value={f.owner_name}
        onChange={e => set("owner_name", e.target.value)} placeholder="Full legal name" />
    </Field>
    <Field label="Owner ID type">
      <SelectInput name="owner_id_type" value={f.owner_id_type} onChange={e => set("owner_id_type", e.target.value)}>
        <option value="CNI">National ID (CNI)</option>
        <option value="passport">Passport</option>
        <option value="drivers_license">Driver&apos;s License</option>
      </SelectInput>
    </Field>
    <Field label="Owner ID number">
      <TextInput name="owner_id_number" value={f.owner_id_number}
        onChange={e => set("owner_id_number", e.target.value)} placeholder="ID document number" />
    </Field>
  </div>
);

const WarehouseStep = ({ f, set }) => {
  const location = {
    latitude: f.warehouse_latitude,
    longitude: f.warehouse_longitude,
    formatted_address: f.warehouse_formatted_address,
    city: f.warehouse_city,
    region: f.warehouse_region,
    country_code: f.warehouse_country_code,
    postal_code: f.warehouse_postal_code,
    place_id: f.warehouse_place_id,
    location_accuracy: f.warehouse_location_accuracy,
  };
  const handleLocation = (p) => {
    // Empty object = "clear the pin"
    if (!p || !p.latitude) {
      set("warehouse_latitude", null);
      set("warehouse_longitude", null);
      set("warehouse_formatted_address", "");
      set("warehouse_place_id", "");
      set("warehouse_postal_code", "");
      set("warehouse_location_accuracy", "");
      set("warehouse_country_code", "");
      set("warehouse_region", "");
      set("warehouse_confirmed", false);
      return;
    }
    set("warehouse_latitude",  p.latitude);
    set("warehouse_longitude", p.longitude);
    set("warehouse_formatted_address", p.formatted_address || f.warehouse_formatted_address || "");
    set("warehouse_place_id",  p.place_id || "");
    set("warehouse_postal_code", p.postal_code || "");
    set("warehouse_location_accuracy", p.location_accuracy || "");
    set("warehouse_country_code", (p.country_code || "").toUpperCase());
    set("warehouse_region", p.region || "");
    // Auto-fill address_line + city from the pick unless applicant has edited.
    if (p.formatted_address && !f.warehouse_address_line) {
      set("warehouse_address_line", p.formatted_address.split(",")[0]);
    }
    if (p.city && !f.warehouse_city) set("warehouse_city", p.city);
    set("warehouse_confirmed", false);
  };
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--ph-fg-subtle)" }}>
          Step 3 · Warehouse / store location
        </div>
        <p className="ph-body" style={{ color: "var(--ph-fg-muted)" }}>
          Search for your street or landmark, use your current GPS location, or tap the map to
          drop a pin. The <b>latitude &amp; longitude</b> we capture here become the store&apos;s
          authoritative delivery origin.
        </p>
      </div>

      <WarehouseLocationPicker
        value={location}
        onChange={handleLocation}
        country={f.country || "CI"}
      />

      {/* Confirm gate — actually just a mirror of the picker's internal state,
          bound to a hidden checkbox so the wizard's canGoNext check can look
          at it via `f.warehouse_confirmed`. */}
      <div>
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer"
               style={{ color: "var(--ph-fg-muted)" }}>
          <input type="checkbox" checked={!!f.warehouse_confirmed}
                 disabled={!f.warehouse_latitude}
                 onChange={(e) => set("warehouse_confirmed", e.target.checked)}
                 data-testid="apply-warehouse-confirmed" />
          I confirm this is the exact location of my warehouse / store.
        </label>
      </div>

      {/* Editable address fields — pre-filled by the map picker, but the
          applicant can override for building number, floor, etc. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Warehouse / store address"
               hint="Street + building name. Pre-filled from the map pin.">
          <TextInput name="warehouse_address_line" value={f.warehouse_address_line}
                     onChange={e => set("warehouse_address_line", e.target.value)}
                     placeholder="12 Rue des Jardins" />
        </Field>
        <Field label="City" hint="Auto-detected from the map pin.">
          <TextInput name="warehouse_city" value={f.warehouse_city}
                     onChange={e => set("warehouse_city", e.target.value)}
                     placeholder="Abidjan" />
        </Field>
        <Field label="Property type">
          <SelectInput name="property_type" value={f.property_type} onChange={e => set("property_type", e.target.value)}>
            <option value="owned">Owned</option>
            <option value="leased">Leased</option>
          </SelectInput>
        </Field>
        <Field label="Property size (m²)">
          <TextInput type="number" min="0" name="property_size_sqm" value={f.property_size_sqm}
                     onChange={e => set("property_size_sqm", e.target.value)} placeholder="e.g. 220" />
        </Field>
        <Field label="Service area radius (km)" hint="How far you're willing to deliver — the pin stays put.">
          <TextInput type="number" min="0" max="500" step="0.5" name="service_area_km" value={f.service_area_km}
                     onChange={e => set("service_area_km", e.target.value)} placeholder="e.g. 8" />
        </Field>
      </div>
    </div>
  );
};

const BankStep = ({ f, set }) => (
  <div>
    <p className="ph-body mb-6" style={{ color: "var(--ph-fg-muted)" }}>
      Provide either bank account or mobile-money details — we&apos;ll use this to pay you out weekly. All data is encrypted.
    </p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Field label="Bank name">
        <TextInput name="bank_name" value={f.bank_name}
          onChange={e => set("bank_name", e.target.value)} placeholder="e.g. Ecobank CI" />
      </Field>
      <Field label="Account holder">
        <TextInput name="bank_account_holder" value={f.bank_account_holder}
          onChange={e => set("bank_account_holder", e.target.value)} placeholder="Legal name on the account" />
      </Field>
      <Field label="Account number / IBAN">
        <TextInput name="bank_account_number" value={f.bank_account_number}
          onChange={e => set("bank_account_number", e.target.value)} placeholder="CI01 0001 …" />
      </Field>
      <Field label="SWIFT / Bank code (optional)">
        <TextInput name="bank_swift_or_code" value={f.bank_swift_or_code}
          onChange={e => set("bank_swift_or_code", e.target.value)} placeholder="ECOCCIAB" />
      </Field>
      <Field label="Mobile-money provider (optional)">
        <SelectInput name="mobile_money_provider" value={f.mobile_money_provider} onChange={e => set("mobile_money_provider", e.target.value)}>
          <option value="">— none —</option>
          <option value="orange">Orange Money</option>
          <option value="mtn">MTN Money</option>
          <option value="moov">Moov Money</option>
          <option value="wave">Wave</option>
        </SelectInput>
      </Field>
      <Field label="Mobile-money number (optional)">
        <TextInput name="mobile_money_number" value={f.mobile_money_number}
          onChange={e => set("mobile_money_number", e.target.value)} placeholder="+225 …" />
      </Field>
    </div>
  </div>
);

const ReviewRow = ({ label, value }) => (
  <div className="flex items-start justify-between py-3" style={{ borderBottom: "1px solid var(--ph-border)" }}>
    <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>{label}</div>
    <div className="text-sm text-right max-w-[60%]" style={{ color: "var(--ph-fg)" }}>{value || "—"}</div>
  </div>
);

const ReviewStep = ({ f }) => (
  <div className="space-y-1">
    <ReviewRow label="Business"   value={`${f.business_name} · ${f.business_type.replace("_", " ")}`} />
    <ReviewRow label="Country"    value={f.country} />
    <ReviewRow label="Owner"      value={f.owner_name} />
    <ReviewRow label="Contact"    value={`${f.primary_contact_email} · ${f.primary_contact_phone}`} />
    <ReviewRow label="Warehouse"  value={f.warehouse_formatted_address || `${f.warehouse_address_line}, ${f.warehouse_city}`} />
    <ReviewRow label="Coordinates"
               value={f.warehouse_latitude && f.warehouse_longitude
                 ? `${Number(f.warehouse_latitude).toFixed(5)}, ${Number(f.warehouse_longitude).toFixed(5)}` +
                   (f.warehouse_country_code ? ` · ${f.warehouse_country_code}` : "")
                 : "Not set"} />
    <ReviewRow label="Property"   value={`${f.property_type} · ${f.property_size_sqm || "?"} m² · ${f.service_area_km || "?"} km radius`} />
    <ReviewRow label="Payouts"    value={f.bank_name ? `${f.bank_name} · ****${(f.bank_account_number || "").slice(-4)}` : (f.mobile_money_number || "—")} />
    <p className="pt-6 text-sm" style={{ color: "var(--ph-fg-muted)" }}>
      By submitting, you confirm the information is accurate and that a member of our team may contact you to verify.
    </p>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                              Root component                                */
/* -------------------------------------------------------------------------- */

const requiredByStep = {
  business:  ["business_name", "business_type", "country"],
  owner:     ["primary_contact_name", "primary_contact_email", "primary_contact_phone", "owner_name"],
  warehouse: ["warehouse_address_line", "warehouse_city"],
  bank:      [],  // all optional individually; validated as "at least one" below
  review:    [],
};

export const PartnerApplyApp = () => {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const currentStep = STEPS[step];
  const canGoNext = useMemo(() => {
    const missing = requiredByStep[currentStep.key].filter(k => !f[k]?.trim?.());
    if (missing.length) return false;
    // Warehouse step also requires a confirmed map location before advancing
    // (Fixing_Prompt_2026-02-11_v2 §9 "confirm this is the exact location").
    if (currentStep.key === "warehouse") {
      if (!f.warehouse_latitude || !f.warehouse_longitude) return false;
      if (!f.warehouse_confirmed) return false;
    }
    return true;
  }, [step, f, currentStep.key]);

  const submit = async () => {
    if (!f.bank_account_number && !f.mobile_money_number) {
      toast.error("Please add bank details OR a mobile-money number so we can pay you out");
      setStep(3);
      return;
    }
    if (!f.warehouse_latitude || !f.warehouse_longitude) {
      toast.error("Please pick your store location on the map first");
      setStep(2);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...f,
        years_in_business: f.years_in_business ? Number(f.years_in_business) : null,
        property_size_sqm: f.property_size_sqm ? Number(f.property_size_sqm) : null,
        service_area_km: f.service_area_km ? Number(f.service_area_km) : null,
        warehouse_latitude:  f.warehouse_latitude  != null ? Number(f.warehouse_latitude)  : null,
        warehouse_longitude: f.warehouse_longitude != null ? Number(f.warehouse_longitude) : null,
      };
      // `warehouse_confirmed` is UI-only — never sent to the backend.
      delete payload.warehouse_confirmed;
      // Drop empty optional strings — backend prefers nulls.
      Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
      const { data } = await api.post("/mart-partner/applications", payload);
      setResult(data);
      toast.success(`Application submitted — reference ${data.reference}`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const msg =
        Array.isArray(detail) ? detail.map(d => d.msg).join(" · ")
        : (typeof detail === "object" && detail?.message) ? detail.message
        : (detail || "Something went wrong");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirmation screen after submit
  if (result) {
    return (
      <div className="partner-hub" data-theme="dark">
        <ApplyHeader />
        <main className="ph-container ph-section text-center max-w-2xl">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
               style={{ background: "var(--ph-accent-soft)", color: "var(--ph-accent)" }}>
            <CheckCircle2 size={30} />
          </div>
          <h1 className="ph-h1 mt-8" style={{ color: "var(--ph-fg)" }}>Application received</h1>
          <p className="ph-body-lg mt-4">
            Thank you, {f.primary_contact_name.split(" ")[0]}. Your application is under review.
          </p>
          <div className="mt-8 p-6 rounded-2xl ph-glass" style={{ background: "var(--ph-card)" }}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "var(--ph-fg-subtle)" }}>Your reference</div>
            <div className="ph-h2 mt-2" style={{ color: "var(--ph-accent-warm)" }} data-testid="apply-reference">
              {result.reference}
            </div>
            <p className="text-sm mt-4" style={{ color: "var(--ph-fg-muted)" }}>
              Keep this reference — you&apos;ll need it (along with your email) to check the status of your application.
              We&apos;ll email you at <b style={{ color: "var(--ph-fg)" }}>{f.primary_contact_email}</b> once a decision is made.
            </p>
          </div>
          <div className="mt-10 flex gap-4 justify-center">
            <button
              onClick={() => navigate("/partner")}
              className="ph-btn ph-btn-secondary"
              data-testid="apply-back-to-hub"
            >
              Back to Partner Hub
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="partner-hub" data-theme="dark">
      <ApplyHeader />
      <main className="ph-container py-16 max-w-3xl">
        <Link to="/partner" className="ph-nav-link inline-flex items-center gap-1.5 mb-6" data-testid="apply-back">
          <ArrowLeft size={14} /> Back to Partner Hub
        </Link>
        <div className="ph-eyebrow mb-4">MARTbakēd Partner · Application</div>
        <h1 className="ph-h1" style={{ color: "var(--ph-fg)" }}>Apply to join BAKĒD.</h1>

        {/* Step progress */}
        <div className="mt-10 grid grid-cols-5 gap-3">
          {STEPS.map((s, i) => (
            <div key={s.key} className="text-left">
              <div
                className="h-1.5 rounded-full mb-3"
                style={{
                  background: i <= step ? "var(--ph-accent-warm)" : "var(--ph-border-strong)",
                }}
              />
              <div className="text-[10px] font-bold uppercase tracking-widest"
                   style={{ color: i === step ? "var(--ph-accent-warm)" : "var(--ph-fg-subtle)" }}>
                {`Step ${i + 1}`}
              </div>
              <div className="text-sm mt-1 font-medium"
                   style={{ color: i <= step ? "var(--ph-fg)" : "var(--ph-fg-subtle)" }}>
                {s.title}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl p-8 md:p-10" style={{ background: "var(--ph-card)", border: "1px solid var(--ph-border)" }}>
          <div className="mb-6">
            <div className="ph-h3" style={{ color: "var(--ph-fg)" }}>{currentStep.title}</div>
            <p className="text-sm mt-1" style={{ color: "var(--ph-fg-muted)" }}>{currentStep.desc}</p>
          </div>

          {currentStep.key === "business"  && <BusinessStep  f={f} set={set} />}
          {currentStep.key === "owner"     && <OwnerStep     f={f} set={set} />}
          {currentStep.key === "warehouse" && <WarehouseStep f={f} set={set} />}
          {currentStep.key === "bank"      && <BankStep      f={f} set={set} />}
          {currentStep.key === "review"    && <ReviewStep    f={f} />}

          <div className="mt-10 flex items-center justify-between gap-3 pt-6" style={{ borderTop: "1px solid var(--ph-border)" }}>
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="ph-btn ph-btn-ghost"
              data-testid="apply-prev"
            >
              <ArrowLeft size={16} /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canGoNext}
                className="ph-btn ph-btn-warm"
                style={{ opacity: canGoNext ? 1 : 0.5 }}
                data-testid="apply-next"
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={submitting}
                className="ph-btn ph-btn-warm"
                data-testid="apply-submit"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const ApplyHeader = () => (
  <header className="ph-nav" data-scrolled="true">
    <div className="ph-container flex items-center justify-between" style={{ height: 72 }}>
      <Link to="/partner" className="flex items-center gap-3" data-testid="apply-header-logo">
        <BakedLogo size="md" />
        <span
          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color: "var(--ph-accent-warm)",
            border: "1px solid var(--ph-border-strong)",
            background: "var(--ph-glass)",
          }}
        >
          Application
        </span>
      </Link>
      <Link to="/partner/status" className="ph-nav-link" data-testid="apply-header-status">
        Check application status
      </Link>
    </div>
  </header>
);

export default PartnerApplyApp;
