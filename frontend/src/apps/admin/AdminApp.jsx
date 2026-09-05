/**
 * AdminApp — apps/admin entry (dev route: /admin, production domain:
 * admin.baked.ci).
 *
 * Phase 1a monorepo refactor (Fixing_Prompt.docx v2.0): admin routes
 * previously lived inside App.js. They move here so future phases can
 * spin admin out as its own build target with zero route reshuffling.
 */
import { Routes, Route, Navigate } from "react-router-dom";
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
import { AdminInventoryControlTower } from "@/pages/admin/AdminInventoryControlTower";
import { AdminCategoryRequests } from "@/pages/admin/AdminCategoryRequests";
import { AdminSupplierApplications } from "@/pages/admin/AdminSupplierApplications";
import { AdminSuppliersShell } from "@/pages/admin/AdminSuppliersShell";
import { AdminPurchaseOrders } from "@/pages/admin/AdminPurchaseOrders";
import { AdminSupplierProductRequests } from "@/pages/admin/AdminSupplierProductRequests";
import { AdminDriverPayouts } from "@/pages/admin/AdminDriverPayouts";
import { AdminSupplierDetail } from "@/pages/admin/AdminSupplierDetail";
import { AdminMartAttributes } from "@/pages/admin/AdminMartAttributes";
import { AdminDriverApplications } from "@/pages/admin/AdminDriverApplications";
import { AdminHomepageManagement } from "@/pages/admin/AdminHomepageManagement";
import { AdminShopCatalog } from "@/pages/admin/AdminShopCatalog";
import { AdminShopAttributes } from "@/pages/admin/AdminShopAttributes";
import { AdminShopProductApprovals } from "@/pages/admin/AdminShopProductApprovals";
import { AdminShopProducts } from "@/pages/admin/AdminShopProducts";
import { SupplierInvoicesPage as AdminSupplierInvoices } from "@/components/invoices/SupplierInvoicesPage";
import { adminApi } from "@/contexts/AdminContext";
import { useOutletContext } from "react-router-dom";

// Module-aware switchers — the catalog/attributes/approvals/products routes
// mount MART or SHOP-native components based on the workspace `:code` param.
const CatalogSwitch = () => {
  const { code } = useOutletContext() || {};
  return code === "shop" ? <AdminShopCatalog /> : <AdminMartCatalog />;
};
const AttributesSwitch = () => {
  const { code } = useOutletContext() || {};
  return code === "shop" ? <AdminShopAttributes /> : <AdminMartAttributes />;
};
const ApprovalsSwitch = () => {
  const { code } = useOutletContext() || {};
  return code === "shop" ? <AdminShopProductApprovals /> : <AdminProductApprovals />;
};
const ProductsSwitch = () => {
  const { code } = useOutletContext() || {};
  return code === "shop" ? <AdminShopProducts /> : <ModuleProducts />;
};

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
      <Route path="driver-payouts" element={<AdminDriverPayouts />} />
      <Route path="driver-applications" element={<AdminDriverApplications />} />
      <Route path="homepage-management" element={<AdminHomepageManagement />} />
      {/* Fixing_Prompt v5 — old duplicate routes redirect into the unified
          Suppliers workflow. Bookmarks keep working, one authoritative queue. */}
      <Route path="mart-partner-approvals" element={<Navigate to="/admin/modules/mart/approvals" replace />} />
      <Route path="partner-image-reviews"  element={<Navigate to="/admin/modules/mart/suppliers" replace />} />
      {/*
        Inventory Control Tower belongs to MARTbakēd — the global route
        redirects into the module workspace so existing bookmarks and
        integrations keep working.
      */}
      <Route path="inventory" element={<Navigate to="/admin/modules/mart/inventory" replace />} />

      {/* Business Modules — module-scoped workspace with sub-nav (PRD §7 Module-First) */}
      <Route path="modules/:code" element={<ModuleWorkspace />}>
        <Route index element={<ModuleOverview />} />
        <Route path="vendors" element={<ModuleVendors />} />
        <Route path="applications" element={<ModulePartnerApplications />} />
        <Route path="partners/applications" element={<ModulePartnerApplications />} />
        <Route path="products" element={<ProductsSwitch />} />
        <Route path="catalog" element={<CatalogSwitch />} />
        <Route path="attributes" element={<AttributesSwitch />} />
        <Route path="approvals" element={<ApprovalsSwitch />} />
        <Route path="category-requests" element={<AdminCategoryRequests />} />
        <Route path="suppliers" element={<AdminSuppliersShell />} />
        <Route path="suppliers/:supplierId" element={<AdminSupplierDetail />} />
        <Route path="suppliers/applications" element={<AdminSupplierApplications />} />
        <Route path="suppliers/product-requests" element={<AdminSupplierProductRequests />} />
        <Route path="purchase-orders" element={<AdminPurchaseOrders />} />
        <Route path="invoices" element={<AdminSupplierInvoices apiClient={adminApi} role="admin" basePath="/admin/modules/mart/invoices" />} />
        <Route path="orders" element={<ModuleOrders />} />
        <Route path="customers" element={<ModuleCustomers />} />
        <Route path="drivers" element={<ModuleDrivers />} />
        <Route path="pricing" element={<ModulePricing />} />
        <Route path="bookings" element={<ModuleBookings />} />
        <Route path="inventory" element={<AdminInventoryControlTower />} />
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
