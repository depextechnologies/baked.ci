/**
 * AdminApp — apps/admin entry (dev route: /admin, production domain:
 * admin.baked.ci).
 *
 * Phase 1a monorepo refactor (Fixing_Prompt.docx v2.0): admin routes
 * previously lived inside App.js. They move here so future phases can
 * spin admin out as its own build target with zero route reshuffling.
 */
import { Routes, Route } from "react-router-dom";
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
  ModuleCustomers, ModuleDrivers, ModulePricing, ModuleBookings, ModuleComingSoon,
} from "@/pages/admin/ModulePages";
import { ModulePartnerApplications } from "@/pages/admin/ModulePartnerApplications";
import { AdminStores } from "@/pages/admin/AdminStores";
import { AdminMartCatalog } from "@/pages/admin/AdminMartCatalog";
import { AdminProductApprovals } from "@/pages/admin/AdminProductApprovals";

export const AdminApp = () => (
  <Routes>
    <Route path="login" element={<AdminLoginPage />} />
    <Route path="" element={<AdminLayout />}>
      <Route index element={<AdminDashboard />} />
      {/* Platform Governance (PRD §7) */}
      <Route path="countries" element={<AdminCountries />} />
      <Route path="cities" element={<AdminCities />} />
      <Route path="stores" element={<AdminStores />} />
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
        <Route path="applications" element={<ModulePartnerApplications />} />
        <Route path="partners/applications" element={<ModulePartnerApplications />} />
        <Route path="products" element={<ModuleProducts />} />
        <Route path="catalog" element={<AdminMartCatalog />} />
        <Route path="approvals" element={<AdminProductApprovals />} />
        <Route path="orders" element={<ModuleOrders />} />
        <Route path="customers" element={<ModuleCustomers />} />
        <Route path="drivers" element={<ModuleDrivers />} />
        <Route path="pricing" element={<ModulePricing />} />
        <Route path="bookings" element={<ModuleBookings />} />
        <Route path="inventory" element={<ModuleComingSoon title="Inventory management" />} />
        <Route path="finance" element={<ModuleComingSoon title="Finance & Settlements" />} />
        <Route path="ai" element={<ModuleComingSoon title="AI Operations" />} />
        <Route path="analytics" element={<ModuleComingSoon title="Module analytics" />} />
        <Route path="promotions" element={<ModuleComingSoon title="Promotions & Marketing" />} />
        <Route path="support" element={<ModuleComingSoon title="Support" />} />
        <Route path="settings" element={<ModuleComingSoon title="Module settings" />} />
      </Route>
    </Route>
  </Routes>
);
