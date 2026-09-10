/**
 * ShopbakedApp — SHOPbakēd standalone shell used for the /shopbaked
 * demo route. The full customer experience at /shop is mounted inside
 * CustomerApp; this shell keeps a lightweight variant for the internal
 * demo. Language now flows from the global i18next instance instead of
 * a local state — a single language switcher controls FR ↔ EN across
 * the whole platform.
 */
import { Routes, Route, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShopHome } from "./pages/ShopHome";
import { ShopCategory } from "./pages/ShopCategory";
import { ShopProduct } from "./pages/ShopProduct";

export const ShopbakedApp = () => {
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language === "fr" ? "fr" : "en";
  const setLang = (code) => i18n.changeLanguage(code);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" data-testid="shopbaked-app">
      <header className="border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md bg-neutral-950/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          <Link to="/shopbaked" className="text-xl font-semibold tracking-tight" data-testid="shopbaked-brand">
            SHOP<span className="text-amber-400">bakēd</span>
          </Link>
          <nav className="text-sm text-neutral-400 flex gap-4">
            <Link to="/shopbaked" data-testid="shopbaked-nav-home">{t("shop.nav_home")}</Link>
          </nav>
          <div className="ml-auto inline-flex rounded-full border border-neutral-800 p-1 text-xs"
               data-testid="shopbaked-locale-toggle">
            {["fr", "en"].map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-3 py-1.5 rounded-full transition-colors ${
                  lang === code ? "bg-amber-400 text-neutral-950 font-semibold" : "text-neutral-400"
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
          <Route path="/" element={<ShopHome />} />
          <Route path="/c/:categorySlug" element={<ShopCategory />} />
          <Route path="/p/:productId" element={<ShopProduct />} />
        </Routes>
      </main>
    </div>
  );
};

export default ShopbakedApp;
