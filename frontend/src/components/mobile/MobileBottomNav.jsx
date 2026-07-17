import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Grid3x3, ShoppingCart, User, Layers } from "lucide-react";
import { useCart } from "../../contexts/BakedContexts";

/**
 * MobileBottomNav — 4 tabs + a raised center FAB.
 * FAB opens the BAKĒD "6-App Selector" bottom sheet (see AppSelectorSheet).
 */
export const MobileBottomNav = ({ onOpenAppSelector }) => {
  const nav = useNavigate();
  const loc = useLocation();
  const { cart } = useCart();

  const isActive = (paths) => paths.some((p) => (p === "/" ? loc.pathname === "/" : loc.pathname.startsWith(p)));

  const Item = ({ icon: Icon, label, paths, testid, badge }) => {
    const active = isActive(paths);
    return (
      <button
        data-testid={testid}
        onClick={() => nav(paths[0])}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 motion-fast relative ${active ? "" : "opacity-60"}`}
      >
        <Icon size={20} style={active ? { color: "#77BC1F" } : {}} />
        <span className={`text-[10px] font-semibold ${active ? "" : "text-muted-foreground"}`} style={active ? { color: "#77BC1F" } : {}}>{label}</span>
        {badge > 0 && (
          <span className="absolute top-1.5 right-[calc(50%-18px)] min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: "#FF4C52", color: "white" }}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Floating center FAB — raises above nav bar */}
      <button
        data-testid="m-bnav-fab"
        onClick={onOpenAppSelector}
        className="fixed z-50 left-1/2 -translate-x-1/2 bottom-8 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl motion-normal active:scale-95"
        style={{
          background: "linear-gradient(135deg, #77BC1F 0%, #5da116 100%)",
          boxShadow: "0 8px 24px -6px rgba(119,188,31,0.6), 0 0 0 4px hsl(var(--background))",
        }}
        aria-label="Open BAKĒD apps"
      >
        <Layers size={24} strokeWidth={2.5} color="#0a1200" />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          <Item icon={Home} label="Home" paths={["/"]} testid="m-bnav-home" />
          <Item icon={Grid3x3} label="Categories" paths={["/categories"]} testid="m-bnav-categories" />
          {/* Spacer for FAB */}
          <div className="w-14 shrink-0" aria-hidden />
          <Item icon={ShoppingCart} label="Cart" paths={["/cart"]} badge={cart.item_count} testid="m-bnav-cart" />
          <Item icon={User} label="Profile" paths={["/orders", "/profile"]} testid="m-bnav-profile" />
        </div>
      </nav>
    </>
  );
};
