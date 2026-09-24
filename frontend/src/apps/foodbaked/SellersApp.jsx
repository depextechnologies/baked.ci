/**
 * FOODbakēd — Sellers / Onboarding Portal (`/foodbaked/sellers/*`).
 *
 * Public entrypoint for prospective restaurant partners. Flow:
 *   1. Landing / value-prop  →  Postuler / Apply
 *   2. Sign-up (email + phone → dual OTP → applicant JWT)
 *   3. Resumable wizard (6 steps):
 *        1) Restaurant details
 *        2) Documents (upload + status)
 *        3) Timing (prep-time + opening hours)
 *        4) Menu & Cuisines
 *        5) Bank Details (country-scoped)
 *        6) Review & Submit
 *   4. Dashboard: status + next-action
 *
 * Applicants can log OUT and log back in with **phone + OTP**.
 * Approval creates the FOOD partner + emails an activation link — the
 * partner then signs into the existing `/partner/food/*` portal.
 *
 * FR-first / EN-second labels throughout.
 */
import React, { useCallback, useEffect, useMemo, useState, createContext, useContext } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  Utensils, Phone, Mail, LogIn, LogOut, ChevronLeft, ChevronRight, Loader2, Upload,
  CheckCircle2, AlertTriangle, FileText, Clock, Banknote, Sparkles, ArrowRight, Shield,
  Store, XCircle, RefreshCw, Trash2, ClipboardCheck,
} from "lucide-react";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;
const GREEN = "#00A651";
const STORAGE_KEY = "food_applicant_token";

const sellerApi = axios.create({ baseURL: API_BASE });
sellerApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(STORAGE_KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const errMsg = (e) => e?.response?.data?.detail || e?.message || "Erreur · Error";

// ---------------------------------------------------------------------------
// Applicant auth context
// ---------------------------------------------------------------------------

const AuthCtx = createContext(null);
const useAuth = () => {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
};

const AuthProvider = ({ children }) => {
  const [data, setData] = useState(null);     // {application, documents, bank, doc_requirements}
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem(STORAGE_KEY);
    if (!t) { setData(null); setChecking(false); return; }
    try {
      const { data } = await sellerApi.get("/food/apply/me");
      setData(data);
    } catch { localStorage.removeItem(STORAGE_KEY); setData(null); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback((token) => {
    localStorage.setItem(STORAGE_KEY, token);
    return refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setData(null);
  }, []);

  return <AuthCtx.Provider value={{ data, checking, refresh, login, logout }}>{children}</AuthCtx.Provider>;
};

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

const Btn = ({ children, className = "", variant = "primary", ...rest }) => {
  const styles = {
    primary: `text-white`,
    ghost:   "bg-secondary hover:bg-secondary/80 text-foreground",
    outline: "border border-border hover:bg-secondary text-foreground",
    danger:  "bg-red-500/10 text-red-500 hover:bg-red-500/20",
  }[variant];
  const inline = variant === "primary" ? { backgroundColor: GREEN } : undefined;
  return <button {...rest} style={{ ...inline, ...(rest.style || {}) }} className={`h-10 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${styles} ${className}`}>{children}</button>;
};

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    {children}
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </label>
);

const Input = (p) => <input {...p} className={`h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm ${p.className || ""}`} />;
const Select = (p) => <select {...p} className={`h-10 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm ${p.className || ""}`}>{p.children}</select>;

const Card = ({ children, className = "", testId }) => (
  <div data-testid={testId} className={`rounded-2xl border border-border bg-card ${className}`}>{children}</div>
);

const ProgressBar = ({ value, total }) => (
  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
    <div className="h-full rounded-full transition-all" style={{ width: `${(value / total) * 100}%`, backgroundColor: GREEN }} />
  </div>
);

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

const Landing = () => {
  const { data, checking } = useAuth();
  const nav = useNavigate();
  if (checking) return <FullPageLoader />;
  return (
    <div className="min-h-screen bg-white text-gray-900" data-testid="sellers-landing">
      <TopBar />
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
              <Utensils size={12} /> FOOD<span style={{ color: GREEN }}>bakēd</span> · Partenaires · Partners
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Ouvrez votre restaurant sur <span style={{ color: GREEN }}>FOODbakēd</span>.
              <br />
              <span className="text-gray-500 text-2xl md:text-3xl font-semibold">Open your restaurant on FOODbakēd.</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600 max-w-lg">
              Rejoignez la plateforme préférée des gourmets en Côte d'Ivoire — livraison rapide, paiements sécurisés et pilotage complet depuis votre portail. · Join the food-lovers' favourite platform — fast delivery, secure payouts, full control from your portal.
            </p>
            <div className="flex flex-wrap gap-3">
              <Btn onClick={() => nav(data ? "/foodbaked/sellers/dashboard" : "/foodbaked/sellers/apply")} data-testid="sellers-apply-cta">
                {data ? <>Continuer ma demande · Continue <ArrowRight size={14} /></> : <>Postuler maintenant · Apply now <ArrowRight size={14} /></>}
              </Btn>
              {!data && (
                <Btn variant="outline" onClick={() => nav("/foodbaked/sellers/login")} data-testid="sellers-login-cta">
                  <LogIn size={14} /> Se connecter · Sign in
                </Btn>
              )}
            </div>
            <div className="text-xs text-gray-500">Déjà partenaire ? <Link to="/partner/food/login" className="underline" style={{ color: GREEN }}>Accéder au portail partenaire · Partner portal →</Link></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Sparkles, t: "Zéro frais d'entrée", s: "No signup fee" },
              { icon: Store,    t: "Portail dédié",        s: "Dedicated portal" },
              { icon: Shield,   t: "Paiements sécurisés",  s: "Secure payouts" },
              { icon: Clock,    t: "Support 7j/7",         s: "7-day support" },
            ].map(({ icon: I, t, s }, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 p-5 bg-white">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${GREEN}18`, color: GREEN }}><I size={20} /></div>
                <div className="font-semibold text-sm">{t}</div>
                <div className="text-xs text-gray-500">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const TopBar = () => (
  <div className="h-14 border-b border-gray-100 flex items-center px-6 max-w-6xl mx-auto w-full">
    <Link to="/foodbaked/sellers" className="font-bold text-lg">FOOD<span style={{ color: GREEN }}>bakēd</span></Link>
    <span className="ml-3 text-[10px] uppercase tracking-widest text-gray-500">Portail des partenaires · Partner Portal</span>
    <div className="ml-auto text-xs text-gray-500 flex items-center gap-3">
      <Link to="/Sell-on-baked" className="hover:text-gray-900">← Retour · Back</Link>
    </div>
  </div>
);

const FullPageLoader = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    <Loader2 className="animate-spin mr-2" size={16} /> Chargement · Loading…
  </div>
);

// ---------------------------------------------------------------------------
// Signup (email + phone dual OTP)
// ---------------------------------------------------------------------------

const SignupPage = () => {
  const { data, login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ applicant_name: "", email: "", phone: "", country: "CI" });
  const [ec, setEc] = useState("");
  const [pc, setPc] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [phoneSent, setPhoneSent] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [devPhone, setDevPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (data) return <Navigate to="/foodbaked/sellers/dashboard" replace />;

  const sendOtp = async (channel, target, purpose, setSent, setDev) => {
    setErr(""); setBusy(true);
    try {
      const { data } = await sellerApi.post("/food/apply/otp/request", { channel, target, purpose });
      setSent(true);
      if (data.dev_code) setDev(data.dev_code);
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const { data } = await sellerApi.post("/food/apply/signup", {
        ...form, email_code: ec, phone_code: pc,
      });
      await login(data.access_token);
      nav("/foodbaked/sellers/dashboard", { replace: true });
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen bg-secondary/30" data-testid="sellers-signup">
      <TopBar />
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Étape 0/6 · Sign-up</div>
          <h1 className="text-2xl font-bold">Créer votre demande · Start your application</h1>
          <p className="text-sm text-muted-foreground">Nous vérifions votre e-mail et votre numéro par OTP pour sécuriser votre compte. · We verify your email and phone number via OTP.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Card className="p-4 space-y-3">
            <Field label="Nom complet · Full name">
              <Input value={form.applicant_name} onChange={set("applicant_name")} required data-testid="signup-name" />
            </Field>
            <Field label="Pays · Country">
              <Select value={form.country} onChange={set("country")} data-testid="signup-country">
                <option value="CI">Côte d'Ivoire · CI</option>
                <option value="IN">Inde · India · IN</option>
                <option value="LR">Libéria · Liberia · LR</option>
              </Select>
            </Field>
          </Card>

          {/* Email + OTP */}
          <Card className="p-4 space-y-3">
            <Field label="E-mail · Email" hint="Nous enverrons un code à 6 chiffres · We'll send a 6-digit code">
              <div className="flex gap-2">
                <Input type="email" value={form.email} onChange={set("email")} required data-testid="signup-email" />
                <Btn type="button" variant="outline" disabled={!form.email || busy} onClick={() => sendOtp("email", form.email.toLowerCase(), "signup_email", setEmailSent, setDevEmail)} data-testid="signup-email-send"><Mail size={14} /> {emailSent ? "Renvoyer" : "Envoyer"}</Btn>
              </div>
            </Field>
            {emailSent && (
              <Field label={`Code e-mail · Email code${devEmail ? ` (dev: ${devEmail})` : ""}`}>
                <Input value={ec} onChange={(e) => setEc(e.target.value)} required maxLength={6} inputMode="numeric" data-testid="signup-email-code" />
              </Field>
            )}
          </Card>

          {/* Phone + OTP */}
          <Card className="p-4 space-y-3">
            <Field label="Téléphone (E.164) · Phone" hint="Format international, ex : +2250700000000">
              <div className="flex gap-2">
                <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="+225…" required data-testid="signup-phone" />
                <Btn type="button" variant="outline" disabled={!form.phone || busy} onClick={() => sendOtp("phone", form.phone, "signup_phone", setPhoneSent, setDevPhone)} data-testid="signup-phone-send"><Phone size={14} /> {phoneSent ? "Renvoyer" : "Envoyer"}</Btn>
              </div>
            </Field>
            {phoneSent && (
              <Field label={`Code SMS · SMS code${devPhone ? ` (dev: ${devPhone})` : ""}`}>
                <Input value={pc} onChange={(e) => setPc(e.target.value)} required maxLength={6} inputMode="numeric" data-testid="signup-phone-code" />
              </Field>
            )}
          </Card>

          {err && <div className="text-xs text-red-500 inline-flex items-center gap-1"><AlertTriangle size={12} /> {err}</div>}
          <Btn type="submit" className="w-full" disabled={busy || !ec || !pc} data-testid="signup-submit">
            {busy && <Loader2 size={14} className="animate-spin" />} Créer mon compte · Create account
          </Btn>
          <div className="text-xs text-center text-muted-foreground">Déjà inscrit ? <Link to="/foodbaked/sellers/login" className="underline">Se connecter · Sign in</Link></div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Phone + OTP login (existing applicants)
// ---------------------------------------------------------------------------

const LoginPage = () => {
  const { data, login } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (data) return <Navigate to="/foodbaked/sellers/dashboard" replace />;

  const send = async () => {
    setErr(""); setBusy(true);
    try {
      const { data } = await sellerApi.post("/food/apply/login/request-otp", { phone });
      setSent(true);
      if (data.dev_code) setDev(data.dev_code);
      else if (data.channel === "no-account") setErr("Aucun compte trouvé pour ce numéro · No account for this number");
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const { data } = await sellerApi.post("/food/apply/login/verify-otp", { phone, code });
      await login(data.access_token);
      nav("/foodbaked/sellers/dashboard", { replace: true });
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-secondary/30" data-testid="sellers-login">
      <TopBar />
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Se connecter · Sign in</h1>
        <p className="text-sm text-muted-foreground">Suivez votre demande avec votre numéro de téléphone. · Track your application with your phone number.</p>
        <form onSubmit={sent ? verify : (e) => { e.preventDefault(); send(); }} className="space-y-3">
          <Field label="Téléphone · Phone (E.164)">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+225…" data-testid="login-phone" />
          </Field>
          {sent && (
            <Field label={`Code SMS${dev ? ` (dev: ${dev})` : ""}`}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={6} inputMode="numeric" data-testid="login-code" />
            </Field>
          )}
          {err && <div className="text-xs text-red-500">{err}</div>}
          <Btn type="submit" className="w-full" disabled={busy} data-testid={sent ? "login-verify" : "login-send"}>
            {busy && <Loader2 size={14} className="animate-spin" />} {sent ? "Se connecter · Sign in" : "Envoyer le code · Send code"}
          </Btn>
          <div className="text-xs text-center text-muted-foreground">Pas de compte ? <Link to="/foodbaked/sellers/apply" className="underline">Postuler · Apply</Link></div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Portal shell — needs auth
// ---------------------------------------------------------------------------

const PortalLayout = () => {
  const { data, checking, logout } = useAuth();
  if (checking) return <FullPageLoader />;
  if (!data) return <Navigate to="/foodbaked/sellers/login" replace />;

  return (
    <div className="min-h-screen bg-secondary/30" data-testid="sellers-portal">
      <div className="h-14 border-b border-border bg-card flex items-center px-6">
        <Link to="/foodbaked/sellers/dashboard" className="font-bold text-lg">FOOD<span style={{ color: GREEN }}>bakēd</span></Link>
        <span className="ml-3 text-[10px] uppercase tracking-widest text-muted-foreground">Ma demande · My application</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground truncate max-w-[220px]">{data.application.applicant_email}</span>
          <button onClick={logout} data-testid="portal-logout" className="h-8 px-3 rounded-lg bg-secondary hover:bg-red-500/10 hover:text-red-500 inline-flex items-center gap-1 text-xs"><LogOut size={12} /> Déconnexion</button>
        </div>
      </div>
      <main className="max-w-4xl mx-auto p-6"><Outlet /></main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard — status + next step
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  draft:            { fr: "Brouillon",       en: "Draft",        color: "#71717a", icon: FileText },
  submitted:        { fr: "Soumis",          en: "Submitted",    color: "#3b82f6", icon: ClipboardCheck },
  under_review:     { fr: "En cours d'examen", en: "Under review", color: "#f59e0b", icon: Loader2 },
  needs_correction: { fr: "Corrections demandées", en: "Needs correction", color: "#f97316", icon: RefreshCw },
  approved:         { fr: "Approuvé",        en: "Approved",     color: "#00A651", icon: CheckCircle2 },
  rejected:         { fr: "Rejeté",           en: "Rejected",     color: "#ef4444", icon: XCircle },
};

const STEPS = [
  { n: 1, key: "restaurant_details", fr: "Détails du restaurant", en: "Restaurant details" },
  { n: 2, key: "documents",          fr: "Documents",              en: "Documents" },
  { n: 3, key: "timing",             fr: "Horaires",               en: "Timing" },
  { n: 4, key: "menu_cuisines",      fr: "Menu & Cuisines",        en: "Menu & Cuisines" },
  { n: 5, key: "bank",               fr: "Informations bancaires", en: "Bank details" },
  { n: 6, key: "review",             fr: "Vérifier & Soumettre",   en: "Review & Submit" },
];


const Dashboard = () => {
  const { data } = useAuth();
  const app = data.application;
  const status = STATUS_LABELS[app.status] || STATUS_LABELS.draft;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6" data-testid="sellers-dashboard">
      <div>
        <h1 className="text-2xl font-bold">Bonjour {app.applicant_name || app.applicant_email}</h1>
        <p className="text-sm text-muted-foreground">Suivez et complétez votre demande FOODbakēd. · Track and complete your FOODbakēd application.</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${status.color}22`, color: status.color }}>
              <StatusIcon size={22} className={app.status === "under_review" ? "animate-spin" : ""} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Statut · Status</div>
              <div className="font-bold" data-testid="dashboard-status" style={{ color: status.color }}>
                {status.fr} · {status.en}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Étape {Math.min(app.current_step, 6)} sur 6 · Step {Math.min(app.current_step, 6)} of 6</div>
        </div>
        <div className="mt-3"><ProgressBar value={Math.min(app.current_step, 6)} total={6} /></div>
        {app.status === "needs_correction" && app.correction_notes && (
          <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-700" data-testid="dashboard-correction-notes">
            <div className="font-semibold mb-1 inline-flex items-center gap-1"><AlertTriangle size={12} /> Corrections demandées · Corrections requested</div>
            {app.correction_notes}
          </div>
        )}
        {app.status === "rejected" && app.decision_notes && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            <div className="font-semibold mb-1">Motif · Reason</div>{app.decision_notes}
          </div>
        )}
        {app.status === "approved" && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-700">
            Votre restaurant est approuvé ! Consultez votre e-mail pour activer votre portail partenaire. · Your restaurant is approved — check your email to activate the partner portal.
          </div>
        )}
      </Card>

      {app.status !== "approved" && (
        <div>
          <div className="text-sm font-semibold mb-3">Étapes · Steps</div>
          <div className="grid gap-3 md:grid-cols-2">
            {STEPS.map((s) => {
              const done = app.current_step > s.n || app.status === "submitted" || app.status === "under_review";
              const to   = `/foodbaked/sellers/apply/step-${s.n}`;
              return (
                <Link key={s.n} to={to} data-testid={`dashboard-step-${s.n}`} className="rounded-2xl border border-border p-4 bg-card hover:bg-secondary/40 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${done ? "text-white" : "bg-secondary text-muted-foreground"}`} style={done ? { backgroundColor: GREEN } : undefined}>
                    {done ? <CheckCircle2 size={16} /> : s.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.fr}</div>
                    <div className="text-[11px] text-muted-foreground">{s.en}</div>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

const WizardShell = ({ step, children, canAdvance = true, onSave, onAdvance, onBack, saving, isLast }) => {
  const { data } = useAuth();
  const app = data.application;
  const readOnly = ["submitted", "under_review", "approved", "rejected"].includes(app.status);
  return (
    <div className="space-y-5" data-testid={`wizard-step-${step.n}`}>
      <Link to="/foodbaked/sellers/dashboard" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ChevronLeft size={12} /> Tableau de bord · Dashboard</Link>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Étape {step.n} sur 6 · Step {step.n} of 6</div>
        <h1 className="text-2xl font-bold">{step.fr} <span className="text-muted-foreground text-lg font-medium">· {step.en}</span></h1>
        <div className="mt-2"><ProgressBar value={step.n} total={6} /></div>
      </div>
      {readOnly && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 inline-flex items-center gap-2 w-full">
          <Shield size={12} /> Votre demande est {STATUS_LABELS[app.status].fr.toLowerCase()} — la modification est verrouillée. · Application is {app.status} — editing is locked.
        </div>
      )}
      <div>{children}</div>
      <div className="flex items-center justify-between gap-2 pt-4">
        {step.n > 1 ? <Btn variant="ghost" onClick={onBack} data-testid={`wizard-back-${step.n}`}><ChevronLeft size={14} /> Retour</Btn> : <div />}
        <div className="flex gap-2">
          {onSave && !readOnly && (
            <Btn variant="outline" onClick={onSave} disabled={saving} data-testid={`wizard-save-${step.n}`}>{saving && <Loader2 size={14} className="animate-spin" />} Enregistrer · Save draft</Btn>
          )}
          {!isLast && (
            <Btn onClick={onAdvance} disabled={!canAdvance || saving || readOnly} data-testid={`wizard-next-${step.n}`}>{saving && <Loader2 size={14} className="animate-spin" />} Suivant · Next <ChevronRight size={14} /></Btn>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 1 — Restaurant details
// ---------------------------------------------------------------------------

const Step1 = () => {
  const { data, refresh } = useAuth();
  const rd = data.application.restaurant_details || {};
  const [f, setF] = useState({ name: rd.name || "", address: rd.address || "", city: rd.city || "", phone: rd.phone || "", description: rd.description || "", cover_image: rd.cover_image || "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (advance) => {
    setSaving(true); setErr("");
    try {
      await sellerApi.put("/food/apply/step/1", { data: f, advance });
      await refresh();
      if (advance) nav("/foodbaked/sellers/apply/step-2");
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <WizardShell step={STEPS[0]} onSave={() => save(false)} onAdvance={() => save(true)} onBack={() => nav("/foodbaked/sellers/dashboard")} saving={saving} canAdvance={!!f.name && !!f.address}>
      <Card className="p-4 space-y-3">
        {err && <div className="text-xs text-red-500">{err}</div>}
        <Field label="Nom du restaurant · Restaurant name"><Input value={f.name} onChange={set("name")} required data-testid="step1-name" /></Field>
        <Field label="Adresse · Address"><Input value={f.address} onChange={set("address")} required data-testid="step1-address" /></Field>
        <Field label="Ville · City"><Input value={f.city} onChange={set("city")} data-testid="step1-city" /></Field>
        <Field label="Téléphone du restaurant · Phone"><Input value={f.phone} onChange={set("phone")} data-testid="step1-phone" /></Field>
        <Field label="Description · Description"><textarea value={f.description} onChange={set("description")} rows={3} className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm" data-testid="step1-description" /></Field>
      </Card>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Step 2 — Documents (upload + status per doc)
// ---------------------------------------------------------------------------

const DOC_ICON_STATUS = {
  pending:  { color: "#a1a1aa", label_fr: "En attente" },
  verified: { color: GREEN,      label_fr: "Vérifié"  },
  rejected: { color: "#ef4444", label_fr: "Rejeté"   },
};

const Step2 = () => {
  const { data, refresh } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(null);
  const readOnly = ["submitted", "under_review", "approved", "rejected"].includes(data.application.status);

  const uploadFor = async (docType, file) => {
    setErr(""); setUploading(docType);
    try {
      const fd = new FormData(); fd.append("file", file);
      await sellerApi.post(`/food/apply/documents?doc_type=${docType}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
    } catch (e) { setErr(errMsg(e)); }
    finally { setUploading(null); }
  };
  const remove = async (id) => {
    if (!window.confirm("Supprimer ce document ?")) return;
    try { await sellerApi.delete(`/food/apply/documents/${id}`); await refresh(); }
    catch (e) { setErr(errMsg(e)); }
  };

  const uploaded = (docType) => data.documents.filter((d) => d.doc_type === docType);
  const requiredMet = data.doc_requirements.filter((r) => r.is_required).every((r) => uploaded(r.doc_type).length > 0);

  return (
    <WizardShell step={STEPS[1]}
      onAdvance={async () => { await sellerApi.put("/food/apply/step/1", { data: data.application.restaurant_details || {}, advance: false, current_step: 3 }); await refresh(); nav("/foodbaked/sellers/apply/step-3"); }}
      onBack={() => nav("/foodbaked/sellers/apply/step-1")}
      canAdvance={requiredMet} isLast={false}
    >
      <Card className="p-4 space-y-4">
        {err && <div className="text-xs text-red-500">{err}</div>}
        {data.doc_requirements.map((r) => {
          const items = uploaded(r.doc_type);
          return (
            <div key={r.doc_type} className="border border-border rounded-lg p-3 space-y-2" data-testid={`step2-doc-${r.doc_type}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold"><span>{r.label_fr}</span> <span className="text-muted-foreground text-xs">· {r.label_en}</span> {r.is_required && <span className="text-[10px] text-red-500 ml-1">Obligatoire · Required</span>}</div>
                </div>
                {!readOnly && (
                  <label className="cursor-pointer h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-semibold inline-flex items-center gap-1">
                    <Upload size={12} /> <span>{uploading === r.doc_type ? "…" : "Téléverser · Upload"}</span>
                    <input type="file" accept="application/pdf,image/*" className="hidden" data-testid={`step2-upload-${r.doc_type}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFor(r.doc_type, f); e.target.value = ""; }} disabled={!!uploading} />
                  </label>
                )}
              </div>
              {items.length > 0 && (
                <ul className="space-y-1">
                  {items.map((d) => {
                    const s = DOC_ICON_STATUS[d.status];
                    return (
                      <li key={d.id} className="flex items-center gap-2 text-xs" data-testid={`step2-doc-file-${d.id}`}>
                        <FileText size={12} className="text-muted-foreground" />
                        <span className="flex-1 truncate">{d.file_name || d.doc_type}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${s.color}22`, color: s.color }}>{s.label_fr}</span>
                        {d.status === "rejected" && d.rejection_reason && <span className="text-[10px] text-red-500 max-w-[220px] truncate" title={d.rejection_reason}>{d.rejection_reason}</span>}
                        {!readOnly && <button onClick={() => remove(d.id)} className="text-red-500 hover:opacity-80" data-testid={`step2-doc-delete-${d.id}`}><Trash2 size={12} /></button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        <div className="text-[11px] text-muted-foreground">Formats acceptés : PDF, PNG, JPG, WEBP (max 12 MB par fichier).</div>
      </Card>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Step 3 — Timing
// ---------------------------------------------------------------------------

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const Step3 = () => {
  const { data, refresh } = useAuth();
  const nav = useNavigate();
  const t0 = data.application.timing || {};
  const [prep, setPrep] = useState({ min: t0.prep_time_min || 20, max: t0.prep_time_max || 30 });
  const [hours, setHours] = useState(t0.hours || DAY_KEYS.reduce((a, k) => ({ ...a, [k]: [["09:00", "22:00"]] }), {}));
  const [saving, setSaving] = useState(false);

  const save = async (advance) => {
    setSaving(true);
    try {
      await sellerApi.put("/food/apply/step/3", { data: { prep_time_min: prep.min, prep_time_max: prep.max, hours }, advance });
      await refresh();
      if (advance) nav("/foodbaked/sellers/apply/step-4");
    } finally { setSaving(false); }
  };

  const setDay = (k, i, side, value) => {
    setHours((s) => ({ ...s, [k]: s[k].map((r, idx) => idx === i ? (side === "start" ? [value, r[1]] : [r[0], value]) : r) }));
  };
  const closeDay = (k) => setHours((s) => ({ ...s, [k]: [] }));
  const openDay  = (k) => setHours((s) => ({ ...s, [k]: [["09:00", "22:00"]] }));

  return (
    <WizardShell step={STEPS[2]} onSave={() => save(false)} onAdvance={() => save(true)} onBack={() => nav("/foodbaked/sellers/apply/step-2")} saving={saving}>
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Temps de préparation min (min)"><Input type="number" min={1} value={prep.min} onChange={(e) => setPrep({ ...prep, min: parseInt(e.target.value || 0, 10) })} data-testid="step3-pmin" /></Field>
          <Field label="Temps de préparation max (min)"><Input type="number" min={1} value={prep.max} onChange={(e) => setPrep({ ...prep, max: parseInt(e.target.value || 0, 10) })} data-testid="step3-pmax" /></Field>
        </div>
        <div className="space-y-2">
          {DAY_KEYS.map((k, i) => {
            const ranges = hours[k] || [];
            const closed = ranges.length === 0;
            return (
              <div key={k} className="flex items-center gap-2" data-testid={`step3-day-${k}`}>
                <div className="w-24 text-sm font-medium">{DAYS_FR[i]}</div>
                {closed ? (
                  <>
                    <span className="text-xs text-muted-foreground flex-1">Fermé · Closed</span>
                    <Btn variant="outline" onClick={() => openDay(k)} className="h-8 text-xs">Ouvrir</Btn>
                  </>
                ) : (
                  <>
                    <input type="time" value={ranges[0][0]} onChange={(e) => setDay(k, 0, "start", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                    <span className="text-xs">→</span>
                    <input type="time" value={ranges[0][1]} onChange={(e) => setDay(k, 0, "end", e.target.value)} className="h-8 rounded border border-border bg-secondary/40 px-2 text-xs" />
                    <Btn variant="danger" onClick={() => closeDay(k)} className="h-8 text-xs ml-auto">Fermer</Btn>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Step 4 — Menu & Cuisines
// ---------------------------------------------------------------------------

const CUISINE_OPTS = ["burgers", "pizza", "chicken", "indian", "african", "chinese", "healthy", "desserts", "beverages", "bakery", "seafood", "fast_food", "italian", "continental"];

const Step4 = () => {
  const { data, refresh } = useAuth();
  const nav = useNavigate();
  const mc = data.application.menu_cuisines || {};
  const [cuisines, setCuisines] = useState(mc.cuisines || []);
  const [menuNotes, setMenuNotes] = useState(mc.menu_notes || "");
  const [avgPrice, setAvgPrice] = useState(mc.avg_price || "");
  const [saving, setSaving] = useState(false);

  const toggle = (c) => setCuisines((s) => s.includes(c) ? s.filter((x) => x !== c) : [...s, c]);
  const save = async (advance) => {
    setSaving(true);
    try {
      await sellerApi.put("/food/apply/step/4", { data: { cuisines, menu_notes: menuNotes, avg_price: avgPrice }, advance });
      await refresh();
      if (advance) nav("/foodbaked/sellers/apply/step-5");
    } finally { setSaving(false); }
  };

  return (
    <WizardShell step={STEPS[3]} onSave={() => save(false)} onAdvance={() => save(true)} onBack={() => nav("/foodbaked/sellers/apply/step-3")} saving={saving} canAdvance={cuisines.length > 0}>
      <Card className="p-4 space-y-4">
        <Field label="Cuisines proposées · Cuisine tags" hint="Sélectionnez tout ce qui s'applique · Select all that apply">
          <div className="flex flex-wrap gap-2" data-testid="step4-cuisines">
            {CUISINE_OPTS.map((c) => (
              <button key={c} type="button" onClick={() => toggle(c)}
                      data-testid={`step4-cuisine-${c}`}
                      className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${cuisines.includes(c) ? "text-white border-transparent" : "border-border text-muted-foreground hover:text-foreground"}`}
                      style={cuisines.includes(c) ? { backgroundColor: GREEN } : undefined}>
                {c}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix moyen d'un plat · Avg dish price"><Input type="number" min={0} value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} data-testid="step4-avgprice" /></Field>
          <Field label="Nb approximatif de plats · Approx items"><Input type="number" min={0} data-testid="step4-nbitems" /></Field>
        </div>
        <Field label="Notes sur le menu · Menu notes"><textarea value={menuNotes} onChange={(e) => setMenuNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm" data-testid="step4-notes" /></Field>
        <p className="text-xs text-muted-foreground">Vous pourrez ajouter chaque plat en détail depuis votre portail partenaire après approbation. · You'll add each dish from the partner portal after approval.</p>
      </Card>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Step 5 — Bank details (country-scoped)
// ---------------------------------------------------------------------------

const CI_MM_PROVIDERS = ["orange", "mtn", "wave", "moov", "other"];

const Step5 = () => {
  const { data, refresh } = useAuth();
  const nav = useNavigate();
  const country = data.application.country;
  const b0 = data.bank || { method: country === "IN" ? "bank_account" : "bank_account", bank_name: "", account_holder: "", details: {} };
  const [b, setB] = useState(b0);
  const [confirmAcct, setConfirmAcct] = useState(b0.details?.account_number || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setB((s) => ({ ...s, [k]: v }));
  const setD = (k, v) => setB((s) => ({ ...s, details: { ...(s.details || {}), [k]: v } }));

  const save = async (advance) => {
    setErr(""); setSaving(true);
    // Validation
    if (country === "IN" && b.method === "bank_account") {
      if (b.details?.account_number !== confirmAcct) { setErr("Numéro de compte non identique · Account numbers do not match"); setSaving(false); return; }
    }
    try {
      await sellerApi.put("/food/apply/bank", { method: b.method, bank_name: b.bank_name, account_holder: b.account_holder, details: b.details, advance });
      await refresh();
      if (advance) nav("/foodbaked/sellers/apply/step-6");
    } catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <WizardShell step={STEPS[4]} onSave={() => save(false)} onAdvance={() => save(true)} onBack={() => nav("/foodbaked/sellers/apply/step-4")} saving={saving}
      canAdvance={!!b.method && !!b.account_holder}>
      <Card className="p-4 space-y-4" testId="step5-form">
        {err && <div className="text-xs text-red-500">{err}</div>}
        <Field label="Mode de paiement · Payout method">
          <Select value={b.method} onChange={(e) => set("method", e.target.value)} data-testid="step5-method">
            <option value="bank_account">Virement bancaire · Bank transfer</option>
            {country === "CI" && <option value="mobile_money">Mobile Money</option>}
            {country === "IN" && <option value="upi">UPI</option>}
          </Select>
        </Field>
        <Field label="Titulaire du compte · Account holder"><Input value={b.account_holder} onChange={(e) => set("account_holder", e.target.value)} required data-testid="step5-holder" /></Field>

        {country === "CI" && b.method === "bank_account" && (
          <div className="space-y-3">
            <Field label="Nom de la banque · Bank name"><Input value={b.bank_name} onChange={(e) => set("bank_name", e.target.value)} data-testid="step5-bank" /></Field>
            <Field label="IBAN"><Input value={b.details?.iban || ""} onChange={(e) => setD("iban", e.target.value)} data-testid="step5-iban" /></Field>
            <Field label="SWIFT / BIC (optionnel)"><Input value={b.details?.swift || ""} onChange={(e) => setD("swift", e.target.value)} data-testid="step5-swift" /></Field>
          </div>
        )}
        {country === "CI" && b.method === "mobile_money" && (
          <div className="space-y-3">
            <Field label="Fournisseur · Provider">
              <Select value={b.details?.provider || "orange"} onChange={(e) => setD("provider", e.target.value)} data-testid="step5-mm-provider">
                {CI_MM_PROVIDERS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </Select>
            </Field>
            <Field label="Numéro enregistré · Registered number"><Input type="tel" value={b.details?.number || ""} onChange={(e) => setD("number", e.target.value)} placeholder="+225…" data-testid="step5-mm-number" /></Field>
          </div>
        )}
        {country === "IN" && b.method === "bank_account" && (
          <div className="space-y-3">
            <Field label="Nom de la banque · Bank name"><Input value={b.bank_name} onChange={(e) => set("bank_name", e.target.value)} data-testid="step5-bank" /></Field>
            <Field label="Numéro de compte · Account number"><Input value={b.details?.account_number || ""} onChange={(e) => setD("account_number", e.target.value)} data-testid="step5-account" /></Field>
            <Field label="Confirmer · Confirm account number"><Input value={confirmAcct} onChange={(e) => setConfirmAcct(e.target.value)} data-testid="step5-account-confirm" /></Field>
            <Field label="IFSC"><Input value={b.details?.ifsc || ""} onChange={(e) => setD("ifsc", e.target.value)} data-testid="step5-ifsc" /></Field>
            <Field label="UPI ID (optionnel)"><Input value={b.details?.upi_id || ""} onChange={(e) => setD("upi_id", e.target.value)} data-testid="step5-upi" /></Field>
          </div>
        )}
        {country === "IN" && b.method === "upi" && (
          <div className="space-y-3">
            <Field label="UPI ID"><Input value={b.details?.upi_id || ""} onChange={(e) => setD("upi_id", e.target.value)} required data-testid="step5-upi-only" /></Field>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">Les informations bancaires sont stockées en toute sécurité et ne seront utilisées que pour vos paiements.</div>
      </Card>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Step 6 — Review & Submit
// ---------------------------------------------------------------------------

const ReviewRow = ({ label, value, testId }) => (
  <div className="flex items-start justify-between py-1.5 border-b border-border/40 text-sm" data-testid={testId}>
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right max-w-[60%] truncate">{value || <span className="italic text-muted-foreground/60">—</span>}</span>
  </div>
);

const Step6 = () => {
  const { data, refresh } = useAuth();
  const nav = useNavigate();
  const app = data.application;
  const rd = app.restaurant_details || {};
  const t = app.timing || {};
  const mc = app.menu_cuisines || {};
  const b  = data.bank || {};
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true); setErr("");
    try { await sellerApi.post("/food/apply/submit"); await refresh(); nav("/foodbaked/sellers/dashboard"); }
    catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  const canSubmit = app.status === "draft" || app.status === "needs_correction";

  return (
    <WizardShell step={STEPS[5]} onBack={() => nav("/foodbaked/sellers/apply/step-5")} isLast>
      <div className="space-y-4">
        <Card className="p-4 space-y-1">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><Utensils size={14} /> Détails du restaurant · Restaurant</div>
          <ReviewRow label="Nom · Name"    value={rd.name}    testId="review-name" />
          <ReviewRow label="Adresse · Address" value={rd.address} testId="review-address" />
          <ReviewRow label="Ville · City"  value={rd.city} />
          <ReviewRow label="Pays · Country" value={app.country} />
          <ReviewRow label="Téléphone"     value={rd.phone} />
        </Card>
        <Card className="p-4 space-y-1">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><FileText size={14} /> Documents ({data.documents.length})</div>
          {data.documents.length === 0 && <div className="text-xs text-muted-foreground italic">Aucun document · No documents</div>}
          {data.documents.map((d) => (
            <ReviewRow key={d.id} label={d.doc_type} value={<><span className="text-xs">{d.file_name}</span> <span className="ml-2 text-[10px] px-1.5 rounded" style={{ backgroundColor: `${DOC_ICON_STATUS[d.status].color}22`, color: DOC_ICON_STATUS[d.status].color }}>{d.status}</span></>} />
          ))}
        </Card>
        <Card className="p-4 space-y-1">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><Clock size={14} /> Horaires · Timing</div>
          <ReviewRow label="Préparation · Prep" value={t.prep_time_min ? `${t.prep_time_min}–${t.prep_time_max} min` : null} />
        </Card>
        <Card className="p-4 space-y-1">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><Utensils size={14} /> Menu & Cuisines</div>
          <ReviewRow label="Cuisines" value={(mc.cuisines || []).join(", ")} testId="review-cuisines" />
          <ReviewRow label="Prix moyen" value={mc.avg_price} />
        </Card>
        <Card className="p-4 space-y-1">
          <div className="text-sm font-bold mb-2 flex items-center gap-2"><Banknote size={14} /> Informations bancaires</div>
          <ReviewRow label="Méthode · Method" value={b.method} />
          <ReviewRow label="Titulaire"        value={b.account_holder} />
          <ReviewRow label="Banque · Bank"    value={b.bank_name} />
        </Card>
        {err && <div className="text-xs text-red-500">{err}</div>}
        {canSubmit ? (
          <Btn className="w-full" onClick={submit} disabled={busy} data-testid="wizard-submit">
            {busy && <Loader2 size={14} className="animate-spin" />} <ClipboardCheck size={14} /> Soumettre pour examen · Submit for review
          </Btn>
        ) : (
          <div className="text-xs text-muted-foreground italic">Votre demande n'est plus modifiable — statut : {app.status}.</div>
        )}
      </div>
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// Partner activation (post-approval set-password)
// ---------------------------------------------------------------------------

const ActivatePage = () => {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    if (pw !== pw2) { setErr("Mots de passe non identiques"); setBusy(false); return; }
    try {
      await axios.post(`${API_BASE}/food/partner/activate`, { token, password: pw });
      setOk(true);
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30" data-testid="partner-activate">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-bold">Activer votre compte · Activate account</h1>
        {ok ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-700 inline-flex items-center gap-2"><CheckCircle2 size={12} /> Compte activé · Account activated!</div>
            <Link to="/partner/food/login" className="inline-block w-full text-center h-10 rounded-lg text-white font-semibold text-sm inline-flex items-center justify-center gap-2" style={{ backgroundColor: GREEN }}><LogIn size={14} /> Se connecter au portail partenaire</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-muted-foreground">Définissez votre mot de passe pour accéder au portail partenaire. · Set your password to access the partner portal.</p>
            <Field label="Nouveau mot de passe · New password (min 8)"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} data-testid="activate-pw" /></Field>
            <Field label="Confirmer · Confirm"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} data-testid="activate-pw2" /></Field>
            {err && <div className="text-xs text-red-500">{err}</div>}
            <Btn type="submit" className="w-full" disabled={busy} data-testid="activate-submit">{busy && <Loader2 size={14} className="animate-spin" />} Activer</Btn>
          </form>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const StepRedirect = () => <Navigate to="/foodbaked/sellers/dashboard" replace />;

/**
 * Local error boundary — the sellers wizard renders many bilingual inline
 * strings ("Suivant · Next" style). If any external agent (browser
 * translation, third-party extension) mutates a React-managed text node,
 * the next commit throws a DOMException. We swallow the specific message
 * gracefully so applicants see a friendly retry card, never the dev
 * overlay. The underlying insertBefore vulnerability is already blocked
 * globally via `translate="no"` on <html> and the notranslate class on
 * <body> (see /public/index.html); this is defense-in-depth only.
 */
class WizardErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("[FoodSellersApp] error boundary caught", err);
  }
  reset = () => { this.setState({ err: null }); window.location.reload(); };
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/30" data-testid="sellers-error-boundary">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="text-lg font-bold">Un problème d'affichage · A display issue</div>
            <p className="text-sm text-muted-foreground mt-1">
              Nous n'avons pas pu afficher cette étape correctement. Vos informations sont sauvegardées — rechargez la page pour continuer. · We couldn't render this step correctly. Your data is saved — reload to continue.
            </p>
          </div>
          <button
            onClick={this.reset}
            data-testid="sellers-error-boundary-reload"
            className="h-10 px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 text-white w-full"
            style={{ backgroundColor: GREEN }}
          >
            <RefreshCw size={14} /> Recharger · Reload
          </button>
        </div>
      </div>
    );
  }
}

export const FoodSellersApp = () => (
  <WizardErrorBoundary>
    <AuthProvider>
      <Routes>
        <Route path="" element={<Landing />} />
        <Route path="apply" element={<SignupPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="" element={<PortalLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="apply/step-1" element={<Step1 />} />
          <Route path="apply/step-2" element={<Step2 />} />
          <Route path="apply/step-3" element={<Step3 />} />
          <Route path="apply/step-4" element={<Step4 />} />
          <Route path="apply/step-5" element={<Step5 />} />
          <Route path="apply/step-6" element={<Step6 />} />
        </Route>
        <Route path="apply/*" element={<StepRedirect />} />
      </Routes>
    </AuthProvider>
  </WizardErrorBoundary>
);

// Standalone route surface for the activation link.
export const FoodPartnerActivateRoute = ActivatePage;

export default FoodSellersApp;
