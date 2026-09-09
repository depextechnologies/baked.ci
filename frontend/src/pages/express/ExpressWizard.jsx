import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation2, Edit3, ChevronRight, Star, ShieldCheck, Clock, Info, PhoneCall, Home, DoorOpen, PenSquare, ArrowLeft, CheckCircle2, Package, Truck, Bike } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { ExpressHeader, WizardProgress, ExpressFooter, useMoney } from "../../components/express/ExpressLayout";
import { ExpressWizardShell } from "../../components/express/ExpressWizardShell";
import { vehicleImage } from "../../lib/expressAssets";

const useSteps = () => {
  const { t } = useTranslation("customer");
  return useMemo(() => ([
    { code: "location", label: t("send.wizard.step_location") },
    { code: "receiver", label: t("send.wizard.step_receiver") },
    { code: "vehicle",  label: t("send.wizard.step_vehicle") },
    { code: "package",  label: t("send.wizard.step_package") },
    { code: "review",   label: t("send.wizard.step_estimate") },
  ]), [t]);
};

// ---------------- STEP 1: Pickup & Drop ----------------
export const ExpressStepLocation = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { openAddressSelector } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const STEPS = useSteps();

  const pickPickup = () => openAddressSelector({
    title: t("send.wizard.pickup_location"),
    onPick: (addr) => setDraft({ pickup: addr }),
  });
  const pickDrop = () => openAddressSelector({
    title: t("send.wizard.dropoff_location"),
    onPick: (addr) => setDraft({ drop: addr }),
  });

  const ok = draft.pickup && draft.drop;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_pickup_drop")} step={1} />
      <WizardProgress steps={STEPS} current={0} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <AddressField testid="exp-pickup" label={t("send.wizard.pickup_location")} address={draft.pickup} onEdit={pickPickup} tone="#FCC44C" hint={t("send.wizard.tap_to_choose")} />
          <AddressField testid="exp-drop" label={t("send.wizard.dropoff_location")} address={draft.drop} onEdit={pickDrop} tone="#FCC44C" hint={t("send.wizard.tap_to_choose")} />
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
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { draft, setDraft } = useExpressBooking();
  const [prefs, setPrefs] = useState([]);
  const r = draft.receiver;
  const STEPS = useSteps();

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
      <ExpressHeader title={t("send.wizard.header_receiver")} step={2} />
      <WizardProgress steps={STEPS} current={1} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{t("send.wizard.who_delivering_to")}</div>
          <Field label={t("send.wizard.receiver_name")}><input data-testid="exp-r-name" value={r.name} onChange={(e) => patch("name", e.target.value)} placeholder={t("send.wizard.receiver_name_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.phone_number")}><input data-testid="exp-r-phone" value={r.phone} onChange={(e) => patch("phone", e.target.value)} placeholder={t("send.wizard.phone_ph")} inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.alt_number")}><input data-testid="exp-r-alt-phone" value={r.alt_phone} onChange={(e) => patch("alt_phone", e.target.value)} placeholder={t("send.wizard.alt_ph")} inputMode="tel" className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.building_apt")}><input data-testid="exp-r-building" value={r.building} onChange={(e) => patch("building", e.target.value)} placeholder={t("send.wizard.building_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.landmark")}><input data-testid="exp-r-landmark" value={r.landmark} onChange={(e) => patch("landmark", e.target.value)} placeholder={t("send.wizard.landmark_ph")} className="baked-input h-11 w-full px-3 border border-border bg-secondary/40 text-sm" /></Field>
          <Field label={t("send.wizard.delivery_notes")}><textarea data-testid="exp-r-notes" value={r.notes} onChange={(e) => patch("notes", e.target.value)} rows={3} placeholder={t("send.wizard.delivery_notes_ph")} className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" /></Field>

          <div>
            <div className="text-xs font-semibold mt-3 mb-2">{t("send.wizard.delivery_preferences")}</div>
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
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const [quotes, setQuotes] = useState({}); // { vehicle_code: total }
  const money = useMoney();
  const STEPS = useSteps();

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
      <ExpressHeader title={t("send.wizard.header_vehicle")} step={3} />
      <WizardProgress steps={STEPS} current={2} />
      <ExpressWizardShell>
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">{t("send.wizard.choose_vehicle")}</div>
            <div className="text-[10px] text-muted-foreground">{t("send.wizard.prices_vary_demand")}</div>
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
                      {isBest && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Star size={9} className="inline mr-0.5" />{t("send.wizard.best_badge")}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t("send.wizard.up_to_kg", { kg: v.max_weight_kg })} · {v.description}</div>
                    <div className="text-[10px] font-semibold mt-0.5" style={{ color: "#FCC44C" }}>{t("send.wizard.eta_range", { min: v.eta_min_min, max: v.eta_min_max })}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">{q ? money(q.total) : "…"}</div>
                    <div className="text-[10px] text-muted-foreground">{t("send.wizard.est_short")}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 baked-card border p-3 flex items-start gap-3" style={{ borderColor: "#FCC44C44", backgroundColor: "#FCC44C0A" }}>
            <ShieldCheck size={16} style={{ color: "#FCC44C" }} className="shrink-0 mt-0.5" />
            <div><div className="text-xs font-bold">{t("send.wizard.all_deliveries_insured")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.safe_with_send")}</div></div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={() => navigate("/send/book/package")} disabled={!draft.vehicle_code} />
    </div>
  );
};

// ---------------- Route Summary strip reused across steps 3-5 ----------------
const RouteSummary = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { draft } = useExpressBooking();
  return (
    <div className="mx-4 mt-2 baked-card border border-border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.pickup")}</div>
          <div className="text-xs font-semibold truncate">{draft.pickup?.formatted_address || "—"}</div>
        </div>
      </div>
      <div className="border-t border-border" />
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><MapPin size={11} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.dropoff")}</div>
          <div className="text-xs font-semibold truncate">{draft.drop?.formatted_address || "—"}</div>
        </div>
        <button data-testid="exp-route-edit" onClick={() => navigate("/send/book/location")} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground">{t("send.wizard.route_edit")}</button>
      </div>
    </div>
  );
};

// ---------------- STEP 4: Package ----------------
export const ExpressStepPackage = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const [types, setTypes] = useState([]);
  const [tiers, setTiers] = useState([]);
  const p = draft.package;
  const STEPS = useSteps();

  useEffect(() => {
    api.get(`/express/package-types?country=${country?.code || "CI"}`).then((r) => setTypes(r.data));
    api.get("/express/weight-tiers").then((r) => setTiers(r.data));
  }, [country?.code]);

  const setPkg = (k, v) => setDraft({ package: { ...p, [k]: v } });
  const setDim = (k, v) => setDraft({ package: { ...p, dimensions: { ...(p.dimensions || {}), [k]: v } } });

  const dimPlaceholder = (k) => {
    if (k === "length") return t("send.wizard.dim_length");
    if (k === "width") return t("send.wizard.dim_width");
    return t("send.wizard.dim_height");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_package")} step={4} />
      <WizardProgress steps={STEPS} current={3} />
      <ExpressWizardShell>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">{t("send.wizard.package_helps")}</div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_type")}</div>
            <div className="flex flex-wrap gap-2">
              {types.map((tp) => {
                const active = p.type === tp.code;
                return (
                  <button key={tp.code} data-testid={`exp-pkg-type-${tp.code}`} onClick={() => setPkg("type", tp.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                    {active && <CheckCircle2 size={11} className="inline mr-1" />}{tp.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_weight")}</div>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tr) => {
                const active = p.weight_range === tr.code;
                return (
                  <button key={tr.code} data-testid={`exp-pkg-weight-${tr.code}`} onClick={() => setPkg("weight_range", tr.code)} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>
                    {tr.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.package_dimensions")} <span className="text-muted-foreground">{t("send.wizard.optional")}</span></div>
            <div className="grid grid-cols-3 gap-2">
              {["length", "width", "height"].map((k) => (
                <input key={k} data-testid={`exp-pkg-dim-${k}`} inputMode="numeric" value={p.dimensions?.[k] ?? ""} onChange={(e) => setDim(k, e.target.value.replace(/[^\d.]/g, ""))} placeholder={dimPlaceholder(k)} className="baked-input h-11 px-3 border border-border bg-secondary/40 text-sm" />
              ))}
            </div>
          </div>

          <Field label={t("send.wizard.additional_info")}>
            <textarea data-testid="exp-pkg-notes" value={p.notes} maxLength={150} onChange={(e) => setPkg("notes", e.target.value)} rows={3} placeholder={t("send.wizard.additional_info_ph")} className="baked-input w-full px-3 py-2 border border-border bg-secondary/40 text-sm" />
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
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country, openAddressSelector } = useApp();
  const { customer, openLogin } = useAuth();
  const { draft, resetDraft } = useExpressBooking();
  const [quote, setQuote] = useState(null);
  const [promo, setPromo] = useState(draft.promo_code || "");
  const [busy, setBusy] = useState(false);
  const money = useMoney();
  const STEPS = useSteps();

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
    if (!quote?.promo) toast.info(t("send.wizard.promo_applied"));
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
      toast.error(e?.response?.data?.detail || t("send.wizard.booking_failed"));
    } finally { setBusy(false); }
  };

  if (!draft.pickup || !draft.drop || !draft.vehicle_code) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <ExpressHeader title={t("send.wizard.header_estimate")} step={5} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-sm font-semibold">{t("send.wizard.booking_incomplete")}</div>
          <button onClick={() => navigate("/send/book/location")} className="mt-4 baked-btn h-11 px-6 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.restart_booking")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_estimate")} step={5} />
      <WizardProgress steps={STEPS} current={4} />
      <ExpressWizardShell>
        <div className="space-y-3">
          <div className="baked-card border border-border p-3 flex items-center gap-3">
            <div className="w-16 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: `radial-gradient(circle at 50% 55%, #FCC44C22, transparent 65%)` }}>
              <img src={vehicleImage(draft.vehicle_code)} alt={draft.vehicle_code} className="max-h-12 max-w-full w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="flex-1"><div className="text-sm font-bold capitalize">{draft.vehicle_code.replace("_", " ")}</div><div className="text-[11px] text-muted-foreground">{t("send.wizard.selected_vehicle")}</div></div>
            <button data-testid="exp-est-change-veh" onClick={() => navigate("/send/book/vehicle")} className="text-xs font-semibold" style={{ color: "#FCC44C" }}>{t("send.wizard.change")}</button>
          </div>

          <div className="baked-card border border-border p-4">
            <div className="text-sm font-bold mb-2">{t("send.wizard.price_breakdown")}</div>
            {!quote ? (
              <div className="text-xs text-muted-foreground">{t("send.wizard.calculating")}</div>
            ) : (
              <div className="space-y-1.5 text-xs">
                <Row label={t("send.wizard.base_fare")} value={money(quote.base_fare)} />
                <Row label={t("send.wizard.distance", { km: quote.distance_km })} value={money(quote.distance_fare)} />
                <Row label={t("send.wizard.time", { min: quote.duration_min })} value={money(quote.time_fare)} />
                {quote.surcharge > 0 && <Row label={t("send.wizard.surcharge")} value={money(quote.surcharge)} />}
                <Row label={t("send.wizard.service_fee")} value={money(quote.service_fee)} tone />
                <Row label={t("send.wizard.insurance")} value={money(quote.insurance)} tone />
                {quote.taxes > 0 && <Row label={t("send.wizard.taxes")} value={money(quote.taxes)} tone />}
                {quote.promo_discount > 0 && <Row label={t("send.wizard.promo_line", { code: quote.promo?.code })} value={`− ${money(quote.promo_discount)}`} tone="#FCC44C" />}
                <div className="border-t border-border my-2" />
                <Row label={<strong>{t("send.wizard.estimated_total")}</strong>} value={<strong data-testid="exp-est-total">{money(quote.total)}</strong>} />
                <div className="text-[10px] text-muted-foreground">{t("send.wizard.all_prices_inclusive")}</div>
              </div>
            )}
          </div>

          <div className="baked-card border border-border p-3 flex items-center gap-3">
            <ShieldCheck size={16} style={{ color: "#FCC44C" }} />
            <div className="flex-1"><div className="text-xs font-bold">{t("send.wizard.insurance_included")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.goods_covered_up_to", { amount: money(50000) })}</div></div>
            <div className="text-right"><Clock size={13} style={{ color: "#FCC44C" }} className="ml-auto" /><div className="text-[10px] text-muted-foreground mt-0.5">{quote?.duration_min ?? "—"} {t("send.wizard.eta_min_short")}</div></div>
          </div>

          <div className="baked-card border border-border p-3">
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.have_promo")}</div>
            <div className="flex gap-2">
              <input data-testid="exp-est-promo-input" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder={t("send.wizard.promo_ph")} className="flex-1 baked-input h-10 px-3 border border-border bg-secondary/40 text-sm uppercase" />
              <button data-testid="exp-est-promo-apply" onClick={applyPromo} className="baked-btn h-10 px-4 font-bold text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.apply")}</button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{t("send.wizard.final_price_note")}</div>
          </div>

          <div className="baked-card border border-border p-3">
            <div className="text-[11px] font-semibold mb-1.5">{t("send.wizard.payment")}</div>
            <div className="grid grid-cols-2 gap-2">
              <div data-testid="exp-est-pay-cod" className="baked-card border p-3 flex items-center gap-3" style={{ borderColor: "#FCC44C", backgroundColor: "#FCC44C0F" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Package size={15} /></div>
                <div><div className="text-xs font-bold">{t("send.wizard.cash_on_delivery")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.pay_to_driver")}</div></div>
              </div>
              <div data-testid="exp-est-pay-wallet" className="baked-card border p-3 flex items-center gap-3 border-border opacity-60">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-secondary text-muted-foreground"><Info size={15} /></div>
                <div><div className="text-xs font-bold">{t("send.wizard.baked_wallet")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.coming_soon")}</div></div>
              </div>
            </div>
          </div>
        </div>
      </ExpressWizardShell>
      <ExpressFooter onContinue={book} disabled={!quote || busy} label={customer ? t("send.wizard.book_now_with_price", { price: quote ? money(quote.total) : "" }) : t("send.wizard.sign_in_to_book")} loading={busy} testid="exp-est-book" />
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
  const { t } = useTranslation("customer");
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
    const timer = setTimeout(() => navigate(`/send/booking/${booking.id}/track`, { replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [booking, success, navigate]);

  if (!booking) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("send.wizard.loading")}</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_confirmed")} onBack={() => navigate("/send")} />
      <div className="flex-1 px-4 py-6 space-y-4">
        {success && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={30} />
            </div>
            <div className="text-lg font-bold mt-3">{t("send.wizard.booking_successful")}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("send.wizard.booking_ref_note", { ref: booking.ref })}</p>
          </div>
        )}

        <div className="baked-card border border-border p-4 space-y-2">
          <div className="text-sm font-bold">{booking.booking_type === "movers" ? t("send.wizard.your_move") : t("send.wizard.your_delivery")}</div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.pickup")}</div><div className="text-xs font-semibold">{booking.pickup?.formatted_address}</div></div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} style={{ color: "#FCC44C" }} className="mt-1" />
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("send.wizard.dropoff")}</div><div className="text-xs font-semibold">{booking.drop?.formatted_address}</div></div>
          </div>
          <div className="border-t border-border my-2" />
          {booking.booking_type === "movers" ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold capitalize">{booking.move_type?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.move_type")}</div></div>
              <div><div className="font-bold">{t("send.wizard.items_count", { count: (booking.items || []).reduce((s, i) => s + (i.qty || 0), 0) })}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.load_label")}</div></div>
              <div><div className="font-bold">{booking.scheduled_date || "—"}</div><div className="text-[10px] text-muted-foreground">{booking.time_slot_code || t("send.wizard.slot_label")}</div></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="font-bold">{booking.distance_km} km</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.distance_label")}</div></div>
              <div><div className="font-bold">{booking.duration_min} min</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.est_eta_label")}</div></div>
              <div><div className="font-bold capitalize">{booking.vehicle_code?.replace("_", " ")}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.vehicle_label")}</div></div>
            </div>
          )}
        </div>

        <div className="baked-card border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">{t("send.wizard.total_to_pay")}</div>
            <div className="text-sm font-bold" data-testid="exp-booking-total">{money(booking.total)}</div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{t("send.wizard.cod_short")}</div>
        </div>

        {booking.booking_type === "movers" ? (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <CheckCircle2 size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">{t("send.wizard.move_confirmed")}</div><div className="text-[11px] text-muted-foreground">{t("send.wizard.move_call_note")}</div></div>
          </div>
        ) : (
          <div className="baked-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
              <Truck size={16} />
            </div>
            <div className="flex-1"><div className="text-sm font-bold">{t("send.wizard.searching_driver")}</div><div className="text-[11px] text-muted-foreground">{t("send.wizard.tracking_opens")}</div></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button data-testid="exp-booking-track" onClick={() => navigate(`/send/booking/${booking.id}/track`)} className="baked-btn h-11 border border-border font-semibold text-sm">{t("send.wizard.track_order")}</button>
          <button data-testid="exp-booking-home" onClick={() => navigate("/send")} className="baked-btn h-11 font-bold text-sm text-black" style={{ backgroundColor: "#FCC44C" }}>{t("send.wizard.book_another")}</button>
        </div>
      </div>
    </div>
  );
};
