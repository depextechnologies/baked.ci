import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";

/**
 * ExpressHeader — matches the PDF spec: back button + centered title + optional
 * right-aligned "Step X of Y" or "Help" text. Used across every Express screen.
 */
export const ExpressHeader = ({ title, step, totalSteps = 5, right, onBack }) => {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="px-3 h-14 flex items-center gap-2">
        <button data-testid="exp-header-back" onClick={handleBack} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-secondary motion-fast active:scale-95">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">EXPRESSbakēd</div>
          <div className="text-sm font-bold truncate">{title}</div>
        </div>
        {step != null ? (
          <div className="min-w-[64px] text-right text-[11px] font-semibold text-muted-foreground">Step {step} of {totalSteps}</div>
        ) : (
          <div className="min-w-[64px] text-right">{right}</div>
        )}
      </div>
    </header>
  );
};

/**
 * WizardProgress — 5-dot progress bar with labels below (parcel) or steps (movers).
 * Green fill + checkmark for completed; solid green ring for current; muted for upcoming.
 */
export const WizardProgress = ({ steps, current }) => (
  <div className="px-4 pt-3 pb-1" data-testid="exp-wizard-progress">
    <div className="flex items-center">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.code}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                done ? "text-black" : active ? "text-black ring-2 ring-offset-2 ring-offset-background" : "bg-secondary text-muted-foreground border border-border"
              }`}
              style={done || active ? { backgroundColor: "#77BC1F" } : undefined}>
                {done ? "✓" : i + 1}
              </div>
              <div className={`text-[9px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-1 rounded-full ${done ? "" : "bg-border"}`} style={done ? { backgroundColor: "#77BC1F" } : undefined} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

/**
 * ExpressFooter — sticky bottom bar with left brand + right Continue CTA.
 */
export const ExpressFooter = ({ onContinue, disabled, label = "Continue", loading, testid = "exp-footer-continue" }) => (
  <div className="sticky bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md px-4 py-3 flex items-center gap-3">
    <div className="text-[10px] font-bold tracking-widest text-muted-foreground">bakēd</div>
    <div className="flex-1" />
    <button
      data-testid={testid}
      onClick={onContinue}
      disabled={disabled || loading}
      className="baked-btn h-11 px-6 font-bold text-black motion-fast active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundColor: "#77BC1F" }}
    >
      {loading ? "…" : label}
    </button>
  </div>
);

/**
 * Currency helper — respects XOF/LRD whole-number rendering.
 */
export const useMoney = () => {
  const { country } = useApp();
  const currency = country?.currency;
  const symbol = country?.currency_symbol;
  return (amount, options = {}) => {
    if (amount == null || isNaN(amount)) return "";
    const n = Number(amount);
    if (currency === "XOF") return `${Math.round(n).toLocaleString("fr-FR")} ${symbol || "CFA"}`;
    if (currency === "LRD") return `${symbol || "L$"}${Math.round(n).toLocaleString("en-US")}`;
    return `${symbol || ""}${n.toFixed(options.decimals ?? 2)}`;
  };
};
