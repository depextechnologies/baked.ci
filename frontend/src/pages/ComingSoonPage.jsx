import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getModule } from "../lib/modules";
import { Button } from "../components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { BrandedModuleLabel } from "../components/layout/BakedLogo";
import { useApp } from "../contexts/BakedContexts";

export const ComingSoonPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveModule } = useApp();
  const code = location.pathname.replace("/", "").split("/")[0] || "mart";
  const m = getModule(code);
  const Icon = m.icon;
  useEffect(() => { setActiveModule(code); }, [code, setActiveModule]);

  return (
    <div className="baked-container my-16 text-center">
      <div className="max-w-md mx-auto">
        <div
          className="w-24 h-24 rounded-3xl mx-auto flex items-center justify-center mb-6"
          style={{ backgroundColor: `${m.color}22`, color: m.color }}
        >
          <Icon size={48} strokeWidth={2} />
        </div>
        <div className="flex justify-center">
          <BrandedModuleLabel label={m.label} color={m.color} className="text-4xl" />
        </div>
        <p className="mt-2 text-muted-foreground">{m.tagline}</p>
        <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 baked-chip border border-border text-xs">
          <Sparkles size={14} style={{ color: m.color }} /> Coming soon to C&ocirc;te d&apos;Ivoire
        </div>
        <p className="mt-8 text-sm text-muted-foreground max-w-sm mx-auto">
          The BAKĒD platform is expanding. {m.label}bakēd is currently in build.
          For now, explore MARTbakēd to get groceries delivered in 10–15 minutes.
        </p>
        <Button onClick={() => navigate("/")} className="mt-6 baked-btn h-11 px-6 font-semibold text-black" style={{ backgroundColor: "#77BC1F" }}>
          Go to MARTbakēd <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    </div>
  );
};
