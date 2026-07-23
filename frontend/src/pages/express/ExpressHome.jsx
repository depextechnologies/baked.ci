import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Truck, Bike, Package, ArrowRight, MapPin, Plus, Clock, Sparkles, Home, Building2, ChevronRight, Search } from "lucide-react";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { MobileHeader } from "../../components/mobile/MobileHeader";
import { useIsMobile } from "../../hooks/useIsMobile";
import { api } from "../../lib/api";
import { useMoney } from "../../components/express/ExpressLayout";

/**
 * ExpressHome — mirrors the PDF Screen 1: map, pickup input, vehicle shortcuts,
 * Bulk Deliveries card and Home Shifting card. Uses shared MobileHeader on
 * mobile and a light desktop layout.
 */
export const ExpressHome = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { activeAddress, openAddressSelector, country } = useApp();
  const { setDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const money = useMoney();

  useEffect(() => {
    api.get(`/express/vehicles?country=${country?.code || "CI"}`).then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
  }, [country?.code]);

  const startBooking = useCallback((preSelectedVehicleCode) => {
    setDraft((d) => ({
      ...d,
      pickup: activeAddress || d.pickup,
      vehicle_code: preSelectedVehicleCode || d.vehicle_code,
    }));
    navigate("/express/book/location");
  }, [activeAddress, setDraft, navigate]);

  const shortcutCards = vehicles.filter((v) => ["bike", "three_wheeler", "truck"].includes(v.code));

  return (
    <div className="min-h-screen bg-background pb-24">
      {isMobile ? (
        <MobileHeader variant="home" />
      ) : (
        <div className="border-b border-border px-6 py-4 flex items-center gap-3">
          <div className="text-lg font-bold tracking-wide">EXPRESS<span className="text-[#77BC1F]">bakēd</span></div>
          <div className="ml-auto text-xs text-muted-foreground">Delivering to {country?.name}</div>
        </div>
      )}

      {/* Hero: pickup search */}
      <section className="px-4 pt-3 pb-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your Pick-up Location?</div>
        <button
          data-testid="exp-home-pickup"
          onClick={() => openAddressSelector({ title: "Choose pickup location" })}
          className="w-full flex items-center gap-3 h-14 px-4 baked-card border border-border bg-secondary/40 motion-fast active:scale-[0.995] hover:border-[#77BC1F]"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
            <MapPin size={16} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pickup</div>
            <div className="text-sm font-semibold truncate">{activeAddress?.formatted_address || "Tap to choose pickup"}</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </button>

        <button
          data-testid="exp-home-add-stop"
          onClick={() => navigate("/express/book/location")}
          className="w-full mt-2 h-10 rounded-full baked-btn border border-dashed border-border text-xs font-semibold text-muted-foreground motion-fast active:scale-[0.995] hover:text-[#77BC1F] hover:border-[#77BC1F]"
        >
          <Plus size={13} className="inline mr-1" /> Add drop-off & start booking
        </button>
      </section>

      {/* Send Now — vehicle shortcuts */}
      <section className="px-4 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold">Send Now</h2>
          <Link data-testid="exp-home-see-all" to="/express/book/location" className="text-xs font-semibold" style={{ color: "#77BC1F" }}>See all ›</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {shortcutCards.map((v) => (
            <button
              key={v.code}
              data-testid={`exp-home-vehicle-${v.code}`}
              onClick={() => startBooking(v.code)}
              className="baked-card border border-border p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#77BC1F]"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}>
                {v.code === "bike" || v.code === "scooter" ? <Bike size={22} /> : <Truck size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{v.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{v.description}</div>
                <div className="text-[10px] mt-0.5 font-semibold" style={{ color: "#77BC1F" }}>
                  {v.eta_min_min}-{v.eta_min_max} min · from {money(v.base_price)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Bulk Deliveries */}
      <section className="px-4 mt-5">
        <div data-testid="exp-home-bulk" className="baked-card border border-border p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(119,188,31,0.10), transparent)" }}>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Package size={20} /></div>
            <div className="flex-1">
              <div className="text-sm font-bold">Bulk Deliveries</div>
              <div className="text-xs text-muted-foreground">Up to 25% OFF on business deliveries</div>
              <Link to="/express/book/location" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#77BC1F" }}>Learn more <ArrowRight size={12} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Home Shifting */}
      <section className="px-4 mt-3">
        <Link data-testid="exp-home-movers" to="/express/movers" className="block baked-card border border-border p-4 motion-fast active:scale-[0.995] hover:border-[#77BC1F]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#FCC44C22", color: "#FCC44C" }}><Home size={20} /></div>
            <div className="flex-1">
              <div className="text-sm font-bold">Home Shifting</div>
              <div className="text-xs text-muted-foreground">Safe & hassle-free moving services</div>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#77BC1F" }}>Learn more <ArrowRight size={12} /></span>
            </div>
          </div>
        </Link>
      </section>

      {/* Quick actions */}
      <section className="px-4 mt-5">
        <div className="grid grid-cols-2 gap-2">
          <QuickTile testid="exp-home-schedule" icon={Clock} label="Schedule" sub="Book for later" onClick={() => navigate("/express/book/location")} />
          <QuickTile testid="exp-home-track" icon={Search} label="Track" sub="Existing order" onClick={() => navigate("/express/bookings")} />
        </div>
      </section>

      {/* Trust */}
      <section className="px-4 mt-5">
        <div className="baked-card border border-border p-3 flex items-center gap-3">
          <Sparkles size={16} style={{ color: "#77BC1F" }} />
          <div className="text-[11px] text-muted-foreground">All deliveries are insured. Sit back — we handle the rest.</div>
        </div>
      </section>
    </div>
  );
};

const QuickTile = ({ testid, icon: Icon, label, sub, onClick }) => (
  <button data-testid={testid} onClick={onClick} className="baked-card border border-border p-3 flex items-center gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#77BC1F]">
    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={16} /></div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  </button>
);
