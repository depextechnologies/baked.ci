/**
 * GlobalSearchDropdown — portal-based typeahead for the BAKED header.
 *
 * Mounted inside TopNav and MobileHeader. Debounces at 220ms, cancels
 * stale requests via AbortController (newest keystroke wins), reads
 * country from the Baked location store, honours FR/EN locale.
 *
 * The results are grouped by module (FOOD / MART / SHOP / SEND) and
 * clicking a hit navigates to its `destination_url`; pressing Enter
 * jumps to the full /search page.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  Search, Loader2, Utensils, ShoppingCart, ShoppingBag, Package, Store,
  ArrowRight, Clock, Sparkles,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const MODULE_META = {
  mart: { label_fr: "MARTbakēd",  label_en: "MARTbakēd",  color: "#77BC1F", icon: ShoppingCart },
  food: { label_fr: "FOODbakēd",  label_en: "FOODbakēd",  color: "#00A651", icon: Utensils },
  shop: { label_fr: "SHOPbakēd",  label_en: "SHOPbakēd",  color: "#FCC44C", icon: ShoppingBag },
  send: { label_fr: "SENDbakēd",  label_en: "SENDbakēd",  color: "#F3B300", icon: Package },
  auto: { label_fr: "AUTObakēd",  label_en: "AUTObakēd",  color: "#9B87F5", icon: Store },
  immo: { label_fr: "IMMObakēd",  label_en: "IMMObakēd",  color: "#EC4899", icon: Store },
};

const detectCountry = () => {
  try {
    const raw = localStorage.getItem("baked_location") || localStorage.getItem("baked_customer_location");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.country || parsed?.country_code || "CI";
    }
  } catch { /* ignore */ }
  return "CI";
};

const GlobalSearchDropdown = ({ anchorRef, open, onClose, query, onPickResult }) => {
  const nav = useNavigate();
  const { i18n } = useTranslation();
  const fr = (i18n?.language || "fr").toLowerCase().startsWith("fr");
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(false);
  const abortRef = useRef(null);
  const [coords, setCoords] = useState(null);

  // Position below the anchor input
  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, left: r.left, width: Math.max(360, r.width) });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, anchorRef]);

  // Debounced fetch — cancels in-flight requests so the newest keystroke wins.
  useEffect(() => {
    if (!open) { setData(null); return; }
    const q = (query || "").trim();
    if (q.length < 2) { setData(null); return; }
    const t = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoad(true);
      try {
        const url = `${API}/api/search?q=${encodeURIComponent(q)}&country=${detectCountry()}&language=${fr ? "fr" : "en"}&limit=6`;
        const { data } = await axios.get(url, { signal: ctrl.signal });
        setData(data);
      } catch (e) {
        if (!axios.isCancel(e) && e.name !== "CanceledError") setData({ groups: [], detected_intents: [] });
      } finally { setLoad(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [query, open, fr]);

  const handlePick = (hit, group) => {
    try {
      if (data?.event_id) {
        axios.post(`${API}/api/search/click`, {
          event_id: data.event_id, module: group.module,
          entity_type: hit.entity_type, entity_id: hit.destination_url,
        }).catch(() => { /* fire-and-forget */ });
      }
    } catch { /* ignore */ }
    onClose?.();
    if (onPickResult) onPickResult(hit);
    else if (hit.destination_url) nav(hit.destination_url);
  };

  const seeAll = () => {
    const q = (query || "").trim();
    if (!q) return;
    onClose?.();
    nav(`/search?q=${encodeURIComponent(q)}`);
  };

  if (!open || !coords) return null;
  const q = (query || "").trim();

  const content = (
    <div
      className="fixed z-[1000] rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden"
      style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: "70vh" }}
      data-testid="global-search-dropdown"
      role="listbox"
    >
      {q.length < 2 && (
        <div className="p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Sparkles size={12} /> {fr ? "Tapez au moins 2 caractères…" : "Type at least 2 characters…"}
        </div>
      )}

      {q.length >= 2 && (
        <div className="max-h-[70vh] overflow-y-auto">
          {loading && !data && (
            <div className="p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {fr ? "Recherche…" : "Searching…"}
            </div>
          )}

          {data?.detected_intents?.length > 0 && (
            <div className="p-2">
              {data.detected_intents.slice(0, 2).map((it) => {
                const M = MODULE_META[it.module] || {};
                const Ic = M.icon || Package;
                return (
                  <button key={it.intent_code} onClick={() => { onClose?.(); nav(it.destination); }}
                          data-testid={`global-search-intent-${it.intent_code}`}
                          className="w-full text-left rounded-xl p-3 hover:bg-secondary flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-black"
                         style={{ backgroundColor: M.color || "#999" }}>
                      <Ic size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: M.color }}>
                        {fr ? M.label_fr : M.label_en}
                      </div>
                      <div className="font-semibold text-sm">{it.action_label}</div>
                      {it.subtitle && <div className="text-xs text-muted-foreground truncate">{it.subtitle}</div>}
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}

          {data?.groups?.map((g) => {
            const M = MODULE_META[g.module] || {};
            const Ic = M.icon || Package;
            return (
              <div key={g.module} className="border-t border-border/50" data-testid={`global-search-group-${g.module}`}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: M.color }}>
                    <Ic size={10} className="text-black" />
                  </div>
                  <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: M.color }}>
                    {fr ? M.label_fr : M.label_en} <span className="opacity-50">({g.count})</span>
                  </div>
                </div>
                <ul>
                  {g.items.map((it, idx) => (
                    <li key={`${g.module}-${idx}`}>
                      <button onClick={() => handlePick(it, g)}
                              data-testid={`global-search-hit-${g.module}-${idx}`}
                              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-secondary text-left">
                        {it.image ? (
                          <img src={it.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-muted" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Ic size={14} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{it.title}</div>
                          {it.subtitle && <div className="text-[11px] text-muted-foreground truncate">{it.subtitle}</div>}
                        </div>
                        {it.price != null && (
                          <div className="text-xs font-semibold" style={{ color: M.color }}>
                            {Number(it.price).toLocaleString(fr ? "fr-FR" : "en-US")} {it.currency || ""}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {data && !data.detected_intents?.length && !data.groups?.length && (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="global-search-empty">
              {fr ? `Aucun résultat pour "${q}"` : `No results for "${q}"`}
              {data?.suggestions?.length ? (
                <div className="mt-2">
                  {fr ? "Essayez : " : "Try: "}
                  {data.suggestions.map((s) => (
                    <button key={s} onClick={() => nav(`/search?q=${encodeURIComponent(s)}`)}
                            className="underline text-primary mx-1">{s}</button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {q.length >= 2 && (data?.groups?.length || data?.detected_intents?.length) && (
            <button onClick={seeAll}
                    data-testid="global-search-see-all"
                    className="w-full px-4 py-3 text-left text-xs font-semibold bg-secondary/50 hover:bg-secondary inline-flex items-center justify-between">
              <span>{fr ? `Voir tous les résultats pour "${q}"` : `See all results for "${q}"`}</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default GlobalSearchDropdown;
