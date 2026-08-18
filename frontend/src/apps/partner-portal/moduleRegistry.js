/**
 * Partner module registry (P0 URL correction pass).
 *
 * Maps user-facing module slugs (used in URLs) to their metadata:
 *   - code             internal module identifier (unchanged, e.g. "express")
 *   - label            user-facing brand label (e.g. "SENDbakēd")
 *   - color            module accent colour
 *   - isLive           whether the module has a real portal today
 *   - backendModule    slug the backend expects (JWT / permissions)
 *
 * The internal EXPRESS module identifier is intentionally kept because the
 * P0 change is a *visual* rebrand only — routes, DB and permissions are
 * unaffected. See `Fixing_Prompt.docx` §1 and §14.
 */

export const PARTNER_MODULES = {
  martbaked:  { code: "mart",    label: "MARTbakēd",  color: "#77BC1F", isLive: true,  backendModule: "mart" },
  shopbaked:  { code: "shop",    label: "SHOPbakēd",  color: "#3B82F6", isLive: false, backendModule: "shop" },
  foodbaked:  { code: "food",    label: "FOODbakēd",  color: "#F97316", isLive: false, backendModule: "food" },
  autobaked:  { code: "auto",    label: "AUTObakēd",  color: "#9B87F5", isLive: false, backendModule: "auto" },
  immobaked:  { code: "immo",    label: "IMMObakēd",  color: "#EC4899", isLive: false, backendModule: "immo" },
  sendbaked:  { code: "express", label: "SENDbakēd",  color: "#FCC44C", isLive: false, backendModule: "express" },
};

// The list order used by module-selector pages.
export const MODULE_ORDER = ["martbaked", "sendbaked", "shopbaked", "foodbaked", "autobaked", "immobaked"];

// Given a backend module code, return its user-facing slug.
export const slugForBackendModule = (backendModule) => {
  for (const [slug, m] of Object.entries(PARTNER_MODULES)) {
    if (m.backendModule === backendModule) return slug;
  }
  return "martbaked"; // MART is the current default active module
};

// Given a URL slug, return its metadata or `null` if not a valid module.
export const moduleForSlug = (slug) => PARTNER_MODULES[slug] || null;
