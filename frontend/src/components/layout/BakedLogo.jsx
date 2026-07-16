import React from "react";

// The bakēd wordmark with the tiny red smile from the mobile screens
export const BakedLogo = ({ size = "md", className = "", "data-testid": testId }) => {
  const sizeMap = { sm: "text-xl", md: "text-2xl", lg: "text-5xl" };
  return (
    <div className={`inline-flex flex-col items-center ${className}`} data-testid={testId}>
      <span className={`baked-logo-text ${sizeMap[size]} text-foreground`}>bak<span style={{ textDecoration: "overline" }}>e</span>d</span>
      <span className="baked-logo-smile" />
    </div>
  );
};

// Little inline version used inside module tabs (e.g. "MARTbakēd")
export const BrandedModuleLabel = ({ label, color, className = "" }) => (
  <div className={`flex items-baseline gap-0.5 ${className}`}>
    <span className="baked-logo-text text-[22px] tracking-tight" style={{ color }}>{label}</span>
    <span className="baked-logo-text text-[22px] tracking-tight text-foreground">bak<span style={{ textDecoration: "overline" }}>e</span>d</span>
  </div>
);
