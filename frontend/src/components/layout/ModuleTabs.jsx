import React from "react";
import { MODULES } from "../../lib/modules";
import { useApp } from "../../contexts/BakedContexts";
import { useNavigate } from "react-router-dom";
import { BrandedModuleLabel } from "./BakedLogo";
import { MODULE_TAB } from "../../constants/testIds";
import { toast } from "sonner";

// Getir-style premium tab bar:
// - No icons, no taglines — only the module wordmark
// - Active tab appears as a raised card that "sits above" the strip
// - Inactive tabs are flat, dimmed wordmarks that brighten on hover
export const ModuleTabs = () => {
  const { activeModule, setActiveModule } = useApp();
  const navigate = useNavigate();

  const onTab = (m) => {
    setActiveModule(m.code);
    if (m.status !== "active") {
      toast(`${m.label}bakēd — Coming soon`, { description: m.tagline });
      navigate(m.route);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="baked-container">
      <div className="module-tabs-strip">
        {MODULES.map((m) => {
          const isActive = m.code === activeModule;
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
