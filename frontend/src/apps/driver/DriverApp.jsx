/**
 * SENDbakēd Driver — Slice 1 (Auth + KYC + Dashboard).
 *
 * Mobile-first, dark-mode-first PWA. Enforces a phone-shaped viewport so
 * the experience mirrors what will eventually ship as the Flutter driver
 * app (same design language: pure-black bg, orange accent, dark-glass
 * cards, rounded-24 corners, large headlines, minimal taps).
 *
 * Routes (all mounted under /driver/*):
 *   /driver                    → gate → onboarding | login | kyc | dashboard
 *   /driver/onboarding         → 3-slide carousel (skippable)
 *   /driver/login              → phone entry
 *   /driver/otp                → OTP entry
 *   /driver/kyc/personal       → wizard
 *   /driver/kyc/id
 *   /driver/kyc/licence
 *   /driver/kyc/selfie
 *   /driver/kyc/vehicle
 *   /driver/kyc/bank
 *   /driver/kyc/emergency
 *   /driver/kyc/submitted      → application-under-review screen
 *   /driver/dashboard          → online toggle + earnings summary
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, ChevronRight, ChevronLeft, Truck, Bike, Package, Wallet, Star, LogOut,
  Phone as PhoneIcon, ShieldCheck, IdCard, ScanLine, User, Upload, CheckCircle2, Clock, MapPin,
  Camera, Car,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  API + auth context                                                         */
/* -------------------------------------------------------------------------- */

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const driverApi = axios.create({ baseURL: API_BASE });
driverApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("baked_driver_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  return "Something went wrong";
};

const DriverCtx = createContext(null);
export const useDriver = () => useContext(DriverCtx);

const DriverProvider = ({ children }) => {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem("baked_driver_token");
    if (!t) { setDriver(null); setLoading(false); return; }
    try {
      const { data } = await driverApi.get("/driver/me");
      setDriver(data);
    } catch { localStorage.removeItem("baked_driver_token"); setDriver(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = () => { localStorage.removeItem("baked_driver_token"); setDriver(null); };

  return (
    <DriverCtx.Provider value={{ driver, setDriver, loading, refresh, logout }}>
      {children}
    </DriverCtx.Provider>
  );
};

/* -------------------------------------------------------------------------- */
/*  Design system primitives                                                   */
/* -------------------------------------------------------------------------- */

const Phone = ({ children }) => (
  // Mobile-first phone frame — everything under /driver renders in this shell
  <div className="min-h-screen w-full flex justify-center bg-black text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
    <div className="w-full max-w-[440px] min-h-screen bg-black relative overflow-x-hidden" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}>
      {children}
    </div>
  </div>
);

const Header = ({ title, back, right }) => {
  const nav = useNavigate();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between px-5 h-14 bg-black/80 backdrop-blur-lg" data-testid="driver-header">
      <button
        onClick={back || (() => nav(-1))}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5"
        data-testid="driver-back"
        aria-label="Back"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="text-sm font-medium tracking-wide">{title}</div>
      <div className="w-9 h-9 flex items-center justify-center">{right}</div>
    </div>
  );
};

const PrimaryButton = ({ children, disabled, busy, className = "", ...rest }) => (
  <button
    disabled={disabled || busy}
    className={`w-full h-14 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 transition-all
                ${disabled || busy ? "bg-white/10 text-white/40" : "text-black shadow-[0_16px_40px_-16px_rgba(255,122,0,0.6)]"} ${className}`}
    style={disabled || busy ? {} : { background: "linear-gradient(135deg, #FFB454, #FF7A00)" }}
    {...rest}
  >
    {busy ? <Loader2 size={18} className="animate-spin" /> : children}
  </button>
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-3xl p-5 border border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}>{children}</div>
);

const TextField = ({ label, testid, ...rest }) => (
  <label className="block">
    <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">{label}</div>
    <input
      data-testid={testid}
      className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-4 text-base text-white outline-none focus:border-orange-500/60 transition"
      {...rest}
    />
  </label>
);

/* -------------------------------------------------------------------------- */
/*  Gate — decides where to send the driver                                    */
/* -------------------------------------------------------------------------- */

const Gate = () => {
  const { driver, loading } = useDriver();
  if (loading) return <Phone><div className="h-screen grid place-items-center"><Loader2 className="animate-spin" size={22} /></div></Phone>;
  if (!driver) {
    const seenOnboarding = localStorage.getItem("baked_driver_onboarded") === "1";
    return <Navigate to={seenOnboarding ? "/driver/login" : "/driver/onboarding"} replace />;
  }
  if (driver.status === "approved")       return <Navigate to="/driver/dashboard" replace />;
  if (driver.status === "pending_review") return <Navigate to="/driver/kyc/submitted" replace />;
  if (driver.status === "rejected")       return <Navigate to={`/driver/kyc/${driver.kyc_step || "personal"}`} replace />;
  return <Navigate to={`/driver/kyc/${driver.kyc_step || "personal"}`} replace />;
};

/* -------------------------------------------------------------------------- */
/*  Onboarding carousel                                                        */
/* -------------------------------------------------------------------------- */

const SLIDES = [
  { icon: Truck,   title: "Deliver anything",   body: "Food · Groceries · Retail · Parcels — one app, every delivery type SENDbakēd offers." },
  { icon: Wallet,  title: "Earn on your terms", body: "Base fare + distance + peak-hour bonuses + tips. See your earnings update after every drop." },
  { icon: Star,    title: "Ride, tap, thrive",  body: "One-tap online toggle, turn-by-turn navigation, and instant payouts to your bank." },
];

const OnboardingPage = () => {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const S = SLIDES[i];
  const Icon = S.icon;
  const finish = () => { localStorage.setItem("baked_driver_onboarded", "1"); nav("/driver/login"); };
  return (
    <Phone>
      <div className="min-h-screen flex flex-col px-6 pt-16 pb-10" data-testid={`driver-onboard-${i}`}>
        <div className="flex justify-end">
          <button onClick={finish} className="text-xs uppercase tracking-widest text-white/50" data-testid="driver-onboard-skip">Skip</button>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center text-center">
          <div className="w-28 h-28 rounded-[36px] grid place-items-center mb-10"
               style={{ background: "linear-gradient(135deg, #FF7A00, #FFB454)", boxShadow: "0 30px 60px -20px rgba(255,122,0,0.55)" }}>
            <Icon size={44} color="#000" />
          </div>
          <h1 className="text-3xl font-bold mb-3">{S.title}</h1>
          <p className="text-white/60 max-w-xs">{S.body}</p>
        </div>
        <div className="flex justify-center gap-2 mb-8">
          {SLIDES.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full transition-all ${i === k ? "w-6 bg-orange-500" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>
        <PrimaryButton onClick={() => (i === SLIDES.length - 1 ? finish() : setI(i + 1))} data-testid="driver-onboard-next">
          {i === SLIDES.length - 1 ? "Get started" : "Next"} <ChevronRight size={18} />
        </PrimaryButton>
      </div>
    </Phone>
  );
};

/* -------------------------------------------------------------------------- */
/*  Login (phone) + OTP                                                        */
/* -------------------------------------------------------------------------- */

const LoginPage = () => {
  const [country, setCountry] = useState("IN");
  const [phone, setPhone]     = useState("");
  const [busy, setBusy]       = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) return toast.error("Enter a valid phone number");
    const dial = country === "IN" ? "+91" : "+225";
    const e164 = `${dial}${digits}`;
    setBusy(true);
    try {
      const { data } = await driverApi.post("/driver/auth/request-otp", { phone_e164: e164, country });
      if (data.dev_hint) toast.success(`Dev OTP: ${data.dev_hint}`);
      sessionStorage.setItem("baked_driver_pending_phone", e164);
      nav("/driver/otp");
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <Phone>
      <div className="min-h-screen flex flex-col px-6 pt-16 pb-10">
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-orange-500">SENDbakēd · Driver</div>
          <h1 className="text-4xl font-bold mt-3">Welcome back</h1>
          <p className="text-white/60 mt-2">Sign in with your registered mobile number.</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Country</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { code: "IN", flag: "🇮🇳", label: "India" },
                { code: "CI", flag: "🇨🇮", label: "Côte d'Ivoire" },
              ].map((c) => (
                <button key={c.code} type="button" onClick={() => setCountry(c.code)}
                  data-testid={`driver-login-country-${c.code}`}
                  className={`h-14 rounded-2xl border transition flex items-center justify-center gap-2
                              ${country === c.code ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/5"}`}>
                  <span className="text-lg">{c.flag}</span>
                  <span className="text-sm">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Mobile number</div>
            <div className="flex items-stretch gap-3">
              <div className="h-14 px-4 rounded-2xl bg-white/5 border border-white/10 flex items-center text-base">
                {country === "IN" ? "+91" : "+225"}
              </div>
              <input
                data-testid="driver-login-phone"
                inputMode="numeric" autoFocus placeholder="10-digit mobile"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                className="flex-1 h-14 rounded-2xl bg-white/5 border border-white/10 px-4 text-base outline-none focus:border-orange-500/60"
              />
            </div>
          </div>
          <PrimaryButton type="submit" busy={busy} data-testid="driver-login-submit">Continue <ChevronRight size={18} /></PrimaryButton>
          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            By continuing you agree to the SENDbakēd Driver Partner Terms and privacy policy.
          </p>
        </form>
      </div>
    </Phone>
  );
};

const OtpPage = () => {
  const [code, setCode]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const nav = useNavigate();
  const { setDriver } = useDriver();
  const phone = sessionStorage.getItem("baked_driver_pending_phone");

  useEffect(() => {
    if (!phone) nav("/driver/login");
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [phone, nav]);

  const submit = async (e) => {
    e.preventDefault();
    if (code.length < 4) return toast.error("Enter the OTP code");
    setBusy(true);
    try {
      const { data } = await driverApi.post("/driver/auth/verify-otp", { phone_e164: phone, code });
      localStorage.setItem("baked_driver_token", data.access_token);
      sessionStorage.removeItem("baked_driver_pending_phone");
      const ns = data.next_step;
      const target = ns === "dashboard"
                   ? "/driver/dashboard"
                   : ns === "submitted"
                     ? "/driver/kyc/submitted"
                     : `/driver/kyc/${ns || "personal"}`;
      // Full navigation guarantees DriverProvider re-hydrates with the new
      // token via its mount-time /driver/me call — avoiding the SPA
      // in-flight-state race we saw earlier.
      window.location.href = target;
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      const { data } = await driverApi.post("/driver/auth/request-otp", { phone_e164: phone, country: phone?.startsWith("+91") ? "IN" : "CI" });
      if (data.dev_hint) toast.success(`Dev OTP: ${data.dev_hint}`);
      setResendIn(30);
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <Phone>
      <Header title="Verify" />
      <div className="px-6 pt-6" data-testid="driver-otp-page">
        <h1 className="text-3xl font-bold">Enter code</h1>
        <p className="text-white/60 mt-2">We sent a 6-digit code to <span className="text-white">{phone}</span>.</p>
        <form onSubmit={submit} className="mt-10 space-y-5">
          <input
            data-testid="driver-otp-input"
            autoFocus inputMode="numeric" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full h-20 rounded-2xl bg-white/5 border border-white/10 text-center text-3xl tracking-[0.5em] font-mono outline-none focus:border-orange-500/60"
          />
          <PrimaryButton type="submit" busy={busy} data-testid="driver-otp-verify">Verify & continue</PrimaryButton>
          <button type="button" onClick={resend} disabled={resendIn > 0}
                  className="w-full text-center text-sm text-white/60 disabled:text-white/30"
                  data-testid="driver-otp-resend">
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
        </form>
      </div>
    </Phone>
  );
};

/* -------------------------------------------------------------------------- */
/*  KYC wizard                                                                 */
/* -------------------------------------------------------------------------- */

const KYC_STEPS = [
  { key: "personal",  label: "About you",         icon: User },
  { key: "id",        label: "Identity",          icon: IdCard },
  { key: "licence",   label: "Driving licence",   icon: ScanLine },
  { key: "selfie",    label: "Selfie",            icon: Camera },
  { key: "vehicle",   label: "Vehicle",           icon: Car },
  { key: "bank",      label: "Bank",              icon: Wallet },
  { key: "emergency", label: "Emergency contact", icon: PhoneIcon },
];

const KycProgress = ({ step }) => {
  const idx = KYC_STEPS.findIndex((s) => s.key === step);
  const pct = ((idx + 1) / KYC_STEPS.length) * 100;
  return (
    <div className="px-6 pt-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40 mb-2">
        <span>Step {idx + 1} of {KYC_STEPS.length}</span>
        <span>{KYC_STEPS[idx]?.label}</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #FFB454, #FF7A00)" }} />
      </div>
    </div>
  );
};

const useSaveStep = (stepKey) => {
  const { setDriver } = useDriver();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const save = async (data, opts = {}) => {
    setBusy(true);
    try {
      const res = await driverApi.patch("/driver/me/kyc", { step: stepKey, data });
      setDriver(res.data);
      const nextStep = res.data.kyc_step;
      if (opts.submit) {
        const sub = await driverApi.post("/driver/me/submit");
        setDriver(sub.data);
        nav("/driver/kyc/submitted");
      } else if (nextStep === "submitted") {
        // Wizard complete but not auto-submitting
        nav("/driver/kyc/emergency");
      } else {
        nav(`/driver/kyc/${nextStep}`);
      }
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };
  return [save, busy];
};

const StepPersonal = () => {
  const { driver } = useDriver();
  const [name, setName]   = useState(driver?.name || "");
  const [email, setEmail] = useState(driver?.email || "");
  const [save, busy] = useSaveStep("personal");
  return (
    <Phone>
      <Header title="About you" />
      <KycProgress step="personal" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-personal">
        <h1 className="text-2xl font-bold">Tell us your name</h1>
        <p className="text-white/60 -mt-2">This is what customers see on your delivery.</p>
        <TextField label="Full name" testid="kyc-personal-name" placeholder="e.g. Rohan Sharma" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextField label="Email (optional)" testid="kyc-personal-email" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="pt-4">
          <PrimaryButton onClick={() => name.trim() ? save({ name: name.trim(), email: email.trim() || null }) : toast.error("Enter your name")}
                         busy={busy} data-testid="kyc-personal-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const ID_TYPES = {
  IN: [{ v: "aadhaar", l: "Aadhaar" }, { v: "pan", l: "PAN" }, { v: "passport", l: "Passport" }],
  CI: [{ v: "cni", l: "CNI" }, { v: "passport", l: "Passport" }],
};

const StepId = () => {
  const { driver } = useDriver();
  const [type, setType]     = useState(driver?.gov_id_type || (driver?.country === "IN" ? "aadhaar" : "cni"));
  const [number, setNumber] = useState("");
  const [frontUrl, setFrontUrl] = useState(driver?.gov_id_front_url || "");
  const [uploading, setUploading] = useState(false);
  const [save, busy] = useSaveStep("id");
  const types = ID_TYPES[driver?.country] || ID_TYPES.IN;

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("kind", "gov_id_front");
    setUploading(true);
    try { const res = await driverApi.post("/driver/me/upload", fd); setFrontUrl(res.data.file_url); toast.success("Uploaded"); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setUploading(false); }
  };

  return (
    <Phone>
      <Header title="Identity" />
      <KycProgress step="id" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-id">
        <h1 className="text-2xl font-bold">Verify your identity</h1>
        <p className="text-white/60 -mt-2">Choose an ID type and upload a clear photo.</p>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">ID type</div>
          <div className="grid grid-cols-3 gap-2">
            {types.map((t) => (
              <button key={t.v} onClick={() => setType(t.v)} data-testid={`kyc-id-type-${t.v}`}
                className={`h-12 rounded-xl border text-sm ${type === t.v ? "border-orange-500 bg-orange-500/10 text-white" : "border-white/10 bg-white/5 text-white/70"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <TextField label="ID number" testid="kyc-id-number" placeholder="Number on the document"
                   value={number} onChange={(e) => setNumber(e.target.value)} />
        <UploadField label="Front of ID" fileUrl={frontUrl} onChange={onFile} uploading={uploading} testid="kyc-id-front" />
        <div className="pt-4">
          <PrimaryButton onClick={() => (!number.trim() || !frontUrl)
                    ? toast.error("Complete both the ID number and photo")
                    : save({ gov_id_type: type, gov_id_number: number.trim(), gov_id_front_url: frontUrl })}
                busy={busy} data-testid="kyc-id-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const UploadField = ({ label, fileUrl, onChange, uploading, testid }) => (
  <div>
    <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">{label}</div>
    <label className={`block rounded-2xl border border-dashed border-white/20 bg-white/5 h-40 grid place-items-center cursor-pointer overflow-hidden ${uploading ? "opacity-70" : ""}`}
           data-testid={testid}>
      {fileUrl ? (
        <img src={`${process.env.REACT_APP_BACKEND_URL}${fileUrl}`} alt={label} className="w-full h-full object-cover" />
      ) : uploading ? (
        <Loader2 className="animate-spin" size={22} />
      ) : (
        <div className="text-center">
          <Upload size={22} className="mx-auto mb-2 text-white/60" />
          <div className="text-sm text-white/80">Tap to upload</div>
          <div className="text-[11px] text-white/40 mt-1">JPG, PNG · 8 MB max</div>
        </div>
      )}
      <input type="file" accept="image/*" hidden onChange={onChange} data-testid={`${testid}-input`} />
    </label>
  </div>
);

const StepLicence = () => {
  const { driver } = useDriver();
  const [number,  setNumber]  = useState("");
  const [expiry,  setExpiry]  = useState("");
  const [frontUrl, setFrontUrl] = useState(driver?.licence_front_url || "");
  const [uploading, setUploading] = useState(false);
  const [save, busy] = useSaveStep("licence");
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("kind", "licence_front");
    setUploading(true);
    try { const res = await driverApi.post("/driver/me/upload", fd); setFrontUrl(res.data.file_url); toast.success("Uploaded"); }
    catch (err) { toast.error(errMsg(err)); } finally { setUploading(false); }
  };
  return (
    <Phone>
      <Header title="Driving licence" />
      <KycProgress step="licence" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-licence">
        <h1 className="text-2xl font-bold">Your driving licence</h1>
        <TextField label="Licence number" testid="kyc-licence-number" value={number} onChange={(e) => setNumber(e.target.value)} />
        <TextField label="Expiry date" testid="kyc-licence-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <UploadField label="Front of licence" fileUrl={frontUrl} onChange={onFile} uploading={uploading} testid="kyc-licence-front" />
        <div className="pt-4">
          <PrimaryButton
            onClick={() => (!number.trim() || !expiry || !frontUrl)
              ? toast.error("Fill in number, expiry and upload")
              : save({ licence_number: number.trim(), licence_expiry: expiry, licence_front_url: frontUrl })}
            busy={busy} data-testid="kyc-licence-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const StepSelfie = () => {
  const { driver } = useDriver();
  const [url, setUrl] = useState(driver?.selfie_url || "");
  const [uploading, setUploading] = useState(false);
  const [save, busy] = useSaveStep("selfie");
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("kind", "selfie");
    setUploading(true);
    try { const res = await driverApi.post("/driver/me/upload", fd); setUrl(res.data.file_url); toast.success("Uploaded"); }
    catch (err) { toast.error(errMsg(err)); } finally { setUploading(false); }
  };
  return (
    <Phone>
      <Header title="Selfie" />
      <KycProgress step="selfie" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-selfie">
        <h1 className="text-2xl font-bold">Take a clear selfie</h1>
        <p className="text-white/60 -mt-2">Look straight, no cap or sunglasses.</p>
        <UploadField label="Selfie" fileUrl={url} onChange={onFile} uploading={uploading} testid="kyc-selfie-photo" />
        <div className="pt-4">
          <PrimaryButton onClick={() => (url ? save({ selfie_url: url }) : toast.error("Upload a selfie"))} busy={busy} data-testid="kyc-selfie-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const VEHICLES = [
  { v: "bike",       l: "Bike",         icon: Bike },
  { v: "scooter",    l: "Scooter",      icon: Bike },
  { v: "tricycle",   l: "Tricycle",     icon: Truck },
  { v: "mini_truck", l: "Mini truck",   icon: Truck },
  { v: "big_truck",  l: "Big truck",    icon: Truck },
];

const StepVehicle = () => {
  const { driver } = useDriver();
  const [type,  setType]  = useState(driver?.vehicle_type || "bike");
  const [plate, setPlate] = useState("");
  const [save, busy] = useSaveStep("vehicle");
  return (
    <Phone>
      <Header title="Vehicle" />
      <KycProgress step="vehicle" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-vehicle">
        <h1 className="text-2xl font-bold">Your ride</h1>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Vehicle type</div>
          <div className="grid grid-cols-2 gap-3">
            {VEHICLES.map(({ v, l, icon: Icon }) => (
              <button key={v} onClick={() => setType(v)} data-testid={`kyc-vehicle-${v}`}
                className={`h-16 rounded-2xl border flex items-center gap-3 px-4 ${type === v ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/5"}`}>
                <Icon size={20} />
                <span className="text-sm">{l}</span>
              </button>
            ))}
          </div>
        </div>
        <TextField label="Registration number" testid="kyc-vehicle-plate" placeholder="e.g. DL 8C AB 1234"
                   value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
        <div className="pt-4">
          <PrimaryButton onClick={() => plate.trim() ? save({ vehicle_type: type, vehicle_plate: plate.trim() }) : toast.error("Enter your plate")}
                         busy={busy} data-testid="kyc-vehicle-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const StepBank = () => {
  const { driver } = useDriver();
  const [holder, setHolder] = useState(driver?.bank_account_holder || "");
  const [number, setNumber] = useState("");
  const [ifsc, setIfsc]     = useState("");
  const [save, busy] = useSaveStep("bank");
  return (
    <Phone>
      <Header title="Bank" />
      <KycProgress step="bank" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-bank">
        <h1 className="text-2xl font-bold">Where should we pay you?</h1>
        <TextField label="Account holder name" testid="kyc-bank-holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
        <TextField label="Account number" testid="kyc-bank-number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
        <TextField label="IFSC / SWIFT" testid="kyc-bank-ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
        <div className="pt-4">
          <PrimaryButton
            onClick={() => (!holder.trim() || !number.trim() || !ifsc.trim())
              ? toast.error("Fill in every bank field")
              : save({ bank_account_holder: holder.trim(), bank_account_number: number.trim(), bank_ifsc_or_swift: ifsc.trim() })}
            busy={busy} data-testid="kyc-bank-next">Continue</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const StepEmergency = () => {
  const { driver } = useDriver();
  const [name,  setName]  = useState(driver?.emergency_contact_name  || "");
  const [phone, setPhone] = useState(driver?.emergency_contact_phone || "");
  const [save, busy] = useSaveStep("emergency");
  return (
    <Phone>
      <Header title="Emergency contact" />
      <KycProgress step="emergency" />
      <div className="px-6 pt-8 space-y-4" data-testid="driver-kyc-emergency">
        <h1 className="text-2xl font-bold">One last thing</h1>
        <p className="text-white/60 -mt-2">Someone we can call if you need help on a delivery.</p>
        <TextField label="Contact name" testid="kyc-em-name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Contact phone" testid="kyc-em-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="pt-4">
          <PrimaryButton
            onClick={() => (!name.trim() || !phone.trim())
              ? toast.error("Fill in both fields")
              : save({ emergency_contact_name: name.trim(), emergency_contact_phone: phone.trim() }, { submit: true })}
            busy={busy} data-testid="kyc-em-submit">Submit application</PrimaryButton>
        </div>
      </div>
    </Phone>
  );
};

const StepSubmitted = () => {
  const { driver, logout } = useDriver();
  const nav = useNavigate();
  return (
    <Phone>
      <div className="min-h-screen flex flex-col items-center px-6 pt-24 pb-10" data-testid="driver-kyc-submitted">
        <div className="w-24 h-24 rounded-full grid place-items-center mb-8"
             style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)", boxShadow: "0 30px 60px -20px rgba(255,122,0,0.6)" }}>
          <Clock size={40} color="#000" />
        </div>
        <h1 className="text-3xl font-bold text-center">Application received</h1>
        <p className="text-white/60 text-center max-w-xs mt-3">
          {driver?.status === "rejected"
            ? "Your last submission needs a small update. We've sent the reviewer's notes to your registered phone."
            : "Our team is reviewing your details. We'll ping you as soon as you're approved — usually within 24 hours."}
        </p>
        <div className="mt-8 w-full">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Current status</div>
            <div className="text-lg font-semibold capitalize">
              {(driver?.status || "pending_review").replaceAll("_", " ")}
            </div>
            {driver?.reviewer_notes && (
              <div className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70">{driver.reviewer_notes}</div>
            )}
          </GlassCard>
        </div>
        <div className="mt-auto w-full flex flex-col gap-3">
          <button onClick={() => nav("/driver/dashboard")} className="text-sm text-white/60" data-testid="driver-submitted-continue">
            Check dashboard →
          </button>
          <button onClick={() => { logout(); nav("/driver/login"); }} className="text-xs text-white/40" data-testid="driver-submitted-logout">
            Sign out
          </button>
        </div>
      </div>
    </Phone>
  );
};

/* -------------------------------------------------------------------------- */
/*  Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

const DashboardPage = () => {
  const { driver, setDriver, logout } = useDriver();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await driverApi.get("/driver/me/dashboard"); setSummary(data); }
    catch (err) { toast.error(errMsg(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleOnline = async () => {
    if (driver?.status !== "approved") {
      toast.error("You can go online once your account is approved.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await driverApi.post("/driver/me/online", { is_online: !driver.is_online });
      setDriver({ ...driver, is_online: data.is_online });
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const isApproved = driver?.status === "approved";
  const online = driver?.is_online;
  const cur = summary?.today?.earnings?.currency === "INR" ? "₹" : "";
  const amt = summary?.today?.earnings?.amount ?? 0;

  return (
    <Phone>
      <div className="px-6 pt-8 pb-24" data-testid="driver-dashboard">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-orange-500">SENDbakēd · Driver</div>
            <h1 className="text-2xl font-bold mt-2">Hey {driver?.name?.split(" ")[0] || "Driver"} 👋</h1>
          </div>
          <button onClick={() => { logout(); nav("/driver/login"); }} className="w-10 h-10 grid place-items-center rounded-full bg-white/5 border border-white/10"
                  data-testid="driver-dashboard-logout" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>

        {/* Online toggle */}
        <button onClick={toggleOnline} disabled={busy}
                data-testid="driver-online-toggle"
                className={`w-full mt-8 rounded-3xl p-6 border transition-all
                            ${online ? "border-orange-500/60 bg-gradient-to-br from-orange-500/20 to-orange-500/5"
                                    : "border-white/10 bg-white/[0.03]"}`}>
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-[11px] uppercase tracking-widest text-white/50">Availability</div>
              <div className="text-xl font-bold mt-1">
                {isApproved ? (online ? "You're online" : "Go online") : "Waiting for approval"}
              </div>
              <div className="text-xs text-white/50 mt-1">
                {isApproved ? (online ? "You\u2019ll receive delivery requests here." : "Tap to start earning.") : "You can go online once approved."}
              </div>
            </div>
            <div className={`w-16 h-9 rounded-full flex items-center transition-all ${online ? "bg-orange-500 justify-end" : "bg-white/10 justify-start"} p-1`}>
              <span className="w-7 h-7 rounded-full bg-white shadow" />
            </div>
          </div>
        </button>

        {/* Today card */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Today&apos;s earnings</div>
            <div className="text-3xl font-bold mt-2" data-testid="driver-earnings-today">{cur}{amt.toLocaleString()}</div>
            <div className="text-[11px] text-white/50 mt-1">{summary?.today?.earnings?.trips ?? 0} trips</div>
          </GlassCard>
          <GlassCard>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Current area</div>
            <div className="flex items-center gap-2 mt-2">
              <MapPin size={16} className="text-orange-500" />
              <div className="text-base font-semibold">{summary?.current_area || "—"}</div>
            </div>
            <div className="text-[11px] text-white/50 mt-1">GPS auto-detected</div>
          </GlassCard>
        </div>

        {/* Status card */}
        {!isApproved && (
          <div className="mt-6 rounded-3xl p-5 border border-orange-500/30 bg-orange-500/5" data-testid="driver-status-banner">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/15 text-orange-500 grid place-items-center"><ShieldCheck size={18} /></div>
              <div>
                <div className="text-sm font-semibold capitalize">{driver.status.replaceAll("_", " ")}</div>
                <div className="text-[11px] text-white/60">
                  {driver.status === "pending_review" ? "We're reviewing your application." :
                   driver.status === "rejected"       ? "Update your details and resubmit." :
                                                        "Finish your onboarding to start earning."}
                </div>
              </div>
            </div>
            {driver.status !== "pending_review" && (
              <button onClick={() => nav(`/driver/kyc/${driver.kyc_step || "personal"}`)}
                      className="mt-4 w-full h-11 rounded-xl bg-white/5 border border-white/10 text-sm"
                      data-testid="driver-continue-kyc">
                Continue onboarding →
              </button>
            )}
          </div>
        )}

        {/* Coming soon strip */}
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Coming next</div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[
              { icon: Package, label: "Delivery requests" },
              { icon: Star,    label: "Incentives" },
              { icon: Wallet,  label: "Withdraw payouts" },
            ].map((c, i) => (
              <div key={i} className="min-w-[140px] rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                <c.icon size={18} className="text-orange-500" />
                <div className="text-xs font-medium mt-2">{c.label}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Slice 2</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Phone>
  );
};

/* -------------------------------------------------------------------------- */
/*  App                                                                        */
/* -------------------------------------------------------------------------- */

const NeedsAuth = ({ children }) => {
  const { driver, loading } = useDriver();
  if (loading) return <Phone><div className="h-screen grid place-items-center"><Loader2 className="animate-spin" size={22} /></div></Phone>;
  if (!driver) return <Navigate to="/driver/login" replace />;
  return children;
};

export const DriverApp = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "SENDbakēd Driver";
    // Force dark theme + status bar hint for the phone
    document.documentElement.style.background = "#000";
    return () => { document.title = prev; document.documentElement.style.background = ""; };
  }, []);

  return (
    <DriverProvider>
      <Routes>
        <Route path=""              element={<Gate />} />
        <Route path="onboarding"    element={<OnboardingPage />} />
        <Route path="login"         element={<LoginPage />} />
        <Route path="otp"           element={<OtpPage />} />
        <Route path="kyc/personal"  element={<NeedsAuth><StepPersonal /></NeedsAuth>} />
        <Route path="kyc/id"        element={<NeedsAuth><StepId /></NeedsAuth>} />
        <Route path="kyc/licence"   element={<NeedsAuth><StepLicence /></NeedsAuth>} />
        <Route path="kyc/selfie"    element={<NeedsAuth><StepSelfie /></NeedsAuth>} />
        <Route path="kyc/vehicle"   element={<NeedsAuth><StepVehicle /></NeedsAuth>} />
        <Route path="kyc/bank"      element={<NeedsAuth><StepBank /></NeedsAuth>} />
        <Route path="kyc/emergency" element={<NeedsAuth><StepEmergency /></NeedsAuth>} />
        <Route path="kyc/submitted" element={<NeedsAuth><StepSubmitted /></NeedsAuth>} />
        <Route path="dashboard"     element={<NeedsAuth><DashboardPage /></NeedsAuth>} />
        <Route path="*"             element={<Navigate to="/driver" replace />} />
      </Routes>
    </DriverProvider>
  );
};

export default DriverApp;
