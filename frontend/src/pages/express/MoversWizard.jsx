import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home as HomeIcon, Building2, Truck, Package as PackageIcon, MapPin, Sparkles, ShieldCheck, Star, Plus, Minus, Info, Clock, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Sofa, Bed, Utensils, Briefcase, Trees, Boxes, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useMoversBooking } from "../../contexts/ExpressContext";
import { ExpressHeader, WizardProgress, ExpressFooter, useMoney } from "../../components/express/ExpressLayout";
import { ExpressWizardShell } from "../../components/express/ExpressWizardShell";

const useSteps = () => {
  const { t } = useTranslation("customer");
  return useMemo(() => ([
    { code: "type",     label: t("send.wizard.step_type") },
    { code: "location", label: t("send.wizard.step_location") },
    { code: "items",    label: t("send.wizard.step_items") },
    { code: "quote",    label: t("send.wizard.step_quote") },
    { code: "timeslot", label: t("send.wizard.step_timeslot") },
    { code: "review",   label: t("send.wizard.step_review") },
  ]), [t]);
};
const TOTAL_STEPS = 6;
const CAT_ICONS = { living_room: Sofa, bedroom: Bed, kitchen: Utensils, office: Briefcase, outdoor: Trees, others: Boxes };
const MOVE_ICONS = { house: HomeIcon, office: Building2, mini_labour: Truck, single_item: PackageIcon };

// ---------------- MOVERS LANDING ----------------
export const MoversLanding = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get("/express/movers/move-types").then((r) => setTypes(r.data)); }, []);
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_movers")} onBack={() => navigate("/send")} />
      <div className="flex-1 px-4 pt-3 pb-6 space-y-4">
        {/* Hero */}
        <div className="baked-card border border-border p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(119,188,31,0.10), transparent)" }}>
          <div className="text-lg font-bold">{t("send.movers_hero_title")}</div>
          <p className="text-xs text-muted-foreground mt-1">{t("send.movers_hero_sub")}</p>
        </div>

        <div className="text-sm font-bold">{t("send.move_type")}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {types.map((mt) => {
            const Icon = MOVE_ICONS[mt.code] || PackageIcon;
            return (
              <button
                key={mt.code}
                data-testid={`mov-type-${mt.code}`}
                onClick={() => navigate(`/send/movers/wizard?type=${mt.code}`)}
                className="baked-card border border-border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#FCC44C]"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={20} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{mt.name}</div><div className="text-[11px] text-muted-foreground">{mt.description}</div></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const MiniFeature = ({ icon: Icon, label }) => (
  <div className="baked-card border border-border p-2.5 flex flex-col items-center gap-1">
    <Icon size={14} style={{ color: "#FCC44C" }} />
    <div className="text-[10px] font-semibold text-center">{label}</div>
  </div>
);

// ---------------- MOVERS WIZARD SHELL ----------------
export const MoversWizard = () => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { draft, setDraft, resetDraft } = useMoversBooking();
  const STEPS = useSteps();
  // Step index is persisted in the URL querystring so a mid-wizard login
  // (which does a full-page reload via BakedContexts.loginWithToken) still
  // returns the user to the exact step they were on.
  const search = new URLSearchParams(window.location.search);
  const initialStep = Math.max(0, Math.min(TOTAL_STEPS - 1, parseInt(search.get("step") || "0", 10) || 0));
  const [step, setStepState] = useState(initialStep);

  useEffect(() => {
    const type = search.get("type");
    if (type && !draft.move_type) setDraft({ move_type: type });
  }, []); // eslint-disable-line

  const setStep = useCallback((next) => {
    setStepState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 0) params.delete("step"); else params.set("step", String(next));
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
  }, []);

  const goto = (i) => setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, i)));
  const next = () => goto(step + 1);
  const prev = () => (step === 0 ? navigate("/send/movers") : goto(step - 1));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title={t("send.wizard.header_movers")} onBack={prev} step={step + 1} totalSteps={TOTAL_STEPS} />
      <WizardProgress steps={STEPS} current={step} />
      <ExpressWizardShell draft={draft}>
        {step === 0 && <MoveTypeStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 1 && <PickupDropStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 2 && <ItemsStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 3 && <QuoteStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 4 && <TimeSlotStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 5 && <ReviewStep draft={draft} setDraft={setDraft} resetDraft={resetDraft} />}
      </ExpressWizardShell>
    </div>
  );
};

// ---------------- STEP 1: Move Type ----------------
const MoveTypeStep = ({ draft, setDraft, onNext }) => {
  const { t } = useTranslation("customer");
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get("/express/movers/move-types").then((r) => setTypes(r.data)); }, []);
  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">{t("send.wizard.choose_move_type")}</div>
        <div className="grid grid-cols-1 gap-2">
          {types.map((mt) => {
            const active = draft.move_type === mt.code;
            const Icon = MOVE_ICONS[mt.code] || PackageIcon;
            return (
              <button key={mt.code} data-testid={`mov-w-type-${mt.code}`} onClick={() => setDraft({ move_type: mt.code })} className={`baked-card border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] ${active ? "border-[#FCC44C] bg-[#FCC44C14]" : "border-border"}`}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={20} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{mt.name}</div><div className="text-[11px] text-muted-foreground">{mt.description}</div></div>
                {active && <CheckCircle2 size={16} style={{ color: "#FCC44C" }} />}
              </button>
            );
          })}
        </div>
      </div>
      <ExpressFooter onContinue={onNext} disabled={!draft.move_type} />
    </>
  );
};

// ---------------- STEP 2: Pickup & Drop with Building details ----------------
const PickupDropStep = ({ draft, setDraft, onNext }) => {
  const { t } = useTranslation("customer");
  const { openAddressSelector } = useApp();
  const setBldg = (side, k, v) => setDraft((d) => ({ ...d, [side]: { ...(d[side] || {}), [k]: v } }));
  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">{t("send.wizard.pickup_drop_details")}</div>
        <MoverAddress testid="mov-pickup" label={t("send.wizard.pickup_location")} address={draft.pickup} onEdit={() => openAddressSelector({ title: t("send.wizard.pickup_location"), onPick: (a) => setDraft({ pickup: a }) })} />
        <BuildingBlock testid="mov-pickup-bldg" side="pickup" values={draft.pickup_building} onChange={(k, v) => setBldg("pickup_building", k, v)} />

        <MoverAddress testid="mov-drop" label={t("send.wizard.drop_location")} address={draft.drop} onEdit={() => openAddressSelector({ title: t("send.wizard.drop_location"), onPick: (a) => setDraft({ drop: a }) })} tone="#FCC44C" />
        <BuildingBlock testid="mov-drop-bldg" side="drop" values={draft.drop_building} onChange={(k, v) => setBldg("drop_building", k, v)} />
      </div>
      <ExpressFooter onContinue={onNext} disabled={!draft.pickup || !draft.drop} />
    </>
  );
};

const MoverAddress = ({ testid, label, address, onEdit, tone = "#FCC44C" }) => {
  const { t } = useTranslation("customer");
  return (
    <button data-testid={testid} onClick={onEdit} className="w-full baked-card border border-border p-3 flex items-start gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#FCC44C]">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${tone}22`, color: tone }}><MapPin size={15} /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-sm font-bold truncate">{address?.formatted_address || t("send.wizard.tap_to_choose")}</div>
      </div>
    </button>
  );
};

const BuildingBlock = ({ testid, side, values = {}, onChange }) => {
  const { t } = useTranslation("customer");
  return (
    <div data-testid={testid} className="baked-card border border-border p-3 space-y-2">
      <div className="text-[11px] font-semibold">{t("send.wizard.building_access")}</div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle testid={`${testid}-lift`} label={t("send.wizard.service_lift")} active={!!values.lift} onClick={() => onChange("lift", !values.lift)} />
        <Toggle testid={`${testid}-stairs`} label={t("send.wizard.stairs_only")} active={!!values.stairs} onClick={() => onChange("stairs", !values.stairs)} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">{t("send.wizard.floor_label")}</span>
        <input data-testid={`${testid}-floor`} type="number" min={0} value={values.floor ?? 0} onChange={(e) => onChange("floor", Math.max(0, parseInt(e.target.value || "0")))} className="baked-input h-9 w-20 px-2 border border-border bg-secondary/40 text-sm" />
        <Toggle testid={`${testid}-parking`} label={t("send.wizard.parking_available")} active={!!values.parking} onClick={() => onChange("parking", !values.parking)} />
      </div>
    </div>
  );
};

const Toggle = ({ testid, label, active, onClick }) => (
  <button data-testid={testid} onClick={onClick} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#FCC44C] text-[#FCC44C] bg-[#FCC44C14]" : "border-border bg-secondary"}`}>{active && <CheckCircle2 size={11} className="inline mr-1" />}{label}</button>
);

// ---------------- STEP 3: Items ----------------
const ItemsStep = ({ draft, setDraft, onNext }) => {
  const { t } = useTranslation("customer");
  const { country } = useApp();
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [openCat, setOpenCat] = useState("living_room");
  const money = useMoney();

  useEffect(() => {
    api.get("/express/movers/categories").then((r) => setCategories(r.data));
    api.get(`/express/movers/items?country=${country?.code || "CI"}`).then((r) => setItems(r.data));
  }, [country?.code]);

  const cart = draft.items || [];
  const getQty = (id) => cart.find((i) => i.item_id === id)?.qty || 0;
  const setQty = (item, qty) => {
    const nextCart = cart.filter((i) => i.item_id !== item.id);
    if (qty > 0) nextCart.push({ item_id: item.id, name: item.name, qty, base_price: item.base_price, weight_kg: item.weight_kg });
    setDraft({ items: nextCart });
  };
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-2 overflow-y-auto">
        <div className="text-sm font-bold">{t("send.wizard.add_items")}</div>
        <div className="text-xs text-muted-foreground">{t("send.wizard.items_hint")}</div>
        {categories.map((c) => {
          const Icon = CAT_ICONS[c.code] || PackageIcon;
          const isOpen = openCat === c.code;
          const catItems = items.filter((i) => i.category_code === c.code);
          const catCount = cart.filter((i) => catItems.find((ci) => ci.id === i.item_id)).reduce((s, i) => s + i.qty, 0);
          return (
            <div key={c.code} className="baked-card border border-border overflow-hidden">
              <button data-testid={`mov-cat-${c.code}`} onClick={() => setOpenCat(isOpen ? null : c.code)} className="w-full flex items-center gap-3 p-3 text-left">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={17} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{c.name}</div><div className="text-[10px] text-muted-foreground">{t("send.wizard.items_count", { count: catItems.length })}{catCount > 0 && ` · ${t("send.wizard.items_added_suffix", { count: catCount })}`}</div></div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div className="border-t border-border">
                  {catItems.map((it) => {
                    const qty = getQty(it.id);
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3 border-b border-border last:border-b-0">
                        <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center"><PackageIcon size={14} className="text-muted-foreground" /></div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{it.name}</div><div className="text-[10px] text-muted-foreground">{it.weight_kg} kg · {t("send.from_price", { price: money(it.base_price) })}</div></div>
                        <div className="flex items-center gap-2">
                          <button data-testid={`mov-item-${it.id}-minus`} onClick={() => setQty(it, Math.max(0, qty - 1))} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center disabled:opacity-40" disabled={qty === 0}><Minus size={13} /></button>
                          <span className="w-6 text-center text-sm font-bold">{qty}</span>
                          <button data-testid={`mov-item-${it.id}-plus`} onClick={() => setQty(it, qty + 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-black" style={{ backgroundColor: "#FCC44C" }}><Plus size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="baked-card border border-dashed border-border p-3 flex items-center gap-3 text-muted-foreground">
          <Plus size={14} />
          <div className="text-xs">{t("send.wizard.custom_item_soon")}</div>
        </div>
      </div>
      <div className="sticky bottom-[68px] px-4 py-2 bg-background/95 backdrop-blur border-t border-border text-xs font-semibold flex items-center gap-2">
        <span data-testid="mov-total-count">{t("send.wizard.items_added_bottom", { count: totalItems })}</span>
        <div className="ml-auto text-muted-foreground">{t("send.wizard.add_labour_hint")}</div>
      </div>
      <ExpressFooter onContinue={onNext} disabled={totalItems === 0} />
    </>
  );
};

// ---------------- STEP 4: Quote ----------------
const QuoteStep = ({ draft, setDraft, onNext }) => {
  const { t } = useTranslation("customer");
  const { country } = useApp();
  const [quote, setQuote] = useState(null);
  const money = useMoney();

  useEffect(() => {
    if (!draft.pickup || !draft.drop) return;
    api.post("/express/quote/movers", {
      country: country?.code || "CI",
      pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
      drop_lat: draft.drop.latitude, drop_lng: draft.drop.longitude,
      items: draft.items.map((i) => ({ item_id: i.item_id, qty: i.qty })),
      labour_movers: draft.labour_movers || 2,
      floors_pickup: draft.pickup_building?.floor || 0,
      floors_drop: draft.drop_building?.floor || 0,
      stairs_pickup: !!draft.pickup_building?.stairs,
      stairs_drop: !!draft.drop_building?.stairs,
    }).then((r) => setQuote(r.data));
  }, [draft, country?.code]);

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3 overflow-y-auto">
        <div className="text-sm font-bold">{t("send.wizard.estimated_charges")}</div>
        <div className="text-[10px] text-muted-foreground">{t("send.wizard.prices_inclusive_taxes")}</div>
        <div className="baked-card border border-border p-4">
          {!quote ? <div className="text-xs text-muted-foreground">{t("send.wizard.calculating")}</div> : (
            <div className="space-y-1.5 text-xs">
              <Line label={t("send.wizard.transportation", { km: quote.distance_km })} value={money(quote.transportation)} />
              <Line label={t("send.wizard.packing", { count: quote.total_items })} value={money(quote.packing)} />
              <Line label={t("send.wizard.loading_unloading")} value={money(quote.loading_unloading)} />
              <Line label={t("send.wizard.labour", { count: draft.labour_movers })} value={money(quote.labour)} />
              {quote.floor_fee > 0 && <Line label={t("send.wizard.floor_fees")} value={money(quote.floor_fee)} />}
              {quote.stair_fee > 0 && <Line label={t("send.wizard.stair_fees")} value={money(quote.stair_fee)} />}
              {quote.toll_permits > 0 && <Line label={t("send.wizard.toll_permits")} value={money(quote.toll_permits)} />}
              <Line label={t("send.wizard.insurance_transit")} value={money(quote.insurance)} />
              {quote.taxes > 0 && <Line label={t("send.wizard.taxes")} value={money(quote.taxes)} />}
              <div className="border-t border-border my-2" />
              <Line label={<strong>{t("send.wizard.total_estimated_cost")}</strong>} value={<strong data-testid="mov-total">{money(quote.total)}</strong>} />
              <div className="text-[10px] text-muted-foreground pt-1">{t("send.wizard.advance_today")} <strong>{money(quote.advance)}</strong> · {t("send.wizard.remaining_after_move")} <strong>{money(quote.remaining)}</strong></div>
            </div>
          )}
        </div>

        <div className="baked-card border border-border p-3 flex items-center gap-2">
          <span className="text-xs font-semibold">{t("send.wizard.labour_movers")}</span>
          <div className="ml-auto flex items-center gap-2">
            <button data-testid="mov-labour-minus" onClick={() => setDraft({ labour_movers: Math.max(1, (draft.labour_movers || 2) - 1) })} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><Minus size={13} /></button>
            <span className="w-6 text-center text-sm font-bold">{draft.labour_movers || 2}</span>
            <button data-testid="mov-labour-plus" onClick={() => setDraft({ labour_movers: (draft.labour_movers || 2) + 1 })} className="w-8 h-8 rounded-full flex items-center justify-center text-black" style={{ backgroundColor: "#FCC44C" }}><Plus size={13} /></button>
          </div>
        </div>

        <div className="baked-card border border-border p-3 flex items-start gap-2"><ShieldCheck size={16} style={{ color: "#FCC44C" }} className="mt-0.5" /><div className="text-[11px] text-muted-foreground">{t("send.wizard.trust_movers")}</div></div>
      </div>
      <ExpressFooter onContinue={onNext} disabled={!quote} />
    </>
  );
};

const Line = ({ label, value }) => (
  <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>
);

// ---------------- STEP 5: Time Slot ----------------
const TimeSlotStep = ({ draft, setDraft, onNext }) => {
  const { t, i18n } = useTranslation("customer");
  const { country } = useApp();
  const [slots, setSlots] = useState([]);
  const money = useMoney();
  const [date, setDate] = useState(draft.scheduled_date || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api.get(`/express/movers/time-slots?country=${country?.code || "CI"}`).then((r) => setSlots(r.data));
  }, [country?.code]);

  const localeTag = i18n.language === "fr" ? "fr-FR" : "en-US";
  const upcomingDates = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      arr.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString(localeTag, { weekday: "short", day: "2-digit", month: "short" }) });
    }
    return arr;
  }, [localeTag]);

  const pickDate = (iso) => { setDate(iso); setDraft({ scheduled_date: iso }); };
  const pickSlot = (code) => setDraft({ time_slot_code: code });

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">{t("send.wizard.select_moving_date")}</div>
        <div className="flex overflow-x-auto gap-2 pb-1 -mx-4 px-4 no-scrollbar">
          {upcomingDates.map((d) => {
            const parts = d.label.split(" ");
            return (
              <button key={d.iso} data-testid={`mov-date-${d.iso}`} onClick={() => pickDate(d.iso)} className={`shrink-0 w-20 h-16 baked-card border p-2 text-center motion-fast ${date === d.iso ? "border-[#FCC44C] bg-[#FCC44C14] text-[#FCC44C]" : "border-border"}`}>
                <div className="text-[10px] font-semibold">{parts[0]}</div>
                <div className="text-lg font-bold">{parts[1]}</div>
                <div className="text-[10px]">{parts[2]}</div>
              </button>
            );
          })}
        </div>

        <div className="text-sm font-bold pt-2">{t("send.wizard.select_time_slot")}</div>
        <div className="text-[10px] text-muted-foreground">{t("send.wizard.timings_include")}</div>
        <div className="space-y-2">
          {slots.map((s) => {
            const active = draft.time_slot_code === s.code;
            return (
              <button key={s.code} data-testid={`mov-slot-${s.code}`} onClick={() => pickSlot(s.code)} className={`w-full baked-card border p-3 flex items-center gap-3 motion-fast ${active ? "border-[#FCC44C] bg-[#FCC44C14]" : "border-border"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Clock size={15} /></div>
                <div className="flex-1 text-left"><div className="text-sm font-bold">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.window}</div></div>
                <div className="text-right">
                  {s.badge && <div className="text-[9px] font-bold px-1.5 py-0.5 rounded mb-1" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>{s.badge}</div>}
                  <div className="text-xs font-bold">{s.surcharge > 0 ? `+${money(s.surcharge)}` : money(0)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <ExpressFooter onContinue={onNext} disabled={!date || !draft.time_slot_code} />
    </>
  );
};

// ---------------- STEP 6: Review ----------------
const ReviewStep = ({ draft, setDraft, resetDraft }) => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { country } = useApp();
  const { customer, openLogin } = useAuth();
  const money = useMoney();
  const [quote, setQuote] = useState(null);
  const [terms, setTerms] = useState(!!draft.terms_ok);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft.pickup || !draft.drop) return;
    api.post("/express/quote/movers", {
      country: country?.code || "CI",
      pickup_lat: draft.pickup.latitude, pickup_lng: draft.pickup.longitude,
      drop_lat: draft.drop.latitude, drop_lng: draft.drop.longitude,
      items: draft.items.map((i) => ({ item_id: i.item_id, qty: i.qty })),
      labour_movers: draft.labour_movers || 2,
      floors_pickup: draft.pickup_building?.floor || 0,
      floors_drop: draft.drop_building?.floor || 0,
      stairs_pickup: !!draft.pickup_building?.stairs,
      stairs_drop: !!draft.drop_building?.stairs,
    }).then((r) => setQuote(r.data));
  }, [draft, country?.code]);

  const submit = async () => {
    if (!customer) { openLogin("/send/movers/wizard"); return; }
    if (!terms) { toast.error(t("send.wizard.accept_terms_first")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/express/bookings/movers", {
        country: country?.code || "CI",
        move_type: draft.move_type,
        pickup: draft.pickup,
        drop: draft.drop,
        pickup_building: draft.pickup_building,
        drop_building: draft.drop_building,
        items: draft.items.map((i) => ({ item_id: i.item_id, qty: i.qty })),
        scheduled_date: draft.scheduled_date,
        time_slot_code: draft.time_slot_code,
        labour_movers: draft.labour_movers || 2,
      });
      resetDraft();
      navigate(`/send/booking/${data.id}?success=1`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("send.wizard.booking_failed"));
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3 overflow-y-auto">
        <div className="text-sm font-bold">{t("send.wizard.review_confirm")}</div>
        <div className="baked-card border border-border p-4 space-y-2 text-xs">
          <SummaryRow icon={ArrowUp} label={t("send.wizard.pickup")} value={draft.pickup?.formatted_address} />
          <SummaryRow icon={ArrowDown} label={t("send.wizard.drop")} value={draft.drop?.formatted_address} />
          <SummaryRow icon={HomeIcon} label={t("send.wizard.move_type")} value={draft.move_type} />
          <SummaryRow icon={PackageIcon} label={t("send.wizard.items")} value={t("send.wizard.items_count", { count: draft.items.reduce((s, i) => s + i.qty, 0) })} />
          <SummaryRow icon={Clock} label={t("send.wizard.date_slot")} value={`${draft.scheduled_date} · ${draft.time_slot_code}`} />
        </div>

        {quote && (
          <div className="baked-card border border-border p-4 space-y-1.5 text-xs">
            <div className="text-sm font-bold mb-1">{t("send.wizard.estimated_charges")}</div>
            <Line label={t("send.wizard.transportation", { km: quote.distance_km })} value={money(quote.transportation)} />
            <Line label={t("send.wizard.packing", { count: quote.total_items })} value={money(quote.packing)} />
            <Line label={t("send.wizard.loading_unloading")} value={money(quote.loading_unloading)} />
            <Line label={t("send.wizard.labour", { count: draft.labour_movers })} value={money(quote.labour)} />
            <Line label={t("send.wizard.insurance")} value={money(quote.insurance)} />
            <div className="border-t border-border my-1" />
            <Line label={<strong>{t("send.wizard.total_estimated_cost")}</strong>} value={<strong>{money(quote.total)}</strong>} />
            <div className="text-[10px] text-muted-foreground pt-1">{t("send.wizard.advance_today")} <strong>{money(quote.advance)}</strong> · {t("send.wizard.remaining_after_move")} <strong>{money(quote.remaining)}</strong></div>
          </div>
        )}

        <label className="flex items-start gap-2 text-xs">
          <input data-testid="mov-terms" type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setDraft({ terms_ok: e.target.checked }); }} className="mt-0.5 w-4 h-4 accent-[#FCC44C]" />
          <span>{t("send.wizard.terms_agree_prefix")} <a href="#" style={{ color: "#FCC44C" }}>{t("send.wizard.terms_link")}</a>.</span>
        </label>

        <div className="baked-card border p-3 flex items-center gap-2" style={{ borderColor: "#FCC44C44", backgroundColor: "#FCC44C0F" }}>
          <ShieldCheck size={16} style={{ color: "#FCC44C" }} />
          <div className="text-[11px] text-muted-foreground">{t("send.wizard.booking_safe")}</div>
        </div>
      </div>
      <ExpressFooter onContinue={submit} disabled={!terms || !quote || busy} label={customer ? t("send.wizard.book_now") : t("send.wizard.sign_in_to_book")} loading={busy} testid="mov-book" />
    </>
  );
};

const SummaryRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    <Icon size={12} style={{ color: "#FCC44C" }} className="mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-xs font-semibold truncate">{value || "—"}</div></div>
  </div>
);
