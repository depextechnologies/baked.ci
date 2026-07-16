import React from "react";
import { useApp } from "../../contexts/BakedContexts";

// Official brand assets provided by the user.
const LOGO = {
  primary: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/ywbvm3ro_Baked_New_Logo_Transparent.png",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/mg5pgkyt_Baked_New_Logo__Blue_Black_Transparent.png",
  },
  mart: {
    dark: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/aob12pre_WhatsApp%20Image%202026-05-31%20at%208.26.50%20PM.jpeg",
    light: "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/ms4tx02n_WhatsApp%20Image%202026-05-31%20at%208.26.50%20PM%20%281%29.jpeg",
  },
};

// Primary bakēd logo — theme-aware. Used in top-nav, footer, auth dialog.
export const BakedLogo = ({ size = "md", className = "", "data-testid": testId }) => {
  const { theme } = useApp() || { theme: "dark" };
  const src = theme === "dark" ? LOGO.primary.dark : LOGO.primary.light;
  const heightMap = { sm: 24, md: 32, lg: 64 };
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

// Text-based branded module wordmark — visually consistent for all 6 modules in tab bars.
// e.g. renders "MART" in module color + "bakēd" in theme text color.
export const BrandedModuleLabel = ({ label, color, className = "", height = 22 }) => (
  <div className={`flex items-baseline gap-0 leading-none ${className}`}>
    <span className="font-extrabold tracking-tight" style={{ color, fontSize: height, letterSpacing: "-0.03em" }}>{label}</span>
    <span className="font-extrabold tracking-tight text-foreground" style={{ fontSize: height, letterSpacing: "-0.03em" }}>
      bak<span style={{ textDecoration: "overline" }}>e</span>d
    </span>
  </div>
);

// Large MARTbakēd combined wordmark — used only in hero areas where it can breathe.
// forceTheme allows callers (e.g. always-dark hero cards) to override the app theme.
export const MartLogoImage = ({ height = 48, className = "", forceTheme }) => {
  const { theme: appTheme } = useApp() || { theme: "dark" };
  const theme = forceTheme || appTheme;
  const src = theme === "dark" ? LOGO.mart.dark : LOGO.mart.light;
  return (
    <img
      src={src}
      alt="MARTbakēd"
      className={`inline-block select-none ${theme === "dark" ? "logo-blend-dark" : "logo-blend-light"} ${className}`}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
};
