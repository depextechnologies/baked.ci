/**
 * ShopHome — SHOPbakēd storefront landing (Slice 1 stub).
 *
 * Slice 6 will replace this with the real customer home (hero, category
 * grid, featured brands, curated collections). Today it simply verifies
 * that /api/shop/health round-trips and reports what the migrations left
 * behind.
 */
import { useEffect, useState } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ShopHome = () => {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/shop/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section data-testid="shopbaked-home">
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
        SHOP<span className="text-amber-400">bakēd</span> is warming up.
      </h1>
      <p className="mt-4 text-neutral-400 max-w-xl">
        Fashion, electronics, home goods — coming soon. This preview surface
        exists to confirm the module is wired end-to-end.
      </p>
      <div className="mt-10 border border-neutral-800 rounded-xl p-6 bg-neutral-900/40" data-testid="shopbaked-health-card">
        <h2 className="text-lg font-semibold">Module health</h2>
        {error && (
          <p className="mt-3 text-red-400" data-testid="shopbaked-health-error">Error: {error}</p>
        )}
        {!error && !health && (
          <p className="mt-3 text-neutral-500" data-testid="shopbaked-health-loading">Checking…</p>
        )}
        {health && (
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm" data-testid="shopbaked-health-counts">
            {Object.entries(health.counts || {}).map(([k, v]) => (
              <li key={k} className="border border-neutral-800 rounded-lg px-3 py-2 bg-neutral-950">
                <div className="text-neutral-500 text-xs uppercase tracking-wide">{k}</div>
                <div className="text-neutral-100 text-lg font-semibold">{v}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ShopHome;
