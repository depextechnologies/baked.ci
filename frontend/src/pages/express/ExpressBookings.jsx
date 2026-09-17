import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, MapPin, Truck, Bike, Home, ArrowRight, Package, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/BakedContexts";
import { ExpressHeader, useMoney } from "../../components/express/ExpressLayout";
import { GuestSignInPrompt } from "../../components/auth/GuestSignInPrompt";
import { EXPRESS_ASSETS, vehicleImage } from "../../lib/expressAssets";

const YELLOW = "#FCC44C";
const YELLOW_TINT = "#FCC44C22";

const STATUS_MAP = {
  searching:       { label: "Finding driver",    tone: YELLOW },
  driver_assigned: { label: "Driver assigned",   tone: YELLOW },
  arriving:        { label: "Driver arriving",   tone: YELLOW },
  picked:          { label: "Picked up",         tone: YELLOW },
  in_transit:      { label: "In transit",        tone: YELLOW },
  delivered:       { label: "Delivered",         tone: "#4ADE80" },
  cancelled:       { label: "Cancelled",         tone: "#FF6B6B" },
  confirmed:       { label: "Confirmed",         tone: YELLOW },
};

/**
 * ExpressBookings — Express-ONLY bookings list (parcel + movers).
 * Does NOT reuse the MART orders page. Tabs: Active / Completed / Cancelled.
 */
export const ExpressBookings = () => {
  const navigate = useNavigate();
  const { customer } = useAuth();
  const [tab, setTab] = useState("active");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) { setLoading(false); return; }
    setLoading(true);
    api.get(`/express/bookings/mine?status=${tab}`)
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [customer, tab]);

  if (!customer) {
    return (
      <div className="min-h-screen bg-background">
        <ExpressHeader title="My Bookings" onBack={() => navigate("/send")} />
        <GuestSignInPrompt title="Sign in to see your bookings" message="Track your SENDbakēd deliveries and moves in one place." testid="exp-bookings-signin" accent={YELLOW} />
      </div>
    );
  }

  const tabs = [
    { code: "active",    label: "Active" },
    { code: "completed", label: "Completed" },
    { code: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="min-h-screen bg-background pb-28">
      <ExpressHeader title="My Bookings" onBack={() => navigate("/send")} />

      {/* Tabs */}
      <div className="px-4 pt-3 flex gap-2">
        {tabs.map((t) => {
          const active = tab === t.code;
          return (
            <button
              key={t.code}
              data-testid={`exp-bookings-tab-${t.code}`}
              onClick={() => setTab(t.code)}
              className={`flex-1 h-10 rounded-full text-xs font-bold motion-fast ${active ? "text-black" : "text-white/70"}`}
              style={{
                backgroundColor: active ? YELLOW : "transparent",
                border: `1px solid ${active ? YELLOW : "#2a2a2a"}`,
              }}
            >{t.label}</button>
          );
        })}
      </div>

      {/* List */}
      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="text-center text-xs text-white/50 py-10">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState tab={tab} onCta={() => navigate("/send")} />
        ) : (
          items.map((b) => {
            const isActiveParcel = b.booking_type === "parcel" && ["searching", "driver_assigned", "arriving", "picked_up", "in_transit"].includes(b.status);
            const target = isActiveParcel ? `/send/booking/${b.id}/track` : `/send/booking/${b.id}`;
            return <BookingCard key={b.id} b={b} onClick={() => navigate(target)} />;
          })
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ tab, onCta }) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center text-center" data-testid="exp-bookings-empty">
    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: YELLOW_TINT }}>
      <ClipboardList size={32} color={YELLOW} />
    </div>
    <div className="text-lg font-bold text-white">No {tab} bookings yet</div>
    <p className="text-xs text-white/60 mt-1 max-w-xs">
      {tab === "active" && "Book a delivery or a move — you'll see live status here."}
      {tab === "completed" && "Delivered orders will appear here once finished."}
      {tab === "cancelled" && "Anything you cancel will land here."}
    </p>
    <button
      data-testid="exp-bookings-empty-cta"
      onClick={onCta}
      className="mt-6 h-11 px-6 rounded-full font-bold text-black"
      style={{ backgroundColor: YELLOW }}
    >Book a delivery</button>
  </div>
);

const BookingCard = ({ b, onClick }) => {
  const money = useMoney();
  const status = STATUS_MAP[b.status] || { label: b.status, tone: "#a8a8a8" };
  const isMovers = b.booking_type === "movers";
  return (
    <button
      onClick={onClick}
      data-testid={`exp-booking-${b.id}`}
      className="w-full text-left rounded-3xl overflow-hidden motion-fast active:scale-[0.995]"
      style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
    >
      <div className="p-4 flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
          {isMovers
            ? <img src={EXPRESS_ASSETS.moving} alt="" className="max-h-14 w-auto object-contain" />
            : <img src={vehicleImage(b.vehicle_code)} alt="" className="max-h-14 w-auto object-contain" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: `${status.tone}22`, color: status.tone }}>{status.label}</span>
            <span className="text-[10px] text-white/40 truncate">#{b.ref}</span>
          </div>
          <div className="text-sm font-bold text-white mt-1 truncate">
            {isMovers ? `Move · ${(b.move_type || "").replace("_", " ")}` : `Send by ${(b.vehicle_code || "").replace("_", " ")}`}
          </div>
          <div className="text-[11px] text-white/50 truncate flex items-center gap-1">
            <MapPin size={10} color={YELLOW} />
            {b.pickup?.formatted_address?.split(",")[0]} → {b.drop?.formatted_address?.split(",")[0]}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-white">{money(b.total)}</div>
          <ArrowRight size={13} color={YELLOW} className="ml-auto mt-1" />
        </div>
      </div>
    </button>
  );
};
