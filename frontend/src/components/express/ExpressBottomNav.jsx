import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, ClipboardList, User, Briefcase, Package } from "lucide-react";

/**
 * ExpressBottomNav — dedicated 5-tab bar for the EXPRESSbakēd module.
 *
 * Layout (per approved PDF):
 *   🏠 Home  ·  📋 Bookings  ·  ⬤ Center Switcher (large yellow FAB)  ·  🛠 Services  ·  👤 Profile
 *
 * Nothing else. No Categories, no Cart — those belong to MART only.
 * Accent: EXPRESSbakēd yellow #FCC44C.
 */
export const ExpressBottomNav = ({ onOpenAppSelector }) => {
  const nav = useNavigate();
  const loc = useLocation();

  const isActive = (paths) => paths.some((p) => (p === "/express" ? loc.pathname === "/express" : loc.pathname.startsWith(p)));

  const Item = ({ icon: Icon, label, paths, testid }) => {
    const active = isActive(paths);
    return (
      <button
        data-testid={testid}
        onClick={() => nav(paths[0])}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 motion-fast ${active ? "" : "opacity-60"}`}
      >
        <Icon size={20} style={active ? { color: "#FCC44C" } : {}} />
        <span className="text-[10px] font-semibold" style={active ? { color: "#FCC44C" } : { color: "hsl(var(--muted-foreground))" }}>{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Floating center FAB — Express yellow */}
      <button
        data-testid="exp-bnav-fab"
        onClick={onOpenAppSelector}
        className="fixed z-50 left-1/2 -translate-x-1/2 bottom-8 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl motion-normal active:scale-95"
        style={{
          background: "linear-gradient(135deg, #FCC44C 0%, #E5A82F 100%)",
          boxShadow: "0 8px 24px -6px rgba(252,196,76,0.65), 0 0 0 4px hsl(var(--background))",
        }}
        aria-label="Open BAKĒD apps"
      >
        <Package size={22} strokeWidth={2.5} color="#0a0a0a" />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          <Item icon={Home} label="Home" paths={["/express"]} testid="exp-bnav-home" />
          <Item icon={ClipboardList} label="Bookings" paths={["/express/bookings"]} testid="exp-bnav-bookings" />
          {/* Spacer for FAB */}
          <div className="w-14 shrink-0" aria-hidden />
          <Item icon={Briefcase} label="Services" paths={["/express/services"]} testid="exp-bnav-services" />
          <Item icon={User} label="Profile" paths={["/profile"]} testid="exp-bnav-profile" />
        </div>
      </nav>
    </>
  );
};
