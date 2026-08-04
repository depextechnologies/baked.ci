/**
 * BAKĒD Partner Hub — /partner
 *
 * Central partner-acquisition portal per Fixing_Prompt.docx (2026-02):
 *   Hero · Opportunities (2×2 image-forward cards) · Why Partner ·
 *   Success Stories · How It Works (5 steps) · Final CTA · Footer.
 *
 * Deliberate distinction from /Sell-on-baked:
 *   - image-forward Blinkit-inspired cards (image top ~60% of card)
 *   - amber + blue accent blend (warm CTAs), glassmorphism on hover
 *   - Abidjan skyline real photo hero + enterprise grid overlay
 *   - image-first "photography" tone vs. Sell-on-baked's "illustration" tone
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Routes, Route } from "react-router-dom";
import { PartnerApplyApp } from "./PartnerApplyApp";
import {
  ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Moon, Sun,
  Warehouse, Building2, ShoppingBag, Bike,
  Users2, Sparkles, Wallet, Megaphone, LineChart, Truck, Headphones, ShieldCheck,
  CheckCircle2, MapPin,
} from "lucide-react";
import { BakedLogo } from "@/components/layout/BakedLogo";
import "./partner-hub.css";

/* -------------------------------------------------------------------------- */
/*                                Theme                                       */
/* -------------------------------------------------------------------------- */

const THEME_KEY = "baked_partner_hub_theme";

const useHubTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
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

/* -------------------------------------------------------------------------- */
/*                             Scroll reveal                                  */
/* -------------------------------------------------------------------------- */

const Reveal = ({ children, delay = 0, className = "", as: Tag = "div", ...rest }) => {
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
  return (
    <Tag ref={ref} className={`ph-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Navbar                                    */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { label: "Opportunities", href: "#opportunities" },
  { label: "Why BAKĒD",     href: "#why" },
  { label: "Success Stories", href: "#stories" },
  { label: "How it works",  href: "#how" },
  { label: "Contact",       href: "#final-cta" },
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
    <header className="ph-nav" data-scrolled={scrolled}>
      <div className="ph-container flex items-center justify-between" style={{ height: 74 }}>
        <Link to="/partner" className="flex items-center gap-3" data-testid="hub-nav-logo">
          <BakedLogo size="md" />
          <span
            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{
              color: "var(--ph-accent-warm)",
              border: "1px solid var(--ph-border-strong)",
              background: "var(--ph-glass)",
              backdropFilter: "blur(10px)",
            }}
          >
            Partners
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="ph-nav-link"
              data-testid={`hub-nav-${l.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "")}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="ph-icon-btn"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            data-testid="hub-theme-toggle"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to="/" className="ph-btn ph-btn-ghost hidden sm:inline-flex" data-testid="hub-nav-back">
            Back to BAKĒD
          </Link>
          <Link to="/partner/apply" className="ph-btn ph-btn-warm" data-testid="hub-nav-cta">
            Become a Partner <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Hero                                     */
/* -------------------------------------------------------------------------- */

const Hero = () => (
  <section className="ph-hero">
    <div className="ph-hero-bg" aria-hidden="true" />
    <div className="ph-hero-grid" aria-hidden="true" />
    <div className="ph-container relative" style={{ zIndex: 2 }}>
      <div className="max-w-4xl py-24">
        <Reveal>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full ph-glass"
               style={{ color: "var(--ph-fg)" }}>
            <MapPin size={13} style={{ color: "var(--ph-accent-warm)" }} />
            <span className="text-xs font-semibold tracking-wide">Now onboarding across Côte d&apos;Ivoire</span>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <h1 className="ph-display mt-8" style={{ color: "var(--ph-fg)" }}>
            Partner with <span style={{ color: "var(--ph-accent-warm)" }}>BAKĒD</span>.<br />
            Build your business.<br />
            Grow with Africa&apos;s future.
          </h1>
        </Reveal>

        <Reveal delay={200}>
          <p className="ph-body-lg mt-8 max-w-2xl">
            Whether you want to operate a MARTbakēd dark store, lease your
            property, sell your products on our marketplace, or join the
            delivery network — BAKĒD has an opportunity for you.
          </p>
        </Reveal>

        <Reveal delay={280}>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/partner/apply" className="ph-btn ph-btn-warm" data-testid="hub-hero-primary">
              Become a Partner <ArrowRight size={18} />
            </Link>
            <a href="#opportunities" className="ph-btn ph-btn-secondary" data-testid="hub-hero-secondary">
              Explore Opportunities
            </a>
          </div>
        </Reveal>

        <Reveal delay={380}>
          <div className="mt-16 flex flex-wrap gap-x-10 gap-y-4 items-center">
            {[
              ["Trusted by 5 000+ businesses", ShieldCheck],
              ["AI-native business tools",      Sparkles],
              ["Fast, secure settlements",      Wallet],
              ["Africa-first infrastructure",   Truck],
            ].map(([label, Icon], i) => (
              <div key={label} className="flex items-center gap-2" style={{ opacity: 1 - i * 0.05 }}>
                <Icon size={16} style={{ color: "var(--ph-accent-warm)" }} />
                <span className="text-sm" style={{ color: "var(--ph-fg-muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                        Opportunities (4 large cards)                        */
/* -------------------------------------------------------------------------- */

const OPPORTUNITIES = [
  {
    id: "dark-store",
    icon: Warehouse,
    tag: "Dark Store",
    title: "MARTbakēd Dark Store",
    desc: "Operate a smart local fulfillment centre and serve thousands of customers through the MARTbakēd platform. AI inventory, live orders, packing stations — all handled.",
    cta: "Become a Dark Store Partner",
    href: "https://mart.partner.baked.ci",
    external: true,
    image: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=1600&q=80&auto=format&fit=crop",
  },
  {
    id: "lease-property",
    icon: Building2,
    tag: "Property",
    title: "Lease your property to BAKĒD",
    desc: "Own a commercial space? Turn it into a high-performing BAKĒD dark store and earn long-term rental income — we handle the fit-out, staff and operations.",
    cta: "Submit your property",
    href: "mailto:properties@baked.ci?subject=Property%20partnership%20enquiry",
    external: true,
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=80&auto=format&fit=crop",
  },
  {
    id: "sell-on-baked",
    icon: ShoppingBag,
    tag: "Marketplace",
    title: "Sell your products on BAKĒD",
    desc: "List your products, reach more customers, and grow your business through the BAKĒD marketplace — same-day delivery, unified checkout, one dashboard.",
    cta: "Sell on BAKĒD",
    href: "/Sell-on-baked",
    external: false,
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600&q=80&auto=format&fit=crop",
  },
  {
    id: "delivery-partner",
    icon: Bike,
    tag: "Delivery",
    title: "Deliver with BAKĒD",
    desc: "Join our growing delivery network. Earn money delivering groceries, food and parcels with flexible hours, weekly payouts and rider support.",
    cta: "Become a Driver",
    href: "https://driver.baked.ci",
    external: true,
    image: "https://images.unsplash.com/photo-1526367790999-0150786686a2?w=1600&q=80&auto=format&fit=crop",
  },
];

const OpportunityCard = ({ opp, index }) => {
  const Icon = opp.icon;
  const CardLink = opp.external ? "a" : Link;
  const linkProps = opp.external
    ? { href: opp.href, target: "_blank", rel: "noopener noreferrer" }
    : { to: opp.href };
  return (
    <Reveal delay={index * 90}>
      <CardLink
        {...linkProps}
        className="ph-opp-card"
        data-testid={`hub-opportunity-${opp.id}`}
      >
        <div className="ph-opp-image">
          <img src={opp.image} alt={opp.title} loading="lazy" />
          <div className="ph-opp-icon" aria-hidden="true">
            <Icon size={22} />
          </div>
          <div className="ph-opp-badge">{opp.tag}</div>
        </div>

        <div className="ph-opp-body">
          <h3 className="ph-h2" style={{ color: "var(--ph-fg)" }}>{opp.title}</h3>
          <p className="ph-body mt-4">{opp.desc}</p>

          <div className="mt-8 inline-flex items-center gap-2 font-semibold"
               style={{ color: "var(--ph-accent-warm)" }}>
            {opp.cta} <ArrowUpRight size={17} />
          </div>
        </div>
      </CardLink>
    </Reveal>
  );
};

const OpportunitiesSection = () => (
  <section id="opportunities" className="ph-section">
    <div className="ph-container">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <Reveal><div className="ph-eyebrow mb-4">Choose your opportunity</div></Reveal>
        <Reveal delay={80}>
          <h2 className="ph-h1" style={{ color: "var(--ph-fg)" }}>
            Four ways to partner with BAKĒD.
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="ph-body-lg mt-5">
            BAKĒD is more than a marketplace — it&apos;s an ecosystem. Pick the
            partnership that fits your business and grow with us.
          </p>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {OPPORTUNITIES.map((opp, i) => (
          <OpportunityCard key={opp.id} opp={opp} index={i} />
        ))}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                        Why Partner With BAKĒD (features)                    */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  { icon: Users2,     title: "Growing customer base",     body: "Millions of shoppers across BAKĒD's multi-country network." },
  { icon: Sparkles,   title: "AI-powered business tools", body: "Listings, pricing, restock alerts, and support — automated." },
  { icon: Wallet,     title: "Fast settlements",          body: "T+1 payouts in your local currency. No opaque fees." },
  { icon: Megaphone,  title: "Marketing support",         body: "Campaigns, promotions and referrals run for you." },
  { icon: LineChart,  title: "Smart analytics",           body: "Cohorts, funnels and revenue insights — real time." },
  { icon: Truck,      title: "Logistics network",         body: "Same-day dispatch across Abidjan and beyond." },
  { icon: Headphones, title: "Dedicated partner support", body: "Human-first partner success team, 24/7." },
  { icon: ShieldCheck,title: "Trusted technology",        body: "Enterprise-grade uptime, security and compliance." },
];

const WhyPartnerSection = () => (
  <section id="why" className="ph-section" style={{ background: "var(--ph-bg-elevated)" }}>
    <div className="ph-container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <Reveal><div className="ph-eyebrow mb-4">Why partner with BAKĒD</div></Reveal>
        <Reveal delay={80}>
          <h2 className="ph-h1" style={{ color: "var(--ph-fg)" }}>
            Why thousands will choose BAKĒD.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <Reveal key={f.title} delay={i * 55}>
              <div className="ph-feature-card">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: "var(--ph-accent-soft)", color: "var(--ph-accent)" }}
                >
                  <Icon size={22} />
                </div>
                <div className="ph-h3" style={{ color: "var(--ph-fg)" }}>{f.title}</div>
                <p className="ph-body mt-2">{f.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                              Success stories                               */
/* -------------------------------------------------------------------------- */

const STORIES = [
  {
    quote:
      "Our dark store hit 400 orders/day within three months. BAKĒD handled the tech, we handled the pickers — and the AI restock alerts alone have saved us hours.",
    name: "Aïcha Konan",
    role: "Dark Store Operator",
    location: "Cocody, Abidjan",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&h=240&fit=crop&crop=faces&q=80&auto=format",
  },
  {
    quote:
      "We had an empty commercial space sitting idle. BAKĒD turned it into a live dark store in six weeks. Rental income is steady, our building is finally productive.",
    name: "Yao Kouassi",
    role: "Property Owner",
    location: "Marcory, Abidjan",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&h=240&fit=crop&crop=faces&q=80&auto=format",
  },
  {
    quote:
      "Since listing on BAKĒD, our online orders doubled in the first month. The unified checkout and same-day delivery makes us look like a much bigger brand.",
    name: "Mariam Diallo",
    role: "Marketplace Seller",
    location: "Plateau, Abidjan",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&h=240&fit=crop&crop=faces&q=80&auto=format",
  },
  {
    quote:
      "I ride full-time with BAKĒD. Weekly payouts are always on time, the rider support team actually picks up, and I choose my own hours. Best decision I made.",
    name: "Ismaël Traoré",
    role: "Delivery Partner",
    location: "Yopougon, Abidjan",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=240&h=240&fit=crop&crop=faces&q=80&auto=format",
  },
];

const SuccessStoriesSection = () => {
  const [idx, setIdx] = useState(0);
  const s = STORIES[idx];
  const go = (delta) => setIdx((i) => (i + delta + STORIES.length) % STORIES.length);
  return (
    <section id="stories" className="ph-section">
      <div className="ph-container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Reveal><div className="ph-eyebrow mb-4">Success stories</div></Reveal>
          <Reveal delay={80}>
            <h2 className="ph-h1" style={{ color: "var(--ph-fg)" }}>
              Real partners. Real growth.
            </h2>
          </Reveal>
        </div>

        <Reveal>
          <div className="ph-glass p-8 md:p-14 max-w-4xl mx-auto"
               style={{ background: "var(--ph-card)" }}>
            <div className="flex items-start gap-2 mb-6">
              {[0,1,2,3,4].map((i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: "var(--ph-accent-warm)",
                  opacity: 0.7 + i * 0.05,
                }} />
              ))}
            </div>

            <blockquote className="ph-h2 leading-snug" style={{ color: "var(--ph-fg)", fontWeight: 500 }}>
              &ldquo;{s.quote}&rdquo;
            </blockquote>

            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <img
                src={s.avatar}
                alt={s.name}
                className="w-16 h-16 rounded-full object-cover"
                style={{ border: "1px solid var(--ph-border-strong)" }}
                loading="lazy"
              />
              <div>
                <div className="font-semibold text-lg" style={{ color: "var(--ph-fg)" }}>{s.name}</div>
                <div className="text-sm" style={{ color: "var(--ph-fg-muted)" }}>{s.role}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--ph-fg-subtle)" }}>{s.location}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs mr-2" style={{ color: "var(--ph-fg-subtle)" }}>
                  {idx + 1} / {STORIES.length}
                </span>
                <button type="button" onClick={() => go(-1)} className="ph-icon-btn"
                        aria-label="Previous story" data-testid="hub-story-prev">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => go(1)} className="ph-icon-btn"
                        aria-label="Next story" data-testid="hub-story-next">
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
/*                             How It Works                                   */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { n: 1, title: "Choose your opportunity", body: "Dark store, property, marketplace or delivery — you pick." },
  { n: 2, title: "Submit application",      body: "One short form. We ask only what we truly need to know." },
  { n: 3, title: "Verification",            body: "We verify your documents and business in under 48 hours." },
  { n: 4, title: "Agreement & training",    body: "Sign digitally and train with a partner success expert." },
  { n: 5, title: "Start growing with BAKĒD", body: "Go live across the BAKĒD network — orders start flowing." },
];

const HowItWorksSection = () => (
  <section id="how" className="ph-section" style={{ background: "var(--ph-bg-elevated)" }}>
    <div className="ph-container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <Reveal><div className="ph-eyebrow mb-4">How it works</div></Reveal>
        <Reveal delay={80}>
          <h2 className="ph-h1" style={{ color: "var(--ph-fg)" }}>
            From application<br />to first order in 5 steps.
          </h2>
        </Reveal>
      </div>

      <div className="ph-timeline">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 90} className="ph-timeline-step text-center">
            <div className="ph-timeline-node">{s.n}</div>
            <div className="ph-h3" style={{ color: "var(--ph-fg)" }}>{s.title}</div>
            <p className="ph-body mt-2 max-w-[240px] mx-auto">{s.body}</p>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                                Final CTA                                   */
/* -------------------------------------------------------------------------- */

const FinalCTASection = () => (
  <section id="final-cta" className="ph-section" style={{ position: "relative", overflow: "hidden" }}>
    <div className="ph-hero-bg" aria-hidden="true" style={{ opacity: 1 }} />
    <div className="ph-container relative" style={{ zIndex: 2 }}>
      <div className="ph-glass max-w-3xl mx-auto text-center p-10 md:p-16"
           style={{ background: "var(--ph-glass)" }}>
        <Reveal>
          <div className="ph-eyebrow mb-5">Ready when you are</div>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="ph-display" style={{ color: "var(--ph-fg)", fontSize: "clamp(2.4rem, 5vw, 4.5rem)" }}>
            Ready to build your future<br />with <span style={{ color: "var(--ph-accent-warm)" }}>BAKĒD</span>?
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <p className="ph-body-lg mt-6 max-w-xl mx-auto">
            Join the BAKĒD partner network today. One application. Four
            opportunities. Unlimited upside.
          </p>
        </Reveal>
        <Reveal delay={260}>
          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <Link to="/partner/apply" className="ph-btn ph-btn-warm" data-testid="hub-final-primary">
              Become a Partner <ArrowRight size={18} />
            </Link>
            <a href="mailto:partners@baked.ci" className="ph-btn ph-btn-secondary" data-testid="hub-final-secondary">
              Contact our team
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  </section>
);

/* -------------------------------------------------------------------------- */
/*                                  Footer                                    */
/* -------------------------------------------------------------------------- */

const HubFooter = () => (
  <footer style={{ borderTop: "1px solid var(--ph-border)", background: "var(--ph-bg)" }}>
    <div className="ph-container py-16 grid gap-12 md:grid-cols-4">
      <div>
        <BakedLogo size="md" />
        <p className="ph-body mt-4 max-w-xs">
          One platform. Six businesses. Four ways to partner. Built for Africa.
        </p>
      </div>

      {[
        { title: "Opportunities", items: [
            { label: "Dark Store Partner",  href: "#opportunities" },
            { label: "Lease your Property", href: "#opportunities" },
            { label: "Sell on BAKĒD",       href: "/Sell-on-baked" },
            { label: "Become a Driver",     href: "#opportunities" },
          ] },
        { title: "Company", items: [
            { label: "About BAKĒD", href: "/" },
            { label: "Careers",     href: "/careers" },
            { label: "Blog",        href: "/blog" },
            { label: "Investors",   href: "/investors" },
          ] },
        { title: "Support", items: [
            { label: "Help Center", href: "/help" },
            { label: "Contact",     href: "/contact" },
            { label: "Terms",       href: "/terms" },
            { label: "Privacy",     href: "/privacy" },
          ] },
      ].map((col) => (
        <div key={col.title}>
          <div className="text-sm font-semibold mb-4" style={{ color: "var(--ph-fg)" }}>{col.title}</div>
          <ul className="space-y-3">
            {col.items.map((it) => (
              <li key={it.label}>
                <a
                  href={it.href}
                  className="text-sm"
                  style={{ color: "var(--ph-fg-muted)" }}
                  onMouseOver={(e) => (e.currentTarget.style.color = "var(--ph-fg)")}
                  onMouseOut={(e) => (e.currentTarget.style.color = "var(--ph-fg-muted)")}
                >
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="ph-container pb-8 pt-6 flex flex-wrap items-center justify-between gap-4"
         style={{ borderTop: "1px solid var(--ph-border)" }}>
      <div className="text-xs" style={{ color: "var(--ph-fg-subtle)" }}>
        © 2026 BAKĒD Platform · Built for Africa, ready for the world
      </div>
      <div className="text-xs flex items-center gap-2" style={{ color: "var(--ph-fg-subtle)" }}>
        <CheckCircle2 size={14} style={{ color: "var(--ph-accent-warm)" }} />
        Côte d&apos;Ivoire · English
      </div>
    </div>
  </footer>
);

/* -------------------------------------------------------------------------- */
/*                                Root component                              */
/* -------------------------------------------------------------------------- */

// Landing page (hero, opportunities, testimonials, timeline, CTA + footer)
// is shown at /partner. /partner/apply mounts the multi-step application
// wizard on top of the same partner-hub theme tokens.
const PartnerHubLanding = ({ theme, toggle }) => (
  <div className="partner-hub" data-theme={theme}>
    <Navbar theme={theme} onToggleTheme={toggle} />
    <main>
      <Hero />
      <OpportunitiesSection />
      <WhyPartnerSection />
      <SuccessStoriesSection />
      <HowItWorksSection />
      <FinalCTASection />
    </main>
    <HubFooter />
  </div>
);

export const PartnerHubApp = () => {
  const { theme, toggle } = useHubTheme();

  useEffect(() => {
    const prev = document.title;
    document.title = "Partner with BAKĒD — Build Your Business. Grow With Africa's Future.";
    return () => { document.title = prev; };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<PartnerHubLanding theme={theme} toggle={toggle} />} />
      <Route path="/apply" element={<PartnerApplyApp />} />
    </Routes>
  );
};

export default PartnerHubApp;
