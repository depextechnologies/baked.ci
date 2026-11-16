import React from "react";
import { useApp } from "../../contexts/BakedContexts";
import { getModule } from "../../lib/modules";

// ------- Official brand assets -------
// Primary BAKĒD wordmark. Provided as transparent PNGs so they blend
// on any background — white glyph for dark surfaces, black glyph for
// light surfaces. Themed via `useApp().theme`.
const LOGO = {
  primary: {
    // Dark-background version: white wordmark.
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/yz6nfmbn_Baked_Black.png",
    // Light-background version: black wordmark.
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/21jnti32_Baked_White.png",
  },
};

// Per-module wordmarks (b-badge + coloured name). Official dark-mode PNGs (transparent);
// light mode and IMMO/AUTO use the text logo until their official files are supplied.
const MODULE_LOGO = {
  mart: { dark: "/logos/v2/bmart-dark.png" },
  food: { dark: "/logos/v2/bfood-dark.png" },
  shop: { dark: "/logos/v2/bshop-dark.png" },
  express: { dark: "/logos/v2/bsend-dark.png" },
};
const BADGE = { dark: "/logos/v2/badge-on-dark.png", light: "/logos/v2/badge-on-light.png" };

// Primary bakēd logo — theme-aware.
export const BakedLogo = ({ size = "md", className = "", "data-testid": testId }) => {
  const { theme } = useApp() || { theme: "dark" };
  const src = theme === "dark" ? LOGO.primary.dark : LOGO.primary.light;
  const heightMap = { sm: 28, md: 40, lg: 70 };
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

// Text logo — b-badge + module name in the module colour.
const TextWordmark = ({ label, color, height, theme, className = "" }) => (
  <div className={`inline-flex items-center leading-none whitespace-nowrap ${className}`} style={{ gap: height * 0.18 }} aria-label={`b${label}`}>
    <img src={theme === "dark" ? BADGE.dark : BADGE.light} alt="" style={{ height, width: height }} draggable={false} />
    <span className="font-extrabold" style={{ color, fontSize: height * 0.86, letterSpacing: "-0.02em" }}>{label}</span>
  </div>
);

// Per-module branded wordmark. Uses the official logo when available for the current theme;
// otherwise falls back to the text wordmark with the correct module colour.
export const BrandedModuleLabel = ({ code, label, color, className = "", height = 22, forceTheme }) => {
  const { theme: appTheme } = useApp() || { theme: "dark" };
  const theme = forceTheme || appTheme;
  const asset = MODULE_LOGO[code];
  const src = asset ? asset[theme] : null;
  const m = getModule(code);
  if (!src) {
    return <TextWordmark label={label || m.label} color={color || m.color} height={height} theme={theme} className={className} />;
  }
  return (
    <img
      src={src}
      alt={`b${label || m.label}`}
      className={`inline-block select-none ${className}`}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
};

// Large bMART combined wordmark — kept for the MART hero, always dark variant.
export const MartLogoImage = ({ height = 48, className = "", forceTheme = "dark" }) => (
  <BrandedModuleLabel code="mart" label="MART" color="#77BC1F" height={height} className={className} forceTheme={forceTheme} />
);
