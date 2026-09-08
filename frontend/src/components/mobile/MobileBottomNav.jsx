import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Grid3x3, ShoppingCart, User, Layers } from "lucide-react";
import { useApp, useCart } from "../../contexts/BakedContexts";
import { MODULES } from "../../lib/modules";

/**
 * MobileBottomNav — 4 tabs + a raised center FAB.
 *
 * ► Module-aware (Fixing_Prompt v5 §3, §6):
 *    Home and Categories now resolve their destination from the currently
 *    active module. Selecting SHOPbakēd changes:
 *        Home       → /shop
 *        Categories → /shop/categories
 *    and switches the active tab tint to SHOP amber. MART / other modules
 *    behave the same way via the `MODULES` registry.
 *
 * ► Cart, Profile and the FAB remain global — they are shared BAKĒD
 *   infrastructure per the requirement ("keep global functionality global").
 */
export const MobileBottomNav = ({ onOpenAppSelector }) => {
  const nav = useNavigate();
  const loc = useLocation();
  const { cart } = useCart();
  const { activeModule } = useApp();

  // Module accent (Fixing_Prompt v5 §7). Falls back to MART green when the
  // active module isn't in the registry so the UI never blanks.
  const accent = React.useMemo(
    () => (MODULES.find((m) => m.code === activeModule)?.color) || "#77BC1F",
    [activeModule]
  );

  // Per-module route table. Add new marketplaces here in one place.
  const HOME = { mart: "/", shop: "/shop", food: "/food", express: "/send" };
  const CATS = { mart: "/categories", shop: "/shop/categories", food: "/food", express: "/send" };
  const homePath = HOME[activeModule] || "/";
  const categoriesPath = CATS[activeModule] || "/categories";

  const isActive = (paths) =>
    paths.some((p) => (p === "/" ? loc.pathname === "/" : loc.pathname.startsWith(p)));

  const Item = ({ icon: Icon, label, paths, testid, badge, tint = accent }) => {
    const active = isActive(paths);
    return (
      <button
        data-testid={testid}
        onClick={() => nav(paths[0])}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 motion-fast relative ${active ? "" : "opacity-60"}`}
      >
        <Icon size={20} style={active ? { color: tint } : {}} />
        <span
          className={`text-[10px] font-semibold ${active ? "" : "text-muted-foreground"}`}
          style={active ? { color: tint } : {}}
        >
          {label}
        </span>
        {badge > 0 && (
          <span
            className="absolute top-1.5 right-[calc(50%-18px)] min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "#FF4C52", color: "white" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  };

  // Convert `#RRGGBB` → `rgba(r,g,b,a)` so the FAB glow inherits module tone.
  const rgba = (hex, a) => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  return (
    <>
      {/* Floating center FAB — raises above nav bar. Now tinted with the
          active module accent so the UI never lies about context. */}
      <button
        data-testid="m-bnav-fab"
        onClick={onOpenAppSelector}
        className="fixed z-50 left-1/2 -translate-x-1/2 bottom-8 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl motion-normal active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${rgba(accent, 0.7)} 100%)`,
          boxShadow: `0 8px 24px -6px ${rgba(accent, 0.6)}, 0 0 0 4px hsl(var(--background))`,
        }}
        aria-label="Open BAKĒD apps"
      >
        <Layers size={24} strokeWidth={2.5} color="#0a1200" />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          <Item
            icon={Home}
            label="Home"
            paths={[homePath, ...(activeModule === "shop" ? ["/shop"] : ["/"])]}
            testid="m-bnav-home"
          />
          <Item
            icon={Grid3x3}
            label="Categories"
            paths={[categoriesPath, ...(activeModule === "shop" ? ["/shop/c"] : ["/categories"])]}
            testid="m-bnav-categories"
          />
          {/* Spacer for FAB */}
          <div className="w-14 shrink-0" aria-hidden />
          <Item icon={ShoppingCart} label="Cart" paths={["/cart"]} badge={cart.item_count} testid="m-bnav-cart" tint="#77BC1F" />
          <Item icon={User} label="Profile" paths={["/profile", "/orders"]} testid="m-bnav-profile" tint="#77BC1F" />
        </div>
      </nav>
    </>
  );
};
