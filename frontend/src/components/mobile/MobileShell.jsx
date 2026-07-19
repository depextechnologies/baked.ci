import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppSelectorSheet } from "./AppSelectorSheet";

/**
 * MobileShell — the shared frame around every mobile-web customer screen.
 * - Sticky header
 * - Sticky bottom-nav with center FAB
 * - App-selector bottom sheet
 * The route content lives in <Outlet /> (we do NOT nest full routes; instead
 * we're used inline by CustomerShell in App.js).
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

  const showHeader = (isHome || isCategory || isCart || isCheckout || isOrder || isProduct) && !isProfile;
  const showBottomNav = !isCheckout; // hide bottom nav on checkout to focus the CTA

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {showHeader && <MobileHeader variant={isHome ? "home" : "sub"} />}

      <main className="flex-1 pb-24">{children || <Outlet />}</main>

      {showBottomNav && <MobileBottomNav onOpenAppSelector={() => setAppOpen(true)} />}
      <AppSelectorSheet open={appOpen} onClose={() => setAppOpen(false)} />
    </div>
  );
};
