/**
 * BAKĒD Platform — i18n Foundation (Phase A · Workstream 3)
 *
 * Central i18next initialisation used by every shell (customer, admin,
 * seller, driver). Set French as the default; expose English as a live
 * toggle. Keys are namespaced per surface so lazy-loading remains an
 * option later (e.g. only ship admin.json to the admin bundle).
 *
 * Design contract:
 *   • Language persists in localStorage.baked_language (same key the
 *     AppProvider has always used) so the pre-i18n toggle keeps working.
 *   • `AppProvider.setLanguage(next)` invokes i18n.changeLanguage — the
 *     hook + the context stay in lock-step.
 *   • Resource bundles are imported statically so we get one deterministic
 *     first-paint (no async / Suspense race with SSR-less CRA).
 *   • Missing keys fall back to the key path in dev (console warning) so
 *     new strings surface immediately.
 */

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// ---------------- Resource bundles ----------------
// Static imports keep the initial paint deterministic. Later phases can
// switch to `i18next-http-backend` + code-splitting per shell without
// touching the call sites.
import frCommon from "./locales/fr/common.json";
import enCommon from "./locales/en/common.json";
import frCustomer from "./locales/fr/customer.json";
import enCustomer from "./locales/en/customer.json";
import frAdmin from "./locales/fr/admin.json";
import enAdmin from "./locales/en/admin.json";
import frSeller from "./locales/fr/seller.json";
import enSeller from "./locales/en/seller.json";
import frDriver from "./locales/fr/driver.json";
import enDriver from "./locales/en/driver.json";
import frLanding from "./locales/fr/landing.json";
import enLanding from "./locales/en/landing.json";
import frPartner from "./locales/fr/partner.json";
import enPartner from "./locales/en/partner.json";

export const SUPPORTED_LANGUAGES = ["fr", "en"];
export const DEFAULT_LANGUAGE = "fr"; // French-first per client brief

const resources = {
  fr: {
    common: frCommon,
    customer: frCustomer,
    admin: frAdmin,
    seller: frSeller,
    driver: frDriver,
    landing: frLanding,
    partner: frPartner,
  },
  en: {
    common: enCommon,
    customer: enCustomer,
    admin: enAdmin,
    seller: enSeller,
    driver: enDriver,
    landing: enLanding,
    partner: enPartner,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: "common",
    ns: ["common", "customer", "admin", "seller", "driver", "landing", "partner"],
    interpolation: { escapeValue: false }, // React already sanitises
    detection: {
      // Order matters — an explicit user choice (URL param or localStorage)
      // wins. We deliberately DROP `navigator` from the chain so that
      // BAKĒD stays French-first for every new visitor in every browser
      // locale (per client brief). English is only reached via the
      // in-app toggle (persists to localStorage) or the ?lang=en query.
      // Also drop `cookie` from caches so a stale cross-session cookie
      // (Playwright / preview URLs occasionally retain one) can't pin
      // the language to English forever. localStorage alone is enough.
      order: ["querystring", "localStorage"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "baked_language",
      caches: ["localStorage"],
    },
    react: {
      // Text updates are synchronous — no Suspense boundary needed since
      // resources are bundled at build time.
      useSuspense: false,
    },
    // Dev-only helpers so missing keys don't hide silently.
    saveMissing: process.env.NODE_ENV !== "production",
    missingKeyHandler: (lngs, ns, key) => {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key ${ns}:${key} for ${lngs.join(",")}`);
      }
    },
  });

// Keep the <html lang> attribute in sync so screen readers + Google switch
// pronunciation on language change.
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
});

export default i18n;
