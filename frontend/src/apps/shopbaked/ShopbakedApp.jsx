/**
 * ShopbakedApp — SHOPbakēd storefront (Slice 1 Foundation).
 *
 * This is a stub shell mounted at /shopbaked/*. It gives Slice 6 a concrete
 * boundary to layer the real Home/List/PDP pages on top of. For now it
 * simply advertises that the module is alive and pings /api/shop/health so
 * QA can confirm the wiring end-to-end.
 */
import { Routes, Route, Link } from "react-router-dom";
import { ShopHome } from "./pages/ShopHome";

export const ShopbakedApp = () => (
  <div className="min-h-screen bg-neutral-950 text-neutral-100" data-testid="shopbaked-app">
    <header className="border-b border-neutral-800 px-6 py-4 flex items-center gap-6">
      <Link to="/shopbaked" className="text-xl font-semibold tracking-tight" data-testid="shopbaked-brand">
        SHOP<span className="text-amber-400">bakēd</span>
      </Link>
      <nav className="text-sm text-neutral-400 flex gap-4">
        <Link to="/shopbaked" data-testid="shopbaked-nav-home">Home</Link>
      </nav>
    </header>
    <main className="px-6 py-10 max-w-6xl mx-auto">
      <Routes>
        <Route path="/" element={<ShopHome />} />
      </Routes>
    </main>
  </div>
);

export default ShopbakedApp;
