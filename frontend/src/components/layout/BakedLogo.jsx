import React from "react";
import { useApp } from "../../contexts/BakedContexts";

// ------- Official brand assets -------
// Primary BAKĒD wordmark. The two variants below are the approved masters
// supplied via Fixing_Prompt.docx (P0 correction pass). Use the dark-bg
// variant on dark surfaces and the light-bg variant on light surfaces.
const LOGO = {
  primary: {
    // Dark-background version: white wordmark on black.
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/h99r81z3_WhatsApp%20Image%202026-05-31%20at%208.26.46%20PM%20%281%29.jpeg",
    // Light-background version: black wordmark on white.
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/s7zvso1h_WhatsApp%20Image%202026-05-31%20at%208.26.47%20PM%20%281%29.jpeg",
  },
};

// Per-module wordmark JPEGs (dark-mode originals — colored prefix + white "bakēd" on black).
// Light-mode assets are provided only for MART; other modules fall back to the text mark
// (same look: coloured prefix + themed "bakēd").
const MODULE_LOGO = {
  mart: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/aob12pre_WhatsApp%20Image%202026-05-31%20at%208.26.50%20PM.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/ms4tx02n_WhatsApp%20Image%202026-05-31%20at%208.26.50%20PM%20%281%29.jpeg",
  },
  food: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/awqz7sza_WhatsApp%20Image%202026-05-31%20at%208.26.49%20PM%20%282%29.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/nxicofue_WhatsApp%20Image%202026-05-31%20at%208.26.49%20PM%20%283%29.jpeg",
  },
  shop: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/e6t06vzj_WhatsApp%20Image%202026-05-31%20at%208.26.49%20PM%20%281%29.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/3icgdfzs_WhatsApp%20Image%202026-05-31%20at%208.26.48%20PM%20%282%29.jpeg",
  },
  express: {
    // SENDbakēd — official brand assets. The internal module identifier
    // remains `express` (routes, DB, permissions unchanged); only the
    // user-facing wordmark and label are rebranded to SENDbakēd.
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/xaactaon_SENDbakedDark.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/odl93m8h_SENDbaked.jpeg",
  },
  auto: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/3jzhiamn_WhatsApp%20Image%202026-05-31%20at%208.26.47%20PM%20%282%29.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/mtpf8vyp_WhatsApp%20Image%202026-05-31%20at%208.26.47%20PM.jpeg",
  },
  immo: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/z62ps21t_WhatsApp%20Image%202026-05-31%20at%208.26.50%20PM%20%282%29.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/tmw6nkj4_WhatsApp%20Image%202026-05-31%20at%208.26.48%20PM%20%281%29.jpeg",
  },
};

// Primary bakēd logo — theme-aware.
export const BakedLogo = ({ size = "md", className = "", "data-testid": testId }) => {
  const { theme } = useApp() || { theme: "dark" };
  const src = theme === "dark" ? LOGO.primary.dark : LOGO.primary.light;
  const heightMap = { sm: 24, md: 32, lg: 75 };
  return (
    <img
      src={src}
      alt="bakēd"
      data-testid={testId}
      className={`inline-block select-none ${className}`}
      style={{ height: heightMap[size], width: "auto" }}
      draggable={false}
    />
  );
};

// Text wordmark fallback — coloured prefix + themed "bakēd".
const TextWordmark = ({ label, color, height, className = "" }) => (
  <div className={`inline-flex items-baseline gap-0 leading-none whitespace-nowrap ${className}`}>
    <span className="font-extrabold tracking-tight" style={{ color, fontSize: height, letterSpacing: "-0.03em" }}>{label}</span>
    <span className="font-extrabold tracking-tight text-foreground" style={{ fontSize: height, letterSpacing: "-0.03em" }}>
      bak<span style={{ textDecoration: "overline" }}>e</span>d
    </span>
  </div>
);

// Per-module branded wordmark. Uses the official JPEG when available for the current theme;
// otherwise falls back to the text wordmark with the correct module colour.
export const BrandedModuleLabel = ({ code, label, color, className = "", height = 22, forceTheme }) => {
  const { theme: appTheme } = useApp() || { theme: "dark" };
  const theme = forceTheme || appTheme;
  const asset = MODULE_LOGO[code];
  const src = asset ? (theme === "dark" ? asset.dark : asset.light) : null;
  if (!src) {
    return <TextWordmark label={label} color={color} height={height} className={className} />;
  }
  // Express module has been rebranded to SENDbakēd in the UI — reflect this
  // in the alt text without touching the internal `code`.
  const altBrand = code === "express" ? "SENDbakēd" : `${label}bakēd`;
  return (
    <img
      src={src}
      alt={altBrand}
      className={`inline-block select-none ${theme === "dark" ? "logo-blend-dark" : "logo-blend-light"} ${className}`}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
};

// Large MARTbakēd combined wordmark — kept for the MART hero, always dark variant.
export const MartLogoImage = ({ height = 48, className = "", forceTheme = "dark" }) => (
  <BrandedModuleLabel code="mart" label="MART" color="#77BC1F" height={height} className={className} forceTheme={forceTheme} />
);
