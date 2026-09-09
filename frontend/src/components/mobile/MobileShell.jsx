import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { ExpressBottomNav } from "../express/ExpressBottomNav";
import { AppSelectorSheet } from "./AppSelectorSheet";

/**
 * MobileShell — the shared frame around every mobile-web customer screen.
 * - Sticky header (MART/customer only; Express owns its own header)
 * - Sticky bottom-nav — swaps to Express variant on /express routes
 * - App-selector bottom sheet
 */
export const MobileShell = ({ children }) => {
  const [appOpen, setAppOpen] = useState(false);
  const loc = useLocation();

  // Header variant per route — support both English + French URLs (Phase C i18n).
  const isHome = loc.pathname === "/" || loc.pathname === "/shop";
  const isCategory = loc.pathname.startsWith("/categories/") || loc.pathname === "/categories"
                     || loc.pathname === "/shop/categories" || loc.pathname.startsWith("/shop/c/");
  const isProduct = loc.pathname.startsWith("/products") || loc.pathname.startsWith("/produits")
                    || loc.pathname.startsWith("/shop/p/");
  const isCart = loc.pathname.startsWith("/cart") || loc.pathname.startsWith("/panier");
  const isCheckout = loc.pathname.startsWith("/checkout") || loc.pathname.startsWith("/paiement")
                     || loc.pathname === "/shop/checkout";
  const isOrder = loc.pathname.startsWith("/orders") || loc.pathname.startsWith("/commandes")
                  || loc.pathname.startsWith("/shop/order");
  const isProfile = loc.pathname.startsWith("/profile") || loc.pathname.startsWith("/compte")
                    || loc.pathname === "/wallet" || loc.pathname === "/portefeuille";
  const isExpressWizard = loc.pathname.startsWith("/send/book/") || loc.pathname.startsWith("/send/movers/wizard") || loc.pathname.startsWith("/send/booking/");
  const isExpress = loc.pathname === "/send" || loc.pathname.startsWith("/send/");

  const showHeader = (isHome || isCategory || isCart || isCheckout || isOrder || isProduct) && !isProfile && !isExpress;
  const showBottomNav = !isCheckout && !isExpressWizard;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {showHeader && <MobileHeader variant={isHome ? "home" : "sub"} />}

      <main className="flex-1 pb-24">{children || <Outlet />}</main>

      {showBottomNav && (
        isExpress
          ? <ExpressBottomNav onOpenAppSelector={() => setAppOpen(true)} />
          : <MobileBottomNav onOpenAppSelector={() => setAppOpen(true)} />
      )}
      <AppSelectorSheet open={appOpen} onClose={() => setAppOpen(false)} />
    </div>
  );
};
