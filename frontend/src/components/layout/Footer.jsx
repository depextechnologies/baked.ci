import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalePath } from "../../i18n/routes";
import { BakedLogo } from "./BakedLogo";

/**
 * Site footer — bilingual (FR default, EN toggle). Labels flow through
 * `useTranslation("common")` → footer.* keys. Routes are unchanged.
 */

const LinkList = ({ items }) => (
  <ul className="text-xs text-muted-foreground space-y-2.5">
    {items.map(([label, to]) => (
      <li key={to}>
        <Link
          to={to}
          data-testid={`footer-link-${to.replace(/^\//, "").replace(/\W+/g, "-")}`}
          className="hover:text-foreground motion-fast"
        >
          {label}
        </Link>
      </li>
    ))}
  </ul>
);

const GooglePlayBadge = () => (
  <a
    href="https://play.google.com/store"
    target="_blank"
    rel="noopener noreferrer"
    data-testid="footer-store-google-play"
    aria-label="Get it on Google Play"
    className="inline-flex items-center gap-2 h-11 px-3 rounded-lg bg-black text-white border border-white/20 hover:bg-black/80 motion-fast"
  >
    <svg width="18" height="20" viewBox="0 0 40 44" aria-hidden="true">
      <path fill="#EA4335" d="M22.3 21L3.8 2.6C4.4 2.2 5.1 2 5.9 2L28 15.1z" />
      <path fill="#FBBC04" d="M28 15.1L38.4 21c1 .5 1 2 0 2.5L28 29.4l-5.7-8.4z" />
      <path fill="#34A853" d="M22.3 21L28 29.4 5.9 42.5c-.8 0-1.5-.2-2.1-.6z" />
      <path fill="#4285F4" d="M3.8 2.6L22.3 21 3.8 39.4C3 39 2.5 38 2.5 37V5c0-1 .5-2 1.3-2.4z" />
    </svg>
    <div className="leading-tight text-left">
      <div className="text-[9px] uppercase tracking-widest">Get it on</div>
      <div className="text-sm font-semibold -mt-0.5">Google Play</div>
    </div>
  </a>
);

const AppStoreBadge = () => (
  <a
    href="https://www.apple.com/app-store/"
    target="_blank"
    rel="noopener noreferrer"
    data-testid="footer-store-app-store"
    aria-label="Download on the App Store"
    className="inline-flex items-center gap-2 h-11 px-3 rounded-lg bg-black text-white border border-white/20 hover:bg-black/80 motion-fast"
  >
    <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
    <div className="leading-tight text-left">
      <div className="text-[9px] uppercase tracking-widest">Download on the</div>
      <div className="text-sm font-semibold -mt-0.5">App Store</div>
    </div>
  </a>
);

const SectionTitle = ({ children }) => (
  <div className="text-sm font-semibold mb-4">{children}</div>
);

export const Footer = () => {
  const { t } = useTranslation("common");
  const path = useLocalePath();
  const USEFUL_LINKS = [
    [t("footer.about_us"),  "/about"],
    [t("footer.faqs"),      "/help"],
    [t("footer.blog"),      "/blog"],
    [t("footer.career"),    "/careers"],
  ];
  const OPPORTUNITIES = [
    [t("footer.partner"),          "/partner"],
    [t("footer.sell"),             "/Sell-on-baked"],
    [t("footer.delivery_partner"), "/driver"],
    [t("footer.invest"),           "/invest"],
  ];
  const SUPPORT = [
    [t("footer.help_center"), "/help"],
    [t("footer.contact"),     "/contact"],
    [t("footer.terms"),       path("terms")],
    [t("footer.privacy"),     path("privacy")],
  ];
  return (
    <footer className="mt-16 border-t border-border" data-testid="site-footer">
      <div className="baked-container py-12 grid gap-10 md:grid-cols-4">
        <div>
          <BakedLogo size="md" />
          <div className="mt-6 flex flex-col gap-3" data-testid="footer-store-badges">
            <GooglePlayBadge />
            <AppStoreBadge />
          </div>
        </div>
        <div>
          <SectionTitle>{t("footer.useful_links")}</SectionTitle>
          <LinkList items={USEFUL_LINKS} />
        </div>
        <div>
          <SectionTitle>{t("footer.opportunities")}</SectionTitle>
          <LinkList items={OPPORTUNITIES} />
        </div>
        <div>
          <SectionTitle>{t("footer.support")}</SectionTitle>
          <LinkList items={SUPPORT} />
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="baked-container py-4 text-[11px] text-muted-foreground text-center" data-testid="footer-copyright">
          {t("footer.copyright", { year: new Date().getFullYear() })}
        </div>
      </div>
    </footer>
  );
};
