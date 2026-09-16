/**
 * SENDbakēd — Multiple Shipments dedicated 2-step booking wizard.
 *
 * Product principle: BUILD YOUR TRIP → CHOOSE YOUR VEHICLE → BOOK.
 * No receiver/package/estimate detour. No unified 4-step wizard.
 *
 * Route: `/send/multi-shipments`
 *   • Step 1 of 2 — Shipment builder (pickup + drop per shipment with
 *     collapsible OPTIONAL landmark / contact / product-type per address).
 *   • Step 2 of 2 — Vehicle & Reservation (4 vehicle cards + ⓘ price
 *     breakdown modal).
 *
 * Reuses the existing SEND components:
 *   - `openAddressSelector` global picker (BakedContexts)
 *   - `ExpressWizardShell` + `WizardMap` (persistent map with ordered
 *     multi-stop polyline + P1/D1/P2/D2 markers — already implemented)
 *   - `api` axios instance + auth guard + vehicle catalogue (`/vehicles`)
 *   - `stops[]` architecture consumed by the driver multi-stop UX
 *   - i18n system (customer namespace)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MapPin, Plus, Trash2, ChevronDown, ChevronUp, Info,
  Check, Loader2,
} from "lucide-react";

import { api } from "@/lib/api";
import { useApp, useAuth } from "@/contexts/BakedContexts";
import { useExpressBooking } from "@/contexts/ExpressContext";
import {
  ExpressHeader, ExpressFooter, WizardProgress, useMoney,
} from "@/components/express/ExpressLayout";
import { WizardMap } from "@/components/express/ExpressWizardShell";

const YELLOW = "#FCC44C";
const GREEN  = "#22c55e";
const MAX_STOPS = 8;

/* -------------------------------------------------------------------------- */
/*  Utility hooks                                                              */
/* -------------------------------------------------------------------------- */

/** Load the admin-editable product-type catalogue once and cache it. */
const useProductTypes = () => {
  const [types, setTypes] = useState(null);
  useEffect(() => {
    let ok = true;
    api.get("/express/product-types")
      .then(({ data }) => { if (ok) setTypes(Array.isArray(data) ? data : []); })
      .catch(() => { if (ok) setTypes([]); });
    return () => { ok = false; };
  }, []);
  const defaultCode = useMemo(
    () => types?.find((t) => t.is_default)?.code || "general_product",
    [types],
  );
  return { types: types || [], defaultCode, ready: types !== null };
};

/* -------------------------------------------------------------------------- */
/*  Leg optional-metadata panel                                                */
/* -------------------------------------------------------------------------- */

/**
 * Collapsible "Additional information (optional)" panel shown below every
 * pickup / drop address. All three fields — landmark, contact, product
 * type — are optional and NEVER block the customer from continuing.
 */
const OptionalMetaPanel = ({ leg, testidPrefix, productTypes, defaultProductType, onChange, lang }) => {
  const { t } = useTranslation("customer");
  const [open, setOpen] = useState(
    Boolean(leg?.landmark || leg?.contact_name || leg?.contact_phone
            || (leg?.product_type && leg.product_type !== defaultProductType)),
  );
  const productLabel = useCallback((code) => {
    const row = productTypes.find((p) => p.code === code);
    if (!row) return code;
    return lang === "en" ? row.name_en : row.name_fr;
  }, [productTypes, lang]);

  const currentPt = leg?.product_type || defaultProductType;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testidPrefix}-optional-toggle`}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground motion-fast"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {t("send.multi.optional_info")}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {t("send.multi.landmark_label")}
            </label>
            <input
              type="text"
              value={leg?.landmark || ""}
              onChange={(e) => onChange({ ...leg, landmark: e.target.value })}
              data-testid={`${testidPrefix}-landmark`}
              placeholder={t("send.multi.landmark_placeholder")}
              className="w-full h-10 px-3 rounded-lg border border-border bg-secondary text-foreground text-sm placeholder:text-muted-foreground/70"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {t("send.multi.contact_name_label")}
              </label>
              <input
                type="text"
                value={leg?.contact_name || ""}
                onChange={(e) => onChange({ ...leg, contact_name: e.target.value })}
                data-testid={`${testidPrefix}-contact-name`}
                placeholder="Jean Dupont"
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary text-foreground text-sm placeholder:text-muted-foreground/70"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {t("send.multi.contact_phone_label")}
              </label>
              <input
                type="tel"
                value={leg?.contact_phone || ""}
                onChange={(e) => onChange({ ...leg, contact_phone: e.target.value })}
                data-testid={`${testidPrefix}-contact-phone`}
                placeholder="+225 XX XX XX XX"
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary text-foreground text-sm placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {t("send.multi.product_type_label")}
            </label>
            <select
              value={currentPt}
              onChange={(e) => onChange({ ...leg, product_type: e.target.value })}
              data-testid={`${testidPrefix}-product-type`}
              className="w-full h-10 px-3 rounded-lg border border-border bg-secondary text-foreground text-sm"
            >
              {productTypes.map((p) => (
                <option key={p.code} value={p.code}>{productLabel(p.code)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Shipment card                                                              */
/* -------------------------------------------------------------------------- */

const AddressRow = ({ label, address, onEdit, tone, testidPrefix }) => {
  const { t } = useTranslation("customer");
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full grid place-items-center shrink-0"
             style={{ background: `${tone}22`, color: tone }}>
          <MapPin size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tone }}>{label}</div>
          {address ? (
            <>
              <div className="text-sm font-semibold text-foreground truncate">
                {address.line1 || address.formatted_address}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {address.formatted_address || address.city}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground italic">{t("send.multi.tap_to_pick")}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          data-testid={`${testidPrefix}-edit`}
          className="h-8 px-3 rounded-lg border border-border bg-secondary text-foreground text-[11px] font-semibold hover:bg-accent"
        >
          {address ? t("send.multi.edit") : t("send.multi.select")}
        </button>
      </div>
    </div>
  );
};

const ShipmentCard = ({ index, shipment, onPickup, onDrop, onRemove, onMeta, productTypes, defaultProductType, lang }) => {
  const { t } = useTranslation("customer");
  const seq = index + 1;
  return (
    <div
      data-testid={`multi-shipment-card-${seq}`}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold"
                style={{ background: `${YELLOW}22`, color: YELLOW }}>{seq}</span>
          <div className="text-sm font-bold">
            {t("send.multi.shipment_label", { n: seq })}
          </div>
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={onRemove}
            data-testid={`multi-shipment-remove-${seq}`}
            className="w-8 h-8 rounded-lg border border-border grid place-items-center text-muted-foreground hover:text-red-500 hover:border-red-500/40"
            aria-label={t("send.multi.remove")}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <AddressRow
          label={t("send.multi.pickup")}
          address={shipment.pickup}
          onEdit={onPickup}
          tone="#FF8A1E"
          testidPrefix={`multi-shipment-${seq}-pickup`}
        />
        <OptionalMetaPanel
          leg={shipment.pickup_meta || {}}
          testidPrefix={`multi-shipment-${seq}-pickup`}
          productTypes={productTypes}
          defaultProductType={defaultProductType}
          onChange={(meta) => onMeta("pickup_meta", meta)}
          lang={lang}
        />

        <AddressRow
          label={t("send.multi.dropoff")}
          address={shipment.drop}
          onEdit={onDrop}
          tone={GREEN}
          testidPrefix={`multi-shipment-${seq}-drop`}
        />
        <OptionalMetaPanel
          leg={shipment.drop_meta || {}}
          testidPrefix={`multi-shipment-${seq}-drop`}
          productTypes={productTypes}
          defaultProductType={defaultProductType}
          onChange={(meta) => onMeta("drop_meta", meta)}
          lang={lang}
        />
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  STEP 1 — Multiple Shipments builder                                        */
/* -------------------------------------------------------------------------- */

export const MultiShipmentsStep1 = () => {
  const { t, i18n } = useTranslation("customer");
  const navigate = useNavigate();
  const { openAddressSelector } = useApp();
  const { draft, setDraft } = useExpressBooking();
  const { types: productTypes, defaultCode: defaultProductType, ready: ptReady } = useProductTypes();
  const lang = (i18n.language || "fr").startsWith("en") ? "en" : "fr";

  // Ensure the draft is scoped to Multi-Shipments.
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      service_type: "multiple_shipments",
      stops: d.stops?.length ? d.stops : [{ id: `stop_${Date.now()}`, pickup: null, drop: null }],
    }));
  }, []); // eslint-disable-line

  const stops = draft.stops || [];

  const updateStop = (idx, patch) => {
    setDraft({
      stops: stops.map((s, i) => i === idx ? { ...s, ...patch } : s),
    });
  };
  const pickAddress = (idx, kind) => {
    openAddressSelector({
      title: kind === "pickup" ? t("send.multi.pickup") : t("send.multi.dropoff"),
      onPick: (addr) => {
        updateStop(idx, { [kind]: addr });
        // Mirror shipment #1 pickup/drop into draft.pickup/drop so backend
        // head-match validation succeeds (first stop must match top-level).
        if (idx === 0) {
          setDraft(kind === "pickup" ? { pickup: addr } : { drop: addr });
        }
      },
    });
  };
  const addShipment = () => {
    if (stops.length >= MAX_STOPS) return;
    setDraft({ stops: [...stops, { id: `stop_${Date.now()}`, pickup: null, drop: null }] });
  };
  const removeShipment = (idx) => {
    if (idx === 0) return;
    setDraft({ stops: stops.filter((_, i) => i !== idx) });
  };

  // Continue guard: at least 1 shipment, and every shipment has BOTH ends.
  const canContinue = stops.length >= 1 && stops.every((s) => s.pickup && s.drop);

  const onContinue = () => {
    if (!canContinue) {
      toast.info(t("send.multi.complete_all_stops"));
      return;
    }
    navigate("/send/multi-shipments/vehicle");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="multi-shipments-step1">
      <ExpressHeader
        title={t("send.multi.step1_title")}
        step={1}
        totalSteps={2}
        onBack={() => navigate("/send")}
      />
      <div className="px-4 pt-2">
        <WizardProgress
          steps={[
            { code: "stops",   label: t("send.multi.step_stops") },
            { code: "vehicle", label: t("send.multi.step_vehicle") },
          ]}
          current={0}
        />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[45%_1fr] gap-4 px-4 md:px-6 pt-2 pb-6">
        {/* Mobile compact map above form */}
        <div className="md:hidden order-1">
          <WizardMap compact />
        </div>

        <div className="order-2 md:order-1 flex flex-col min-w-0 space-y-3">
          {!ptReady && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {t("send.multi.loading")}
            </div>
          )}

          {stops.map((s, idx) => (
            <ShipmentCard
              key={s.id || idx}
              index={idx}
              shipment={s}
              onPickup={() => pickAddress(idx, "pickup")}
              onDrop={() => pickAddress(idx, "drop")}
              onRemove={() => removeShipment(idx)}
              onMeta={(field, meta) => updateStop(idx, { [field]: meta })}
              productTypes={productTypes}
              defaultProductType={defaultProductType}
              lang={lang}
            />
          ))}

          <button
            type="button"
            onClick={addShipment}
            disabled={stops.length >= MAX_STOPS}
            data-testid="multi-shipment-add"
            className="w-full rounded-2xl border-2 border-dashed border-border bg-transparent p-4 flex items-center justify-center gap-2 text-sm font-semibold text-foreground hover:border-[#FCC44C] hover:text-[#FCC44C] motion-fast disabled:opacity-50"
          >
            <Plus size={16} />
            {t("send.multi.add_shipment")}
          </button>

          {stops.length >= MAX_STOPS && (
            <div className="text-[11px] text-muted-foreground text-center">
              {t("send.multi.max_stops_reached", { n: MAX_STOPS })}
            </div>
          )}
        </div>

        {/* Desktop persistent map */}
        <div className="hidden md:block order-2 sticky top-4 self-start h-[calc(100vh-160px)] min-h-[420px]">
          <WizardMap />
        </div>
      </div>

      <ExpressFooter
        onContinue={onContinue}
        disabled={!canContinue}
        label={t("send.multi.continue")}
        testid="multi-shipments-step1-continue"
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  STEP 2 — Vehicle & Reservation                                             */
/* -------------------------------------------------------------------------- */

const MULTI_VEHICLE_ORDER = [
  "bike", "three_wheeler", "mini_truck", "truck",
  "ref_tricycle", "ref_utility", "ref_truck",
];

const VehicleImage = ({ vehicle }) => {
  const src = vehicle?.image || `/vehicles/${vehicle?.code || "bike"}.png`;
  return (
    <div className="w-16 h-16 rounded-xl grid place-items-center shrink-0 overflow-hidden"
         style={{ background: `${YELLOW}12` }}>
      <img
        src={src}
        alt={vehicle?.name || vehicle?.code || "vehicle"}
        loading="lazy"
        className="max-w-full max-h-full object-contain"
        onError={(e) => {
          // Silent fallback — never break the card if the asset is missing.
          e.currentTarget.style.visibility = "hidden";
        }}
      />
    </div>
  );
};

const PriceBreakdownModal = ({ open, onClose, quote, currency }) => {
  const { t } = useTranslation("customer");
  const money = useMoney();
  if (!open || !quote) return null;
  const rows = [
    ["base_fare",            quote.base_fare],
    ["distance_charge",      quote.distance_charge],
    ["time_charge",          quote.time_charge],
    ["waiting_fee",          quote.waiting_fee],
    ["extra_stop_surcharge", quote.extra_stop_surcharge],
    ["peak_surcharge",       quote.peak_surcharge],
    ["night_surcharge",      quote.night_surcharge],
    ["service_fee",          quote.service_fee],
    ["insurance",            quote.insurance],
    ["taxes",                quote.taxes],
    ["promo_discount",       quote.promo_discount ? -Math.abs(quote.promo_discount) : 0],
  ].filter(([, v]) => v != null && v !== 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-end sm:place-items-center"
         data-testid="multi-price-breakdown-modal" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("send.multi.breakdown_title")}
        </div>
        <div className="mt-4 space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t(`send.multi.breakdown_${k}`, { defaultValue: k })}</span>
              <span className="font-semibold">{money(v, { currency })}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-sm font-bold">{t("send.multi.breakdown_total")}</span>
          <span className="text-base font-bold" style={{ color: YELLOW }}>{money(quote.total, { currency })}</span>
        </div>
        <button
          onClick={onClose}
          data-testid="multi-price-breakdown-close"
          className="mt-5 w-full h-11 rounded-xl bg-secondary text-foreground border border-border font-semibold"
        >
          {t("send.multi.close")}
        </button>
      </div>
    </div>
  );
};

export const MultiShipmentsStep2 = () => {
  const { t, i18n } = useTranslation("customer");
  const navigate = useNavigate();
  const money = useMoney();
  const { country } = useApp();
  const { customer, openLogin } = useAuth();
  const { draft, setDraft, resetDraft } = useExpressBooking();
  const lang = (i18n.language || "fr").startsWith("en") ? "en" : "fr";

  const [vehicles, setVehicles] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [breakdownFor, setBreakdownFor] = useState(null);

  // Guard: force Step 1 completion.
  useEffect(() => {
    if (!draft.stops?.length || draft.stops.some((s) => !s.pickup || !s.drop)) {
      navigate("/send/multi-shipments", { replace: true });
    }
  }, [draft.stops, navigate]);

  useEffect(() => {
    api.get("/express/vehicles", {
      params: { country: country?.code || "CI", service_type: "multiple_shipments" },
    }).then(({ data }) => {
      // Preserve the canonical Moto → Tricycle → Mini Camion → Camion order.
      const byCode = Object.fromEntries((Array.isArray(data) ? data : []).map((v) => [v.code, v]));
      const ordered = MULTI_VEHICLE_ORDER.map((c) => byCode[c]).filter(Boolean);
      // Append any extras the catalogue exposes (future-proof).
      for (const v of (data || [])) {
        if (!MULTI_VEHICLE_ORDER.includes(v.code)) ordered.push(v);
      }
      setVehicles(ordered);
    }).catch(() => setVehicles([]));
  }, [country?.code]);

  useEffect(() => {
    if (!vehicles.length || !draft.stops?.length) return;
    const stops = draft.stops.map((s) => ({
      pickup: { lat: s.pickup.latitude, lng: s.pickup.longitude },
      drop:   { lat: s.drop.latitude,   lng: s.drop.longitude },
    }));
    // Reset to loading (undefined) before recomputing so cards show
    // "Calculating…" instead of a stale ₹0 (Fixing_Prompt §21).
    setQuotes({});
    Promise.all(vehicles.map(async (v) => {
      try {
        const { data } = await api.post("/express/quote/multi_stop", {
          country: country?.code || "CI",
          vehicle_code: v.code,
          stops,
        });
        return [v.code, data];
      } catch { return [v.code, { error: true }]; }
    })).then((rows) => setQuotes(Object.fromEntries(rows)));
  }, [vehicles, draft.stops, country?.code]);

  const cheapest = useMemo(() => {
    const eligible = Object.entries(quotes).filter(([, q]) => q?.total != null && !q?.error);
    if (!eligible.length) return null;
    return eligible.sort((a, b) => a[1].total - b[1].total)[0][0];
  }, [quotes]);

  const book = async () => {
    if (!draft.vehicle_code) { toast.info(t("send.multi.pick_vehicle_first")); return; }
    if (!customer) { openLogin("/send/multi-shipments/vehicle"); return; }
    setBusy(true);
    try {
      // Assemble stops[] payload with per-leg optional metadata.
      const stopsPayload = draft.stops.map((s) => ({
        pickup: {
          lat: s.pickup.latitude,
          lng: s.pickup.longitude,
          formatted_address: s.pickup.formatted_address,
          line1: s.pickup.line1,
          building: s.pickup.building,
          landmark: s.pickup_meta?.landmark || undefined,
          contact_name:  s.pickup_meta?.contact_name  || undefined,
          contact_phone: s.pickup_meta?.contact_phone || undefined,
          product_type:  s.pickup_meta?.product_type  || undefined,
        },
        drop: {
          lat: s.drop.latitude,
          lng: s.drop.longitude,
          formatted_address: s.drop.formatted_address,
          line1: s.drop.line1,
          building: s.drop.building,
          landmark: s.drop_meta?.landmark || undefined,
          contact_name:  s.drop_meta?.contact_name  || undefined,
          contact_phone: s.drop_meta?.contact_phone || undefined,
          product_type:  s.drop_meta?.product_type  || undefined,
        },
        receiver: {
          name:  s.drop_meta?.contact_name  || undefined,
          phone: s.drop_meta?.contact_phone || undefined,
        },
      }));
      const { data } = await api.post("/express/bookings/parcel", {
        country: country?.code || "CI",
        vehicle_code: draft.vehicle_code,
        service_type: "multiple_shipments",
        pickup: draft.stops[0].pickup,
        drop:   draft.stops[0].drop,
        stops: stopsPayload,
        payment_method: "cod",
      });
      resetDraft();
      navigate(`/send/booking/${data.id}?success=1`);
    } catch (e) {
      const msg = e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message;
      toast.error(String(msg || t("send.multi.booking_failed")));
    } finally {
      setBusy(false);
    }
  };

  const selectedQuote = draft.vehicle_code ? quotes[draft.vehicle_code] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="multi-shipments-step2">
      <ExpressHeader
        title={t("send.multi.step2_title")}
        step={2}
        totalSteps={2}
        onBack={() => navigate("/send/multi-shipments")}
      />
      <div className="px-4 pt-2">
        <WizardProgress
          steps={[
            { code: "stops",   label: t("send.multi.step_stops") },
            { code: "vehicle", label: t("send.multi.step_vehicle") },
          ]}
          current={1}
        />
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[45%_1fr] gap-4 px-4 md:px-6 pt-2 pb-6">
        <div className="md:hidden order-1">
          <WizardMap compact />
        </div>

        <div className="order-2 md:order-1 flex flex-col min-w-0 space-y-3">
          {vehicles.length === 0 && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> {t("send.multi.loading_vehicles")}
            </div>
          )}
          {vehicles.map((v) => {
            const q = quotes[v.code];
            const loading = q === undefined;
            const errored = q?.error === true;
            const priceReady = !!q && !errored && q.total != null;
            const selected = draft.vehicle_code === v.code;
            const label = lang === "en" ? v.name : (v.name_fr || v.name);
            const secondary = lang === "en" ? (v.name_fr || v.name) : v.name;
            return (
              <button
                key={v.code}
                type="button"
                data-testid={`multi-vehicle-card-${v.code}`}
                onClick={() => priceReady && setDraft({ vehicle_code: v.code })}
                disabled={!priceReady}
                className={`w-full rounded-2xl border p-4 text-left motion-fast flex items-center gap-3 disabled:opacity-70 ${selected ? "border-[#FCC44C] bg-[#FCC44C0F]" : "border-border bg-card"}`}
              >
                <VehicleImage vehicle={v} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold truncate">{label}</div>
                    {v.is_refrigerated && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: "#3b82f622", color: "#3b82f6" }}>
                        Frigo
                      </span>
                    )}
                    {cheapest === v.code && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: `${YELLOW}22`, color: YELLOW }}>
                        {t("send.multi.best_price")}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{secondary}</div>
                  {priceReady ? (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {q.distance_km?.toFixed?.(1) ?? q.distance_km} km · {q.duration_min} min · {q.shipments || draft.stops?.length || 1} colis
                    </div>
                  ) : loading ? (
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> {t("send.multi.pricing")}
                    </div>
                  ) : (
                    <div className="text-[11px] text-red-500 mt-1">
                      {t("send.multi.pricing_failed", { defaultValue: "Prix indisponible" })}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {priceReady ? (
                    <div className="text-sm font-bold" style={{ color: selected ? YELLOW : undefined }}>
                      {money(q.total, { currency: q.currency })}
                    </div>
                  ) : loading ? (
                    <div className="text-xs text-muted-foreground">
                      {t("send.multi.pricing")}
                    </div>
                  ) : (
                    <div className="text-xs text-red-500">—</div>
                  )}
                  {priceReady && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setBreakdownFor(v.code); }}
                      data-testid={`multi-vehicle-info-${v.code}`}
                      className="mt-1 w-7 h-7 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground"
                      aria-label={t("send.multi.breakdown_title")}
                    >
                      <Info size={13} />
                    </button>
                  )}
                </div>
                {selected && (
                  <span className="ml-2 w-6 h-6 rounded-full grid place-items-center shrink-0"
                        style={{ background: YELLOW, color: "#0a0a0a" }}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden md:block order-2 sticky top-4 self-start h-[calc(100vh-160px)] min-h-[420px]">
          <WizardMap />
        </div>
      </div>

      <ExpressFooter
        onContinue={book}
        disabled={!draft.vehicle_code || busy}
        loading={busy}
        label={t("send.multi.book_now")}
        testid="multi-shipments-book-now"
      />

      <PriceBreakdownModal
        open={breakdownFor != null}
        onClose={() => setBreakdownFor(null)}
        quote={breakdownFor ? quotes[breakdownFor] : null}
        currency={breakdownFor ? quotes[breakdownFor]?.currency : undefined}
      />
    </div>
  );
};

export default MultiShipmentsStep1;
