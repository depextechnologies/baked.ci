/**
 * CustomerApp — apps/customer entry (dev route: /*, production domain: baked.ci).
 *
 * Phase 1a monorepo refactor (Fixing_Prompt.docx v2.0):
 * All customer-facing shells (desktop + mobile) and their provider stack
 * live here. Files in /pages and /components are still shared physically;
 * only the router boundary has moved. This unblocks Phase 2 (per-partner
 * apps) without a risky mass file move.
 */
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, AppProvider, CartProvider } from "@/contexts/BakedContexts";
import { TopNav } from "@/components/layout/TopNav";
import { ModuleTabs } from "@/components/layout/ModuleTabs";
import { Footer } from "@/components/layout/Footer";
import { HomePage } from "@/pages/HomePage";
import { ConfigHomepage } from "@/pages/ConfigHomepage";
import { CategoriesIndexPage, CategoryDetailPage } from "@/pages/CategoryPage";
import { ProductListPage } from "@/pages/ProductListPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { CartPage } from "@/pages/CartPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { OrderDetailPage, OrdersListPage } from "@/pages/OrderPages";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { ComingSoonLanding } from "@/pages/ComingSoonLanding";
import { PrivacyPolicy } from "@/pages/legal/PrivacyPolicy";
import { TermsOfService } from "@/pages/legal/TermsOfService";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileHome } from "@/pages/mobile/MobileHome";
import { MobileCategoryPage } from "@/pages/mobile/MobileCategoryPage";
import { MobileProductDetail } from "@/pages/mobile/MobileProductDetail";
import { MobileCart } from "@/pages/mobile/MobileCart";
import { MobileCheckout } from "@/pages/mobile/MobileCheckout";
import { MobileWallet } from "@/pages/mobile/MobileWallet";
import { MobileActivities } from "@/pages/mobile/MobileActivities";
import { MobileRewards } from "@/pages/mobile/MobileRewards";
import { MobileRefer } from "@/pages/mobile/MobileRefer";
import { DesktopProfileShell } from "@/components/profile/DesktopProfileShell";
import { MobileOrderConfirmation } from "@/pages/mobile/MobileOrderConfirmation";
import { MobileOrderTracking } from "@/pages/mobile/MobileOrderTracking";
import { MobileOrderDelivered } from "@/pages/mobile/MobileOrderDelivered";
import { MobileProfile } from "@/pages/mobile/MobileProfile";
import { MobileAddresses } from "@/pages/mobile/MobileAddresses";
import { MobileSettings } from "@/pages/mobile/MobileSettings";
import { MobileHelpSupport } from "@/pages/mobile/MobileHelpSupport";
import { GlobalLoginDialog } from "@/components/auth/GlobalLoginDialog";
import { AddressSelector } from "@/components/address/AddressSelector";
import { LocaleRouteSync } from "@/i18n/LocaleRouteSync";
import { ExpressBookingProvider, MoversBookingProvider } from "@/contexts/ExpressContext";
import { ExpressHome } from "@/pages/express/ExpressHome";
import {
  ExpressStepLocation, ExpressStepReceiver, ExpressStepVehicle,
  ExpressStepPackage, ExpressStepEstimate, ExpressBookingConfirmation,
} from "@/pages/express/ExpressWizard";
import { MoversLanding, MoversWizard } from "@/pages/express/MoversWizard";
import { ExpressBookings } from "@/pages/express/ExpressBookings";
import { ExpressServices } from "@/pages/express/ExpressServices";
import { ExpressLiveTracking } from "@/pages/express/ExpressLiveTracking";

// SHOPbakēd storefront (Slice 6+7) — mounted under /shop/* so the module
// tabs (MART / SHOP / SEND / …) switch to it in-shell, matching MART UX.
import { ShopHome } from "@/apps/shopbaked/pages/ShopHome";
import { ShopCategory } from "@/apps/shopbaked/pages/ShopCategory";
import { ShopCategoriesIndex } from "@/apps/shopbaked/pages/ShopCategoriesIndex";
import { ShopProduct } from "@/apps/shopbaked/pages/ShopProduct";
import { ShopCheckout, ShopOrderConfirmation } from "@/apps/shopbaked/pages/ShopCheckout";

// Footer landing pages — desktop + mobile share the same coming-soon route
// table. Extracted here so DesktopCustomerShell and MobileCustomerShell stay
// in lock-step without duplication.
const FOOTER_LANDING_PATHS = [
  "/shop/seller", "/food/partner", "/mart/partner", "/mart/seller",
  "/auto/partner", "/auto/seller", "/immo/partner", "/immo/agent", "/immo/broker",
  "/blog", "/news", "/careers", "/help", "/contact",
  "/investors", "/franchise",
  "/delivery-partner", "/driver-registration", "/merchant-registration",
  // /baked-delivery kept accessible via direct URL; not linked in the footer.
  "/baked-delivery",
];

const FooterLandingRoutes = () =>
  FOOTER_LANDING_PATHS.map((p) => (
    <Route key={p} path={p} element={<ComingSoonLanding />} />
  ));

// QA v15 §2 — legacy `/express/*` URLs continue to work by 301-redirecting
// to `/send/*` (module rename). Prefix stays "/express" in API + DB.
const ExpressLegacyRedirect = () => {
  const loc = useLocation();
  const rest = loc.pathname.replace(/^\/express/, "") || "";
  return <Navigate to={`/send${rest}${loc.search || ""}`} replace />;
};

const DesktopCustomerShell = () => (
  <div className="App min-h-screen bg-background text-foreground">
    <LocaleRouteSync />
    <TopNav />
    <ModuleTabs />
    <Routes>
      <Route path="/" element={<ConfigHomepage />} />
      <Route path="/categories" element={<CategoriesIndexPage />} />
      <Route path="/categories/:slug" element={<CategoryDetailPage />} />
      {/* Workstream 3 Phase C — French routes (primary) + English aliases (both resolve) */}
      <Route path="/produits" element={<ProductListPage />} />
      <Route path="/produits/:id" element={<ProductDetailPage />} />
      <Route path="/products" element={<ProductListPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/panier" element={<CartPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/paiement" element={<CheckoutPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/commandes" element={<OrdersListPage />} />
      <Route path="/commandes/:id" element={<OrderDetailPage />} />
      <Route path="/orders" element={<OrdersListPage />} />
      <Route path="/orders/:id" element={<OrderDetailPage />} />
      <Route path="/portefeuille" element={<DesktopProfileShell><MobileWallet /></DesktopProfileShell>} />
      <Route path="/wallet" element={<DesktopProfileShell><MobileWallet /></DesktopProfileShell>} />
      <Route path="/compte" element={<DesktopProfileShell><MobileProfile /></DesktopProfileShell>} />
      <Route path="/compte/adresses" element={<DesktopProfileShell><MobileAddresses /></DesktopProfileShell>} />
      <Route path="/compte/parametres" element={<DesktopProfileShell><MobileSettings /></DesktopProfileShell>} />
      <Route path="/compte/aide" element={<DesktopProfileShell><MobileHelpSupport /></DesktopProfileShell>} />
      <Route path="/compte/activites" element={<DesktopProfileShell><MobileActivities /></DesktopProfileShell>} />
      <Route path="/compte/recompenses" element={<DesktopProfileShell><MobileRewards /></DesktopProfileShell>} />
      <Route path="/compte/parrainage" element={<DesktopProfileShell><MobileRefer /></DesktopProfileShell>} />
      <Route path="/profile" element={<DesktopProfileShell><MobileProfile /></DesktopProfileShell>} />
      <Route path="/profile/addresses" element={<DesktopProfileShell><MobileAddresses /></DesktopProfileShell>} />
      <Route path="/profile/settings" element={<DesktopProfileShell><MobileSettings /></DesktopProfileShell>} />
      <Route path="/profile/help" element={<DesktopProfileShell><MobileHelpSupport /></DesktopProfileShell>} />
      <Route path="/profile/activities" element={<DesktopProfileShell><MobileActivities /></DesktopProfileShell>} />
      <Route path="/profile/rewards" element={<DesktopProfileShell><MobileRewards /></DesktopProfileShell>} />
      <Route path="/profile/refer" element={<DesktopProfileShell><MobileRefer /></DesktopProfileShell>} />
      <Route path="/food" element={<ComingSoonPage />} />
      <Route path="/shop" element={<ShopHome basePath="/shop" />} />
      <Route path="/shop/categories" element={<ShopCategoriesIndex basePath="/shop" />} />
      <Route path="/shop/c/:categorySlug" element={<ShopCategory basePath="/shop" />} />
      <Route path="/shop/p/:productId" element={<ShopProduct basePath="/shop" />} />
      <Route path="/shop/checkout" element={<ShopCheckout basePath="/shop" />} />
      <Route path="/shop/order/:orderId" element={<ShopOrderConfirmation basePath="/shop" />} />
      <Route path="/express" element={<Navigate to="/send" replace />} />
      <Route path="/express/*" element={<ExpressLegacyRedirect />} />
      <Route path="/send" element={<ExpressHome />} />
      <Route path="/send/book/location" element={<ExpressStepLocation />} />
      <Route path="/send/book/receiver" element={<ExpressStepReceiver />} />
      <Route path="/send/book/vehicle" element={<ExpressStepVehicle />} />
      <Route path="/send/book/package" element={<ExpressStepPackage />} />
      <Route path="/send/book/estimate" element={<ExpressStepEstimate />} />
      <Route path="/send/booking/:id" element={<ExpressBookingConfirmation />} />
      <Route path="/send/booking/:id/track" element={<ExpressLiveTracking />} />
      <Route path="/send/bookings" element={<ExpressBookings />} />
      <Route path="/send/services" element={<ExpressServices />} />
      <Route path="/send/parcel" element={<ExpressStepLocation />} />
      <Route path="/send/home-shifting" element={<MoversLanding />} />
      <Route path="/send/movers" element={<MoversLanding />} />
      <Route path="/send/movers/wizard" element={<MoversWizard />} />
      <Route path="/auto" element={<ComingSoonPage />} />
      <Route path="/immo" element={<ComingSoonPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      {FooterLandingRoutes()}
      <Route path="*" element={<HomePage />} />
    </Routes>
    <Footer />
    <GlobalLoginDialog />
    <AddressSelector />
  </div>
);

const MobileCustomerShell = () => (
  <MobileShell>
    <LocaleRouteSync />
    <Routes>
      <Route path="/" element={<ConfigHomepage />} />
      <Route path="/categories" element={<MobileCategoryPage />} />
      <Route path="/categories/:slug" element={<MobileCategoryPage />} />
      {/* Workstream 3 Phase C — French primary routes + English aliases */}
      <Route path="/produits" element={<MobileCategoryPage />} />
      <Route path="/produits/:id" element={<MobileProductDetail />} />
      <Route path="/products" element={<MobileCategoryPage />} />
      <Route path="/products/:id" element={<MobileProductDetail />} />
      <Route path="/panier" element={<MobileCart />} />
      <Route path="/cart" element={<MobileCart />} />
      <Route path="/paiement" element={<MobileCheckout />} />
      <Route path="/checkout" element={<MobileCheckout />} />
      <Route path="/commandes" element={<OrdersListPage />} />
      <Route path="/commandes/:id/confirmation" element={<MobileOrderConfirmation />} />
      <Route path="/commandes/:id/suivi" element={<MobileOrderTracking />} />
      <Route path="/commandes/:id/livree" element={<MobileOrderDelivered />} />
      <Route path="/commandes/:id" element={<MobileOrderTracking />} />
      <Route path="/orders" element={<OrdersListPage />} />
      <Route path="/orders/:id/confirmation" element={<MobileOrderConfirmation />} />
      <Route path="/orders/:id/track" element={<MobileOrderTracking />} />
      <Route path="/orders/:id/delivered" element={<MobileOrderDelivered />} />
      <Route path="/orders/:id" element={<MobileOrderTracking />} />
      <Route path="/portefeuille" element={<MobileWallet />} />
      <Route path="/wallet" element={<MobileWallet />} />
      <Route path="/compte" element={<MobileProfile />} />
      <Route path="/compte/adresses" element={<MobileAddresses />} />
      <Route path="/compte/parametres" element={<MobileSettings />} />
      <Route path="/compte/aide" element={<MobileHelpSupport />} />
      <Route path="/compte/activites" element={<MobileActivities />} />
      <Route path="/compte/recompenses" element={<MobileRewards />} />
      <Route path="/compte/parrainage" element={<MobileRefer />} />
      <Route path="/profile" element={<MobileProfile />} />
      <Route path="/profile/addresses" element={<MobileAddresses />} />
      <Route path="/profile/settings" element={<MobileSettings />} />
      <Route path="/profile/help" element={<MobileHelpSupport />} />
      <Route path="/profile/activities" element={<MobileActivities />} />
      <Route path="/profile/rewards" element={<MobileRewards />} />
      <Route path="/profile/refer" element={<MobileRefer />} />
      <Route path="/food" element={<ComingSoonPage />} />
      <Route path="/shop" element={<ShopHome basePath="/shop" />} />
      <Route path="/shop/categories" element={<ShopCategoriesIndex basePath="/shop" />} />
      <Route path="/shop/c/:categorySlug" element={<ShopCategory basePath="/shop" />} />
      <Route path="/shop/p/:productId" element={<ShopProduct basePath="/shop" />} />
      <Route path="/shop/checkout" element={<ShopCheckout basePath="/shop" />} />
      <Route path="/shop/order/:orderId" element={<ShopOrderConfirmation basePath="/shop" />} />
      <Route path="/express" element={<Navigate to="/send" replace />} />
      <Route path="/express/*" element={<ExpressLegacyRedirect />} />
      <Route path="/send" element={<ExpressHome />} />
      <Route path="/send/book/location" element={<ExpressStepLocation />} />
      <Route path="/send/book/receiver" element={<ExpressStepReceiver />} />
      <Route path="/send/book/vehicle" element={<ExpressStepVehicle />} />
      <Route path="/send/book/package" element={<ExpressStepPackage />} />
      <Route path="/send/book/estimate" element={<ExpressStepEstimate />} />
      <Route path="/send/booking/:id" element={<ExpressBookingConfirmation />} />
      <Route path="/send/booking/:id/track" element={<ExpressLiveTracking />} />
      <Route path="/send/bookings" element={<ExpressBookings />} />
      <Route path="/send/services" element={<ExpressServices />} />
      <Route path="/send/parcel" element={<ExpressStepLocation />} />
      <Route path="/send/home-shifting" element={<MoversLanding />} />
      <Route path="/send/movers" element={<MoversLanding />} />
      <Route path="/send/movers/wizard" element={<MoversWizard />} />
      <Route path="/auto" element={<ComingSoonPage />} />
      <Route path="/immo" element={<ComingSoonPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      {FooterLandingRoutes()}
      <Route path="*" element={<MobileHome />} />
    </Routes>
    <GlobalLoginDialog />
    <AddressSelector />
  </MobileShell>
);

const CustomerShell = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCustomerShell /> : <DesktopCustomerShell />;
};

export const CustomerApp = () => (
  <AuthProvider>
    <AppProvider>
      <CartProvider>
        <ExpressBookingProvider>
          <MoversBookingProvider>
            <CustomerShell />
          </MoversBookingProvider>
        </ExpressBookingProvider>
      </CartProvider>
    </AppProvider>
  </AuthProvider>
);
