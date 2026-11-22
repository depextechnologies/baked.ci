/**
 * Partner module registry (P0 URL correction pass).
 *
 * Maps user-facing module slugs (used in URLs) to their metadata:
 *   - code             internal module identifier (unchanged, e.g. "express")
 *   - label            user-facing brand label (e.g. "bSEND")
 *   - color            module accent colour
 *   - isLive           whether the module has a real portal today
 *   - backendModule    slug the backend expects (JWT / permissions)
 *
 * The internal EXPRESS module identifier is intentionally kept because the
 * P0 change is a *visual* rebrand only — routes, DB and permissions are
 * unaffected. See `Fixing_Prompt.docx` §1 and §14.
 */

export const PARTNER_MODULES = {
  // `ownerLoginHref` — if present, the module hub links straight to that
  // dedicated login page instead of the generic /partner-portal/{slug}/login
  // shell. Used for modules whose portals live outside the partner-portal
  // app (FOOD, SHOP, SEND).
  martbaked:  { code: "mart",    label: "bMART",  color: "#77BC1F", isLive: true,  backendModule: "mart"    },
  shopbaked:  { code: "shop",    label: "bSHOP",  color: "#1D9BF0", isLive: true,  backendModule: "shop",    ownerLoginHref: "/shopbaked/sellers/login" },
  foodbaked:  { code: "food",    label: "bFOOD",  color: "#F26924", isLive: true,  backendModule: "food",    ownerLoginHref: "/partner/food/login" },
  autobaked:  { code: "auto",    label: "bAUTO",  color: "#FF4C52", isLive: false, backendModule: "auto"    },
  immobaked:  { code: "immo",    label: "bIMMO",  color: "#A659FF", isLive: false, backendModule: "immo"    },
  sendbaked:  { code: "express", label: "bSEND",  color: "#FCC44C", isLive: true,  backendModule: "express", ownerLoginHref: "/driver/login" },
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
