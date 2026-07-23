import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Bell, ChevronDown, MapPin, Plus, ArrowRight, Bike, Truck, Locate, Search, Sparkles, Sun, Moon, ShieldCheck, LayoutGrid, Briefcase } from "lucide-react";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { api } from "../../lib/api";
import { useMoney } from "../../components/express/ExpressLayout";
import { useIsMobile } from "../../hooks/useIsMobile";
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
  const { activeAddress, openAddressSelector, country, theme, toggleTheme } = useApp();
  const address = activeAddress?.formatted_address || COUNTRY_CENTER[country?.code || "CI"].label;
  const eta = country?.delivery_eta_min || "8 mins";
  const isDark = theme !== "light";

  return (
    <header className="px-4 pt-4 pb-2">
      {/*
        Row 1 — clean & minimal:
          [logo]                                    [bell] [theme toggle]
        Wallet card + module dropdown removed (Phase 1 uses COD; module
        switching is handled by the global center FAB in the bottom nav).
      */}
      <div className="flex items-center gap-3">
        <img
          src={EXPRESS_ASSETS.wordmark}
          alt="EXPRESSbakēd"
          className="h-9 w-auto object-contain shrink-0"
          data-testid="exp-top-wordmark"
        />
        <div className="flex-1" />
        <button data-testid="exp-top-bell" className="relative w-10 h-10 rounded-full flex items-center justify-center motion-fast active:scale-95" style={{ border: "1px solid #2a2a2a" }} aria-label="Notifications">
          <Bell size={16} className="text-white" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: YELLOW }} />
        </button>
        <button
          data-testid="exp-top-theme"
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full flex items-center justify-center motion-fast active:scale-95"
          style={{ border: "1px solid #2a2a2a" }}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Moon size={16} color={YELLOW} strokeWidth={2.5} /> : <Sun size={16} color={YELLOW} strokeWidth={2.5} />}
        </button>
      </div>

      {/* Row 2 — address + ETA badge (no module dropdown; use bottom-nav FAB) */}
      <button data-testid="exp-top-address" onClick={openAddressSelector} className="w-full mt-3 flex items-start gap-2 text-left min-w-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
          <MapPin size={14} color={YELLOW} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate flex items-center gap-1">{address}<ChevronDown size={12} className="text-white/60" /></div>
          <div className="text-[11px] text-white/50">Delivering to you <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-1" style={{ backgroundColor: YELLOW, color: "#0a0a0a" }}>{eta}</span></div>
        </div>
      </button>
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

// ---------------- MAIN HOME (mobile-first with desktop split-panel) ----------------
export const ExpressHome = () => {
  const isMobile = useIsMobile();
  return isMobile ? <ExpressHomeMobile /> : <ExpressDesktopHome />;
};

const ExpressHomeMobile = () => {
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
          <h2 className="text-2xl font-bold tracking-tight">Send Now</h2>
          <Link data-testid="exp-home-see-all" to="/express/book/location" className="text-[0.75rem] font-semibold" style={{ color: YELLOW }}>See all →</Link>
        </div>
        {/* 180px cards + 12px gap. On a 390px viewport 2 cards fully fit and the
            third peeks; on 412-430px (typical Android) the third card peeks ~30-40%. */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pl-4 pr-4 pb-2 snap-x snap-mandatory" style={{ scrollPaddingLeft: 16 }}>
          {shortcutCards.map((v) => (
            <VehicleCard key={v.code} v={v} money={money} onClick={() => start(v.code)} testid={`exp-home-vehicle-${v.code}`} />
          ))}
        </div>
      </section>

      {/* Bulk & Home Shifting — branded artwork */}
      <section className="px-4 mt-4 grid grid-cols-2 gap-3">
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
          <div className="text-[0.75rem] font-normal text-white opacity-70">All deliveries are insured · verified drivers · live tracking on every order.</div>
        </div>
      </section>
    </div>
  );
};

// ---------------- VEHICLE CARD — image-first, minimal (180px wide) ----------------
const VehicleCard = ({ v, money, onClick, testid }) => {
  const label = v.code === "bike" ? "Bike"
              : v.code === "three_wheeler" ? "Mini 3 Wheeler"
              : v.code === "mini_truck" ? "Mini Truck"
              : v.code === "truck" ? "Truck"
              : v.name;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="snap-start shrink-0 min-w-[180px] max-w-[180px] rounded-2xl overflow-hidden text-left motion-fast active:scale-[0.98] flex flex-col"
      style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
    >
      {/* Image occupies ~72% of card height (160px of 220px) — object-contain, never cropped */}
      <div className="h-40 relative flex items-center justify-center px-2 pt-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}22, transparent 65%)` }}>
        <img
          src={vehicleImage(v.code)}
          alt={label}
          className="max-h-36 max-w-full w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
          loading="lazy"
        />
      </div>
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center gap-1.5 text-white text-[0.9rem] font-semibold leading-tight">
          <span className="truncate">Send by {label}</span>
          <ArrowRight size={13} color={YELLOW} className="shrink-0" strokeWidth={2.5} />
        </div>
        <div className="text-[0.75rem] font-normal text-white opacity-70 mt-1">From {money(v.base_price)}</div>
      </div>
    </button>
  );
};

// ---------------- SERVICE CARD — branded artwork ----------------
const ServiceCard = ({ testid, title, subtitle, image, onClick }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className="rounded-2xl overflow-hidden text-left flex flex-col motion-fast active:scale-[0.98]"
    style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
  >
    <div className="h-28 relative flex items-center justify-center px-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}1E, transparent 70%)` }}>
      <img src={image} alt={title} className="max-h-24 max-w-full w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" loading="lazy" />
    </div>
    <div className="px-3 pt-2 pb-3">
      <div className="flex items-center gap-1.5 text-white text-[0.9rem] font-semibold leading-tight">
        <span className="truncate">{title}</span>
        <ArrowRight size={13} color={YELLOW} className="shrink-0" strokeWidth={2.5} />
      </div>
      <div className="text-[0.75rem] font-normal text-white opacity-70 mt-1">{subtitle}</div>
    </div>
  </button>
);

// =====================================================================
// DESKTOP / TABLET LAYOUT — 45/55 split with a persistent right-hand map
// =====================================================================

const MODULE_TABS = [
  { code: "mart",    label: "MART",    color: "#77BC1F", route: "/",         active: false },
  { code: "food",    label: "FOOD",    color: "#FF6B6B", route: "/food",     active: false },
  { code: "shop",    label: "SHOP",    color: "#3B82F6", route: "/shop",     active: false },
  { code: "express", label: "EXPRESS", color: YELLOW,    route: "/express",  active: true  },
  { code: "auto",    label: "AUTO",    color: "#9B87F5", route: "/auto",     active: false },
  { code: "immo",    label: "IMMO",    color: "#F97316", route: "/immo",     active: false },
];

const ExpressDesktopHome = () => {
  const navigate = useNavigate();
  const { country, activeAddress, openAddressSelector, theme, toggleTheme } = useApp();
  const { setDraft } = useExpressBooking();
  const [vehicles, setVehicles] = useState([]);
  const money = useMoney();
  const isDark = theme !== "light";
  const address = activeAddress?.formatted_address || COUNTRY_CENTER[country?.code || "CI"].label;
  const eta = country?.delivery_eta_min || "10-15 min";

  useEffect(() => {
    api.get(`/express/vehicles?country=${country?.code || "CI"}`).then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
  }, [country?.code]);

  const start = useCallback((code) => {
    setDraft((d) => ({ ...d, pickup: activeAddress || d.pickup, vehicle_code: code || d.vehicle_code }));
    navigate("/express/book/location");
  }, [activeAddress, setDraft, navigate]);

  const shortcutCards = vehicles.filter((v) => ["bike", "three_wheeler", "truck"].includes(v.code));

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">
      {/* Module tabs row — highlights EXPRESSbakēd in yellow */}
      <nav className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center gap-6">
          {MODULE_TABS.map((t) => (
            <button
              key={t.code}
              data-testid={`exp-dt-tab-${t.code}`}
              onClick={() => navigate(t.route)}
              className="relative h-14 flex items-center text-sm font-semibold motion-fast"
              style={{ color: t.active ? t.color : "hsl(var(--muted-foreground))" }}
            >
              <span className="uppercase tracking-wide">{t.label}</span>
              <span className="lowercase tracking-normal text-white/70">bakēd</span>
              {t.active && <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-t-full" style={{ backgroundColor: t.color }} />}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button data-testid="exp-dt-bell" className="relative w-10 h-10 rounded-full flex items-center justify-center" style={{ border: "1px solid #2a2a2a" }} aria-label="Notifications">
              <Bell size={16} className="text-white" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: YELLOW }} />
            </button>
            <button data-testid="exp-dt-theme" onClick={toggleTheme} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: "1px solid #2a2a2a" }} aria-label="Toggle theme">
              {isDark ? <Moon size={16} color={YELLOW} strokeWidth={2.5} /> : <Sun size={16} color={YELLOW} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </nav>

      {/* 45/55 split — left workflow, right map */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6 grid grid-cols-1 md:grid-cols-[45%_1fr] gap-6">
        {/* LEFT PANEL */}
        <div className="rounded-3xl p-6 md:p-7 flex flex-col gap-5" style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}>
          {/* Section 1 — logo + address + ETA */}
          <div>
            <img src={EXPRESS_ASSETS.wordmark} alt="EXPRESSbakēd" className="h-10 w-auto object-contain" data-testid="exp-dt-wordmark" />
            <button data-testid="exp-dt-address" onClick={openAddressSelector} className="mt-4 flex items-start gap-2 text-left w-full">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
                <MapPin size={14} color={YELLOW} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate flex items-center gap-1">{address}<ChevronDown size={12} className="text-white/60" /></div>
                <div className="text-[0.75rem] font-normal text-white opacity-70">Delivering to you <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-1" style={{ backgroundColor: YELLOW, color: "#0a0a0a" }}>{eta}</span></div>
              </div>
            </button>
          </div>

          {/* Section 2 — vehicle cards, 3 in a row */}
          <div className="grid grid-cols-3 gap-3">
            {shortcutCards.map((v) => (
              <DesktopVehicleCard key={v.code} v={v} money={money} onClick={() => start(v.code)} testid={`exp-dt-vehicle-${v.code}`} />
            ))}
          </div>

          {/* Section 3 — 2 service cards side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <DesktopServiceCard testid="exp-dt-parcel"  title="Parcel Delivery" subtitle={<>Fast document<br/>&amp; parcel delivery</>} image={EXPRESS_ASSETS.parcel} onClick={() => navigate("/express/parcel")} />
            <DesktopServiceCard testid="exp-dt-movers"  title="Home Shifting"   subtitle={<>Professional<br/>Packers &amp; Movers</>} image={EXPRESS_ASSETS.moving} onClick={() => navigate("/express/home-shifting")} />
          </div>

          {/* Section 4 — Explore All Services */}
          <button
            data-testid="exp-dt-explore"
            onClick={() => navigate("/express/services")}
            className="rounded-2xl p-4 flex items-center gap-3 text-left motion-fast active:scale-[0.995] hover:border-[#FCC44C44]"
            style={{ border: "1px solid #2a2a2a", backgroundColor: "#111111" }}
          >
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: YELLOW_TINT }}>
              <LayoutGrid size={18} color={YELLOW} />
            </div>
            <div className="flex-1">
              <div className="text-[0.9rem] font-semibold leading-tight text-white">Explore All Services</div>
              <div className="text-[0.75rem] font-normal text-white opacity-70 mt-0.5">More delivery solutions for you</div>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: "1px solid #2a2a2a" }}>
              <ArrowRight size={14} color={YELLOW} strokeWidth={2.5} />
            </div>
          </button>

          {/* Section 5 — Book Now primary CTA */}
          <button
            data-testid="exp-dt-book"
            onClick={() => navigate("/express/book/location")}
            className="rounded-2xl h-14 flex items-center justify-center gap-2 text-base font-bold text-black motion-fast active:scale-[0.99]"
            style={{ backgroundColor: YELLOW }}
          >
            <Briefcase size={17} strokeWidth={2.5} /> BOOK NOW
          </button>

          {/* Section 6 — Trust banner */}
          <div className="rounded-2xl px-3 py-2.5 flex items-center gap-2" style={{ border: "1px solid #2a2a2a", backgroundColor: "#111111" }}>
            <ShieldCheck size={14} color={YELLOW} />
            <div className="text-[0.75rem] font-normal text-white opacity-70">All deliveries are insured · Verified drivers · Live tracking on every order.</div>
          </div>
        </div>

        {/* RIGHT PANEL — persistent map */}
        <div className="rounded-3xl overflow-hidden relative min-h-[560px]" style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}>
          <DesktopMapHero />
        </div>
      </div>
    </div>
  );
};

const DesktopVehicleCard = ({ v, money, onClick, testid }) => {
  const label = v.code === "bike" ? "Bike"
              : v.code === "three_wheeler" ? "Mini 3 Wheeler"
              : v.code === "mini_truck" ? "Mini Truck"
              : v.code === "truck" ? "Truck"
              : v.name;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="rounded-2xl overflow-hidden text-left flex flex-col motion-fast active:scale-[0.98]"
      style={{ border: "1px solid #2a2a2a", backgroundColor: "#151515" }}
    >
      <div className="h-32 relative flex items-center justify-center px-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}22, transparent 65%)` }}>
        <img src={vehicleImage(v.code)} alt={label} className="max-h-28 max-w-full w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]" loading="lazy" />
      </div>
      <div className="px-3 pt-2 pb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[0.85rem] font-semibold text-white leading-tight truncate">Send by {label}</div>
          <div className="text-[0.7rem] font-normal text-white opacity-70 mt-0.5">From {money(v.base_price)}</div>
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW }}>
          <ArrowRight size={13} color="#0a0a0a" strokeWidth={2.5} />
        </div>
      </div>
    </button>
  );
};

const DesktopServiceCard = ({ testid, title, subtitle, image, onClick }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className="rounded-2xl overflow-hidden text-left flex items-center gap-3 p-3 motion-fast active:scale-[0.99]"
    style={{ border: "1px solid #2a2a2a", backgroundColor: "#151515" }}
  >
    <div className="w-24 h-24 shrink-0 flex items-center justify-center rounded-xl" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}1E, transparent 70%)` }}>
      <img src={image} alt={title} className="max-h-20 max-w-full w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]" loading="lazy" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[0.9rem] font-semibold text-white leading-tight">{title}</div>
      <div className="text-[0.72rem] font-normal text-white opacity-70 mt-1 leading-snug">{subtitle}</div>
    </div>
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW }}>
      <ArrowRight size={13} color="#0a0a0a" strokeWidth={2.5} />
    </div>
  </button>
);

// Larger map re-using the existing dark style + driver markers, sized to fill the right panel.
const DesktopMapHero = () => {
  const { country } = useApp();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const center = COUNTRY_CENTER[country?.code || "CI"];
  const drivers = useMemo(() => seedDrivers(center.lat, center.lng, 9), [center.lat, center.lng]);
  const [userPos, setUserPos] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserPos(null),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  }, []);

  if (!apiKey) return <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Map unavailable</div>;
  return (
    <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
      <Map
        style={{ width: "100%", height: "100%", minHeight: 560 }}
        defaultCenter={userPos || center}
        defaultZoom={13}
        mapId="baked-express-map-dt"
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
  );
};

