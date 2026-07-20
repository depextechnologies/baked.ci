import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { APIProvider, Map, AdvancedMarker, useMapsLibrary } from "@vis.gl/react-google-maps";
import { X, MapPin, Navigation2, Search, Home, Building2, Warehouse, Users2, Star, ChevronRight, Clock, Sparkles, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { api } from "../../lib/api";
import { getPlacePredictions, getPlaceDetails, reverseGeocode } from "../../lib/googleMaps";
import { useIsMobile } from "../../hooks/useIsMobile";

const LABEL_ICON = { Home: Home, Office: Building2, Warehouse: Warehouse, Family: Users2, Other: MapPin };
const LABEL_OPTIONS = ["Home", "Office", "Warehouse", "Family", "Other"];

// -------- Missing-key fallback (rendered before <APIProvider> can mount) --------
const NoKeyBanner = ({ onClose }) => (
  <div className="p-8 text-center" data-testid="addr-selector-nokey">
    <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
      <AlertTriangle size={30} />
    </div>
    <div className="text-lg font-bold mt-4">Address selector unavailable</div>
    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">Google Maps isn't configured yet. Please add <code className="text-foreground">REACT_APP_GOOGLE_MAPS_API_KEY</code> to <code className="text-foreground">frontend/.env</code> and restart the app.</p>
    <button onClick={onClose} className="mt-6 baked-btn h-10 px-5 bg-secondary text-sm font-semibold">Close</button>
  </div>
);

// -------- Predictions row --------
const PredictionRow = ({ prediction, onSelect, testid }) => (
  <button
    data-testid={testid}
    onClick={() => onSelect(prediction)}
    className="w-full flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 text-left motion-fast active:bg-secondary/50 hover:bg-secondary/30"
  >
    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
      <MapPin size={14} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold truncate">{prediction.structured_formatting?.main_text || prediction.description}</div>
      <div className="text-[11px] text-muted-foreground truncate">{prediction.structured_formatting?.secondary_text || ""}</div>
    </div>
    <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-2" />
  </button>
);

// -------- Saved / Recent row --------
const AddressRow = ({ icon: Icon, tone = "#77BC1F", label, sub, onClick, badge, testid }) => (
  <button data-testid={testid} onClick={onClick} className="w-full flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 text-left motion-fast active:bg-secondary/50 hover:bg-secondary/30">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}>
      <Icon size={15} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold truncate flex items-center gap-2">
        {label}
        {badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>{badge}</span>}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
  </button>
);

// -------- The main search + list step --------
const SearchStep = ({ onPickPrediction, onDetect, onPickSaved, onPickRecent, detecting, activeCountry }) => {
  const { customer } = useAuth();
  const places = useMapsLibrary("places");
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [saved, setSaved] = useState([]);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef();
  const sessionToken = useMemo(() => (places ? new places.AutocompleteSessionToken() : null), [places]);
  const service = useMemo(() => (places ? new places.AutocompleteService() : null), [places]);

  // Load saved + recent for authed users; recents also cached in localStorage for guests
  useEffect(() => {
    (async () => {
      try {
        if (customer) {
          const [sa, re] = await Promise.all([
            api.get("/customers/me/addresses"),
            api.get("/addresses/recent-searches"),
          ]);
          setSaved(sa.data || []);
          setRecent(re.data || []);
        } else {
          try { setRecent(JSON.parse(localStorage.getItem("baked_recent_searches")) || []); } catch { setRecent([]); }
        }
      } catch (e) { void e; }
    })();
  }, [customer]);

  // Debounced autocomplete
  useEffect(() => {
    if (!service) return;
    if (!query || query.trim().length < 2) { setPredictions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setBusy(true);
    debounceRef.current = setTimeout(async () => {
      const preds = await getPlacePredictions({ input: query, countryCode: activeCountry, sessionToken, service });
      setPredictions(preds);
      setBusy(false);
    }, 220);
    return () => clearTimeout(debounceRef.current);
  }, [query, service, sessionToken, activeCountry]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="addr-search-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a delivery address"
            className="w-full h-12 pl-10 pr-4 baked-input bg-secondary/60 border border-border text-sm"
          />
          {busy && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
        </div>
        <button
          data-testid="addr-detect-btn"
          onClick={onDetect}
          disabled={detecting}
          className="w-full mt-3 h-12 flex items-center gap-3 px-4 baked-btn border border-dashed border-[#77BC1F44] hover:bg-[#77BC1F0A] motion-fast active:scale-[0.99]"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <Navigation2 size={14} />}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold" style={{ color: "#77BC1F" }}>Detect my location</div>
            <div className="text-[11px] text-muted-foreground">Using your device's GPS</div>
          </div>
        </button>
      </div>

      {/* Body: predictions OR saved+recent */}
      <div className="flex-1 overflow-y-auto">
        {predictions.length > 0 ? (
          <div className="baked-card border-y border-border bg-card">
            {predictions.map((p) => (
              <PredictionRow key={p.place_id} prediction={p} onSelect={onPickPrediction} testid={`addr-pred-${p.place_id}`} />
            ))}
          </div>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="mt-2">
                <div className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5"><Clock size={11} /> Recent searches</div>
                <div className="baked-card border-y border-border bg-card">
                  {recent.slice(0, 5).map((r, i) => (
                    <AddressRow
                      key={r.id || r.place_id || i}
                      icon={Clock}
                      tone="#8b8b8b"
                      label={r.formatted_address}
                      sub={[r.city, r.country].filter(Boolean).join(" · ")}
                      onClick={() => onPickRecent(r)}
                      testid={`addr-recent-${i}`}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-4">
              <div className="px-4 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Saved addresses</div>
              {saved.length > 0 ? (
                <div className="baked-card border-y border-border bg-card">
                  {saved.map((a) => (
                    <AddressRow
                      key={a.id}
                      icon={LABEL_ICON[a.label] || MapPin}
                      label={a.label}
                      badge={a.is_default ? "Default" : null}
                      sub={a.formatted_address || `${a.line1}${a.city ? ", " + a.city : ""}`}
                      onClick={() => onPickSaved(a)}
                      testid={`addr-saved-${a.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="baked-card border border-border bg-card mx-4 p-5 text-center">
                  <Sparkles size={18} className="mx-auto text-muted-foreground" />
                  <div className="text-sm font-semibold mt-2">No saved addresses yet</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Search or detect your location — one tap to save.</div>
                </div>
              )}
            </section>

            <section className="mt-4 mb-6 px-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Suggested</div>
              <div className="flex flex-wrap gap-2">
                {(activeCountry === "LR" ? ["Sinkor, Monrovia", "Congo Town, Monrovia", "Mamba Point"] : ["Cocody, Abidjan", "Plateau, Abidjan", "Marcory, Abidjan"]).map((s) => (
                  <button
                    key={s}
                    data-testid={`addr-suggested-${s}`}
                    onClick={() => setQuery(s)}
                    className="px-3 h-8 baked-chip bg-secondary text-xs font-semibold hover:bg-secondary/80 motion-fast"
                  >{s}</button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

// -------- Map preview inside a Map child (needed for AdvancedMarker) --------
const PreviewMap = ({ lat, lng }) => (
  <Map
    style={{ width: "100%", height: "100%" }}
    defaultCenter={{ lat, lng }}
    defaultZoom={15}
    mapId="baked-address-map"
    gestureHandling="greedy"
    disableDefaultUI
    zoomControl
  >
    <AdvancedMarker position={{ lat, lng }}>
      <div className="relative">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-2xl" style={{ backgroundColor: "#77BC1F", boxShadow: "0 8px 20px rgba(119,188,31,0.5)" }}>
          <MapPin size={16} color="#0a1200" strokeWidth={2.5} />
        </div>
        <div className="w-2 h-2 rounded-full bg-[#77BC1F] absolute left-1/2 -translate-x-1/2 -bottom-1" />
      </div>
    </AdvancedMarker>
  </Map>
);

// -------- Confirmation step --------
const ConfirmStep = ({ candidate, activeCountry, onBack, onConfirm }) => {
  const { customer } = useAuth();
  const [saveOn, setSaveOn] = useState(false);
  const [label, setLabel] = useState("Home");
  const [instructions, setInstructions] = useState("");
  const [svc, setSvc] = useState({ loading: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (candidate.latitude == null || candidate.longitude == null) { setSvc({ loading: false, serviceable: false, message: "Missing coordinates" }); return; }
      try {
        const { data } = await api.get("/addresses/serviceability", {
          params: { lat: candidate.latitude, lng: candidate.longitude, country: candidate.country || activeCountry },
        });
        setSvc({ loading: false, ...data });
      } catch (e) {
        setSvc({ loading: false, serviceable: false, message: "Unable to check delivery zone" });
      }
    })();
  }, [candidate.latitude, candidate.longitude, candidate.country, activeCountry]);

  const confirm = async () => {
    if (!svc.serviceable) return;
    setBusy(true);
    try {
      let saved = candidate;
      if (customer && saveOn) {
        const payload = {
          label,
          line1: candidate.formatted_address,
          city: candidate.city || "",
          country: candidate.country || activeCountry,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          place_id: candidate.place_id,
          formatted_address: candidate.formatted_address,
          region: candidate.region,
          postal_code: candidate.postal_code,
          instructions,
          is_default: false,
        };
        const { data } = await api.post("/customers/me/addresses", payload);
        saved = { ...candidate, ...data };
      }
      // Log recent search (best-effort)
      const rec = {
        place_id: candidate.place_id,
        formatted_address: candidate.formatted_address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        city: candidate.city,
        country: candidate.country || activeCountry,
      };
      if (customer) {
        api.post("/addresses/recent-searches", rec).catch(() => {});
      } else {
        try {
          const existing = JSON.parse(localStorage.getItem("baked_recent_searches")) || [];
          const key = rec.place_id || rec.formatted_address;
          const next = [{ ...rec, id: `g_${Date.now()}` }, ...existing.filter((e) => (e.place_id || e.formatted_address) !== key)].slice(0, 10);
          localStorage.setItem("baked_recent_searches", JSON.stringify(next));
        } catch (e) { void e; }
      }
      onConfirm(saved);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-56 relative bg-secondary/40 shrink-0" data-testid="addr-map-preview">
        {candidate.latitude && candidate.longitude ? (
          <PreviewMap lat={candidate.latitude} lng={candidate.longitude} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No coordinates</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Selected address</div>
          <div className="text-sm font-semibold mt-1" data-testid="addr-confirm-address">{candidate.formatted_address}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{[candidate.city, candidate.region, candidate.country].filter(Boolean).join(" · ")}</div>
        </div>

        {/* Serviceability */}
        <div className="px-5 mt-4">
          {svc.loading ? (
            <div className="baked-card border border-border bg-card p-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Checking delivery availability…
            </div>
          ) : svc.serviceable ? (
            <div data-testid="addr-serviceable" className="baked-card border p-3 flex items-start gap-3" style={{ borderColor: "#77BC1F44", backgroundColor: "#77BC1F0F" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
                <ShieldCheck size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "#77BC1F" }}>We deliver here</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {svc.nearest_hub?.name} · {svc.distance_km} km away
                </div>
              </div>
            </div>
          ) : (
            <div data-testid="addr-unserviceable" className="baked-card border p-3 flex items-start gap-3" style={{ borderColor: "#FF4C5244", backgroundColor: "#FF4C520F" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#FF4C5222", color: "#FF4C52" }}>
                <AlertTriangle size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "#FF4C52" }}>Not available yet</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{svc.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Save option (authed customers only) */}
        {customer && (
          <div className="px-5 mt-4">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" data-testid="addr-save-toggle" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} className="w-4 h-4 accent-[#77BC1F]" />
              Save this address to my address book
            </label>
            {saveOn && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {LABEL_OPTIONS.map((l) => {
                    const Ic = LABEL_ICON[l];
                    const active = label === l;
                    return (
                      <button key={l} data-testid={`addr-label-${l}`} onClick={() => setLabel(l)} className={`h-9 px-3 baked-chip flex items-center gap-1.5 text-xs font-semibold motion-fast border ${active ? "border-[#77BC1F] text-[#77BC1F] bg-[#77BC1F14]" : "border-border bg-secondary"}`}>
                        <Ic size={12} /> {l}
                      </button>
                    );
                  })}
                </div>
                <input
                  data-testid="addr-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Delivery instructions (optional) — gate code, floor, landmarks…"
                  className="w-full h-10 baked-input bg-secondary/60 border border-border px-3 text-xs"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 flex gap-2 shrink-0">
        <button data-testid="addr-change-btn" onClick={onBack} className="flex-1 h-12 baked-btn border border-border bg-secondary font-semibold text-sm motion-fast active:scale-[0.99]">Change address</button>
        <button
          data-testid="addr-confirm-btn"
          onClick={confirm}
          disabled={!svc.serviceable || busy}
          className="flex-1 h-12 baked-btn font-bold text-sm text-black motion-fast active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#77BC1F" }}
        >{busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Confirm address"}</button>
      </div>
    </div>
  );
};

// -------- Root selector (dialog + bottom sheet) --------
const AddressSelectorInner = ({ onClose, activeCountry }) => {
  const [step, setStep] = useState("search"); // 'search' | 'confirm'
  const [candidate, setCandidate] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const { setActiveAddress } = useApp();
  const places = useMapsLibrary("places");
  const geo = useMapsLibrary("geocoding");
  const geocoder = useMemo(() => (geo ? new window.google.maps.Geocoder() : null), [geo]);
  // Places details requires an attached container; use a hidden div
  const detailsHostRef = useRef(null);
  const detailsService = useMemo(() => {
    if (!places || !detailsHostRef.current) return null;
    return new places.PlacesService(detailsHostRef.current);
  }, [places, detailsHostRef.current]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionToken = useMemo(() => (places ? new places.AutocompleteSessionToken() : null), [places]);

  const onPickPrediction = useCallback(async (prediction) => {
    try {
      const place = await getPlaceDetails({ placeId: prediction.place_id, sessionToken, service: detailsService });
      setCandidate({ ...place, country: (place.country || activeCountry).toUpperCase() });
      setStep("confirm");
    } catch (e) {
      toast.error("Couldn't load address details");
    }
  }, [sessionToken, detailsService, activeCountry]);

  const onPickSaved = useCallback((addr) => {
    setCandidate({
      place_id: addr.place_id,
      formatted_address: addr.formatted_address || `${addr.line1}${addr.city ? ", " + addr.city : ""}`,
      latitude: addr.latitude,
      longitude: addr.longitude,
      city: addr.city,
      region: addr.region,
      country: (addr.country || activeCountry).toUpperCase(),
      postal_code: addr.postal_code,
      _saved_id: addr.id,
      _is_default: addr.is_default,
    });
    setStep("confirm");
  }, [activeCountry]);

  const onPickRecent = useCallback((r) => {
    setCandidate({
      place_id: r.place_id,
      formatted_address: r.formatted_address,
      latitude: r.latitude,
      longitude: r.longitude,
      city: r.city,
      country: (r.country || activeCountry).toUpperCase(),
    });
    setStep("confirm");
  }, [activeCountry]);

  const onDetect = useCallback(async () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported by this browser"); return; }
    if (!geocoder) { toast.error("Maps not ready yet — try again in a moment"); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const place = await reverseGeocode({ lat: pos.coords.latitude, lng: pos.coords.longitude, geocoder });
          setCandidate({ ...place, country: (place.country || activeCountry).toUpperCase() });
          setStep("confirm");
        } catch (e) {
          toast.error("Could not detect address from your location");
        } finally { setDetecting(false); }
      },
      (err) => {
        setDetecting(false);
        if (err.code === err.PERMISSION_DENIED) toast.error("Location permission denied");
        else toast.error("Couldn't detect your location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [geocoder, activeCountry]);

  const onConfirm = useCallback((addr) => {
    setActiveAddress(addr);
    toast.success("Delivery address updated");
    onClose();
  }, [setActiveAddress, onClose]);

  return (
    <>
      {/* Hidden host for PlacesService.getDetails() — must be attached to DOM */}
      <div ref={detailsHostRef} style={{ display: "none" }} />
      {step === "search" ? (
        <SearchStep
          activeCountry={activeCountry}
          onPickPrediction={onPickPrediction}
          onPickSaved={onPickSaved}
          onPickRecent={onPickRecent}
          onDetect={onDetect}
          detecting={detecting}
        />
      ) : (
        <ConfirmStep candidate={candidate} activeCountry={activeCountry} onBack={() => setStep("search")} onConfirm={onConfirm} />
      )}
    </>
  );
};

// -------- Dialog / bottom-sheet frame --------
export const AddressSelector = () => {
  const { addressSelectorOpen, closeAddressSelector, country } = useApp();
  const isMobile = useIsMobile();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  if (!addressSelectorOpen) return null;

  const frame = (
    <div
      className={
        isMobile
          ? "fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl bg-background border-t border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8"
          : "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[640px] max-w-[92vw] h-[80vh] max-h-[720px] rounded-3xl bg-background border border-border shadow-2xl flex flex-col overflow-hidden"
      }
      style={isMobile ? { height: "88vh" } : undefined}
      data-testid="address-selector"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
          <MapPin size={17} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold">Select delivery location</div>
          <div className="text-[11px] text-muted-foreground truncate">Serving {country?.name || "your country"} · {country?.currency_symbol || country?.currency}</div>
        </div>
        <button data-testid="addr-close-btn" onClick={closeAddressSelector} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center motion-fast active:scale-95" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {apiKey ? (
          <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
            <AddressSelectorInner onClose={closeAddressSelector} activeCountry={country?.code || "CI"} />
          </APIProvider>
        ) : (
          <NoKeyBanner onClose={closeAddressSelector} />
        )}
      </div>
    </div>
  );

  return (
    <>
      <div onClick={closeAddressSelector} className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm animate-in fade-in" data-testid="address-selector-backdrop" />
      {frame}
    </>
  );
};
