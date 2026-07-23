import React, { useEffect } from "react";
import { MODULES } from "../../lib/modules";
import { useApp } from "../../contexts/BakedContexts";
import { useNavigate, useLocation } from "react-router-dom";
import { BrandedModuleLabel } from "./BakedLogo";
import { MODULE_TAB } from "../../constants/testIds";
import { toast } from "sonner";

// Getir-style premium tab bar:
// - No icons, no taglines — only the module wordmark
// - Active tab appears as a raised card that "sits above" the strip
// - Inactive tabs are flat, dimmed wordmarks that brighten on hover
// - Active module is derived from the current route so only one tab is ever
//   highlighted (fixes MART leaking onto /express, etc.).
const routeToModule = (pathname) => {
  if (pathname.startsWith("/express")) return "express";
  if (pathname.startsWith("/food")) return "food";
  if (pathname.startsWith("/shop")) return "shop";
  if (pathname.startsWith("/auto")) return "auto";
  if (pathname.startsWith("/immo")) return "immo";
  return "mart";
};

export const ModuleTabs = () => {
  const { activeModule, setActiveModule } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const routeModule = routeToModule(location.pathname);

  // Keep the global activeModule state in sync with the URL so that direct
  // navigation (paste link / back button) also highlights the correct tab.
  useEffect(() => {
    if (routeModule !== activeModule) setActiveModule(routeModule);
  }, [routeModule, activeModule, setActiveModule]);

  const onTab = (m) => {
    setActiveModule(m.code);
    // Route to the module's own home. Coming-soon modules still render their
    // coming-soon page from their own route so the highlight remains correct.
    navigate(m.route);
    if (m.status !== "active") {
      toast(`${m.label}bakēd — Coming soon`, { description: m.tagline });
    }
  };

  return (
    <div className="baked-container">
      <div className="module-tabs-strip">
        {MODULES.map((m) => {
          const isActive = m.code === routeModule;
          return (
            <button
              key={m.code}
              data-testid={MODULE_TAB(m.code)}
              onClick={() => onTab(m)}
              className={`module-tab-btn ${isActive ? "active" : ""}`}
              style={isActive ? { color: m.color } : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              <BrandedModuleLabel code={m.code} label={m.label} color={m.color} height={30} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
