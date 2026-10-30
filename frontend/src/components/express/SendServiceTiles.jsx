import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info, X } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";
import { useExpressBooking } from "../../contexts/ExpressContext";
import { SEND_TILE_ASSETS } from "../../lib/expressAssets";

/**
 * SENDbakēd — Phase A 6-tile service grid.
 *
 * ROW 1  ·  Moto        · CARGO           · Fresh Products
 * ROW 2  ·  Between Cities · Movers        · Multiple Shipments
 *
 * French label primary, English label secondary — enforced by design.
 * Motorcycle → deep-links straight into the existing bike booking flow.
 * Packers & Movers → existing `/send/movers` landing.
 * The four new services route to `/send/{key}` placeholder screens that
 * will be filled in by Phases C, D and E.
 */
const YELLOW = "#FCC44C";
const YELLOW_TINT = "#FCC44C22";

const SERVICES = [
  { key: "moto",           asset: SEND_TILE_ASSETS.moto },
  { key: "cargo",          asset: SEND_TILE_ASSETS.cargo },
  { key: "fresh",          asset: SEND_TILE_ASSETS.fresh },
  { key: "between_cities", asset: SEND_TILE_ASSETS.between_cities },
  { key: "movers",         asset: SEND_TILE_ASSETS.movers },
  { key: "multi",          asset: SEND_TILE_ASSETS.multi },
];

const TILE_META = {
  moto:           { titleKey: "send.tile.moto_title",           enKey: "send.tile.moto_title_en",           descKey: "send.tile.moto_desc" },
  cargo:          { titleKey: "send.tile.cargo_title",          enKey: "send.tile.cargo_title_en",          descKey: "send.tile.cargo_desc" },
  fresh:          { titleKey: "send.tile.fresh_title",          enKey: "send.tile.fresh_title_en",          descKey: "send.tile.fresh_desc" },
  between_cities: { titleKey: "send.tile.between_cities_title", enKey: "send.tile.between_cities_title_en", descKey: "send.tile.between_cities_desc" },
  movers:         { titleKey: "send.tile.movers_tile_title",    enKey: "send.tile.movers_tile_title_en",    descKey: "send.tile.movers_tile_desc" },
  multi:          { titleKey: "send.tile.multi_title",          enKey: "send.tile.multi_title_en",          descKey: "send.tile.multi_desc" },
};

// Compact 3-per-row tile: image + one-language short name + "i" (description sheet). Tapping the card books.
const SendTileCard = ({ tile, onClick, onInfo, layout }) => {
  const { t } = useTranslation("customer");
  const meta = TILE_META[tile.key] || {};
  const title = tile.title || t(meta.titleKey);
  const isDesktop = layout === "desktop";
  return (
    <div className="relative">
      <button
        data-testid={`send-tile-${tile.key}`}
        onClick={onClick}
        className="send-tile w-full rounded-2xl overflow-hidden text-left border border-border bg-card motion-fast active:scale-[0.98] transition-shadow hover:border-[#FCC44C55] flex flex-col"
      >
        <div
          className={`relative w-full flex items-center justify-center overflow-hidden ${isDesktop ? "h-32" : "aspect-[1.15]"}`}
          style={{ background: `radial-gradient(circle at 50% 45%, ${YELLOW}1F, transparent 70%)` }}
        >
          <img src={tile.asset} alt={title} loading="lazy" className="max-h-[84%] max-w-[88%] w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.4)]" />
        </div>
        <div className="min-h-[42px] px-1.5 py-2 flex items-center justify-center">
          <div data-testid={`send-tile-name-${tile.key}`} className="text-foreground font-semibold text-[0.75rem] sm:text-[0.85rem] leading-tight text-center line-clamp-2">{title}</div>
        </div>
      </button>
      <button
        data-testid={`send-tile-info-${tile.key}`}
        aria-label={t("send.service_info")}
        onClick={(e) => { e.stopPropagation(); onInfo(tile); }}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 border border-white/20 text-white"
      >
        <Info size={14} />
      </button>
    </div>
  );
};

const TileInfoSheet = ({ tile, onClose, onBook }) => {
  const { t } = useTranslation("customer");
  if (!tile) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose} data-testid="send-tile-info-backdrop">
      <div className="relative w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()} data-testid="send-tile-info-sheet">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground" data-testid="send-tile-info-close" aria-label="close"><X size={18} /></button>
        <div className="h-32 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${YELLOW}14` }}>
          <img src={tile.asset} alt="" className="max-h-28 w-auto object-contain" />
        </div>
        <div className="text-lg font-bold" data-testid="send-tile-info-title">{tile.title}</div>
        <p className="text-sm text-muted-foreground mt-1.5" data-testid="send-tile-info-desc">{tile.desc}</p>
        <button onClick={onBook} data-testid="send-tile-info-book" className="mt-5 w-full h-12 rounded-xl font-bold text-black flex items-center justify-center gap-2" style={{ backgroundColor: YELLOW }}>
          {t("send.book_service")} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

/**
 * Six-tile SEND service grid.
 *
 * Props:
 *   layout: "mobile" | "desktop"  — controls tile height + column count.
 */
export const SendServiceTiles = ({ layout = "mobile", section = null }) => {
  const { t, i18n } = useTranslation("customer");
  const fr = i18n.language !== "en";
  // CMS (send_service_tiles): ordered tiles with FR primary / EN secondary labels; falls back to the built-in six.
  const tiles = section
    ? (section.config?.tiles || []).filter((x) => x.enabled !== false && x.key).map((x) => ({
        key: x.key,
        asset: x.image || SEND_TILE_ASSETS[x.key],
        title: fr ? x.title_fr || x.title_en : x.title_en || x.title_fr,
        desc: fr ? x.desc_fr || x.desc_en : x.desc_en || x.desc_fr,
      }))
    : SERVICES;
  const heading = section ? (fr ? section.config?.title_fr || section.title : section.title || section.config?.title_fr) : t("send.services_heading");
  const subheading = section ? (fr ? section.config?.subtitle_fr || section.subtitle : section.subtitle || section.config?.subtitle_fr) : t("send.services_sub");
  const navigate = useNavigate();
  const { activeAddress } = useApp();
  const { setDraft } = useExpressBooking();

  const handleClick = useCallback((key) => {
    // Phase C — every SEND service tile funnels into the existing booking
    // experience. The tile only sets `service_type` on the draft; the
    // downstream vehicle-picker step filters eligible vehicles via
    // GET /api/express/vehicles?service_type=…, exactly as the current
    // wizard already renders vehicle cards + live prices. No extra picker
    // screens, no duplicate components.
    if (key === "movers") {
      // Movers has its own dedicated wizard — keep the existing UX.
      navigate("/send/movers");
      return;
    }
    if (key === "multi") {
      // Multi-Shipments has its own dedicated 2-step wizard (build-your-trip
      // → vehicle & reservation). No receiver/package/estimate detour.
      setDraft((d) => ({
        ...d,
        pickup: activeAddress || d.pickup,
        service_type: "multiple_shipments",
        vehicle_code: null,
        stops: [],
      }));
      navigate("/send/multi-shipments");
      return;
    }
    const SERVICE_TYPE_MAP = {
      moto:           "moto",
      cargo:          "cargo",
      fresh:          "fresh_products",
      between_cities: "between_cities",
      multi:          "multiple_shipments",
    };
    const service_type = SERVICE_TYPE_MAP[key] || null;
    setDraft((d) => ({
      ...d,
      pickup: activeAddress || d.pickup,
      service_type,
      vehicle_code: null,       // force the customer to pick from the filtered list
    }));
    navigate("/send/book/location");
  }, [activeAddress, navigate, setDraft]);

  const [info, setInfo] = useState(null);
  const gridClass = "grid grid-cols-3 gap-2.5 sm:gap-3";

  return (
    <section data-testid="send-services-grid" className={layout === "desktop" ? "" : "px-4 mt-5"}>
      <div className={`${layout === "desktop" ? "" : "mb-3"} flex items-end justify-between`}>
        <div>
          <h2 className="text-foreground font-bold tracking-tight text-xl sm:text-2xl leading-tight">{heading}</h2>
          <p className="text-muted-foreground text-[0.78rem] mt-1">{subheading}</p>
        </div>
      </div>
      <div className={`${gridClass} ${layout === "desktop" ? "mt-4" : ""}`}>
        {tiles.map((tile) => (
          <SendTileCard key={tile.key} tile={{ ...tile, title: tile.title, desc: tile.desc || t(TILE_META[tile.key]?.descKey) }} layout={layout}
                        onClick={() => handleClick(tile.key)} onInfo={setInfo} />
        ))}
      </div>
      <TileInfoSheet tile={info} onClose={() => setInfo(null)} onBook={() => { const k = info.key; setInfo(null); handleClick(k); }} />
    </section>
  );
};

export default SendServiceTiles;
