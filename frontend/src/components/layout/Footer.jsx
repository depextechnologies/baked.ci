import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Twitter, Linkedin, Youtube, Mail, MapPin, Sparkles } from "lucide-react";
import { BakedLogo } from "./BakedLogo";
import { useApp } from "../../contexts/BakedContexts";

/**
 * Global site footer — Social.docx §14 refresh.
 *
 * Structure:
 *   Row 1 (5-col grid): Brand column (logo + promise + socials) ·
 *                       Useful Links (2 sub-columns) · Opportunities · Support
 *   Row 2 (thin bar):   Country · Copyright · Legal quick links
 *
 * Every link is a real <Link>/<a> to its own route.
 */

const LinkList = ({ items }) => (
  <ul className="text-xs text-muted-foreground space-y-2">
    {items.map(([label, to]) => {
      const isExternal = /^https?:\/\//i.test(to);
      const testId = `footer-link-${to.replace(/^https?:\/\//i, "").replace(/^\//, "").replace(/\W+/g, "-")}`;
      return (
        <li key={to}>
          {isExternal ? (
            <a
              href={to}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={testId}
              className="hover:text-foreground motion-fast"
            >
              {label}
            </a>
          ) : (
            <Link
              to={to}
              data-testid={testId}
              className="hover:text-foreground motion-fast"
            >
              {label}
            </Link>
          )}
        </li>
      );
    })}
  </ul>
);

const SOCIALS = [
  { href: "https://facebook.com/bakedafrica",  icon: Facebook,  label: "Facebook",  testid: "footer-social-facebook" },
  { href: "https://instagram.com/bakedafrica", icon: Instagram, label: "Instagram", testid: "footer-social-instagram" },
  { href: "https://twitter.com/bakedafrica",   icon: Twitter,   label: "Twitter/X", testid: "footer-social-twitter" },
  { href: "https://linkedin.com/company/baked",icon: Linkedin,  label: "LinkedIn",  testid: "footer-social-linkedin" },
  { href: "https://youtube.com/@bakedafrica",  icon: Youtube,   label: "YouTube",   testid: "footer-social-youtube" },
];

// Useful Links · Column 1 — Partners & Sellers
const PARTNERS_SELLERS = [
  ["SHOPbakēd Seller",  "/shop/seller"],
  ["FOODbakēd Partner", "/food/partner"],
  ["MARTbakēd Partner", "/partner-portal/martbaked/login"],
  ["MARTbakēd Seller",  "/mart/seller"],
  ["AUTObakēd Partner", "/auto/partner"],
  ["AUTObakēd Seller",  "/auto/seller"],
];

// Useful Links · Column 2 — Business & Resources
const BUSINESS_RESOURCES = [
  ["IMMObakēd Partner", "/immo/partner"],
  ["IMMObakēd Agent",   "/immo/agent"],
  ["IMMObakēd Broker",  "/immo/broker"],
  ["Blog",              "/blog"],
  ["News",              "/news"],
  ["Careers",           "/careers"],
  ["Help Center",       "/help"],
];

const OPPORTUNITIES = [
  ["Partner with BAKĒD",       "/partner"],
  ["Sell on BAKĒD",            "/Sell-on-baked"],
  ["Franchise Opportunities",  "/franchise"],
  ["Delivery Partner",         "/driver"],
  ["Merchant Registration",    "/merchant-registration"],
];

const SUPPORT = [
  ["Help Center", "/help"],
  ["Contact us", "/contact"],
  ["Terms",      "/terms"],
  ["Privacy",    "/privacy"],
];

const LEGAL = [
  ["Terms of Service", "/terms",   "footer-legal-terms"],
  ["Privacy Policy",   "/privacy", "footer-legal-privacy"],
  ["Cookie Policy",    "/cookies", "footer-legal-cookies"],
  ["Accessibility",    "/accessibility", "footer-legal-accessibility"],
];

export const Footer = () => {
  const { country } = useApp();

  return (
    <footer className="mt-16 border-t border-border" data-testid="site-footer">
      <div className="baked-container py-12 grid gap-10 md:grid-cols-5">
        {/* Brand column — logo + promise + socials */}
        <div className="md:pr-4">
          <BakedLogo size="md" />
          <div className="mt-4 flex items-start gap-2">
            <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: "#77BC1F" }} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Groceries, rides, deliveries and homes — one app for everyday Africa. Fast, fair, and unapologetically local.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2" data-testid="footer-socials">
            {SOCIALS.map(({ href, icon: Icon, label, testid }) => (
              <a
                key={testid}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                title={label}
                data-testid={testid}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/70 motion-fast"
              >
                <Icon size={15} />
              </a>
            ))}
          </div>
          <a
            href="mailto:hello@baked.africa"
            data-testid="footer-contact-email"
            className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground motion-fast"
          >
            <Mail size={12} /> hello@baked.africa
          </a>
        </div>

        {/* Useful Links — two sub-columns */}
        <div className="md:col-span-2">
          <div className="text-sm font-semibold mb-3">Useful Links</div>
          <div className="grid grid-cols-2 gap-6">
            <LinkList items={PARTNERS_SELLERS} />
            <LinkList items={BUSINESS_RESOURCES} />
          </div>
        </div>

        {/* Opportunities */}
        <div>
          <div className="text-sm font-semibold mb-3">Opportunities</div>
          <LinkList items={OPPORTUNITIES} />
        </div>

        {/* Support */}
        <div>
          <div className="text-sm font-semibold mb-3">Support</div>
          <LinkList items={SUPPORT} />
        </div>
      </div>

      {/* Legal bar */}
      <div className="border-t border-border/60">
        <div className="baked-container py-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span data-testid="footer-copyright">© {new Date().getFullYear()} BAKĒD. Built for Africa, ready for the world.</span>
            {country?.flag && (
              <span className="hidden md:inline-flex items-center gap-1" data-testid="footer-country">
                <MapPin size={10} /> {country.flag} {country.name}
              </span>
            )}
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="footer-legal-links">
            {LEGAL.map(([label, to, testid]) => (
              <Link
                key={testid}
                to={to}
                data-testid={testid}
                className="text-[11px] text-muted-foreground hover:text-foreground motion-fast"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
};
