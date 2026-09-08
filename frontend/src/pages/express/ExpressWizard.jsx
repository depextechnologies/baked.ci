import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Navigation2, Edit3, ChevronRight, Star, ShieldCheck, Clock, Info, PhoneCall, Home, DoorOpen, PenSquare, ArrowLeft, CheckCircle2, Package, Truck, Bike } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { ExpressHeader, WizardProgress, ExpressFooter, useMoney } from "../../components/express/ExpressLayout";
import { ExpressWizardShell } from "../../components/express/ExpressWizardShell";
import { vehicleImage } from "../../lib/expressAssets";

const STEPS = [
  { code: "location", label: "Location" },
  { code: "receiver", label: "Receiver" },
  { code: "vehicle",  label: "Vehicle" },
  { code: "package",  label: "Package" },
  { code: "review",   label: "Review" },
];

// ---------------- STEP 1: Pickup & Drop ----------------
export const ExpressStepLocation = () => {
  const navigate = useNavigate();
  const { openAddressSelector } = useApp();
  const { draft, setDraft } = useExpressBooking();

  const pickPickup = () => openAddressSelector({
    title: "Pickup location",
    onPick: (addr) => setDraft({ pickup: addr }),
  });
  const pickDrop = () => openAddressSelector({
    title: "Drop-off location",
    onPick: (addr) => setDraft({ drop: addr }),
  });

  const ok = draft.pickup && draft.drop;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Pick-up & Drop Location" step={1} />
      <WizardProgress steps={STEPS} current={0} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <AddressField testid="exp-pickup" label="Pickup Location" address={draft.pickup} onEdit={pickPickup} tone="#FCC44C" hint="Where should we collect from?" />
          <AddressField testid="exp-drop" label="Drop-off Location" address={draft.drop} onEdit={pickDrop} tone="#FCC44C" hint="Where are we delivering?" />
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/receiver")} disabled={!ok} />
    </div>
  );
};

const AddressField = ({ testid, label, address, onEdit, tone = "#FCC44C", hint }) => (
  <button data-testid={testid} onClick={onEdit} className="w-full baked-card border border-border p-4 flex items-start gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#FCC44C]">
    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tone}22`, color: tone }}>
      <MapPin size={16} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-bold truncate mt-0.5">{address?.formatted_address || hint}</div>
      {address?.city && <div className="text-[11px] text-muted-foreground truncate">{[address.city, address.region, address.country].filter(Boolean).join(" · ")}</div>}
    </div>
    <Edit3 size={14} className="text-muted-foreground shrink-0 mt-1" />
  </button>
);

// ---------------- STEP 2: Receiver ----------------
export const ExpressStepReceiver = () => {
  const navigate = useNavigate();
  const { draft, setDraft } = useExpressBooking();
  const [prefs, setPrefs] = useState([]);
  const r = draft.receiver;

  useEffect(() => { api.get("/express/delivery-preferences").then((rs) => setPrefs(rs.data)); }, []);

  const patch = (k, v) => setDraft({ receiver: { ...r, [k]: v } });
  const togglePref = (code) => {
    const set = new Set(r.preferences || []);
    if (set.has(code)) set.delete(code); else set.add(code);
    patch("preferences", Array.from(set));
  };

  const ok = r.name?.trim() && r.phone?.trim();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Receiver Details" step={2} />
      <WizardProgress steps={STEPS} current={1} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">Who are we delivering to?</div>
          <Field label="Receiver Name *"><input data-testid="exp-r-name" value={r.name} onChange={(e) => patch("name", e.target.value)} placeholder="Full name" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label="Phone Number *"><input data-testid="exp-r-phone" value={r.phone} onChange={(e) => patch("phone", e.target.value)} placeholder="e.g. +225 07 00 00 00" inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label="Alternate Number (Optional)"><input data-testid="exp-r-alt-phone" value={r.alt_phone} onChange={(e) => patch("alt_phone", e.target.value)} placeholder="Backup contact" inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label="Building / Apartment / House No."><input data-testid="exp-r-building" value={r.building} onChange={(e) => patch("building", e.target.value)} placeholder="Flat 4B, Building name" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label="Landmark (Optional)"><input data-testid="exp-r-landmark" value={r.landmark} onChange={(e) => patch("landmark", e.target.value)} placeholder="Near a school, mosque, etc." className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label="Delivery Notes (Optional)"><textarea data-testid="exp-r-notes" value={r.notes} onChange={(e) => patch("notes", e.target.value)} rows={3} placeholder="Please ring the bell, leave with security…" className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" /></Field>

          <div>
            <div className="text-xs font-semibold mt-3 mb-2">Delivery Preferences</div>
            <div className="grid gap-2">
              {prefs.map((p) => {
                const active = (r.preferences || []).includes(p.code);
                const Icon = p.code === "call_before" ? PhoneCall : p.code === "leave_at_door" ? DoorOpen : PenSquare;
                return (
                  <button key={p.code} data-testid={`exp-r-pref-${p.code}`} onClick={() => togglePref(p.code)} className={`baked-card border p-3 flex items-center gap-3 text-left motion-fast active:scale-[0.995] ${active ? "border-[#FCC44C] bg-[#FCC44C14]" : "border-border"}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={15} /></div>
                    <div className="flex-1"><div className="text-sm font-semibold">{p.label}</div><div className="text-[10px] text-muted-foreground">{p.description}</div></div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${active ? "border-[#FCC44C] bg-[#FCC44C]" : "border-border"}`}>{active && <CheckCircle2 size={13} className="text-black" />}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/vehicle")} disabled={!ok} />
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</div>
    {children}
  </label>
);

// ---------------- STEP 3: Vehicle ----------------
export const ExpressStepVehicle = () => {
  const navigate = useNavigate();
  const { country } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const [quotes, setQuotes] = useState({}); // { vehicle_code: total }
  const money = useMoney();

  useEffect(() => { api.get(`/express/vehicles?country=${country?.code || "CI"}`).then((r) => setVehicles(r.data)); }, [country?.code]);

  // Prefetch quotes per vehicle so shopper sees live prices side-by-side
  useEffect(() => {
    if (!draft.pickup || !draft.drop || vehicles.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(vehicles.map(async (v) => {
        try {
          const { data } = await api.post("/express/quote/parcel", {
            country: country?.code || "CI",
            vehicle_code: v.code,
            pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
            drop_lat: draft.drop.latitude, drop_lng: draft.drop.longitude,
          });
          return [v.code, data];
        } catch { return [v.code, null]; }
      }));
      if (!cancelled) setQuotes(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [vehicles, draft.pickup, draft.drop, country?.code]);

  const cheapestCode = useMemo(() => {
    const eligible = Object.entries(quotes).filter(([, q]) => q?.total != null);
    if (!eligible.length) return null;
    return eligible.sort((a, b) => a[1].total - b[1].total)[0][0];
  }, [quotes]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Select Vehicle" step={3} />
      <WizardProgress steps={STEPS} current={2} />
      <ExpressWizardShell>
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">Choose a vehicle that fits your delivery</div>
            <div className="text-[10px] text-muted-foreground">Prices may vary with demand</div>
          </div>
          <div className="mt-3 space-y-2">
            {vehicles.map((v) => {
              const q = quotes[v.code];
              const isBest = v.code === cheapestCode;
              const selected = draft.vehicle_code === v.code;
              return (
                <button
                  key={v.code}
                  data-testid={`exp-veh-${v.code}`}
                  onClick={() => setDraft({ vehicle_code: v.code })}
                  className={`w-full baked-card border p-3 flex items-center gap-3 text-left motion-fast active:scale-[0.995] ${selected ? "border-[#FCC44C] bg-[#FCC44C14]" : "border-border hover:border-[#FCC44C44]"}`}
                >
                  <div className="w-20 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 55%, #FCC44C22, transparent 65%)` }}>
                    <img src={vehicleImage(v.code)} alt={v.name} className="max-h-14 max-w-full w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold">{v.name}</div>
                      {isBest && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Star size={9} className="inline mr-0.5" />BEST</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Up to {v.max_weight_kg} kg · {v.description}</div>
                    <div className="text-[10px] font-semibold mt-0.5" style={{ color: "#FCC44C" }}>ETA {v.eta_min_min}-{v.eta_min_max} min</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">{q ? money(q.total) : "…"}</div>
                    <div className="text-[10px] text-muted-foreground">est.</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 baked-card border p-3 flex items-start gap-3" style={{ borderColor: "#FCC44C44", backgroundColor: "#FCC44C0A" }}>
            <ShieldCheck size={16} style={{ color: "#FCC44C" }} className="shrink-0 mt-0.5" />
            <div><div className="text-xs font-bold">All deliveries are insured</div><div className="text-[10px] text-muted-foreground">Your goods are safe with SENDbakēd.</div></div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/package")} disabled={!draft.vehicle_code} />
    </div>
  );
};

// ---------------- Route Summary strip reused across steps 3-5 ----------------
const RouteSummary = () => {
  const navigate = useNavigate();
  const { draft } = useExpressBooking();
  return (
    <div className="mx-4 mt-2 baked-card border border-border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pickup</div>
          <div className="text-xs font-semibold truncate">{draft.pickup?.formatted_address || "—"}</div>
        </div>
      </div>
      <div className="border-t border-border" />
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Drop-off</div>
          <div className="text-xs font-semibold truncate">{draft.drop?.formatted_address || "—"}</div>
        </div>
        <button data-testid="exp-route-edit" onClick={() => navigate("/send/book/location")} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground">Edit</button>
      </div>
    </div>
  );
};

// ---------------- STEP 4: Package ----------------
export const ExpressStepPackage = () => {
  const navigate = useNavigate();
  const { country } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const [types, setTypes] = useState([]);
  const [tiers, setTiers] = useState([]);
  const p = draft.package;

  useEffect(() => {
    api.get(`/express/package-types?country=${country?.code || "CI"}`).then((r) => setTypes(r.data));
    api.get("/express/weight-tiers").then((r) => setTiers(r.data));
  }, [country?.code]);

  const setPkg = (k, v) => setDraft({ package: { ...p, [k]: v } });
  const setDim = (k, v) => setDraft({ package: { ...p, dimensions: { ...(p.dimensions || {}), [k]: v } } });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Package Details" step={4} />
      <WizardProgress steps={STEPS} current={3} />
      <ExpressWizardShell>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">This helps us provide the right vehicle and price.</div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">Package Type</div>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const active = p.type === t.code;
                return (
                  <button key={t.code} data-testid={`exp-pkg-type-${t.code}`} onClick={() => setPkg("type", t.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                    {active && <CheckCircle2 size={11} className="inline mr-1" />}{t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">Package Weight</div>
            <div className="flex flex-wrap gap-2">
              {tiers.map((t) => {
                const active = p.weight_range === t.code;
                return (
                  <button key={t.code} data-testid={`exp-pkg-weight-${t.code}`} onClick={() => setPkg("weight_range", t.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">Package Dimensions <span className="text-muted-foreground">(optional)</span></div>
            <div className="grid grid-cols-3 gap-2">
              {["length", "width", "height"].map((k) => (
                <input key={k} data-testid={`exp-pkg-dim-${k}`} inputMode="numeric" value={p.dimensions?.[k] ?? ""} onChange={(e) => setDim(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={`${k[0].toUpperCase()+k.slice(1)} cm`} className="baked-input h-11 px-3 border border-border bg-secondary/40 text-sm" />
              ))}
            </div>
          </div>

          <Field label="Additional Information (Optional)">
            <textarea data-testid="exp-pkg-notes" value={p.notes} maxLength={150} onChange={(e) => setPkg("notes", e.target.value)} rows={3} placeholder="Any special handling instructions?" className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" />
            <div className="text-[10px] text-muted-foreground text-right">{(p.notes || "").length}/150</div>
          </Field>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/estimate")} disabled={!p.type || !p.weight_range} />
    </div>
  );
};

// ---------------- STEP 5: Price Estimate + Book ----------------
export const ExpressStepEstimate = () => {
  const navigate = useNavigate();
  const { country, openAddressSelector } = useApp();
  const { customer, openLogin } = useAuth();
  const { draft, resetDraft } = useExpressBooking();
  const [quote, setQuote] = useState(null);
  const [promo, setPromo] = useState(draft.promo_code || "");
  const [busy, setBusy] = useState(false);
  const money = useMoney();

  const fetchQuote = async (withPromo) => {
    if (!draft.pickup || !draft.drop || !draft.vehicle_code) return;
    const { data } = await api.post("/express/quote/parcel", {
      country: country?.code || "CI",
      vehicle_code: draft.vehicle_code,
      pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
      drop_lat: draft.drop.latitude, drop_lng: draft.drop.longitude,
      promo_code: withPromo || undefined,
    });
    setQuote(data);
  };
  useEffect(() => { fetchQuote(); /* initial */ /* eslint-disable-line */ }, [draft.pickup, draft.drop, draft.vehicle_code]);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    await fetchQuote(promo.trim());
    if (!quote?.promo) toast.info("Promo applied — total refreshed");
  };

  const book = async () => {
    if (!customer) { openLogin("/send/book/estimate"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/express/bookings/parcel", {
        country: country?.code || "CI",
        vehicle_code: draft.vehicle_code,
        pickup: draft.pickup,
        drop: draft.drop,
        receiver: draft.receiver,
        package_type: draft.package.type,
        package_weight_range: draft.package.weight_range,
        package_dimensions: draft.package.dimensions,
        package_notes: draft.package.notes,
        promo_code: quote?.promo?.code,
        payment_method: "cod",
      });
      resetDraft();
      navigate(`/send/booking/${data.id}?success=1`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed");
    } finally { setBusy(false); }
  };

  if (!draft.pickup || !draft.drop || !draft.vehicle_code) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExpressHeader title="Price Estimation" step={5} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-sm font-semibold">Booking details incomplete</div>
          <button onClick={() => navigate("/send/book/location")} className="mt-4 baked-btn h-11 px-6 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>Restart booking</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Price Estimation" step={5} />
      <WizardProgress steps={STEPS} current={4} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <div className="baked-card border border-border p-3 flex items-center gap-3">
            <div className="w-16 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 55%, #FCC44C22, transparent 65%)` }}>
              <img src={vehicleImage(draft.vehicle_code)} alt={draft.vehicle_code} className="max-h-12 max-w-full w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="flex-1"><div className="text-sm font-bold capitalize">{draft.vehicle_code.replace("_", " ")}</div><div className="text-[11px] text-muted-foreground">Selected vehicle</div></div>
            <button data-testid="exp-est-change-veh" onClick={() => navigate("/send/book/vehicle")} className="text-xs font-semibold" style={{ color: "#FCC44C" }}>Change</button>
          </div>

          <div className="baked-card border border-border p-4">
            <div className="text-sm font-bold mb-2">Price Breakdown</div>
            {!quote ? (
              <div className="text-xs text-muted-foreground">Calculating…</div>
            ) : (
              <div className="space-y-1.5 text-xs">
                <Row label="Base Fare" value={money(quote.base_fare)} />
                <Row label={`Distance (${quote.distance_km} km)`} value={money(quote.distance_fare)} />
                <Row label={`Time (${quote.duration_min} min)`} value={money(quote.time_fare)} />
                {quote.surcharge > 0 && <Row label="Surcharge (peak/night)" value={money(quote.surcharge)} />}
                <Row label="Service Fee" value={money(quote.service_fee)} tone />
                <Row label="Insurance" value={money(quote.insurance)} tone />
                {quote.taxes > 0 && <Row label="Taxes" value={money(quote.taxes)} tone />}
                {quote.promo_discount > 0 && <Row label={`Promo (${quote.promo?.code})`} value={`− ${money(quote.promo_discount)}`} tone="#FCC44C" />}
                <div className="border-t border-border my-2" />
                <Row label={<strong>Estimated Total</strong>} value={<strong data-testid="exp-est-total">{money(quote.total)}</strong>} />
                <div className="text-[10px] text-muted-foreground">All prices are inclusive of taxes.</div>
              </div>
            )}
          </div>

          <div className="baked-card border border-border p-3 flex items-center gap-3">
            <ShieldCheck size={16} style={{ color: "#FCC44C" }} />
            <div className="flex-1"><div className="text-xs font-bold">Insurance included</div><div className="text-[10px] text-muted-foreground">Your goods are covered up to {money(50000)}</div></div>
            <div className="text-right"><Clock size={13} style={{ color: "#FCC44C" }} className="ml-auto" /><div className="text-[10px] text-muted-foreground mt-0.5">{quote?.duration_min ?? "—"} min ETA</div></div>
          </div>

          <div className="baked-card border border-border p-3">
            <div className="text-[11px] font-semibold mb-1.5">Have a promo code?</div>
            <div className="flex gap-2">
              <input data-testid="exp-est-promo-input" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Enter promo code" className="flex-1 baked-input h-10 px-3 border border-border bg-secondary/40 text-sm uppercase" />
              <button data-testid="exp-est-promo-apply" onClick={applyPromo} className="baked-btn h-10 px-4 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>Apply</button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Final price may vary slightly based on real-time conditions.</div>
          </div>

          <div className="baked-card border border-border p-3">
            <div className="text-[11px] font-semibold mb-1.5">Payment</div>
            <div className="grid grid-cols-2 gap-2">
              <div data-testid="exp-est-pay-cod" className="baked-card border p-3 flex items-center gap-3" style={{ borderColor: "#FCC44C", backgroundColor: "#FCC44C0F" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Package size={15} /></div>
                <div><div className="text-xs font-bold">Cash on Delivery</div><div className="text-[10px] text-muted-foreground">Pay to the driver</div></div>
              </div>
              <div data-testid="exp-est-pay-wallet" className="baked-card border p-3 flex items-center gap-3 border-border opacity-60">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary text-muted-foreground"><Info size={15} /></div>
                <div><div className="text-xs font-bold">BAKĒD Wallet</div><div className="text-[10px] text-muted-foreground">Coming soon</div></div>
              </div>
            </div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={book} disabled={!quote || busy} label={customer ? `Book Now · ${quote ? money(quote.total) : ""}` : "Sign in to book"} loading={busy} testid="exp-est-book" />
    </div>
  );
};

const Row = ({ label, value, tone }) => (
  <div className="flex items-center justify-between">
    <div className={tone ? "text-muted-foreground" : ""}>{label}</div>
    <div className={typeof tone === "string" ? "font-semibold" : ""} style={typeof tone === "string" ? { color: tone } : undefined}>{value}</div>
  </div>
);

// ---------------- Booking Success / Live-tracking placeholder ----------------
export const ExpressBookingConfirmation = () => {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const money = useMoney();
  const success = new URLSearchParams(window.location.search).get("success") === "1";
  const bookingId = window.location.pathname.split("/").pop();

  useEffect(() => {
    api.get(`/express/bookings/${bookingId}`).then((r) => setBooking(r.data)).catch(() => setBooking(null));
  }, [bookingId]);

  // Auto-redirect parcel bookings to live tracking (~1.2s after success paint).
  useEffect(() => {
    if (!booking || booking.booking_type !== "parcel" || !success) return;
    const t = setTimeout(() => navigate(`/send/booking/${booking.id}/track`, { replace: true }), 1200);
    return () => clearTimeout(t);
  }, [booking, success, navigate]);

  if (!booking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="Booking Confirmed" onBack={() => navigate("/send")} />
      <div className="flex-1 px-4 py-6 space-y-4">
        {success && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={30} />
            </div>
            <div className="text-lg font-bold mt-3">Booking Successful!</div>
            <p className="text-xs text-muted-foreground mt-1">Ref <strong>{booking.ref}</strong> &mdash; we&apos;re finding you a driver.</p>
          </div>
        )}

        <div className="baked-card border border-border p-4 space-y-2">
          <div className="text-sm font-bold">Your {booking.booking_type === "movers" ? "move" : "delivery"}</div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pickup</div><div className="text-xs font-semibold">{booking.pickup?.formatted_address}</div></div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Drop-off</div><div className="text-xs font-semibold">{booking.drop?.formatted_address}</div></div>
          </div>
          <div className="border-t border-border my-2" />
          {booking.booking_type === "movers" ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold capitalize">{booking.move_type?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">Move type</div></div>
              <div><div className="font-bold">{(booking.items || []).reduce((s, i) => s + (i.qty || 0), 0)} items</div><div className="text-[10px] text-muted-foreground">Load</div></div>
              <div><div className="font-bold">{booking.scheduled_date || "—"}</div><div className="text-[10px] text-muted-foreground">{booking.time_slot_code || "Slot"}</div></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold">{booking.distance_km} km</div><div className="text-[10px] text-muted-foreground">Distance</div></div>
              <div><div className="font-bold">{booking.duration_min} min</div><div className="text-[10px] text-muted-foreground">Est. ETA</div></div>
              <div><div className="font-bold capitalize">{booking.vehicle_code?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">Vehicle</div></div>
            </div>
          )}
        </div>

        <div className="baked-card border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">Total to pay</div>
            <div className="text-sm font-bold" data-testid="exp-booking-total">{money(booking.total)}</div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">Cash on Delivery · pay to the driver</div>
        </div>

        {booking.booking_type === "movers" ? (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">Move confirmed</div><div className="text-[11px] text-muted-foreground">Our team will call you 24 hours before the move to confirm details.</div></div>
          </div>
        ) : (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <Truck size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">Searching for the best driver…</div><div className="text-[11px] text-muted-foreground">Live tracking opens once assigned.</div></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button data-testid="exp-booking-track" onClick={() => navigate(`/send/booking/${booking.id}/track`)} className="baked-btn h-11 border border-border font-semibold text-sm">Track order</button>
          <button data-testid="exp-booking-home" onClick={() => navigate("/send")} className="baked-btn h-11 font-bold text-sm text-black" style={{ backgroundColor: "#FCC44C" }}>Book another</button>
        </div>
      </div>
    </div>
  );
};
