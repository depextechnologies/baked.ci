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

  // Header variant per route
  const isHome = loc.pathname === "/";
  const isCategory = loc.pathname.startsWith("/categories/") || loc.pathname === "/categories";
  const isProduct = loc.pathname.startsWith("/products");
  const isCart = loc.pathname.startsWith("/cart");
  const isCheckout = loc.pathname.startsWith("/checkout");
  const isOrder = loc.pathname.startsWith("/orders");
  const isProfile = loc.pathname.startsWith("/profile") || loc.pathname === "/wallet";
  const isExpressWizard = loc.pathname.startsWith("/express/book/") || loc.pathname.startsWith("/express/movers/wizard") || loc.pathname.startsWith("/express/booking/");
  const isExpress = loc.pathname === "/express" || loc.pathname.startsWith("/express/");

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
