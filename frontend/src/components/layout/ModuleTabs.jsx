import React from "react";
import { MODULES } from "../../lib/modules";
import { useApp } from "../../contexts/BakedContexts";
import { useNavigate } from "react-router-dom";
import { BrandedModuleLabel } from "./BakedLogo";
import { MODULE_TAB } from "../../constants/testIds";
import { toast } from "sonner";

export const ModuleTabs = () => {
  const { activeModule, setActiveModule } = useApp();
  const navigate = useNavigate();
  return (
    <div className="baked-container mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const isActive = m.code === activeModule;
          return (
            <button
              key={m.code}
              data-testid={MODULE_TAB(m.code)}
              onClick={() => {
                setActiveModule(m.code);
                if (m.status !== "active") {
                  toast(`${m.label}bakēd — Coming soon`, { description: m.tagline });
                  navigate(m.route);
                } else {
                  navigate("/");
                }
              }}
              className={`module-tab p-4 flex items-center gap-3 text-left motion-normal ${isActive ? "active" : ""}`}
              style={isActive ? { color: m.color } : {}}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${m.color}22`, color: m.color }}
              >
                <Icon size={26} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <BrandedModuleLabel label={m.label} color={m.color} height={20} />
                <div className="text-[11px] text-muted-foreground truncate">{m.tagline}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
