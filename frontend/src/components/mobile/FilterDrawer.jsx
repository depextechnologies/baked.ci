import React, { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "../ui/button";

/**
 * FilterDrawer — bottom sheet with left column of filter groups and right column of options.
 * Matches the MARTbaked spec (Type, Sort, Price, Country of Origin).
 */
const GROUPS = [
  { code: "sort", label: "Sort" },
  { code: "type", label: "Type" },
  { code: "price", label: "Price" },
  { code: "origin", label: "Origin" },
];

const SORT_OPTIONS = [
  { code: "relevance", label: "Relevance (default)" },
  { code: "price_asc", label: "Price (low to high)" },
  { code: "price_desc", label: "Price (high to low)" },
  { code: "discount_desc", label: "Discount (high to low)" },
];

const PRICE_OPTIONS = [
  { code: "0-99", label: "Below 99" },
  { code: "100-499", label: "100 – 499" },
  { code: "500-999", label: "500 – 999" },
  { code: "1000+", label: "1,000 and above" },
];

export const FilterDrawer = ({ open, onClose, onApply, initial = {}, brands = [], origins = [] }) => {
  const [active, setActive] = useState("sort");
  const [state, setState] = useState({ sort: "relevance", price: null, type: [], origin: [], ...initial });

  if (!open) return null;

  const toggleMulti = (key, code) => setState((s) => {
    const arr = s[key] || [];
    return { ...s, [key]: arr.includes(code) ? arr.filter((c) => c !== code) : [...arr, code] };
  });

  const RadioRow = ({ label, checked, onClick, testid }) => (
    <button data-testid={testid} onClick={onClick} className="w-full flex items-center justify-between py-3 border-b border-border/60 text-left">
      <span className="text-sm">{label}</span>
      <span className={`w-5 h-5 rounded-full border-2 ${checked ? "" : "border-border"} flex items-center justify-center`} style={checked ? { borderColor: "#77BC1F", backgroundColor: "#77BC1F" } : {}}>
        {checked && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
    </button>
  );

  const CheckRow = ({ label, checked, onClick, testid, count }) => (
    <button data-testid={testid} onClick={onClick} className="w-full flex items-center justify-between py-3 border-b border-border/60 text-left">
      <span className="text-sm">{label}{count != null && <span className="text-muted-foreground text-xs"> ({count})</span>}</span>
      <span className={`w-5 h-5 rounded border-2 ${checked ? "" : "border-border"} flex items-center justify-center`} style={checked ? { backgroundColor: "#77BC1F", borderColor: "#77BC1F" } : {}}>
        {checked && <Check size={13} strokeWidth={3} color="#0a1200" />}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close filters" data-testid="m-filter-backdrop" />
      <div className="relative bg-card border-t border-border rounded-t-[24px] h-[80vh] flex flex-col shadow-2xl" style={{ animation: "sheet-in 240ms cubic-bezier(.2,.9,.2,1)" }}>
        <div className="pt-3 pb-2 flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="px-5 pb-3 flex items-center justify-between border-b border-border">
          <div className="text-base font-bold">Filters</div>
          <button data-testid="m-filter-close" onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X size={14} /></button>
        </div>

        <div className="flex-1 grid grid-cols-[110px_1fr] min-h-0">
          <div className="bg-secondary/40 overflow-y-auto">
            {GROUPS.map((g) => (
              <button
                key={g.code}
                data-testid={`m-filter-group-${g.code}`}
                onClick={() => setActive(g.code)}
                className={`w-full text-left px-4 py-3.5 text-sm ${active === g.code ? "bg-card font-semibold border-l-2" : "text-muted-foreground"}`}
                style={active === g.code ? { borderColor: "#77BC1F" } : {}}
              >
                {g.label}
                {g.code !== "sort" && (state[g.code === "price" ? "price" : g.code]?.length || (g.code === "price" && state.price)) ? (
                  <span className="ml-1 text-[10px]" style={{ color: "#77BC1F" }}>●</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto px-4">
            {active === "sort" && SORT_OPTIONS.map((o) => (
              <RadioRow key={o.code} label={o.label} checked={state.sort === o.code} onClick={() => setState((s) => ({ ...s, sort: o.code }))} testid={`m-filter-sort-${o.code}`} />
            ))}
            {active === "type" && (brands.length ? brands.map((b) => (
              <CheckRow key={b.code || b} label={b.label || b} count={b.count} checked={state.type.includes(b.code || b)} onClick={() => toggleMulti("type", b.code || b)} testid={`m-filter-type-${b.code || b}`} />
            )) : <div className="py-6 text-xs text-muted-foreground">No type filters available for this list.</div>)}
            {active === "price" && PRICE_OPTIONS.map((p) => (
              <RadioRow key={p.code} label={p.label} checked={state.price === p.code} onClick={() => setState((s) => ({ ...s, price: s.price === p.code ? null : p.code }))} testid={`m-filter-price-${p.code}`} />
            ))}
            {active === "origin" && (origins.length ? origins.map((o) => (
              <CheckRow key={o.code || o} label={o.label || o} count={o.count} checked={state.origin.includes(o.code || o)} onClick={() => toggleMulti("origin", o.code || o)} testid={`m-filter-origin-${o.code || o}`} />
            )) : <div className="py-6 text-xs text-muted-foreground">No country-of-origin data yet.</div>)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 border-t border-border pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <Button data-testid="m-filter-clear" variant="outline" onClick={() => setState({ sort: "relevance", price: null, type: [], origin: [] })} className="baked-btn h-11">Clear</Button>
          <Button data-testid="m-filter-apply" onClick={() => { onApply(state); onClose(); }} className="baked-btn h-11 font-semibold" style={{ backgroundColor: "#77BC1F", color: "#0a1200" }}>Apply</Button>
        </div>
      </div>
    </div>
  );
};
