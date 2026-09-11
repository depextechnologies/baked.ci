import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SEND_TILE_ASSETS } from "../../lib/expressAssets";

/**
 * Reusable SEND placeholder screen for services whose full flow lands in a
 * later phase (CARGO · Fresh Products · Between Cities · Multi-Stop).
 *
 * Props:
 *   serviceKey: matches TILE_META in SendServiceTiles.
 */
const YELLOW = "#FCC44C";

const META = {
  cargo:          { asset: SEND_TILE_ASSETS.cargo,          titleKey: "send.tile.cargo_title",          enKey: "send.tile.cargo_title_en",          descKey: "send.tile.cargo_desc" },
  fresh:          { asset: SEND_TILE_ASSETS.fresh,          titleKey: "send.tile.fresh_title",          enKey: "send.tile.fresh_title_en",          descKey: "send.tile.fresh_desc" },
  between_cities: { asset: SEND_TILE_ASSETS.between_cities, titleKey: "send.tile.between_cities_title", enKey: "send.tile.between_cities_title_en", descKey: "send.tile.between_cities_desc" },
  multi:          { asset: SEND_TILE_ASSETS.multi,          titleKey: "send.tile.multi_title",          enKey: "send.tile.multi_title_en",          descKey: "send.tile.multi_desc" },
};

export const SendComingSoon = ({ serviceKey }) => {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const meta = META[serviceKey] || META.cargo;

  return (
    <div data-testid={`send-coming-soon-${serviceKey}`} className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <button
          data-testid="send-coming-soon-back"
          onClick={() => navigate("/send")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/90 hover:text-foreground motion-fast"
        >
          <ArrowLeft size={16} color={YELLOW} strokeWidth={2.5} />
          {t("send.back_to_send")}
        </button>

        <div className="mt-6 rounded-3xl overflow-hidden border border-border bg-card">
          <div
            className="relative h-52 sm:h-64 flex items-center justify-center"
            style={{ background: `radial-gradient(circle at 50% 45%, ${YELLOW}22, transparent 70%)` }}
          >
            <img
              src={meta.asset}
              alt={t(meta.titleKey)}
              className="max-h-44 sm:max-h-52 w-auto object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.5)]"
            />
          </div>
          <div className="px-5 sm:px-8 py-6 sm:py-8">
            <div className="text-foreground text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{t(meta.titleKey)}</div>
            <div className="text-muted-foreground text-sm font-medium mt-1">{t(meta.enKey)}</div>
            <div className="text-muted-foreground text-[0.9rem] mt-3 leading-relaxed">{t(meta.descKey)}</div>

            <div className="mt-6 rounded-2xl border border-border bg-background/60 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${YELLOW}22` }}>
                <Sparkles size={16} color={YELLOW} />
              </div>
              <div>
                <div className="text-foreground text-sm font-semibold leading-tight">{t("send.coming_soon_title")}</div>
                <div className="text-muted-foreground text-[0.78rem] mt-0.5 leading-snug">{t("send.coming_soon_sub")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SendCargoPlaceholder    = () => <SendComingSoon serviceKey="cargo" />;
export const SendFreshPlaceholder    = () => <SendComingSoon serviceKey="fresh" />;
export const SendBetweenPlaceholder  = () => <SendComingSoon serviceKey="between_cities" />;
export const SendMultiStopPlaceholder = () => <SendComingSoon serviceKey="multi" />;

export default SendComingSoon;
