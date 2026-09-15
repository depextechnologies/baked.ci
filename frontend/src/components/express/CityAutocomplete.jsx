import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Search, X } from "lucide-react";

import { useApp } from "../../contexts/BakedContexts";
import { fetchAutocompleteSuggestions, fetchPlaceDetails } from "../../lib/googleMaps";

const YELLOW = "#FCC44C";

/**
 * Phase D — City-only autocomplete input for the SEND Between-Cities flow.
 *
 * Behaves like a lightweight version of the global address selector but:
 *   • hard-restricts Google Places results to cities via `types=locality`,
 *   • renders INLINE (no sheet / no full-screen picker) — matches the
 *     Between-Cities UX where the customer just needs to type Abidjan /
 *     Yamoussoukro / San-Pédro / Monrovia,
 *   • never returns a street-level address — the primary text is the city
 *     and secondary text is the region + country, so pricing/dispatch see
 *     a clean per-city payload.
 *
 * Emits the SAME shape as `AddressSelector` so downstream code (draft,
 * booking POST, map polyline) works without a special case.
 */
export const CityAutocomplete = ({ testid, label, value, onPick, placeholder }) => {
  const { t } = useTranslation("customer");
  const { country } = useApp();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const sessionToken = useMemo(() => (
    window.google?.maps?.places
      ? new window.google.maps.places.AutocompleteSessionToken()
      : null
  ), []);

  useEffect(() => {
    if (!query.trim()) { setPredictions([]); setOpen(false); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const rows = await fetchAutocompleteSuggestions({
        input: query,
        countryCode: country?.code,
        sessionToken,
        // Places API (New) - restrict to cities. `locality` covers the
        // vast majority of relevant Ivorian / Liberian cities; we also
        // include `administrative_area_level_3` so smaller preferences
        // (Aboisso, Bouake sub-district) still surface.
        types: ["locality", "administrative_area_level_3"],
      });
      if (cancelled) return;
      setPredictions(rows);
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, country?.code, sessionToken]);

  useEffect(() => {
    const handle = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const pick = async (row) => {
    setLoading(true);
    try {
      const details = await fetchPlaceDetails({ suggestion: row });
      // Compress to a city payload — line1 = city name, formatted_address
      // = "City · Region · Country" for the map/route strip.
      const city = details.city || row.mainText || details.formatted_address;
      const formatted = [city, details.region, details.country].filter(Boolean).join(" · ");
      onPick({
        ...details,
        line1: city,
        formatted_address: formatted || details.formatted_address,
      });
      setQuery(formatted || city);
      setOpen(false);
    } finally { setLoading(false); }
  };

  const clear = () => {
    setQuery("");
    onPick(null);
    setPredictions([]);
    setOpen(false);
  };

  const display = value?.formatted_address || query;

  return (
    <div className="w-full" ref={wrapRef}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className="relative">
        <div className="baked-input flex items-center gap-2 border border-border bg-secondary/40 px-3 h-12 rounded-2xl focus-within:border-[#FCC44C]">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: `${YELLOW}22`, color: YELLOW }}>
            <MapPin size={12} />
          </div>
          <input
            data-testid={testid}
            type="text"
            value={display}
            onChange={(e) => { setQuery(e.target.value); if (value) onPick(null); }}
            onFocus={() => predictions.length && setOpen(true)}
            placeholder={placeholder || t("send.wizard.between_city_placeholder")}
            className="flex-1 bg-transparent outline-none text-sm font-semibold min-w-0"
            autoComplete="off"
          />
          {value ? (
            <button data-testid={`${testid}-clear`} onClick={clear} className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground motion-fast" aria-label={t("send.wizard.remove")}>
              <X size={12} />
            </button>
          ) : (
            <Search size={13} className="text-muted-foreground" />
          )}
        </div>
        {open && (predictions.length > 0 || loading) && (
          <div
            data-testid={`${testid}-dropdown`}
            className="absolute z-30 left-0 right-0 mt-1 rounded-2xl border border-border bg-card shadow-[0_18px_40px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            {loading && predictions.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t("send.wizard.searching")}</div>
            )}
            {predictions.map((row) => (
              <button
                key={row.placeId}
                data-testid={`${testid}-opt-${row.placeId}`}
                onClick={() => pick(row)}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-secondary/60 motion-fast"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${YELLOW}22`, color: YELLOW }}>
                  <MapPin size={11} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{row.mainText}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{row.secondaryText}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CityAutocomplete;
