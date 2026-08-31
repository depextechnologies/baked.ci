/**
 * ShopbakedApp — SHOPbakēd customer storefront (Slice 6).
 */
import { useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { ShopHome } from "./pages/ShopHome";
import { ShopCategory } from "./pages/ShopCategory";
import { ShopProduct } from "./pages/ShopProduct";

export const ShopbakedApp = () => {
  const [locale, setLocale] = useState("fr");
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" data-testid="shopbaked-app">
      <header className="border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md bg-neutral-950/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          <Link to="/shopbaked" className="text-xl font-semibold tracking-tight" data-testid="shopbaked-brand">
            SHOP<span className="text-amber-400">bakēd</span>
          </Link>
          <nav className="text-sm text-neutral-400 flex gap-4">
            <Link to="/shopbaked" data-testid="shopbaked-nav-home">Home</Link>
          </nav>
          <div className="ml-auto inline-flex rounded-full border border-neutral-800 p-1 text-xs"
               data-testid="shopbaked-locale-toggle">
            {["fr", "en"].map((code) => (
              <button
                key={code}
                onClick={() => setLocale(code)}
                className={`px-3 py-1.5 rounded-full transition-colors ${
                  locale === code ? "bg-amber-400 text-neutral-950 font-semibold" : "text-neutral-400"
                }`}
                data-testid={`shopbaked-locale-${code}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-10">
        <Routes>
          <Route path="/" element={<ShopHome locale={locale} />} />
          <Route path="/c/:categorySlug" element={<ShopCategory locale={locale} />} />
          <Route path="/p/:productId" element={<ShopProduct />} />
        </Routes>
      </main>
    </div>
  );
};

export default ShopbakedApp;
