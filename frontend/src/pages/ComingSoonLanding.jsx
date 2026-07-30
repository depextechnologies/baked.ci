import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { BakedLogo } from "../components/layout/BakedLogo";

/**
 * Reusable placeholder for the 18 footer routes (Fixing_Prompt.docx §6).
 * Every route resolves here until its dedicated content is authored. The
 * title/description is inferred from the URL slug so we don't have to
 * maintain a lookup map when new links are added.
 */

const SLUG_LABELS = {
  "shop/seller":  ["SHOPbakēd Seller",  "Sell your products to buyers across Africa on SHOPbakēd."],
  "food/partner": ["FOODbakēd Partner", "Bring your restaurant, cloud kitchen or bakery onto FOODbakēd."],
  "mart/partner": ["MARTbakēd Partner", "Partner with MARTbakēd for grocery, retail and store enablement."],
  "mart/seller":  ["MARTbakēd Seller",  "List and sell your inventory on MARTbakēd."],
  "auto/partner": ["AUTObakēd Partner", "Onboard your dealership or garage as an AUTObakēd partner."],
  "auto/seller":  ["AUTObakēd Seller",  "Sell your vehicle or fleet on AUTObakēd."],
  "immo/partner": ["IMMObakēd Partner", "Real-estate partners power the IMMObakēd network."],
  "immo/agent":   ["IMMObakēd Agent",   "Join IMMObakēd as a licensed real-estate agent."],
  "immo/broker":  ["IMMObakēd Broker",  "Brokers manage listings and close deals faster on IMMObakēd."],
  "blog":         ["Blog",              "Deep-dives, product notes, and stories from the BAKĒD team."],
  "news":         ["News",              "Press releases and platform announcements."],
  "careers":      ["Careers",           "Build the future of African commerce with us."],
  "help":         ["Help Center",       "Answers, guides, and support for every BAKĒD user."],
  "contact":      ["Contact us",        "We'd love to hear from you."],
  "terms":        ["Terms of Service",  "The legal terms that govern your use of BAKĒD."],
  "privacy":      ["Privacy Policy",    "How BAKĒD collects, uses and protects your data."],
  "investors":            ["Investor Relations",       "Financials, milestones and how to invest in BAKĒD."],
  "franchise":            ["Franchise Opportunities",  "Bring the BAKĒD network to your city or country."],
  "delivery-partner":     ["Delivery Partner",         "Own a fleet? Become a BAKĒD delivery partner."],
  "driver-registration":  ["Driver Registration",      "Earn with EXPRESSbakēd — sign up as a driver."],
  "merchant-registration":["Merchant Registration",    "One form to onboard your business to every BAKĒD module."],
};

const humanize = (slug) => slug.split("/").map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(" · ");

export const ComingSoonLanding = () => {
  const location = useLocation();
  const slug = location.pathname.replace(/^\//, "");
  const [title, description] = SLUG_LABELS[slug] || [humanize(slug), "This page is coming soon."];

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div data-testid={`coming-soon-${slug.replace(/\//g, "-")}`} className="max-w-xl w-full text-center">
        <div className="flex justify-center mb-6"><BakedLogo size="md" /></div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-border bg-secondary text-muted-foreground mb-4">
          <Sparkles size={11} /> Coming soon
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{description}</p>
        <div className="mt-8">
          <Link
            to="/"
            data-testid="coming-soon-back-home"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl font-semibold text-black motion-fast active:scale-[0.98]"
            style={{ backgroundColor: "#FCC44C" }}
          >
            <ArrowLeft size={15} strokeWidth={2.5} /> Back to BAKĒD home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonLanding;
