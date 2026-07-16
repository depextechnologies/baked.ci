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
import { AdminDashboard, AdminCountries, AdminCities, AdminRoles, AdminFinance, AdminAICommand, AdminInsights, AdminAudit, AdminCustomers, AdminUsers } from "@/pages/admin/AdminPages";
import { Toaster } from "@/components/ui/sonner";

function CustomerShell() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
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
        <Route path="/food" element={<ComingSoonPage />} />
        <Route path="/shop" element={<ComingSoonPage />} />
        <Route path="/express" element={<ComingSoonPage />} />
        <Route path="/auto" element={<ComingSoonPage />} />
        <Route path="/immo" element={<ComingSoonPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="countries" element={<AdminCountries />} />
            <Route path="cities" element={<AdminCities />} />
            <Route path="roles" element={<AdminRoles />} />
            <Route path="finance" element={<AdminFinance />} />
            <Route path="ai-command" element={<AdminAICommand />} />
            <Route path="insights" element={<AdminInsights />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="admins" element={<AdminUsers />} />
          </Route>
          <Route path="/*" element={
            <AuthProvider><AppProvider><CartProvider><CustomerShell /></CartProvider></AppProvider></AuthProvider>
          } />
        </Routes>
        <Toaster position="top-right" theme="dark" />
      </AdminProvider>
    </BrowserRouter>
  );
}

export default App;
