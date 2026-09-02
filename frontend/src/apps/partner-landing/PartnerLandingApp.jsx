/**
 * BAKĒD Partner Landing Portal — apps/partner-landing
 *
 * Full landing portal per Fixing_Prompt.docx v1.0 Premium 2026:
 *   Hero · TrustBar · Opportunities · Why Partner · Growth ·
 *   Testimonials · How It Works · Final CTA · Footer.
 *
 * Deliberate architectural choices:
 *  - Sections live in this one module as small components (Navbar, HeroSection,
 *    TrustBar, OpportunitiesSection, StatsSection, GrowthSection,
 *    TestimonialCarousel, TimelineSection, FinalCTASection, PartnerFooter,
 *    ThemeToggle, CountrySelector) — satisfies the docx's "reusable components"
 *    rule without exploding into 12 files that only ship together anyway.
 *  - Theme is scoped: `.partner-landing[data-theme="dark|light"]`. It does NOT
 *    touch the customer/admin app tokens — those keep their existing palette.
 *  - Apply-Now CTAs deep-link to the future per-module partner subdomains as
 *    external URLs, so switching to real DNS is zero-code.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Moon, Sun,
  ShoppingBasket, Utensils, ShoppingBag, Truck, Car, Home as HomeIcon,
  ShieldCheck, Sparkles, Zap, Clock, Rocket, BarChart3, Users2, Wallet,
  Megaphone, LineChart, CheckCircle2, Globe2,
} from "lucide-react";
import { BakedLogo } from "@/components/layout/BakedLogo";
import "./partner-landing.css";

/* -------------------------------------------------------------------------- */
/*                                Theme system                                */
/* -------------------------------------------------------------------------- */

const THEME_KEY = "baked_partner_theme";

const usePartnerTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    // OS preference detection — default is dark per spec.
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    return prefersLight ? "light" : "dark";
  });
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);
  return { theme, toggle };
};

const ThemeToggle = ({ theme, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="pl-icon-btn"
    aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    data-testid="partner-theme-toggle"
  >
    {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
  </button>
);

/* -------------------------------------------------------------------------- */
/*                             Country selector                               */
/* -------------------------------------------------------------------------- */

const COUNTRIES = [
  { code: "CI", label: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "IN", label: "India",          flag: "🇮🇳" },
  // Historical: Liberia records remain in the database but are hidden from
  // every user-facing selector (per P0 correction pass).
];

const CountrySelector = () => {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pl-icon-btn"
        style={{ width: "auto", padding: "0 14px", gap: 8 }}
        data-testid="partner-country-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ fontSize: 15 }}>{country.flag}</span>
        <span className="text-xs font-medium">{country.code}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 min-w-[220px] rounded-2xl overflow-hidden"
          style={{ background: "var(--pl-card)", border: "1px solid var(--pl-border-strong)", boxShadow: "0 24px 60px -30px rgba(0,0,0,0.5)" }}
        >
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => { setCountry(c); setOpen(false); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5"
              style={{ color: "var(--pl-fg)" }}
              data-testid={`partner-country-option-${c.code}`}
            >
              <span style={{ fontSize: 17 }}>{c.flag}</span>
              <span className="text-sm">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Navbar                                    */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { label: "Solutions",         href: "#opportunities" },
  { label: "Become a Partner",  href: "#final-cta" },
  { label: "Why BAKĒD",         href: "#why" },
  { label: "Resources",         href: "#how-it-works" },
  { label: "Support",           href: "#footer" },
];

const Navbar = ({ theme, onToggleTheme }) => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className="pl-nav" data-scrolled={scrolled}>
      <div className="pl-container flex items-center justify-between" style={{ height: 72 }}>
        <Link to="/Sell-on-baked" className="flex items-center gap-3" data-testid="partner-nav-logo">
          <BakedLogo size="md" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="pl-nav-link"
              data-testid={`partner-nav-${l.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "")}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <CountrySelector />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Link
            to="/"
            className="pl-btn pl-btn-ghost hidden sm:inline-flex"
            data-testid="partner-nav-login"
          >
            Login
          </Link>
          <a
            href="#final-cta"
            className="pl-btn pl-btn-primary"
            data-testid="partner-nav-apply-now"
          >
            Apply Now <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </header>
  );
};

/* -------------------------------------------------------------------------- */
/*                             Scroll reveal hook                             */
/* -------------------------------------------------------------------------- */

const useReveal = () => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
};

const Reveal = ({ children, delay = 0, as: Tag = "div", className = "", ...rest }) => {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`pl-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
};

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */

const HeroSection = () => (
  <section className="pl-hero">
    <div className="pl-hero-bg" aria-hidden="true" />
    <div className="pl-container relative" style={{ zIndex: 2 }}>
      <div className="grid lg:grid-cols-2 gap-16 items-center py-24">
        <div>
          <Reveal>
            <div className="pl-eyebrow mb-6" style={{ color: "var(--pl-accent)" }}>
              Now onboarding — Côte d&apos;Ivoire & India
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="pl-display" style={{ color: "var(--pl-fg)" }}>
              Grow Your Business<br />
              with <span style={{ color: "var(--pl-accent)" }}>BAKĒD</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="pl-body-lg mt-6 max-w-xl">
              Join thousands of businesses across Côte d&apos;Ivoire and become
              part of Africa&apos;s next commerce revolution — one platform,
              six businesses, unified logistics, and AI-native tools.
            </p>
          </Reveal>
          <Reveal delay={220}>
            <div className="mt-10 flex flex-wrap gap-4">
              <a href="#final-cta" className="pl-btn pl-btn-primary" data-testid="partner-hero-cta-primary">
                Become a Partner <ArrowRight size={18} />
              </a>
              <a href="#opportunities" className="pl-btn pl-btn-secondary" data-testid="partner-hero-cta-secondary">
                Explore Opportunities
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="hidden lg:block">
          <HeroEcosystemIllustration />
        </Reveal>
      </div>
    </div>
  </section>
);

/** Hero illustration — BAKĒD hub with the six modules arranged around it. */
const HeroEcosystemIllustration = () => {
  const modules = [
    { code: "MART", icon: ShoppingBasket, color: "#77BC1F", angle: -90  },
    { code: "FOOD", icon: Utensils,       color: "#FF6B6B", angle: -30  },
    { code: "SHOP", icon: ShoppingBag,    color: "#FCC44C", angle:  30  },
    { code: "EXPRESS", icon: Truck,       color: "#FCC44C", angle:  90  },
    { code: "AUTO", icon: Car,            color: "#9B87F5", angle: 150  },
    { code: "IMMO", icon: HomeIcon,       color: "#F97316", angle: 210  },
  ];
  const radius = 170;
  return (
    <div className="relative mx-auto" style={{ width: 460, height: 460 }}>
      {/* Concentric rings */}
      {[240, 340, 440].map((s) => (
        <div
          key={s}
          className="absolute rounded-full"
          style={{
            width: s, height: s,
            left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            border: "1px dashed var(--pl-border-strong)",
            opacity: 0.4,
          }}
        />
      ))}
      {/* Center hub */}
      <div
        className="absolute rounded-3xl flex items-center justify-center"
        style={{
          width: 130, height: 130,
          left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "var(--pl-card)",
          border: "1px solid var(--pl-border-strong)",
          boxShadow: "0 40px 80px -30px var(--pl-accent-glow)",
        }}
      >
        <BakedLogo size="lg" />
      </div>
      {/* Orbiting modules */}
      {modules.map((m) => {
        const Icon = m.icon;
        const rad = (m.angle * Math.PI) / 180;
        const x = 230 + radius * Math.cos(rad) - 34;
        const y = 230 + radius * Math.sin(rad) - 34;
        return (
          <div
            key={m.code}
            className="absolute rounded-2xl flex items-center justify-center"
            style={{
              width: 68, height: 68, left: x, top: y,
              background: "var(--pl-card)",
              border: "1px solid var(--pl-border-strong)",
              color: m.color,
              boxShadow: `0 20px 40px -20px ${m.color}44`,
            }}
            title={m.code}
          >
            <Icon size={26} />
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Trust Bar                                 */
/* -------------------------------------------------------------------------- */

const TRUST_ITEMS = [
  { label: "Trusted by 5k+ businesses", icon: ShieldCheck },
  { label: "Secure payments",           icon: Wallet },
  { label: "AI-powered marketing",      icon: Sparkles },
  { label: "Fast settlement",           icon: Zap },
  { label: "24/7 operations",           icon: Clock },
  { label: "Africa-first infrastructure", icon: Globe2 },
];

const TrustBar = () => (
  <section className="pl-section-tight" style={{ borderTop: "1px solid var(--pl-border)", borderBottom: "1px solid var(--pl-border)" }}>
    <div className="pl-container">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center">
        {TRUST_ITEMS.map((t, i) => {
          const Icon = t.icon;
          return (
            <Reveal key={t.label} delay={i * 60} className="flex items-center gap-3 justify-center lg:justify-start">
              <Icon size={18} style={{ color: "var(--pl-accent)" }} />
              <span className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>{t.label}</span>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                          Opportunities (6 cards)                           */
/* -------------------------------------------------------------------------- */

const OPPORTUNITIES = [
  {
    code: "MART", label: "MARTbakēd", color: "#77BC1F", icon: ShoppingBasket,
    tagline: "Groceries & essentials",
    desc: "List and sell groceries, fresh produce and daily essentials to your neighbourhood — same-day dispatch built in.",
    // Fixing_Prompt v9 — internal SPA routes so the card and its CTA
    // go to two different pages within the same app (no target=_blank).
    cardHref: "/martbaked/sellers",
    applyHref: "/martbaked/sellers/apply",
    internal: true,
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #77BC1F55, transparent 60%), radial-gradient(500px 300px at 80% 70%, #77BC1F33, transparent 60%)",
  },
  {
    code: "FOOD", label: "FOODbakēd", color: "#FF6B6B", icon: Utensils,
    tagline: "Restaurants & kitchens",
    desc: "Bring your restaurant, cloud kitchen or bakery online with dine-in tables, delivery and pickup — one dashboard.",
    cardHref: "https://food.partner.baked.ci",
    applyHref: "https://food.partner.baked.ci",
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #FF6B6B55, transparent 60%), radial-gradient(500px 300px at 80% 70%, #FF6B6B33, transparent 60%)",
  },
  {
    code: "SHOP", label: "SHOPbakēd", color: "#FCC44C", icon: ShoppingBag,
    tagline: "Marketplace sellers",
    desc: "List your fashion, electronics and home goods on the BAKĒD marketplace. Vetted sellers, national reach, PIN-gated delivery — you focus on product, we handle discovery.",
    cardHref: "/shopbaked/sellers",
    applyHref: "/shopbaked/sellers/apply",
    internal: true,
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #FCC44C55, transparent 60%), radial-gradient(500px 300px at 80% 70%, #FCC44C33, transparent 60%)",
  },
  {
    code: "EXPRESS", label: "SENDbakēd", color: "#FCC44C", icon: Truck,
    tagline: "Logistics network",
    desc: "Move parcels, freight and home shifts through the BAKĒD dispatch network. Live tracking and pricing engine baked in.",
    // Apply Now goes to the internal Driver landing (per Fixing_Prompt v9);
    // card itself takes the user there too since there's no separate module page yet.
    cardHref: "/driver",
    applyHref: "/driver",
    internal: true,
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #FCC44C55, transparent 60%), radial-gradient(500px 300px at 80% 70%, #FCC44C33, transparent 60%)",
  },
  {
    code: "AUTO", label: "AUTObakēd", color: "#9B87F5", icon: Car,
    tagline: "Vehicles & dealerships",
    desc: "Sell vehicles, list your dealership or manage a fleet — with financing partners and paperwork handled for you.",
    cardHref: "https://auto.partner.baked.ci",
    applyHref: "https://auto.partner.baked.ci",
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #9B87F555, transparent 60%), radial-gradient(500px 300px at 80% 70%, #9B87F533, transparent 60%)",
  },
  {
    code: "IMMO", label: "IMMObakēd", color: "#F97316", icon: HomeIcon,
    tagline: "Real estate",
    desc: "Agents and brokers close deals faster with verified listings, digital contracts, and buyer matching powered by AI.",
    cardHref: "https://immo.partner.baked.ci",
    applyHref: "https://immo.partner.baked.ci",
    imageGradient: "radial-gradient(600px 400px at 30% 30%, #F9731655, transparent 60%), radial-gradient(500px 300px at 80% 70%, #F9731633, transparent 60%)",
  },
];

const OpportunityCard = ({ opp, index }) => {
  const Icon = opp.icon;
  const nav = useNavigate();
  const openCard = (e) => {
    if (opp.internal) {
      e.preventDefault();
      nav(opp.cardHref);
    }
    // External href — default anchor behaviour handles it.
  };
  const openApply = (e) => {
    // Apply CTA MUST win over the parent card link (Fixing_Prompt v9 §7).
    e.preventDefault();
    e.stopPropagation();
    if (opp.internal || opp.applyHref.startsWith("/")) {
      nav(opp.applyHref);
    } else {
      window.location.href = opp.applyHref;
    }
  };
  return (
    <Reveal delay={index * 70}>
      <a
        href={opp.cardHref}
        onClick={openCard}
        target={opp.internal ? undefined : "_blank"}
        rel={opp.internal ? undefined : "noopener noreferrer"}
        className="pl-card pl-opp-card"
        data-testid={`partner-opportunity-${opp.code.toLowerCase()}`}
      >
        <div className="pl-opp-image" style={{ background: opp.imageGradient }} />
        <div className="flex items-start justify-between">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: `${opp.color}22`, color: opp.color, border: `1px solid ${opp.color}44` }}
          >
            <Icon size={26} />
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ background: "var(--pl-bg-elevated)", color: "var(--pl-fg-muted)", border: "1px solid var(--pl-border-strong)" }}
          >
            Now onboarding
          </span>
        </div>

        <div className="mt-auto pt-10">
          <div className="pl-eyebrow" style={{ color: opp.color }}>{opp.tagline}</div>
          <h3 className="pl-h2 mt-2" style={{ color: "var(--pl-fg)", fontWeight: 700 }}>{opp.label}</h3>
          <p className="pl-body mt-3">{opp.desc}</p>

          <button
            type="button"
            onClick={openApply}
            className="mt-6 inline-flex items-center gap-2 font-semibold bg-transparent border-0 p-0 cursor-pointer"
            style={{ color: opp.color }}
            data-testid={`partner-opportunity-${opp.code.toLowerCase()}-apply`}
          >
            Apply Now <ArrowUpRight size={16} />
          </button>
        </div>
      </a>
    </Reveal>
  );
};

const OpportunitiesSection = () => (
  <section id="opportunities" className="pl-section">
    <div className="pl-container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <Reveal><div className="pl-eyebrow mb-3">Opportunities</div></Reveal>
        <Reveal delay={80}>
          <h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Choose your opportunity</h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="pl-body-lg mt-4">
            Select the business category that best fits your business. Each
            module has its own dedicated onboarding flow tailored to it.
          </p>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {OPPORTUNITIES.map((opp, i) => (
          <OpportunityCard key={opp.code} opp={opp} index={i} />
        ))}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                             Why Partner section                            */
/* -------------------------------------------------------------------------- */

const STATS = [
  { icon: Users2,    value: "10M+", label: "Potential customers",       hint: "Across BAKĒD's growing multi-country network." },
  { icon: Clock,     value: "24/7", label: "Business operations",       hint: "Orders never stop — neither does our platform." },
  { icon: Sparkles,  value: "AI",   label: "Business assistant",        hint: "Ask BAKĒD AI to draft listings, price stock, forecast demand." },
  { icon: Wallet,    value: "T+1",  label: "Fast, secure payments",     hint: "Settlements in your local currency, no surprises." },
  { icon: Megaphone, value: "1st",  label: "Marketing growth support",  hint: "Campaigns, promotions and referrals handled for you." },
  { icon: LineChart, value: "360°", label: "Smart analytics",           hint: "Cohorts, funnels and revenue — one dashboard." },
];

const StatsSection = () => (
  <section id="why" className="pl-section" style={{ background: "var(--pl-bg-elevated)" }}>
    <div className="pl-container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <Reveal><div className="pl-eyebrow mb-3">Why Partner With BAKĒD</div></Reveal>
        <Reveal delay={80}>
          <h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>
            Built for scale.<br />Built for Africa.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.label} delay={i * 60}>
              <div className="pl-card p-8 h-full">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "var(--pl-accent-soft)", color: "var(--pl-accent)" }}
                >
                  <Icon size={22} />
                </div>
                <div className="pl-h1" style={{ color: "var(--pl-fg)", fontSize: "2.5rem" }}>{s.value}</div>
                <div className="pl-h3 mt-2" style={{ color: "var(--pl-fg)" }}>{s.label}</div>
                <p className="pl-body mt-3">{s.hint}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                              Growth (50/50)                                */
/* -------------------------------------------------------------------------- */

const GROWTH_BULLETS = [
  "More customers, everywhere BAKĒD is live",
  "AI-native business assistant for listings, pricing & support",
  "Marketing campaigns and referrals run for you",
  "Fast, secure settlements in your local currency",
  "Own logistics network — no third-party dependency",
  "Smart analytics and business insights — real time",
  "Dedicated partner success team",
];

const GrowthSection = () => (
  <section className="pl-section">
    <div className="pl-container">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <Reveal><div className="pl-eyebrow mb-3">Growth</div></Reveal>
          <Reveal delay={80}>
            <h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>
              #1 Africa&apos;s app<br />for your growth.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="pl-body-lg mt-5 max-w-lg">
              BAKĒD isn&apos;t just a marketplace — it&apos;s the operating
              system for your business. Everything you need to sell, deliver
              and scale, in one place.
            </p>
          </Reveal>
          <ul className="mt-8 space-y-3">
            {GROWTH_BULLETS.map((b, i) => (
              <Reveal key={b} delay={180 + i * 40} as="li" className="flex items-start gap-3">
                <CheckCircle2 size={20} style={{ color: "var(--pl-accent)", flexShrink: 0, marginTop: 2 }} />
                <span className="pl-body" style={{ color: "var(--pl-fg)" }}>{b}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal delay={520}>
            <a href="#final-cta" className="pl-btn pl-btn-primary mt-10" data-testid="partner-growth-cta">
              Discover the Advantage <ArrowRight size={18} />
            </a>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <GrowthIllustration />
        </Reveal>
      </div>
    </div>
  </section>
);

const GrowthIllustration = () => (
  <div
    className="relative rounded-[32px] p-8 aspect-square max-w-[520px] mx-auto"
    style={{
      background: "linear-gradient(135deg, var(--pl-card) 0%, var(--pl-bg-elevated) 100%)",
      border: "1px solid var(--pl-border-strong)",
      overflow: "hidden",
    }}
  >
    <div className="absolute inset-0 opacity-30" aria-hidden="true"
      style={{ background: "radial-gradient(600px 400px at 30% 30%, var(--pl-accent-glow), transparent 60%)" }} />

    {/* Bars — fake growth chart */}
    <div className="relative h-full flex items-end justify-around gap-3 pt-16">
      {[38, 55, 42, 78, 62, 92, 84].map((h, i) => (
        <div
          key={i}
          className="w-8 rounded-t-lg"
          style={{
            height: `${h}%`,
            background: `linear-gradient(180deg, var(--pl-accent) 0%, ${i > 4 ? "var(--pl-accent)" : "rgba(29,155,240,0.4)"} 100%)`,
            boxShadow: i === 5 ? "0 -8px 30px -8px var(--pl-accent-glow)" : "none",
          }}
        />
      ))}
    </div>

    {/* Floating callouts */}
    <div className="absolute top-6 left-6 rounded-2xl px-4 py-3"
      style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--pl-fg-subtle)" }}>Revenue this quarter</div>
      <div className="text-xl font-bold mt-1" style={{ color: "var(--pl-fg)" }}>+248%</div>
    </div>

    <div className="absolute top-6 right-6 rounded-2xl px-4 py-3"
      style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
      <div className="flex items-center gap-2">
        <Rocket size={14} style={{ color: "var(--pl-accent)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--pl-fg)" }}>AI Assistant</span>
      </div>
      <div className="text-[10px] mt-1" style={{ color: "var(--pl-fg-subtle)" }}>Optimising your listings…</div>
    </div>

    <div className="absolute bottom-6 left-6 rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: "var(--pl-bg-elevated)", border: "1px solid var(--pl-border-strong)" }}>
      <BarChart3 size={18} style={{ color: "var(--pl-accent)" }} />
      <div>
        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--pl-fg-subtle)" }}>Live orders</div>
        <div className="text-sm font-bold" style={{ color: "var(--pl-fg)" }}>1 284 today</div>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                            Testimonial carousel                            */
/* -------------------------------------------------------------------------- */

const TESTIMONIALS = [
  {
    quote:
      "Since joining BAKĒD, our monthly orders have tripled. The AI assistant handles our menu updates and the dispatch network brings us new customers we couldn't reach before.",
    name: "Aïcha Konan",
    role: "Owner, Chez Aïcha",
    location: "Cocody, Abidjan · FOODbakēd",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=faces",
  },
  {
    quote:
      "We migrated our whole grocery store onto MARTbakēd in two weeks. Settlement is on time, every time — and the analytics finally tell us what to restock.",
    name: "Kouassi Traoré",
    role: "Founder, MiniMart Marcory",
    location: "Marcory, Abidjan · MARTbakēd",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces",
  },
  {
    quote:
      "SENDbakēd gave us the routing and live tracking we would never have built ourselves. Our fleet utilisation jumped 40% in the first month.",
    name: "Mariam Diallo",
    role: "Ops Lead, DialloTransport",
    location: "Plateau, Abidjan · SENDbakēd",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=faces",
  },
];

const TestimonialCarousel = () => {
  const [idx, setIdx] = useState(0);
  const t = TESTIMONIALS[idx];
  const go = (delta) => setIdx((i) => (i + delta + TESTIMONIALS.length) % TESTIMONIALS.length);
  return (
    <section className="pl-section">
      <div className="pl-container max-w-4xl">
        <div className="text-center mb-12">
          <Reveal><div className="pl-eyebrow mb-3">Testimonials</div></Reveal>
          <Reveal delay={80}><h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Trusted by partners.</h2></Reveal>
        </div>

        <Reveal>
          <div className="pl-card p-10 md:p-14 relative">
            <blockquote className="pl-h2 leading-snug" style={{ color: "var(--pl-fg)", fontWeight: 500 }}>
              “{t.quote}”
            </blockquote>
            <div className="mt-8 flex items-center gap-4">
              <img
                src={t.avatar}
                alt={t.name}
                className="w-14 h-14 rounded-full object-cover"
                style={{ border: "1px solid var(--pl-border-strong)" }}
                loading="lazy"
              />
              <div>
                <div className="font-semibold" style={{ color: "var(--pl-fg)" }}>{t.name}</div>
                <div className="text-sm" style={{ color: "var(--pl-fg-muted)" }}>{t.role}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--pl-fg-subtle)" }}>{t.location}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => go(-1)} className="pl-icon-btn" aria-label="Previous testimonial" data-testid="partner-testimonial-prev">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => go(1)} className="pl-icon-btn" aria-label="Next testimonial" data-testid="partner-testimonial-next">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/*                                How It Works                                */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { n: 1, title: "Submit Application",    body: "Tell us about your business and pick the BAKĒD module that fits you."       },
  { n: 2, title: "Verification",          body: "We verify your documents and business details within 48 hours."             },
  { n: 3, title: "Training",              body: "A partner success expert walks you through your dashboard and tools."       },
  { n: 4, title: "Business Activation",   body: "Your store, menu or fleet goes live across the BAKĒD network."              },
  { n: 5, title: "Start Receiving Orders",body: "Orders, deliveries and settlements begin — with analytics from day one."   },
];

const TimelineSection = () => (
  <section id="how-it-works" className="pl-section" style={{ background: "var(--pl-bg-elevated)" }}>
    <div className="pl-container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <Reveal><div className="pl-eyebrow mb-3">How It Works</div></Reveal>
        <Reveal delay={80}>
          <h2 className="pl-h1" style={{ color: "var(--pl-fg)" }}>Start your journey<br />in 5 simple steps.</h2>
        </Reveal>
      </div>

      <div className="pl-timeline">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 90} className="pl-timeline-step text-center">
            <div className="pl-timeline-node">{s.n}</div>
            <div className="pl-h3" style={{ color: "var(--pl-fg)" }}>{s.title}</div>
            <p className="pl-body mt-2 max-w-[220px] mx-auto">{s.body}</p>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                                 Final CTA                                  */
/* -------------------------------------------------------------------------- */

const FinalCTASection = () => (
  <section id="final-cta" className="pl-section" style={{ position: "relative", overflow: "hidden" }}>
    <div className="pl-hero-bg" aria-hidden="true" style={{ opacity: 0.9 }} />
    <div className="pl-container relative text-center max-w-3xl" style={{ zIndex: 2 }}>
      <Reveal>
        <h2 className="pl-display" style={{ color: "var(--pl-fg)", fontSize: "clamp(2.4rem, 5vw, 4.5rem)" }}>
          Ready to grow<br />your business?
        </h2>
      </Reveal>
      <Reveal delay={120}>
        <p className="pl-body-lg mt-6 max-w-xl mx-auto">
          Join BAKĒD today — one platform, six businesses, unlimited upside.
        </p>
      </Reveal>
      <Reveal delay={200}>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <a href="#opportunities" className="pl-btn pl-btn-primary" data-testid="partner-final-cta-apply">
            Apply Now <ArrowRight size={18} />
          </a>
          <a href="mailto:partners@baked.ci" className="pl-btn pl-btn-secondary" data-testid="partner-final-cta-sales">
            Talk to Sales
          </a>
        </div>
      </Reveal>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                                   Footer                                   */
/* -------------------------------------------------------------------------- */

const PartnerFooter = () => (
  <footer id="footer" style={{ borderTop: "1px solid var(--pl-border)", background: "var(--pl-bg)" }}>
    <div className="pl-container py-16 grid gap-12 md:grid-cols-4">
      <div>
        <BakedLogo size="md" />
        <p className="pl-body mt-4 max-w-xs">
          One platform. Six businesses. Built for Africa, ready for the world.
        </p>
      </div>

      {[
        { title: "Partners", items: OPPORTUNITIES.map((o) => ({ label: o.label, href: o.href })) },
        { title: "Company",  items: [
            { label: "About BAKĒD",  href: "/" },
            { label: "Careers",      href: "/careers" },
            { label: "Blog",         href: "/blog" },
            { label: "Investors",    href: "/investors" },
          ] },
        { title: "Support",  items: [
            { label: "Help Center",  href: "/help" },
            { label: "Contact",      href: "/contact" },
            { label: "Terms",        href: "/terms" },
            { label: "Privacy",      href: "/privacy" },
          ] },
      ].map((col) => (
        <div key={col.title}>
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--pl-fg)" }}>{col.title}</div>
          <ul className="space-y-3">
            {col.items.map((it) => (
              <li key={it.label}>
                <a
                  href={it.href}
                  className="text-sm"
                  style={{ color: "var(--pl-fg-muted)" }}
                  onMouseOver={(e) => (e.currentTarget.style.color = "var(--pl-fg)")}
                  onMouseOut={(e) => (e.currentTarget.style.color = "var(--pl-fg-muted)")}
                >
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="pl-container pb-8 pt-6 flex flex-wrap items-center justify-between gap-4"
      style={{ borderTop: "1px solid var(--pl-border)" }}>
      <div className="text-xs" style={{ color: "var(--pl-fg-subtle)" }}>
        © 2026 BAKĒD Platform · Built for Africa, ready for the world
      </div>
      <div className="text-xs flex items-center gap-2" style={{ color: "var(--pl-fg-subtle)" }}>
        <Globe2 size={14} /> Côte d&apos;Ivoire · English
      </div>
    </div>
  </footer>
);

/* -------------------------------------------------------------------------- */
/*                                Root component                              */
/* -------------------------------------------------------------------------- */

export const PartnerLandingApp = () => {
  const { theme, toggle } = usePartnerTheme();

  // Set page title while this app is mounted.
  useEffect(() => {
    const prev = document.title;
    document.title = "BAKĒD Partners — Grow your business with BAKĒD";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="partner-landing" data-theme={theme}>
      <Navbar theme={theme} onToggleTheme={toggle} />
      <main>
        <HeroSection />
        <TrustBar />
        <OpportunitiesSection />
        <StatsSection />
        <GrowthSection />
        <TestimonialCarousel />
        <TimelineSection />
        <FinalCTASection />
      </main>
      <PartnerFooter />
    </div>
  );
};

// Named export used by useMemo in old code paths — keep default too for safety.
export default PartnerLandingApp;
