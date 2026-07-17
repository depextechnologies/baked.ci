import React from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { MODULES } from "../../lib/modules";
import { useApp } from "../../contexts/BakedContexts";

/**
 * AppSelectorSheet — bottom-sheet drawer opened by the center FAB.
 * Displays the six BAKĒD applications on a 2-col grid.
 * Tapping an active card switches the active module and closes the sheet.
 */
export const AppSelectorSheet = ({ open, onClose }) => {
  const nav = useNavigate();
  const { setActiveModule } = useApp();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        data-testid="m-app-selector-backdrop"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm motion-fast"
      />

      <div
        data-testid="m-app-selector-sheet"
        className="relative bg-card border-t border-border rounded-t-[24px] shadow-2xl pb-[calc(env(safe-area-inset-bottom)+16px)] max-h-[85vh] overflow-y-auto"
        style={{ animation: "sheet-in 240ms cubic-bezier(.2,.9,.2,1)" }}
      >
        <div className="pt-3 pb-2 flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

        <div className="px-5 pb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">The BAKĒD ecosystem</div>
            <div className="text-lg font-bold mt-0.5">Choose an app</div>
          </div>
          <button data-testid="m-app-selector-close" onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 motion-fast" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          {MODULES.map((m) => {
            const Icon = m.icon;
            const isActive = m.status === "active";
            return (
              <button
                key={m.code}
                data-testid={`m-app-selector-${m.code}`}
                disabled={!isActive}
                onClick={() => {
                  setActiveModule(m.code);
                  nav(m.route);
                  onClose();
                }}
                className={`relative baked-card border p-4 text-left overflow-hidden motion-normal ${isActive ? "hover:scale-[1.02]" : "opacity-50"}`}
                style={{
                  borderColor: isActive ? `${m.color}55` : "hsl(var(--border))",
                  background: isActive
                    ? `linear-gradient(135deg, ${m.color}22 0%, ${m.color}05 60%)`
                    : "hsl(var(--card))",
                }}
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: `${m.color}22`, color: m.color }}>
                  <Icon size={22} />
                </div>
                <div className="text-base font-bold leading-none">
                  {m.label}<span className="text-muted-foreground font-normal">bakēd</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{m.tagline}</div>
                {!isActive && (
                  <span className="absolute top-3 right-3 text-[9px] uppercase tracking-widest baked-chip px-2 py-0.5 bg-secondary text-muted-foreground">Soon</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-5 pb-2 text-[11px] text-muted-foreground text-center">
          One account · One cart · Six services
        </div>
      </div>
    </div>
  );
};
