import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
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

const SendTileCard = ({ tile, onClick, layout }) => {
  const { t } = useTranslation("customer");
  const meta = TILE_META[tile.key];
  const isDesktop = layout === "desktop";
  return (
    <button
      data-testid={`send-tile-${tile.key}`}
      onClick={onClick}
      className={`send-tile group relative rounded-2xl overflow-hidden text-left border border-border bg-card motion-fast active:scale-[0.985] transition-shadow hover:shadow-[0_18px_40px_rgba(0,0,0,0.35)] hover:border-[#FCC44C55] flex flex-col ${isDesktop ? "min-h-[248px]" : "min-h-[212px]"}`}
    >
      <div
        className={`relative w-full flex items-center justify-center overflow-hidden ${isDesktop ? "h-40" : "h-32"}`}
        style={{ background: `radial-gradient(circle at 50% 45%, ${YELLOW}1F, transparent 68%)` }}
      >
        <img
          src={tile.asset}
          alt={t(meta.titleKey)}
          loading="lazy"
          className={`w-auto object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.45)] ${isDesktop ? "max-h-36" : "max-h-28"}`}
        />
      </div>
      <div className="flex-1 px-3 sm:px-4 pt-3 pb-3 flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-foreground font-semibold text-[0.95rem] leading-tight line-clamp-2">{t(meta.titleKey)}</div>
          <div className="text-muted-foreground text-[0.72rem] font-medium mt-0.5 truncate">{t(meta.enKey)}</div>
          <div className="text-muted-foreground text-[0.7rem] font-normal mt-1.5 line-clamp-2 leading-snug">{t(meta.descKey)}</div>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-md"
          style={{ backgroundColor: YELLOW }}
          aria-hidden="true"
        >
          <ArrowRight size={15} color="#0a0a0a" strokeWidth={2.6} />
        </div>
      </div>
    </button>
  );
};

/**
 * Six-tile SEND service grid.
 *
 * Props:
 *   layout: "mobile" | "desktop"  — controls tile height + column count.
 */
export const SendServiceTiles = ({ layout = "mobile" }) => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const { activeAddress } = useApp();
  const { setDraft } = useExpressBooking();

  const handleClick = useCallback((key) => {
    if (key === "moto") {
      // Reuse the existing Send-by-Bike wizard — pre-select motorcycle.
      setDraft((d) => ({
        ...d,
        pickup: activeAddress || d.pickup,
        vehicle_code: "bike",
      }));
      navigate("/send/book/location");
      return;
    }
    if (key === "movers") {
      navigate("/send/movers");
      return;
    }
    if (key === "cargo") {
      navigate("/send/cargo");
      return;
    }
    if (key === "fresh") {
      navigate("/send/fresh");
      return;
    }
    if (key === "between_cities") {
      navigate("/send/between-cities");
      return;
    }
    if (key === "multi") {
      navigate("/send/multi-stop");
      return;
    }
  }, [activeAddress, navigate, setDraft]);

  const gridClass = layout === "desktop"
    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    : "grid grid-cols-2 gap-3";

  return (
    <section data-testid="send-services-grid" className={layout === "desktop" ? "" : "px-4 mt-5"}>
      <div className={`${layout === "desktop" ? "" : "mb-3"} flex items-end justify-between`}>
        <div>
          <h2 className="text-foreground font-bold tracking-tight text-xl sm:text-2xl leading-tight">{t("send.services_heading")}</h2>
          <p className="text-muted-foreground text-[0.78rem] mt-1">{t("send.services_sub")}</p>
        </div>
      </div>
      <div className={`${gridClass} ${layout === "desktop" ? "mt-4" : ""}`}>
        {SERVICES.map((tile) => (
          <SendTileCard key={tile.key} tile={tile} layout={layout} onClick={() => handleClick(tile.key)} />
        ))}
      </div>
    </section>
  );
};

export default SendServiceTiles;
