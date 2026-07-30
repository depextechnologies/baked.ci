import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, ShoppingBasket, Utensils, ShoppingBag, Car, Home as HomeIcon, ChevronRight } from "lucide-react";
import { BakedLogo } from "../../packages/ui";

/**
 * PartnerLandingApp — apps/partner-landing (dev route: /partner,
 * production domain: partner.baked.ci).
 *
 * Per Fixing_Prompt.docx v2.0: this is a MARKETING landing page that
 * directs partners into their business-specific applications. It is
 * explicitly NOT an operational dashboard — those live in each per-module
 * partner app (mart.partner.baked.ci, food.partner.baked.ci, …) and will
 * be built in Phase 2.
 */

const MODULES = [
  { code: "mart",    label: "MART",    color: "#77BC1F", icon: ShoppingBasket, blurb: "List and sell groceries and everyday essentials to your neighbourhood.", route: "/mart-partner" },
  { code: "food",    label: "FOOD",    color: "#FF6B6B", icon: Utensils,       blurb: "Bring your restaurant or cloud kitchen onto FOODbakēd.",                   route: "/food-partner" },
  { code: "shop",    label: "SHOP",    color: "#3B82F6", icon: ShoppingBag,    blurb: "Reach buyers across Africa with your online store.",                       route: "/shop-partner" },
  { code: "express", label: "EXPRESS", color: "#FCC44C", icon: Truck,          blurb: "Move parcels and freight through the BAKĒD dispatch network.",             route: "/express-partner" },
  { code: "auto",    label: "AUTO",    color: "#9B87F5", icon: Car,            blurb: "Sell vehicles, manage a fleet, or onboard your dealership.",               route: "/auto-partner" },
  { code: "immo",    label: "IMMO",    color: "#F97316", icon: HomeIcon,       blurb: "Real-estate agents and brokers close deals faster on IMMObakēd.",          route: "/immo-partner" },
];

export const PartnerLandingApp = () => (
  <div className="min-h-screen bg-background">
    {/* Landing header — dedicated for the partner app, not the customer TopNav */}
    <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
        <BakedLogo size="md" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded-full px-2 py-0.5">Partner</span>
        <nav className="ml-auto flex items-center gap-6 text-sm">
          <Link data-testid="partner-nav-modules" to="#modules" className="text-muted-foreground hover:text-foreground">Modules</Link>
          <Link data-testid="partner-nav-why" to="#why" className="text-muted-foreground hover:text-foreground">Why BAKĒD</Link>
          <Link data-testid="partner-nav-signin" to="/" className="text-sm font-semibold" style={{ color: "#FCC44C" }}>Sign in →</Link>
        </nav>
      </div>
    </header>

    {/* Hero */}
    <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-border bg-secondary text-muted-foreground mb-5">
        One platform · Six businesses · Two countries and growing
      </div>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
        Grow your business on <span style={{ color: "#FCC44C" }}>BAKĒD</span>.
      </h1>
      <p className="text-base sm:text-lg text-muted-foreground mt-5 max-w-2xl mx-auto">
        Choose the BAKĒD module that fits your business. One login. One dashboard.
        One partner network powering commerce across Côte d&apos;Ivoire and Liberia.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <a data-testid="partner-cta-primary" href="#modules" className="h-12 px-6 rounded-2xl font-bold text-black inline-flex items-center gap-2 motion-fast active:scale-[0.98]" style={{ backgroundColor: "#FCC44C" }}>
          Choose your module <ArrowRight size={16} strokeWidth={2.5} />
        </a>
        <Link data-testid="partner-cta-secondary" to="/merchant-registration" className="h-12 px-6 rounded-2xl font-semibold border border-border inline-flex items-center gap-2 hover:bg-secondary motion-fast">
          Talk to sales
        </Link>
      </div>
    </section>

    {/* Modules grid */}
    <section id="modules" className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold">Pick the module that fits you</h2>
        <p className="text-sm text-muted-foreground mt-2">Each module has its own partner app tailored to that business.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.code}
              data-testid={`partner-module-${m.code}`}
              to={m.route}
              className="baked-card border border-border p-6 hover:border-[#FCC44C88] motion-fast group"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${m.color}22`, color: m.color }}>
                <Icon size={22} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold uppercase tracking-wide" style={{ color: m.color }}>{m.label}</span>
                <span className="text-sm text-muted-foreground">bakēd</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{m.blurb}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold group-hover:translate-x-0.5 motion-fast" style={{ color: "#FCC44C" }}>
                Open partner app <ChevronRight size={13} strokeWidth={2.5} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>

    {/* Why BAKĒD */}
    <section id="why" className="max-w-6xl mx-auto px-6 py-16 border-t border-border">
      <div className="grid gap-8 md:grid-cols-3 text-center">
        {[
          ["One backend", "Every module runs on the same PostgreSQL + FastAPI core. Your data, orders, and payouts are unified."],
          ["Two countries live", "Côte d'Ivoire and Liberia are active today. Nigeria, Ghana, Senegal are on the 2026 roadmap."],
          ["One partner login", "Sign in once — access every BAKĒD app you're onboarded onto. No extra passwords."],
        ].map(([title, body]) => (
          <div key={title}>
            <div className="text-sm font-bold">{title}</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>

    <footer className="border-t border-border py-6 text-center text-[11px] text-muted-foreground">
      © 2026 BAKĒD · <Link to="/" className="hover:text-foreground">Customer app</Link> · <Link to="/admin" className="hover:text-foreground">Admin</Link>
    </footer>
  </div>
);
