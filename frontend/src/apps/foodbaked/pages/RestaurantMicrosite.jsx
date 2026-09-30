/**
 * FOODbakēd — Restaurant Microsite (customer-facing).
 *
 * Route surface (mounted from App.js):
 *   /foodbaked/restaurants/:slug            → Overview
 *   /foodbaked/restaurants/:slug/order      → Order Online (menu + add-to-cart)
 *   /foodbaked/restaurants/:slug/menu       → Read-only menu + uploaded PDFs
 *   /foodbaked/restaurants/:slug/photos     → Gallery (masonry + lightbox)
 *   /foodbaked/restaurants/:slug/reviews    → Rating breakdown + reviews list
 *   /foodbaked/restaurants/:slug/reservations → Book a Table
 *
 * The legacy /food/r/:slug route now 301-redirects to the microsite.
 *
 * The hero + identity + sticky-tab shell is persistent; only the tab
 * content re-renders on route change. All data lives on the existing
 * global cart / auth / location — the microsite never creates its own.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, NavLink, Outlet, useNavigate, useLocation, useOutletContext } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  Star, Clock, MapPin, Share2, Heart, ChevronRight, ChevronLeft, X,
  Wifi, Utensils, Car, Accessibility, Music, Trees, Leaf, Cigarette,
  Baby, Wine, Snowflake, Phone, Mail, Calendar, ImagePlus, Loader2, ArrowLeft,
  CalendarPlus, CheckCircle2,
} from "lucide-react";
import { useApp } from "../../../contexts/BakedContexts";
import FoodRestaurantDetail from "./FoodRestaurantDetail";
import ReservationModal from "../../../components/food/ReservationModal";

const API = process.env.REACT_APP_BACKEND_URL || "";
const GREEN = "#00A651";

const HIGHLIGHT_ICONS = {
  outdoor_seating: Trees,     family_friendly: Baby,      air_conditioned: Snowflake,
  wifi: Wifi,                 parking: Car,               wheelchair_accessible: Accessibility,
  live_music: Music,          private_dining: Utensils,   rooftop: Trees,
  bar_available: Wine,        halal: Utensils,            vegetarian: Leaf,
  vegan: Leaf,                delivery: Utensils,         takeaway: Utensils,
  table_reservation: Calendar, smoking_area: Cigarette,
};
const HIGHLIGHT_LABELS = {
  outdoor_seating: { fr: "Terrasse extérieure", en: "Outdoor seating" },
  family_friendly: { fr: "Adapté aux familles", en: "Family friendly" },
  air_conditioned: { fr: "Climatisé", en: "Air conditioned" },
  wifi: { fr: "Wi-Fi", en: "Wi-Fi" }, parking: { fr: "Parking", en: "Parking" },
  wheelchair_accessible: { fr: "Accessible PMR", en: "Wheelchair accessible" },
  live_music: { fr: "Musique live", en: "Live music" },
  private_dining: { fr: "Salle privée", en: "Private dining" },
  rooftop: { fr: "Rooftop", en: "Rooftop" },
  bar_available: { fr: "Bar", en: "Bar" }, halal: { fr: "Halal", en: "Halal" },
  vegetarian: { fr: "Options végétariennes", en: "Vegetarian options" },
  vegan: { fr: "Options végan", en: "Vegan options" },
  delivery: { fr: "Livraison", en: "Delivery" },
  takeaway: { fr: "À emporter", en: "Takeaway" },
  table_reservation: { fr: "Réservation de table", en: "Table reservation" },
  smoking_area: { fr: "Zone fumeurs", en: "Smoking area" },
};

const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABELS = { mon:{fr:"Lundi",en:"Monday"}, tue:{fr:"Mardi",en:"Tuesday"}, wed:{fr:"Mercredi",en:"Wednesday"}, thu:{fr:"Jeudi",en:"Thursday"}, fri:{fr:"Vendredi",en:"Friday"}, sat:{fr:"Samedi",en:"Saturday"}, sun:{fr:"Dimanche",en:"Sunday"} };

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const useMicrosite = (slug, country) => {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data } = await axios.get(
          `${API}/api/food/restaurants/${encodeURIComponent(slug)}/microsite`,
          { params: { country: country || "CI" } },
        );
        if (!cancel) setData(data);
      } catch (e) {
        if (!cancel) setError(e.response?.data?.detail || e.message);
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [slug, country]);
  return { data, loading, error };
};

export const RestaurantMicrosite = () => {
  const { slug } = useParams();
  const { countryCode } = useApp() || {};
  const { data, loading, error } = useMicrosite(slug, countryCode);
  const { t } = useTranslation("customer");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [reserveOpen, setReserveOpen] = useState(false);

  if (loading) return <div className="baked-container py-16 text-center text-muted-foreground" data-testid="microsite-loading"><Loader2 className="inline animate-spin mr-2" size={16} /> {t("food.loading", "Loading…")}</div>;
  if (error || !data) return <div className="baked-container py-16 text-center text-muted-foreground">{t("food.not_found", "Restaurant not found.")}</div>;
  const { restaurant, photos, offers, menu_docs, reviews_summary } = data;

  return (
    <div className="pb-24 bg-background" data-testid="restaurant-microsite">
      <Hero restaurant={restaurant} photos={photos} reviews_summary={reviews_summary}
            onOpenLightbox={(i) => { setLightboxIndex(i); setLightboxOpen(true); }}
            onReserve={() => setReserveOpen(true)} />
      <StickyTabs slug={restaurant.slug} reservationsEnabled={restaurant.reservation_public} />
      <div className="baked-container mt-6" data-testid="microsite-tab-content">
        <Outlet context={{ restaurant, photos, offers, menu_docs, reviews_summary,
                            onOpenLightbox: (i) => { setLightboxIndex(i); setLightboxOpen(true); },
                            onReserve: () => setReserveOpen(true) }} />
      </div>
      {lightboxOpen && (
        <Lightbox photos={photos} startIndex={lightboxIndex} onClose={() => setLightboxOpen(false)} />
      )}
      {reserveOpen && (
        <ReservationModal restaurant={restaurant} onClose={() => setReserveOpen(false)} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hero — information header → quick actions → gallery.
//
// Reference-inspired hierarchy (not visual clone):
//   1) Restaurant identity + today's hours + price + phone   ← LEFT
//      Dining rating chip (+ delivery rating when we have it)  ← RIGHT
//   2) Quick actions: Direction · Share · Reviews · Book
//   3) Adaptive gallery grid: 1 image → single hero;
//      2-3 → symmetrical; 4+ → 65-70% main + 2x2 right side
//      with "Voir la galerie · View Gallery" overlay on the
//      final tile. Max height ~440px on desktop.
// ---------------------------------------------------------------------------

const DAY_MAP = ["mon","tue","wed","thu","fri","sat","sun"];
const _todayHours = (openingHours) => {
  const key = DAY_MAP[(new Date().getDay() + 6) % 7]; // Monday-first
  const ranges = openingHours?.[key] || [];
  return { key, ranges };
};
const _fmtRange = (r) => `${r[0]} – ${r[1]}`;

const Hero = ({ restaurant, photos, reviews_summary, onOpenLightbox, onReserve }) => {
  const nav = useNavigate();
  const { t } = useTranslation("customer");
  const { ranges: todayRanges } = _todayHours(restaurant.opening_hours);
  const isOpen = restaurant.is_open;
  const cuisines = (restaurant.cuisines || []).join(", ");

  const share = async () => {
    const shareData = { title: restaurant.name, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        // Non-blocking hint
        alert("Lien copié · Link copied");
      }
    } catch { /* user cancelled */ }
  };

  const openDirections = () => {
    const url = restaurant.latitude && restaurant.longitude
      ? `https://maps.google.com/?q=${restaurant.latitude},${restaurant.longitude}`
      : `https://maps.google.com/?q=${encodeURIComponent(restaurant.address || restaurant.name)}`;
    window.open(url, "_blank", "noopener");
  };

  const goReviews = () => nav(`/foodbaked/restaurants/${restaurant.slug}/reviews`);

  return (
    <section className="relative" data-testid="microsite-hero">
      <div className="baked-container pt-6">
        <button onClick={() => window.history.back()} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="microsite-back">
          <ArrowLeft size={12} /> {t("food.back", "Back")}
        </button>

        {/* ── INFORMATION HEADER ────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 flex-wrap" data-testid="microsite-identity">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-4xl font-bold leading-tight">{restaurant.name}</h1>
            {cuisines && <div className="text-sm text-muted-foreground mt-1">{cuisines}</div>}
            {restaurant.address && (
              <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1"><MapPin size={11} /> {restaurant.address}</div>
            )}
            {/* Status + hours + price + phone */}
            <div className="mt-3 flex items-center flex-wrap gap-x-4 gap-y-2 text-xs">
              <span className={`inline-flex items-center gap-1 h-7 px-3 rounded-full border font-semibold`}
                    style={isOpen
                      ? { borderColor: `${GREEN}55`, color: GREEN, backgroundColor: `${GREEN}12` }
                      : { borderColor: "rgba(148,163,184,0.4)", color: "rgb(148,163,184)" }}
                    data-testid="microsite-open-status">
                <Clock size={11} /> {isOpen ? t("food.open", "Open") : t("food.closed", "Closed")}
                {todayRanges.length > 0 && (
                  <span className="opacity-80 font-normal ml-1">
                    · {todayRanges.map(_fmtRange).join(" · ")}
                  </span>
                )}
              </span>
              {restaurant.price_range && (
                <span className="text-muted-foreground" data-testid="microsite-price-range">
                  <span className="font-semibold text-foreground">{restaurant.price_range}</span> · {t("food.price_for_two", "price for two")}
                </span>
              )}
              {restaurant.contact_phone && (
                <a href={`tel:${restaurant.contact_phone}`} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="microsite-phone">
                  <Phone size={11} /> {restaurant.contact_phone}
                </a>
              )}
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Utensils size={11} /> {restaurant.prep_time_min}–{restaurant.prep_time_max} min</span>
            </div>
          </div>

          {/* Ratings — dining (from reviews) + delivery (from denormalised) */}
          <div className="flex items-center gap-3 shrink-0" data-testid="microsite-ratings">
            {(reviews_summary?.count > 0) && (
              <RatingChip
                testId="microsite-dining-rating"
                value={reviews_summary.average}
                count={reviews_summary.count}
                label={t("food.ratings", "Ratings")}
              />
            )}
            {restaurant.review_count > 0 && (
              <RatingChip
                testId="microsite-delivery-rating"
                value={Number(restaurant.rating || 0)}
                count={restaurant.review_count}
                label={t("food.delivery", "Delivery")}
              />
            )}
          </div>
        </div>

        {/* ── QUICK ACTIONS ────────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap gap-2" data-testid="microsite-quick-actions">
          <QuickAction icon={MapPin}       label={t("food.direction", "Direction")}         onClick={openDirections} testId="microsite-action-direction" />
          <QuickAction icon={Share2}       label={t("food.share", "Share")}  onClick={share}          testId="microsite-action-share" />
          <QuickAction icon={Star}         label={t("food.reviews_action", "Reviews")}    onClick={goReviews}      testId="microsite-action-reviews" />
          {restaurant.reservation_public && (
            <QuickAction icon={CalendarPlus}
                         label={t("food.book_a_table", "Book a table")}
                         onClick={onReserve}
                         primary
                         testId="microsite-action-book" />
          )}
        </div>

        {/* ── ADAPTIVE GALLERY ────────────────────────────────────── */}
        <GalleryGrid restaurant={restaurant} photos={photos} onOpenLightbox={onOpenLightbox} />
      </div>
    </section>
  );
};

const RatingChip = ({ value, count, label, testId }) => (
  <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2" data-testid={testId}>
    <span className="inline-flex items-center justify-center h-9 px-2.5 rounded-lg text-sm font-bold text-black" style={{ backgroundColor: GREEN }}>
      {Number(value || 0).toFixed(1)}
      <Star size={12} className="fill-current ml-0.5" />
    </span>
    <div className="leading-tight">
      <div className="text-[13px] font-semibold">{Intl.NumberFormat().format(count)}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  </div>
);

const QuickAction = ({ icon: Icon, label, onClick, primary, testId }) => (
  <button onClick={onClick} data-testid={testId}
          className={`h-10 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition-colors ${primary ? "text-black border-transparent" : "border-border bg-card hover:bg-secondary"}`}
          style={primary ? { backgroundColor: GREEN } : undefined}>
    <Icon size={13} /> {label}
  </button>
);

// ---------------------------------------------------------------------------
// Adaptive gallery grid
//   0 images → subtle empty rail; 1 → single hero; 2 → split; 3 → 1+2 stacked;
//   4+ → 1 large + right 2×2 with View Gallery overlay on the 4th tile.
// Desktop max-height ~440px, aspect via classes; mobile → horizontally
// swipeable strip.
// ---------------------------------------------------------------------------

const GalleryGrid = ({ restaurant, photos, onOpenLightbox }) => {
  const { t } = useTranslation("customer");
  const list = photos && photos.length > 0
    ? photos
    : (restaurant.image ? [{ id: "__cover", url: restaurant.image, category: "food" }] : []);

  // Empty state
  if (list.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/50 h-[220px] md:h-[320px] flex flex-col items-center justify-center text-center px-6" data-testid="microsite-gallery-empty">
        <ImagePlus size={28} className="text-muted-foreground" />
        <div className="mt-2 text-sm font-semibold">{t("food.no_photos_title", "No photos yet")}</div>
        <div className="text-xs text-muted-foreground mt-0.5 max-w-sm">{t("food.no_photos_hint", "The restaurant hasn't uploaded photos yet.")}</div>
      </div>
    );
  }

  const cover = list.find((p) => p.is_cover) || list[0];
  const others = list.filter((p) => p.id !== cover.id);
  const total = list.length;

  // Mobile: horizontally swipeable strip.
  const mobile = (
    <div className="mt-5 md:hidden flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1" data-testid="microsite-gallery-mobile">
      {list.map((p, idx) => (
        <button key={p.id} onClick={() => onOpenLightbox(idx)}
                className="snap-start shrink-0 w-[85%] aspect-[16/10] rounded-2xl overflow-hidden bg-muted"
                data-testid={`microsite-gallery-mobile-${idx}`}>
          <img src={p.url} alt="" className="w-full h-full object-cover" loading={idx > 0 ? "lazy" : "eager"} />
        </button>
      ))}
    </div>
  );

  // Desktop layouts.
  let desktop;
  if (total === 1) {
    desktop = (
      <button onClick={() => onOpenLightbox(0)}
              className="mt-5 hidden md:block w-full h-[360px] lg:h-[440px] rounded-2xl overflow-hidden bg-muted"
              data-testid="microsite-gallery-desktop-single">
        <img src={cover.url} alt={restaurant.name} className="w-full h-full object-cover" />
      </button>
    );
  } else if (total === 2) {
    desktop = (
      <div className="mt-5 hidden md:grid grid-cols-2 gap-2 h-[360px] lg:h-[440px]" data-testid="microsite-gallery-desktop-2">
        {list.map((p, idx) => (
          <button key={p.id} onClick={() => onOpenLightbox(idx)} className="rounded-2xl overflow-hidden bg-muted">
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    );
  } else if (total === 3) {
    desktop = (
      <div className="mt-5 hidden md:grid grid-cols-3 gap-2 h-[360px] lg:h-[440px]" data-testid="microsite-gallery-desktop-3">
        <button onClick={() => onOpenLightbox(0)} className="col-span-2 row-span-2 rounded-2xl overflow-hidden bg-muted">
          <img src={cover.url} alt="" className="w-full h-full object-cover" />
        </button>
        {others.slice(0, 2).map((p) => (
          <button key={p.id} onClick={() => onOpenLightbox(list.indexOf(p))} className="rounded-2xl overflow-hidden bg-muted">
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    );
  } else {
    // 4+ images → premium reference-inspired layout.
    const right = others.slice(0, 4); // may have 4 for 5+ total
    desktop = (
      <div className="mt-5 hidden md:grid grid-cols-12 gap-2 h-[360px] lg:h-[440px]" data-testid="microsite-gallery-desktop-4plus">
        <button onClick={() => onOpenLightbox(0)}
                className="col-span-8 rounded-2xl overflow-hidden bg-muted relative motion-fast hover:opacity-95"
                data-testid="microsite-gallery-main">
          <img src={cover.url} alt={restaurant.name} className="w-full h-full object-cover" />
        </button>
        <div className="col-span-4 grid grid-cols-2 grid-rows-2 gap-2">
          {right.slice(0, 4).map((p, i) => {
            const isLast = i === 3 || (right.length < 4 && i === right.length - 1);
            const showOverlay = isLast && total > 5;
            return (
              <button key={p.id} onClick={() => onOpenLightbox(list.indexOf(p))}
                      className="relative rounded-2xl overflow-hidden bg-muted motion-fast hover:opacity-95"
                      data-testid={`microsite-gallery-tile-${i}`}>
                <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                {showOverlay && (
                  <span className="absolute inset-0 bg-black/55 text-white text-sm font-semibold flex items-center justify-center gap-2" data-testid="microsite-view-gallery-overlay">
                    <ImagePlus size={14} /> {t("food.view_gallery", "View gallery")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="microsite-gallery">
      {desktop}
      {mobile}
      {total > 1 && (
        <button onClick={() => onOpenLightbox(0)}
                className="hidden md:inline-flex mt-2 text-xs text-muted-foreground hover:text-foreground items-center gap-1"
                data-testid="microsite-view-all-photos">
          <ImagePlus size={11} /> {t("food.see_all_photos", "View all photos")} ({total})
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sticky tabs — full-width, bilingual, active underline, translate-safe.
// Sticks below the global BAKED header (top-16). Never duplicates the header
// or any global chrome.
// ---------------------------------------------------------------------------

const StickyTabs = ({ slug, reservationsEnabled }) => {
  const { t } = useTranslation("customer");
  const tabs = [
    { path: "",             label: t("food.tab_overview", "Overview") },
    { path: "order",        label: t("food.tab_order", "Order Online") },
    { path: "reviews",      label: t("food.tab_reviews", "Reviews") },
    { path: "photos",       label: t("food.tab_photos", "Photos") },
    { path: "menu",         label: t("food.tab_menu", "Menu") },
    ...(reservationsEnabled ? [{ path: "reservations", label: t("food.tab_reservations", "Book a table") }] : []),
  ];
  return (
    <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border mt-6" data-testid="microsite-tabs">
      <div className="baked-container">
        <div className="flex gap-6 md:gap-8 overflow-x-auto -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
          {tabs.map((tab) => (
            <NavLink key={tab.path || "overview"}
                     to={`/foodbaked/restaurants/${slug}${tab.path ? `/${tab.path}` : ""}`}
                     end={tab.path === ""}
                     className={({ isActive }) =>
                       `relative py-3 whitespace-nowrap text-sm font-semibold motion-fast ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                     }
                     data-testid={`microsite-tab-${tab.path || "overview"}`}>
              {({ isActive }) => (
                <>
                  <span>{tab.label}</span>
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full" style={{ backgroundColor: GREEN }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

const Lightbox = ({ photos, startIndex, onClose }) => {
  const [idx, setIdx] = useState(startIndex);
  const [cat, setCat] = useState("all");
  const list = useMemo(() => (cat === "all" ? photos : photos.filter((p) => p.category === cat)), [photos, cat]);
  const cur = list[Math.min(idx, list.length - 1)] || photos[0];
  const next = () => setIdx((i) => (i + 1) % list.length);
  const prev = () => setIdx((i) => (i - 1 + list.length) % list.length);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const categories = ["all", "food", "ambience", "interior", "exterior", "menu"];
  return (
    <div className="fixed inset-0 z-[130] bg-black/95 flex flex-col" data-testid="microsite-lightbox">
      <div className="flex items-center gap-2 p-3">
        <div className="flex gap-1 overflow-x-auto">
          {categories.map((c) => (
            <button key={c} onClick={() => { setCat(c); setIdx(0); }}
                    className={`h-8 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap ${cat === c ? "text-black" : "text-white/60 hover:text-white"}`}
                    style={cat === c ? { backgroundColor: GREEN } : { backgroundColor: "rgba(255,255,255,0.1)" }}
                    data-testid={`microsite-lightbox-cat-${c}`}>{c}</button>
          ))}
        </div>
        <div className="ml-auto text-xs text-white/60 font-mono">{list.length ? `${idx + 1} / ${list.length}` : "0 / 0"}</div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" data-testid="microsite-lightbox-close"><X size={16} /></button>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {list.length === 0 ? (
          <div className="text-white/50 text-sm">Aucune photo · No photos</div>
        ) : (
          <>
            <button onClick={prev} className="absolute left-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" data-testid="microsite-lightbox-prev"><ChevronLeft size={20} /></button>
            <img src={cur.url} alt="" className="max-h-[80vh] max-w-full object-contain rounded" />
            <button onClick={next} className="absolute right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" data-testid="microsite-lightbox-next"><ChevronRight size={20} /></button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

export const RestaurantOverview = () => {
  const { restaurant, offers, reviews_summary, onOpenLightbox, onReserve } = useOutlet();
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";
  const highlights = restaurant.highlights || [];
  const hoursMap = restaurant.opening_hours || {};
  const todayKey = DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  return (
    <div className="space-y-8" data-testid="microsite-overview">
      {/* Highlights */}
      {highlights.length > 0 && (
        <section data-testid="microsite-overview-highlights">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.highlights", "Highlights")}</h2>
          <div className="flex flex-wrap gap-2">
            {highlights.map((code) => {
              const Icon = HIGHLIGHT_ICONS[code] || Utensils;
              const lbl = HIGHLIGHT_LABELS[code] || { fr: code, en: code };
              return (
                <span key={code} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs" data-testid={`microsite-highlight-${code}`}>
                  <Icon size={12} style={{ color: GREEN }} /> {lbl[lang]}
                </span>
              );
            })}
          </div>
        </section>
      )}
      {/* Offers */}
      {offers?.length > 0 && (
        <section data-testid="microsite-overview-offers">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.offers", "Offers")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {offers.map((o) => (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`microsite-offer-${o.id}`}>
                <div className="text-lg font-bold" style={{ color: GREEN }}>{o[`title_${lang}`] || o.title_fr}</div>
                <div className="text-xs text-muted-foreground mt-1">{o[`description_${lang}`] || o.description_fr || ""}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-2">
                  {o.discount_type === "percent" && `${o.discount_value}% OFF`}
                  {o.discount_type === "flat" && `-${o.discount_value}`}
                  {o.discount_type === "free_delivery" && "FREE DELIVERY"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* About */}
      {restaurant.description && (
        <section data-testid="microsite-overview-about">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.about", "About")}</h2>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{restaurant.description}</p>
        </section>
      )}
      {/* Cuisines */}
      <section data-testid="microsite-overview-cuisines">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.cuisines", "Cuisines")}</h2>
        <div className="flex flex-wrap gap-2">
          {(restaurant.cuisines || []).map((c) => (
            <span key={c} className="inline-flex text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>{c}</span>
          ))}
          {(!restaurant.cuisines || restaurant.cuisines.length === 0) && <span className="text-xs text-muted-foreground italic">—</span>}
        </div>
      </section>
      {/* Opening hours */}
      <section data-testid="microsite-overview-hours">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.hours", "Opening hours")}</h2>
        <div className="rounded-2xl border border-border bg-card p-4 max-w-md">
          {DAY_KEYS.map((k) => {
            const ranges = hoursMap[k] || [];
            const isToday = k === todayKey;
            return (
              <div key={k} className={`flex items-center justify-between py-1.5 text-sm ${isToday ? "font-bold" : "text-muted-foreground"}`} data-testid={`microsite-hours-${k}`}>
                <span>{DAY_LABELS[k].fr} · {DAY_LABELS[k].en}</span>
                <span className="font-mono text-xs">
                  {ranges.length === 0 ? "Fermé · Closed" : ranges.map((r) => `${r[0]}–${r[1]}`).join(" · ")}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {/* Location */}
      {restaurant.address && (
        <section data-testid="microsite-overview-location">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.address", "Address")}</h2>
          <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3 max-w-md">
            <MapPin size={18} className="text-muted-foreground mt-0.5" />
            <div>
              <div className="text-sm font-semibold">{restaurant.address}</div>
              <div className="flex gap-2 mt-2">
                <a href={restaurant.latitude && restaurant.longitude ? `https://maps.google.com/?q=${restaurant.latitude},${restaurant.longitude}` : `https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`}
                   target="_blank" rel="noreferrer" className="h-7 px-3 rounded-lg text-[11px] font-semibold text-black" style={{ backgroundColor: GREEN }} data-testid="microsite-directions">
                  {t("food.directions", "Directions")}
                </a>
                <button onClick={() => navigator.clipboard?.writeText(restaurant.address)} className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-secondary" data-testid="microsite-copy-address">{t("food.copy", "Copy")}</button>
              </div>
            </div>
          </div>
        </section>
      )}
      {/* Reviews teaser */}
      <section data-testid="microsite-overview-reviews">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t("food.tab_reviews", "Reviews")}</h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          {reviews_summary.count === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("food.no_reviews", "No reviews yet — order and leave the first review!")}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <RatingBreakdown summary={reviews_summary} />
              <div className="space-y-2">
                {reviews_summary.recent.slice(0, 2).map((r) => (
                  <div key={r.id} className="text-xs" data-testid={`microsite-overview-review-${r.id}`}>
                    <div className="font-semibold">{r.customer?.name || "Anonyme"} · ★ {r.rating}</div>
                    <div className="text-muted-foreground line-clamp-3">{r.text || ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      {/* Reservation teaser */}
      {restaurant.reservation_public && (
        <section data-testid="microsite-overview-reserve">
          <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-bold">{t("food.reserve", "Book a table")}</div>
              <div className="text-sm text-muted-foreground">{t("food.reserve_hint", "Pick a date, time and party size.")}</div>
            </div>
            <button onClick={onReserve} className="h-10 px-5 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
                    style={{ backgroundColor: GREEN }} data-testid="microsite-overview-reserve-btn">
              <CalendarPlus size={14} /> {t("food.book", "Book")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

const RatingBreakdown = ({ summary }) => (
  <div className="space-y-1" data-testid="microsite-rating-breakdown">
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold" style={{ color: GREEN }}>{summary.average.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">/ 5 · {summary.count} avis</span>
    </div>
    {[5,4,3,2,1].map((r) => {
      const n = summary.distribution[r] || 0;
      const pct = summary.count > 0 ? Math.round((n / summary.count) * 100) : 0;
      return (
        <div key={r} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-4 text-right">{r} ★</span>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: GREEN }} />
          </div>
          <span className="w-8 text-right font-mono">{pct}%</span>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Tab: Order Online (delegates to existing FoodRestaurantDetail component,
// which already implements the menu + item modal + add-to-cart flow. The
// microsite hero already renders — we hide FoodRestaurantDetail's own hero
// by rendering it into a wrapper that scopes the DOM.
// ---------------------------------------------------------------------------

export const RestaurantOrderTab = () => (
  <div data-testid="microsite-order-tab" className="[&_[data-testid='food-restaurant-detail']>section:first-child]:hidden">
    <FoodRestaurantDetail />
  </div>
);

// ---------------------------------------------------------------------------
// Tab: Menu (read-only + PDFs)
// ---------------------------------------------------------------------------

export const RestaurantMenuTab = () => {
  const { restaurant, menu_docs } = useOutlet();
  const { t } = useTranslation("customer");
  const [menu, setMenu] = useState(null);
  const { countryCode } = useApp() || {};
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/food/restaurants/${encodeURIComponent(restaurant.slug)}/menu`, { params: { country: countryCode || "CI" } });
        if (!cancel) setMenu(data);
      } catch {}
    })();
    return () => { cancel = true; };
  }, [restaurant.slug, countryCode]);
  return (
    <div className="space-y-6" data-testid="microsite-menu-tab">
      {menu_docs?.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("food.downloadable_menus", "Downloadable menus")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {menu_docs.map((d) => (
              <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-border bg-card p-4 hover:bg-secondary" data-testid={`microsite-menudoc-${d.id}`}>
                <div className="text-sm font-semibold">{d.label_fr}</div>
                <div className="text-xs text-muted-foreground">{d.label_en}</div>
                <div className="text-[10px] text-muted-foreground mt-1">Voir · View →</div>
              </a>
            ))}
          </div>
        </section>
      )}
      {menu?.sections?.map((s) => (
        <section key={s.id} data-testid={`microsite-menu-section-${s.id}`}>
          <h2 className="text-lg font-bold mb-2">{s.name_fr || s.name_en}</h2>
          <div className="divide-y divide-border">
            {s.items.map((it) => (
              <div key={it.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{it.name}</div>
                  {it.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{it.description}</div>}
                </div>
                <div className="text-sm font-bold shrink-0">{Math.round(Number(it.base_price))} {it.currency}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {(!menu || (menu.sections || []).length === 0) && (
        <div className="text-sm text-muted-foreground italic">{t("food.menu_coming_soon", "Menu coming soon.")}</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Photos
// ---------------------------------------------------------------------------

export const RestaurantPhotosTab = () => {
  const { photos, onOpenLightbox } = useOutlet();
  const { t } = useTranslation("customer");
  const [cat, setCat] = useState("all");
  const filtered = cat === "all" ? photos : photos.filter((p) => p.category === cat);
  const cats = ["all", "food", "ambience", "interior", "exterior", "menu"];
  return (
    <div className="space-y-4" data-testid="microsite-photos-tab">
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)}
                  className={`h-8 px-3 rounded-full text-[11px] font-semibold ${cat === c ? "text-black" : "bg-secondary text-muted-foreground"}`}
                  style={cat === c ? { backgroundColor: GREEN } : undefined}
                  data-testid={`microsite-photos-cat-${c}`}>{c}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground" data-testid="microsite-photos-empty">
          {t("food.no_photos_category", "No photos in this category.")}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => onOpenLightbox(photos.indexOf(p))}
                    className="aspect-square rounded-xl overflow-hidden bg-muted motion-fast hover:opacity-90"
                    data-testid={`microsite-photo-${p.id}`}>
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Reviews (stub with breakdown + list)
// ---------------------------------------------------------------------------

export const RestaurantReviewsTab = () => {
  const { restaurant, reviews_summary } = useOutlet();
  const { t, i18n } = useTranslation("customer");
  const [reviews, setReviews] = useState(null);
  const [summary, setSummary] = useState(reviews_summary);
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const isFr = (i18n?.language || "fr").toLowerCase().startsWith("fr");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        const url = `${process.env.REACT_APP_BACKEND_URL || ""}/api/food/restaurants/${restaurant.slug}/reviews?sort=${sort}&size=20&country=${encodeURIComponent(restaurant.country || "CI")}`;
        const res = await fetch(url);
        const d = await res.json();
        if (!cancelled) { setReviews(d.reviews || []); setSummary(d.summary || reviews_summary); }
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [restaurant.slug, restaurant.country, sort, reviews_summary]);

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(isFr ? "fr-FR" : "en-US", { day: "2-digit", month: "short", year: "numeric" }) : "";

  return (
    <div className="space-y-6" data-testid="microsite-reviews-tab">
      <div className="rounded-2xl border border-border bg-card p-5 max-w-lg">
        <RatingBreakdown summary={summary} />
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="microsite-reviews-sort">
        {[
          { k: "recent", fr: "Plus récents", en: "Most recent" },
          { k: "top",    fr: "Meilleures notes", en: "Highest rated" },
          { k: "low",    fr: "Notes les plus basses", en: "Lowest rated" },
        ].map((o) => (
          <button key={o.k} onClick={() => setSort(o.k)}
                  className={`text-xs h-8 px-3 rounded-full font-semibold ${sort === o.k ? "text-black" : "text-muted-foreground bg-secondary hover:bg-secondary/80"}`}
                  style={sort === o.k ? { backgroundColor: GREEN } : undefined}
                  data-testid={`microsite-reviews-sort-${o.k}`}>
            {isFr ? o.fr : o.en}
          </button>
        ))}
      </div>

      {err && <div className="text-xs text-red-500">{err}</div>}

      {loading && reviews === null ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> …</div>
      ) : (reviews || []).length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground" data-testid="microsite-reviews-empty">
          {t("food.no_reviews", "No reviews yet — order and leave the first review!")}
        </div>
      ) : (
        <div className="space-y-3" data-testid="microsite-reviews-list">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`microsite-review-${r.id}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-sm">{r.author}</div>
                  {(r.verified_order || r.verified_visit) && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                          style={{ backgroundColor: `${GREEN}22`, color: GREEN }}
                          data-testid={`microsite-review-verified-${r.id}`}>
                      <CheckCircle2 size={10} /> {r.verified_order ? (isFr ? "Commande vérifiée" : "Verified order") : (isFr ? "Visite vérifiée" : "Verified visit")}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{fmtDate(r.created_at)}</span>
                </div>
                <div className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#f59e0b" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={12} fill={i < r.rating ? "#f59e0b" : "none"} stroke={i < r.rating ? "#f59e0b" : "#a1a1aa"} />
                  ))}
                </div>
              </div>
              {r.text && <div className="text-sm text-foreground/90 mt-2">{r.text}</div>}
              {r.partner_response && (
                <div className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs">
                  <div className="font-semibold" style={{ color: GREEN }}>{isFr ? "Réponse du restaurant" : "Response from the restaurant"}</div>
                  <div className="text-muted-foreground mt-0.5">{r.partner_response}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Reservations (redirects to modal + inline form)
// ---------------------------------------------------------------------------

export const RestaurantReservationsTab = () => {
  const { restaurant, onReserve } = useOutlet();
  const { t } = useTranslation("customer");
  if (!restaurant.reservation_public) {
    return <div className="text-sm text-muted-foreground italic">{t("food.reserve_reservations_unavailable", "Reservations unavailable.")}</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4" data-testid="microsite-reservations-tab">
      <CalendarPlus size={40} className="mx-auto" style={{ color: GREEN }} />
      <div>
        <h2 className="text-xl font-bold">{t("food.book_a_table", "Book a table")}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{t("food.reserve_cta_body", "Pick a date, time and party size — the restaurant confirms shortly.")}</p>
      </div>
      <button onClick={onReserve} className="h-11 px-6 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
              style={{ backgroundColor: GREEN }} data-testid="microsite-reservations-cta">
        <CalendarPlus size={14} /> {t("food.reserve_book_now", "Book now")}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Legacy redirect: /food/r/:slug → /foodbaked/restaurants/:slug
// ---------------------------------------------------------------------------

export const LegacyDetailRedirect = () => {
  const { slug } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    // Preserve any trailing sub-path if the user pastes one (unlikely).
    const target = `/foodbaked/restaurants/${slug}${loc.search || ""}`;
    nav(target, { replace: true });
  }, [slug, nav, loc.search]);
  return <div className="baked-container py-16 text-center text-muted-foreground">Redirection…</div>;
};

// ---------------------------------------------------------------------------
// helper — access the shell context
// ---------------------------------------------------------------------------

const useOutlet = () => useOutletContext();

export default RestaurantMicrosite;
