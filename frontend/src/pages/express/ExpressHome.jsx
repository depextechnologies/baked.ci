import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Bell, Wallet2, ChevronDown, MapPin, Plus, ArrowRight, Bike, Truck, Locate, Search, Sparkles, Clock } from "lucide-react";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { api } from "../../lib/api";
import { useMoney } from "../../components/express/ExpressLayout";
import { EXPRESS_ASSETS, vehicleImage } from "../../lib/expressAssets";

/**
 * ExpressHome — redesigned to match the approved reference:
 *   1. Big EXPRESSbakēd wordmark + bell + wallet pill
 *   2. Address row + module pill (right side)
 *   3. Hero: interactive Google Map with driver markers + GPS button
 *   4. Pickup search + Add Stop
 *   5. Horizontal "Send Now" vehicle cards (large yellow icon)
 *   6. Bulk Deliveries + Home Shifting cards side-by-side
 *
 * Accent: EXPRESSbakēd yellow #FCC44C (never MART green).
 */
const YELLOW = "#FCC44C";
const YELLOW_TINT = "#FCC44C22";
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#181818" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a8a8a8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8f8f8f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d2635" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
];

// Reference points per country — used as the map center + basis for driver sprinkling
const COUNTRY_CENTER = {
  CI: { lat: 5.3600, lng: -4.0083, label: "Cocody, Abidjan" },
  LR: { lat: 6.3005, lng: -10.7969, label: "Sinkor, Monrovia" },
};

// Deterministically-seeded driver positions around a center (so they don't jitter on re-render).
const seedDrivers = (lat, lng, count = 7) => {
  const out = [];
  const kinds = ["bike", "scooter", "three_wheeler", "truck"];
  for (let i = 0; i < count; i++) {
    // Pseudo-random offset ~0.5–3.5 km using a hashed step
    const a = ((i * 137.508) % 360) * (Math.PI / 180);
    const r = 0.005 + ((i * 7) % 20) * 0.001;
    out.push({
      id: `drv${i}`,
      lat: lat + Math.sin(a) * r,
      lng: lng + Math.cos(a) * r,
      kind: kinds[i % kinds.length],
    });
  }
  return out;
};

const DriverPin = ({ kind }) => {
  const Icon = kind === "bike" || kind === "scooter" ? Bike : Truck;
  return (
    <div className="relative">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-2xl border-2" style={{ backgroundColor: YELLOW, borderColor: "#0a0a0a" }}>
        <Icon size={14} color="#0a0a0a" strokeWidth={2.5} />
      </div>
    </div>
  );
};

const UserPin = () => (
  <div className="relative">
    <div className="absolute -inset-2 rounded-full animate-ping" style={{ backgroundColor: "#3B82F6", opacity: 0.35 }} />
    <div className="relative w-6 h-6 rounded-full border-[3px] border-white" style={{ backgroundColor: "#3B82F6", boxShadow: "0 4px 12px rgba(59,130,246,0.6)" }} />
  </div>
);

const GpsButton = () => {
  const map = useMap();
  const center = () => {
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      map.setZoom(15);
    });
  };
  return (
    <button
      data-testid="exp-map-gps"
      onClick={center}
      className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center shadow-2xl motion-fast active:scale-95"
      style={{ backgroundColor: "#0a0a0a", border: "1px solid #2a2a2a" }}
      aria-label="Center on my location"
    >
      <Locate size={16} color={YELLOW} strokeWidth={2.5} />
    </button>
  );
};

// ---------------- HEADER ----------------
const ExpressTopBar = () => {
  const { activeAddress, openAddressSelector, country } = useApp();
  const money = useMoney();
  const walletBalance = 0;
  const address = activeAddress?.formatted_address || COUNTRY_CENTER[country?.code || "CI"].label;
  const eta = country?.delivery_eta_min || "8 mins";

  return (
    <header className="px-4 pt-4 pb-2">
      <div className="flex items-center gap-3">
        <img
          src={EXPRESS_ASSETS.wordmark}
          alt="EXPRESSbakēd"
          className="h-9 w-auto object-contain shrink-0"
          data-testid="exp-top-wordmark"
        />
        <div className="flex-1" />
        <button data-testid="exp-top-bell" className="relative w-11 h-11 rounded-full flex items-center justify-center" style={{ border: "1px solid #2a2a2a" }} aria-label="Notifications">
          <Bell size={17} className="text-white" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: YELLOW }} />
        </button>
        <button
          data-testid="exp-top-wallet"
          onClick={() => window.location.assign("/wallet")}
          className="h-11 px-3 rounded-full flex items-center gap-2 text-sm font-semibold text-white"
          style={{ border: "1px solid #2a2a2a" }}
        >
          <Wallet2 size={15} color={YELLOW} />
          {money(walletBalance)}
        </button>
      </div>

      <div className="flex items-start gap-3 mt-3">
        <button data-testid="exp-top-address" onClick={openAddressSelector} className="flex-1 flex items-start gap-2 text-left min-w-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
            <MapPin size={14} color={YELLOW} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate flex items-center gap-1">{address}<ChevronDown size={12} className="text-white/60" /></div>
            <div className="text-[11px] text-white/50">Delivering to you <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-1" style={{ backgroundColor: YELLOW, color: "#0a0a0a" }}>{eta}</span></div>
          </div>
        </button>
        <button data-testid="exp-top-module" className="h-11 px-3 rounded-full flex items-center gap-2 text-sm font-semibold text-white shrink-0" style={{ border: "1px solid #2a2a2a" }}>
          <img src={EXPRESS_ASSETS.wordmark} alt="" className="h-4 w-auto" />
          <ChevronDown size={12} />
        </button>
      </div>
    </header>
  );
};

// ---------------- MAP HERO ----------------
const MapHero = () => {
  const { country } = useApp();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const center = COUNTRY_CENTER[country?.code || "CI"];
  const drivers = useMemo(() => seedDrivers(center.lat, center.lng, 7), [center.lat, center.lng]);
  const [userPos, setUserPos] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserPos(null),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  }, []);

  if (!apiKey) {
    return <div className="mx-4 h-56 rounded-3xl bg-secondary/50 flex items-center justify-center text-xs text-muted-foreground">Map unavailable — set REACT_APP_GOOGLE_MAPS_API_KEY</div>;
  }

  return (
    <div className="mx-4 rounded-3xl overflow-hidden relative h-64" style={{ border: "1px solid #2a2a2a" }}>
      <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
        <Map
          style={{ width: "100%", height: "100%" }}
          defaultCenter={userPos || center}
          defaultZoom={14}
          mapId="baked-express-map"
          gestureHandling="greedy"
          disableDefaultUI
          styles={DARK_MAP_STYLE}
        >
          {drivers.map((d) => (
            <AdvancedMarker key={d.id} position={{ lat: d.lat, lng: d.lng }}>
              <DriverPin kind={d.kind} />
            </AdvancedMarker>
          ))}
          <AdvancedMarker position={userPos || center}>
            <UserPin />
          </AdvancedMarker>
        </Map>
        <GpsButton />
      </APIProvider>
    </div>
  );
};

// ---------------- MAIN HOME ----------------
export const ExpressHome = () => {
  const navigate = useNavigate();
  const { openAddressSelector, activeAddress, country } = useApp();
  const { setDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const money = useMoney();

  useEffect(() => {
    api.get(`/express/vehicles?country=${country?.code || "CI"}`).then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
  }, [country?.code]);

  const start = useCallback((code) => {
    setDraft((d) => ({ ...d, pickup: activeAddress || d.pickup, vehicle_code: code || d.vehicle_code }));
    navigate("/express/book/location");
  }, [activeAddress, setDraft, navigate]);

  const shortcutCards = vehicles.filter((v) => ["bike", "three_wheeler", "truck"].includes(v.code));

  return (
    <div className="min-h-screen bg-background pb-28">
      <ExpressTopBar />
      <MapHero />

      {/* Pickup + Add Stop */}
      <section className="px-4 mt-3">
        <div className="rounded-2xl flex items-center gap-2 pl-3 pr-2 h-14" style={{ border: "1px solid #2a2a2a", backgroundColor: "#111111" }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: YELLOW_TINT }}><Search size={14} color={YELLOW} /></div>
          <button
            data-testid="exp-home-pickup"
            onClick={() => openAddressSelector({ title: "Pickup location", onPick: (a) => setDraft({ pickup: a }) })}
            className="flex-1 text-left text-sm text-white/80 truncate"
          >
            {activeAddress ? activeAddress.formatted_address : "Your Pick-up Location?"}
          </button>
          <button
            data-testid="exp-home-add-stop"
            onClick={() => navigate("/express/book/location")}
            className="h-10 pl-3 pr-4 rounded-full flex items-center gap-1.5 text-sm font-semibold"
            style={{ border: "1px solid #2a2a2a", color: "#fff" }}
          >
            <Plus size={14} color={YELLOW} /> Add Stop
          </button>
        </div>
      </section>

      {/* Send Now — image-first horizontal cards */}
      <section className="mt-5">
        <div className="px-4 flex items-center justify-between mb-3">
          <h2 className="text-xl font-black tracking-tight">Send Now</h2>
          <Link data-testid="exp-home-see-all" to="/express/book/location" className="text-xs font-semibold" style={{ color: YELLOW }}>See all →</Link>
        </div>
        {/* Horizontal scroller — first two cards fit, third peeks so users swipe. */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pl-4 pr-8 pb-2 snap-x snap-mandatory">
          {shortcutCards.map((v) => (
            <VehicleCard key={v.code} v={v} money={money} onClick={() => start(v.code)} testid={`exp-home-vehicle-${v.code}`} />
          ))}
        </div>
      </section>

      {/* Bulk & Home Shifting — branded artwork */}
      <section className="px-4 mt-2 grid grid-cols-2 gap-3">
        <ServiceCard
          testid="exp-home-bulk"
          title="Parcel Delivery"
          subtitle="Fast document & parcel delivery"
          image={EXPRESS_ASSETS.parcel}
          onClick={() => navigate("/express/book/location")}
        />
        <ServiceCard
          testid="exp-home-movers"
          title="Home Shifting"
          subtitle="Professional Packers & Movers"
          image={EXPRESS_ASSETS.moving}
          onClick={() => navigate("/express/movers")}
        />
      </section>

      <section className="px-4 mt-4">
        <div className="rounded-2xl p-3 flex items-center gap-3" style={{ border: "1px solid #2a2a2a", backgroundColor: "#111111" }}>
          <Sparkles size={16} color={YELLOW} />
          <div className="text-[11px] text-white/70">All deliveries are insured · verified drivers · live tracking on every order.</div>
        </div>
      </section>
    </div>
  );
};

// ---------------- VEHICLE CARD — image-first, minimal ----------------
const VehicleCard = ({ v, money, onClick, testid }) => {
  const label = v.code === "bike" ? "Bike"
              : v.code === "three_wheeler" ? "Mini 3W"
              : v.code === "mini_truck" ? "Mini Truck"
              : v.code === "truck" ? "Truck"
              : v.name;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="snap-start shrink-0 w-[240px] rounded-3xl overflow-hidden text-left motion-fast active:scale-[0.99] flex flex-col"
      style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
    >
      <div className="h-40 relative flex items-center justify-center px-3" style={{ background: `radial-gradient(circle at 50% 60%, ${YELLOW}22, transparent 65%)` }}>
        <img
          src={vehicleImage(v.code)}
          alt={label}
          className="max-h-36 w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
          loading="lazy"
        />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-bold text-black" style={{ backgroundColor: YELLOW }}>
          <Clock size={10} /> {v.eta_min_min}-{v.eta_min_max} min
        </span>
      </div>
      <div className="p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-bold text-white truncate">Send by {label}</div>
          <div className="text-[10px] text-white/50 mt-0.5">from <span className="font-semibold text-white/90">{money(v.base_price)}</span></div>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW }}>
          <ArrowRight size={16} color="#0a0a0a" strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
};

// ---------------- SERVICE CARD — branded artwork ----------------
const ServiceCard = ({ testid, title, subtitle, image, onClick }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className="rounded-3xl overflow-hidden text-left flex flex-col min-h-[180px] motion-fast active:scale-[0.99]"
    style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
  >
    <div className="h-24 relative flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}18, transparent 70%)` }}>
      <img src={image} alt={title} className="max-h-24 w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" loading="lazy" />
    </div>
    <div className="p-3.5 flex-1 flex flex-col justify-between">
      <div>
        <div className="text-sm font-bold text-white leading-tight">{title}</div>
        <div className="text-[11px] text-white/55 mt-1">{subtitle}</div>
      </div>
      <div className="mt-3 flex items-center justify-end">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: YELLOW }}>
          <ArrowRight size={13} color="#0a0a0a" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  </button>
);
