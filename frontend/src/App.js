import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, AppProvider, CartProvider } from "@/contexts/BakedContexts";
import { TopNav } from "@/components/layout/TopNav";
import { ModuleTabs } from "@/components/layout/ModuleTabs";
import { Footer } from "@/components/layout/Footer";
import { HomePage } from "@/pages/HomePage";
import { CategoriesIndexPage, CategoryDetailPage } from "@/pages/CategoryPage";
import { ProductListPage } from "@/pages/ProductListPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { CartPage } from "@/pages/CartPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { AuthCallback } from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";

function AppShell() {
  const location = useLocation();
  // Route Emergent Google Auth fragment BEFORE anything else runs
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
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

// Handled via /coming-soon/:module route — kept as fallback
function AppRouter() { return null; }

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <CartProvider>
            <AppShell />
            <Toaster position="top-right" theme="dark" />
          </CartProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
