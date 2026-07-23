import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home as HomeIcon, Building2, Truck, Package as PackageIcon, MapPin, Sparkles, ShieldCheck, Star, Plus, Minus, Info, Clock, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Sofa, Bed, Utensils, Briefcase, Trees, Boxes, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useMoversBooking } from "../../contexts/ExpressContext";
import { ExpressHeader, WizardProgress, ExpressFooter, useMoney } from "../../components/express/ExpressLayout";

const STEPS = [
  { code: "type",       label: "Type" },
  { code: "location",   label: "Pickup & Drop" },
  { code: "items",      label: "Items" },
  { code: "quote",      label: "Quote" },
  { code: "timeslot",   label: "Time Slot" },
  { code: "review",     label: "Review" },
];
const CAT_ICONS = { living_room: Sofa, bedroom: Bed, kitchen: Utensils, office: Briefcase, outdoor: Trees, others: Boxes };
const MOVE_ICONS = { house: HomeIcon, office: Building2, mini_labour: Truck, single_item: PackageIcon };

// ---------------- MOVERS LANDING ----------------
export const MoversLanding = () => {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get("/express/movers/move-types").then((r) => setTypes(r.data)); }, []);
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="PACKERS & MOVERS" onBack={() => navigate("/express")} />
      <div className="flex-1 px-4 pt-3 pb-6 space-y-4">
        {/* Hero */}
        <div className="baked-card border border-border p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(119,188,31,0.10), transparent)" }}>
          <div className="text-lg font-bold">Professional moving made easy</div>
          <p className="text-xs text-muted-foreground mt-1">Move anything, anywhere. Safe packing, on-time delivery and insured transport.</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniFeature icon={ShieldCheck} label="Safe & Secure" />
            <MiniFeature icon={PackageIcon} label="Pro Packing" />
            <MiniFeature icon={Clock} label="On-Time" />
          </div>
        </div>

        <div className="text-sm font-bold">1. Select move type</div>
        <div className="text-xs text-muted-foreground -mt-2">Choose the type of shifting service you need</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {types.map((t) => {
            const Icon = MOVE_ICONS[t.code] || PackageIcon;
            return (
              <button
                key={t.code}
                data-testid={`mov-type-${t.code}`}
                onClick={() => navigate(`/express/movers/wizard?type=${t.code}`)}
                className="baked-card border border-border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#77BC1F]"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={20} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{t.name}</div><div className="text-[11px] text-muted-foreground">{t.description}</div></div>
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          <div className="text-sm font-bold mb-2">Why choose EXPRESSbakēd?</div>
          <div className="grid grid-cols-3 gap-2">
            <MiniFeature icon={CheckCircle2} label="Verified Partners" />
            <MiniFeature icon={Star} label="Best Prices" />
            <MiniFeature icon={ShieldCheck} label="Insured" />
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniFeature = ({ icon: Icon, label }) => (
  <div className="baked-card border border-border p-2.5 flex flex-col items-center gap-1">
    <Icon size={14} style={{ color: "#77BC1F" }} />
    <div className="text-[10px] font-semibold text-center">{label}</div>
  </div>
);

// ---------------- MOVERS WIZARD SHELL ----------------
export const MoversWizard = () => {
  const navigate = useNavigate();
  const { draft, setDraft, resetDraft } = useMoversBooking();
  const [step, setStep] = useState(0);
  const search = new URLSearchParams(window.location.search);
  useEffect(() => {
    const type = search.get("type");
    if (type && !draft.move_type) setDraft({ move_type: type });
  }, []); // eslint-disable-line

  const goto = (i) => setStep(Math.max(0, Math.min(STEPS.length - 1, i)));
  const next = () => goto(step + 1);
  const prev = () => (step === 0 ? navigate("/express/movers") : goto(step - 1));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ExpressHeader title="PACKERS & MOVERS" onBack={prev} step={step + 1} totalSteps={STEPS.length} />
      <WizardProgress steps={STEPS} current={step} />
      <div className="flex-1 flex flex-col">
        {step === 0 && <MoveTypeStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 1 && <PickupDropStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 2 && <ItemsStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 3 && <QuoteStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 4 && <TimeSlotStep draft={draft} setDraft={setDraft} onNext={next} />}
        {step === 5 && <ReviewStep draft={draft} setDraft={setDraft} resetDraft={resetDraft} />}
      </div>
    </div>
  );
};

// ---------------- STEP 1: Move Type ----------------
const MoveTypeStep = ({ draft, setDraft, onNext }) => {
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get("/express/movers/move-types").then((r) => setTypes(r.data)); }, []);
  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">Choose move type</div>
        <div className="grid grid-cols-1 gap-2">
          {types.map((t) => {
            const active = draft.move_type === t.code;
            const Icon = MOVE_ICONS[t.code] || PackageIcon;
            return (
              <button key={t.code} data-testid={`mov-w-type-${t.code}`} onClick={() => setDraft({ move_type: t.code })} className={`baked-card border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] ${active ? "border-[#77BC1F] bg-[#77BC1F14]" : "border-border"}`}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Icon size={20} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{t.name}</div><div className="text-[11px] text-muted-foreground">{t.description}</div></div>
                {active && <CheckCircle2 size={16} style={{ color: "#77BC1F" }} />}
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
  const { openAddressSelector } = useApp();
  const setBldg = (side, k, v) => setDraft((d) => ({ ...d, [side]: { ...(d[side] || {}), [k]: v } }));
  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">Pickup & Drop details</div>
        <MoverAddress testid="mov-pickup" label="Pickup Location" address={draft.pickup} onEdit={() => openAddressSelector({ title: "Pickup location", onPick: (a) => setDraft({ pickup: a }) })} />
        <BuildingBlock testid="mov-pickup-bldg" side="pickup" values={draft.pickup_building} onChange={(k, v) => setBldg("pickup_building", k, v)} />

        <MoverAddress testid="mov-drop" label="Drop Location" address={draft.drop} onEdit={() => openAddressSelector({ title: "Drop location", onPick: (a) => setDraft({ drop: a }) })} tone="#FCC44C" />
        <BuildingBlock testid="mov-drop-bldg" side="drop" values={draft.drop_building} onChange={(k, v) => setBldg("drop_building", k, v)} />
      </div>
      <ExpressFooter onContinue={onNext} disabled={!draft.pickup || !draft.drop} />
    </>
  );
};

const MoverAddress = ({ testid, label, address, onEdit, tone = "#77BC1F" }) => (
  <button data-testid={testid} onClick={onEdit} className="w-full baked-card border border-border p-3 flex items-start gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#77BC1F]">
    <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${tone}22`, color: tone }}><MapPin size={15} /></div>
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-bold truncate">{address?.formatted_address || "Tap to choose"}</div>
    </div>
  </button>
);

const BuildingBlock = ({ testid, side, values = {}, onChange }) => (
  <div data-testid={testid} className="baked-card border border-border p-3 space-y-2">
    <div className="text-[11px] font-semibold">Building access</div>
    <div className="grid grid-cols-2 gap-2">
      <Toggle testid={`${testid}-lift`} label="Service lift" active={!!values.lift} onClick={() => onChange("lift", !values.lift)} />
      <Toggle testid={`${testid}-stairs`} label="Stairs only" active={!!values.stairs} onClick={() => onChange("stairs", !values.stairs)} />
    </div>
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-muted-foreground">Floor</span>
      <input data-testid={`${testid}-floor`} type="number" min={0} value={values.floor ?? 0} onChange={(e) => onChange("floor", Math.max(0, parseInt(e.target.value || "0")))} className="baked-input h-9 w-20 px-2 border border-border bg-secondary/40 text-sm" />
      <Toggle testid={`${testid}-parking`} label="Parking available" active={!!values.parking} onClick={() => onChange("parking", !values.parking)} />
    </div>
  </div>
);

const Toggle = ({ testid, label, active, onClick }) => (
  <button data-testid={testid} onClick={onClick} className={`h-9 px-3 baked-chip text-xs font-semibold border motion-fast ${active ? "border-[#77BC1F] text-[#77BC1F] bg-[#77BC1F14]" : "border-border bg-secondary"}`}>{active && <CheckCircle2 size={11} className="inline mr-1" />}{label}</button>
);

// ---------------- STEP 3: Items ----------------
const ItemsStep = ({ draft, setDraft, onNext }) => {
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
    const next = cart.filter((i) => i.item_id !== item.id);
    if (qty > 0) next.push({ item_id: item.id, name: item.name, qty, base_price: item.base_price, weight_kg: item.weight_kg });
    setDraft({ items: next });
  };
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-2 overflow-y-auto">
        <div className="text-sm font-bold">Add your items</div>
        <div className="text-xs text-muted-foreground">Pick from categories or add custom items</div>
        {categories.map((c) => {
          const Icon = CAT_ICONS[c.code] || PackageIcon;
          const isOpen = openCat === c.code;
          const catItems = items.filter((i) => i.category_code === c.code);
          const catCount = cart.filter((i) => catItems.find((ci) => ci.id === i.item_id)).reduce((s, i) => s + i.qty, 0);
          return (
            <div key={c.code} className="baked-card border border-border overflow-hidden">
              <button data-testid={`mov-cat-${c.code}`} onClick={() => setOpenCat(isOpen ? null : c.code)} className="w-full flex items-center gap-3 p-3 text-left">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={17} /></div>
                <div className="flex-1"><div className="text-sm font-bold">{c.name}</div><div className="text-[10px] text-muted-foreground">{catItems.length} items{catCount > 0 && ` · ${catCount} added`}</div></div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div className="border-t border-border">
                  {catItems.map((it) => {
                    const qty = getQty(it.id);
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3 border-b border-border last:border-b-0">
                        <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center"><PackageIcon size={14} className="text-muted-foreground" /></div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{it.name}</div><div className="text-[10px] text-muted-foreground">{it.weight_kg} kg · from {money(it.base_price)}</div></div>
                        <div className="flex items-center gap-2">
                          <button data-testid={`mov-item-${it.id}-minus`} onClick={() => setQty(it, Math.max(0, qty - 1))} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center disabled:opacity-40" disabled={qty === 0}><Minus size={13} /></button>
                          <span className="w-6 text-center text-sm font-bold">{qty}</span>
                          <button data-testid={`mov-item-${it.id}-plus`} onClick={() => setQty(it, qty + 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-black" style={{ backgroundColor: "#77BC1F" }}><Plus size={13} /></button>
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
          <div className="text-xs">Custom item (coming soon — contact support for specialty moves)</div>
        </div>
      </div>
      <div className="sticky bottom-[68px] px-4 py-2 bg-background/95 backdrop-blur border-t border-border text-xs font-semibold flex items-center gap-2">
        <span data-testid="mov-total-count">{totalItems} items added</span>
        <div className="ml-auto text-muted-foreground">Add labour movers at Quote</div>
      </div>
      <ExpressFooter onContinue={onNext} disabled={totalItems === 0} />
    </>
  );
};

// ---------------- STEP 4: Quote ----------------
const QuoteStep = ({ draft, setDraft, onNext }) => {
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
        <div className="text-sm font-bold">Estimated Charges</div>
        <div className="text-[10px] text-muted-foreground">All prices are inclusive of taxes</div>
        <div className="baked-card border border-border p-4">
          {!quote ? <div className="text-xs text-muted-foreground">Calculating…</div> : (
            <div className="space-y-1.5 text-xs">
              <Line label={`Transportation (${quote.distance_km} km)`} value={money(quote.transportation)} />
              <Line label={`Packing (${quote.total_items} items)`} value={money(quote.packing)} />
              <Line label="Loading & Unloading" value={money(quote.loading_unloading)} />
              <Line label={`Labour (${draft.labour_movers} movers)`} value={money(quote.labour)} />
              {quote.floor_fee > 0 && <Line label="Floor fees" value={money(quote.floor_fee)} />}
              {quote.stair_fee > 0 && <Line label="Stair fees" value={money(quote.stair_fee)} />}
              {quote.toll_permits > 0 && <Line label="Toll & permits" value={money(quote.toll_permits)} />}
              <Line label="Insurance (transit cover)" value={money(quote.insurance)} />
              {quote.taxes > 0 && <Line label="Taxes" value={money(quote.taxes)} />}
              <div className="border-t border-border my-2" />
              <Line label={<strong>Total Estimated Cost</strong>} value={<strong data-testid="mov-total">{money(quote.total)}</strong>} />
              <div className="text-[10px] text-muted-foreground pt-1">Advance today: <strong>{money(quote.advance)}</strong> · Remaining after move: <strong>{money(quote.remaining)}</strong></div>
            </div>
          )}
        </div>

        <div className="baked-card border border-border p-3 flex items-center gap-2">
          <span className="text-xs font-semibold">Labour movers</span>
          <div className="ml-auto flex items-center gap-2">
            <button data-testid="mov-labour-minus" onClick={() => setDraft({ labour_movers: Math.max(1, (draft.labour_movers || 2) - 1) })} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><Minus size={13} /></button>
            <span className="w-6 text-center text-sm font-bold">{draft.labour_movers || 2}</span>
            <button data-testid="mov-labour-plus" onClick={() => setDraft({ labour_movers: (draft.labour_movers || 2) + 1 })} className="w-8 h-8 rounded-full flex items-center justify-center text-black" style={{ backgroundColor: "#77BC1F" }}><Plus size={13} /></button>
          </div>
        </div>

        <div className="baked-card border border-border p-3 flex items-start gap-2"><ShieldCheck size={16} style={{ color: "#77BC1F" }} className="mt-0.5" /><div className="text-[11px] text-muted-foreground">Verified partners · On-time delivery · Safe & Secure · Insurance included</div></div>
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
  const { country } = useApp();
  const [slots, setSlots] = useState([]);
  const money = useMoney();
  const [date, setDate] = useState(draft.scheduled_date || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api.get(`/express/movers/time-slots?country=${country?.code || "CI"}`).then((r) => setSlots(r.data));
  }, [country?.code]);

  const upcomingDates = useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      arr.push({ iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }) });
    }
    return arr;
  }, []);

  const pickDate = (iso) => { setDate(iso); setDraft({ scheduled_date: iso }); };
  const pickSlot = (code) => setDraft({ time_slot_code: code });

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        <div className="text-sm font-bold">Select moving date</div>
        <div className="flex overflow-x-auto gap-2 pb-1 -mx-4 px-4 no-scrollbar">
          {upcomingDates.map((d) => (
            <button key={d.iso} data-testid={`mov-date-${d.iso}`} onClick={() => pickDate(d.iso)} className={`shrink-0 w-20 h-16 baked-card border p-2 text-center motion-fast ${date === d.iso ? "border-[#77BC1F] bg-[#77BC1F14] text-[#77BC1F]" : "border-border"}`}>
              <div className="text-[10px] font-semibold">{d.label.split(" ")[0]}</div>
              <div className="text-lg font-bold">{d.label.split(" ")[1]}</div>
              <div className="text-[10px]">{d.label.split(" ")[2]}</div>
            </button>
          ))}
        </div>

        <div className="text-sm font-bold pt-2">Select time slot</div>
        <div className="text-[10px] text-muted-foreground">Timings include pickup, travel & delivery</div>
        <div className="space-y-2">
          {slots.map((s) => {
            const active = draft.time_slot_code === s.code;
            return (
              <button key={s.code} data-testid={`mov-slot-${s.code}`} onClick={() => pickSlot(s.code)} className={`w-full baked-card border p-3 flex items-center gap-3 motion-fast ${active ? "border-[#77BC1F] bg-[#77BC1F14]" : "border-border"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Clock size={15} /></div>
                <div className="flex-1 text-left"><div className="text-sm font-bold">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.window}</div></div>
                <div className="text-right">
                  {s.badge && <div className="text-[9px] font-bold px-1.5 py-0.5 rounded mb-1" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>{s.badge}</div>}
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
    if (!customer) { openLogin("/express/movers/wizard"); return; }
    if (!terms) { toast.error("Please accept the terms first"); return; }
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
      navigate(`/express/booking/${data.id}?success=1`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3 overflow-y-auto">
        <div className="text-sm font-bold">Review & Confirm</div>
        <div className="baked-card border border-border p-4 space-y-2 text-xs">
          <SummaryRow icon={ArrowUp} label="Pickup" value={draft.pickup?.formatted_address} />
          <SummaryRow icon={ArrowDown} label="Drop" value={draft.drop?.formatted_address} />
          <SummaryRow icon={HomeIcon} label="Move type" value={draft.move_type} />
          <SummaryRow icon={PackageIcon} label="Items" value={`${draft.items.reduce((s, i) => s + i.qty, 0)} items`} />
          <SummaryRow icon={Clock} label="Date & slot" value={`${draft.scheduled_date} · ${draft.time_slot_code}`} />
        </div>

        {quote && (
          <div className="baked-card border border-border p-4 space-y-1.5 text-xs">
            <div className="text-sm font-bold mb-1">Estimated Charges</div>
            <Line label={`Transportation (${quote.distance_km} km)`} value={money(quote.transportation)} />
            <Line label={`Packing (${quote.total_items} items)`} value={money(quote.packing)} />
            <Line label="Loading & Unloading" value={money(quote.loading_unloading)} />
            <Line label={`Labour (${draft.labour_movers} movers)`} value={money(quote.labour)} />
            <Line label="Insurance" value={money(quote.insurance)} />
            <div className="border-t border-border my-1" />
            <Line label={<strong>Total Estimated Cost</strong>} value={<strong>{money(quote.total)}</strong>} />
            <div className="text-[10px] text-muted-foreground pt-1">Advance today: <strong>{money(quote.advance)}</strong> · Remaining after move: <strong>{money(quote.remaining)}</strong></div>
          </div>
        )}

        <label className="flex items-start gap-2 text-xs">
          <input data-testid="mov-terms" type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setDraft({ terms_ok: e.target.checked }); }} className="mt-0.5 w-4 h-4 accent-[#77BC1F]" />
          <span>I have reviewed all the details and agree to the <a href="#" style={{ color: "#77BC1F" }}>Terms & Conditions</a>.</span>
        </label>

        <div className="baked-card border p-3 flex items-center gap-2" style={{ borderColor: "#77BC1F44", backgroundColor: "#77BC1F0F" }}>
          <ShieldCheck size={16} style={{ color: "#77BC1F" }} />
          <div className="text-[11px] text-muted-foreground">Your booking is safe and secure. Only advance is charged today — remaining after move completion.</div>
        </div>
      </div>
      <ExpressFooter onContinue={submit} disabled={!terms || !quote || busy} label={customer ? "Book Now" : "Sign in to book"} loading={busy} testid="mov-book" />
    </>
  );
};

const SummaryRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2">
    <Icon size={12} style={{ color: "#77BC1F" }} className="mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-xs font-semibold truncate">{value || "—"}</div></div>
  </div>
);
