/**
 * GlobalSearchResultsPage — /search?q=…&module=…
 *
 * Full-page cross-module search results. Replaces the MART-only
 * /products?search= experience when invoked from the global header.
 * Lists intent cards first, then per-module sections ordered by top-hit
 * relevance. Empty tabs are hidden.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Search, Loader2, Utensils, ShoppingCart, ShoppingBag, Package, ArrowRight, Store,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const detectFr = () =>
  (((typeof window !== "undefined" && localStorage.getItem("i18nextLng")) || "fr").toLowerCase().startsWith("fr"));
const detectCountry = () => {
  try {
    const raw = localStorage.getItem("baked_location") || localStorage.getItem("baked_customer_location");
    if (raw) { const p = JSON.parse(raw); return p?.country || p?.country_code || "CI"; }
  } catch { /* ignore */ }
  return "CI";
};

const MODULE_META = {
  mart: { label_fr: "MARTbakēd", label_en: "MARTbakēd", color: "#77BC1F", icon: ShoppingCart },
  food: { label_fr: "FOODbakēd", label_en: "FOODbakēd", color: "#00A651", icon: Utensils },
  shop: { label_fr: "SHOPbakēd", label_en: "SHOPbakēd", color: "#FCC44C", icon: ShoppingBag },
  send: { label_fr: "SENDbakēd", label_en: "SENDbakēd", color: "#F3B300", icon: Package },
  auto: { label_fr: "AUTObakēd", label_en: "AUTObakēd", color: "#9B87F5", icon: Store },
  immo: { label_fr: "IMMObakēd", label_en: "IMMObakēd", color: "#EC4899", icon: Store },
};

const GlobalSearchResultsPage = () => {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const fr = detectFr();
  const q = params.get("q") || "";
  const moduleFilter = params.get("module") || "all";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!q) { setData(null); return; }
    setLoading(true);
    try {
      const url = `${API}/api/search?q=${encodeURIComponent(q)}&country=${detectCountry()}&language=${fr ? "fr" : "en"}&limit=20${moduleFilter !== "all" ? `&module=${moduleFilter}` : ""}`;
      const res = await axios.get(url);
      setData(res.data);
    } catch (e) { setData({ groups: [], detected_intents: [] }); }
    finally { setLoading(false); }
  }, [q, fr, moduleFilter]);
  useEffect(() => { load(); }, [load]);

  const availableTabs = useMemo(() => {
    const mods = (data?.groups || []).map((g) => g.module);
    return ["all", ...mods];
  }, [data]);

  const [input, setInput] = useState(q);
  useEffect(() => { setInput(q); }, [q]);
  const submit = (e) => {
    e.preventDefault();
    const next = input.trim();
    if (next) setParams({ q: next, ...(moduleFilter !== "all" ? { module: moduleFilter } : {}) });
  };

  return (
    <div className="min-h-screen pb-16" data-testid="global-search-page">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <form onSubmit={submit} className="max-w-3xl mx-auto flex gap-2 items-center">
          <Search size={16} className="text-muted-foreground" />
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 placeholder={fr ? "Rechercher des produits, restaurants, plats et services…"
                                 : "Search products, restaurants, dishes and services…"}
                 className="h-10 flex-1 rounded-lg border border-border bg-secondary/40 px-3 text-sm"
                 data-testid="global-search-page-input" />
          <button type="submit" className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            {fr ? "Rechercher" : "Search"}
          </button>
        </form>
      </header>

      {!q && (
        <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
          {fr ? "Tapez une recherche pour explorer MARTbakēd, FOODbakēd, SHOPbakēd et SENDbakēd."
              : "Type a search to explore MARTbakēd, FOODbakēd, SHOPbakēd and SENDbakēd."}
        </div>
      )}

      {q && (
        <div className="max-w-3xl mx-auto p-4 space-y-5">
          <div className="text-sm">
            {fr ? "Résultats pour " : "Results for "}
            <span className="font-bold">« {q} »</span>
            {data && <span className="text-muted-foreground"> · {data.latency_ms}ms</span>}
          </div>

          {availableTabs.length > 1 && (
            <div className="flex gap-2 overflow-x-auto" data-testid="global-search-tabs">
              {availableTabs.map((t) => {
                const M = MODULE_META[t];
                const label = t === "all" ? (fr ? "Tous" : "All") : (M ? (fr ? M.label_fr : M.label_en) : t);
                const active = moduleFilter === t || (t === "all" && moduleFilter === "all");
                return (
                  <button key={t} onClick={() => setParams(t === "all" ? { q } : { q, module: t })}
                          data-testid={`global-search-tab-${t}`}
                          className={`h-8 px-3 rounded-full text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {loading && !data && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {fr ? "Recherche…" : "Searching…"}
            </div>
          )}

          {data?.detected_intents?.map((it) => {
            const M = MODULE_META[it.module] || {};
            const Ic = M.icon || Package;
            return (
              <button key={it.intent_code} onClick={() => nav(it.destination)}
                      data-testid={`global-search-page-intent-${it.intent_code}`}
                      className="w-full text-left rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-black"
                     style={{ backgroundColor: M.color || "#999" }}>
                  <Ic size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: M.color }}>
                    {fr ? M.label_fr : M.label_en}
                  </div>
                  <div className="font-bold text-base">{it.action_label}</div>
                  {it.subtitle && <div className="text-xs text-muted-foreground">{it.subtitle}</div>}
                </div>
                <ArrowRight size={16} />
              </button>
            );
          })}

          {data?.groups?.map((g) => {
            const M = MODULE_META[g.module] || {};
            const Ic = M.icon || Package;
            return (
              <section key={g.module} data-testid={`global-search-page-group-${g.module}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: M.color }}>
                    <Ic size={12} className="text-black" />
                  </div>
                  <h2 className="text-sm font-bold" style={{ color: M.color }}>
                    {fr ? M.label_fr : M.label_en} <span className="opacity-50">· {g.count}</span>
                  </h2>
                </div>
                <ul className="grid gap-2 md:grid-cols-2">
                  {g.items.map((it, idx) => (
                    <li key={`${g.module}-${idx}`}>
                      <button onClick={() => nav(it.destination_url)}
                              data-testid={`global-search-page-hit-${g.module}-${idx}`}
                              className="w-full rounded-xl border border-border bg-card p-3 flex items-center gap-3 text-left hover:bg-secondary/40">
                        {it.image ? (
                          <img src={it.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Ic size={18} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{it.title}</div>
                          {it.subtitle && <div className="text-xs text-muted-foreground truncate">{it.subtitle}</div>}
                          {it.price != null && (
                            <div className="text-xs font-bold mt-0.5" style={{ color: M.color }}>
                              {Number(it.price).toLocaleString(fr ? "fr-FR" : "en-US")} {it.currency || ""}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {data && !data.detected_intents?.length && !data.groups?.length && (
            <div className="text-center py-16 text-sm text-muted-foreground" data-testid="global-search-page-empty">
              {fr ? `Aucun résultat pour « ${q} ».` : `No results for "${q}".`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchResultsPage;
