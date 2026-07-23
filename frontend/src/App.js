import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, AppProvider, CartProvider } from "@/contexts/BakedContexts";
import { AdminProvider } from "@/contexts/AdminContext";
import { TopNav } from "@/components/layout/TopNav";
import { ModuleTabs } from "@/components/layout/ModuleTabs";
import { Footer } from "@/components/layout/Footer";
import { HomePage } from "@/pages/HomePage";
import { CategoriesIndexPage, CategoryDetailPage } from "@/pages/CategoryPage";
import { ProductListPage } from "@/pages/ProductListPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { CartPage } from "@/pages/CartPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { OrderDetailPage, OrdersListPage } from "@/pages/OrderPages";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { AuthCallback } from "@/pages/AuthCallback";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import {
  AdminDashboard, AdminCountries, AdminCities, AdminRoles, AdminFinance,
  AdminAICommand, AdminInsights, AdminAudit, AdminCustomers, AdminUsers,
  AdminAnalytics, AdminApiManagement, AdminInfrastructure, AdminSystemSettings,
} from "@/pages/admin/AdminPages";
import { ModuleWorkspace } from "@/pages/admin/ModuleWorkspace";
import {
  ModuleOverview, ModuleVendors, ModuleProducts, ModuleOrders,
  ModuleCustomers, ModuleDrivers, ModuleComingSoon,
} from "@/pages/admin/ModulePages";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileHome } from "@/pages/mobile/MobileHome";
import { MobileCategoryPage } from "@/pages/mobile/MobileCategoryPage";
import { MobileProductDetail } from "@/pages/mobile/MobileProductDetail";
import { MobileCart } from "@/pages/mobile/MobileCart";
import { MobileCheckout } from "@/pages/mobile/MobileCheckout";
import { MobileWalletComingSoon } from "@/pages/mobile/MobileWalletComingSoon";
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
import { ExpressBookingProvider, MoversBookingProvider } from "@/contexts/ExpressContext";
import { ExpressHome } from "@/pages/express/ExpressHome";
import { ExpressStepLocation, ExpressStepReceiver, ExpressStepVehicle, ExpressStepPackage, ExpressStepEstimate, ExpressBookingConfirmation } from "@/pages/express/ExpressWizard";
import { MoversLanding, MoversWizard } from "@/pages/express/MoversWizard";
import { ExpressBookings } from "@/pages/express/ExpressBookings";
import { ExpressServices } from "@/pages/express/ExpressServices";

function DesktopCustomerShell() {
  return (
    <div className="App min-h-screen bg-background text-foreground">
      <TopNav />
      <ModuleTabs />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/categories" element={<CategoriesIndexPage />} />
        <Route path="/categories/:slug" element={<CategoryDetailPage />} />
        <Route path="/products" element={<ProductListPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/wallet" element={<DesktopProfileShell><MobileWallet /></DesktopProfileShell>} />
        <Route path="/profile" element={<DesktopProfileShell><MobileProfile /></DesktopProfileShell>} />
        <Route path="/profile/addresses" element={<DesktopProfileShell><MobileAddresses /></DesktopProfileShell>} />
        <Route path="/profile/settings" element={<DesktopProfileShell><MobileSettings /></DesktopProfileShell>} />
        <Route path="/profile/help" element={<DesktopProfileShell><MobileHelpSupport /></DesktopProfileShell>} />
        <Route path="/profile/activities" element={<DesktopProfileShell><MobileActivities /></DesktopProfileShell>} />
        <Route path="/profile/rewards" element={<DesktopProfileShell><MobileRewards /></DesktopProfileShell>} />
        <Route path="/profile/refer" element={<DesktopProfileShell><MobileRefer /></DesktopProfileShell>} />
        <Route path="/food" element={<ComingSoonPage />} />
        <Route path="/shop" element={<ComingSoonPage />} />
        <Route path="/express" element={<ExpressHome />} />
        <Route path="/express/book/location" element={<ExpressStepLocation />} />
        <Route path="/express/book/receiver" element={<ExpressStepReceiver />} />
        <Route path="/express/book/vehicle" element={<ExpressStepVehicle />} />
        <Route path="/express/book/package" element={<ExpressStepPackage />} />
        <Route path="/express/book/estimate" element={<ExpressStepEstimate />} />
        <Route path="/express/booking/:id" element={<ExpressBookingConfirmation />} />
        <Route path="/express/bookings" element={<ExpressBookings />} />
        <Route path="/express/services" element={<ExpressServices />} />
        <Route path="/express/movers" element={<MoversLanding />} />
        <Route path="/express/movers/wizard" element={<MoversWizard />} />
        <Route path="/auto" element={<ComingSoonPage />} />
        <Route path="/immo" element={<ComingSoonPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <Footer />
      <GlobalLoginDialog />
      <AddressSelector />
    </div>
  );
}

function MobileCustomerShell() {
  return (
    <MobileShell>
      <Routes>
        <Route path="/" element={<MobileHome />} />
        <Route path="/categories" element={<MobileCategoryPage />} />
        <Route path="/categories/:slug" element={<MobileCategoryPage />} />
        <Route path="/products" element={<MobileCategoryPage />} />
        <Route path="/products/:id" element={<MobileProductDetail />} />
        <Route path="/cart" element={<MobileCart />} />
        <Route path="/checkout" element={<MobileCheckout />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/:id/confirmation" element={<MobileOrderConfirmation />} />
        <Route path="/orders/:id/track" element={<MobileOrderTracking />} />
        <Route path="/orders/:id/delivered" element={<MobileOrderDelivered />} />
        <Route path="/orders/:id" element={<MobileOrderTracking />} />
        <Route path="/wallet" element={<MobileWallet />} />
        <Route path="/profile" element={<MobileProfile />} />
        <Route path="/profile/addresses" element={<MobileAddresses />} />
        <Route path="/profile/settings" element={<MobileSettings />} />
        <Route path="/profile/help" element={<MobileHelpSupport />} />
        <Route path="/profile/activities" element={<MobileActivities />} />
        <Route path="/profile/rewards" element={<MobileRewards />} />
        <Route path="/profile/refer" element={<MobileRefer />} />
        <Route path="/food" element={<ComingSoonPage />} />
        <Route path="/shop" element={<ComingSoonPage />} />
        <Route path="/express" element={<ExpressHome />} />
        <Route path="/express/book/location" element={<ExpressStepLocation />} />
        <Route path="/express/book/receiver" element={<ExpressStepReceiver />} />
        <Route path="/express/book/vehicle" element={<ExpressStepVehicle />} />
        <Route path="/express/book/package" element={<ExpressStepPackage />} />
        <Route path="/express/book/estimate" element={<ExpressStepEstimate />} />
        <Route path="/express/booking/:id" element={<ExpressBookingConfirmation />} />
        <Route path="/express/bookings" element={<ExpressBookings />} />
        <Route path="/express/services" element={<ExpressServices />} />
        <Route path="/express/movers" element={<MoversLanding />} />
        <Route path="/express/movers/wizard" element={<MoversWizard />} />
        <Route path="/auto" element={<ComingSoonPage />} />
        <Route path="/immo" element={<ComingSoonPage />} />
        <Route path="*" element={<MobileHome />} />
      </Routes>
      <GlobalLoginDialog />
      <AddressSelector />
    </MobileShell>
  );
}

function CustomerShell() {
  const location = useLocation();
  const isMobile = useIsMobile();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return isMobile ? <MobileCustomerShell /> : <DesktopCustomerShell />;
}

function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            {/* Platform Governance (PRD §7) */}
            <Route path="countries" element={<AdminCountries />} />
            <Route path="cities" element={<AdminCities />} />
            <Route path="admins" element={<AdminUsers />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="ai-center" element={<AdminAICommand />} />
            <Route path="ai-command" element={<AdminAICommand />} />
            <Route path="insights" element={<AdminInsights />} />
            <Route path="finance" element={<AdminFinance />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="api-management" element={<AdminApiManagement />} />
            <Route path="infrastructure" element={<AdminInfrastructure />} />
            <Route path="settings" element={<AdminSystemSettings />} />
            <Route path="customers" element={<AdminCustomers />} />

            {/* Business Modules — module-scoped workspace with sub-nav (PRD §7 Module-First) */}
            <Route path="modules/:code" element={<ModuleWorkspace />}>
              <Route index element={<ModuleOverview />} />
              <Route path="vendors" element={<ModuleVendors />} />
              <Route path="products" element={<ModuleProducts />} />
              <Route path="orders" element={<ModuleOrders />} />
              <Route path="customers" element={<ModuleCustomers />} />
              <Route path="drivers" element={<ModuleDrivers />} />
              <Route path="inventory" element={<ModuleComingSoon title="Inventory management" />} />
              <Route path="finance" element={<ModuleComingSoon title="Finance & Settlements" />} />
              <Route path="ai" element={<ModuleComingSoon title="AI Operations" />} />
              <Route path="analytics" element={<ModuleComingSoon title="Module analytics" />} />
              <Route path="promotions" element={<ModuleComingSoon title="Promotions & Marketing" />} />
              <Route path="support" element={<ModuleComingSoon title="Support" />} />
              <Route path="settings" element={<ModuleComingSoon title="Module settings" />} />
            </Route>
          </Route>
          <Route path="/*" element={
            <AuthProvider><AppProvider><CartProvider><ExpressBookingProvider><MoversBookingProvider><CustomerShell /></MoversBookingProvider></ExpressBookingProvider></CartProvider></AppProvider></AuthProvider>
          } />
        </Routes>
        <Toaster position="top-right" theme="dark" />
      </AdminProvider>
    </BrowserRouter>
  );
}

export default App;
