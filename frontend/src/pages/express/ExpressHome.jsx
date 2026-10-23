import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Bell, ChevronDown, MapPin, Plus, ArrowRight, Bike, Truck, Locate, Search, Sparkles, Sun, Moon, ShieldCheck, LayoutGrid, Briefcase } from "lucide-react";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { api } from "../../lib/api";
import { useIsMobile } from "../../hooks/useIsMobile";
import { EXPRESS_ASSETS, vehicleImage } from "../../lib/expressAssets";
import { SendServiceTiles } from "../../components/express/SendServiceTiles";
import { BrandedModuleLabel } from "../../components/layout/BakedLogo";

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

// Reference points per country — used as the map center + basis for driver sprinkling
const COUNTRY_CENTER = {
  CI: { lat: 5.3600, lng: -4.0083, label: "Cocody, Abidjan" },
  IN: { lat: 28.6139, lng: 77.2090, label: "Connaught Place, New Delhi" },
};

// Real online SEND drivers near the map origin (GET /api/express/drivers/nearby — dispatch eligibility, ~110 m rounding).
const NEARBY_POLL_MS = 15000;
const useNearbyDrivers = (origin, country, enabled) => {
  const [state, setState] = useState({ drivers: [], count: null });
  const lat = origin?.lat; const lng = origin?.lng;
  useEffect(() => {
    if (!enabled || lat == null || lng == null) { setState({ drivers: [], count: null }); return undefined; }
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api.get(`/express/drivers/nearby?country=${country}&lat=${lat}&lng=${lng}`)
        .then((r) => alive && setState({ drivers: r.data?.drivers || [], count: r.data?.count ?? 0 }))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, NEARBY_POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", load); };
  }, [enabled, lat, lng, country]);
  return state;
};

// Address first, then device GPS only if it is inside the selected country (~150 km of its centre), else the country centre.
const mapOrigin = (addr, gps, center) => {
  if (addr?.lat != null) return { lat: addr.lat, lng: addr.lng };
  if (gps && Math.abs(gps.lat - center.lat) < 1.4 && Math.abs(gps.lng - center.lng) < 1.4) return gps;
  return center;
};

// Keeps the map centred on the origin when it changes after mount (GPS resolves, address switched).
const Recenter = ({ origin }) => {
  const map = useMap();
  useEffect(() => { if (map && origin) map.panTo(origin); }, [map, origin?.lat, origin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const DriverCountChip = ({ count }) => {
  const { t } = useTranslation("customer");
  if (count == null) return null;
  return (
    <div data-testid="send-nearby-count"
         className="absolute top-3 left-3 z-10 h-8 px-3 max-w-[calc(100%-5rem)] rounded-full flex items-center gap-2 whitespace-nowrap text-[0.72rem] font-semibold bg-black/70 backdrop-blur border border-white/10 text-white">
      <span className={`w-2 h-2 rounded-full ${count ? "animate-pulse" : ""}`} style={{ backgroundColor: count ? "#22C55E" : "#737373" }} />
      <span className="truncate">{count ? t("send.nearby_drivers", { count }) : t("send.no_nearby_drivers")}</span>
    </div>
  );
};

const DriverPin = ({ kind }) => {
  const Icon = ["bike", "moto", "scooter", "motorcycle"].includes(kind) ? Bike : Truck;
  return (
    <div className="relative">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-2xl border-2 border-foreground" style={{ backgroundColor: YELLOW }}>
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
  const { t } = useTranslation("customer");
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
      className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center shadow-2xl motion-fast active:scale-95 bg-card border border-border"
      aria-label={t("send.gps_aria")}
    >
      <Locate size={16} color={YELLOW} strokeWidth={2.5} />
    </button>
  );
};

// ---------------- HEADER ----------------
const ExpressTopBar = () => {
  const { t } = useTranslation("customer");
  const { activeAddress, openAddressSelector, country, theme, toggleTheme } = useApp();
  const address = activeAddress?.formatted_address || COUNTRY_CENTER[country?.code || "CI"].label;
  const eta = country?.delivery_eta_min || "8 mins";
  const isDark = theme !== "light";

  return (
    <header className="px-4 pt-4 pb-2">
      <div className="flex items-center gap-3">
        <span data-testid="exp-top-wordmark" className="inline-flex items-center shrink-0">
          <BrandedModuleLabel code="express" label="SEND" color={YELLOW} height={28} />
        </span>
        <div className="flex-1" />
        <button data-testid="exp-top-bell" className="relative w-10 h-10 rounded-full flex items-center justify-center motion-fast active:scale-95 border border-border bg-card" aria-label={t("send.notifications_aria")}>
          <Bell size={16} className="text-foreground" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: YELLOW }} />
        </button>
        <button
          data-testid="exp-top-theme"
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full flex items-center justify-center motion-fast active:scale-95 border border-border bg-card"
          aria-label={isDark ? t("send.switch_to_light") : t("send.switch_to_dark")}
          title={isDark ? t("send.light_mode") : t("send.dark_mode")}
        >
          {isDark ? <Moon size={16} color={YELLOW} strokeWidth={2.5} /> : <Sun size={16} color={YELLOW} strokeWidth={2.5} />}
        </button>
      </div>

      <button data-testid="exp-top-address" onClick={openAddressSelector} className="w-full mt-3 flex items-start gap-2 text-left min-w-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
          <MapPin size={14} color={YELLOW} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground truncate flex items-center gap-1">{address}<ChevronDown size={12} className="text-muted-foreground" /></div>
          <div className="text-[11px] text-muted-foreground">{t("send.delivering_to_you")} <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-1" style={{ backgroundColor: YELLOW, color: "#0a0a0a" }}>{eta}</span></div>
        </div>
      </button>
    </header>
  );
};

// ---------------- MAP HERO ----------------
// Published SEND homepage (Super Admin → /api/homepage?module=express) — same payload the native apps render.
const useSendHomepage = () => {
  const { country } = useApp();
  const [sections, setSections] = useState(null);
  useEffect(() => {
    api.get(`/homepage?country=${country?.code || "CI"}&module=express`)
      .then((r) => setSections(r.data?.sections || []))
      .catch(() => setSections([]));
  }, [country?.code]);
  return sections;
};
const cmsText = (o, key, lang) => (lang === "fr" ? o?.[`${key}_fr`] || o?.[key] : o?.[key] || o?.[`${key}_fr`]) || "";

const MapHero = ({ showDrivers = true }) => {
  const { country, activeAddress } = useApp();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const center = COUNTRY_CENTER[country?.code || "CI"];
  const [userPos, setUserPos] = useState(null);
  const origin = mapOrigin(activeAddress, userPos, center);
  const { drivers, count } = useNearbyDrivers(origin, country?.code || "CI", showDrivers);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserPos(null),
      { enableHighAccuracy: false, timeout: 4000 }
    );
  }, []);

  if (!apiKey) {
    return <div className="mx-4 h-56 rounded-3xl bg-secondary/50 flex items-center justify-center text-xs text-muted-foreground">{/* legacy fallback text now provided via useTranslation in caller */}Map unavailable — set REACT_APP_GOOGLE_MAPS_API_KEY</div>;
  }

  return (
    <div className="mx-4 rounded-3xl overflow-hidden relative h-64 border border-border">
      <APIProvider apiKey={apiKey} libraries={["places", "geocoding"]}>
        <Map
          style={{ width: "100%", height: "100%" }}
          defaultCenter={origin}
          defaultZoom={14}
          mapId="baked-express-map"
          gestureHandling="greedy"
          disableDefaultUI
        >
          {drivers.map((d, i) => (
            <AdvancedMarker key={`${d.lat},${d.lng},${i}`} position={{ lat: d.lat, lng: d.lng }}>
              <DriverPin kind={d.vehicle_type} />
            </AdvancedMarker>
          ))}
          <Recenter origin={origin} />
          <Recenter origin={origin} />
        <AdvancedMarker position={origin}>
            <UserPin />
          </AdvancedMarker>
        </Map>
        <GpsButton />
      </APIProvider>
      {showDrivers && <DriverCountChip count={count} />}
    </div>
  );
};

// ---------------- MAIN HOME (mobile-first with desktop split-panel) ----------------
export const ExpressHome = () => {
  const isMobile = useIsMobile();
  return isMobile ? <ExpressHomeMobile /> : <ExpressDesktopHome />;
};

const ExpressHomeMobile = () => {
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language === "en" ? "en" : "fr";
  const sections = useSendHomepage();
  const navigate = useNavigate();
  const { openAddressSelector, activeAddress, country } = useApp();
  const { setDraft } = useExpressBooking();

  return (
    <div className="min-h-screen bg-background pb-28">
      <ExpressTopBar />
      {sections === null && (
        <div className="px-4 mt-3 space-y-3" data-testid="send-cms-loading">
          <div className="h-64 rounded-3xl bg-secondary/50 animate-pulse" />
          <div className="h-14 rounded-2xl bg-secondary/50 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-52 rounded-2xl bg-secondary/50 animate-pulse" />)}</div>
        </div>
      )}
      {(sections || []).map((sec) => {
        const c = sec.config || {};
        if (sec.section_type === "send_map_hero") return <div key={sec.id} data-testid="send-cms-map"><MapHero showDrivers={c.show_drivers !== false} /></div>;
        if (sec.section_type === "send_pickup_bar") return (
          <section key={sec.id} className="px-4 mt-3" data-testid="send-cms-pickup">
            <div className="rounded-2xl flex items-center gap-2 pl-3 pr-2 h-14 border border-border bg-card">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: YELLOW_TINT }}><Search size={14} color={YELLOW} /></div>
              <button
                data-testid="exp-home-pickup"
                onClick={() => openAddressSelector({ title: t("send.pickup_title"), onPick: (a) => setDraft({ pickup: a }) })}
                className="flex-1 text-left text-sm text-foreground/90 truncate"
              >
                {activeAddress ? activeAddress.formatted_address : cmsText(c, "placeholder", lang)}
              </button>
              <button
                data-testid="exp-home-add-stop"
                onClick={() => navigate("/send/book/location")}
                className="h-10 pl-3 pr-4 rounded-full flex items-center gap-1.5 text-sm font-semibold border border-border text-foreground"
              >
                <Plus size={14} color={YELLOW} /> {cmsText(c, "add_stop_label", lang)}
              </button>
            </div>
          </section>
        );
        if (sec.section_type === "send_service_tiles") return <SendServiceTiles key={sec.id} layout="mobile" section={sec} />;
        if (sec.section_type === "send_trust_banner") return (
          <section key={sec.id} className="px-4 mt-4" data-testid="send-cms-trust">
            <div className="rounded-2xl p-3 flex items-center gap-3 border border-border bg-card">
              <Sparkles size={16} color={YELLOW} />
              <div className="text-[0.75rem] font-normal text-foreground opacity-70">{cmsText(c, "text", lang)}</div>
            </div>
          </section>
        );
        return null;
      })}
    </div>
  );
};

// ---------------- VEHICLE CARD — image-first, minimal (180px wide) ----------------
const VehicleCard = ({ v, money, onClick, testid }) => {
  const { t } = useTranslation("customer");
  const label = v.code === "bike" ? t("send.vehicle_bike")
              : v.code === "three_wheeler" ? t("send.vehicle_three_wheeler")
              : v.code === "mini_truck" ? t("send.vehicle_mini_truck")
              : v.code === "truck" ? t("send.vehicle_truck")
              : v.name;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="snap-start shrink-0 min-w-[180px] max-w-[180px] rounded-2xl overflow-hidden text-left motion-fast active:scale-[0.98] flex flex-col border border-border bg-card"
    >
      <div className="h-40 relative flex items-center justify-center px-2 pt-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}22, transparent 65%)` }}>
        <img
          src={vehicleImage(v.code)}
          alt={label}
          className="max-h-36 max-w-full w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
          loading="lazy"
        />
      </div>
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-center gap-1.5 text-foreground text-[0.9rem] font-semibold leading-tight">
          <span className="truncate">{t("send.send_by", { vehicle: label })}</span>
          <ArrowRight size={13} color={YELLOW} className="shrink-0" strokeWidth={2.5} />
        </div>
        <div className="text-[0.75rem] font-normal text-muted-foreground mt-1">{t("send.from_price", { price: money(v.base_price) })}</div>
      </div>
    </button>
  );
};

// ---------------- SERVICE CARD — branded artwork ----------------
const ServiceCard = ({ testid, title, subtitle, image, onClick }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className="rounded-2xl overflow-hidden text-left flex flex-col motion-fast active:scale-[0.98] border border-border bg-card"
  >
    <div className="h-28 relative flex items-center justify-center px-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}1E, transparent 70%)` }}>
      <img src={image} alt={title} className="max-h-24 max-w-full w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" loading="lazy" />
    </div>
    <div className="px-3 pt-2 pb-3">
      <div className="flex items-center gap-1.5 text-foreground text-[0.9rem] font-semibold leading-tight">
        <span className="truncate">{title}</span>
        <ArrowRight size={13} color={YELLOW} className="shrink-0" strokeWidth={2.5} />
      </div>
      <div className="text-[0.75rem] font-normal text-muted-foreground mt-1">{subtitle}</div>
    </div>
  </button>
);

// =====================================================================
// DESKTOP / TABLET LAYOUT — 45/55 split with a persistent right-hand map
//
// The global BAKĒD navigation (MART / FOOD / SHOP / EXPRESS / AUTO / IMMO)
// is rendered by <ModuleTabs /> inside DesktopCustomerShell. This page must
// NOT render its own module tab strip — it caused a duplicate nav row.
// =====================================================================

const ExpressDesktopHome = () => {
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language === "en" ? "en" : "fr";
  const sections = useSendHomepage();
  const mapSection = (sections || []).find((x) => x.section_type === "send_map_hero");
  const navigate = useNavigate();
  const { country, activeAddress, openAddressSelector } = useApp();
  const { setDraft } = useExpressBooking();
  const address = activeAddress?.formatted_address || COUNTRY_CENTER[country?.code || "CI"].label;
  const eta = country?.delivery_eta_min || "10-15 min";

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">
      {/* 45/55 split — left workflow, right map */}
      <div className={`flex-1 max-w-[1600px] mx-auto w-full px-6 py-6 grid grid-cols-1 ${mapSection || sections === null ? "md:grid-cols-[45%_1fr]" : ""} gap-6`}>
        {/* LEFT PANEL — theme-adaptive card surface */}
        <div className="exp-dt-panel rounded-3xl p-6 md:p-7 flex flex-col gap-5 border border-border">
          {/* Section 1 — Clean header: EXPRESSbakēd logo + delivery location + ETA badge (nothing else) */}
          <div>
            <span data-testid="exp-dt-wordmark" className="inline-flex items-center">
              <BrandedModuleLabel code="express" label="SEND" color={YELLOW} height={36} />
            </span>
            <button data-testid="exp-dt-address" onClick={openAddressSelector} className="mt-4 flex items-start gap-2 text-left w-full">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW_TINT }}>
                <MapPin size={14} color={YELLOW} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground truncate flex items-center gap-1">{address}<ChevronDown size={12} className="text-muted-foreground" /></div>
                <div className="text-[0.75rem] font-normal text-muted-foreground">{t("send.delivering_to_you")} <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-1" style={{ backgroundColor: YELLOW, color: "#0a0a0a" }}>{eta}</span></div>
              </div>
            </button>
          </div>

          {/* CMS-managed left-panel sections (pickup bar is mobile-only; the map lives in the right panel) */}
          {(sections || []).map((sec) => {
            if (sec.section_type === "send_service_tiles") return <SendServiceTiles key={sec.id} layout="desktop" section={sec} />;
            if (sec.section_type === "send_trust_banner") return (
              <div key={sec.id} data-testid="send-cms-trust" className="exp-dt-tile rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-border">
                <ShieldCheck size={14} color={YELLOW} />
                <div className="text-[0.75rem] font-normal text-muted-foreground">{cmsText(sec.config, "text", lang)}</div>
              </div>
            );
            return null;
          })}
        </div>

        {/* RIGHT PANEL — persistent map (CMS send_map_hero) */}
        {mapSection && (
          <div className="exp-dt-panel rounded-3xl overflow-hidden relative min-h-[560px] border border-border" data-testid="send-cms-map">
            <DesktopMapHero showDrivers={mapSection.config?.show_drivers !== false} />
          </div>
        )}
      </div>
    </div>
  );
};

const DesktopVehicleCard = ({ v, money, onClick, testid }) => {
  const { t } = useTranslation("customer");
  const label = v.code === "bike" ? t("send.vehicle_bike")
              : v.code === "three_wheeler" ? t("send.vehicle_three_wheeler")
              : v.code === "mini_truck" ? t("send.vehicle_mini_truck")
              : v.code === "truck" ? t("send.vehicle_truck")
              : v.name;
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="exp-dt-tile rounded-2xl overflow-hidden text-left flex flex-col motion-fast active:scale-[0.98] border border-border"
    >
      <div className="h-32 relative flex items-center justify-center px-2" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}22, transparent 65%)` }}>
        <img src={vehicleImage(v.code)} alt={label} className="max-h-28 max-w-full w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]" loading="lazy" />
      </div>
      <div className="px-3 pt-2 pb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[0.85rem] font-semibold text-foreground leading-tight truncate">{t("send.send_by", { vehicle: label })}</div>
          <div className="text-[0.7rem] font-normal text-muted-foreground mt-0.5">{t("send.from_price", { price: money(v.base_price) })}</div>
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
    className="exp-dt-tile rounded-2xl overflow-hidden text-left flex items-center gap-3 p-3 motion-fast active:scale-[0.99] border border-border"
  >
    <div className="w-24 h-24 shrink-0 flex items-center justify-center rounded-xl" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}1E, transparent 70%)` }}>
      <img src={image} alt={title} className="max-h-20 max-w-full w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]" loading="lazy" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[0.9rem] font-semibold text-foreground leading-tight">{title}</div>
      <div className="text-[0.72rem] font-normal text-muted-foreground mt-1 leading-snug">{subtitle}</div>
    </div>
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: YELLOW }}>
      <ArrowRight size={13} color="#0a0a0a" strokeWidth={2.5} />
    </div>
  </button>
);

// Larger map re-using the existing dark style + driver markers, sized to fill the right panel.
const DesktopMapHero = ({ showDrivers = true }) => {
  const { country, activeAddress } = useApp();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const center = COUNTRY_CENTER[country?.code || "CI"];
  const [userPos, setUserPos] = useState(null);
  const origin = mapOrigin(activeAddress, userPos, center);
  const { drivers, count } = useNearbyDrivers(origin, country?.code || "CI", showDrivers);

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
        defaultCenter={origin}
        defaultZoom={13}
        mapId="baked-express-map-dt"
        gestureHandling="greedy"
        disableDefaultUI
      >
        {drivers.map((d, i) => (
          <AdvancedMarker key={`${d.lat},${d.lng},${i}`} position={{ lat: d.lat, lng: d.lng }}>
            <DriverPin kind={d.vehicle_type} />
          </AdvancedMarker>
        ))}
        <Recenter origin={origin} />
        <AdvancedMarker position={origin}>
          <UserPin />
        </AdvancedMarker>
      </Map>
      <GpsButton />
      {showDrivers && <DriverCountChip count={count} />}
    </APIProvider>
  );
};

