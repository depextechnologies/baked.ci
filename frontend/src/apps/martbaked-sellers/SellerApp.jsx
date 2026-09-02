/**
 * MARTbakēd Seller Portal — apps/martbaked-sellers
 *
 * Public routes:
 *   /martbaked/sellers                  → SellerLanding (Apply / Login CTAs)
 *   /martbaked/sellers/apply            → 9-step onboarding wizard
 *   /martbaked/sellers/login            → email + password login
 *   /martbaked/sellers/activate         → set password after SA approval
 *   /martbaked/sellers/application-status → public status lookup by application code
 *
 * Reuses the existing partner-landing design system (`.partner-landing`
 * tokens) so BAKĒD brand consistency is automatic. Suppliers are a distinct
 * business entity from Dark Store Partners (per Inventory_Prompt §1).
 */
import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Building2, LogIn, CheckCircle2, Clock, AlertTriangle,
  XCircle, ShieldCheck, Sparkles, Truck, Users2, Wallet, BarChart3,
} from "lucide-react";
import { BakedLogo } from "@/components/layout/BakedLogo";
import { toast } from "sonner";
import axios from "axios";
import { SellerApplyWizard } from "./SellerApplyWizard";
import "@/apps/partner-landing/partner-landing.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
export const sellerApi = axios.create({ baseURL: API });

/* --------------------------------------------------------------------------
 * SellerModule context — lets us reuse the same SellerApp under both
 * /martbaked/sellers/* (MART, green) and /shopbaked/sellers/* (SHOP, amber)
 * without duplicating the whole tree. Consumed by SellerHeader/Landing/etc.
 * -------------------------------------------------------------------------- */
export const SellerModuleContext = React.createContext({
  code: "mart", label: "MARTbakēd", accent: "#77BC1F", basePath: "/martbaked/sellers",
  tagline: "Supplier Program",
  hero_desc: "Supply your products to MARTbakēd Dark Stores and reach customers across Côte d'Ivoire.",
  code_prefix: "MART",
});
export const useSellerModule = () => React.useContext(SellerModuleContext);

const SELLER_MODULE_PROFILES = {
  mart: {
    code: "mart", label: "MARTbakēd", accent: "#77BC1F",
    basePath: "/martbaked/sellers", tagline: "Supplier Program",
    hero_desc: "Supply your products to MARTbakēd Dark Stores and reach customers across Côte d'Ivoire.",
    code_prefix: "MART",
  },
  shop: {
    code: "shop", label: "SHOPbakēd", accent: "#FCC44C",
    basePath: "/shopbaked/sellers", tagline: "Seller Program",
    hero_desc: "List your fashion, electronics or home goods on SHOPbakēd — vetted marketplace, national reach, seller-shipped fulfilment.",
    code_prefix: "SHOP",
  },
};

/* -------------------------------------------------------------------------- */
/*                                Header                                       */
/* -------------------------------------------------------------------------- */

const SellerHeader = () => {
  const mod = useSellerModule();
  return (
    <header className="pl-nav" data-scrolled={true}>
      <div className="pl-container flex items-center justify-between" style={{ height: 72 }}>
        <Link to={mod.basePath} className="flex items-center gap-3" data-testid="seller-nav-logo">
          <BakedLogo size="md" />
          <span className="text-xs uppercase tracking-widest px-2 py-1 rounded-md"
                style={{ color: mod.accent, background: `${mod.accent}20`, border: `1px solid ${mod.accent}44` }}>
            {mod.label} · Sellers
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-3">
          <Link to={`${mod.basePath}/login`} className="pl-btn" data-testid="seller-nav-login">
            <LogIn size={14} /> Login
          </Link>
          <Link to={`${mod.basePath}/apply`} className="pl-btn pl-btn-primary" data-testid="seller-nav-apply">
            Apply Now <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
};

const SellerFooter = () => {
  const mod = useSellerModule();
  return (
    <footer style={{ borderTop: "1px solid var(--pl-border)", background: "var(--pl-bg)" }}>
      <div className="pl-container py-8 flex flex-wrap items-center justify-between gap-4">
      <div className="text-xs" style={{ color: "var(--pl-fg-subtle)" }}>
        © 2026 BAKĒD Platform · {mod.label} {mod.tagline}
      </div>
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--pl-fg-subtle)" }}>
        <Link to="/Sell-on-baked">← Back to Sell-on-BAKĒD</Link>
      </div>
    </div>
  </footer>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Landing page                                   */
/* -------------------------------------------------------------------------- */

const BENEFITS = [
  { icon: Users2, title: "Reach thousands", body: "Sell to MARTbakēd dark stores serving customers across Côte d'Ivoire — one supplier, many buyers." },
  { icon: Truck, title: "Guaranteed dispatch", body: "Purchase orders raised by our stores flow directly to your dashboard. Confirm, ship, get paid." },
  { icon: Wallet, title: "Fast settlement", body: "Get paid on time in your local currency. Track invoices and payments from one place." },
  { icon: BarChart3, title: "Live demand signals", body: "See what's selling, what's low, and where to grow — powered by MARTbakēd inventory data." },
  { icon: Sparkles, title: "AI-native tools", body: "AI-assisted catalogue upload, product matching and pricing suggestions — coming soon to your portal." },
  { icon: ShieldCheck, title: "Governed & audited", body: "Every application is Super-Admin reviewed. Your brand and margins are protected." },
];

const STATUSES = [
  { code: "submitted", icon: Clock, color: "#3B82F6", label: "Submitted", body: "We've received your application." },
  { code: "under_review", icon: Clock, color: "#FCC44C", label: "Under review", body: "Our team is verifying your business." },
  { code: "action_required", icon: AlertTriangle, color: "#F97316", label: "Action required", body: "Please provide additional information." },
  { code: "approved", icon: CheckCircle2, color: "#77BC1F", label: "Approved", body: "Welcome aboard! Activate your account." },
  { code: "rejected", icon: XCircle, color: "#FF4C52", label: "Rejected", body: "Your application was not approved." },
];

const SellerLanding = () => {
  const mod = useSellerModule();
  const isShop = mod.code === "shop";
  return (
  <>
    <section className="pl-hero">
      <div className="pl-hero-bg" aria-hidden="true" />
      <div className="pl-container relative" style={{ zIndex: 2 }}>
        <div className="grid lg:grid-cols-2 gap-16 items-center py-20">
          <div>
            <div className="pl-eyebrow mb-6" style={{ color: mod.accent }}>{mod.label} {mod.tagline}</div>
            <h1 className="pl-display" style={{ color: "var(--pl-fg)" }}>
              Become a<br />
              <span style={{ color: mod.accent }}>{mod.label}</span> {isShop ? "Seller." : "Supplier."}
            </h1>
            <p className="pl-body-lg mt-6 max-w-xl">
              {mod.hero_desc}
              {isShop
                ? " Every listing reviewed. National reach. Seller-shipped fulfilment with a customer-PIN delivery gate."
                : " From application to your first purchase order — governed, transparent, and always paid on time."}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to={`${mod.basePath}/apply`} className="pl-btn pl-btn-primary" data-testid="seller-landing-apply">
                {isShop ? "Apply as Seller" : "Apply as Supplier"} <ArrowRight size={18} />
              </Link>
              <Link to={`${mod.basePath}/login`} className="pl-btn pl-btn-secondary" data-testid="seller-landing-login">
                <LogIn size={16} /> {isShop ? "Seller Login" : "Supplier Login"}
              </Link>
            </div>
          </div>
          <div className="pl-card p-8">
            <div className="pl-eyebrow mb-4">Application flow</div>
            <ol className="space-y-4">
              {[
                "Verify your business phone",
                "Tell us about your company",
                "Owner / representative details",
                "Business location on the map",
                "Products & categories you supply",
                "Where you can deliver",
                "Banking & payment information",
                "Upload supporting documents",
                "Review & submit",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
                    {i + 1}
                  </div>
                  <div className="text-sm" style={{ color: "var(--pl-fg)" }}>{step}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>

    <section className="pl-section" style={{ background: "var(--pl-bg-elevated)" }}>
      <div className="pl-container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="pl-eyebrow mb-3">Why supply on MARTbakēd</div>
          <h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Built for suppliers.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="pl-card p-8" data-testid={`seller-benefit-${b.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}>
                  <Icon size={22} />
                </div>
                <div className="pl-h3" style={{ color: "var(--pl-fg)" }}>{b.title}</div>
                <p className="pl-body mt-3">{b.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>

    <section className="pl-section">
      <div className="pl-container text-center">
        <div className="pl-eyebrow mb-3">After you submit</div>
        <h2 className="pl-h1 mb-10" style={{ color: "var(--pl-fg)" }}>Track your application in real time.</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {STATUSES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.code} className="pl-card p-5 text-left" data-testid={`seller-status-info-${s.code}`}>
                <Icon size={20} style={{ color: s.color }} />
                <div className="mt-3 text-sm font-semibold" style={{ color: "var(--pl-fg)" }}>{s.label}</div>
                <div className="text-xs mt-1" style={{ color: "var(--pl-fg-muted)" }}>{s.body}</div>
              </div>
            );
          })}
        </div>
        <Link to={`${mod.basePath}/application-status`} className="pl-btn pl-btn-secondary mt-10 inline-flex" data-testid="seller-landing-check-status">
          Check my application status
        </Link>
      </div>
    </section>
  </>
  );
};

/* -------------------------------------------------------------------------- */
/*                            Application status page                          */
/* -------------------------------------------------------------------------- */

const SellerApplicationStatus = () => {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [params] = useSearchParams();

  useEffect(() => {
    const initial = params.get("code");
    if (initial) { setCode(initial); lookup(initial); }
  }, []);

  const lookup = async (c) => {
    const target = (c || code).trim();
    if (!target) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const { data } = await sellerApi.get(`/martbaked/sellers/application-status/${encodeURIComponent(target)}`);
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Application not found. Check the code and try again.");
    } finally { setBusy(false); }
  };

  const meta = result && STATUSES.find((s) => s.code === result.status);

  return (
    <section className="pl-section">
      <div className="pl-container max-w-2xl">
        <div className="text-center mb-10">
          <div className="pl-eyebrow mb-3">Application status</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Track your MARTbakēd application</h1>
          <p className="pl-body mt-3">Enter the application code you received when you submitted (format: <code>MART-SUP-YYYY-NNNNN</code>).</p>
        </div>
        <div className="pl-card p-8">
          <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="flex flex-wrap gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MART-SUP-2026-00001"
              className="flex-1 min-w-[240px] px-4 h-12 rounded-xl font-mono text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-status-input"
            />
            <button type="submit" className="pl-btn pl-btn-primary" disabled={busy} data-testid="seller-status-lookup">
              {busy ? "Checking…" : "Check status"}
            </button>
          </form>
          {error && <div className="mt-5 text-sm p-3 rounded-lg" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="seller-status-error">{error}</div>}
          {result && meta && (
            <div className="mt-8 p-6 rounded-2xl" style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }} data-testid="seller-status-result">
              <div className="flex items-start gap-4">
                <meta.icon size={28} style={{ color: meta.color, marginTop: 4 }} />
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-subtle)" }}>Status</div>
                  <div className="text-xl font-bold" style={{ color: meta.color }}>{meta.label}</div>
                  <div className="text-sm mt-1" style={{ color: "var(--pl-fg)" }}>{result.business_name}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--pl-fg-muted)" }}>
                    Application <span className="font-mono">{result.application_code}</span>
                    {result.submitted_at && ` · submitted ${new Date(result.submitted_at).toLocaleDateString()}`}
                  </div>
                  {result.action_required_notes && (
                    <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "rgba(249,115,22,0.12)", color: "#F97316" }} data-testid="seller-status-notes">
                      <strong>Action needed:</strong> {result.action_required_notes}
                    </div>
                  )}
                  {result.rejection_reason && (
                    <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="seller-status-rejection">
                      <strong>Reason:</strong> {result.rejection_reason}
                    </div>
                  )}
                  {result.status === "approved" && (
                    <Link to={`/martbaked/sellers/activate?code=${result.application_code}`} className="pl-btn pl-btn-primary mt-5 inline-flex" data-testid="seller-status-activate-btn">
                      Activate my account <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                                 Login page                                  */
/* -------------------------------------------------------------------------- */

const SellerLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notActive, setNotActive] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(""); setNotActive(false);
    try {
      const { data } = await sellerApi.post("/martbaked/sellers/login", { email, password });
      localStorage.setItem("supplier_token", data.access_token);
      localStorage.setItem("supplier", JSON.stringify(data.supplier));
      toast.success(`Welcome back, ${data.supplier.trading_name || data.supplier.business_name}`);
      // Redirect to portal (or ?redirect= override for deep-linking)
      const params = new URLSearchParams(window.location.search);
      const slug = data.supplier?.seller_slug || "sellers";
      const to = params.get("redirect") || `/martbaked/${slug}/portal/dashboard`;
      navigate(to);
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d?.code === "not_active") {
        setNotActive(true);
        setErr(d.message || "Your supplier account isn't active yet.");
      } else {
        setErr(typeof d === "string" ? d : (d?.message || "Login failed. Check your credentials."));
      }
    } finally { setBusy(false); }
  };

  return (
    <section className="pl-section">
      <div className="pl-container max-w-md">
        <div className="text-center mb-8">
          <div className="pl-eyebrow mb-3">Supplier Portal</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Welcome back.</h1>
        </div>
        <form onSubmit={submit} className="pl-card p-8 space-y-4" data-testid="seller-login-form">
          <div>
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Business email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-2 px-4 h-12 rounded-xl text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-login-email" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-2 px-4 h-12 rounded-xl text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-login-password" />
          </div>
          {err && (
            <div className="text-sm p-3 rounded-lg space-y-2" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="seller-login-error">
              <div>{err}</div>
              {notActive && (
                <div className="flex flex-wrap gap-3 text-xs" data-testid="seller-login-not-active-actions">
                  <Link to="/martbaked/sellers/application-status" className="underline">Check application status</Link>
                  <Link to="/martbaked/sellers/activate" className="underline">Activate my account</Link>
                </div>
              )}
            </div>
          )}
          <button type="submit" disabled={busy} className="pl-btn pl-btn-primary w-full justify-center" data-testid="seller-login-submit">
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
          </button>
          <div className="text-xs text-center pt-2" style={{ color: "var(--pl-fg-muted)" }}>
            Don&apos;t have an account? <Link to="/martbaked/sellers/apply" className="underline" data-testid="seller-login-apply-link">Apply as a supplier</Link>
          </div>
        </form>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                               Activate page                                 */
/* -------------------------------------------------------------------------- */

const SellerActivate = () => {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (pw1.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw1 !== pw2) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const { data } = await sellerApi.post("/martbaked/sellers/activate", {
        application_code: code.trim(), password: pw1,
      });
      localStorage.setItem("supplier_token", data.access_token);
      localStorage.setItem("supplier", JSON.stringify(data.supplier));
      setSuccess(true);
      toast.success("Account activated — you're in!");
      setTimeout(() => {
        const slug = data.supplier?.seller_slug || "sellers";
        navigate(`/martbaked/${slug}/portal/dashboard`);
      }, 1200);
    } catch (e) {
      const d = e?.response?.data?.detail;
      setErr(typeof d === "string" ? d : (d?.message || "Activation failed."));
    } finally { setBusy(false); }
  };

  return (
    <section className="pl-section">
      <div className="pl-container max-w-md">
        <div className="text-center mb-8">
          <div className="pl-eyebrow mb-3">Account activation</div>
          <h1 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Set your password</h1>
          <p className="pl-body mt-3">Your MARTbakēd application has been approved. Set a password to activate your supplier portal.</p>
        </div>
        <form onSubmit={submit} className="pl-card p-8 space-y-4" data-testid="seller-activate-form">
          <div>
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Application code</label>
            <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full mt-2 px-4 h-12 rounded-xl font-mono text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-activate-code" placeholder="MART-SUP-2026-00001" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>New password</label>
            <input type="password" required value={pw1} onChange={(e) => setPw1(e.target.value)}
              className="w-full mt-2 px-4 h-12 rounded-xl text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-activate-pw1" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest" style={{ color: "var(--pl-fg-muted)" }}>Confirm password</label>
            <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)}
              className="w-full mt-2 px-4 h-12 rounded-xl text-sm"
              style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg)", border: "1px solid var(--pl-border-strong)" }}
              data-testid="seller-activate-pw2" />
          </div>
          {err && <div className="text-sm p-3 rounded-lg" style={{ background: "rgba(255,76,82,.15)", color: "#FF4C52" }} data-testid="seller-activate-error">{err}</div>}
          {success && <div className="text-sm p-3 rounded-lg" style={{ background: "rgba(119,188,31,.15)", color: "#77BC1F" }} data-testid="seller-activate-success">Activated! Redirecting…</div>}
          <button type="submit" disabled={busy || success} className="pl-btn pl-btn-primary w-full justify-center" data-testid="seller-activate-submit">
            {busy ? "Activating…" : "Activate account"} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Root component                               */
/* -------------------------------------------------------------------------- */

export const SellerApp = ({ module = "mart" }) => {
  const profile = SELLER_MODULE_PROFILES[module] || SELLER_MODULE_PROFILES.mart;
  useEffect(() => {
    const prev = document.title;
    document.title = `${profile.label} ${profile.code === "shop" ? "Sellers" : "Suppliers"} — Grow with BAKĒD`;
    return () => { document.title = prev; };
  }, [profile.label, profile.code]);

  // Override the partner-landing accent tokens with the module's colour so
  // SHOPbakēd renders amber without duplicating the whole stylesheet.
  const overrideStyle = React.useMemo(() => ({
    "--pl-accent": profile.accent,
    "--pl-accent-soft": `${profile.accent}22`,
  }), [profile.accent]);

  return (
    <SellerModuleContext.Provider value={profile}>
      <div className="partner-landing" data-theme="dark" style={overrideStyle} data-module={profile.code}>
        <SellerHeader />
        <main>
          <Routes>
            <Route index element={<SellerLanding />} />
            <Route path="apply" element={<SellerApplyWizard />} />
            <Route path="login" element={<SellerLogin />} />
            <Route path="activate" element={<SellerActivate />} />
            <Route path="application-status" element={<SellerApplicationStatus />} />
          </Routes>
        </main>
        <SellerFooter />
      </div>
    </SellerModuleContext.Provider>
  );
};

export default SellerApp;
