/**
 * ShopHome — SHOPbakēd storefront landing (Slice 2 preview).
 *
 * Slice 6 will replace this with the real customer home (hero, hand-curated
 * collections, brand rail, PDP). Right now it renders the seeded catalogue
 * tree so QA and stakeholders can eyeball the seed and locale coverage.
 */
import { useEffect, useMemo, useState } from "react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ShopHome = () => {
  const [tree, setTree] = useState(null);
  const [health, setHealth] = useState(null);
  const [locale, setLocale] = useState("fr");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API}/shop/health`).then((r) => r.json()),
      fetch(`${API}/shop/catalogue?country=CI`).then((r) => r.json()),
    ])
      .then(([h, t]) => {
        if (cancelled) return;
        setHealth(h);
        setTree(t);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSubs = useMemo(
    () => (tree || []).reduce((n, c) => n + (c.subcategories?.length || 0), 0),
    [tree],
  );

  const [attrsByCat, setAttrsByCat] = useState({});
  useEffect(() => {
    if (!tree) return;
    let cancelled = false;
    Promise.all(
      tree.map((c) =>
        fetch(`${API}/shop/categories/${c.slug}/attributes`)
          .then((r) => (r.ok ? r.json() : { attributes: [] }))
          .then((d) => [c.slug, d.attributes || []]),
      ),
    ).then((pairs) => !cancelled && setAttrsByCat(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [tree]);

  return (
    <section data-testid="shopbaked-home">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            SHOP<span className="text-amber-400">bakēd</span> catalogue preview
          </h1>
          <p className="mt-4 text-neutral-400 max-w-xl">
            {tree
              ? `${tree.length} categories · ${totalSubs} subcategories seeded for Côte d'Ivoire.`
              : "Loading catalogue…"}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-neutral-800 p-1 text-xs" data-testid="shopbaked-locale-toggle">
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

      {error && (
        <p className="mt-6 text-red-400" data-testid="shopbaked-home-error">Error: {error}</p>
      )}

      {health && (
        <div className="mt-8 border border-neutral-800 rounded-xl p-6 bg-neutral-900/40" data-testid="shopbaked-health-card">
          <h2 className="text-lg font-semibold">Module health</h2>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm" data-testid="shopbaked-health-counts">
            {Object.entries(health.counts || {}).map(([k, v]) => (
              <li key={k} className="border border-neutral-800 rounded-lg px-3 py-2 bg-neutral-950">
                <div className="text-neutral-500 text-xs uppercase tracking-wide">{k}</div>
                <div className="text-neutral-100 text-lg font-semibold">{v}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tree && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="shopbaked-catalogue">
          {tree.map((cat) => (
            <article
              key={cat.id}
              className="border border-neutral-800 rounded-xl p-5 bg-neutral-900/40 hover:border-amber-400/60 transition-colors"
              data-testid={`shopbaked-category-${cat.slug}`}
            >
              <header className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold text-neutral-100">
                  {locale === "fr" ? cat.name_fr : cat.name_en}
                </h3>
                <span className="text-xs text-neutral-500 shrink-0">
                  {cat.subcategories?.length || 0} sub
                </span>
              </header>
              <p className="mt-1 text-xs text-neutral-500 font-mono">{cat.slug}</p>
              {attrsByCat[cat.slug]?.length ? (
                <div className="mt-2 flex flex-wrap gap-1" data-testid={`shopbaked-attrs-${cat.slug}`}>
                  {attrsByCat[cat.slug].map((a) => (
                    <span
                      key={a.key}
                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20"
                    >
                      {a.key}
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="mt-3 space-y-1 text-sm text-neutral-300">
                {(cat.subcategories || []).slice(0, 6).map((s) => (
                  <li key={s.id} data-testid={`shopbaked-sub-${s.slug}`} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-neutral-600" />
                    <span>{locale === "fr" ? s.name_fr : s.name_en}</span>
                  </li>
                ))}
                {(cat.subcategories?.length || 0) > 6 && (
                  <li className="text-xs text-neutral-500">
                    +{cat.subcategories.length - 6} more
                  </li>
                )}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default ShopHome;
