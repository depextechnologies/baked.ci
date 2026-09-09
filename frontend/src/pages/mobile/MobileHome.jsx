import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useApp } from "../../contexts/BakedContexts";
import { formatMoney, t } from "../../lib/i18n";
import { useLocalePath } from "../../i18n/routes";
import { MobileProductCard } from "../../components/mobile/MobileProductCard";
import { ArrowRight, Zap, Package, ShieldCheck, Percent } from "lucide-react";

export const MobileHome = () => {
  const { t: T } = useTranslation("customer");
  const nav = useNavigate();
  const path = useLocalePath();
  const { country, language, uiLocale } = useApp();
  const [cats, setCats] = useState([]);
  const [deals, setDeals] = useState([]);
  const [offers, setOffers] = useState([]);
  const locale = uiLocale;

  useEffect(() => {
    (async () => {
      try {
        const [c, p, o] = await Promise.all([
          api.get(`/mart/categories?country=${country.code}`),
          api.get(`/mart/products?country=${country.code}&limit=10`),
          api.get(`/mart/offers?country=${country.code}`).catch(() => ({ data: [] })),
        ]);
        setCats(c.data);
        setDeals(p.data);
        setOffers(o.data || []);
      } catch (e) { void e; }
    })();
  }, [country?.code]);

  const banner = "https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/mreak2b7_MARTbaked_Banner.png";

  return (
    <div className="pb-4">
      {/* Hero banner — replicates the mobile hero card */}
      <section className="px-4 pt-2">
        <button onClick={() => nav(path("products"))} data-testid="m-home-hero" className="relative w-full h-40 rounded-2xl overflow-hidden text-left active:scale-[0.99] motion-fast">
          <img src={banner} alt="MARTbakēd delivery" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
          <div className="relative z-10 h-full flex flex-col justify-center p-4 max-w-[70%]">
            <div className="text-lg font-bold leading-tight text-white">
              Everything you need,<br />
              <span style={{ color: "#77BC1F" }}>delivered in {country?.delivery_eta_min}</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold self-start px-3 py-1.5 rounded-full text-black" style={{ backgroundColor: "#77BC1F" }}>
              {t(locale, "hero.shop_now")} <ArrowRight size={13} />
            </div>
          </div>
        </button>
      </section>

      {/* Delivery stats strip */}
      <section className="px-4 mt-4">
        <div className="baked-card bg-card border border-border grid grid-cols-3 divide-x divide-border">
          <div className="px-3 py-3 text-center"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</div><div className="text-sm font-bold mt-0.5" style={{ color: "#77BC1F" }}>{country?.delivery_eta_min}</div></div>
          <div className="px-3 py-3 text-center"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Delivery</div><div className="text-sm font-bold mt-0.5">{formatMoney(country?.delivery_fee, country?.currency, country?.currency_symbol)}</div></div>
          <div className="px-3 py-3 text-center"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Free over</div><div className="text-sm font-bold mt-0.5">{formatMoney(country?.free_delivery_over, country?.currency, country?.currency_symbol)}</div></div>
        </div>
      </section>

      {/* Shop by category grid */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold">{t(locale, "sec.top_categories")}</div>
          <button data-testid="m-home-categories-viewall" onClick={() => nav("/categories")} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#77BC1F" }}>{T("home.shop_all")} <ArrowRight size={11} /></button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {cats.slice(0, 8).map((c) => {
            const displayName = language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);
            return (
              <button key={c.slug} data-testid={`m-home-cat-${c.slug}`} onClick={() => nav(`/categories/${c.slug}`)} className="flex flex-col items-center gap-1.5 text-center active:scale-95 motion-fast">
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-secondary/40">
                  {c.image && <img src={c.image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="text-[10px] font-semibold leading-tight line-clamp-2">{displayName}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Best offers scroll */}
      {offers.length > 0 && (
        <section className="mt-6">
          <div className="px-4 flex items-center justify-between mb-3">
            <div className="text-base font-bold flex items-center gap-1.5"><Percent size={16} style={{ color: "#77BC1F" }} /> Best offers</div>
            <button onClick={() => nav(`${path("products")}?sort=price_asc`)} className="text-xs font-semibold" style={{ color: "#77BC1F" }}>{T("home.shop_all")}</button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 no-scrollbar">
            {offers.slice(0, 6).map((o) => (
              <div key={o.id || o.code} className="shrink-0 w-64 baked-card overflow-hidden border" style={{ background: "linear-gradient(135deg, #77BC1F 0%, #5da116 100%)", borderColor: "#5da116" }}>
                <div className="p-3 text-black">
                  <div className="text-[10px] uppercase tracking-widest opacity-80">Limited offer</div>
                  <div className="text-lg font-bold leading-tight mt-1">{o.title || `${o.discount_pct || 20}% OFF`}</div>
                  <div className="text-[11px] mt-1 opacity-90">{o.subtitle || o.description || "On selected items"}</div>
                  {o.code && <div className="mt-2 inline-block bg-black/25 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">{o.code}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Best deals grid */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-bold">{t(locale, "sec.best_deals")}</div>
          <button data-testid="m-home-deals-viewall" onClick={() => nav(`${path("products")}?sort=price_asc`)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#77BC1F" }}>{T("home.shop_all")} <ArrowRight size={11} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {deals.slice(0, 8).map((p) => <MobileProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 mt-6">
        <div className="baked-card bg-card border border-border p-4 grid grid-cols-2 gap-3">
          {[
            { icon: Zap, title: t(locale, "features.fast"), sub: t(locale, "features.fast_sub") },
            { icon: Package, title: t(locale, "features.wide"), sub: t(locale, "features.wide_sub") },
            { icon: Percent, title: t(locale, "features.deals"), sub: t(locale, "features.deals_sub") },
            { icon: ShieldCheck, title: t(locale, "features.returns"), sub: t(locale, "features.returns_sub") },
          ].map((f, i) => { const Icon = f.icon; return (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}><Icon size={16} /></div>
              <div className="min-w-0"><div className="text-[12px] font-semibold leading-tight">{f.title}</div><div className="text-[10px] text-muted-foreground leading-tight">{f.sub}</div></div>
            </div>
          );})}
        </div>
      </section>
    </div>
  );
};
