import React from "react";
import { Link } from "react-router-dom";
import { BakedLogo } from "./BakedLogo";

/**
 * Global site footer — content structure per Fixing_Prompt.docx (2026-07-29).
 *
 * Removed: platform description + "Platform" column + "Available in" column.
 * Added:   "Useful Links" (2 sub-columns) and "Opportunities" column.
 * Kept:    "Support" column (per user's follow-up instruction).
 *
 * Styling, layout, and premium black theme are unchanged — this is a pure
 * navigation/content update. Every link is a real <Link> to its own route so
 * dedicated landing pages can be filled in without touching the footer again.
 */

const LinkList = ({ items }) => (
  <ul className="text-xs text-muted-foreground space-y-2">
    {items.map(([label, to]) => (
      <li key={to}>
        <Link
          to={to}
          data-testid={`footer-link-${to.replace(/^\//, "").replace(/\//g, "-")}`}
          className="hover:text-foreground motion-fast"
        >
          {label}
        </Link>
      </li>
    ))}
  </ul>
);

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

// Opportunities — per Fixing_Prompt.docx (Partner Hub 2026-02):
// five canonical partner entry points. "Partner with BAKĒD" opens the new
// /partner hub with four opportunity cards; "Sell on BAKĒD" jumps directly
// to the seller landing at /Sell-on-baked.
const OPPORTUNITIES = [
  ["Partner with BAKĒD",       "/partner"],
  ["Sell on BAKĒD",            "/Sell-on-baked"],
  ["Franchise Opportunities",  "/franchise"],
  ["Delivery Partner",         "/delivery-partner"],
  ["Merchant Registration",    "/merchant-registration"],
];

// Support — kept as-is per user's request. Existing routes preserved.
const SUPPORT = [
  ["Help Center", "/help"],
  ["Contact us", "/contact"],
  ["Terms",      "/terms"],
  ["Privacy",    "/privacy"],
];

export const Footer = () => (
  <footer className="mt-16 border-t border-border">
    <div className="baked-container py-10 grid gap-8 md:grid-cols-5">
      {/* Brand column — logo only, no description (per spec) */}
      <div>
        <BakedLogo size="md" />
      </div>

      {/* Useful Links — two sub-columns per spec */}
      <div className="md:col-span-2">
        <div className="text-sm font-semibold mb-3">Useful Links</div>
        <div className="grid grid-cols-2 gap-6">
          <LinkList items={PARTNERS_SELLERS} />
          <LinkList items={BUSINESS_RESOURCES} />
        </div>
      </div>

      {/* Opportunities — replaces "Available in" */}
      <div>
        <div className="text-sm font-semibold mb-3">Opportunities</div>
        <LinkList items={OPPORTUNITIES} />
      </div>

      {/* Support — unchanged */}
      <div>
        <div className="text-sm font-semibold mb-3">Support</div>
        <LinkList items={SUPPORT} />
      </div>
    </div>
    <div className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
      © 2026 BAKĒD. Built for Africa, ready for the world.
    </div>
  </footer>
);
