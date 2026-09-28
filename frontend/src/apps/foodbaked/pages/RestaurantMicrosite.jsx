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
  CalendarPlus,
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [reserveOpen, setReserveOpen] = useState(false);

  if (loading) return <div className="baked-container py-16 text-center text-muted-foreground" data-testid="microsite-loading"><Loader2 className="inline animate-spin mr-2" size={16} /> Chargement · Loading…</div>;
  if (error || !data) return <div className="baked-container py-16 text-center text-muted-foreground">Restaurant introuvable · Restaurant not found.</div>;
  const { restaurant, photos, offers, menu_docs, reviews_summary } = data;

  return (
    <div className="pb-24 bg-background" data-testid="restaurant-microsite">
      <Hero restaurant={restaurant} photos={photos}
            onOpenLightbox={(i) => { setLightboxIndex(i); setLightboxOpen(true); }}
            onReserve={() => setReserveOpen(true)} />
      <StickyTabs slug={restaurant.slug} reservationsEnabled={restaurant.reservations_enabled} />
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
// Hero + gallery
// ---------------------------------------------------------------------------

const Hero = ({ restaurant, photos, onOpenLightbox, onReserve }) => {
  const cover = photos.find((p) => p.is_cover) || photos[0];
  const heroImg = cover?.url || restaurant.image;
  const thumbs = photos.filter((p) => p.id !== cover?.id).slice(0, 4);
  return (
    <section className="relative" data-testid="microsite-hero">
      <div className="baked-container pt-6">
        <button onClick={() => window.history.back()} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="microsite-back">
          <ArrowLeft size={12} /> Retour · Back
        </button>
        <div className="grid gap-3 md:grid-cols-4 relative">
          <div className="md:col-span-3 aspect-[16/8] md:aspect-[16/9] rounded-2xl overflow-hidden bg-muted">
            {heroImg
              ? <img src={heroImg} alt={restaurant.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImagePlus size={40} /></div>}
          </div>
          <div className="md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-2">
            {[0,1,2,3].map((i) => {
              const p = thumbs[i];
              return (
                <button key={i} onClick={() => p && onOpenLightbox(photos.indexOf(p))}
                        className="aspect-video md:aspect-[4/3] rounded-xl overflow-hidden bg-muted relative motion-fast hover:opacity-90"
                        data-testid={`microsite-hero-thumb-${i}`}>
                  {p ? <img src={p.url} alt="" className="w-full h-full object-cover" />
                     : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImagePlus size={20} /></div>}
                </button>
              );
            })}
          </div>
          {photos.length > 0 && (
            <button onClick={() => onOpenLightbox(0)}
                    className="absolute bottom-3 right-3 h-9 px-3 rounded-full bg-black/70 text-white text-xs font-semibold inline-flex items-center gap-1"
                    data-testid="microsite-view-all-photos">
              <ImagePlus size={12} /> Voir toutes les photos · View all photos ({photos.length})
            </button>
          )}
        </div>
      </div>
      <RestaurantIdentity restaurant={restaurant} reviews={{ average: 0, count: 0 }} onReserve={onReserve} />
    </section>
  );
};

const RestaurantIdentity = ({ restaurant, onReserve }) => {
  return (
    <div className="baked-container mt-4" data-testid="microsite-identity">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">{restaurant.name}</h1>
          <div className="text-sm text-muted-foreground">{(restaurant.cuisines || []).join(" • ")}{restaurant.price_range && ` • ${restaurant.price_range}`}</div>
          <div className="mt-2 flex items-center flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star size={14} className="fill-current" style={{ color: GREEN }} />
              {Number(restaurant.rating || 0).toFixed(1)}
              <span className="text-muted-foreground">({restaurant.review_count})</span>
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock size={13} /> {restaurant.prep_time_min}–{restaurant.prep_time_max} min</span>
            {restaurant.address && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin size={13} /> {restaurant.address}</span>}
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${restaurant.is_open ? "text-black" : "bg-secondary text-muted-foreground"}`}
                  style={restaurant.is_open ? { backgroundColor: `${GREEN}33`, color: GREEN } : {}}>
              {restaurant.is_open ? "OPEN" : "CLOSED"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigator.share?.({ title: restaurant.name, url: window.location.href })}
                  className="h-9 px-3 rounded-full bg-card border border-border text-xs inline-flex items-center gap-1"
                  data-testid="microsite-share"><Share2 size={12} /> Partager</button>
          <button className="h-9 px-3 rounded-full bg-card border border-border text-xs inline-flex items-center gap-1" data-testid="microsite-save">
            <Heart size={12} /> Enregistrer
          </button>
          {restaurant.reservations_enabled && (
            <button onClick={onReserve} className="h-9 px-3 rounded-full text-black text-xs font-semibold inline-flex items-center gap-1"
                    style={{ backgroundColor: GREEN }} data-testid="microsite-reserve-cta">
              <CalendarPlus size={12} /> Réserver · Book
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sticky tabs
// ---------------------------------------------------------------------------

const StickyTabs = ({ slug, reservationsEnabled }) => {
  const tabs = [
    { path: "",            label: "Aperçu · Overview" },
    { path: "order",       label: "Commander · Order" },
    { path: "menu",        label: "Menu" },
    { path: "photos",      label: "Photos" },
    { path: "reviews",     label: "Avis · Reviews" },
    ...(reservationsEnabled ? [{ path: "reservations", label: "Réserver · Book" }] : []),
  ];
  return (
    <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border" data-testid="microsite-tabs">
      <div className="baked-container overflow-x-auto -mx-2 px-2">
        <div className="flex gap-1 py-2 min-w-max">
          {tabs.map((t) => (
            <NavLink key={t.path || "overview"}
                     to={`/foodbaked/restaurants/${slug}${t.path ? `/${t.path}` : ""}`}
                     end={t.path === ""}
                     className={({ isActive }) => `h-9 px-4 rounded-full text-xs font-semibold whitespace-nowrap motion-fast ${isActive ? "text-black" : "bg-card text-foreground border border-border hover:bg-secondary"}`}
                     style={({ isActive }) => (isActive ? { backgroundColor: GREEN } : {})}
                     data-testid={`microsite-tab-${t.path || "overview"}`}>
              {t.label}
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
  const { i18n } = useTranslation("customer");
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";
  const highlights = restaurant.highlights || [];
  const hoursMap = restaurant.opening_hours || {};
  const todayKey = DAY_KEYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  return (
    <div className="space-y-8" data-testid="microsite-overview">
      {/* Highlights */}
      {highlights.length > 0 && (
        <section data-testid="microsite-overview-highlights">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Points forts · Highlights</h2>
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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Offres · Offers</h2>
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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">À propos · About</h2>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{restaurant.description}</p>
        </section>
      )}
      {/* Cuisines */}
      <section data-testid="microsite-overview-cuisines">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Cuisines · Cuisines</h2>
        <div className="flex flex-wrap gap-2">
          {(restaurant.cuisines || []).map((c) => (
            <span key={c} className="inline-flex text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${GREEN}22`, color: GREEN }}>{c}</span>
          ))}
          {(!restaurant.cuisines || restaurant.cuisines.length === 0) && <span className="text-xs text-muted-foreground italic">—</span>}
        </div>
      </section>
      {/* Opening hours */}
      <section data-testid="microsite-overview-hours">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Horaires · Opening hours</h2>
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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Adresse · Address</h2>
          <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3 max-w-md">
            <MapPin size={18} className="text-muted-foreground mt-0.5" />
            <div>
              <div className="text-sm font-semibold">{restaurant.address}</div>
              <div className="flex gap-2 mt-2">
                <a href={restaurant.latitude && restaurant.longitude ? `https://maps.google.com/?q=${restaurant.latitude},${restaurant.longitude}` : `https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`}
                   target="_blank" rel="noreferrer" className="h-7 px-3 rounded-lg text-[11px] font-semibold text-black" style={{ backgroundColor: GREEN }} data-testid="microsite-directions">
                  Directions
                </a>
                <button onClick={() => navigator.clipboard?.writeText(restaurant.address)} className="h-7 px-3 rounded-lg text-[11px] font-semibold bg-secondary" data-testid="microsite-copy-address">Copier · Copy</button>
              </div>
            </div>
          </div>
        </section>
      )}
      {/* Reviews teaser */}
      <section data-testid="microsite-overview-reviews">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Avis · Reviews</h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          {reviews_summary.count === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Aucun avis pour l'instant · No reviews yet. Soyez le premier à commander et à laisser un avis.
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
      {restaurant.reservations_enabled && (
        <section data-testid="microsite-overview-reserve">
          <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-bold">Réserver une table · Book a table</div>
              <div className="text-sm text-muted-foreground">Choisissez date, heure et nombre d'invités. · Pick a date, time and party size.</div>
            </div>
            <button onClick={onReserve} className="h-10 px-5 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
                    style={{ backgroundColor: GREEN }} data-testid="microsite-overview-reserve-btn">
              <CalendarPlus size={14} /> Réserver
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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Menus téléchargeables · Downloadable menus</h2>
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
        <div className="text-sm text-muted-foreground italic">Menu à venir · Menu coming soon.</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Photos
// ---------------------------------------------------------------------------

export const RestaurantPhotosTab = () => {
  const { photos, onOpenLightbox } = useOutlet();
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
          Aucune photo pour cette catégorie · No photos in this category.
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
  const { reviews_summary } = useOutlet();
  return (
    <div className="space-y-6" data-testid="microsite-reviews-tab">
      <div className="rounded-2xl border border-border bg-card p-5 max-w-lg">
        <RatingBreakdown summary={reviews_summary} />
      </div>
      {reviews_summary.count === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground" data-testid="microsite-reviews-empty">
          Aucun avis pour l'instant. Commandez ici et déposez le premier avis ! · No reviews yet — order and leave the first review!
        </div>
      ) : (
        <div className="space-y-3">
          {reviews_summary.recent.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`microsite-review-${r.id}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{r.customer?.name || "Anonyme"}</div>
                <div className="text-xs" style={{ color: GREEN }}>★ {r.rating}</div>
              </div>
              <div className="text-sm text-foreground/90 mt-1">{r.text}</div>
              {r.partner_response && (
                <div className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs">
                  <div className="font-semibold" style={{ color: GREEN }}>Réponse du restaurant · Response</div>
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
  if (!restaurant.reservations_enabled) {
    return <div className="text-sm text-muted-foreground italic">Réservations non disponibles · Reservations unavailable.</div>;
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4" data-testid="microsite-reservations-tab">
      <CalendarPlus size={40} className="mx-auto" style={{ color: GREEN }} />
      <div>
        <h2 className="text-xl font-bold">Réserver une table · Book a table</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">Choisissez une date, une heure et le nombre d'invités. Vous recevrez une confirmation dès que le restaurant accepte votre demande. · Pick a date, time and party size — the restaurant confirms shortly.</p>
      </div>
      <button onClick={onReserve} className="h-11 px-6 rounded-full text-black font-semibold text-sm inline-flex items-center gap-2"
              style={{ backgroundColor: GREEN }} data-testid="microsite-reservations-cta">
        <CalendarPlus size={14} /> Réserver maintenant · Book now
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
